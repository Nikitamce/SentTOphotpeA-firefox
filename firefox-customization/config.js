// Firefox Autoconfig Loader
try {
  let { Classes: Cc, interfaces: Ci, manager: Cm } = Components;
  let Services;
  
  if (typeof ChromeUtils !== "undefined") {
    try {
      Services = ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs").Services;
    } catch(e) {
      try {
        Services = ChromeUtils.import("resource://gre/modules/Services.jsm").Services;
      } catch(e2) {
        Services = globalThis.Services;
      }
    }
  } else {
    Services = Components.utils.import("resource://gre/modules/Services.jsm").Services;
  }

  const scriptLoader = Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader);

  function loadScriptsInWindow(win) {
    try {
      let profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile);
      let chromeDir = profileDir.clone();
      chromeDir.append("chrome");
      
      if (chromeDir.exists() && chromeDir.isDirectory()) {
        let files = chromeDir.directoryEntries;
        while (files.hasMoreElements()) {
          let file = files.getNext().QueryInterface(Ci.nsIFile);
          if (file.isFile() && file.leafName.endsWith(".uc.js")) {
            let fileURL = Services.io.newFileURI(file).spec;
            try {
              // Load script inside the browser window context
              scriptLoader.loadSubScript(fileURL, win);
              Services.console.logStringMessage("[UserChromeJS] Loaded: " + file.leafName);
            } catch(err) {
              Services.console.logStringMessage("[UserChromeJS] Error loading " + file.leafName + ": " + err);
            }
          }
        }
      }
    } catch (e) {
      Services.console.logStringMessage("[UserChromeJS] Error accessing profile directory: " + e);
    }
  }

  // Watch for new window global creation
  let observer = {
    observe: function(subject, topic, data) {
      if (topic === "chrome-document-global-created") {
        let win = subject;
        win.addEventListener("DOMContentLoaded", function onDOM() {
          win.removeEventListener("DOMContentLoaded", onDOM);
          let href = win.location.href;
          if (href === "chrome://browser/content/browser.xhtml" || href === "chrome://browser/content/browser.xul") {
            loadScriptsInWindow(win);
          }
        }, { once: true });
      }
    }
  };

  // Register observer
  Services.obs.addObserver(observer, "chrome-document-global-created", false);

  // Load in already open browser windows
  let enumerator = Services.wm.getEnumerator("navigator:browser");
  while (enumerator.hasMoreElements()) {
    let win = enumerator.getNext();
    if (win.document.readyState === "complete" || win.document.readyState === "interactive") {
      loadScriptsInWindow(win);
    } else {
      win.addEventListener("DOMContentLoaded", function onDOM() {
        win.removeEventListener("DOMContentLoaded", onDOM);
        loadScriptsInWindow(win);
      }, { once: true });
    }
  }

} catch (e) {
  if (typeof Cu !== 'undefined') {
    Cu.reportError("Error in config.js: " + e);
  } else {
    console.error("Error in config.js: ", e);
  }
}

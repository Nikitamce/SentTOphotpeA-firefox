// ============================================================
// Send to Photopea — Background Script
// Context menus, image extraction, Photopea open (hash / bridge)
// ============================================================

// shared/defaults.js + shared/photopea-url.js loaded via manifest background.scripts

var lastImageContext = { srcUrl: null, tabId: null, pageUrl: null };

// ------ Storage helpers ------

function getPresets() {
  return browser.storage.local.get("presets").then(function (data) {
    return stpNormalizePresets(data.presets);
  });
}

function getSettings() {
  return browser.storage.local.get("settings").then(function (data) {
    return stpNormalizeSettings(data.settings);
  });
}

function getRecent() {
  return browser.storage.local.get("recent").then(function (data) {
    return Array.isArray(data.recent) ? data.recent : [];
  });
}

function pushRecent(entry) {
  return getRecent().then(function (list) {
    var next = [{ srcUrl: entry.srcUrl, pageUrl: entry.pageUrl || "", ts: Date.now() }]
      .concat(list.filter(function (r) { return r.srcUrl !== entry.srcUrl; }))
      .slice(0, STP.MAX_RECENT);
    return browser.storage.local.set({ recent: next });
  });
}

// ------ Notifications / errors ------

function notifyError(message) {
  getSettings().then(function (settings) {
    if (!settings.notifyOnError) return;
    try {
      browser.notifications.create({
        type: "basic",
        iconUrl: browser.runtime.getURL("icons/icon.svg"),
        title: browser.i18n.getMessage("extensionName") || "Send to Photopea",
        message: message
      });
    } catch (e) {
      console.warn("Notification failed:", e);
    }
  });
}

// ------ Image extraction ------

function fetchDataUrlInBackground(imageUrl) {
  return fetch(imageUrl)
    .then(function (response) {
      if (!response.ok) throw new Error("Fetch failed: " + response.status);
      return response.blob();
    })
    .then(function (blob) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onloadend = function () { resolve(reader.result); };
        reader.onerror = function () { reject(reader.error); };
        reader.readAsDataURL(blob);
      });
    });
}

function ensureExtractScript(tabId) {
  return browser.tabs.executeScript(tabId, { file: "content/extract-image.js" })
    .catch(function () { /* already injected or restricted page */ });
}

function extractViaContentScript(tabId, imageUrl) {
  return ensureExtractScript(tabId).then(function () {
    return browser.tabs.sendMessage(tabId, { type: "stp-extract", url: imageUrl });
  }).then(function (res) {
    if (res && res.ok && res.dataUrl) return res.dataUrl;
    throw new Error("content extract failed");
  });
}

function getOrFetchDataUrl(imageUrl, tabId) {
  if (!imageUrl) return Promise.reject(new Error("no image url"));
  if (imageUrl.indexOf("data:") === 0 || imageUrl.indexOf("blob:") === 0) {
    return Promise.resolve(imageUrl);
  }

  return fetchDataUrlInBackground(imageUrl)
    .catch(function (err) {
      console.warn("Background fetch failed:", err);
      if (tabId == null) throw err;
      return extractViaContentScript(tabId, imageUrl);
    });
}

// ------ Open Photopea ------

function waitTabComplete(tabId, timeoutMs) {
  timeoutMs = timeoutMs || 30000;
  return new Promise(function (resolve, reject) {
    var done = false;
    function finish(ok, val) {
      if (done) return;
      done = true;
      browser.tabs.onUpdated.removeListener(onUpdated);
      if (ok) resolve(val);
      else reject(val || new Error("tab timeout"));
    }
    function onUpdated(id, info) {
      if (id === tabId && info.status === "complete") finish(true);
    }
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.get(tabId).then(function (tab) {
      if (tab.status === "complete") finish(true);
    }).catch(function () { /* ignore */ });
    setTimeout(function () { finish(true); }, timeoutMs);
  });
}

function openTab(url, openIn) {
  if (openIn === "current") {
    return browser.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
      if (tabs[0]) return browser.tabs.update(tabs[0].id, { url: url });
      return browser.tabs.create({ url: url });
    });
  }
  return browser.tabs.create({ url: url });
}

function ensurePhotopeaBridge(tabId) {
  return browser.tabs.executeScript(tabId, { file: "content/photopea-bridge.js" })
    .catch(function () { /* may already be registered via content_scripts */ });
}

function openViaBridge(payload, openIn) {
  return openTab(STP.PHOTOPEA_ORIGIN, openIn).then(function (tab) {
    return waitTabComplete(tab.id).then(function () {
      return ensurePhotopeaBridge(tab.id).then(function () {
        // small delay so Photopea JS boots
        return new Promise(function (r) { setTimeout(r, 600); }).then(function () {
          return browser.tabs.sendMessage(tab.id, {
            type: "stp-photopea-run",
            payload: payload
          });
        });
      });
    });
  });
}

function shouldUseHash(dataUrl) {
  if (!dataUrl) return false;
  if (dataUrl.indexOf("blob:") === 0) return false;
  return dataUrl.length < STP.MAX_HASH_DATA_URL_LENGTH;
}

/**
 * payload:
 *  mode: open | canvas | blank
 *  dataUrl?, width?, height?, dpi?, fill?, fitMode?
 */
function openInPhotopea(payload) {
  return getSettings().then(function (settings) {
    var fill = payload.fill || settings.canvasFill;
    var fitMode = payload.fitMode || settings.fitMode;
    var dpi = payload.dpi || settings.defaultDpi;
    var openIn = settings.openIn;
    var merged = Object.assign({}, payload, { fill: fill, fitMode: fitMode, dpi: dpi });

    if (merged.mode === "blank") {
      var blankUrl = stpBuildBlankUrl(merged.width, merged.height, {
        dpi: dpi,
        fill: fill
      });
      return openTab(blankUrl, openIn);
    }

    if (merged.dataUrl && shouldUseHash(merged.dataUrl)) {
      var url = merged.mode === "open"
        ? stpBuildOpenUrl(merged.dataUrl)
        : stpBuildCanvasUrl(merged.dataUrl, merged.width, merged.height, {
            dpi: dpi,
            fill: fill,
            fitMode: fitMode
          });
      // Guard against absurd encoded lengths
      if (url.length < 1.8e6) {
        return openTab(url, openIn);
      }
    }

    // Large images / blob: use bridge
    return openViaBridge(merged, openIn);
  });
}

// ------ Context menus ------

function createContextMenus() {
  return browser.contextMenus.removeAll().then(function () {
    browser.contextMenus.create({
      id: "photopea-parent",
      title: browser.i18n.getMessage("menuParent") || "🎨 Photopea",
      contexts: ["image", "video"]
    });

    browser.contextMenus.create({
      id: "photopea-open",
      parentId: "photopea-parent",
      title: browser.i18n.getMessage("menuOpen") || "📷 Open image",
      contexts: ["image", "video"]
    });

    browser.contextMenus.create({
      id: "photopea-sep",
      parentId: "photopea-parent",
      type: "separator",
      contexts: ["image", "video"]
    });

    return getPresets().then(function (presets) {
      presets.forEach(function (preset) {
        if (!preset.enabled) return;
        var menuTitle = browser.i18n.getMessage("menuPreset", [
          preset.icon || "🖼",
          preset.name,
          String(preset.width),
          String(preset.height)
        ]) || ((preset.icon || "🖼") + " " + preset.name + " (" + preset.width + "×" + preset.height + ")");

        browser.contextMenus.create({
          id: "photopea-preset-" + preset.id,
          parentId: "photopea-parent",
          title: menuTitle,
          contexts: ["image", "video"]
        });
      });
    });
  });
}

function resolveImageUrl(info) {
  // video poster or image src
  if (info.mediaType === "video" && info.srcUrl) {
    // Firefox may give video URL; prefer poster if available (not always in info)
    return info.srcUrl;
  }
  return info.srcUrl || null;
}

function handleImageAction(menuItemId, imageUrl, tab) {
  var tabId = tab && tab.id;
  var pageUrl = tab && tab.url;

  lastImageContext = { srcUrl: imageUrl, tabId: tabId, pageUrl: pageUrl };
  pushRecent({ srcUrl: imageUrl, pageUrl: pageUrl });

  return getOrFetchDataUrl(imageUrl, tabId)
    .then(function (dataUrl) {
      if (menuItemId === "photopea-open" || menuItemId === "command-open") {
        return openInPhotopea({ mode: "open", dataUrl: dataUrl });
      }

      if (String(menuItemId).indexOf("photopea-preset-") === 0) {
        var presetId = String(menuItemId).replace("photopea-preset-", "");
        return getPresets().then(function (presets) {
          var preset = presets.find(function (p) { return p.id === presetId; });
          if (!preset) throw new Error("preset not found");
          return openInPhotopea({
            mode: "canvas",
            dataUrl: dataUrl,
            width: preset.width,
            height: preset.height,
            dpi: preset.dpi
          });
        });
      }
    })
    .catch(function (err) {
      console.error("Image action failed:", err);
      var msg = browser.i18n.getMessage("alertManualCopy") ||
        "Could not extract the image. Copy it manually and paste into Photopea (Ctrl+V).";
      notifyError(msg);

      // Fallback: open blank Photopea / canvas ready for paste
      if (menuItemId === "photopea-open" || menuItemId === "command-open") {
        return openTab(STP.PHOTOPEA_ORIGIN, "newTab");
      }
      if (String(menuItemId).indexOf("photopea-preset-") === 0) {
        var pid = String(menuItemId).replace("photopea-preset-", "");
        return getPresets().then(function (presets) {
          var preset = presets.find(function (p) { return p.id === pid; });
          if (!preset) return;
          return openInPhotopea({
            mode: "blank",
            width: preset.width,
            height: preset.height,
            dpi: preset.dpi
          });
        });
      }
    });
}

// ------ Events ------

browser.contextMenus.onClicked.addListener(function (info, tab) {
  var imageUrl = resolveImageUrl(info);
  if (!imageUrl) return;
  // Prefer poster for video if src is media stream-ish — still try
  handleImageAction(info.menuItemId, imageUrl, tab);
});

if (browser.contextMenus.onShown) {
  browser.contextMenus.onShown.addListener(function (info, tab) {
    if (info.srcUrl) {
      lastImageContext = {
        srcUrl: info.srcUrl,
        tabId: tab && tab.id,
        pageUrl: tab && tab.url
      };
    }
  });
}

browser.runtime.onInstalled.addListener(function () {
  browser.storage.local.get(["presets", "settings"]).then(function (data) {
    var updates = {};
    if (!data.presets) updates.presets = stpCloneDefaultPresets();
    else updates.presets = stpNormalizePresets(data.presets);
    if (!data.settings) updates.settings = stpCloneDefaultSettings();
    else updates.settings = stpNormalizeSettings(data.settings);
    return browser.storage.local.set(updates);
  }).then(createContextMenus);
});

createContextMenus();

browser.storage.onChanged.addListener(function (changes, area) {
  if (area === "local" && (changes.presets || changes.settings)) {
    createContextMenus();
  }
});

// Keyboard command: open last known image
browser.commands.onCommand.addListener(function (command) {
  if (command !== "open-in-photopea") return;

  var src = lastImageContext.srcUrl;
  var tabId = lastImageContext.tabId;

  if (!src) {
    // Try active tab: no specific image — open Photopea home
    notifyError(browser.i18n.getMessage("notifyNoImage") ||
      "No image yet. Right‑click an image first, then use the shortcut.");
    openTab(STP.PHOTOPEA_ORIGIN, "newTab");
    return;
  }

  browser.tabs.get(tabId).then(function (tab) {
    handleImageAction("command-open", src, tab);
  }).catch(function () {
    handleImageAction("command-open", src, { id: tabId, url: lastImageContext.pageUrl });
  });
});

// Messages from popup / options
browser.runtime.onMessage.addListener(function (msg) {
  if (!msg || !msg.type) return;

  if (msg.type === "stp-open-blank-preset") {
    return openInPhotopea({
      mode: "blank",
      width: msg.width,
      height: msg.height,
      dpi: msg.dpi
    });
  }

  if (msg.type === "stp-open-recent") {
    var tabId = lastImageContext.tabId;
    return browser.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
      var tab = tabs[0] || { id: tabId };
      return handleImageAction("photopea-open", msg.srcUrl, tab);
    });
  }

  if (msg.type === "stp-get-version") {
    return Promise.resolve({ version: STP.VERSION });
  }
});

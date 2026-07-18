// ============================================================
// Send to Photopea — Background Script (v1.1.3)
// Reliable path: get image bytes → open Photopea via URL hash
// No content-script bridge required for the main flow.
// ============================================================

// shared: defaults.js, photopea-url.js, image-fetch.js via manifest

var lastImageContext = { srcUrl: null, tabId: null, pageUrl: null };

if (typeof stpInstallWebRequestHelpers === "function") {
  try { stpInstallWebRequestHelpers(); } catch (e) { /* ignore */ }
}

// ------ Storage ------

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

function isRestrictedPageUrl(url) {
  if (!url) return false;
  try {
    var host = new URL(url).hostname;
    return [
      "addons.mozilla.org",
      "addons.cdn.mozilla.org",
      "discovery.addons.mozilla.org",
      "accounts.firefox.com"
    ].some(function (h) {
      return host === h || host.endsWith("." + h);
    });
  } catch (e) {
    return /addons\.mozilla\.org/i.test(String(url));
  }
}

function delay(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

// ------ Tab helpers ------

function waitTabComplete(tabId, timeoutMs) {
  timeoutMs = timeoutMs || 30000;
  return new Promise(function (resolve) {
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      try { browser.tabs.onUpdated.removeListener(onUpdated); } catch (e) { /* ignore */ }
      resolve();
    }
    function onUpdated(id, info) {
      if (id === tabId && info.status === "complete") finish();
    }
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.get(tabId).then(function (tab) {
      if (tab && tab.status === "complete") finish();
    }).catch(function () { /* ignore */ });
    setTimeout(finish, timeoutMs);
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

// ------ Image acquisition ------

/**
 * Open image URL in a background tab and screenshot it.
 * Works when CORS blocks fetch (addons.mozilla.org etc.).
 * (No "windows" permission — not valid on all Firefox builds.)
 */
function fetchViaTabCapture(imageUrl) {
  var createdTabId = null;

  return browser.tabs.create({
    url: imageUrl,
    active: false
  }).then(function (tab) {
    createdTabId = tab.id;
    return waitTabComplete(tab.id, 20000).then(function () {
      return delay(500);
    }).then(function () {
      if (browser.tabs.captureTab) {
        return browser.tabs.captureTab(tab.id, { format: "png" });
      }
      // Fallback: briefly activate tab for captureVisibleTab
      return browser.tabs.update(tab.id, { active: true }).then(function () {
        return delay(200);
      }).then(function () {
        return browser.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      });
    }).then(function (dataUrl) {
      return stpAutoCropDataUrl(dataUrl).catch(function () { return dataUrl; });
    });
  }).then(function (dataUrl) {
    return cleanupCapture(createdTabId).then(function () {
      if (!dataUrl || dataUrl.length < 100) throw new Error("empty capture");
      return dataUrl;
    });
  }).catch(function (err) {
    return cleanupCapture(createdTabId).then(function () { throw err; });
  });
}

function cleanupCapture(tabId) {
  if (tabId == null) return Promise.resolve();
  return browser.tabs.remove(tabId).catch(function () { /* ignore */ });
}

/**
 * Crop uniform letterboxing from a tab screenshot (image viewer margins).
 */
function stpAutoCropDataUrl(dataUrl) {
  return new Promise(function (resolve, reject) {
    try {
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width;
          var h = img.naturalHeight || img.height;
          if (!w || !h) {
            resolve(dataUrl);
            return;
          }
          var canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          var imageData = ctx.getImageData(0, 0, w, h);
          var d = imageData.data;

          function idx(x, y) {
            return (y * w + x) * 4;
          }
          function same(x, y, r0, g0, b0, tol) {
            var i = idx(x, y);
            return (
              Math.abs(d[i] - r0) <= tol &&
              Math.abs(d[i + 1] - g0) <= tol &&
              Math.abs(d[i + 2] - b0) <= tol
            );
          }

          // Background color from corners (median-ish average)
          var corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
          var r0 = 0, g0 = 0, b0 = 0;
          corners.forEach(function (c) {
            var i = idx(c[0], c[1]);
            r0 += d[i]; g0 += d[i + 1]; b0 += d[i + 2];
          });
          r0 = (r0 / 4) | 0;
          g0 = (g0 / 4) | 0;
          b0 = (b0 / 4) | 0;
          var tol = 18;

          var minX = w, minY = h, maxX = 0, maxY = 0;
          var step = Math.max(1, Math.floor(Math.min(w, h) / 400));
          for (var y = 0; y < h; y += step) {
            for (var x = 0; x < w; x += step) {
              if (!same(x, y, r0, g0, b0, tol)) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
              }
            }
          }

          // Expand a bit and clamp
          minX = Math.max(0, minX - step);
          minY = Math.max(0, minY - step);
          maxX = Math.min(w - 1, maxX + step);
          maxY = Math.min(h - 1, maxY + step);

          var cw = maxX - minX + 1;
          var ch = maxY - minY + 1;
          // If crop failed / almost full frame, keep original
          if (cw < 4 || ch < 4 || (cw * ch) > (w * h * 0.98)) {
            resolve(dataUrl);
            return;
          }

          var out = document.createElement("canvas");
          out.width = cw;
          out.height = ch;
          out.getContext("2d").drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
          resolve(out.toDataURL("image/png"));
        } catch (e) {
          resolve(dataUrl);
        }
      };
      img.onerror = function () { reject(new Error("crop image load failed")); };
      img.src = dataUrl;
    } catch (e) {
      reject(e);
    }
  });
}

function extractViaContentScript(tabId, imageUrl) {
  return browser.tabs.executeScript(tabId, { file: "content/extract-image.js" })
    .catch(function () { /* ignore */ })
    .then(function () {
      return browser.tabs.sendMessage(tabId, { type: "stp-extract", url: imageUrl });
    })
    .then(function (res) {
      if (res && res.ok && res.dataUrl) return res.dataUrl;
      throw new Error("content extract failed");
    });
}

function isAmoAssetUrl(url) {
  try {
    var h = new URL(url).hostname;
    return h === "addons.mozilla.org" || h.endsWith(".addons.mozilla.org") ||
      h === "addons.cdn.mozilla.net" || h.indexOf("addons.cdn.mozilla") !== -1;
  } catch (e) {
    return /addons\.mozilla\./i.test(String(url));
  }
}

/**
 * Get a data URL for the image.
 * AMO / no-CORS hosts: tab capture first (fetch is blocked by CORS).
 * Other hosts: fetch first, then capture, then content script.
 */
function getOrFetchDataUrl(imageUrl, tabId, pageUrl) {
  if (!imageUrl) return Promise.reject(new Error("no image url"));
  if (imageUrl.indexOf("data:") === 0) return Promise.resolve(imageUrl);

  if (imageUrl.indexOf("blob:") === 0) {
    if (tabId == null || isRestrictedPageUrl(pageUrl)) {
      return Promise.reject(new Error("blob URL not readable"));
    }
    return extractViaContentScript(tabId, imageUrl);
  }

  var errors = [];
  var preferCapture = isAmoAssetUrl(imageUrl) || isRestrictedPageUrl(pageUrl);

  function tryFetch() {
    if (typeof stpFetchImageDataUrl !== "function") {
      return Promise.reject(new Error("fetch helper missing"));
    }
    return stpFetchImageDataUrl(imageUrl);
  }

  function tryCapture() {
    var candidates = typeof stpImageUrlCandidates === "function"
      ? stpImageUrlCandidates(imageUrl)
      : [imageUrl];
    // For capture, original URL first (already displayed by browser once)
    var i = 0;
    function next() {
      if (i >= candidates.length) {
        return Promise.reject(new Error("tab capture failed all candidates"));
      }
      var url = candidates[i++];
      console.log("STP: tab-capture try", url);
      return fetchViaTabCapture(url).catch(function (err) {
        errors.push("capture:" + (err && err.message ? err.message : err));
        return next();
      });
    }
    return next();
  }

  function tryContent() {
    if (tabId == null || isRestrictedPageUrl(pageUrl)) {
      return Promise.reject(new Error("content script unavailable"));
    }
    return extractViaContentScript(tabId, imageUrl);
  }

  var chain;
  if (preferCapture) {
    // Skip noisy CORS fetch on AMO — go straight to screenshot
    chain = tryCapture()
      .catch(function (err) {
        console.warn("STP capture failed, trying fetch…", err);
        return tryFetch();
      })
      .catch(function (err) {
        errors.push("fetch:" + (err && err.message ? err.message : err));
        return tryContent();
      });
  } else {
    chain = tryFetch()
      .catch(function (err) {
        errors.push("fetch:" + (err && err.message ? err.message : err));
        console.warn("STP fetch failed, trying tab capture…", err);
        return tryCapture();
      })
      .catch(function (err) {
        errors.push(String(err && err.message ? err.message : err));
        console.warn("STP capture failed, trying content script…", err);
        return tryContent();
      });
  }

  return chain.catch(function (err) {
    errors.push("final:" + (err && err.message ? err.message : err));
    throw new Error("All image methods failed: " + errors.join(" | "));
  });
}

// ------ Open Photopea ------

function ensurePhotopeaBridge(tabId) {
  return browser.tabs.executeScript(tabId, { file: "content/photopea-bridge.js" })
    .catch(function () { /* may already be present via content_scripts */ });
}

/**
 * Send OE script to Photopea tab via content-script message (preferred),
 * with executeScript+postMessage fallback.
 */
function runPhotopeaScriptInTab(tabId, script, timeoutMs, attempt) {
  timeoutMs = timeoutMs || 25000;
  attempt = attempt || 0;

  return ensurePhotopeaBridge(tabId).then(function () {
    return browser.tabs.sendMessage(tabId, {
      type: "stp-run-script",
      script: script,
      timeoutMs: timeoutMs
    });
  }).then(function (res) {
    return !!(res && res.ok !== false);
  }).catch(function (err) {
    if (attempt < 10) {
      return delay(400).then(function () {
        return runPhotopeaScriptInTab(tabId, script, timeoutMs, attempt + 1);
      });
    }
    // Last resort: inject inline runner
    console.warn("STP: sendMessage failed, try executeScript", err);
    var injected =
      "(function(){" +
      "  var script = " + JSON.stringify(script) + ";" +
      "  return new Promise(function(resolve){" +
      "    var done=false;" +
      "    function finish(){ if(done)return; done=true;" +
      "      window.removeEventListener('message',onMsg); resolve(true); }" +
      "    function onMsg(e){ if(e.data==='done') finish(); }" +
      "    window.addEventListener('message', onMsg);" +
      "    try { window.postMessage(script,'*'); } catch(e) { resolve(false); return; }" +
      "    setTimeout(finish, " + timeoutMs + ");" +
      "  });" +
      "})();";
    return browser.tabs.executeScript(tabId, { code: injected }).then(function (results) {
      return !!(results && results[0]);
    }).catch(function () {
      return false;
    });
  });
}

/**
 * Canvas: open image via hash, then force target size with resizeCanvas script.
 * Also uses one-shot hash (files+script) when URI is small enough.
 */
function openImageThenPlaceOnCanvas(dataUrl, width, height, options, openIn) {
  var placeScript = stpBuildCanvasPlaceScript(width, height, options);
  var backupScript = typeof stpBuildCanvasCopyPasteScript === "function"
    ? stpBuildCanvasCopyPasteScript(width, height, options)
    : placeScript;

  // One-shot: Photopea loads file then runs resizeCanvas — primary path
  var oneShotUrl = stpBuildCanvasUrl(dataUrl, width, height, options);
  var useOneShot = oneShotUrl.length < 1.8e6;

  var openUrl = useOneShot ? oneShotUrl : stpBuildOpenUrl(dataUrl);
  if (openUrl.length > 1.8e6) {
    notifyError(
      browser.i18n.getMessage("alertImageTooLargeCanvas") ||
      "Image too large — opened as-is."
    );
    return openTab(stpBuildOpenUrl(dataUrl), openIn);
  }

  console.log("STP: canvas open", {
    width: width,
    height: height,
    fitMode: options && options.fitMode,
    oneShot: useOneShot,
    urlLen: openUrl.length
  });

  // Photopea official: app.UI.fitTheArea() — call repeatedly after layout settles
  var fitOnlyScript =
    "try { app.UI.fitTheArea(); } catch (e0) {}" +
    "try { app.UI.fitTheArea(); } catch (e1) {}";

  var centerOnlyScript = [
    typeof stpNumHelperJs === "function" ? stpNumHelperJs() : "",
    typeof stpGetLayerHelperJs === "function" ? stpGetLayerHelperJs() : "",
    typeof stpCenterLayerScript === "function" ? stpCenterLayerScript() : "",
    typeof stpCenterLayerScript === "function" ? stpCenterLayerScript() : "",
    fitOnlyScript
  ].filter(Boolean).join("\n");

  function reinforceCenterAndFit(tabId) {
    return runPhotopeaScriptInTab(tabId, centerOnlyScript, 12000).then(function () {
      return delay(400);
    }).then(function () {
      return runPhotopeaScriptInTab(tabId, fitOnlyScript, 8000);
    }).then(function () {
      return delay(300);
    }).then(function () {
      // Third fit — UI chrome finishes animating
      return runPhotopeaScriptInTab(tabId, fitOnlyScript, 5000);
    });
  }

  return openTab(openUrl, openIn).then(function (tab) {
    return waitTabComplete(tab.id, 45000).then(function () {
      return delay(useOneShot ? 2400 : 2000);
    }).then(function () {
      console.log("STP: reinforce place script", width, "x", height);
      return runPhotopeaScriptInTab(tab.id, placeScript, 25000);
    }).then(function (ok) {
      console.log("STP: place script ok =", ok);
      if (!ok) {
        console.log("STP: trying copy/paste canvas script");
        return delay(400).then(function () {
          return runPhotopeaScriptInTab(tab.id, backupScript, 25000);
        }).then(function (ok2) {
          console.log("STP: copy/paste script ok =", ok2);
          if (!ok2) {
            notifyError(
              browser.i18n.getMessage("alertCanvasPlaceFailed") ||
              "Image opened, but canvas size could not be applied automatically."
            );
          }
        });
      }
    }).then(function () {
      // Always re-center + fitTheArea (main fix for corner + zoom)
      return reinforceCenterAndFit(tab.id);
    }).then(function () {
      return tab;
    }).catch(function (err) {
      console.error("STP: canvas flow error", err);
      notifyError(
        browser.i18n.getMessage("alertCanvasPlaceFailed") ||
        "Could not apply canvas size. Image should still be open."
      );
      return tab;
    });
  });
}

function openInPhotopea(payload) {
  return getSettings().then(function (settings) {
    var fill = payload.fill || settings.canvasFill;
    var fitMode = payload.fitMode || settings.fitMode;
    var dpi = payload.dpi || settings.defaultDpi || 72;
    var openIn = settings.openIn;
    var dataUrl = payload.dataUrl;
    var opts = { dpi: dpi, fill: fill, fitMode: fitMode };

    if (payload.mode === "blank") {
      return openTab(stpBuildBlankUrl(payload.width, payload.height, opts), openIn);
    }

    if (!dataUrl) {
      return openTab(STP.PHOTOPEA_ORIGIN, openIn);
    }

    if (payload.mode === "open") {
      var openUrl = stpBuildOpenUrl(dataUrl);
      if (openUrl.length > 1.8e6) {
        notifyError(
          browser.i18n.getMessage("alertManualCopy") ||
          "Image is too large for the URL method. Copy Image → paste in Photopea."
        );
        return openTab(STP.PHOTOPEA_ORIGIN, openIn);
      }
      return openTab(openUrl, openIn);
    }

    if (payload.mode === "canvas") {
      return openImageThenPlaceOnCanvas(
        dataUrl,
        payload.width,
        payload.height,
        opts,
        openIn
      );
    }

    return openTab(STP.PHOTOPEA_ORIGIN, openIn);
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

function handleImageAction(menuItemId, imageUrl, tab) {
  var tabId = tab && tab.id;
  var pageUrl = tab && tab.url;

  lastImageContext = { srcUrl: imageUrl, tabId: tabId, pageUrl: pageUrl };
  pushRecent({ srcUrl: imageUrl, pageUrl: pageUrl });

  if (typeof stpUnlockRemoteForPhotopea === "function") {
    try { stpUnlockRemoteForPhotopea(imageUrl, 120000); } catch (e) { /* ignore */ }
  }

  return getOrFetchDataUrl(imageUrl, tabId, pageUrl)
    .then(function (dataUrl) {
      console.log("STP: got data URL, length=", dataUrl.length);

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
      notifyError(
        browser.i18n.getMessage("alertManualCopy") ||
        "Could not extract the image. Copy Image → paste into Photopea (Ctrl+V)."
      );

      // Soft fallback: blank Photopea / blank canvas only (no bridge messaging)
      if (menuItemId === "photopea-open" || menuItemId === "command-open") {
        return openTab(STP.PHOTOPEA_ORIGIN, "newTab");
      }
      if (String(menuItemId).indexOf("photopea-preset-") === 0) {
        var pid = String(menuItemId).replace("photopea-preset-", "");
        return getPresets().then(function (presets) {
          var preset = presets.find(function (p) { return p.id === pid; });
          if (!preset) return openTab(STP.PHOTOPEA_ORIGIN, "newTab");
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
  var imageUrl = info.srcUrl || null;
  if (!imageUrl) {
    notifyError(browser.i18n.getMessage("notifyNoImage") || "No image URL on this item.");
    return;
  }
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

browser.commands.onCommand.addListener(function (command) {
  if (command !== "open-in-photopea") return;
  var src = lastImageContext.srcUrl;
  var tabId = lastImageContext.tabId;
  if (!src) {
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
    return browser.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
      var tab = tabs[0] || { id: lastImageContext.tabId, url: lastImageContext.pageUrl };
      return handleImageAction("photopea-open", msg.srcUrl, tab);
    });
  }

  if (msg.type === "stp-get-version") {
    return Promise.resolve({ version: STP.VERSION });
  }
});

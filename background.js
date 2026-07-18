// ============================================================
// Send to Photopea — Background Script
// Context menus, robust image fetch, Photopea bridge (ArrayBuffer)
// ============================================================

// shared: defaults.js, photopea-url.js, image-fetch.js via manifest

var lastImageContext = { srcUrl: null, tabId: null, pageUrl: null };
var pendingJobs = Object.create(null);
var jobSeq = 0;

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

// ------ Notifications ------

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

// ------ Restricted pages (no content scripts) ------

function isRestrictedPageUrl(url) {
  if (!url) return false;
  try {
    var host = new URL(url).hostname;
    var blocked = [
      "addons.mozilla.org",
      "addons.cdn.mozilla.org",
      "discovery.addons.mozilla.org",
      "accounts.firefox.com",
      "addons.mozilla.net"
    ];
    return blocked.some(function (h) {
      return host === h || host.endsWith("." + h);
    });
  } catch (e) {
    return /addons\.mozilla\.org/i.test(url);
  }
}

// ------ Image extraction ------

function ensureExtractScript(tabId) {
  return browser.tabs.executeScript(tabId, { file: "content/extract-image.js" })
    .catch(function () { /* restricted / already injected */ });
}

function extractViaContentScript(tabId, imageUrl) {
  return ensureExtractScript(tabId).then(function () {
    return browser.tabs.sendMessage(tabId, { type: "stp-extract", url: imageUrl });
  }).then(function (res) {
    if (res && res.ok && res.dataUrl) return res.dataUrl;
    throw new Error("content extract failed");
  });
}

/**
 * Prefer background multi-URL fetch (works on AMO where CS is blocked).
 * Fall back to content script only on non-restricted pages.
 */
function getOrFetchDataUrl(imageUrl, tabId, pageUrl) {
  if (!imageUrl) return Promise.reject(new Error("no image url"));
  if (imageUrl.indexOf("data:") === 0) return Promise.resolve(imageUrl);

  var restricted = isRestrictedPageUrl(pageUrl);

  // blob: only readable in page context
  if (imageUrl.indexOf("blob:") === 0) {
    if (restricted || tabId == null) {
      return Promise.reject(new Error("blob URL on restricted page"));
    }
    return extractViaContentScript(tabId, imageUrl);
  }

  return stpFetchImageDataUrl(imageUrl)
    .catch(function (err) {
      console.warn("Background multi-fetch failed:", err);
      if (restricted || tabId == null) throw err;
      return extractViaContentScript(tabId, imageUrl);
    });
}

// ------ Open Photopea via bridge ------

function waitTabComplete(tabId, timeoutMs) {
  timeoutMs = timeoutMs || 45000;
  return new Promise(function (resolve) {
    var done = false;
    function finish() {
      if (done) return;
      done = true;
      browser.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    }
    function onUpdated(id, info) {
      if (id === tabId && info.status === "complete") finish();
    }
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.get(tabId).then(function (tab) {
      if (tab.status === "complete") finish();
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

function ensurePhotopeaBridge(tabId) {
  return browser.tabs.executeScript(tabId, { file: "content/photopea-bridge.js" })
    .catch(function () { /* content_scripts may already inject */ });
}

function createJob(payload) {
  var id = "job_" + Date.now() + "_" + (++jobSeq);
  pendingJobs[id] = {
    payload: payload,
    created: Date.now()
  };
  // GC old jobs (5 min)
  Object.keys(pendingJobs).forEach(function (k) {
    if (Date.now() - pendingJobs[k].created > 300000) delete pendingJobs[k];
  });
  return id;
}

function getJob(jobId) {
  return pendingJobs[jobId] || null;
}

function clearJob(jobId) {
  delete pendingJobs[jobId];
}

function sendBridgeMessage(tabId, jobId, attempt) {
  attempt = attempt || 0;
  return browser.tabs.sendMessage(tabId, {
    type: "stp-photopea-run",
    jobId: jobId
  }).catch(function (err) {
    if (attempt >= 8) throw err;
    return new Promise(function (r) { setTimeout(r, 500); }).then(function () {
      return ensurePhotopeaBridge(tabId).then(function () {
        return sendBridgeMessage(tabId, jobId, attempt + 1);
      });
    });
  });
}

function openViaBridge(payload, openIn) {
  // Convert dataUrl → ArrayBuffer in background (structured clone supports it)
  var prepare = Promise.resolve(payload);
  if (payload.dataUrl && !payload.arrayBuffer) {
    prepare = stpDataUrlToArrayBuffer(payload.dataUrl).then(function (buf) {
      var next = Object.assign({}, payload);
      next.arrayBuffer = buf;
      // keep dataUrl as fallback for bridge; drop if huge to save clone cost
      if (next.dataUrl && next.dataUrl.length > 2e6) delete next.dataUrl;
      return next;
    }).catch(function () {
      return payload;
    });
  }

  return prepare.then(function (finalPayload) {
    var jobId = createJob(finalPayload);
    return openTab(STP.PHOTOPEA_ORIGIN, openIn).then(function (tab) {
      return waitTabComplete(tab.id).then(function () {
        return ensurePhotopeaBridge(tab.id).then(function () {
          // Let Photopea boot before first OE message
          return new Promise(function (r) { setTimeout(r, 900); }).then(function () {
            return sendBridgeMessage(tab.id, jobId).then(function (res) {
              if (res && res.ok === false) {
                console.error("Bridge reported failure:", res.error);
                notifyError(
                  browser.i18n.getMessage("alertManualCopy") ||
                  "Photopea did not accept the image. Try Copy Image → paste in Photopea."
                );
              }
              return res;
            });
          });
        });
      });
    });
  });
}

/**
 * payload: mode open | canvas | blank ; dataUrl? ; remoteUrl? ; width/height/dpi/fill/fitMode
 */
function openInPhotopea(payload) {
  return getSettings().then(function (settings) {
    var fill = payload.fill || settings.canvasFill;
    var fitMode = payload.fitMode || settings.fitMode;
    var dpi = payload.dpi || settings.defaultDpi;
    var openIn = settings.openIn;
    var merged = Object.assign({}, payload, { fill: fill, fitMode: fitMode, dpi: dpi });

    // Blank canvas: hash is fine (no image race)
    if (merged.mode === "blank") {
      var blankUrl = stpBuildBlankUrl(merged.width, merged.height, {
        dpi: dpi,
        fill: fill
      });
      return openTab(blankUrl, openIn);
    }

    // open + canvas: ALWAYS use bridge (hash script races → empty canvas)
    if (merged.dataUrl || merged.arrayBuffer || merged.remoteUrl) {
      return openViaBridge(merged, openIn);
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

function resolveImageUrl(info) {
  return info.srcUrl || null;
}

function handleImageAction(menuItemId, imageUrl, tab) {
  var tabId = tab && tab.id;
  var pageUrl = tab && tab.url;

  lastImageContext = { srcUrl: imageUrl, tabId: tabId, pageUrl: pageUrl };
  pushRecent({ srcUrl: imageUrl, pageUrl: pageUrl });

  return getOrFetchDataUrl(imageUrl, tabId, pageUrl)
    .then(function (dataUrl) {
      if (menuItemId === "photopea-open" || menuItemId === "command-open") {
        return openInPhotopea({
          mode: "open",
          dataUrl: dataUrl,
          remoteUrl: imageUrl
        });
      }

      if (String(menuItemId).indexOf("photopea-preset-") === 0) {
        var presetId = String(menuItemId).replace("photopea-preset-", "");
        return getPresets().then(function (presets) {
          var preset = presets.find(function (p) { return p.id === presetId; });
          if (!preset) throw new Error("preset not found");
          return openInPhotopea({
            mode: "canvas",
            dataUrl: dataUrl,
            remoteUrl: imageUrl,
            width: preset.width,
            height: preset.height,
            dpi: preset.dpi
          });
        });
      }
    })
    .catch(function (err) {
      console.error("Image action failed:", err);

      // Last resort: open Photopea and let it try the remote URL via OE API
      // (works when PP can fetch the file even if we couldn't re-encode it)
      var remoteCandidates = typeof stpImageUrlCandidates === "function"
        ? stpImageUrlCandidates(imageUrl)
        : [imageUrl];

      var tryRemote = function (mode, extra) {
        return openInPhotopea(Object.assign({
          mode: mode,
          remoteUrl: remoteCandidates[0] || imageUrl
        }, extra || {}));
      };

      if (menuItemId === "photopea-open" || menuItemId === "command-open") {
        return tryRemote("open").catch(function () {
          notifyError(browser.i18n.getMessage("alertManualCopy") ||
            "Could not extract the image. Copy it manually and paste into Photopea (Ctrl+V).");
          return openTab(STP.PHOTOPEA_ORIGIN, "newTab");
        });
      }

      if (String(menuItemId).indexOf("photopea-preset-") === 0) {
        var pid = String(menuItemId).replace("photopea-preset-", "");
        return getPresets().then(function (presets) {
          var preset = presets.find(function (p) { return p.id === pid; });
          if (!preset) return;
          return tryRemote("canvas", {
            width: preset.width,
            height: preset.height,
            dpi: preset.dpi
          }).catch(function () {
            notifyError(browser.i18n.getMessage("alertManualCopy") ||
              "Could not extract the image. Canvas opened empty — paste with Ctrl+V.");
            return openInPhotopea({
              mode: "blank",
              width: preset.width,
              height: preset.height,
              dpi: preset.dpi
            });
          });
        });
      }
    });
}

// ------ Events ------

browser.contextMenus.onClicked.addListener(function (info, tab) {
  var imageUrl = resolveImageUrl(info);
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

  if (msg.type === "stp-get-job") {
    return Promise.resolve(getJob(msg.jobId));
  }

  if (msg.type === "stp-clear-job") {
    clearJob(msg.jobId);
    return Promise.resolve({ ok: true });
  }

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
      var tab = tabs[0] || { id: tabId, url: lastImageContext.pageUrl };
      return handleImageAction("photopea-open", msg.srcUrl, tab);
    });
  }

  if (msg.type === "stp-get-version") {
    return Promise.resolve({ version: STP.VERSION });
  }
});

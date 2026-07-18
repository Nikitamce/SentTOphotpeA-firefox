// ============================================================
// Send to Photopea — Background Script
// Manages context menus and opens Photopea with images
// ============================================================

const DEFAULT_PRESETS = [
  { name: "Full HD",            width: 1920, height: 1080, enabled: true },
  { name: "Instagram Post",     width: 1080, height: 1080, enabled: true },
  { name: "Instagram Story",    width: 1080, height: 1920, enabled: true },
  { name: "A4 (300 DPI)",       width: 2480, height: 3508, enabled: true },
  { name: "YouTube Thumbnail",  width: 1280, height: 720,  enabled: true }
];

// ------ Helpers ------

function getPresets() {
  return browser.storage.local.get("presets").then(data => {
    return data.presets || DEFAULT_PRESETS;
  });
}

/**
 * Fetch the image from URL and convert it to a Data URL (base64)
 * to bypass CORS policies when Photopea tries to fetch it.
 * Falls back to in-page extraction (canvas / same-origin fetch) if background fetch fails.
 */
function getOrFetchDataUrl(imageUrl, tabId) {
  if (!imageUrl) return Promise.resolve("");
  if (imageUrl.startsWith("data:") || imageUrl.startsWith("blob:")) {
    return Promise.resolve(imageUrl);
  }

  // 1. Try background page fetch
  return fetch(imageUrl)
    .then(response => {
      if (!response.ok) throw new Error("Fetch failed: " + response.statusText);
      return response.blob();
    })
    .then(blob => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    }))
    .catch(err => {
      console.warn("Background fetch failed, trying page extraction:", err);
      if (!tabId) {
        return Promise.reject(err);
      }

      // Escape URL for safe injection into code string
      const escapedUrl = imageUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      
      const code = `
        (function() {
          try {
            var img = document.querySelector('img[src="${escapedUrl}"]') || 
                      Array.from(document.querySelectorAll('img')).find(function(i) { return i.src === "${escapedUrl}"; });
            if (!img) return Promise.resolve(null);

            // Try drawing to canvas first (instant, works if image loaded and CORS allows)
            try {
              var canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth || img.width || 100;
              canvas.height = img.naturalHeight || img.height || 100;
              var ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);
              return Promise.resolve(canvas.toDataURL('image/png'));
            } catch (canvasErr) {
              console.warn("Canvas export failed, trying page fetch:", canvasErr);
            }

            // Try same-origin fetch from page context
            return fetch(img.src)
              .then(function(res) {
                if (!res.ok) throw new Error("Page fetch failed");
                return res.blob();
              })
              .then(function(blob) {
                return new Promise(function(resolve) {
                  var reader = new FileReader();
                  reader.onloadend = function() { resolve(reader.result); };
                  reader.onerror = function() { resolve(null); };
                  reader.readAsDataURL(blob);
                });
              })
              .catch(function() {
                return null;
              });
          } catch (e) {
            console.error("Page extraction error:", e);
            return Promise.resolve(null);
          }
        })();
      `;

      return browser.tabs.executeScript(tabId, { code: code })
        .then(results => {
          if (results && results[0]) {
            return results[0];
          }
          throw new Error("All extraction methods failed");
        });
    });
}

/**
 * Build the Photopea URL to open an image directly.
 */
function buildOpenUrl(imageUrl) {
  const config = { files: [imageUrl] };
  return "https://www.photopea.com#" + encodeURIComponent(JSON.stringify(config));
}

/**
 * Build the Photopea URL to place an image onto a new canvas of given dimensions.
 * The script:
 *  1. Waits for the image to load (it's opened via "files")
 *  2. Selects all & copies the image
 *  3. Creates a new blank white document with preset dimensions
 *  4. Pastes the image and centers it
 *  5. Closes the original image document
 */
function buildCanvasUrl(imageUrl, width, height) {
  const script = [
    "var src = app.activeDocument;",
    "src.selection.selectAll();",
    "src.activeLayer.copy();",
    `app.documents.add(${width}, ${height}, 72, "Canvas");`,
    "app.activeDocument.paste();",
    "var doc = app.activeDocument;",
    "var layer = doc.activeLayer;",
    "var b = layer.bounds;",
    "var lw = b[2].value - b[0].value;",
    "var lh = b[3].value - b[1].value;",
    "var dx = (doc.width.value - lw) / 2 - b[0].value;",
    "var dy = (doc.height.value - lh) / 2 - b[1].value;",
    "layer.translate(dx, dy);",
    "src.close(SaveOptions.DONOTSAVECHANGES);"
  ].join("\n");

  const config = {
    files: [imageUrl],
    script: script
  };
  return "https://www.photopea.com#" + encodeURIComponent(JSON.stringify(config));
}

// ------ Context Menu Creation ------

function createContextMenus() {
  browser.contextMenus.removeAll().then(() => {
    // Parent menu item
    browser.contextMenus.create({
      id: "photopea-parent",
      title: browser.i18n.getMessage("menuParent") || "🎨 Photopea",
      contexts: ["image"]
    });

    // Direct open
    browser.contextMenus.create({
      id: "photopea-open",
      parentId: "photopea-parent",
      title: browser.i18n.getMessage("menuOpen") || "📷 Открыть изображение",
      contexts: ["image"]
    });

    // Separator
    browser.contextMenus.create({
      id: "photopea-sep",
      parentId: "photopea-parent",
      type: "separator",
      contexts: ["image"]
    });

    // Preset items
    getPresets().then(presets => {
      presets.forEach((preset, i) => {
        if (preset.enabled) {
          const menuTitle = browser.i18n.getMessage("menuPreset", [preset.name, String(preset.width), String(preset.height)]) ||
                            `🖼 На холст: ${preset.name}  (${preset.width}×${preset.height})`;
          browser.contextMenus.create({
            id: `photopea-preset-${i}`,
            parentId: "photopea-parent",
            title: menuTitle,
            contexts: ["image"]
          });
        }
      });
    });
  });
}

// ------ Event Listeners ------

// Handle context-menu clicks
browser.contextMenus.onClicked.addListener((info, tab) => {
  const imageUrl = info.srcUrl;
  if (!imageUrl) return;

  getOrFetchDataUrl(imageUrl, tab.id)
    .then(dataUrl => {
      if (info.menuItemId === "photopea-open") {
        browser.tabs.create({ url: buildOpenUrl(dataUrl) });
        return;
      }

      if (info.menuItemId.startsWith("photopea-preset-")) {
        const idx = parseInt(info.menuItemId.replace("photopea-preset-", ""), 10);
        getPresets().then(presets => {
          const preset = presets[idx];
          if (preset) {
            browser.tabs.create({ url: buildCanvasUrl(dataUrl, preset.width, preset.height) });
          }
        });
      }
    })
    .catch(err => {
      console.error("All image extraction methods failed:", err);
      
      // Alert the user about manual copy-paste
      const alertMsg = browser.i18n.getMessage("alertManualCopy") || 
                       "Не удалось автоматически извлечь изображение. Пожалуйста, скопируйте его вручную (правый клик -> 'Копировать изображение') и вставьте в Photopea через Ctrl+V.";
      browser.tabs.executeScript(tab.id, {
        code: `alert(${JSON.stringify(alertMsg)});`
      }).catch(e => console.error("Failed to show alert:", e));

      // Still open Photopea ready for paste
      if (info.menuItemId === "photopea-open") {
        browser.tabs.create({ url: "https://www.photopea.com" });
      } else if (info.menuItemId.startsWith("photopea-preset-")) {
        const idx = parseInt(info.menuItemId.replace("photopea-preset-", ""), 10);
        getPresets().then(presets => {
          const preset = presets[idx];
          if (preset) {
            // Create a blank document of preset size, ready for pasting (no undefined enums)
            const script = `app.documents.add(${preset.width}, ${preset.height}, 72, "Canvas");`;
            const config = { script: script };
            browser.tabs.create({ url: "https://www.photopea.com#" + encodeURIComponent(JSON.stringify(config)) });
          }
        });
      }
    });
});

// Rebuild menus when extension is installed or updated
browser.runtime.onInstalled.addListener(() => {
  // Ensure default presets exist in storage on first install
  browser.storage.local.get("presets").then(data => {
    if (!data.presets) {
      browser.storage.local.set({ presets: DEFAULT_PRESETS });
    }
  });
  createContextMenus();
});

// Rebuild menus when Firefox starts
createContextMenus();

// Rebuild menus when presets change (from options/popup)
browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.presets) {
    createContextMenus();
  }
});

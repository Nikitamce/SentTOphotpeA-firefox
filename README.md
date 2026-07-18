# Send to Photopea (Firefox)

Firefox extension: right‑click any image (or video) → open it in [Photopea](https://www.photopea.com), or place it on a custom canvas size (Instagram, Full HD, A4, your own presets).

**Version:** 1.1.1  
**Author:** Nikita  
**Extension ID:** `send-to-photopea@nikita.dev`

---

## Features

- Context menu on **images** and **videos**
- **Open image** as‑is in Photopea
- **Canvas presets** with name, size, DPI, icon, enable/disable
- Up to **15 presets** (add / remove in settings)
- Placement modes: **center**, **fit**, **fill**, **stretch**
- Canvas background: **white**, **transparent**, **black**
- Large images: transferred via **Photopea bridge** (not a multi‑MB URL hash)
- Fallback extraction from the page (`srcset`, `data-src`, canvas, same‑origin fetch)
- **Popup**: open Photopea, blank canvas per preset, recent images
- **Shortcut:** `Alt+Shift+P` — open last right‑clicked image
- Notifications when extraction fails (optional)
- Locales: `en`, `ru` (others fall back to English)
- Optional folder `firefox-customization/` — **not** part of the WebExtension (userChrome helpers)

---

## Install (temporary, for development)

1. Open Firefox → `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…**
3. Select `manifest.json` from this folder
4. Right‑click any image → **🎨 Photopea**

Permanent install: pack as `.zip` (see below) or publish on [addons.mozilla.org](https://addons.mozilla.org/).

### Package for AMO / manual install

Include only extension files (not `firefox-customization/`, not nested copies):

```text
manifest.json
background.js
shared/
content/
popup/
options/
icons/
_locales/
```

Zip the **contents** of the extension root (so `manifest.json` is at the zip root).

---

## Permissions

| Permission | Why |
|------------|-----|
| `contextMenus` | Right‑click menu on images |
| `storage` | Presets, settings, recent list |
| `activeTab` / `tabs` | Extract image from the page, open Photopea |
| `notifications` | Error feedback instead of `alert()` |
| `<all_urls>` | Download images that block hotlinking (CORS) so Photopea can load them |

No analytics. No data collection (`data_collection_permissions: none`).

---

## Settings

Open from the toolbar popup → **Settings**, or `about:addons` → extension → Preferences.

- Open in new / current tab  
- Image placement & canvas fill  
- Default DPI  
- Error notifications  
- Preset editor  

Shortcut can be changed: `about:addons` → gear → **Manage Extension Shortcuts**.

---

## How image open works

1. Background tries **multiple URL candidates** (`shared/image-fetch.js`) — e.g. AMO `thumbs` → `full` PNG  
2. On failure, if the page is not a Firefox **restricted domain**, injects `content/extract-image.js`  
3. **Restricted sites** (including `addons.mozilla.org`) block content scripts — only background fetch is used  
4. Image is sent to Photopea via **OE API ArrayBuffer** (`content/photopea-bridge.js`), not a fragile URL hash  
5. Canvas placement runs **after** the file is open (avoids empty canvas of the right size)  
6. On total failure → try remote `app.open(url)`, then notification + blank canvas for manual paste  

### Known limitation

Firefox **forbids** extension content scripts on `addons.mozilla.org`. The extension still downloads preview images by URL from the background. If Mozilla ever blocks that network access too, use “Copy Image” → paste in Photopea.

---

## Project layout

```text
manifest.json
background.js
shared/defaults.js       # defaults, normalize helpers
shared/photopea-url.js   # hash URL builders
content/extract-image.js
content/photopea-bridge.js
popup/
options/
icons/
_locales/
firefox-customization/   # optional Firefox UI tweaks (not the extension)
```

---

## Manifest V3 note

This build is **Manifest V2** (Firefox). When migrating to MV3: event page / service worker, `menus` API, no string `code` injection (already using script files).

---

## License

Use and modify freely for personal or project needs. Photopea is a third‑party product ([photopea.com](https://www.photopea.com)).

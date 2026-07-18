# Send to Photopea — User Guide (English)

**Version:** 1.1  
**Browser:** Firefox (desktop)  
**What it does:** Right‑click an image (or video) and send it to [Photopea](https://www.photopea.com) — open as‑is or place it on a custom canvas.

[Русская версия →](./USER_GUIDE_RU.md)

---

## Table of contents

1. [Install](#1-install)
2. [Quick start](#2-quick-start)
3. [Toolbar popup](#3-toolbar-popup)
4. [Context menu](#4-context-menu)
5. [Settings — General](#5-settings--general)
6. [Settings — Canvas presets](#6-settings--canvas-presets)
7. [Placement modes (center / fit / fill / stretch)](#7-placement-modes)
8. [Export from Photopea](#8-export-from-photopea)
9. [Keyboard shortcut](#9-keyboard-shortcut)
10. [Languages](#10-languages)
11. [Permissions (what and why)](#11-permissions)
12. [Tips & limitations](#12-tips--limitations)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Install

### Temporary (development / testing)

1. Open Firefox → `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `manifest.json` from the extension folder
4. The extension appears in the toolbar

> Temporary add-ons are removed when Firefox restarts. Load again after restart, or install from AMO / a signed package when available.

### From a ZIP package

Zip the **contents** of the extension root so that `manifest.json` is at the root of the archive (do not include `firefox-customization/` or nested copies like `photopea/`).

---

## 2. Quick start

1. Open any webpage with an image.
2. **Right‑click** the image.
3. Open **🎨 Photopea**:
   - **Open image** — opens the picture in Photopea as a document.
   - **To canvas: …** — creates a canvas of the chosen preset size, places the image (see [placement modes](#7-placement-modes)), centers it, and fits the view to the screen.
4. Edit in Photopea as usual.
5. To save a file back to your computer, use **Export** (see [§8](#8-export-from-photopea)).

---

## 3. Toolbar popup

Click the extension icon in the Firefox toolbar.

| Element | Action |
|--------|--------|
| **Open Photopea** | Opens Photopea in a new tab |
| **Canvas presets** list | Click a preset → opens a **blank** canvas of that size in Photopea |
| **Recent images** | Re‑opens a recently sent image URL (if still available) |
| **Export** (only on a Photopea tab) | Download the current document as PNG / JPG / PSD |
| **Settings** | Opens the full options page |

Shortcut hint in the popup: **Alt+Shift+P** (last image).

---

## 4. Context menu

### On images / videos

Right‑click an image or video:

| Item | Meaning |
|------|---------|
| **🎨 Photopea → Open image** | Load the image into Photopea |
| **🎨 Photopea → To canvas: Name (W×H)** | Place on a canvas of that size (only **enabled** presets appear) |

### On a Photopea page

Right‑click on [photopea.com](https://www.photopea.com) while a document is open:

| Item | Meaning |
|------|---------|
| **Export from Photopea → PNG / JPG / PSD** | Export via Photopea API and open the browser “Save as” dialog |

---

## 5. Settings — General

Open: popup → **Settings**, or `about:addons` → extension → **Preferences**.

### Interface language

| Option | Behavior |
|--------|----------|
| **Auto (browser language)** | Uses Firefox UI language when a matching translation exists |
| **Specific language** (English, Русский, 中文, …) | Forces that language for menus, popup, settings, and notifications |

Changing the language applies immediately.  
Note: the name of the extension in `about:addons` still follows the browser language (Firefox limitation).

### Open in

| Option | Behavior |
|--------|----------|
| **New tab** | Always opens Photopea in a new tab |
| **Current tab** | Replaces the current tab with Photopea |

### Image placement

How the image is put onto a **canvas preset** (not used for “Open image”).  
See [§7](#7-placement-modes).

### Canvas background

Background color of the new canvas when placement leaves empty areas:

- **White**
- **Transparent**
- **Black**

### Default DPI

Default DPI value used for new presets you create. Existing presets keep their own DPI.

### Show notification if image cannot be extracted

If enabled, Firefox shows a notification when the extension cannot download or capture the image (you can still copy the image manually and paste into Photopea with Ctrl+V).

---

## 6. Settings — Canvas presets

You can define up to **15** canvas sizes.

For each preset:

| Field | Meaning |
|-------|---------|
| **On / Off** | Only **active** presets appear in the right‑click menu and popup list |
| **Icon** | Emoji or short symbol shown in menus |
| **Name** | Label, e.g. “Instagram Story” |
| **Width / Height** | Canvas size in pixels |
| **DPI** | Resolution metadata for the Photopea document |
| **✕** | Remove this preset (at least one must remain) |

Buttons:

- **+ Add preset** — create a new slot  
- **Save** — write presets and general settings to storage  
- **Reset to default** — restore the default five presets and default general settings  

Default presets (examples): Full HD, Instagram Post, Instagram Story, A4 (300 DPI), YouTube Thumbnail.

---

## 7. Placement modes

Setting: **Image placement** (General).

Applied when you use **To canvas: …**.

| Mode | What happens | Best for |
|------|----------------|----------|
| **Center (original size)** | Canvas = preset size. Image keeps its pixel size, centered. Larger images are cropped by the canvas edges; smaller ones sit on a background. | Keep original detail; fixed canvas size |
| **Fit inside canvas** | Image is scaled **uniformly** to fit **entirely** inside the canvas (letterboxing possible). | See the whole subject, no crop |
| **Fill canvas (crop)** | Image is scaled **uniformly** to **cover** the whole canvas; excess is cropped. | Covers / stories without empty bars |
| **Stretch to canvas** | Image is forced to exact canvas width and height (proportions may distort). | Rare cases; exact pixel size only |

### Examples

- Phone photo → **Instagram Story** → prefer **Fit** (full subject) or **Fill** (no bars).  
- Small icon → **Full HD** → **Center** (tiny icon in the middle of a large canvas).  
- Any image forced to 1280×720 regardless of aspect ratio → **Stretch**.

After placement the extension tries to:

1. Center the layer on the canvas  
2. Run Photopea **Fit on Screen** (`app.UI.fitTheArea`) so you see the whole canvas without manual zoom  

---

## 8. Export from Photopea

After editing in Photopea:

1. Stay on the Photopea tab.  
2. Either:
   - Open the extension **popup** → **PNG / JPG / PSD**, or  
   - Right‑click the page → **Export from Photopea** → format.  
3. Choose where to save the file in the browser dialog.

Requires a document to be open in Photopea. Uses Photopea’s `saveToOE` API and the `downloads` permission.

---

## 9. Keyboard shortcut

| Shortcut | Action |
|----------|--------|
| **Alt+Shift+P** (default) | Open the **last** image you right‑clicked with the extension, in Photopea |

Change it:

1. `about:addons`  
2. Gear icon → **Manage Extension Shortcuts**  
3. Find **Send to Photopea** → set your keys  

If no image was used yet, you get a notification and Photopea may open empty.

---

## 10. Languages

Built‑in locales include top world languages and extras, for example:

English, Chinese (Simplified), Hindi, Spanish, French, Arabic, Bengali, Portuguese (Brazil), Russian, Urdu, German, Italian, Japanese, Korean, Turkish.

Control:

- **Auto** — browser language  
- **Manual** — pick in Settings → Interface language  

Photopea’s own UI language is also aligned when possible via the Photopea `environment.lang` parameter.

---

## 11. Permissions

| Permission | Why it is needed |
|------------|------------------|
| `contextMenus` | Right‑click menu |
| `storage` | Presets, settings, recent list, language |
| `tabs` / `activeTab` | Open Photopea, capture tab when needed |
| `notifications` | Error messages |
| `downloads` | Export PNG/JPG/PSD to disk |
| `<all_urls>` | Download images from any site for Photopea |
| `webRequest` + `webRequestBlocking` | Work around CORS on some hosts (e.g. AMO) |

No analytics. Declared data collection: **none**.

---

## 12. Tips & limitations

**Tips**

- Enable only the presets you use — the context menu stays short.  
- On picky sites, if auto‑send fails: **Copy Image** → open Photopea → **Ctrl+V**.  
- Use **Fit** or **Fill** for social story sizes; **Center** for “document of exact size, original pixels”.  

**Limitations**

- Firefox **blocks content scripts** on `addons.mozilla.org`. The extension still tries network / tab capture.  
- Very large images may hit URL size limits; you may need to open smaller assets or paste manually.  
- Temporary add‑ons disappear after Firefox restart until reloaded.  
- Folder `firefox-customization/` is **not** part of the WebExtension (optional Firefox UI hacks).

---

## 13. Troubleshooting

| Problem | What to try |
|---------|-------------|
| Nothing happens on right‑click | Reload the extension in `about:debugging`. Confirm the menu **🎨 Photopea** appears. |
| Empty canvas / wrong size | Update to latest 1.1 build; check **Image placement** and that the preset is **enabled**. |
| Image stuck in the corner / huge zoom | Reload extension; “To canvas” should re‑center and fit view. Manually: in Photopea, View fit / zoom. |
| Export does nothing | Be on a **Photopea** tab with a document open. Re‑grant **downloads** (remove + load temporary add‑on again). |
| Language does not change | Settings → Interface language → pick language (not only Auto). Reload popup. |
| Site blocks the image | Copy Image → paste in Photopea. |

Developer console: `about:debugging` → extension → **Inspect** → look for lines starting with `STP:`.

---

## Related links

- [Photopea](https://www.photopea.com)  
- [Photopea API](https://www.photopea.com/api/)  
- Repository README (project overview): [../README.md](../README.md)

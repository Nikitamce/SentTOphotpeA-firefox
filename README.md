# Send to Photopea (Firefox)

Right‑click any image (or video) → open it in [Photopea](https://www.photopea.com), or place it on a custom canvas (Full HD, Instagram, A4, your own presets).

**Version:** 1.1 · **Author:** Nikita · **ID:** `send-to-photopea@nikita.dev`

**Languages:** [English](README.md) · [Русский](README.ru.md)

---

## User documentation (detailed)

| Language | Guide |
|----------|--------|
| **English** | **[docs/USER_GUIDE_EN.md](docs/USER_GUIDE_EN.md)** — features, settings, placement modes, export, FAQ |
| **Русский** | **[docs/USER_GUIDE_RU.md](docs/USER_GUIDE_RU.md)** — возможности, настройки, режимы, экспорт, FAQ |

> Full manuals live under `docs/`, not only in the root README — so GitHub stays readable and each language has a complete guide.

---

## Features (summary)

- Context menu: **Open image** / **To canvas** (presets)
- Up to **15** canvas presets (size, DPI, icon, on/off)
- Placement: **center**, **fit**, **fill**, **stretch** + canvas background
- Works on many “locked” sites (CORS / AMO workarounds)
- Popup: Photopea, blank canvas, recent images, export
- **Export** PNG / JPG / PSD from Photopea
- UI language: auto or manual (15 locales)
- Shortcut: **Alt+Shift+P** (last image)

---

## Install (temporary)

1. Firefox → `about:debugging#/runtime/this-firefox`
2. **Load Temporary Add-on…** → select `manifest.json`
3. Right‑click an image → **🎨 Photopea**

Package for AMO: zip extension root so `manifest.json` is at the zip root.  
Do **not** include `firefox-customization/` or nested `photopea/` copies.

---

## Permissions (short)

`contextMenus`, `storage`, `tabs`, `notifications`, `downloads`, `<all_urls>`, `webRequest` (+ blocking) — for menus, settings, opening Photopea, export, and loading images. No analytics.

---

## Project layout

```text
manifest.json
background.js
shared/          # defaults, i18n, Photopea URLs, image fetch
content/         # extract-image, photopea-bridge
popup/ options/ icons/ _locales/
docs/            # full user guides (EN + RU)
firefox-customization/   # NOT part of the WebExtension
```

---

## License

Use and modify freely for personal or project needs.  
Photopea is a third‑party product ([photopea.com](https://www.photopea.com)).

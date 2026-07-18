> **Язык / Language:** [English](README.md) · **Русский**

# Send to Photopea (Firefox)

Правый клик по изображению (или видео) → открыть в [Photopea](https://www.photopea.com) или положить на холст (Full HD, Instagram, A4, свои пресеты).

**Версия:** 1.1 · **Автор:** Nikita · **ID:** `send-to-photopea@nikita.dev`

---

## Подробные инструкции для пользователей

| Язык | Файл |
|------|------|
| **Русский** | **[docs/USER_GUIDE_RU.md](docs/USER_GUIDE_RU.md)** — возможности, настройки, режимы center/fit/fill/stretch, экспорт, FAQ |
| **English** | **[docs/USER_GUIDE_EN.md](docs/USER_GUIDE_EN.md)** — features, settings, placement modes, export, FAQ |

> Полные руководства лежат в `docs/`, а не только в корневом README — так удобнее читать на GitHub и вести два языка.

---

## Возможности (кратко)

- Меню ПКМ: **Открыть изображение** / **На холст** (пресеты)
- До **15** пресетов (размер, DPI, иконка, вкл/выкл)
- Размещение: **center**, **fit**, **fill**, **stretch** + фон холста
- Работа на «закрытых» сайтах (обходы CORS / AMO)
- Popup: Photopea, пустой холст, недавние, экспорт
- **Экспорт** PNG / JPG / PSD из Photopea
- Язык UI: авто или вручную (15 локалей)
- Клавиша: **Alt+Shift+P** (последняя картинка)

---

## Установка (временно)

1. Firefox → `about:debugging#/runtime/this-firefox`
2. **Загрузить временное дополнение…** → `manifest.json`
3. ПКМ по картинке → **🎨 Photopea**

Для AMO: zip корня расширения, чтобы `manifest.json` был в корне архива.  
**Не** включай `firefox-customization/` и вложенные копии `photopea/`.

---

## Права (кратко)

`contextMenus`, `storage`, `tabs`, `notifications`, `downloads`, `<all_urls>`, `webRequest` (+ blocking) — меню, настройки, Photopea, экспорт, загрузка картинок. Аналитики нет.

---

## Структура проекта

```text
manifest.json
background.js
shared/          # defaults, i18n, URL Photopea, fetch
content/         # extract-image, photopea-bridge
popup/ options/ icons/ _locales/
docs/            # полные гайды (EN + RU)
firefox-customization/   # НЕ часть WebExtension
```

---

## Лицензия

Можно использовать и менять для личных и проектных нужд.  
Photopea — сторонний продукт ([photopea.com](https://www.photopea.com)).

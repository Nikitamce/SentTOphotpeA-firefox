// ============================================================
// Send to Photopea — Popup Script
// Renders preset cards and handles settings button
// ============================================================

const DEFAULT_PRESETS = [
  { name: "Full HD",            width: 1920, height: 1080, enabled: true },
  { name: "Instagram Post",     width: 1080, height: 1080, enabled: true },
  { name: "Instagram Story",    width: 1080, height: 1920, enabled: true },
  { name: "A4 (300 DPI)",       width: 2480, height: 3508, enabled: true },
  { name: "YouTube Thumbnail",  width: 1280, height: 720,  enabled: true }
];

const PRESET_ICONS = ["🖥", "📸", "📱", "📄", "▶️"];

document.addEventListener("DOMContentLoaded", () => {
  const listEl = document.getElementById("preset-list");
  const btnSettings = document.getElementById("btn-settings");

  // Translate static UI elements
  localizePage();

  // Load and render presets
  browser.storage.local.get("presets").then(data => {
    const presets = data.presets || DEFAULT_PRESETS;
    renderPresets(presets);
  });

  function renderPresets(presets) {
    listEl.innerHTML = "";

    const enabledPresets = presets.filter(p => p.enabled);
    if (enabledPresets.length === 0) {
      const emptyLi = document.createElement("li");
      emptyLi.className = "presets__empty";
      emptyLi.textContent = browser.i18n.getMessage("emptyPresets") || "Нет активных пресетов. Откройте настройки, чтобы добавить.";
      listEl.appendChild(emptyLi);
      return;
    }

    const template = document.getElementById("preset-item-template");

    presets.forEach((preset, i) => {
      const clone = template.content.cloneNode(true);
      const li = clone.querySelector(".preset-card");

      li.querySelector(".preset-card__icon").textContent = PRESET_ICONS[i] || "🖼";
      li.querySelector(".preset-card__name").textContent = preset.name;
      li.querySelector(".preset-card__dims").textContent = `${preset.width} × ${preset.height} px`;

      const statusEl = li.querySelector(".preset-card__status");
      statusEl.className = `preset-card__status preset-card__status--${preset.enabled ? "on" : "off"}`;
      statusEl.title = preset.enabled 
        ? (browser.i18n.getMessage("statusActive") || "Активен") 
        : (browser.i18n.getMessage("statusDisabled") || "Выключен");

      listEl.appendChild(li);
    });
  }

  // Open full options page
  btnSettings.addEventListener("click", () => {
    browser.runtime.openOptionsPage();
    window.close();
  });

  // Localize DOM based on data-i18n attributes
  function localizePage() {
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.dataset.i18n;
      const text = browser.i18n.getMessage(key);
      if (text) el.textContent = text;
    });

    document.querySelectorAll("[data-i18n-title]").forEach(el => {
      const key = el.dataset.i18nTitle;
      const text = browser.i18n.getMessage(key);
      if (text) el.title = text;
    });
  }
});

// (escapeHtml utility removed as direct properties are now used)

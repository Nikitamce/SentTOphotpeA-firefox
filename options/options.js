// ============================================================
// Send to Photopea — Options Script
// Preset editor with save / reset / preview functionality
// ============================================================

const DEFAULT_PRESETS = [
  { name: "Full HD",            width: 1920, height: 1080, enabled: true },
  { name: "Instagram Post",     width: 1080, height: 1080, enabled: true },
  { name: "Instagram Story",    width: 1080, height: 1920, enabled: true },
  { name: "A4 (300 DPI)",       width: 2480, height: 3508, enabled: true },
  { name: "YouTube Thumbnail",  width: 1280, height: 720,  enabled: true }
];

const MAX_PREVIEW_SIZE = 44; // px

document.addEventListener("DOMContentLoaded", () => {
  const grid      = document.getElementById("presets-grid");
  const btnSave   = document.getElementById("btn-save");
  const btnReset  = document.getElementById("btn-reset");
  const toast     = document.getElementById("toast");

  let currentPresets = [];

  // Translate static UI elements
  localizePage();

  // ------ Load ------

  browser.storage.local.get("presets").then(data => {
    currentPresets = data.presets || JSON.parse(JSON.stringify(DEFAULT_PRESETS));
    renderAll();
  });

  // ------ Render ------

  function renderAll() {
    grid.innerHTML = "";
    currentPresets.forEach((preset, i) => {
      grid.appendChild(createCard(preset, i));
    });
  }

  function createCard(preset, index) {
    const template = document.getElementById("preset-card-template");
    const clone = template.content.cloneNode(true);
    const card = clone.querySelector(".preset-editor");

    // Translate elements inside the cloned template
    clone.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.dataset.i18n;
      const text = browser.i18n.getMessage(key);
      if (text) el.textContent = text;
    });

    clone.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
      const key = el.dataset.i18nPlaceholder;
      const text = browser.i18n.getMessage(key);
      if (text) el.placeholder = text;
    });

    if (!preset.enabled) {
      card.classList.add("preset-editor--disabled");
    }

    const inputs = card.querySelectorAll("input");
    inputs.forEach(input => {
      input.dataset.index = index;
    });

    card.querySelector(".preset-editor__number").textContent = browser.i18n.getMessage("presetNum", String(index + 1)) || `Пресет ${index + 1}`;
    
    const enabledInput = card.querySelector('[data-field="enabled"]');
    enabledInput.checked = preset.enabled;
    
    card.querySelector(".toggle__label").textContent = preset.enabled 
      ? (browser.i18n.getMessage("statusActive") || "Активен") 
      : (browser.i18n.getMessage("statusDisabled") || "Выключен");

    const nameInput = card.querySelector('[data-field="name"]');
    nameInput.value = preset.name;

    const widthInput = card.querySelector('[data-field="width"]');
    widthInput.value = preset.width;

    const heightInput = card.querySelector('[data-field="height"]');
    heightInput.value = preset.height;

    const previewBoxInner = card.querySelector(".preview-box__inner");
    previewBoxInner.id = `preview-${index}`;

    const previewLabel = card.querySelector(".preview-box__label");
    previewLabel.id = `preview-label-${index}`;
    previewLabel.textContent = `${preset.width} × ${preset.height}`;

    inputs.forEach(input => {
      const handler = input.type === "checkbox" ? "change" : "input";
      input.addEventListener(handler, onFieldChange);
    });

    requestAnimationFrame(() => updatePreview(index));

    return card;
  }

  // ------ Field change handler ------

  function onFieldChange(e) {
    const input = e.target;
    const idx   = parseInt(input.dataset.index, 10);
    const field = input.dataset.field;

    if (field === "enabled") {
      currentPresets[idx].enabled = input.checked;
      // Update label
      const label = input.closest(".toggle").querySelector(".toggle__label");
      label.textContent = input.checked 
        ? (browser.i18n.getMessage("statusActive") || "Активен") 
        : (browser.i18n.getMessage("statusDisabled") || "Выключен");
      // Toggle card opacity
      const card = input.closest(".preset-editor");
      card.classList.toggle("preset-editor--disabled", !input.checked);
    } else if (field === "name") {
      currentPresets[idx].name = input.value;
    } else if (field === "width") {
      currentPresets[idx].width = parseInt(input.value, 10) || 0;
      updatePreview(idx);
    } else if (field === "height") {
      currentPresets[idx].height = parseInt(input.value, 10) || 0;
      updatePreview(idx);
    }
  }

  // ------ Canvas preview ------

  function updatePreview(index) {
    const preset  = currentPresets[index];
    const box     = document.getElementById(`preview-${index}`);
    const label   = document.getElementById(`preview-label-${index}`);

    if (!box || !label) return;

    const w = preset.width  || 1;
    const h = preset.height || 1;
    const ratio = w / h;

    let displayW, displayH;
    if (ratio >= 1) {
      displayW = MAX_PREVIEW_SIZE;
      displayH = MAX_PREVIEW_SIZE / ratio;
    } else {
      displayH = MAX_PREVIEW_SIZE;
      displayW = MAX_PREVIEW_SIZE * ratio;
    }

    box.style.width  = Math.max(4, displayW) + "px";
    box.style.height = Math.max(4, displayH) + "px";
    label.textContent = `${preset.width || 0} × ${preset.height || 0}`;
  }

  // ------ Save ------

  btnSave.addEventListener("click", () => {
    // Validate
    for (let i = 0; i < currentPresets.length; i++) {
      const p = currentPresets[i];
      if (!p.name.trim()) {
        showToast(browser.i18n.getMessage("errEnterName", String(i + 1)) || `Пресет ${i + 1}: введите название`, "info");
        return;
      }
      if (!p.width || p.width < 1) {
        showToast(browser.i18n.getMessage("errInvalidWidth", String(i + 1)) || `Пресет ${i + 1}: некорректная ширина`, "info");
        return;
      }
      if (!p.height || p.height < 1) {
        showToast(browser.i18n.getMessage("errInvalidHeight", String(i + 1)) || `Пресет ${i + 1}: некорректная высота`, "info");
        return;
      }
    }

    browser.storage.local.set({ presets: currentPresets }).then(() => {
      showToast(browser.i18n.getMessage("toastSaveSuccess") || "✓ Настройки сохранены!", "success");
    });
  });

  // ------ Reset ------

  btnReset.addEventListener("click", () => {
    currentPresets = JSON.parse(JSON.stringify(DEFAULT_PRESETS));
    renderAll();
    showToast(browser.i18n.getMessage("toastReset") || "↩ Пресеты сброшены по умолчанию", "info");
  });

  // ------ Toast ------

  let toastTimer = null;

  function showToast(message, type = "success") {
    toast.textContent = message;
    toast.className = `toast toast--${type} toast--visible`;

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("toast--visible");
    }, 2500);
  }

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

    // Also update document page title
    const docTitle = browser.i18n.getMessage("optionsTitle");
    if (docTitle) {
      document.title = docTitle;
    }
  }
});

// (escapeAttr utility removed as direct properties are now used)

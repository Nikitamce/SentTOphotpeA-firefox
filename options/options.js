// ============================================================
// Send to Photopea — Options Script
// Presets, general settings, UI language override
// ============================================================

const MAX_PREVIEW_SIZE = 44;

document.addEventListener("DOMContentLoaded", function () {
  const grid = document.getElementById("presets-grid");
  const btnSave = document.getElementById("btn-save");
  const btnReset = document.getElementById("btn-reset");
  const btnAdd = document.getElementById("btn-add-preset");
  const presetCount = document.getElementById("preset-count");
  const toast = document.getElementById("toast");
  const headerSubtitle = document.getElementById("header-subtitle");
  const langSelect = document.getElementById("setting-uiLanguage");

  let currentPresets = [];
  let currentSettings = stpCloneDefaultSettings();

  function t(key, subs) {
    return stpT(key, subs) || "";
  }

  function refreshChrome() {
    stpSetDocumentLangAttr();
    stpLocalizeRoot(document);
    headerSubtitle.textContent = "v" + STP.VERSION + " — " +
      (t("optionsHeaderSubtitleShort") || "Extension settings");
    var docTitle = t("optionsTitle");
    if (docTitle) document.title = docTitle;
    // rebuild language option "Auto" label after localize
    if (langSelect) {
      var keep = langSelect.value;
      stpFillLanguageSelect(langSelect, keep || currentSettings.uiLanguage || "auto");
    }
  }

  function applySettingsToForm() {
    var openIn = document.getElementById("setting-openIn");
    var fitMode = document.getElementById("setting-fitMode");
    var canvasFill = document.getElementById("setting-canvasFill");
    var defaultDpi = document.getElementById("setting-defaultDpi");
    var notify = document.getElementById("setting-notifyOnError");
    if (openIn) openIn.value = currentSettings.openIn;
    if (fitMode) fitMode.value = currentSettings.fitMode;
    if (canvasFill) canvasFill.value = currentSettings.canvasFill;
    if (defaultDpi) defaultDpi.value = currentSettings.defaultDpi;
    if (notify) notify.checked = currentSettings.notifyOnError !== false;
    if (langSelect) {
      stpFillLanguageSelect(langSelect, currentSettings.uiLanguage || "auto");
    }
  }

  function readSettingsFromForm() {
    currentSettings = stpNormalizeSettings({
      openIn: document.getElementById("setting-openIn").value,
      fitMode: document.getElementById("setting-fitMode").value,
      canvasFill: document.getElementById("setting-canvasFill").value,
      defaultDpi: parseInt(document.getElementById("setting-defaultDpi").value, 10) || 72,
      notifyOnError: document.getElementById("setting-notifyOnError").checked,
      uiLanguage: langSelect ? langSelect.value : "auto"
    });
  }

  function renderAll() {
    grid.innerHTML = "";
    currentPresets.forEach(function (preset, i) {
      grid.appendChild(createCard(preset, i));
    });
    updateCount();
  }

  function updateCount() {
    presetCount.textContent = currentPresets.length + " / " + STP.MAX_PRESETS;
    btnAdd.disabled = currentPresets.length >= STP.MAX_PRESETS;
  }

  function createCard(preset, index) {
    var template = document.getElementById("preset-card-template");
    var clone = template.content.cloneNode(true);
    var card = clone.querySelector(".preset-editor");

    stpLocalizeRoot(clone);

    if (!preset.enabled) card.classList.add("preset-editor--disabled");

    var inputs = card.querySelectorAll("input");
    inputs.forEach(function (input) { input.dataset.index = index; });

    card.querySelector(".preset-editor__number").textContent =
      t("presetNum", String(index + 1)) || ("Preset " + (index + 1));

    var enabledInput = card.querySelector('[data-field="enabled"]');
    enabledInput.checked = preset.enabled;
    card.querySelector(".toggle__label").textContent = preset.enabled
      ? (t("statusActive") || "Active")
      : (t("statusDisabled") || "Disabled");

    card.querySelector('[data-field="icon"]').value = preset.icon || "🖼";
    card.querySelector('[data-field="name"]').value = preset.name;
    card.querySelector('[data-field="width"]').value = preset.width;
    card.querySelector('[data-field="height"]').value = preset.height;
    card.querySelector('[data-field="dpi"]').value = preset.dpi || 72;

    var previewBoxInner = card.querySelector(".preview-box__inner");
    previewBoxInner.id = "preview-" + index;
    var previewLabel = card.querySelector(".preview-box__label");
    previewLabel.id = "preview-label-" + index;
    previewLabel.textContent = preset.width + " × " + preset.height;

    var removeBtn = card.querySelector('[data-action="remove"]');
    removeBtn.title = t("btnRemovePreset") || "Remove";
    removeBtn.addEventListener("click", function () {
      if (currentPresets.length <= 1) {
        showToast(t("errMinPresets") || "Keep at least one preset", "info");
        return;
      }
      currentPresets.splice(index, 1);
      renderAll();
    });

    inputs.forEach(function (input) {
      var handler = input.type === "checkbox" ? "change" : "input";
      input.addEventListener(handler, onFieldChange);
    });

    requestAnimationFrame(function () { updatePreview(index); });
    return card;
  }

  function onFieldChange(e) {
    var input = e.target;
    var idx = parseInt(input.dataset.index, 10);
    var field = input.dataset.field;
    if (isNaN(idx) || !currentPresets[idx]) return;

    if (field === "enabled") {
      currentPresets[idx].enabled = input.checked;
      var label = input.closest(".toggle").querySelector(".toggle__label");
      label.textContent = input.checked
        ? (t("statusActive") || "Active")
        : (t("statusDisabled") || "Disabled");
      input.closest(".preset-editor").classList.toggle("preset-editor--disabled", !input.checked);
    } else if (field === "name") {
      currentPresets[idx].name = input.value;
    } else if (field === "icon") {
      currentPresets[idx].icon = input.value || "🖼";
    } else if (field === "width") {
      currentPresets[idx].width = parseInt(input.value, 10) || 0;
      updatePreview(idx);
    } else if (field === "height") {
      currentPresets[idx].height = parseInt(input.value, 10) || 0;
      updatePreview(idx);
    } else if (field === "dpi") {
      currentPresets[idx].dpi = parseInt(input.value, 10) || 72;
    }
  }

  function updatePreview(index) {
    var preset = currentPresets[index];
    var box = document.getElementById("preview-" + index);
    var label = document.getElementById("preview-label-" + index);
    if (!box || !label || !preset) return;

    var w = preset.width || 1;
    var h = preset.height || 1;
    var ratio = w / h;
    var displayW, displayH;
    if (ratio >= 1) {
      displayW = MAX_PREVIEW_SIZE;
      displayH = MAX_PREVIEW_SIZE / ratio;
    } else {
      displayH = MAX_PREVIEW_SIZE;
      displayW = MAX_PREVIEW_SIZE * ratio;
    }
    box.style.width = Math.max(4, displayW) + "px";
    box.style.height = Math.max(4, displayH) + "px";
    label.textContent = (preset.width || 0) + " × " + (preset.height || 0);
  }

  // Live language switch — apply immediately and persist
  if (langSelect) {
    langSelect.addEventListener("change", function () {
      var pref = langSelect.value || "auto";
      readSettingsFromForm();
      currentSettings.uiLanguage = pref;
      browser.storage.local.set({ settings: currentSettings }).then(function () {
        return stpI18nInit(pref);
      }).then(function () {
        refreshChrome();
        renderAll();
        showToast(t("toastSaveSuccess") || "✓ Settings saved!", "success");
      });
    });
  }

  document.querySelectorAll("[data-setting]").forEach(function (el) {
    if (el.id === "setting-uiLanguage") return; // handled above
    el.addEventListener("change", function () {
      readSettingsFromForm();
    });
  });

  btnAdd.addEventListener("click", function () {
    if (currentPresets.length >= STP.MAX_PRESETS) return;
    currentPresets.push({
      id: stpNewPresetId(),
      name: t("newPresetName") || "New preset",
      width: 1920,
      height: 1080,
      enabled: true,
      icon: "🖼",
      dpi: currentSettings.defaultDpi || 72
    });
    renderAll();
  });

  btnSave.addEventListener("click", function () {
    readSettingsFromForm();

    for (var i = 0; i < currentPresets.length; i++) {
      var p = currentPresets[i];
      if (!String(p.name || "").trim()) {
        showToast(t("errEnterName", String(i + 1)) || ("Preset " + (i + 1) + ": enter name"), "info");
        return;
      }
      if (!p.width || p.width < 1) {
        showToast(t("errInvalidWidth", String(i + 1)) || ("Preset " + (i + 1) + ": invalid width"), "info");
        return;
      }
      if (!p.height || p.height < 1) {
        showToast(t("errInvalidHeight", String(i + 1)) || ("Preset " + (i + 1) + ": invalid height"), "info");
        return;
      }
      if (!p.dpi || p.dpi < 1) {
        showToast(t("errInvalidDpi", String(i + 1)) || ("Preset " + (i + 1) + ": invalid DPI"), "info");
        return;
      }
      if (!p.id) p.id = stpNewPresetId();
      p.name = String(p.name).trim();
      p.icon = p.icon || "🖼";
    }

    currentPresets = stpNormalizePresets(currentPresets);

    browser.storage.local.set({
      presets: currentPresets,
      settings: currentSettings
    }).then(function () {
      return stpI18nInit(currentSettings.uiLanguage);
    }).then(function () {
      refreshChrome();
      showToast(t("toastSaveSuccess") || "✓ Settings saved!", "success");
    });
  });

  btnReset.addEventListener("click", function () {
    currentPresets = stpCloneDefaultPresets();
    currentSettings = stpCloneDefaultSettings();
    applySettingsToForm();
    stpI18nInit(currentSettings.uiLanguage).then(function () {
      refreshChrome();
      renderAll();
      showToast(t("toastReset") || "↩ Reset to default", "info");
    });
  });

  var toastTimer = null;
  function showToast(message, type) {
    type = type || "success";
    toast.textContent = message;
    toast.className = "toast toast--" + type + " toast--visible";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("toast--visible");
    }, 2500);
  }

  // Boot
  browser.storage.local.get(["presets", "settings"]).then(function (data) {
    currentPresets = stpNormalizePresets(data.presets);
    currentSettings = stpNormalizeSettings(data.settings);
    return stpI18nInit(currentSettings.uiLanguage);
  }).then(function () {
    applySettingsToForm();
    refreshChrome();
    renderAll();
  });
});

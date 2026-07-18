// ============================================================
// Send to Photopea — shared defaults (background, popup, options)
// ============================================================

var STP = {
  VERSION: "1.1",
  MAX_PRESETS: 15,
  MAX_RECENT: 8,
  /** Data URLs longer than this go through Photopea bridge (not URL hash). */
  MAX_HASH_DATA_URL_LENGTH: 1200000,
  PHOTOPEA_ORIGIN: "https://www.photopea.com",

  DEFAULT_SETTINGS: {
    openIn: "newTab",       // newTab | current
    fitMode: "center",      // center | fit | fill | stretch
    canvasFill: "white",    // white | transparent | black
    defaultDpi: 72,
    notifyOnError: true,
    uiLanguage: "auto"      // auto | en | ru | … (see shared/i18n.js)
  },

  DEFAULT_PRESETS: [
    { id: "fullhd",   name: "Full HD",           width: 1920, height: 1080, enabled: true, icon: "🖥", dpi: 72 },
    { id: "ig-post",  name: "Instagram Post",    width: 1080, height: 1080, enabled: true, icon: "📸", dpi: 72 },
    { id: "ig-story", name: "Instagram Story",   width: 1080, height: 1920, enabled: true, icon: "📱", dpi: 72 },
    { id: "a4-300",   name: "A4 (300 DPI)",      width: 2480, height: 3508, enabled: true, icon: "📄", dpi: 300 },
    { id: "yt-thumb", name: "YouTube Thumbnail", width: 1280, height: 720,  enabled: true, icon: "▶️", dpi: 72 }
  ]
};

function stpClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function stpCloneDefaultPresets() {
  return stpClone(STP.DEFAULT_PRESETS);
}

function stpCloneDefaultSettings() {
  return stpClone(STP.DEFAULT_SETTINGS);
}

function stpNewPresetId() {
  return "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function stpNormalizePresets(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return stpCloneDefaultPresets();
  }
  return list.slice(0, STP.MAX_PRESETS).map(function (p, i) {
    return {
      id: p.id || ("legacy_" + i),
      name: String(p.name || "").trim() || ("Preset " + (i + 1)),
      width: Math.max(1, Math.min(30000, parseInt(p.width, 10) || 1)),
      height: Math.max(1, Math.min(30000, parseInt(p.height, 10) || 1)),
      enabled: p.enabled !== false,
      icon: p.icon || "🖼",
      dpi: Math.max(1, Math.min(1200, parseInt(p.dpi, 10) || 72))
    };
  });
}

function stpNormalizeSettings(s) {
  var d = stpCloneDefaultSettings();
  if (!s || typeof s !== "object") return d;
  if (s.openIn === "current" || s.openIn === "newTab") d.openIn = s.openIn;
  if (["center", "fit", "fill", "stretch"].indexOf(s.fitMode) !== -1) d.fitMode = s.fitMode;
  if (["white", "transparent", "black"].indexOf(s.canvasFill) !== -1) d.canvasFill = s.canvasFill;
  if (s.defaultDpi) d.defaultDpi = Math.max(1, Math.min(1200, parseInt(s.defaultDpi, 10) || 72));
  d.notifyOnError = s.notifyOnError !== false;
  if (s.uiLanguage === "auto" || (typeof stpIsValidLocaleCode === "function" && stpIsValidLocaleCode(s.uiLanguage))) {
    d.uiLanguage = s.uiLanguage;
  } else if (s.uiLanguage && typeof s.uiLanguage === "string") {
    // keep auto if unknown code
    d.uiLanguage = "auto";
  }
  return d;
}

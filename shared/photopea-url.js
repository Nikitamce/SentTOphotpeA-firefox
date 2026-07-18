// ============================================================
// Build Photopea hash URLs + canvas placement scripts
// Photopea API extras: app.UI.fitTheArea(), layer.translate(), etc.
// https://www.photopea.com/learn/scripts
// ============================================================

function stpBlackFillScript(fill) {
  if (fill !== "black") return "";
  return [
    "try {",
    "  var __c = new SolidColor();",
    "  __c.rgb.red = 0; __c.rgb.green = 0; __c.rgb.blue = 0;",
    "  app.activeDocument.selection.selectAll();",
    "  app.activeDocument.selection.fill(__c);",
    "  app.activeDocument.selection.deselect();",
    "} catch (__e) {}"
  ].join("\n");
}

function stpSetBackgroundScript(fill) {
  if (fill === "black") {
    return [
      "try {",
      "  app.backgroundColor.rgb.red = 0;",
      "  app.backgroundColor.rgb.green = 0;",
      "  app.backgroundColor.rgb.blue = 0;",
      "} catch (__e) {}"
    ].join("\n");
  }
  if (fill === "transparent") return "";
  return [
    "try {",
    "  app.backgroundColor.rgb.red = 255;",
    "  app.backgroundColor.rgb.green = 255;",
    "  app.backgroundColor.rgb.blue = 255;",
    "} catch (__e) {}"
  ].join("\n");
}

/** Coerce Photopea/PS UnitValue or number to a plain number */
function stpNumHelperJs() {
  return [
    "function __stpN(v) {",
    "  if (v == null) return 0;",
    "  if (typeof v === 'number' && isFinite(v)) return v;",
    "  if (typeof v === 'object') {",
    "    if (typeof v.value === 'number') return v.value;",
    "    if (typeof v.as === 'function') { try { return v.as('px'); } catch(e) {} }",
    "  }",
    "  var p = parseFloat(v);",
    "  return isFinite(p) ? p : 0;",
    "}"
  ].join("\n");
}

/**
 * Get active/current layer (Photopea uses both names in places).
 */
function stpGetLayerHelperJs() {
  return [
    "function __stpLayer(doc) {",
    "  try { if (doc.currentLayer) return doc.currentLayer; } catch(e) {}",
    "  try { if (doc.activeLayer) return doc.activeLayer; } catch(e) {}",
    "  try { if (doc.layers && doc.layers.length) return doc.layers[0]; } catch(e) {}",
    "  return null;",
    "}"
  ].join("\n");
}

/**
 * Unlock layer so translate works (Background is locked).
 */
function stpUnlockLayerScript() {
  return [
    "try {",
    "  var __docU = app.activeDocument;",
    "  var __L = __stpLayer(__docU);",
    "  if (__L) {",
    "    try { if (__L.isBackgroundLayer) __L.isBackgroundLayer = false; } catch (__u1) {}",
    "    try { __L.allLocked = false; } catch (__u2) {}",
    "    try { __L.positionLocked = false; } catch (__u3) {}",
    "    try { __L.transparentPixelsLocked = false; } catch (__u4) {}",
    "  }",
    "} catch (__u) {}"
  ].join("\n");
}

/**
 * Center active layer on the document.
 */
function stpCenterLayerScript() {
  return [
    stpUnlockLayerScript(),
    "try {",
    "  var __doc = app.activeDocument;",
    "  var __layer = __stpLayer(__doc);",
    "  if (__layer) {",
    "    var __b = __layer.bounds;",
    "    var __left = __stpN(__b[0]);",
    "    var __top = __stpN(__b[1]);",
    "    var __right = __stpN(__b[2]);",
    "    var __bottom = __stpN(__b[3]);",
    "    var __lw = __right - __left;",
    "    var __lh = __bottom - __top;",
    "    var __dw = __stpN(__doc.width);",
    "    var __dh = __stpN(__doc.height);",
    "    var __dx = (__dw - __lw) / 2 - __left;",
    "    var __dy = (__dh - __lh) / 2 - __top;",
    "    if (Math.abs(__dx) > 0.5 || Math.abs(__dy) > 0.5) {",
    "      __layer.translate(__dx, __dy);",
    "    }",
    "  }",
    "} catch (__ce) {}"
  ].join("\n");
}

/**
 * Fit the whole canvas into the Photopea viewport.
 * Official API: app.UI.fitTheArea() — https://www.photopea.com/learn/scripts
 */
function stpFitViewScript() {
  return [
    "try { app.UI.fitTheArea(); } catch (__fv0) {}",
    "try { app.UI.fitTheArea(); } catch (__fv1) {}",
    "try {",
    "  if (typeof app.runMenuItem === 'function') {",
    "    try { app.runMenuItem(stringIDToTypeID('fitOnScreen')); } catch (__f1) {}",
    "    try { app.runMenuItem(charIDToTypeID('FtOn')); } catch (__f2) {}",
    "  }",
    "} catch (__fv2) {}"
  ].join("\n");
}

/**
 * Place the already-open image onto a target canvas size.
 * Centers the layer and fits the view (app.UI.fitTheArea).
 */
function stpBuildCanvasPlaceScript(width, height, options) {
  options = options || {};
  var fitMode = options.fitMode || "center";
  var fillMode = options.fill || "white";
  var w = Math.max(1, parseInt(width, 10) || 1920);
  var h = Math.max(1, parseInt(height, 10) || 1080);

  var parts = [];
  parts.push(stpNumHelperJs());
  parts.push(stpGetLayerHelperJs());
  parts.push("if (app.documents.length < 1) { throw 'STP: no document'; }");
  parts.push("var doc = app.activeDocument;");
  parts.push("var tw = " + w + ";");
  parts.push("var th = " + h + ";");
  parts.push(stpSetBackgroundScript(fillMode));
  parts.push(stpUnlockLayerScript());

  if (fitMode === "stretch") {
    parts.push("doc.resizeImage(tw, th);");
    parts.push("try { doc.resizeCanvas(tw, th, AnchorPosition.MIDDLECENTER); } catch(__r1) {");
    parts.push("  try { doc.resizeCanvas(tw, th, 'middlecenter'); } catch(__r1b) { doc.resizeCanvas(tw, th); }");
    parts.push("}");
  } else if (fitMode === "fit") {
    parts.push("var dw = __stpN(doc.width);");
    parts.push("var dh = __stpN(doc.height);");
    parts.push("var s = Math.min(tw / Math.max(1, dw), th / Math.max(1, dh));");
    parts.push("doc.resizeImage(Math.max(1, Math.round(dw * s)), Math.max(1, Math.round(dh * s)));");
    parts.push("try { doc.resizeCanvas(tw, th, AnchorPosition.MIDDLECENTER); } catch(__r2) {");
    parts.push("  try { doc.resizeCanvas(tw, th, 'middlecenter'); } catch(__r2b) { doc.resizeCanvas(tw, th); }");
    parts.push("}");
  } else if (fitMode === "fill") {
    parts.push("var dw = __stpN(doc.width);");
    parts.push("var dh = __stpN(doc.height);");
    parts.push("var s = Math.max(tw / Math.max(1, dw), th / Math.max(1, dh));");
    parts.push("doc.resizeImage(Math.max(1, Math.round(dw * s)), Math.max(1, Math.round(dh * s)));");
    parts.push("try { doc.resizeCanvas(tw, th, AnchorPosition.MIDDLECENTER); } catch(__r3) {");
    parts.push("  try { doc.resizeCanvas(tw, th, 'middlecenter'); } catch(__r3b) { doc.resizeCanvas(tw, th); }");
    parts.push("}");
  } else {
    // center: keep image pixels, expand/crop canvas around center
    parts.push("try { doc.resizeCanvas(tw, th, AnchorPosition.MIDDLECENTER); } catch(__r4) {");
    parts.push("  try { doc.resizeCanvas(tw, th, 'middlecenter'); } catch(__r4b) { doc.resizeCanvas(tw, th); }");
    parts.push("}");
  }

  // Explicit center (works even if anchor ignored)
  parts.push(stpCenterLayerScript());
  // Run center twice — bounds sometimes update after first translate
  parts.push(stpCenterLayerScript());

  if (fillMode === "transparent") {
    parts.push("try { var __lt = __stpLayer(doc); if (__lt) __lt.isBackgroundLayer = false; } catch (__e2) {}");
  }

  // Official Photopea view fit
  parts.push(stpFitViewScript());

  return parts.filter(Boolean).join("\n");
}

/**
 * Copy/paste backup: new document, paste, center, fit view.
 */
function stpBuildCanvasCopyPasteScript(width, height, options) {
  options = options || {};
  var dpi = options.dpi || 72;
  var fitMode = options.fitMode || "center";
  var fillMode = options.fill || "white";
  var w = Math.max(1, parseInt(width, 10) || 1920);
  var h = Math.max(1, parseInt(height, 10) || 1080);

  var scaleBlock;
  if (fitMode === "stretch") {
    scaleBlock = [
      "var doc = app.activeDocument;",
      "var layer = __stpLayer(doc);",
      "var b = layer.bounds;",
      "var lw = Math.max(1, __stpN(b[2]) - __stpN(b[0]));",
      "var lh = Math.max(1, __stpN(b[3]) - __stpN(b[1]));",
      "layer.resize(__stpN(doc.width) / lw * 100, __stpN(doc.height) / lh * 100);",
      "b = layer.bounds;",
      "layer.translate(-__stpN(b[0]), -__stpN(b[1]));"
    ].join("\n");
  } else if (fitMode === "fill" || fitMode === "fit") {
    var useMax = fitMode === "fill";
    scaleBlock = [
      "var doc = app.activeDocument;",
      "var layer = __stpLayer(doc);",
      "var b = layer.bounds;",
      "var lw = Math.max(1, __stpN(b[2]) - __stpN(b[0]));",
      "var lh = Math.max(1, __stpN(b[3]) - __stpN(b[1]));",
      "var sx = __stpN(doc.width) / lw;",
      "var sy = __stpN(doc.height) / lh;",
      "var s = (" + (useMax ? "Math.max" : "Math.min") + "(sx, sy)) * 100;",
      "layer.resize(s, s);",
      "b = layer.bounds;",
      "lw = __stpN(b[2]) - __stpN(b[0]);",
      "lh = __stpN(b[3]) - __stpN(b[1]);",
      "layer.translate((__stpN(doc.width) - lw) / 2 - __stpN(b[0]), (__stpN(doc.height) - lh) / 2 - __stpN(b[1]));"
    ].join("\n");
  } else {
    scaleBlock = stpCenterLayerScript();
  }

  return [
    stpNumHelperJs(),
    stpGetLayerHelperJs(),
    "if (app.documents.length < 1) { throw 'STP: no document'; }",
    "var src = app.activeDocument;",
    "try { src.flatten(); } catch (__f) {}",
    stpUnlockLayerScript(),
    "src.selection.selectAll();",
    "try { src.selection.copy(); } catch (__c1) { try { __stpLayer(src).copy(); } catch (__c2) {} }",
    "app.documents.add(" + w + ", " + h + ", " + dpi + ", 'Canvas');",
    stpBlackFillScript(fillMode),
    "app.activeDocument.paste();",
    stpUnlockLayerScript(),
    scaleBlock,
    stpCenterLayerScript(),
    "for (var __i = app.documents.length - 1; __i >= 0; __i--) {",
    "  try {",
    "    if (app.documents[__i] !== app.activeDocument) {",
    "      app.documents[__i].close(SaveOptions.DONOTSAVECHANGES);",
    "    }",
    "  } catch (__e) {}",
    "}",
    stpFitViewScript()
  ].filter(Boolean).join("\n");
}

function stpBuildOpenUrl(imageUrl, settings) {
  var config = { files: [imageUrl] };
  var env = stpBuildEnvironmentObject(settings);
  if (env) config.environment = env;
  return "https://www.photopea.com#" + encodeURIComponent(JSON.stringify(config));
}

function stpBuildCanvasUrl(imageUrl, width, height, options, settings) {
  var script = stpBuildCanvasPlaceScript(width, height, options);
  var config = { files: [imageUrl], script: script };
  var env = stpBuildEnvironmentObject(settings);
  if (env) config.environment = env;
  return "https://www.photopea.com#" + encodeURIComponent(JSON.stringify(config));
}

function stpBuildBlankUrl(width, height, options, settings) {
  options = options || {};
  var dpi = options.dpi || 72;
  var w = Math.max(1, parseInt(width, 10) || 1920);
  var h = Math.max(1, parseInt(height, 10) || 1080);
  var script = [
    stpNumHelperJs(),
    "app.documents.add(" + w + ", " + h + ", " + dpi + ", 'Canvas');",
    options.fill === "black" ? stpBlackFillScript("black") : "",
    stpFitViewScript()
  ].filter(Boolean).join("\n");
  var config = { script: script };
  var env = stpBuildEnvironmentObject(settings);
  if (env) config.environment = env;
  return "https://www.photopea.com#" + encodeURIComponent(JSON.stringify(config));
}

/**
 * Map extension locale → Photopea environment.lang
 * @see https://www.photopea.com/api/  Environment
 */
function stpPhotopeaLangFromSettings(settings) {
  settings = settings || {};
  var pref = settings.uiLanguage || "auto";
  var loc = "en";
  if (typeof stpResolveLocale === "function") {
    loc = stpResolveLocale(pref);
  } else if (pref && pref !== "auto") {
    loc = pref;
  }
  var map = {
    en: "en",
    zh_CN: "zh",
    hi: "hi",
    es: "es",
    fr: "fr",
    ar: "ar",
    bn: "bn",
    pt_BR: "pt",
    ru: "ru",
    ur: "ur",
    de: "de",
    it: "it",
    ja: "ja",
    ko: "ko",
    tr: "tr"
  };
  return map[loc] || "en";
}

/**
 * environment block: no intro splash, match extension language
 */
function stpBuildEnvironmentObject(settings) {
  return {
    intro: false,
    lang: stpPhotopeaLangFromSettings(settings)
  };
}

/**
 * Start Photopea with environment only (no files) — for ArrayBuffer messaging path
 */
function stpBuildStartUrl(settings) {
  var config = {
    environment: stpBuildEnvironmentObject(settings)
  };
  return "https://www.photopea.com#" + encodeURIComponent(JSON.stringify(config));
}

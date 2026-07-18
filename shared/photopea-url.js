// ============================================================
// Build Photopea hash URLs + canvas placement scripts
// ============================================================

function stpFillEnum(fill) {
  if (fill === "transparent") return '"TRANSPARENT"';
  if (fill === "black") return '"BLACK"';
  return '"WHITE"';
}

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

/**
 * Unlock active layer (Background cannot be translated in PS/Photopea).
 */
function stpUnlockLayerScript() {
  return [
    "try {",
    "  var __L = app.activeDocument.activeLayer;",
    "  try { if (__L.isBackgroundLayer) __L.isBackgroundLayer = false; } catch (__u1) {}",
    "  try { __L.allLocked = false; } catch (__u2) {}",
    "  try { __L.positionLocked = false; } catch (__u3) {}",
    "} catch (__u) {}"
  ].join("\n");
}

/**
 * Center the active layer on the document canvas.
 */
function stpCenterLayerScript() {
  return [
    stpUnlockLayerScript(),
    "try {",
    "  var __doc = app.activeDocument;",
    "  var __layer = __doc.activeLayer;",
    "  var __b = __layer.bounds;",
    "  var __lw = __b[2].value - __b[0].value;",
    "  var __lh = __b[3].value - __b[1].value;",
    "  var __dx = (__doc.width.value - __lw) / 2 - __b[0].value;",
    "  var __dy = (__doc.height.value - __lh) / 2 - __b[1].value;",
    "  if (Math.abs(__dx) > 0.01 || Math.abs(__dy) > 0.01) {",
    "    __layer.translate(__dx, __dy);",
    "  }",
    "} catch (__ce) {}"
  ].join("\n");
}

/**
 * Zoom the view so the whole canvas fits on screen (View → Fit on Screen).
 */
function stpFitViewScript() {
  return [
    "try {",
    "  if (typeof app.runMenuItem === 'function') {",
    "    var __fitOk = false;",
    "    try { app.runMenuItem(stringIDToTypeID('fitOnScreen')); __fitOk = true; } catch (__f1) {}",
    "    if (!__fitOk) { try { app.runMenuItem(charIDToTypeID('FtOn')); __fitOk = true; } catch (__f2) {} }",
    "    if (!__fitOk) { try { app.runMenuItem(stringIDToTypeID('fiton')); } catch (__f3) {} }",
    "  }",
    "} catch (__fv1) {}",
    // Extra fall-backs used by some Photopea builds
    "try { if (app.activeDocument.activeView) app.activeDocument.activeView.zoomToFit(); } catch (__fv2) {}",
    "try { if (typeof app.activeDocument.setZoom === 'function') app.activeDocument.setZoom('fit'); } catch (__fv3) {}"
  ].join("\n");
}

/**
 * Place the already-open image onto a target canvas size.
 * Always centers the layer and fits the view to the screen.
 *
 * fitMode:
 *  - center  : keep pixel size, expand/crop canvas, center image
 *  - fit     : scale to fit inside target, center
 *  - fill    : scale to cover target, center (may crop)
 *  - stretch : force exact target size
 */
function stpBuildCanvasPlaceScript(width, height, options) {
  options = options || {};
  var fitMode = options.fitMode || "center";
  var fillMode = options.fill || "white";
  var w = Math.max(1, parseInt(width, 10) || 1920);
  var h = Math.max(1, parseInt(height, 10) || 1080);

  var parts = [];
  parts.push("if (app.documents.length < 1) { throw 'STP: no document'; }");
  parts.push("var doc = app.activeDocument;");
  parts.push("var tw = " + w + ";");
  parts.push("var th = " + h + ";");
  parts.push(stpSetBackgroundScript(fillMode));
  parts.push(stpUnlockLayerScript());

  if (fitMode === "stretch") {
    parts.push("doc.resizeImage(tw, th);");
    parts.push("try { doc.resizeCanvas(tw, th, 'middlecenter'); } catch(__r1) { doc.resizeCanvas(tw, th); }");
  } else if (fitMode === "fit") {
    parts.push("var dw = doc.width.value;");
    parts.push("var dh = doc.height.value;");
    parts.push("var s = Math.min(tw / Math.max(1, dw), th / Math.max(1, dh));");
    parts.push("doc.resizeImage(Math.max(1, Math.round(dw * s)), Math.max(1, Math.round(dh * s)));");
    parts.push("try { doc.resizeCanvas(tw, th, 'middlecenter'); } catch(__r2) { doc.resizeCanvas(tw, th); }");
  } else if (fitMode === "fill") {
    parts.push("var dw = doc.width.value;");
    parts.push("var dh = doc.height.value;");
    parts.push("var s = Math.max(tw / Math.max(1, dw), th / Math.max(1, dh));");
    parts.push("doc.resizeImage(Math.max(1, Math.round(dw * s)), Math.max(1, Math.round(dh * s)));");
    parts.push("try { doc.resizeCanvas(tw, th, 'middlecenter'); } catch(__r3) { doc.resizeCanvas(tw, th); }");
  } else {
    // center: keep image pixels, change canvas size
    parts.push("try { doc.resizeCanvas(tw, th, 'middlecenter'); } catch(__r4) { doc.resizeCanvas(tw, th); }");
  }

  // Always re-center layer (middlecenter can fail / leave Background top-left)
  parts.push(stpCenterLayerScript());

  if (fillMode === "transparent") {
    parts.push("try { doc.activeLayer.isBackgroundLayer = false; } catch (__e2) {}");
  }

  // Zoom view to show the whole canvas
  parts.push(stpFitViewScript());

  return parts.filter(Boolean).join("\n");
}

/**
 * Copy/paste backup: new document of exact size, paste, center, fit view.
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
      "var layer = doc.activeLayer;",
      "var b = layer.bounds;",
      "var lw = Math.max(1, b[2].value - b[0].value);",
      "var lh = Math.max(1, b[3].value - b[1].value);",
      "layer.resize(doc.width.value / lw * 100, doc.height.value / lh * 100);",
      "b = layer.bounds;",
      "layer.translate(-b[0].value, -b[1].value);"
    ].join("\n");
  } else if (fitMode === "fill" || fitMode === "fit") {
    var useMax = fitMode === "fill";
    scaleBlock = [
      "var doc = app.activeDocument;",
      "var layer = doc.activeLayer;",
      "var b = layer.bounds;",
      "var lw = Math.max(1, b[2].value - b[0].value);",
      "var lh = Math.max(1, b[3].value - b[1].value);",
      "var sx = doc.width.value / lw;",
      "var sy = doc.height.value / lh;",
      "var s = (" + (useMax ? "Math.max" : "Math.min") + "(sx, sy)) * 100;",
      "layer.resize(s, s);",
      "b = layer.bounds;",
      "lw = b[2].value - b[0].value;",
      "lh = b[3].value - b[1].value;",
      "layer.translate((doc.width.value - lw) / 2 - b[0].value, (doc.height.value - lh) / 2 - b[1].value);"
    ].join("\n");
  } else {
    scaleBlock = [
      "var doc = app.activeDocument;",
      "var layer = doc.activeLayer;",
      "var b = layer.bounds;",
      "var lw = b[2].value - b[0].value;",
      "var lh = b[3].value - b[1].value;",
      "layer.translate((doc.width.value - lw) / 2 - b[0].value, (doc.height.value - lh) / 2 - b[1].value);"
    ].join("\n");
  }

  return [
    "if (app.documents.length < 1) { throw 'STP: no document'; }",
    "var src = app.activeDocument;",
    "try { src.flatten(); } catch (__f) {}",
    stpUnlockLayerScript(),
    "src.selection.selectAll();",
    "try { src.selection.copy(); } catch (__c1) { try { src.activeLayer.copy(); } catch (__c2) {} }",
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

function stpBuildOpenUrl(imageUrl) {
  var config = { files: [imageUrl] };
  return "https://www.photopea.com#" + encodeURIComponent(JSON.stringify(config));
}

function stpBuildCanvasUrl(imageUrl, width, height, options) {
  var script = stpBuildCanvasPlaceScript(width, height, options);
  var config = { files: [imageUrl], script: script };
  return "https://www.photopea.com#" + encodeURIComponent(JSON.stringify(config));
}

function stpBuildBlankUrl(width, height, options) {
  options = options || {};
  var dpi = options.dpi || 72;
  var w = Math.max(1, parseInt(width, 10) || 1920);
  var h = Math.max(1, parseInt(height, 10) || 1080);
  var script = [
    "app.documents.add(" + w + ", " + h + ", " + dpi + ", 'Canvas');",
    options.fill === "black" ? stpBlackFillScript("black") : "",
    stpFitViewScript()
  ].filter(Boolean).join("\n");
  return "https://www.photopea.com#" + encodeURIComponent(JSON.stringify({ script: script }));
}

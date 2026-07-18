// ============================================================
// Build Photopea hash URLs + canvas placement scripts
// ============================================================

function stpFillEnum(fill) {
  // Prefer string tokens Photopea accepts in documents.add
  if (fill === "transparent") return '"TRANSPARENT"';
  if (fill === "black") return '"BLACK"';
  return '"WHITE"';
}

function stpBlackFillScript(fill) {
  if (fill !== "black") return "";
  // Fallback if documents.add ignore BLACK
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
  if (fill === "transparent") {
    return ""; // handled via resizeCanvas / new doc
  }
  return [
    "try {",
    "  app.backgroundColor.rgb.red = 255;",
    "  app.backgroundColor.rgb.green = 255;",
    "  app.backgroundColor.rgb.blue = 255;",
    "} catch (__e) {}"
  ].join("\n");
}

/**
 * Place the already-open image onto a target canvas size.
 * Uses resizeImage + resizeCanvas on the current document (no copy/paste race).
 *
 * fitMode:
 *  - center  : keep pixel size, only expand/crop canvas
 *  - fit     : scale to fit inside target, then canvas = target
 *  - fill    : scale to cover target, then canvas = target (may crop)
 *  - stretch : force exact target size (distort)
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

  if (fitMode === "stretch") {
    parts.push("doc.resizeImage(tw, th);");
    parts.push('doc.resizeCanvas(tw, th, "middlecenter");');
  } else if (fitMode === "fit") {
    // scale uniformly to fit inside
    parts.push("var dw = doc.width.value;");
    parts.push("var dh = doc.height.value;");
    parts.push("var s = Math.min(tw / dw, th / dh);");
    parts.push("doc.resizeImage(Math.max(1, Math.round(dw * s)), Math.max(1, Math.round(dh * s)));");
    parts.push('doc.resizeCanvas(tw, th, "middlecenter");');
  } else if (fitMode === "fill") {
    // scale uniformly to cover
    parts.push("var dw = doc.width.value;");
    parts.push("var dh = doc.height.value;");
    parts.push("var s = Math.max(tw / dw, th / dh);");
    parts.push("doc.resizeImage(Math.max(1, Math.round(dw * s)), Math.max(1, Math.round(dh * s)));");
    parts.push('doc.resizeCanvas(tw, th, "middlecenter");');
  } else {
    // center: keep image pixels, change canvas size only
    parts.push('doc.resizeCanvas(tw, th, "middlecenter");');
  }

  // Optional transparent: try to convert background if Photopea supports it
  if (fillMode === "transparent") {
    parts.push("try { doc.layers[doc.layers.length-1].isBackgroundLayer = false; } catch (__e2) {}");
  }

  return parts.filter(Boolean).join("\n");
}

/**
 * Legacy copy/paste into a new document (backup method).
 */
function stpBuildCanvasCopyPasteScript(width, height, options) {
  options = options || {};
  var dpi = options.dpi || 72;
  var fitMode = options.fitMode || "center";
  var fillMode = options.fill || "white";
  var w = Math.max(1, parseInt(width, 10) || 1920);
  var h = Math.max(1, parseInt(height, 10) || 1080);
  var docFill = stpFillEnum(fillMode);

  return [
    "if (app.documents.length < 1) { throw 'STP: no document'; }",
    "var src = app.activeDocument;",
    "try { src.flatten(); } catch (__f) {}",
    "src.selection.selectAll();",
    "try { src.selection.copy(); } catch (__c1) { src.activeLayer.copy(); }",
    // Simple documents.add — Photopea accepts (w,h,res,name)
    "app.documents.add(" + w + ", " + h + ", " + dpi + ", 'Canvas');",
    stpBlackFillScript(fillMode),
    "app.activeDocument.paste();",
    // Scale pasted layer
    (function () {
      if (fitMode === "center") {
        return [
          "var doc = app.activeDocument;",
          "var layer = doc.activeLayer;",
          "var b = layer.bounds;",
          "var lw = b[2].value - b[0].value;",
          "var lh = b[3].value - b[1].value;",
          "var dx = (doc.width.value - lw) / 2 - b[0].value;",
          "var dy = (doc.height.value - lh) / 2 - b[1].value;",
          "layer.translate(dx, dy);"
        ].join("\n");
      }
      if (fitMode === "stretch") {
        return [
          "var doc = app.activeDocument;",
          "var layer = doc.activeLayer;",
          "var b = layer.bounds;",
          "var lw = Math.max(1, b[2].value - b[0].value);",
          "var lh = Math.max(1, b[3].value - b[1].value);",
          "layer.resize(doc.width.value / lw * 100, doc.height.value / lh * 100);",
          "b = layer.bounds;",
          "layer.translate(-b[0].value, -b[1].value);"
        ].join("\n");
      }
      var useMax = fitMode === "fill";
      return [
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
    })(),
    // Close other documents (source image)
    "for (var __i = app.documents.length - 1; __i >= 0; __i--) {",
    "  try {",
    "    if (app.documents[__i] !== app.activeDocument) {",
    "      app.documents[__i].close(SaveOptions.DONOTSAVECHANGES);",
    "    }",
    "  } catch (__e) {}",
    "}"
  ].filter(Boolean).join("\n");
}

function stpBuildOpenUrl(imageUrl) {
  var config = { files: [imageUrl] };
  return "https://www.photopea.com#" + encodeURIComponent(JSON.stringify(config));
}

function stpBuildCanvasUrl(imageUrl, width, height, options) {
  // One-shot: open file then place (Photopea runs script after files load)
  var script = stpBuildCanvasPlaceScript(width, height, options);
  var config = { files: [imageUrl], script: script };
  return "https://www.photopea.com#" + encodeURIComponent(JSON.stringify(config));
}

function stpBuildBlankUrl(width, height, options) {
  options = options || {};
  var dpi = options.dpi || 72;
  var w = Math.max(1, parseInt(width, 10) || 1920);
  var h = Math.max(1, parseInt(height, 10) || 1080);
  // Keep script minimal — works in hash without enums
  var script = "app.documents.add(" + w + ", " + h + ", " + dpi + ", 'Canvas');";
  if (options.fill === "black") {
    script += "\n" + stpBlackFillScript("black");
  }
  return "https://www.photopea.com#" + encodeURIComponent(JSON.stringify({ script: script }));
}

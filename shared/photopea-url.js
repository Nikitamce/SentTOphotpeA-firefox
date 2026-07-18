// ============================================================
// Build Photopea hash URLs for small images (shared helpers)
// ============================================================

function stpFillEnum(fill) {
  if (fill === "transparent") return "DocumentFill.TRANSPARENT";
  // Photopea/PS API has no DocumentFill.BLACK — use WHITE then fill script if needed
  return "DocumentFill.WHITE";
}

function stpBlackFillScript(fill) {
  if (fill !== "black") return "";
  return [
    "var __c = new SolidColor();",
    "__c.rgb.red = 0; __c.rgb.green = 0; __c.rgb.blue = 0;",
    "app.activeDocument.selection.selectAll();",
    "app.activeDocument.selection.fill(__c);",
    "app.activeDocument.selection.deselect();"
  ].join("\n");
}

function stpBuildScaleScript(fitMode) {
  if (!fitMode || fitMode === "center") {
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
      "var sx = doc.width.value / lw * 100;",
      "var sy = doc.height.value / lh * 100;",
      "layer.resize(sx, sy, AnchorPosition.TOPLEFT);",
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
    "layer.resize(s, s, AnchorPosition.TOPLEFT);",
    "b = layer.bounds;",
    "lw = b[2].value - b[0].value;",
    "lh = b[3].value - b[1].value;",
    "var dx = (doc.width.value - lw) / 2 - b[0].value;",
    "var dy = (doc.height.value - lh) / 2 - b[1].value;",
    "layer.translate(dx, dy);"
  ].join("\n");
}

function stpBuildOpenUrl(imageUrl) {
  var config = { files: [imageUrl] };
  return "https://www.photopea.com#" + encodeURIComponent(JSON.stringify(config));
}

function stpBuildCanvasUrl(imageUrl, width, height, options) {
  options = options || {};
  var dpi = options.dpi || 72;
  var fitMode = options.fitMode || "center";
  var fillMode = options.fill || "white";
  var docFill = stpFillEnum(fillMode);
  var script = [
    "var src = app.activeDocument;",
    "src.selection.selectAll();",
    "src.activeLayer.copy();",
    "app.documents.add(" + width + ", " + height + ", " + dpi +
      ", \"Canvas\", NewDocumentMode.RGB, " + docFill + ");",
    stpBlackFillScript(fillMode),
    "app.activeDocument.paste();",
    stpBuildScaleScript(fitMode),
    "src.close(SaveOptions.DONOTSAVECHANGES);"
  ].filter(Boolean).join("\n");

  var config = { files: [imageUrl], script: script };
  return "https://www.photopea.com#" + encodeURIComponent(JSON.stringify(config));
}

function stpBuildBlankUrl(width, height, options) {
  options = options || {};
  var dpi = options.dpi || 72;
  var fillMode = options.fill || "white";
  var docFill = stpFillEnum(fillMode);
  var script = [
    "app.documents.add(" + width + ", " + height + ", " + dpi +
      ", \"Canvas\", NewDocumentMode.RGB, " + docFill + ");",
    stpBlackFillScript(fillMode)
  ].filter(Boolean).join("\n");
  return "https://www.photopea.com#" + encodeURIComponent(JSON.stringify({ script: script }));
}

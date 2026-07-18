// ============================================================
// Photopea page bridge — open large images / run canvas scripts
// without stuffing multi‑MB data URLs into the location hash.
// ============================================================

(function () {
  if (window.__stpPhotopeaBridge) return;
  window.__stpPhotopeaBridge = true;

  function waitForPhotopeaReady(timeoutMs) {
    timeoutMs = timeoutMs || 20000;
    return new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        window.removeEventListener("message", onMessage);
        resolve();
      }
      function onMessage(e) {
        if (e.source !== window) return;
        if (e.data === "done") finish();
      }
      window.addEventListener("message", onMessage);
      // Nudge / probe — Photopea answers with "done" when ready for OE API
      try {
        window.postMessage("app.echoToOE(\"stp\");", "*");
      } catch (e) { /* ignore */ }
      setTimeout(finish, timeoutMs);
    });
  }

  function runScript(script, timeoutMs) {
    timeoutMs = timeoutMs || 60000;
    return new Promise(function (resolve) {
      var finished = false;
      function finish() {
        if (finished) return;
        finished = true;
        window.removeEventListener("message", onMessage);
        resolve();
      }
      function onMessage(e) {
        if (e.source !== window) return;
        if (e.data === "done") finish();
      }
      window.addEventListener("message", onMessage);
      window.postMessage(script, "*");
      setTimeout(finish, timeoutMs);
    });
  }

  function dataUrlToObjectUrl(dataUrl) {
    return fetch(dataUrl)
      .then(function (r) { return r.blob(); })
      .then(function (blob) { return URL.createObjectURL(blob); });
  }

  function fillEnum(fill) {
    if (fill === "transparent") return "DocumentFill.TRANSPARENT";
    return "DocumentFill.WHITE";
  }

  function blackFillScript(fill) {
    if (fill !== "black") return "";
    return [
      "var __c = new SolidColor();",
      "__c.rgb.red = 0; __c.rgb.green = 0; __c.rgb.blue = 0;",
      "app.activeDocument.selection.selectAll();",
      "app.activeDocument.selection.fill(__c);",
      "app.activeDocument.selection.deselect();"
    ].join("\n");
  }

  function buildScaleScript(fitMode) {
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

    // fit | fill
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

  function handlePayload(payload) {
    var dpi = payload.dpi || 72;
    var fillMode = payload.fill || "white";
    var fill = fillEnum(fillMode);
    var fitMode = payload.fitMode || "center";
    var width = payload.width || 1920;
    var height = payload.height || 1080;

    return waitForPhotopeaReady(15000).then(function () {
      if (payload.mode === "blank") {
        var blank = [
          "app.documents.add(" + width + ", " + height + ", " + dpi +
            ", \"Canvas\", NewDocumentMode.RGB, " + fill + ");",
          blackFillScript(fillMode)
        ].filter(Boolean).join("\n");
        return runScript(blank);
      }

      if (!payload.dataUrl) {
        return Promise.resolve();
      }

      return dataUrlToObjectUrl(payload.dataUrl).then(function (objUrl) {
        // Escape for embedding in JS string
        var safeUrl = String(objUrl).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

        if (payload.mode === "open") {
          return runScript('app.open("' + safeUrl + '", null, true);').then(function () {
            try { URL.revokeObjectURL(objUrl); } catch (e) { /* ignore */ }
          });
        }

        // canvas: open image → copy → new doc → paste → scale → close source
        var script = [
          'app.open("' + safeUrl + '", null, true);'
        ].join("\n");

        return runScript(script).then(function () {
          var canvasScript = [
            "var src = app.activeDocument;",
            "src.selection.selectAll();",
            "src.activeLayer.copy();",
            "app.documents.add(" + width + ", " + height + ", " + dpi +
              ", \"Canvas\", NewDocumentMode.RGB, " + fill + ");",
            blackFillScript(fillMode),
            "app.activeDocument.paste();",
            buildScaleScript(fitMode),
            "src.close(SaveOptions.DONOTSAVECHANGES);"
          ].filter(Boolean).join("\n");
          return runScript(canvasScript);
        }).then(function () {
          try { URL.revokeObjectURL(objUrl); } catch (e) { /* ignore */ }
        });
      });
    });
  }

  browser.runtime.onMessage.addListener(function (msg) {
    if (!msg || msg.type !== "stp-photopea-run") return;
    return handlePayload(msg.payload || {}).then(function () {
      return { ok: true };
    }).catch(function (err) {
      return { ok: false, error: String(err && err.message ? err.message : err) };
    });
  });
})();

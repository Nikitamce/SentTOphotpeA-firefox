// ============================================================
// Photopea bridge — open images via ArrayBuffer (OE API),
// then optionally place onto a canvas. Reliable for AMO etc.
// ============================================================

(function () {
  if (window.__stpPhotopeaBridgeV2) return;
  window.__stpPhotopeaBridgeV2 = true;

  function waitForDone(timeoutMs) {
    timeoutMs = timeoutMs || 45000;
    return new Promise(function (resolve) {
      var finished = false;
      function finish() {
        if (finished) return;
        finished = true;
        window.removeEventListener("message", onMessage);
        resolve();
      }
      function onMessage(e) {
        // Photopea posts "done" to the same window for OE API
        if (e.data === "done") finish();
      }
      window.addEventListener("message", onMessage);
      setTimeout(finish, timeoutMs);
    });
  }

  function runScript(script, timeoutMs) {
    var p = waitForDone(timeoutMs || 60000);
    try {
      window.postMessage(script, "*");
    } catch (e) {
      console.warn("STP postMessage script failed", e);
    }
    return p;
  }

  function sendArrayBuffer(buffer, timeoutMs) {
    var p = waitForDone(timeoutMs || 60000);
    try {
      window.postMessage(buffer, "*");
    } catch (e) {
      console.warn("STP postMessage ArrayBuffer failed", e);
    }
    return p;
  }

  function waitUntilPhotopeaAlive(maxMs) {
    maxMs = maxMs || 25000;
    var started = Date.now();

    function attempt() {
      return new Promise(function (resolve) {
        var settled = false;
        function onMessage(e) {
          if (e.data === "done") {
            if (settled) return;
            settled = true;
            window.removeEventListener("message", onMessage);
            resolve(true);
          }
        }
        window.addEventListener("message", onMessage);
        try {
          window.postMessage('app.echoToOE("stp-ping");', "*");
        } catch (e) { /* ignore */ }
        setTimeout(function () {
          if (settled) return;
          settled = true;
          window.removeEventListener("message", onMessage);
          resolve(false);
        }, 900);
      }).then(function (ok) {
        if (ok) return true;
        if (Date.now() - started > maxMs) return false;
        return new Promise(function (r) { setTimeout(r, 400); }).then(attempt);
      });
    }

    return attempt();
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

  function dataUrlToArrayBuffer(dataUrl) {
    var comma = dataUrl.indexOf(",");
    if (comma === -1) return Promise.reject(new Error("bad data URL"));
    var meta = dataUrl.slice(0, comma);
    var data = dataUrl.slice(comma + 1);
    if (meta.indexOf(";base64") !== -1) {
      var binary = atob(data);
      var len = binary.length;
      var bytes = new Uint8Array(len);
      for (var i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
      return Promise.resolve(bytes.buffer);
    }
    var decoded = decodeURIComponent(data);
    var out = new Uint8Array(decoded.length);
    for (var j = 0; j < decoded.length; j++) out[j] = decoded.charCodeAt(j);
    return Promise.resolve(out.buffer);
  }

  function openImageFromPayload(payload) {
    // Prefer ArrayBuffer (official OE API). Fallback: app.open(dataUrl / remote).
    if (payload.arrayBuffer) {
      return sendArrayBuffer(payload.arrayBuffer);
    }
    if (payload.dataUrl) {
      return dataUrlToArrayBuffer(payload.dataUrl).then(function (buf) {
        return sendArrayBuffer(buf);
      }).catch(function () {
        var safe = String(payload.dataUrl).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        return runScript('app.open("' + safe + '", null, true);');
      });
    }
    if (payload.remoteUrl) {
      var r = String(payload.remoteUrl).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      return runScript('app.open("' + r + '", null, true);');
    }
    return Promise.reject(new Error("no image payload"));
  }

  function placeOnCanvas(payload) {
    var dpi = payload.dpi || 72;
    var fillMode = payload.fill || "white";
    var fill = fillEnum(fillMode);
    var fitMode = payload.fitMode || "center";
    var width = payload.width || 1920;
    var height = payload.height || 1080;

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
  }

  function handlePayload(payload) {
    payload = payload || {};
    var dpi = payload.dpi || 72;
    var fillMode = payload.fill || "white";
    var fill = fillEnum(fillMode);
    var width = payload.width || 1920;
    var height = payload.height || 1080;

    return waitUntilPhotopeaAlive(25000).then(function (alive) {
      if (!alive) {
        // still try — Photopea may accept messages without echo
        console.warn("STP: Photopea echo not confirmed, continuing");
      }

      if (payload.mode === "blank") {
        var blank = [
          "app.documents.add(" + width + ", " + height + ", " + dpi +
            ", \"Canvas\", NewDocumentMode.RGB, " + fill + ");",
          blackFillScript(fillMode)
        ].filter(Boolean).join("\n");
        return runScript(blank);
      }

      return openImageFromPayload(payload).then(function () {
        // small pause so activeDocument is the opened image
        return new Promise(function (r) { setTimeout(r, 250); });
      }).then(function () {
        if (payload.mode === "canvas") {
          return placeOnCanvas(payload);
        }
      });
    });
  }

  function loadJobAndRun(jobId) {
    return browser.runtime.sendMessage({ type: "stp-get-job", jobId: jobId })
      .then(function (job) {
        if (!job || !job.payload) throw new Error("job missing");
        return handlePayload(job.payload).then(function (result) {
          browser.runtime.sendMessage({ type: "stp-clear-job", jobId: jobId }).catch(function () {});
          return result;
        });
      });
  }

  browser.runtime.onMessage.addListener(function (msg) {
    if (!msg || !msg.type) return;

    if (msg.type === "stp-photopea-run") {
      // Prefer jobId (large images stay in background memory)
      if (msg.jobId) {
        return loadJobAndRun(msg.jobId).then(function () {
          return { ok: true };
        }).catch(function (err) {
          console.error("STP bridge job failed", err);
          return { ok: false, error: String(err && err.message ? err.message : err) };
        });
      }
      return handlePayload(msg.payload || {}).then(function () {
        return { ok: true };
      }).catch(function (err) {
        return { ok: false, error: String(err && err.message ? err.message : err) };
      });
    }
  });
})();

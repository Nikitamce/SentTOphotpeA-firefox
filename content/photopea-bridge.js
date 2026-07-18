// ============================================================
// Photopea content script — Live Messaging OE bridge
// Docs: https://www.photopea.com/api/  (Live Messaging)
// ============================================================

(function () {
  if (window.__stpBridgeListener) {
    try {
      browser.runtime.onMessage.removeListener(window.__stpBridgeListener);
    } catch (e) { /* ignore */ }
  }

  function waitForDone(timeoutMs) {
    timeoutMs = timeoutMs || 30000;
    return new Promise(function (resolve) {
      var finished = false;
      function finish(ok) {
        if (finished) return;
        finished = true;
        window.removeEventListener("message", onMessage);
        resolve(!!ok);
      }
      function onMessage(e) {
        if (e.data === "done") finish(true);
      }
      window.addEventListener("message", onMessage);
      setTimeout(function () { finish(true); }, timeoutMs);
    });
  }

  function runScript(script, timeoutMs) {
    var p = waitForDone(timeoutMs || 30000);
    try {
      window.postMessage(String(script), "*");
    } catch (e) {
      console.warn("STP postMessage script failed", e);
    }
    return p;
  }

  /**
   * Wait until Photopea is ready (first "done" or successful echo).
   */
  function waitReady(maxMs) {
    maxMs = maxMs || 30000;
    var started = Date.now();

    return new Promise(function (resolve) {
      var finished = false;
      function finish(ok) {
        if (finished) return;
        finished = true;
        window.removeEventListener("message", onMessage);
        resolve(!!ok);
      }
      function onMessage(e) {
        if (e.data === "done") finish(true);
      }
      window.addEventListener("message", onMessage);

      // Photopea sends "done" when ready; also probe
      function probe() {
        if (finished) return;
        try {
          window.postMessage('app.echoToOE("stp-ready");', "*");
        } catch (e) { /* ignore */ }
        if (Date.now() - started > maxMs) {
          finish(true); // try anyway
          return;
        }
        setTimeout(probe, 600);
      }
      setTimeout(probe, 400);
      setTimeout(function () { finish(true); }, maxMs);
    });
  }

  /**
   * Open a binary file in Photopea (ArrayBuffer OE API).
   */
  function openArrayBuffer(buffer, timeoutMs) {
    timeoutMs = timeoutMs || 60000;
    var p = waitForDone(timeoutMs);
    try {
      window.postMessage(buffer, "*");
    } catch (e) {
      console.warn("STP postMessage ArrayBuffer failed", e);
    }
    return p;
  }

  /**
   * Export active document via saveToOE; return ArrayBuffer (or null).
   * Sequence: script → ArrayBuffer message → "done"
   */
  function exportDocument(format, timeoutMs) {
    timeoutMs = timeoutMs || 60000;
    format = format || "png";
    // sanitize format string for Photopea
    if (!/^(png|jpg|jpeg|webp|gif|psd|svg)(:[\d.]+)?$/i.test(format)) {
      format = "png";
    }
    if (format.toLowerCase() === "jpeg") format = "jpg";

    return new Promise(function (resolve) {
      var finished = false;
      var chunks = [];

      function finish(buf) {
        if (finished) return;
        finished = true;
        window.removeEventListener("message", onMessage);
        resolve(buf || null);
      }

      function onMessage(e) {
        if (e.data instanceof ArrayBuffer) {
          chunks.push(e.data);
        } else if (e.data && e.data.buffer instanceof ArrayBuffer && e.data.byteLength != null) {
          // TypedArray
          chunks.push(e.data.buffer.slice(e.data.byteOffset, e.data.byteOffset + e.data.byteLength));
        } else if (e.data === "done") {
          if (chunks.length === 1) {
            finish(chunks[0]);
          } else if (chunks.length > 1) {
            // concatenate
            var total = 0;
            for (var i = 0; i < chunks.length; i++) total += chunks[i].byteLength;
            var out = new Uint8Array(total);
            var off = 0;
            for (var j = 0; j < chunks.length; j++) {
              out.set(new Uint8Array(chunks[j]), off);
              off += chunks[j].byteLength;
            }
            finish(out.buffer);
          } else {
            finish(null);
          }
        }
      }

      window.addEventListener("message", onMessage);
      try {
        window.postMessage('app.activeDocument.saveToOE("' + format + '");', "*");
      } catch (e) {
        finish(null);
        return;
      }
      setTimeout(function () {
        if (!finished) {
          finish(chunks[0] || null);
        }
      }, timeoutMs);
    });
  }

  window.__stpBridgeListener = function (msg) {
    if (!msg || !msg.type) return;

    if (msg.type === "stp-ping" || msg.type === "stp-wait-ready") {
      return waitReady(msg.timeoutMs || 30000).then(function (ok) {
        return { ok: ok };
      });
    }

    if (msg.type === "stp-run-script") {
      return runScript(msg.script, msg.timeoutMs || 30000).then(function () {
        return { ok: true };
      }).catch(function (err) {
        return { ok: false, error: String(err && err.message ? err.message : err) };
      });
    }

    if (msg.type === "stp-open-buffer") {
      var buf = msg.buffer;
      if (!buf) return Promise.resolve({ ok: false, error: "no buffer" });
      return openArrayBuffer(buf, msg.timeoutMs || 60000).then(function () {
        return { ok: true };
      });
    }

    if (msg.type === "stp-export") {
      return exportDocument(msg.format || "png", msg.timeoutMs || 60000).then(function (buffer) {
        if (!buffer) return { ok: false, error: "no export data" };
        return { ok: true, buffer: buffer, format: msg.format || "png" };
      });
    }
  };

  browser.runtime.onMessage.addListener(window.__stpBridgeListener);
  window.__stpPhotopeaBridgeV4 = true;
})();

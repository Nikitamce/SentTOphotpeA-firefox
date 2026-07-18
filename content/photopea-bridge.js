// ============================================================
// Photopea content script — always listen for OE script requests
// ============================================================

(function () {
  // Re-register safely on re-inject
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
      console.warn("STP postMessage failed", e);
    }
    return p;
  }

  function pingReady(timeoutMs) {
    return runScript('app.echoToOE("stp");', timeoutMs || 3000);
  }

  window.__stpBridgeListener = function (msg) {
    if (!msg || !msg.type) return;

    if (msg.type === "stp-ping") {
      return pingReady(3000).then(function () {
        return { ok: true };
      });
    }

    if (msg.type === "stp-run-script") {
      return runScript(msg.script, msg.timeoutMs || 30000).then(function () {
        return { ok: true };
      }).catch(function (err) {
        return { ok: false, error: String(err && err.message ? err.message : err) };
      });
    }

    // Back-compat job runner (optional)
    if (msg.type === "stp-photopea-run") {
      if (msg.jobId) {
        return browser.runtime.sendMessage({ type: "stp-get-job", jobId: msg.jobId })
          .then(function (job) {
            var payload = (job && job.payload) || msg.payload || {};
            var script = payload.script || "";
            if (!script && payload.mode === "canvas" && payload.width) {
              // background should send full script; nothing to do
              return { ok: false, error: "no script in job" };
            }
            if (script) {
              return runScript(script, 30000).then(function () {
                return { ok: true };
              });
            }
            return { ok: false, error: "empty job" };
          });
      }
      if (msg.payload && msg.payload.script) {
        return runScript(msg.payload.script, 30000).then(function () {
          return { ok: true };
        });
      }
    }
  };

  browser.runtime.onMessage.addListener(window.__stpBridgeListener);
  window.__stpPhotopeaBridgeV3 = true;
})();

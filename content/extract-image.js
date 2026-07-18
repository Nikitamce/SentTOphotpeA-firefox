// ============================================================
// Extract image as data URL from the page (content script file)
// Called via executeScript + message or as function export via
// browser.tabs.executeScript({ file }) then sendMessage.
// ============================================================

(function () {
  if (window.__stpExtractInstalled) return;
  window.__stpExtractInstalled = true;

  function pickBestFromSrcset(img) {
    if (!img.srcset) return null;
    var parts = img.srcset.split(",").map(function (chunk) {
      var bits = chunk.trim().split(/\s+/);
      var url = bits[0];
      var desc = bits[1] || "";
      var w = 0;
      if (desc.endsWith("w")) w = parseInt(desc, 10) || 0;
      else if (desc.endsWith("x")) w = (parseFloat(desc) || 1) * 1000;
      return { url: url, w: w };
    }).filter(function (p) { return p.url; });
    if (!parts.length) return null;
    parts.sort(function (a, b) { return b.w - a.w; });
    return parts[0].url;
  }

  function resolveUrl(url) {
    if (!url) return null;
    try {
      return new URL(url, document.baseURI).href;
    } catch (e) {
      return url;
    }
  }

  function findImageElement(targetUrl) {
    var images = Array.prototype.slice.call(document.querySelectorAll("img"));
    var resolvedTarget = resolveUrl(targetUrl);

    var byExact = images.find(function (img) {
      return img.currentSrc === targetUrl ||
        img.src === targetUrl ||
        resolveUrl(img.getAttribute("src")) === resolvedTarget ||
        resolveUrl(img.getAttribute("data-src")) === resolvedTarget ||
        resolveUrl(img.getAttribute("data-lazy-src")) === resolvedTarget;
    });
    if (byExact) return byExact;

    // srcset match
    for (var i = 0; i < images.length; i++) {
      var img = images[i];
      var best = pickBestFromSrcset(img);
      if (best && resolveUrl(best) === resolvedTarget) return img;
      if (img.srcset && img.srcset.indexOf(targetUrl) !== -1) return img;
    }

    // poster on video
    var videos = document.querySelectorAll("video[poster]");
    for (var v = 0; v < videos.length; v++) {
      if (resolveUrl(videos[v].getAttribute("poster")) === resolvedTarget) {
        return videos[v];
      }
    }

    return null;
  }

  function canvasFromImage(img) {
    var w = img.naturalWidth || img.videoWidth || img.width || 0;
    var h = img.naturalHeight || img.videoHeight || img.height || 0;
    if (!w || !h) throw new Error("empty dimensions");
    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL("image/png");
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onloadend = function () { resolve(reader.result); };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsDataURL(blob);
    });
  }

  function fetchAsDataUrl(url) {
    return fetch(url, { credentials: "include", mode: "cors" })
      .then(function (res) {
        if (!res.ok) throw new Error("fetch " + res.status);
        return res.blob();
      })
      .then(blobToDataUrl);
  }

  function extract(targetUrl) {
    return Promise.resolve().then(function () {
      if (!targetUrl) return null;
      if (targetUrl.indexOf("data:") === 0) return targetUrl;

      var el = findImageElement(targetUrl);

      // Prefer highest-res candidate URL
      var candidate = targetUrl;
      if (el && el.tagName === "IMG") {
        candidate =
          el.currentSrc ||
          pickBestFromSrcset(el) ||
          el.getAttribute("data-src") ||
          el.getAttribute("data-lazy-src") ||
          el.src ||
          targetUrl;
        candidate = resolveUrl(candidate) || candidate;
      } else if (el && el.tagName === "VIDEO") {
        candidate = resolveUrl(el.getAttribute("poster")) || targetUrl;
      }

      // Canvas path (works when image is same-origin or CORS-clean)
      if (el && (el.tagName === "IMG" || el.tagName === "VIDEO")) {
        try {
          if (el.tagName === "IMG" && el.complete && (el.naturalWidth || el.width)) {
            return canvasFromImage(el);
          }
        } catch (e) {
          // continue
        }
      }

      return fetchAsDataUrl(candidate).catch(function () {
        if (el && el.tagName === "IMG") {
          try {
            return canvasFromImage(el);
          } catch (e2) {
            return null;
          }
        }
        return null;
      });
    });
  }

  browser.runtime.onMessage.addListener(function (msg) {
    if (!msg || msg.type !== "stp-extract") return;
    return extract(msg.url).then(function (dataUrl) {
      return { ok: !!dataUrl, dataUrl: dataUrl || null };
    });
  });
})();

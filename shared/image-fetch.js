// ============================================================
// Image URL candidates + robust fetch → data URL
//
// Firefox applies CORS even to some extension fetches for
// sites like addons.mozilla.org (response is 200 but body is
// unreadable). We work around that with:
//   1) webRequest response header rewrite (ACAO: *)
//   2) webRequest.filterResponseData (read raw bytes)
// ============================================================

/** URLs we are actively unlocking for CORS / stream capture */
var __stpUnlockUrls = Object.create(null);
var __stpWebRequestReady = false;

function stpImageUrlCandidates(imageUrl) {
  var list = [];
  function add(u) {
    if (!u || typeof u !== "string") return;
    if (list.indexOf(u) === -1) list.push(u);
  }

  add(imageUrl);

  try {
    var u = new URL(imageUrl);
    var host = u.hostname || "";

    if (host === "addons.mozilla.org" || host.endsWith(".addons.mozilla.org")) {
      if (u.pathname.indexOf("/previews/thumbs/") !== -1) {
        var fullPath = u.pathname.replace("/previews/thumbs/", "/previews/full/");
        var baseFull = u.origin + fullPath;
        add(baseFull.replace(/\.jpe?g$/i, ".png") + u.search);
        add(baseFull.replace(/\.png$/i, ".jpg") + u.search);
        add(baseFull + u.search);
        add(baseFull.replace(/\.jpe?g$/i, ".png"));
        add(baseFull.replace(/\.png$/i, ".jpg"));
        add(baseFull);
      }
      if (u.search) {
        add(u.origin + u.pathname);
      }
    }
  } catch (e) {
    /* keep original */
  }

  return list;
}

function stpNormalizeUrlKey(url) {
  try {
    var u = new URL(url);
    // ignore our cache-buster and common modifiers for matching
    u.searchParams.delete("stp_cb");
    u.searchParams.delete("modified");
    return u.origin + u.pathname;
  } catch (e) {
    return String(url || "").split("?")[0].split("#")[0];
  }
}

function stpUrlsLooselyMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return stpNormalizeUrlKey(a) === stpNormalizeUrlKey(b);
}

function stpUnlockUrl(url, ttlMs) {
  ttlMs = ttlMs || 60000;
  var key = stpNormalizeUrlKey(url);
  __stpUnlockUrls[key] = Date.now() + ttlMs;
  // also register exact string for quick checks
  __stpUnlockUrls["exact:" + url] = Date.now() + ttlMs;
}

function stpIsUnlocked(url) {
  var now = Date.now();
  var key = stpNormalizeUrlKey(url);
  if (__stpUnlockUrls[key] && __stpUnlockUrls[key] > now) return true;
  if (__stpUnlockUrls["exact:" + url] && __stpUnlockUrls["exact:" + url] > now) return true;
  // purge expired occasionally
  Object.keys(__stpUnlockUrls).forEach(function (k) {
    if (__stpUnlockUrls[k] <= now) delete __stpUnlockUrls[k];
  });
  return false;
}

/**
 * Install permanent webRequest listeners (call once from background).
 * - Injects Access-Control-Allow-Origin for unlocked URLs (so fetch/Photopea can read)
 * - Does not break other sites (only unlocked URL keys)
 */
function stpInstallWebRequestHelpers() {
  if (__stpWebRequestReady) return;
  if (typeof browser === "undefined" || !browser.webRequest) {
    console.warn("STP: webRequest API unavailable");
    return;
  }
  __stpWebRequestReady = true;

  function onHeadersReceived(details) {
    if (!stpIsUnlocked(details.url)) return {};
    var headers = (details.responseHeaders || []).filter(function (h) {
      var n = (h.name || "").toLowerCase();
      return (
        n !== "access-control-allow-origin" &&
        n !== "access-control-allow-credentials" &&
        n !== "access-control-allow-methods" &&
        n !== "access-control-allow-headers"
      );
    });
    headers.push({ name: "Access-Control-Allow-Origin", value: "*" });
    headers.push({ name: "Access-Control-Allow-Methods", value: "GET, HEAD, OPTIONS" });
    return { responseHeaders: headers };
  }

  try {
    browser.webRequest.onHeadersReceived.addListener(
      onHeadersReceived,
      {
        urls: ["<all_urls>"],
        types: ["image", "imageset", "media", "xmlhttprequest", "other", "object"]
      },
      ["blocking", "responseHeaders"]
    );
  } catch (e) {
    console.warn("STP: failed to install onHeadersReceived", e);
  }
}

function stpBlobToDataUrl(blob) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onloadend = function () {
      if (typeof reader.result === "string" && reader.result.indexOf("data:") === 0) {
        resolve(reader.result);
      } else {
        reject(new Error("FileReader did not return a data URL"));
      }
    };
    reader.onerror = function () {
      reject(reader.error || new Error("FileReader error"));
    };
    reader.readAsDataURL(blob);
  });
}

function stpIsImageBlob(blob) {
  if (!blob) return false;
  if (blob.type && blob.type.indexOf("image/") === 0) return true;
  return blob.size > 32 && (!blob.type || blob.type === "application/octet-stream" || blob.type === "");
}

function stpGuessMimeFromUrl(url) {
  var path = String(url).split("?")[0].toLowerCase();
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".gif")) return "image/gif";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function stpMergeChunks(chunks) {
  var total = 0;
  for (var i = 0; i < chunks.length; i++) total += chunks[i].byteLength || chunks[i].length;
  var out = new Uint8Array(total);
  var offset = 0;
  for (var j = 0; j < chunks.length; j++) {
    var c = chunks[j] instanceof Uint8Array ? chunks[j] : new Uint8Array(chunks[j]);
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/**
 * Capture response body via filterResponseData (bypasses CORS opacity).
 */
function stpFetchViaStreamFilter(url) {
  return new Promise(function (resolve, reject) {
    if (!browser.webRequest || !browser.webRequest.filterResponseData) {
      reject(new Error("filterResponseData unavailable"));
      return;
    }

    stpUnlockUrl(url, 90000);
    var settled = false;
    var timeoutId;
    var listener;

    function finish(err, dataUrl) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      try {
        if (listener) {
          browser.webRequest.onBeforeRequest.removeListener(listener);
        }
      } catch (e) { /* ignore */ }
      if (err) reject(err);
      else resolve(dataUrl);
    }

    timeoutId = setTimeout(function () {
      finish(new Error("stream filter timeout for " + url));
    }, 25000);

    listener = function (details) {
      if (!stpUrlsLooselyMatch(details.url, url) && details.url.indexOf("stp_cb=") === -1) {
        // also accept cache-busted variant of same path
        if (stpNormalizeUrlKey(details.url) !== stpNormalizeUrlKey(url)) {
          return {};
        }
      }

      var filter;
      try {
        filter = browser.webRequest.filterResponseData(details.requestId);
      } catch (e) {
        return {};
      }

      var chunks = [];
      filter.ondata = function (event) {
        chunks.push(new Uint8Array(event.data));
        try {
          filter.write(event.data);
        } catch (e) { /* ignore */ }
      };
      filter.onstop = function () {
        try {
          filter.close();
        } catch (e) { /* ignore */ }
        try {
          var bytes = stpMergeChunks(chunks);
          if (!bytes.byteLength) {
            finish(new Error("empty stream body"));
            return;
          }
          var mime = stpGuessMimeFromUrl(url);
          // sniff magic bytes
          if (bytes[0] === 0x89 && bytes[1] === 0x50) mime = "image/png";
          else if (bytes[0] === 0xff && bytes[1] === 0xd8) mime = "image/jpeg";
          else if (bytes[0] === 0x47 && bytes[1] === 0x49) mime = "image/gif";
          else if (bytes[0] === 0x52 && bytes[1] === 0x49) mime = "image/webp";

          var blob = new Blob([bytes], { type: mime });
          stpBlobToDataUrl(blob).then(
            function (dataUrl) { finish(null, dataUrl); },
            function (err) { finish(err); }
          );
        } catch (err) {
          finish(err);
        }
      };
      filter.onerror = function () {
        try { filter.disconnect(); } catch (e) { /* ignore */ }
        finish(new Error("stream filter error"));
      };

      return {};
    };

    try {
      browser.webRequest.onBeforeRequest.addListener(
        listener,
        { urls: ["<all_urls>"] },
        ["blocking"]
      );
    } catch (e) {
      finish(e);
      return;
    }

    // Trigger a real network request (cache-busted so filter sees it)
    var bust = url + (url.indexOf("?") >= 0 ? "&" : "?") + "stp_cb=" + Date.now();

    // Prefer fetch first (works after ACAO rewrite on same request)
    fetch(bust, { method: "GET", credentials: "omit", cache: "no-store", redirect: "follow" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.blob();
      })
      .then(function (blob) {
        if (blob && blob.size > 32) {
          return stpBlobToDataUrl(blob).then(function (dataUrl) {
            finish(null, dataUrl);
          });
        }
        throw new Error("empty fetch body");
      })
      .catch(function () {
        // Fallback: load as Image (still hits network → filter captures)
        try {
          var img = new Image();
          img.onload = function () {
            // if filter already settled, fine; else try canvas (may taint)
            if (settled) return;
            try {
              var canvas = document.createElement("canvas");
              canvas.width = img.naturalWidth || img.width;
              canvas.height = img.naturalHeight || img.height;
              if (!canvas.width || !canvas.height) return;
              var ctx = canvas.getContext("2d");
              ctx.drawImage(img, 0, 0);
              finish(null, canvas.toDataURL("image/png"));
            } catch (e) {
              // wait for filter onstop
            }
          };
          img.onerror = function () {
            // filter may still succeed independently
          };
          img.src = bust;
        } catch (e) {
          // only filter path left
        }
      });
  });
}

/**
 * Plain fetch (works when host permissions truly bypass CORS).
 */
function stpFetchOneAsDataUrl(url) {
  stpUnlockUrl(url, 60000);
  return fetch(url, {
    method: "GET",
    credentials: "omit",
    cache: "no-store",
    redirect: "follow",
    mode: "cors"
  }).then(function (response) {
    if (!response.ok) throw new Error("HTTP " + response.status + " for " + url);
    return response.blob();
  }).then(function (blob) {
    if (!stpIsImageBlob(blob) && (!blob || blob.size < 32)) {
      throw new Error("empty body for " + url);
    }
    return stpBlobToDataUrl(blob);
  });
}

/**
 * Try candidates: direct fetch → stream filter per URL.
 */
function stpFetchImageDataUrl(imageUrl) {
  if (!imageUrl) return Promise.reject(new Error("no image url"));
  if (imageUrl.indexOf("data:") === 0) return Promise.resolve(imageUrl);
  if (imageUrl.indexOf("blob:") === 0) {
    return Promise.reject(new Error("blob URL not readable from background"));
  }

  stpInstallWebRequestHelpers();

  var candidates = stpImageUrlCandidates(imageUrl);
  var errors = [];

  function tryAt(i) {
    if (i >= candidates.length) {
      return Promise.reject(new Error(
        "All fetch attempts failed (" + candidates.length + "): " + errors.join(" | ")
      ));
    }
    var url = candidates[i];
    stpUnlockUrl(url, 90000);

    return stpFetchOneAsDataUrl(url)
      .catch(function (err1) {
        errors.push("fetch:" + (err1 && err1.message ? err1.message : err1));
        return stpFetchViaStreamFilter(url).catch(function (err2) {
          errors.push("stream:" + (err2 && err2.message ? err2.message : err2));
          return tryAt(i + 1);
        });
      });
  }

  return tryAt(0);
}

function stpDataUrlToArrayBuffer(dataUrl) {
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

/**
 * Unlock a remote URL so Photopea (or us) can fetch it without CORS errors.
 */
function stpUnlockRemoteForPhotopea(url, ttlMs) {
  stpInstallWebRequestHelpers();
  var list = stpImageUrlCandidates(url);
  list.forEach(function (u) { stpUnlockUrl(u, ttlMs || 120000); });
}

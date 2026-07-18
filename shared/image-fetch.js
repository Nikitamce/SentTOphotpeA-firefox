// ============================================================
// Image URL candidates + robust background fetch → data URL
// ============================================================

/**
 * Build ordered list of URLs to try for a context-menu image.
 * AMO thumbs → full PNG/JPG, strip query noise, etc.
 */
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

    // addons.mozilla.org preview thumbs → full-size
    if (host === "addons.mozilla.org" || host.endsWith(".addons.mozilla.org")) {
      if (u.pathname.indexOf("/previews/thumbs/") !== -1) {
        var fullPath = u.pathname.replace("/previews/thumbs/", "/previews/full/");
        var baseFull = u.origin + fullPath;
        // full previews are usually .png even when thumb is .jpg
        add(baseFull.replace(/\.jpe?g$/i, ".png") + u.search);
        add(baseFull.replace(/\.png$/i, ".jpg") + u.search);
        add(baseFull + u.search);
        add(baseFull.replace(/\.jpe?g$/i, ".png"));
        add(baseFull.replace(/\.png$/i, ".jpg"));
        add(baseFull);
      }
      // also try without query string (cache busters)
      if (u.search) {
        add(u.origin + u.pathname);
      }
    }

    // common lazy-load patterns sometimes land in src as tiny placeholder
    // (nothing to do without page DOM)

  } catch (e) {
    // keep original only
  }

  return list;
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
    reader.onerror = function () { reject(reader.error || new Error("FileReader error")); };
    reader.readAsDataURL(blob);
  });
}

function stpIsImageBlob(blob) {
  if (!blob) return false;
  if (blob.type && blob.type.indexOf("image/") === 0) return true;
  // some servers omit content-type; accept non-empty binary
  return blob.size > 32 && (!blob.type || blob.type === "application/octet-stream");
}

/**
 * Fetch one URL as data URL (extension background — ignores page CORS).
 */
function stpFetchOneAsDataUrl(url) {
  return fetch(url, {
    method: "GET",
    credentials: "omit",
    cache: "force-cache",
    redirect: "follow"
  }).then(function (response) {
    if (!response.ok) throw new Error("HTTP " + response.status + " for " + url);
    return response.blob();
  }).then(function (blob) {
    if (!stpIsImageBlob(blob)) {
      // still try — AMO always returns image/*; others may lie
      if (!blob || blob.size < 32) throw new Error("empty body for " + url);
    }
    return stpBlobToDataUrl(blob);
  });
}

/**
 * Try candidates in order until one succeeds.
 */
function stpFetchImageDataUrl(imageUrl) {
  if (!imageUrl) return Promise.reject(new Error("no image url"));
  if (imageUrl.indexOf("data:") === 0) return Promise.resolve(imageUrl);

  // blob: only works in the page that created it — cannot fetch from background
  if (imageUrl.indexOf("blob:") === 0) {
    return Promise.reject(new Error("blob URL not readable from background"));
  }

  var candidates = stpImageUrlCandidates(imageUrl);
  var errors = [];

  function tryAt(i) {
    if (i >= candidates.length) {
      return Promise.reject(new Error(
        "All fetch attempts failed (" + candidates.length + "): " + errors.join(" | ")
      ));
    }
    return stpFetchOneAsDataUrl(candidates[i]).catch(function (err) {
      errors.push(String(err && err.message ? err.message : err));
      return tryAt(i + 1);
    });
  }

  return tryAt(0);
}

function stpDataUrlToArrayBuffer(dataUrl) {
  // data:[<mediatype>][;base64],<data>
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
  // URL-encoded data
  var decoded = decodeURIComponent(data);
  var out = new Uint8Array(decoded.length);
  for (var j = 0; j < decoded.length; j++) out[j] = decoded.charCodeAt(j);
  return Promise.resolve(out.buffer);
}

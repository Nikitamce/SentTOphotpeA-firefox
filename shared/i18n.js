// ============================================================
// Custom i18n — allows UI language override in settings
// (browser.i18n always follows browser locale and cannot be switched)
// ============================================================

var STP_I18N = {
  pref: "auto",
  locale: "en",
  catalog: null,
  enCatalog: null,
  ready: null
};

/** Codes that exist under _locales/ */
var STP_LOCALE_CODES = [
  "en", "zh_CN", "hi", "es", "fr", "ar", "bn", "pt_BR", "ru", "ur",
  "de", "it", "ja", "ko", "tr"
];

/** Native names for the language picker */
var STP_LOCALE_LABELS = {
  en: "English",
  zh_CN: "中文（简体）",
  hi: "हिन्दी",
  es: "Español",
  fr: "Français",
  ar: "العربية",
  bn: "বাংলা",
  pt_BR: "Português (Brasil)",
  ru: "Русский",
  ur: "اردو",
  de: "Deutsch",
  it: "Italiano",
  ja: "日本語",
  ko: "한국어",
  tr: "Türkçe"
};

function stpIsValidLocaleCode(code) {
  return !!code && STP_LOCALE_CODES.indexOf(code) !== -1;
}

/**
 * Map browser UI language (e.g. en-US, zh-CN, pt-BR) to a pack we ship.
 */
function stpDetectBrowserLocale() {
  var ui = "en";
  try {
    ui = browser.i18n.getUILanguage() || "en";
  } catch (e) { /* ignore */ }

  var raw = String(ui).replace(/-/g, "_");
  if (stpIsValidLocaleCode(raw)) return raw;

  var short = raw.split("_")[0].toLowerCase();
  if (short === "zh") return "zh_CN";
  if (short === "pt") return "pt_BR";
  if (stpIsValidLocaleCode(short)) return short;

  // Try case-insensitive match on full list
  var lower = raw.toLowerCase();
  for (var i = 0; i < STP_LOCALE_CODES.length; i++) {
    if (STP_LOCALE_CODES[i].toLowerCase() === lower) return STP_LOCALE_CODES[i];
  }
  return "en";
}

function stpResolveLocale(pref) {
  if (pref && pref !== "auto" && stpIsValidLocaleCode(pref)) return pref;
  return stpDetectBrowserLocale();
}

function stpFetchLocaleCatalog(code) {
  var url = browser.runtime.getURL("_locales/" + code + "/messages.json");
  return fetch(url)
    .then(function (r) {
      if (!r.ok) throw new Error("locale HTTP " + r.status);
      return r.json();
    });
}

function stpFormatI18nMessage(entry, substitutions) {
  if (!entry || typeof entry.message !== "string") return "";
  var msg = entry.message;
  var subs = [];
  if (substitutions == null) {
    subs = [];
  } else if (Array.isArray(substitutions)) {
    subs = substitutions.map(String);
  } else {
    subs = [String(substitutions)];
  }

  // Named placeholders: $name$ → content "$1"
  if (entry.placeholders && typeof entry.placeholders === "object") {
    Object.keys(entry.placeholders).forEach(function (key) {
      var ph = entry.placeholders[key];
      var content = ph && ph.content != null ? String(ph.content) : "";
      var m = content.match(/^\$(\d+)$/);
      var replacement = "";
      if (m) {
        var idx = parseInt(m[1], 10) - 1;
        replacement = subs[idx] != null ? subs[idx] : "";
      }
      msg = msg.replace(new RegExp("\\$" + key + "\\$", "gi"), replacement);
    });
  }

  // Numeric $1 $2 …
  for (var i = 0; i < subs.length; i++) {
    msg = msg.replace(new RegExp("\\$" + (i + 1) + "(?!\\d)", "g"), subs[i]);
  }
  return msg;
}

/**
 * getMessage(key, substitutions?) — same idea as browser.i18n.getMessage
 */
function stpT(key, substitutions) {
  var entry = null;
  if (STP_I18N.catalog && STP_I18N.catalog[key]) entry = STP_I18N.catalog[key];
  else if (STP_I18N.enCatalog && STP_I18N.enCatalog[key]) entry = STP_I18N.enCatalog[key];

  if (entry) {
    var formatted = stpFormatI18nMessage(entry, substitutions);
    if (formatted) return formatted;
  }

  // Last resort: browser pack (browser locale)
  try {
    var native = browser.i18n.getMessage(key, substitutions);
    if (native) return native;
  } catch (e) { /* ignore */ }
  return "";
}

/**
 * Apply data-i18n / data-i18n-title / data-i18n-placeholder on the page.
 */
function stpLocalizeRoot(root) {
  root = root || document;
  root.querySelectorAll("[data-i18n]").forEach(function (el) {
    var text = stpT(el.dataset.i18n);
    if (text) el.textContent = text;
  });
  root.querySelectorAll("[data-i18n-title]").forEach(function (el) {
    var text = stpT(el.dataset.i18nTitle);
    if (text) el.title = text;
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach(function (el) {
    var text = stpT(el.dataset.i18nPlaceholder);
    if (text) el.placeholder = text;
  });
  root.querySelectorAll("option[data-i18n]").forEach(function (el) {
    var text = stpT(el.dataset.i18n);
    if (text) el.textContent = text;
  });
}

function stpSetDocumentLangAttr() {
  try {
    var code = STP_I18N.locale || "en";
    document.documentElement.lang = code.split("_")[0];
    document.documentElement.dir = (code === "ar" || code === "ur") ? "rtl" : "ltr";
  } catch (e) { /* ignore */ }
}

/**
 * Load catalogs for preferred language. Safe to call multiple times.
 * @param {string} [pref]  "auto" or locale code; if omitted, reads from storage
 * @returns {Promise<string>} resolved locale code in use
 */
function stpI18nInit(pref) {
  var loadPref = pref != null
    ? Promise.resolve(pref)
    : browser.storage.local.get("settings").then(function (data) {
        var s = typeof stpNormalizeSettings === "function"
          ? stpNormalizeSettings(data.settings)
          : (data.settings || {});
        return s.uiLanguage || "auto";
      });

  STP_I18N.ready = loadPref.then(function (p) {
    STP_I18N.pref = p || "auto";
    STP_I18N.locale = stpResolveLocale(STP_I18N.pref);

    var needEn = STP_I18N.locale !== "en";
    var tasks = [stpFetchLocaleCatalog(STP_I18N.locale)];
    if (needEn || !STP_I18N.enCatalog) {
      tasks.push(stpFetchLocaleCatalog("en"));
    }

    return Promise.all(tasks.map(function (t) {
      return t.catch(function () { return null; });
    })).then(function (results) {
      var primary = results[0];
      var en = needEn || !STP_I18N.enCatalog ? results[1] : STP_I18N.enCatalog;

      if (!STP_I18N.enCatalog) {
        STP_I18N.enCatalog = en || primary || {};
      } else if (en) {
        STP_I18N.enCatalog = en;
      }

      if (primary) {
        STP_I18N.catalog = primary;
      } else if (STP_I18N.locale !== "en") {
        // fallback load en as primary
        STP_I18N.locale = "en";
        return stpFetchLocaleCatalog("en").then(function (c) {
          STP_I18N.catalog = c || {};
          STP_I18N.enCatalog = c || STP_I18N.enCatalog || {};
          return STP_I18N.locale;
        });
      } else {
        STP_I18N.catalog = STP_I18N.enCatalog || {};
      }
      return STP_I18N.locale;
    });
  });

  return STP_I18N.ready;
}

/**
 * Fill a <select> with Auto + all locales.
 */
function stpFillLanguageSelect(selectEl, selectedPref) {
  if (!selectEl) return;
  var pref = selectedPref || "auto";
  selectEl.innerHTML = "";

  var optAuto = document.createElement("option");
  optAuto.value = "auto";
  optAuto.textContent = stpT("optLangAuto") || "Auto (browser language)";
  selectEl.appendChild(optAuto);

  STP_LOCALE_CODES.forEach(function (code) {
    var opt = document.createElement("option");
    opt.value = code;
    opt.textContent = STP_LOCALE_LABELS[code] || code;
    selectEl.appendChild(opt);
  });

  selectEl.value = (pref === "auto" || stpIsValidLocaleCode(pref)) ? pref : "auto";
}

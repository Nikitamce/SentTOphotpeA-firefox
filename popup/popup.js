// ============================================================
// Send to Photopea — Popup Script
// Clickable presets (blank canvas), recent images, settings
// ============================================================

document.addEventListener("DOMContentLoaded", function () {
  var listEl = document.getElementById("preset-list");
  var recentSection = document.getElementById("recent-section");
  var recentList = document.getElementById("recent-list");
  var btnSettings = document.getElementById("btn-settings");
  var btnOpen = document.getElementById("btn-open-photopea");

  setDocumentLang();
  localizePage();

  browser.storage.local.get(["presets", "recent"]).then(function (data) {
    renderPresets(stpNormalizePresets(data.presets));
    renderRecent(Array.isArray(data.recent) ? data.recent : []);
  });

  btnSettings.addEventListener("click", function () {
    browser.runtime.openOptionsPage();
    window.close();
  });

  btnOpen.addEventListener("click", function () {
    browser.tabs.create({ url: "https://www.photopea.com" });
    window.close();
  });

  function renderPresets(presets) {
    listEl.innerHTML = "";
    var enabled = presets.filter(function (p) { return p.enabled; });

    if (enabled.length === 0) {
      var emptyLi = document.createElement("li");
      emptyLi.className = "presets__empty";
      emptyLi.textContent = browser.i18n.getMessage("emptyPresets") ||
        "No active presets. Open settings to add.";
      listEl.appendChild(emptyLi);
      return;
    }

    var template = document.getElementById("preset-item-template");
    enabled.forEach(function (preset) {
      var clone = template.content.cloneNode(true);
      var li = clone.querySelector(".preset-card");
      li.querySelector(".preset-card__icon").textContent = preset.icon || "🖼";
      li.querySelector(".preset-card__name").textContent = preset.name;
      li.querySelector(".preset-card__dims").textContent =
        preset.width + " × " + preset.height + " px · " + (preset.dpi || 72) + " DPI";

      var action = li.querySelector(".preset-card__action");
      var actionText = browser.i18n.getMessage("popupOpenBlank");
      if (actionText) action.textContent = actionText;

      li.title = browser.i18n.getMessage("popupPresetHint") ||
        "Open blank canvas of this size in Photopea";

      function activate() {
        browser.runtime.sendMessage({
          type: "stp-open-blank-preset",
          width: preset.width,
          height: preset.height,
          dpi: preset.dpi
        }).then(function () { window.close(); });
      }

      li.addEventListener("click", activate);
      li.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      });

      listEl.appendChild(li);
    });
  }

  function renderRecent(recent) {
    recentList.innerHTML = "";
    if (!recent.length) {
      recentSection.hidden = true;
      return;
    }
    recentSection.hidden = false;
    var template = document.getElementById("recent-item-template");

    recent.slice(0, 5).forEach(function (item) {
      var clone = template.content.cloneNode(true);
      var li = clone.querySelector(".preset-card");
      var urlEl = li.querySelector(".recent-card__url");
      var timeEl = li.querySelector(".recent-card__time");
      urlEl.textContent = shortenUrl(item.srcUrl);
      urlEl.title = item.srcUrl;
      timeEl.textContent = formatTime(item.ts);

      function activate() {
        browser.runtime.sendMessage({
          type: "stp-open-recent",
          srcUrl: item.srcUrl
        }).then(function () { window.close(); });
      }

      li.addEventListener("click", activate);
      li.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      });

      recentList.appendChild(li);
    });
  }

  function shortenUrl(url) {
    if (!url) return "";
    if (url.indexOf("data:") === 0) return browser.i18n.getMessage("recentDataImage") || "Embedded image";
    try {
      var u = new URL(url);
      var path = u.pathname.length > 28 ? u.pathname.slice(0, 28) + "…" : u.pathname;
      return u.hostname + path;
    } catch (e) {
      return url.slice(0, 40);
    }
  }

  function formatTime(ts) {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleString();
    } catch (e) {
      return "";
    }
  }

  function setDocumentLang() {
    try {
      var lang = browser.i18n.getUILanguage() || "en";
      document.documentElement.lang = lang.split("-")[0];
    } catch (e) { /* ignore */ }
  }

  function localizePage() {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var text = browser.i18n.getMessage(el.dataset.i18n);
      if (text) el.textContent = text;
    });
    document.querySelectorAll("[data-i18n-title]").forEach(function (el) {
      var text = browser.i18n.getMessage(el.dataset.i18nTitle);
      if (text) el.title = text;
    });
  }
});

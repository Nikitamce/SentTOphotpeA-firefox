// ==UserScript==
// @name            Custom Extensions Panel
// @description     Adds a customizable extensions panel button to the Firefox toolbar with search.
// @author          Antigravity
// @include         main
// @shutdown        UC.customExtensionsPanel.destroy();
// @onlyonce
// ==/UserScript==

UC.customExtensionsPanel = {
  _closedAt: 0,

  PIN_SVG: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M11 2v4.5l1.5 1.5v1H8.5v5.5h-1V9H3v-1L4.5 6.5V2H3V1h10v1H11z"/></svg>',
  TRASH_SVG: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3h11V2h-11v1z"/></svg>',
  GEAR_SVG: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M9.405 1.02c0-.6-.49-1.02-1.02-1.02H7.62c-.53 0-1.02.42-1.02 1.02l-.128.98a6 6 0 0 0-1.637.946l-.914-.403c-.48-.21-1.07 0-1.33.45L2.09 4.394c-.26.45-.12 1.03.32 1.34l.794.57a6 6 0 0 0 0 1.32l-.794.57c-.44.31-.58.89-.32 1.34l.502.87c.26.45.85.66 1.33.45l.914-.403a6 6 0 0 0 1.637.946l.128.98c.067.572.553.987 1.02.987h.765c.467 0 .953-.415 1.02-.987l.128-.98a6 6 0 0 0 1.637-.946l.914.403c.48.21 1.07 0 1.33-.45l.502-.87c.26-.45.12-1.03-.32-1.34l-.794-.57a6 6 0 0 0 0-1.32l.794-.57c.44-.31.58-.89.32-1.34l-.502-.87c-.26-.45-.85-.66-1.33-.45l-.914.403A6 6 0 0 0 9.533 2l-.128-.98zM8 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>',

  init: function () {
    const { CustomizableUI } = window;
    CustomizableUI.createWidget({
      id: 'cep-button',
      type: 'custom',
      defaultArea: CustomizableUI.AREA_NAVBAR,
      onBuild: function (doc) {
        let btn = _uc.createElement(doc, 'toolbarbutton', {
          id: 'cep-button',
          label: 'Custom Extensions Panel',
          tooltiptext: 'Custom Extensions Panel',
          class: 'toolbarbutton-1 chromeclass-toolbar-additional'
        });

        btn.addEventListener('click', function (e) {
          if (e.button == 0) {
            UC.customExtensionsPanel.togglePanel(doc, btn);
          } else if (e.button == 1) {
            doc.defaultView.BrowserAddonUI.openAddonsMgr('addons://list/extension');
          }
        });

        return btn;
      }
    });

    _uc.sss.loadAndRegisterSheet(this.STYLE.url, this.STYLE.type);
  },

  togglePanel: function (doc, anchor) {
    // Защита от повторного открытия при закрытии кликом по той же кнопке
    if (Date.now() - this._closedAt < 300) return;

    let panel = doc.getElementById('cep-panel');
    if (panel && (panel.state == 'open' || panel.state == 'showing')) {
      panel.hidePopup();
      return;
    }

    if (!panel) {
      panel = doc.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul', 'panel');
      panel.id = 'cep-panel';
      panel.setAttribute('type', 'arrow');
      panel.setAttribute('role', 'group');
      panel.addEventListener('popuphidden', () => {
        this._closedAt = Date.now();
      });
      doc.getElementById('mainPopupSet').appendChild(panel);
    }

    this.fillPanel(doc, panel);
    panel.openPopup(anchor, 'after_start', 0, 0, false, false);
  },

  h: function (doc, tag, attrs, children) {
    let el = doc.createElementNS('http://www.w3.org/1999/xhtml', tag);
    if (attrs) {
      for (let [k, v] of Object.entries(attrs)) {
        if (k == 'className') el.className = v;
        else if (k == 'textContent') el.textContent = v;
        else if (k == 'innerHTML') el.innerHTML = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k == 'style' && typeof v == 'object') Object.assign(el.style, v);
        else el.setAttribute(k, v);
      }
    }
    if (children) {
      for (let c of children) {
        if (c) el.appendChild(c);
      }
    }
    return el;
  },

  fillPanel: async function (doc, panel) {
    // Очищаем панель
    while (panel.firstChild) panel.firstChild.remove();

    let win = doc.defaultView;
    let me = UC.customExtensionsPanel;
    let H = (tag, attrs, children) => me.h(doc, tag, attrs, children);

    // Корневой контейнер
    let root = H('div', { className: 'cep-root' });
    panel.appendChild(root);

    // Индикатор загрузки
    let loading = H('div', { className: 'cep-loading', textContent: '⏳ Загрузка расширений...' });
    root.appendChild(loading);

    try {
      let addons = await AddonManager.getAddonsByTypes(['extension']);

      // Если панель уже закрыта — не рисуем
      if (panel.state == 'closed') return;

      // Убираем загрузку
      while (root.firstChild) root.firstChild.remove();

      // Поиск
      let searchInput = H('input', {
        type: 'text',
        className: 'cep-search',
        placeholder: '🔍 Поиск расширений...',
        oninput: function () {
          let q = this.value.toLowerCase();
          root.querySelectorAll('.cep-row').forEach(row => {
            row.style.display = row.dataset.name.includes(q) ? '' : 'none';
          });
          root.querySelectorAll('.cep-section').forEach(sec => {
            let rows = sec.querySelectorAll('.cep-row');
            let anyVisible = false;
            rows.forEach(r => { if (r.style.display !== 'none') anyVisible = true; });
            sec.style.display = anyVisible ? '' : 'none';
          });
        }
      });
      root.appendChild(searchInput);

      // Кнопка настроек
      let topBar = H('div', { className: 'cep-topbar' }, [
        H('span', { className: 'cep-topbar-title', textContent: 'УПРАВЛЕНИЕ' }),
        H('button', {
          className: 'cep-btn',
          title: 'Открыть about:addons',
          innerHTML: me.GEAR_SVG,
          onclick: function () {
            win.BrowserAddonUI.openAddonsMgr('addons://list/extension');
            panel.hidePopup();
          }
        })
      ]);
      root.appendChild(topBar);

      // Фильтрация и сортировка
      let filtered = addons.filter(a => !a.hidden);
      let pinnedState = me.getPinnedState();
      let CUI = window.CustomizableUI;

      let enabledPinned = [], enabledUnpinned = [], disabledList = [];

      for (let addon of filtered) {
        let isPinned = false;
        if (addon.isActive) {
          let widgetId = me.getWidgetId(addon);
          let placement = CUI.getPlacementOfWidget(widgetId);
          isPinned = !!(placement && placement.area == CUI.AREA_NAVBAR);
          pinnedState[addon.id] = isPinned;
        } else {
          isPinned = !!pinnedState[addon.id];
        }
        if (addon.isActive) {
          (isPinned ? enabledPinned : enabledUnpinned).push(addon);
        } else {
          disabledList.push(addon);
        }
      }
      me.setPinnedState(pinnedState);

      let sort = (a, b) => a.name.localeCompare(b.name);
      enabledPinned.sort(sort);
      enabledUnpinned.sort(sort);
      disabledList.sort(sort);

      if (filtered.length == 0) {
        root.appendChild(H('div', { className: 'cep-loading', textContent: 'Нет установленных расширений' }));
        return;
      }

      me.addSection(doc, root, 'Закреплённые', enabledPinned, true);
      me.addSection(doc, root, 'Включенные', enabledUnpinned, false);
      me.addSection(doc, root, 'Отключенные', disabledList, false);

      // Фокус на поиск
      setTimeout(() => { try { searchInput.focus(); } catch (e) { } }, 50);

    } catch (ex) {
      console.error('[Custom Extensions Panel]', ex);
      while (root.firstChild) root.firstChild.remove();
      root.appendChild(H('div', { className: 'cep-loading', textContent: '❌ Ошибка: ' + ex.message }));
    }
  },

  addSection: function (doc, root, title, addons, isPinned) {
    if (!addons.length) return;
    let me = UC.customExtensionsPanel;
    let H = (tag, attrs, children) => me.h(doc, tag, attrs, children);
    let win = doc.defaultView;
    let CUI = window.CustomizableUI;
    let panel = doc.getElementById('cep-panel');

    let section = H('div', { className: 'cep-section' });

    section.appendChild(H('div', { className: 'cep-header' }, [
      H('span', { textContent: title }),
      H('span', { className: 'cep-count', textContent: String(addons.length) })
    ]));

    for (let addon of addons) {
      let row = H('div', { className: 'cep-row' });
      row.dataset.name = addon.name.toLowerCase();

      // Иконка + Название
      let icon = H('img', {
        className: 'cep-icon',
        src: addon.iconURL || 'chrome://mozapps/skin/extensions/extensionGeneric.svg'
      });
      let nameSpan = H('span', { className: 'cep-name', textContent: addon.name });

      if (addon.isActive) {
        // Для активных — кнопка, при клике открывает попап расширения
        let infoBtn = H('button', {
          className: 'cep-info-btn',
          title: 'Открыть попап расширения',
          onclick: function () {
            let widgetId = me.getWidgetId(addon);
            
            // Проверим, закреплена ли кнопка на панели
            let placement = CUI.getPlacementOfWidget(widgetId);
            let isPinned = placement && placement.area === CUI.AREA_NAVBAR;
            
            // Функция эмуляции клика
            let triggerClick = () => {
              let node = doc.getElementById(widgetId);
              if (!node) {
                try {
                  let w = CUI.getWidget(widgetId);
                  if (w) node = w.forWindow(win).node;
                } catch (ex) { }
              }
              
              if (node) {
                // Закрываем нашу панель ТОЛЬКО непосредственно перед кликом
                panel.hidePopup();
                
                setTimeout(() => {
                  let rect = node.getBoundingClientRect();
                  if (rect.width > 0 && rect.height > 0) {
                    try {
                      let x = rect.x + rect.width / 2;
                      let y = rect.y + rect.height / 2;
                      let utils = win.windowUtils;
                      utils.sendMouseEvent('mousedown', x, y, 0, 1, 0);
                      utils.sendMouseEvent('mouseup', x, y, 0, 1, 0);
                    } catch (ex) {
                      try { node.click(); } catch (e) { }
                    }
                  } else {
                    // Если кнопка все же невидима, пробуем обычный клик
                    try { node.click(); } catch (ex) { }
                  }
                }, 50);
                return true;
              }
              return false;
            };

            // Если расширение не закреплено на панели, временно переносим его на панель,
            // кликаем по нему, а затем возвращаем на место
            if (!isPinned) {
              try {
                CUI.addWidgetToArea(widgetId, CUI.AREA_NAVBAR);
                // Даём Firefox 50мс отрендерить кнопку на панели
                setTimeout(() => {
                  let success = triggerClick();
                  // Возвращаем в исходное (удаляем с панели)
                  setTimeout(() => {
                    try { CUI.removeWidgetFromArea(widgetId); } catch (e) { }
                  }, 500);
                  
                  if (!success) {
                    win.BrowserAddonUI.openAddonsMgr('addons://detail/' + encodeURIComponent(addon.id));
                  }
                }, 50);
              } catch (e) {
                panel.hidePopup();
                win.BrowserAddonUI.openAddonsMgr('addons://detail/' + encodeURIComponent(addon.id));
              }
            } else {
              // Если уже закреплено — просто кликаем
              if (!triggerClick()) {
                panel.hidePopup();
                win.BrowserAddonUI.openAddonsMgr('addons://detail/' + encodeURIComponent(addon.id));
              }
            }
          }
        }, [icon, nameSpan]);
        row.appendChild(infoBtn);
      } else {
        // Для отключённых — просто div без клика
        let infoDiv = H('div', { className: 'cep-info' }, [icon, nameSpan]);
        row.appendChild(infoDiv);
      }

      // Пространство для кнопок
      let actions = H('div', { className: 'cep-actions' });

      // Тумблер вкл/выкл
      let cb = H('input', { type: 'checkbox', className: 'cep-toggle' });
      cb.checked = addon.isActive;
      cb.addEventListener('change', async function () {
        try {
          if (cb.checked) await addon.enable();
          else await addon.disable();
        } catch (e) { }
        // Перерисовать панель
        setTimeout(() => {
          if (panel && panel.state == 'open') me.fillPanel(doc, panel);
        }, 100);
      });
      let switchLabel = H('label', { className: 'cep-switch' }, [
        cb,
        H('span', { className: 'cep-slider' })
      ]);
      actions.appendChild(switchLabel);

      // Кнопка пин
      let pinBtn = H('button', {
        className: 'cep-btn' + (isPinned ? ' cep-pinned' : ''),
        title: isPinned ? 'Открепить' : 'Закрепить',
        innerHTML: me.PIN_SVG,
        onclick: function () {
          let state = me.getPinnedState();
          let newPinned = !isPinned;
          state[addon.id] = newPinned;
          me.setPinnedState(state);
          if (addon.isActive) {
            let widgetId = me.getWidgetId(addon);
            try {
              if (newPinned) CUI.addWidgetToArea(widgetId, CUI.AREA_NAVBAR);
              else CUI.removeWidgetFromArea(widgetId);
            } catch (e) { }
          }
          if (panel && panel.state == 'open') me.fillPanel(doc, panel);
        }
      });
      actions.appendChild(pinBtn);

      // Кнопка настроек расширения (если есть optionsURL)
      if (addon.optionsURL) {
        let optBtn = H('button', {
          className: 'cep-btn cep-opt',
          title: 'Настройки расширения',
          innerHTML: me.GEAR_SVG,
          onclick: function () {
            win.BrowserAddonUI.openAddonsMgr('addons://detail/' + encodeURIComponent(addon.id) + '/preferences');
            panel.hidePopup();
          }
        });
        actions.appendChild(optBtn);
      }

      // Кнопка удалить
      let delBtn = H('button', {
        className: 'cep-btn cep-del',
        title: 'Удалить',
        innerHTML: me.TRASH_SVG,
        onclick: async function () {
          if (win.confirm('Удалить расширение «' + addon.name + '»?')) {
            try {
              await addon.uninstall();
              let state = me.getPinnedState();
              delete state[addon.id];
              me.setPinnedState(state);
            } catch (e) { }
            if (panel && panel.state == 'open') me.fillPanel(doc, panel);
          }
        }
      });
      actions.appendChild(delBtn);

      row.appendChild(actions);
      section.appendChild(row);
    }

    root.appendChild(section);
  },

  getWidgetId: function (addon) {
    return addon.id.toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '-browser-action';
  },

  getPinnedState: function () {
    try { return JSON.parse(Services.prefs.getStringPref('extensions.custom_pinned_state')); } catch (e) { return {}; }
  },

  setPinnedState: function (state) {
    try { Services.prefs.setStringPref('extensions.custom_pinned_state', JSON.stringify(state)); } catch (e) { }
  },

  STYLE: {
    url: Services.io.newURI('data:text/css;charset=UTF-8,' + encodeURIComponent(`
      #cep-button {
        list-style-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='context-fill' fill-opacity='context-fill-opacity'><path d='M9 1.5a1.5 1.5 0 0 1 3 0v.75A2.75 2.75 0 0 1 14.75 5h.75a1.5 1.5 0 0 1 0 3h-.75A2.75 2.75 0 0 1 12 10.75v.75a1.5 1.5 0 0 1-3 0v-.75A2.75 2.75 0 0 1 6.25 8h-.75a1.5 1.5 0 0 1 0-3h.75A2.75 2.75 0 0 1 9 2.25V1.5z'/></svg>");
      }
      .cep-root {
        padding: 12px; width: 350px; max-height: 500px; overflow-y: auto;
        display: flex; flex-direction: column; gap: 4px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px; color: var(--panel-description-color, #cdd6f4);
      }
      .cep-loading {
        padding: 24px; text-align: center; font-size: 13px;
        color: var(--panel-description-color, #999);
      }
      .cep-search {
        width: 100%; box-sizing: border-box; padding: 7px 10px;
        border-radius: 6px; border: 1px solid var(--panel-separator-color, #444);
        background: var(--arrowpanel-dimmed, #2a2a3a); color: inherit;
        font-size: 13px; outline: none; margin-bottom: 8px;
      }
      .cep-search:focus {
        border-color: #30b050;
      }
      .cep-topbar {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 4px;
      }
      .cep-topbar-title {
        font-size: 10px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.8px; opacity: 0.6;
      }
      .cep-section { margin-top: 6px; }
      .cep-header {
        font-size: 10px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.8px; opacity: 0.6;
        display: flex; justify-content: space-between; align-items: center;
        padding: 6px 4px 4px; border-bottom: 1px solid var(--panel-separator-color, #444);
      }
      .cep-count {
        font-size: 9px; background: var(--arrowpanel-dimmed, #333);
        padding: 1px 6px; border-radius: 10px; opacity: 0.8;
      }
      .cep-row {
        display: flex; align-items: center; gap: 10px;
        padding: 6px; border-radius: 6px;
      }
      .cep-row:hover { background: var(--arrowpanel-dimmed, #333); }
      .cep-icon { width: 22px; height: 22px; border-radius: 4px; flex-shrink: 0; }
      .cep-info, .cep-info-btn {
        display: flex; align-items: center; gap: 10px;
        flex: 1; min-width: 0; border-radius: 4px; padding: 2px;
      }
      .cep-info-btn {
        background: none; border: none; color: inherit; font: inherit;
        cursor: pointer; text-align: left;
      }
      .cep-info-btn:hover .cep-name { text-decoration: underline; }
      .cep-info-btn:active { opacity: 0.7; }
      .cep-name {
        flex: 1; min-width: 0; white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis; font-weight: 500;
      }
      .cep-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
      .cep-switch {
        position: relative; display: inline-block; width: 34px; height: 18px;
        cursor: pointer;
      }
      .cep-switch input { opacity: 0; width: 0; height: 0; position: absolute; }
      .cep-slider {
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        background: #666; border-radius: 18px; transition: .3s;
      }
      .cep-slider::before {
        content: ""; position: absolute; height: 14px; width: 14px;
        left: 2px; bottom: 2px; background: white; border-radius: 50%;
        transition: .3s; box-shadow: 0 1px 2px rgba(0,0,0,.3);
      }
      .cep-switch input:checked + .cep-slider { background: #30b050; }
      .cep-switch input:checked + .cep-slider::before { transform: translateX(16px); }
      .cep-btn {
        background: none; border: none; cursor: pointer; padding: 4px;
        border-radius: 4px; display: flex; align-items: center; justify-content: center;
        color: inherit; opacity: 0.5; transition: .2s;
      }
      .cep-btn:hover { opacity: 1; background: var(--arrowpanel-dimmed, #333); }
      .cep-btn svg { width: 14px; height: 14px; fill: currentColor; }
      .cep-btn.cep-pinned { opacity: 1; color: #e5c07b; }
      .cep-btn.cep-opt { opacity: 0.4; }
      .cep-btn.cep-opt:hover { opacity: 1; color: #89b4fa; }
      .cep-btn.cep-del:hover { color: #f38ba8; }
    `)),
    type: _uc.sss.USER_SHEET
  },

  destroy: function () {
    Services.wm.getMostRecentBrowserWindow().CustomizableUI.destroyWidget('cep-button');
    _uc.sss.unregisterSheet(this.STYLE.url, this.STYLE.type);
    try {
      let panel = Services.wm.getMostRecentBrowserWindow().document.getElementById('cep-panel');
      if (panel) panel.remove();
    } catch (e) { }
    delete UC.customExtensionsPanel;
  }
};

UC.customExtensionsPanel.init();

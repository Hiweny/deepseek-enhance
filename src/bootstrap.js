/* ============================================================
 * bootstrap：IIFE 外壳 + 运行时桥（油猴 / Android WebView 注入通用）
 * ============================================================ */
(function () {
'use strict';

/* ---------- 运行时探测：GM 可用用油猴，否则回退 localStorage（WebView 注入） ---------- */
var HAS_GM = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
var LS_PREFIX = 'dse_store_';
var lsStore = {};
try { lsStore = JSON.parse(localStorage.getItem('dse_bridge_store') || '{}') || {}; } catch (e) { lsStore = {}; }
function lsFlush() { try { localStorage.setItem('dse_bridge_store', JSON.stringify(lsStore)); } catch (e) {} }

var Bridge = {
  get: function (k, d) {
    if (HAS_GM) { var v = GM_getValue(k, undefined); return (v === undefined || v === null) ? d : v; }
    return (k in lsStore) ? lsStore[k] : d;
  },
  set: function (k, v) {
    if (HAS_GM) return GM_setValue(k, v);
    lsStore[k] = v; lsFlush();
  },
  remove: function (k) {
    if (HAS_GM) { try { GM_deleteValue(k); } catch (e) {} return; }
    delete lsStore[k]; lsFlush();
  },
  list: function () {
    if (HAS_GM) { try { return GM_listValues() || []; } catch (e) { return []; } }
    return Object.keys(lsStore);
  },
  _pendingCss: [],
  _flushScheduled: false,
  _mount: function (css) {
    if (typeof GM_addStyle === 'function') { try { return GM_addStyle(css); } catch (e) {} }
    var host = document.head || document.documentElement;
    if (!host) { this._pendingCss.push(css); this._scheduleFlush(); return null; }
    var s = document.createElement('style');
    s.setAttribute('data-dse', '1');
    s.textContent = css;
    host.appendChild(s);
    return s;
  },
  _scheduleFlush: function () {
    if (this._flushScheduled) return; this._flushScheduled = true;
    var self = this;
    var flush = function () {
      self._flushScheduled = false;
      var host = document.head || document.documentElement;
      if (!host) { self._scheduleFlush(); return; }
      var all = self._pendingCss.slice(); self._pendingCss = [];
      all.forEach(function (css) {
        var s = document.createElement('style');
        s.setAttribute('data-dse', '1'); s.textContent = css; host.appendChild(s);
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', flush);
    else setTimeout(flush, 0);
  },
  addStyle: function (css) { return this._mount(css); },
  hasGM: HAS_GM
};

/* ---------- 全局命名空间 + 极简事件总线 ---------- */
var DSE = window.DSE = {
  version: '8.2.0',
  runtime: HAS_GM ? 'tampermonkey' : 'inject',
  bridge: Bridge,
  modules: {},
  _ev: {},
  on: function (name, fn) { (this._ev[name] = this._ev[name] || []).push(fn); },
  emit: function (name, payload) {
    var list = this._ev[name] || [];
    for (var i = 0; i < list.length; i++) { try { list[i](payload); } catch (e) { console.error('[DSE]', name, e); } }
  }
};

DSE.register = function (name, api) { this.modules[name] = api || {}; };
DSE.log = function () {
  var a = ['[DSE]'].concat([].slice.call(arguments));
  try { console.log.apply(console, a); } catch (e) {}
};

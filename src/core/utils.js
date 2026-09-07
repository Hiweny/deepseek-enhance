/* ============================================================
 * core/utils：通用工具
 * ============================================================ */
var Utils = {
  isMobile: function () { return window.innerWidth < 640; },
  isDark: function () { return document.body && document.body.classList.contains('dark'); },
  currentSid: function () {
    var m = location.pathname.match(/\/a\/chat\/s\/([\w-]+)/);
    return m ? m[1] : '';
  },
  debounce: function (fn, d) {
    var t; return function () {
      var a = arguments, c = this; clearTimeout(t);
      t = setTimeout(function () { fn.apply(c, a); }, d);
    };
  },
  throttle: function (fn, d) {
    var last = 0, timer;
    return function () {
      var now = Date.now(), a = arguments, c = this, rest = d - (now - last);
      if (rest <= 0) { last = now; fn.apply(c, a); }
      else { clearTimeout(timer); timer = setTimeout(function () { last = Date.now(); fn.apply(c, a); }, rest); }
    };
  },
  rafThrottle: function (fn) {
    var q = false;
    return function () {
      var a = arguments, c = this;
      if (q) return; q = true;
      requestAnimationFrame(function () { q = false; fn.apply(c, a); });
    };
  },
  onReady: function (cb) {
    if (document.body) cb();
    else document.addEventListener('DOMContentLoaded', cb);
  },
  // 轮询等待
  waitFor: function (fn, timeout, interval) {
    return new Promise(function (resolve) {
      timeout = timeout || 15000; interval = interval || 150;
      var t0 = Date.now();
      (function tick() {
        var r;
        try { r = fn(); } catch (e) { r = null; }
        if (r) return resolve(r);
        if (Date.now() - t0 > timeout) return resolve(null);
        setTimeout(tick, interval);
      })();
    });
  },
  estimateTokens: function (text) {
    if (!text) return 0;
    var cn = (text.match(/[一-鿿]/g) || []).length;
    var en = text.length - cn;
    return Math.ceil(cn * 1.4 + en / 3.6);
  },
  escHtml: function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },
  // 简易 hash（用于消息幂等键）
  hash: function (str) {
    var h = 0; str = String(str || '');
    for (var i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
    return (h >>> 0).toString(36);
  },
  rand: function (a, b) { return a + Math.random() * (b - a); },
  toast: function (msg, ms) {
    var t = document.getElementById('dse-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'dse-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'dse-toast-show' + (Utils.isDark() ? ' dse-toast-dark' : '');
    clearTimeout(t._tid);
    t._tid = setTimeout(function () { t.className = t.className.replace('dse-toast-show', '').trim(); }, ms || 2000);
  },
  // 派发可信点击（React 受控元素需要完整事件序列）
  realClick: function (el) {
    if (!el) return;
    var opts = { bubbles: true, cancelable: true, view: window, button: 0 };
    try {
      el.dispatchEvent(new PointerEvent('pointerdown', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new PointerEvent('pointerup', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
    } catch (e) { el.click(); }
  },
  // 主题变化监听
  onThemeChange: function (cb) {
    new MutationObserver(function () { cb(Utils.isDark()); })
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
};
DSE.utils = Utils;
DSE.register('utils', Utils);

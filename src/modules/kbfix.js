/* ============================================================
 * modules/kbfix：全屏时让输入框贴住屏幕软键盘上沿
 *  - 浏览器全屏（requestFullscreen / F11）下，官网自带的键盘处理会失效：
 *    layout viewport 不变、visualViewport 缩小，输入卡被键盘盖住
 *  - 用 visualViewport 的缩小量反推键盘高度，只在该状态下把页面底部垫高
 * ============================================================ */
var KbFix = {
  _kb: 0,
  measure: function () {
    var vv = window.visualViewport;
    if (!vv) return 0;
    var kb = window.innerHeight - vv.height - (vv.offsetTop || 0);
    return kb > 48 ? Math.round(kb) : 0;
  },
  apply: function () {
    var root = document.documentElement;
    if (!root) return;
    var kb = this.measure();
    var full = !!document.fullscreenElement;
    // 全屏态才接管；非全屏交给官网自己的键盘逻辑，避免叠加
    if (full && kb > 0) {
      if (kb !== this._kb) {
        this._kb = kb;
        root.style.setProperty('--dse-kb', kb + 'px');
        root.classList.add('dse-kb-on');
        // 输入卡所在滚动区滚到底，保证光标行可见
        try {
          var sc = document.querySelector('.ds-virtual-list');
          if (sc) sc.scrollTop = sc.scrollHeight;
        } catch (e) {}
      }
    } else if (this._kb) {
      this._kb = 0;
      root.style.removeProperty('--dse-kb');
      root.classList.remove('dse-kb-on');
    }
  },
  init: function () {
    var self = this;
    try {
      Bridge.addStyle('html.dse-kb-on body{padding-bottom:var(--dse-kb,0px)!important;transition:padding-bottom .18s ease}');
    } catch (e) {}
    var vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', function () { self.apply(); });
      vv.addEventListener('scroll', function () { self.apply(); });
    }
    document.addEventListener('fullscreenchange', function () { setTimeout(function () { self.apply(); }, 60); });
    window.addEventListener('resize', function () { self.apply(); });
    // 键盘动画期间补几次采样
    document.addEventListener('focusin', function (e) {
      var t = e.target;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) {
        [80, 200, 380, 600].forEach(function (d) { setTimeout(function () { self.apply(); }, d); });
      }
    }, true);
    document.addEventListener('focusout', function () {
      [60, 180].forEach(function (d) { setTimeout(function () { self.apply(); }, d); });
    }, true);
  }
};
DSE.modules.kbFix = KbFix;

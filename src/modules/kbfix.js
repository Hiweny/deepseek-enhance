/* ============================================================
 * modules/kbfix：软键盘弹起时，让输入卡贴住键盘上沿
 *  - 全屏（requestFullscreen / 浏览器沉浸模式）下，官网自带的键盘抬升会失效：
 *    layout viewport 不变、visualViewport 缩小，输入卡被键盘盖住
 *  - 不猜键盘高度，直接量「输入卡下沿」与「visualViewport 下沿」的差，按差值平移，
 *    官网已经抬起时差值为 0 → 不重复顶起
 * ============================================================ */
var KbFix = {
  _applied: false,
  _el: null,
  findCard: function () {
    var c = document.querySelector('.aaff8b8f');
    if (c) return c;
    // 兜底：官网改类名时，取页面里最后一个 contenteditable 的最近 sticky/fixed 祖先
    var ed = document.querySelector('[contenteditable="true"]');
    if (!ed) return null;
    var p = ed;
    for (var i = 0; i < 10 && p; i++) {
      var pos = getComputedStyle(p).position;
      if (pos === 'sticky' || pos === 'fixed') return p;
      p = p.parentElement;
    }
    return ed;
  },
  reset: function () {
    if (!this._el) return;
    this._el.style.removeProperty('transform');
    this._el.style.removeProperty('transition');
    this._applied = false;
  },
  apply: function () {
    var vv = window.visualViewport;
    if (!vv) return;
    // 键盘没弹（视口高度基本等于布局高度）就什么都不做
    var kbGuess = window.innerHeight - (vv.height + (vv.offsetTop || 0));
    var el = this.findCard();
    if (!el) return;
    if (this._el && this._el !== el) this.reset();
    this._el = el;

    if (this._applied) this.reset();

    var vvBottom = vv.height + (vv.offsetTop || 0);
    var r = el.getBoundingClientRect();
    var overlap = Math.round(r.bottom - vvBottom);

    if (overlap > 6 || kbGuess > 90 && overlap > 0) {
      el.style.setProperty('transition', 'transform .16s ease', 'important');
      el.style.setProperty('transform', 'translateY(-' + overlap + 'px)', 'important');
      this._applied = true;
      try {
        var sc = document.querySelector('.ds-virtual-list');
        if (sc) sc.scrollTop = sc.scrollHeight;
      } catch (e) {}
    }
  },
  init: function () {
    var self = this;
    var vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', function () { self.apply(); });
      vv.addEventListener('scroll', function () { self.apply(); });
    }
    document.addEventListener('fullscreenchange', function () { setTimeout(function () { self.apply(); }, 60); });
    window.addEventListener('resize', function () { self.apply(); });
    window.addEventListener('orientationchange', function () { setTimeout(function () { self.apply(); }, 260); });
    // 键盘动画期间多点采样：只按差值平移，重复调用是幂等的
    var burst = function () {
      [60, 160, 280, 420, 600, 800].forEach(function (d) { setTimeout(function () { self.apply(); }, d); });
    };
    document.addEventListener('focusin', function (e) {
      var t = e.target;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable)) burst();
    }, true);
    document.addEventListener('focusout', function () {
      [40, 140, 300].forEach(function (d) { setTimeout(function () { self.apply(); }, d); });
    }, true);
  }
};
DSE.modules.kbFix = KbFix;

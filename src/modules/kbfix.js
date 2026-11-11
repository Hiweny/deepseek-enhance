/* ============================================================
 * modules/kbfix：软键盘弹起时，让输入卡下沿贴住键盘上沿
 *  - 全屏/沉浸模式下官网自带的键盘抬升会失效：layout viewport 不变、
 *    visualViewport 缩小，输入卡被键盘盖住
 *  - 不猜键盘高度：直接量「输入卡下沿 - visualViewport 下沿」的差值，
 *    按差值累计平移（收敛式，不复位 → 不会来回闪）
 *  - 仅在键盘确实弹起时接管；官网已对齐（|差值| ≤ 2px）则不动
 * ============================================================ */
var KbFix = {
  _ty: 0,
  _el: null,
  findCard: function () {
    var c = document.querySelector('.aaff8b8f');
    if (c) return c;
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
    if (!this._el) { this._ty = 0; return; }
    this._el.style.removeProperty('transform');
    this._el.style.removeProperty('transition');
    this._ty = 0;
  },
  apply: function () {
    var vv = window.visualViewport;
    if (!vv) return;
    var el = this.findCard();
    if (!el) return;
    if (this._el && this._el !== el) this.reset();
    this._el = el;

    var vvBottom = vv.height + (vv.offsetTop || 0);
    var kb = window.innerHeight - vvBottom;
    // 键盘没弹（或只缩了地址栏）→ 不接管，也不留下位移
    if (kb <= 80) { if (this._ty) this.reset(); return; }

    var r = el.getBoundingClientRect();
    var overlap = Math.round(r.bottom - vvBottom);   // r 已包含当前位移
    if (Math.abs(overlap) <= 2) return;              // 已贴住，什么都不做

    var next = this._ty - overlap;
    if (Math.abs(next) > 600) return;                // 异常值不处理
    var delta = Math.abs(next - this._ty);

    // 大步位移才加过渡；小步微调直接落，避免反复触发动画
    el.style.setProperty('transition', delta > 6 ? 'transform .14s ease' : 'none', 'important');
    el.style.setProperty('transform', 'translateY(' + next + 'px)', 'important');
    this._ty = next;
    // 只在"被键盘压住较多"时贴底一次，避免每次采样都滚一下造成抖动
    if (overlap > 10) {
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
    window.addEventListener('orientationchange', function () { self.reset(); setTimeout(function () { self.apply(); }, 260); });
    // 键盘动画期间采样：收敛式，重复调用只会越来越贴近
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

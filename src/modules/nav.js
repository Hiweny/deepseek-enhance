/* ============================================================
 * modules/nav：消息上/下导航（保留原版能力，适配新选择器与移动端）
 * ============================================================ */
var Nav = {
  list: [], idx: -1, bar: null,
  USER_SEL: '.ds-message:not(:has(.ds-markdown))',
  AI_SEL: '.ds-message:has(.ds-markdown)',
  scan: function () {
    var out = [];
    document.querySelectorAll(this.USER_SEL + ',' + this.AI_SEL).forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      out.push({ el: el, y: r.top + window.scrollY });
    });
    out.sort(function (a, b) { return a.y - b.y; });
    this.list = out;
  },
  visualIndex: function () {
    var center = window.scrollY + innerHeight / 2, best = -1, bd = Infinity;
    this.list.forEach(function (m, i) {
      var r = m.el.getBoundingClientRect(), c = window.scrollY + r.top + r.height / 2;
      if (Math.abs(center - c) < bd) { bd = Math.abs(center - c); best = i; }
    });
    return best;
  },
  scrollParent: function (el) {
    var p = el.parentElement;
    while (p) {
      var s = getComputedStyle(p);
      if (p.scrollHeight > p.clientHeight && /(auto|scroll)/.test(s.overflowY)) return p;
      p = p.parentElement;
    }
    return document.documentElement;
  },
  goto: function (dir) {
    this.scan();
    if (!this.list.length) return;
    var vi = this.visualIndex();
    if (this.idx < 0 || Math.abs(vi - this.idx) > 2) this.idx = vi;
    this.idx += dir === 'prev' ? -1 : 1;
    this.idx = Math.max(0, Math.min(this.list.length - 1, this.idx));
    var m = this.list[this.idx]; if (!m) return;
    var sp = this.scrollParent(m.el), r = m.el.getBoundingClientRect(), pr = sp.getBoundingClientRect();
    var top = r.top - pr.top + (sp === document.documentElement ? window.scrollY : sp.scrollTop) - sp.clientHeight * 0.3;
    sp.scrollTo({ top: top, behavior: 'smooth' });
    var self = this;
    m.el.classList.remove('dse-nav-flash'); void m.el.offsetWidth; m.el.classList.add('dse-nav-flash');
    setTimeout(function () { m.el.classList.remove('dse-nav-flash'); }, 1500);
  },
  ensure: function () {
    if (this.bar) return;
    this.bar = document.createElement('div'); this.bar.id = 'dse-nav';
    this.bar.innerHTML =
      '<button data-n="prev" title="上一条消息"><svg viewBox="0 0 20 20"><path d="M9.3 5.7a1 1 0 0 1 1.4 0l5.8 5.7a1 1 0 0 1-1.4 1.5L10 7.8l-5 5a1 1 0 1 1-1.5-1.4z"/></svg></button>' +
      '<button data-n="next" title="下一条消息"><svg viewBox="0 0 20 20" style="transform:rotate(180deg)"><path d="M9.3 5.7a1 1 0 0 1 1.4 0l5.8 5.7a1 1 0 0 1-1.4 1.5L10 7.8l-5 5a1 1 0 1 1-1.5-1.4z"/></svg></button>';
    var self = this;
    this.bar.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (b) self.goto(b.getAttribute('data-n'));
    });
    document.body.appendChild(this.bar);
  },
  init: function () {
    var self = this;
    Utils.onReady(function () {
      var sync = function () { self.ensure(); self.bar.style.display = DSE.config.get('navButtons') ? '' : 'none'; };
      sync(); setInterval(sync, 1500);
      DSE.on('cfg:change', sync);
    });
  }
};
DSE.modules.nav = Nav;

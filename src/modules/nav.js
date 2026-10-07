/* ============================================================
 * modules/nav：消息上/下导航（适配官网虚拟列表，issue #3 修复）
 *
 * 旧实现用 window.scrollY 计算位置，但官网消息区是【内层滚动容器】
 * （.ds-virtual-list.ds-scroll-area），window 根本不滚动 → 定位必然错乱。
 * 新实现：
 *   - 统一取真实滚动容器；
 *   - 按 .ds-message 在【滚动内容坐标】里的偏移判断当前消息；
 *   - 目标消息若尚未挂载（虚拟列表），先滚一屏触发加载再重试；
 *   - 定位用容器 scrollTo，绝不动 window，避免触发站点滚动复位。
 * ============================================================ */
var Nav = {
  bar: null, busy: false, lastDir: 1,

  container: function () {
    var el = document.querySelector('.ds-virtual-list.ds-scroll-area') || document.querySelector('.ds-virtual-list');
    if (el && el.scrollHeight > el.clientHeight) return el;
    var node = document.querySelector('.ds-virtual-list-visible-items') || document.querySelector('.ds-message');
    var p = node ? (node.parentElement || null) : null;
    while (p) {
      var cs = getComputedStyle(p);
      if (p.scrollHeight > p.clientHeight + 4 && /(auto|scroll)/.test(cs.overflowY)) return p;
      p = p.parentElement;
    }
    return el || null;
  },

  rows: function () {
    var out = [];
    var nodes = document.querySelectorAll('.ds-message');
    for (var i = 0; i < nodes.length; i++) {
      var r = nodes[i].getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      out.push(nodes[i]);
    }
    return out; // DOM 顺序 = 视觉顺序
  },

  // 元素相对“滚动内容顶部”的偏移
  offsetIn: function (el, sc) {
    var r = el.getBoundingClientRect(), sr = sc.getBoundingClientRect();
    return r.top - sr.top + sc.scrollTop;
  },

  currentIndex: function (rows, sc) {
    var st = sc.scrollTop, best = 0, bd = Infinity;
    for (var i = 0; i < rows.length; i++) {
      var d = Math.abs(this.offsetIn(rows[i], sc) - st);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  },

  fire: function (el, behavior) {
    var sc = this.container();
    if (!sc || !el) return;
    // 目标消息顶部对齐到视口顶部（留 8px 余量），保证“当前消息”判定稳定
    var top = Math.max(0, this.offsetIn(el, sc) - 8);
    try { sc.scrollTo({ top: top, behavior: behavior || 'auto' }); }
    catch (e) { sc.scrollTop = top; }
    this.flash(el);
  },

  flash: function (el) {
    if (!el || !el.classList) return;
    el.classList.remove('dse-nav-flash'); void el.offsetWidth; el.classList.add('dse-nav-flash');
    clearTimeout(el._dseNavT);
    el._dseNavT = setTimeout(function () { el.classList.remove('dse-nav-flash'); }, 1500);
  },

  goto: function (dir) {
    var sc = this.container();
    if (!sc) return;
    this.lastDir = dir === 'prev' ? -1 : 1;
    var rows = this.rows();
    if (!rows.length) return;
    var cur = this.currentIndex(rows, sc);
    var target = cur + this.lastDir;

    if (target >= 0 && target < rows.length) { this.fire(rows[target]); return; }

    // 边界：可能有未挂载的历史/新消息，先滚一屏触发加载再重试
    if (this.busy) return;
    var self = this;
    this.busy = true;
    var step = sc.clientHeight * 0.9;
    try { sc.scrollBy({ top: this.lastDir * step, behavior: 'auto' }); }
    catch (e) { sc.scrollTop = Math.max(0, sc.scrollTop + this.lastDir * step); }
    setTimeout(function () {
      self.busy = false;
      var rows2 = self.rows();
      var cur2 = self.currentIndex(rows2, sc);
      var t2 = cur2 + self.lastDir;
      if (t2 >= 0 && t2 < rows2.length) self.fire(rows2[t2], 'auto');
    }, 460);
  },

  ensure: function () {
    if (this.bar) return;
    this.bar = document.createElement('div'); this.bar.id = 'dse-nav';
    this.bar.innerHTML =
      '<button data-n="prev" title="' + DSE.t('上一条消息') + '"><svg viewBox="0 0 20 20"><path d="M9.3 5.7a1 1 0 0 1 1.4 0l5.8 5.7a1 1 0 0 1-1.4 1.5L10 7.8l-5 5a1 1 0 1 1-1.5-1.4z"/></svg></button>' +
      '<button data-n="next" title="' + DSE.t('下一条消息') + '"><svg viewBox="0 0 20 20" style="transform:rotate(180deg)"><path d="M9.3 5.7a1 1 0 0 1 1.4 0l5.8 5.7a1 1 0 0 1-1.4 1.5L10 7.8l-5 5a1 1 0 1 1-1.5-1.4z"/></svg></button>';
    var self = this;
    this.bar.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (b) self.goto(b.getAttribute('data-n'));
    });
    document.body.appendChild(this.bar);
  },

  sync: function () {
    if (!this.bar) return;
    var on = !!DSE.config.get('navButtons');
    this.bar.style.display = on ? '' : 'none';
    this.bar.querySelectorAll('button').forEach(function (b) {
      b.title = DSE.t(b.getAttribute('data-n') === 'prev' ? '上一条消息' : '下一条消息');
    });
  },

  init: function () {
    var self = this;
    Utils.onReady(function () {
      self.ensure(); self.sync();
      setInterval(function () { self.ensure(); self.sync(); }, 1500);
      DSE.on('cfg:change', function (e) { if (e.path === 'navButtons') self.sync(); });
      DSE.on('lang:change', function () { self.sync(); });
    });
  }
};
DSE.modules.nav = Nav;

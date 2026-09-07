/* ============================================================
 * modules/latex：KaTeX 公式渲染（官网默认不渲染 \( \)、\[ \]、$...$）
 *  - KaTeX 离线内联（vendor/katex.bundle.js），无外部请求
 *  - 流式输出防抖增量渲染；已渲染节点跳过，不破坏代码块/mermaid
 *  - 受 latexRender 开关控制
 * ============================================================ */
var Latex = {
  cssInjected: false,
  timer: null,
  pending: new Set(),

  DELIMITERS: [
    { left: '$$', right: '$$', display: true },
    { left: '\\[', right: '\\]', display: true },
    { left: '\\(', right: '\\)', display: false },
    { left: '$', right: '$', display: false }
  ],

  injectCss: function () {
    if (this.cssInjected || !(window.DSEKatex && DSEKatex.css)) return;
    Bridge.addStyle(DSEKatex.css + `
      /* 与气泡/Markdown 融合的细节修正 */
      .ds-markdown .katex{font-size:1.02em}
      .ds-markdown .katex-display{margin:.6em 0;overflow-x:auto;overflow-y:hidden;padding:2px 0}
      .ds-markdown .katex-display::-webkit-scrollbar{height:4px}
      .katex-display>.katex{white-space:nowrap}
      .ds-think-content .katex{font-size:.96em}
      body.dark .katex{color:inherit}
      /* 公式解析失败时的原始文本弱化，不显示刺眼红字 */
      .katex .color-cc0000,.katex-error{color:var(--dse-text-2)!important}
    `);
    this.cssInjected = true;
  },

  hasMath: function (el) {
    if (!el || this.processedSame(el)) return false;
    var t = el.textContent || '';
    return t.indexOf('\\(') !== -1 || t.indexOf('\\[') !== -1 ||
           t.indexOf('$$') !== -1 || (t.indexOf('$') !== -1 && t.indexOf('$', t.indexOf('$') + 1) !== -1);
  },
  processedSame: function (el) {
    // 文本没变化就不重复渲染
    var sig = (el.textContent || '').length + ':' + (el.querySelectorAll('.katex').length);
    if (el.getAttribute('data-dse-tex-sig') === sig) return true;
    el.setAttribute('data-dse-tex-sig', sig);
    return false;
  },

  renderEl: function (el) {
    if (!window.DSEKatex || typeof DSEKatex.render !== 'function') return;
    try {
      DSEKatex.render(el, {
        delimiters: this.DELIMITERS,
        throwOnError: false,
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
        ignoredClasses: ['katex', 'mermaid']
      });
    } catch (e) {}
  },

  schedule: function (root) {
    if (!DSE.config.get('latexRender')) return;
    this.injectCss();
    var self = this;
    if (root) this.pending.add(root);
    clearTimeout(this.timer);
    this.timer = setTimeout(function () { self.flush(); }, 260);
  },
  flush: function () {
    var self = this;
    var roots = this.pending.size ? this.pending : null;
    this.pending = new Set();
    var els;
    if (roots) {
      els = [];
      roots.forEach(function (r) {
        if (!r || !r.isConnected) return;
        if (r.matches && r.matches('.ds-markdown')) els.push(r);
        els.push.apply(els, r.querySelectorAll('.ds-markdown'));
      });
    } else {
      els = document.querySelectorAll('.ds-markdown');
    }
    els.forEach(function (el) {
      if (self.hasMath(el)) self.renderEl(el);
    });
  },
  renderAll: function () {
    if (!DSE.config.get('latexRender')) return;
    this.injectCss();
    var self = this;
    document.querySelectorAll('.ds-markdown').forEach(function (el) {
      if (self.hasMath(el)) self.renderEl(el);
    });
  },

  init: function () {
    var self = this;
    Utils.onReady(function () {
      self.injectCss();
      self.renderAll();
      var touch = function (host) {
        if (!host || host.nodeType !== 1 || !host.closest || host.closest('.katex')) return;
        var md = host.closest('.ds-markdown');
        if (md) self.schedule(md);
      };
      var mo = new MutationObserver(function (muts) {
        if (!DSE.config.get('latexRender')) return;
        for (var i = 0; i < muts.length; i++) {
          var mu = muts[i];
          if (mu.type === 'childList') {
            // 新增的 markdown 容器（虚拟列表挂载）及其内部节点都要覆盖
            for (var j = 0; j < mu.addedNodes.length; j++) {
              var an = mu.addedNodes[j];
              var ah = an && an.nodeType === 3 ? an.parentElement : an;
              touch(ah);
              if (ah && ah.querySelectorAll) ah.querySelectorAll('.ds-markdown').forEach(function (m) { self.schedule(m); });
            }
            touch(mu.target);
          } else { // characterData：文本流式追加
            touch(mu.target && mu.target.nodeType === 3 ? mu.target.parentElement : mu.target);
          }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    DSE.on('cfg:change', function (e) {
      if (e.path === 'latexRender') {
        if (DSE.config.get('latexRender')) self.renderAll();
        else location.reload();
      }
    });
  }
};
DSE.modules.latex = Latex;

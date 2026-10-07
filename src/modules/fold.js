/* ============================================================
 * modules/fold：代码块自动折叠（issue #5）
 *  - 官网原生结构：.md-code-block > .md-code-block-banner-wrap(语言/复制/下载) + pre>span*
 *  - 仅对 .md-code-block 自身的 pre 设 max-height 做裁剪，并用一个自建按钮切换，
 *    绝不移动/包裹官网节点，原生「复制 / 下载」按钮完全不受影响。
 *  - 裁剪用 max-height+overflow，属纯样式层，不改 DOM 结构，避免虚拟列表重算导致跳动/闪烁。
 *  - 幂等：块上记 data-dse-fold="N:state"，行数配置变化时自动重算。
 * ============================================================ */
var Fold = {
  ICON: '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M9.3 5.7a1 1 0 0 1 1.4 0l5.8 5.7a1 1 0 0 1-1.4 1.5L10 7.8l-5 5a1 1 0 1 1-1.5-1.4z"/></svg>',

  preOf: function (block) {
    var kids = block.children, out = null;
    for (var i = 0; i < kids.length; i++) if (kids[i].tagName === 'PRE') out = kids[i];
    return out;
  },

  // 代码块实际行数（优先按行节点数，退化到换行符）
  lineCount: function (pre) {
    var spans = pre.querySelectorAll(':scope > span');
    if (spans.length) return spans.length;
    var t = pre.textContent || '';
    return t ? t.split('\n').length : 0;
  },

  metrics: function (pre) {
    var cs = getComputedStyle(pre);
    var lh = parseFloat(cs.lineHeight);
    if (!lh || isNaN(lh)) lh = (parseFloat(cs.fontSize) || 13) * 1.55;
    var pt = parseFloat(cs.paddingTop) || 0, pb = parseFloat(cs.paddingBottom) || 0;
    return { lh: lh, pad: pt + pb };
  },

  ensureCtrl: function (block) {
    var ctrl = block.querySelector(':scope > .dse-code-fold');
    if (!ctrl) {
      ctrl = document.createElement('div');
      ctrl.className = 'dse-code-fold';
      ctrl.setAttribute('role', 'button');
      ctrl.setAttribute('tabindex', '0');
      ctrl.innerHTML = this.ICON + '<span class="dse-code-fold-t"></span>';
      block.appendChild(ctrl);
    }
    return ctrl;
  },

  // 让折叠条背景/文字与代码区一致（同色融合，深浅自适应）
  paint: function (block, pre) {
    var ctrl = block.querySelector(':scope > .dse-code-fold');
    if (!ctrl || !pre) return;
    var bg = getComputedStyle(pre).backgroundColor || '';
    ctrl.style.background = (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') ? bg : 'transparent';
    ctrl.style.setProperty('--dse-fold-bg', ctrl.style.background);
    var m = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(bg);
    if (m) {
      var lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
      ctrl.style.color = lum < 0.5 ? 'rgba(226,232,240,.72)' : 'rgba(55,65,81,.78)';
      ctrl.style.borderTopColor = lum < 0.5 ? 'rgba(255,255,255,.09)' : 'rgba(0,0,0,.07)';
    }
  },

  setLabel: function (block, collapsed) {
    var ctrl = block.querySelector(':scope > .dse-code-fold');
    if (!ctrl) return;
    var t = ctrl.querySelector('.dse-code-fold-t');
    if (t) t.textContent = collapsed ? DSE.t('展开') : DSE.t('收起');
    block.classList.toggle('dse-code-collapsed', collapsed);
    block.classList.toggle('dse-code-expanded', !collapsed);
  },

  apply: function (block) {
    if (!DSE.config.get('codeFold')) { this.reset(block); return; }
    var pre = this.preOf(block);
    if (!pre) return;
    var N = Math.max(1, Number(DSE.config.get('codeFoldLines')) || 10);
    var sig = block.getAttribute('data-dse-fold') || '';
    var state = sig.split(':')[1] || '';
    var m = this.metrics(pre);
    var maxH = m.lh * N + m.pad;
    var foldable = pre.scrollHeight > maxH + 2;

    if (!foldable) {
      // 已不需要折叠：清掉残留样式与按钮（自愈，防止站点重渲染后残留）
      if (state && state !== 'none') { this.reset(block); block.setAttribute('data-dse-fold', N + ':none'); }
      else if (block.querySelector(':scope > .dse-code-fold') || pre.style.maxHeight) { this.reset(block); block.setAttribute('data-dse-fold', N + ':none'); }
      return;
    }

    // 需要折叠：每次扫描都重设一次（幂等，站点重渲染清掉后能自愈）
    this.ensureCtrl(block);
    this.paint(block, pre);
    var collapsed = state !== 'expanded';
    pre.style.maxHeight = collapsed ? maxH + 'px' : '';
    pre.style.overflowY = collapsed ? 'hidden' : '';
    this.setLabel(block, collapsed);
    block.setAttribute('data-dse-fold', N + ':' + (collapsed ? 'collapsed' : 'expanded'));
  },

  reset: function (block) {
    var pre = this.preOf(block);
    if (pre) { pre.style.maxHeight = ''; pre.style.overflowY = ''; }
    var ctrl = block.querySelector(':scope > .dse-code-fold');
    if (ctrl) ctrl.remove();
    block.classList.remove('dse-code-collapsed', 'dse-code-expanded');
  },

  toggle: function (block) {
    var pre = this.preOf(block);
    if (!pre) return;
    var N = Math.max(1, Number(DSE.config.get('codeFoldLines')) || 10);
    var collapsed = block.classList.contains('dse-code-collapsed');
    var m = this.metrics(pre);
    if (collapsed) {
      pre.style.maxHeight = ''; pre.style.overflowY = '';
      this.setLabel(block, false);
      block.setAttribute('data-dse-fold', N + ':expanded');
    } else {
      pre.style.maxHeight = Math.round(m.lh * N + m.pad) + 'px';
      pre.style.overflowY = 'hidden';
      this.setLabel(block, true);
      block.setAttribute('data-dse-fold', N + ':collapsed');
    }
  },

  rafQ: false,
  request: function () {
    if (this.rafQ) return; this.rafQ = true;
    var self = this;
    requestAnimationFrame(function () { self.rafQ = false; self.scan(); });
  },
  scan: function () {
    var blocks = document.querySelectorAll('.md-code-block');
    for (var i = 0; i < blocks.length; i++) {
      try { this.apply(blocks[i]); } catch (e) {}
    }
  },

  init: function () {
    var self = this;
    Utils.onReady(function () {
      self.scan();
      new MutationObserver(Utils.debounce(function () { self.request(); }, 220))
        .observe(document.body, { childList: true, subtree: true, characterData: true });
      document.addEventListener('click', function (e) {
        var c = e.target.closest && e.target.closest('.dse-code-fold');
        if (!c) return;
        var block = c.closest('.md-code-block');
        if (!block || !block.contains(c)) return;
        e.preventDefault(); e.stopPropagation();
        self.toggle(block);
      }, true);
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var c = e.target.closest && e.target.closest('.dse-code-fold');
        if (!c) return;
        var block = c.closest('.md-code-block');
        if (block) { e.preventDefault(); self.toggle(block); }
      });
    });
    DSE.on('cfg:change', function (e) {
      if (e.path === 'codeFold' || e.path === 'codeFoldLines') self.request();
    });
    DSE.on('lang:change', function () { self.scanLabels(); });
  },
  scanLabels: function () {
    var blocks = document.querySelectorAll('.md-code-block.dse-code-collapsed, .md-code-block.dse-code-expanded');
    for (var i = 0; i < blocks.length; i++) this.setLabel(blocks[i], blocks[i].classList.contains('dse-code-collapsed'));
  }
};
DSE.modules.fold = Fold;

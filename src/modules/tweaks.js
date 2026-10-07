/* ============================================================
 * modules/tweaks：UI 细节
 *  - 只隐藏移动欢迎页“下载应用”本体（保留新建对话/展开侧栏等其它按钮）
 *  - 隐藏“内容由 AI 生成”标识；顶栏统一、输入框磨砂（样式见 tweaks.css）
 * 性能：改为“只扫新增子树 + 低频轻量对账”，不再每次全量遍历 div/span/p
 *      （长对话下全量扫描是滚动卡顿/抖动的诱因之一）。
 * ============================================================ */
var Tweaks = {
  pending: [],
  syncBodyClasses: function () {
    var c = DSE.config;
    document.body.classList.toggle('dse-hide-badge', !!c.get('hideAiBadge'));
    document.body.classList.toggle('dse-input-frosted', !!c.get('inputFrosted'));
    document.body.classList.toggle('dse-fix-topbar', !!c.get('fixTopbar'));
    document.body.classList.toggle('dse-topbar-frosted', !!c.get('fixTopbar') && c.get('topbarStyle') !== 'transparent');
    document.body.classList.toggle('dse-topbar-transparent', !!c.get('fixTopbar') && c.get('topbarStyle') === 'transparent');
    document.body.classList.toggle('dse-md-pretty', !!c.get('markdownPretty'));
  },
  // 精确命中“下载应用”：只标记最小命中元素，绝不标记 .the-header / 按钮容器
  hideDownloadApp: function () {
    if (!DSE.config.get('hideDownloadApp')) return;
    if (Utils.currentSid()) return; // 仅欢迎页
    var re = /^\s*下载\s*(应用|APP|App)\s*$/;
    // 兜底：清掉历史版本误标在 header 上的隐藏标记
    document.querySelectorAll('.the-header[data-dse-hide]').forEach(function (h) { h.removeAttribute('data-dse-hide'); });
    var cands = document.querySelectorAll('._9579690');
    if (!cands.length) {
      var hdr = document.querySelector('.the-header');
      cands = hdr ? hdr.querySelectorAll('[class*="ds-button"], button, [role="button"]') : [];
    }
    for (var i = 0; i < cands.length; i++) {
      var n = cands[i];
      if (n.classList.contains('the-header')) continue;
      if (re.test(n.textContent || '') && (n.textContent || '').length < 16 && n.querySelector('[role="button"],button')) {
        n.setAttribute('data-dse-hide', '1');
      }
    }
  },
  hideAiBadgeTextIn: function (root) {
    if (!DSE.config.get('hideAiBadge')) return;
    if (!root || root.nodeType !== 1) return;
    if (root.closest && root.closest('#dse-panel')) return;
    var re = /内容由\s*AI\s*生成|由\s*AI\s*生成|AI\s*generated/i;
    var nodes = (root.matches && root.matches('div,span,p')) ? [root] : [];
    var list = root.querySelectorAll ? root.querySelectorAll('div,span,p') : [];
    for (var i = 0; i < list.length; i++) nodes.push(list[i]);
    for (var j = 0; j < nodes.length; j++) {
      var n = nodes[j];
      if (n.getAttribute('data-dse-hide')) continue;
      if (n.closest && n.closest('#dse-panel')) continue;
      if (n.children.length > 2) continue;
      var t = (n.textContent || '').trim();
      if (t && t.length < 30 && re.test(t)) n.setAttribute('data-dse-hide', '1');
    }
  },
  scan: function () {
    this.syncBodyClasses();
    this.hideDownloadApp();
  },
  // 滚动期间暂停扫描：虚拟列表在滚动/加载历史时对主线程时序敏感，
  // 任何额外同步工作都可能让站点锚定晚一拍，表现为“视觉跳变”。
  _lastScroll: 0,
  isScrolling: function () { return this._lastScroll && (Date.now() - this._lastScroll) < 240; },
  flushPending: function () {
    if (this.isScrolling()) { this._recheck(); return; }
    var roots = this.pending; this.pending = [];
    this.scan();
    for (var i = 0; i < roots.length; i++) this.hideAiBadgeTextIn(roots[i]);
  },
  _recheck: function () {
    if (this._q2) return; this._q2 = true;
    var self = this;
    setTimeout(function () { self._q2 = false; if (self.pending.length) self.flushPending(); }, 260);
  },
  init: function () {
    var self = this;
    Utils.onReady(function () {
      self.scan();
      // 首帧全量对账一次（覆盖脚本注入前已存在的节点）
      self.hideAiBadgeTextIn(document.body);
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var an = muts[i].addedNodes;
          for (var j = 0; j < an.length; j++) { if (an[j].nodeType === 1) self.pending.push(an[j]); }
        }
        if (self.pending.length) {
          if (self.pending.length > 200) self.pending = [document.body];
          if (!self._q) { self._q = true; requestAnimationFrame(function () { self._q = false; self.flushPending(); }); }
        }
      }).observe(document.body, { childList: true, subtree: true });
      // 轻量对账（只切类名 + 定向查询），低频，且滚动期间跳过
      setInterval(function () { if (!self.isScrolling()) self.scan(); }, 2000);
      document.addEventListener('scroll', function () { self._lastScroll = Date.now(); }, true);
    });
    DSE.on('cfg:change', function () { self.scan(); });
  }
};
DSE.modules.tweaks = Tweaks;

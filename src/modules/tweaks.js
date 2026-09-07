/* ============================================================
 * modules/tweaks：UI 细节
 *  - 只隐藏移动欢迎页“下载应用”本体（保留新建对话/展开侧栏等其它按钮）
 *  - 隐藏“内容由 AI 生成”标识；顶栏统一、输入框磨砂（样式见 tweaks.css）
 * ============================================================ */
var Tweaks = {
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
    var candidates = document.querySelectorAll('._9579690, [class*="ds-button"]');
    for (var i = 0; i < candidates.length; i++) {
      var n = candidates[i];
      if (n.classList.contains('the-header')) continue;
      // 自身文本恰好是“下载应用”，且内部确实含按钮/胶囊
      if (re.test(n.textContent || '') && (n.textContent || '').length < 16 && n.querySelector('[role="button"],button')) {
        n.setAttribute('data-dse-hide', '1');
      }
    }
  },
  hideAiBadgeText: function () {
    if (!DSE.config.get('hideAiBadge')) return;
    var re = /内容由\s*AI\s*生成|由\s*AI\s*生成|AI\s*generated/i;
    document.querySelectorAll('div,span,p').forEach(function (n) {
      if (n.getAttribute('data-dse-hide')) return;
      // 绝不动设置面板自身（面板里有同名说明文字）
      if (n.closest('#dse-panel')) return;
      if (n.children.length > 2) return;
      var t = (n.textContent || '').trim();
      if (t && t.length < 30 && re.test(t)) n.setAttribute('data-dse-hide', '1');
    });
  },
  scan: function () {
    this.syncBodyClasses();
    this.hideDownloadApp();
    this.hideAiBadgeText();
  },
  init: function () {
    var self = this;
    Utils.onReady(function () {
      self.scan();
      setInterval(self.scan.bind(self), 800);
      new MutationObserver(Utils.rafThrottle(self.scan.bind(self))).observe(document.body, { childList: true, subtree: true });
    });
    DSE.on('cfg:change', function () { self.scan(); });
  }
};
DSE.modules.tweaks = Tweaks;

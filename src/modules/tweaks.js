/* ============================================================
 * modules/tweaks：UI 细节
 *  - 隐藏 AI 底部操作栏 / 移动版“下载应用”
 *  - 顶栏统一、输入框磨砂（样式见 tweaks.css）
 * ============================================================ */
var Tweaks = {
  syncBodyClasses: function () {
    var c = DSE.config;
    document.body.classList.toggle('dse-hide-actions', !!c.get('hideAiActions'));
    document.body.classList.toggle('dse-hide-badge', !!c.get('hideAiBadge'));
    document.body.classList.toggle('dse-input-frosted', !!c.get('inputFrosted'));
    document.body.classList.toggle('dse-fix-topbar', !!c.get('fixTopbar'));
    document.body.classList.toggle('dse-md-pretty', !!c.get('markdownPretty'));
  },
  hideDownloadApp: function () {
    if (!DSE.config.get('hideDownloadApp')) return;
    if (Utils.currentSid()) return; // 仅欢迎页
    var nodes = document.querySelectorAll('.the-header, [class*="the-header"]');
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.offsetParent === null) continue;
      if (/下载\s*(应用|APP|App)/.test(n.textContent || '') && (n.textContent || '').length < 12) {
        // 找到可点击按钮的合适外层
        var box = n.querySelector('[role="button"]') ? n : n;
        box.setAttribute('data-dse-hide', '1');
      }
    }
  },
  hideAiBadgeText: function () {
    if (!DSE.config.get('hideAiBadge')) return;
    // 文本兜底：隐藏“内容由 AI 生成”类标识（取最小命中元素）
    var re = /内容由\s*AI\s*生成|由\s*AI\s*生成|AI\s*generated/i;
    document.querySelectorAll('div,span,p').forEach(function (n) {
      if (n.getAttribute('data-dse-hide')) return;
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

/* ============================================================
 * modules/bubbles：气泡材质（只加 class，绝不移动/重建官网节点）
 *  - 不做任何 DOM 结构改动，从根上避免闪烁、位置跳动、破坏官网折叠交互
 *  - AI 正文 .ds-markdown 加 dse-ai-bubble；用户气泡容器加 dse-user-bubble
 *  - 用户长消息的官网“展开/收起”（.ds-collapsible-text）保持原生可用
 * ============================================================ */
var Bubbles = {
  rafQ: false,
  applyPreset: function () {
    var p = DSE.config.get('bubblePreset') || 'water';
    document.body.classList.remove('dse-preset-default', 'dse-preset-frosted', 'dse-preset-water');
    document.body.classList.add('dse-preset-' + p);
  },
  scan: function () {
    if (!document.body) return;
    this.applyPreset();
    // AI 气泡
    var ai = document.querySelectorAll(SEL.aiMarkdown);
    for (var i = 0; i < ai.length; i++) {
      var n = ai[i];
      if (n.closest('.ds-think-content')) continue;
      n.classList.add('dse-ai-bubble');
    }
    // 用户气泡（仅加 class，不触碰内部结构，保证折叠按钮可点）
    var us = document.querySelectorAll(SEL.userBubble);
    for (var j = 0; j < us.length; j++) {
      var u = us[j];
      if (u.closest('textarea') || u.closest('[contenteditable="true"]')) continue;
      u.classList.add('dse-user-bubble');
    }
  },
  requestScan: function () {
    if (this.rafQ) return; this.rafQ = true;
    var self = this;
    requestAnimationFrame(function () { self.rafQ = false; self.scan(); });
  },
  init: function () {
    var self = this;
    Utils.onReady(function () {
      self.scan();
      new MutationObserver(function (muts) {
        // 仅在确实有新增节点/文本变化时调度，且只加 class，开销极小
        for (var i = 0; i < muts.length; i++) {
          if (muts[i].addedNodes.length || muts[i].type === 'characterData') { self.requestScan(); break; }
        }
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    DSE.on('cfg:change', function (e) {
      if (e.path === 'bubblePreset') self.requestScan();
    });
  }
};
DSE.modules.bubbles = Bubbles;

/* ============================================================
 * modules/think：思考区自动折叠（CSS 折叠版，issue #3 关键修复）
 *
 * 旧实现：对折叠头派发真实点击 → 站点把 .ds-think-content 从 DOM 移除。
 * 在长对话里这会改变消息高度，虚拟列表在向上滚动、重挂载消息时反复重算，
 * 导致“消息来回跳 / 一下冲到最开头”。实测：点击折叠 maxUp≈7359，纯 CSS 折叠≈735。
 *
 * 新实现：只给 body 加一个类，用 CSS 隐藏 .ds-think-content ——
 * 不点击、不改 DOM 结构，高度变化发生在挂载瞬间且稳定，虚拟列表不再乱跳。
 * 用户点击折叠头时接管为“切换 .dse-think-open 类”的显隐开关（阻止站点移除节点）；
 * 若该块当前没有 .ds-think-content（站点已折叠），则不接管，交回站点原生展开。
 * ============================================================ */
var Think = {
  // 是否开启“深度思考”开关（站点用 localStorage 记录，避免误接管）
  syncBody: function () {
    var on = !!DSE.config.get('thinkAutoCollapse');
    document.body.classList.toggle('dse-think-collapse', on);
  },
  clearOpen: function () {
    document.querySelectorAll('._74c0879.dse-think-open').forEach(function (b) { b.classList.remove('dse-think-open'); });
  },
  init: function () {
    var self = this;
    Utils.onReady(function () {
      self.syncBody();
      // 接管折叠头点击：存在思考正文时用 CSS 显隐切换，杜绝站点移除 DOM 引起的滚动跳动
      document.addEventListener('click', function (e) {
        if (!DSE.config.get('thinkAutoCollapse')) return; // 关闭时完全交给站点原生行为
        var h = e.target.closest && e.target.closest(SEL.thinkHeader);
        if (!h) return;
        var b = h.closest(SEL.thinkBlock);
        if (!b) return;
        if (!b.querySelector(SEL.thinkContent)) return; // 站点已折叠 → 交回原生展开
        e.preventDefault(); e.stopPropagation();
        b.classList.toggle('dse-think-open');
      }, true);
    });
    DSE.on('cfg:change', function (e) {
      if (e.path !== 'thinkAutoCollapse') return;
      self.syncBody();
      if (!e.value) self.clearOpen();
    });
  }
};
DSE.modules.think = Think;

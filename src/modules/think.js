/* ============================================================
 * modules/think：思考区自动折叠
 *  实测：折叠 = 站点移除 .ds-think-content；展开 = 插回。
 *  故“已展开”判据为内容节点存在；用户手动展开过的块不再自动收起。
 * ============================================================ */
var Think = {
  userTouched: new WeakSet(),
  rafQ: false,
  collapseOne: function (block) {
    if (!DSE.config.get('thinkAutoCollapse')) return;
    if (this.userTouched.has(block)) return;
    var content = block.querySelector(SEL.thinkContent);
    if (!content) return; // 已折叠
    var header = block.querySelector(SEL.thinkHeader);
    if (header) Utils.realClick(header);
  },
  scan: function () {
    if (!DSE.config.get('thinkAutoCollapse')) return;
    var blocks = document.querySelectorAll(SEL.thinkBlock);
    for (var i = 0; i < blocks.length; i++) this.collapseOne(blocks[i]);
  },
  request: function () {
    if (this.rafQ) return; this.rafQ = true;
    var self = this;
    requestAnimationFrame(function () { self.rafQ = false; self.scan(); });
  },
  init: function () {
    var self = this;
    Utils.onReady(function () {
      // 记录用户手动操作（捕获阶段先于站点响应）
      document.addEventListener('click', function (e) {
        var h = e.target.closest && e.target.closest(SEL.thinkHeader);
        if (h) { var b = h.closest(SEL.thinkBlock); if (b) self.userTouched.add(b); }
      }, true);
      self.scan();
      new MutationObserver(function () { self.request(); })
        .observe(document.body, { childList: true, subtree: true });
    });
    DSE.on('cfg:change', function (e) { if (e.path === 'thinkAutoCollapse' && e.value) self.scan(); });
  }
};
DSE.modules.think = Think;

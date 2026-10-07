/* modules/zoom：页面缩放（只缩不放：上限 100%，避免设置面板被放大到屏幕外无法还原，issue #4）
 * 弹窗/预览出现时临时还原缩放，避免错位；检测只扫“可能的弹层”节点，不做全量 body * 遍历。 */
var Zoom = {
  paused: false, saved: 100,
  clamp: function (v) { v = Number(v); if (!v || isNaN(v)) v = 100; return Math.max(60, Math.min(100, Math.round(v))); },
  apply: function (v) {
    v = this.clamp(v);
    this.saved = v;
    if (!this.paused) document.documentElement.style.zoom = v === 100 ? '' : String(v / 100);
  },
  hasModal: function () {
    var nodes = document.querySelectorAll('[role="dialog"],[class*="modal"],[class*="overlay"],[class*="preview"],[class*="Dialog"]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.closest && el.closest('#dse-panel')) continue;
      var r = el.getBoundingClientRect();
      if (r.width > innerWidth * 0.45 && r.height > innerHeight * 0.45 &&
          getComputedStyle(el).position === 'fixed') return true;
    }
    return false;
  },
  init: function () {
    var self = this;
    Utils.onReady(function () {
      self.apply(DSE.config.get('zoom'));
      setInterval(function () {
        var found = self.hasModal();
        if (found && !self.paused) { self.paused = true; document.documentElement.style.zoom = ''; }
        else if (!found && self.paused) { self.paused = false; self.apply(self.saved); }
      }, 500);
    });
    DSE.on('cfg:change', function (e) {
      if (e.path === 'zoom') { var v = self.clamp(DSE.config.get('zoom')); if (v !== DSE.config.get('zoom')) DSE.config.set('zoom', v); self.apply(v); }
    });
  }
};
DSE.modules.zoom = Zoom;

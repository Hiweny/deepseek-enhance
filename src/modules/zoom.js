/* modules/zoom：页面缩放（保留原版能力，弹窗出现时临时还原） */
var Zoom = {
  paused: false, saved: 100,
  apply: function (v) {
    this.saved = v;
    if (!this.paused) document.documentElement.style.zoom = v === 100 ? '' : String(v / 100);
  },
  init: function () {
    var self = this;
    Utils.onReady(function () {
      self.apply(DSE.config.get('zoom'));
      // 站点弹窗/预览时暂停缩放，避免错位
      setInterval(function () {
        var found = false;
        document.querySelectorAll('body *').forEach(function (el) {
          if (found) return;
          var role = el.getAttribute('role');
          var cn = String(el.className || '');
          var r = el.getBoundingClientRect();
          if (r.width > innerWidth * 0.45 && r.height > innerHeight * 0.45 &&
              (role === 'dialog' || /modal|overlay|dialog|preview/i.test(cn)) &&
              getComputedStyle(el).position === 'fixed') found = true;
        });
        if (found && !self.paused) { self.paused = true; document.documentElement.style.zoom = ''; }
        else if (!found && self.paused) { self.paused = false; self.apply(self.saved); }
      }, 400);
    });
  }
};
DSE.modules.zoom = Zoom;

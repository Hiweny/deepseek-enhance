/* ============================================================
 * modules/buttons：在输入工具条（深度思考/联网搜索旁）注入 设置 / 全屏 按钮
 * 位置保持与原版一致，不新增悬浮入口
 * ============================================================ */
var Buttons = {
  ICONS: {
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .32 1.76l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.97 1.47V21a2 2 0 1 1-4 0v-.09a1.6 1.6 0 0 0-.97-1.47 1.6 1.6 0 0 0-1.76.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.6 1.6 0 0 0 4.6 15a1.6 1.6 0 0 0-1.47-.97H3a2 2 0 1 1 0-4h.09A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.32-1.76l-.06-.06A2 2 0 1 1 7.05 4.35l.06.06a1.6 1.6 0 0 0 1.76.32H9a1.6 1.6 0 0 0 .97-1.47V3a2 2 0 1 1 4 0v.09c0 .64.38 1.21.97 1.47.58.24 1.26.15 1.76-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.76V9c.26.59.83.97 1.47.97H21a2 2 0 1 1 0 4h-.09a1.6 1.6 0 0 0-1.47.97z"/></svg>',
    full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>'
  },
  findToolbar: function () {
    var t = document.querySelector(SEL.inputToolbar);
    if (t && t.offsetParent !== null) return t;
    // 兜底：找包含“深度思考”开关的那一行
    var ta = document.querySelector(SEL.textarea);
    if (!ta) return null;
    var box = ta.closest('._871cbca') || ta.parentElement;
    var hit = null;
    if (box) box.querySelectorAll('div').forEach(function (d) {
      if (hit) return;
      if (/深度思考/.test(d.textContent || '') && d.children.length <= 8) hit = d.parentElement;
    });
    return hit;
  },
  make: function (id, title, html, onClick) {
    var b = document.createElement('button');
    b.id = id; b.className = 'dse-icon-btn'; b.type = 'button';
    b.title = title; b.innerHTML = html;
    b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); onClick(); });
    return b;
  },
  inject: function () {
    var bar = this.findToolbar();
    if (!bar) return;
    if (!document.getElementById('dse-btn-full') && DSE.config.get('fullscreenBtn')) {
      var fb = this.make('dse-btn-full', '一键全屏', this.ICONS.full, function () {
        if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
        else document.documentElement.requestFullscreen().catch(function () {});
      });
      bar.insertBefore(fb, bar.firstChild);
    }
    if (!document.getElementById('dse-btn-settings')) {
      var sb = this.make('dse-btn-settings', 'DeepSeek Enhance 设置', this.ICONS.settings, function () {
        DSE.modules.panel && DSE.modules.panel.toggle();
      });
      bar.insertBefore(sb, bar.firstChild);
    }
    var fs = document.getElementById('dse-btn-full');
    if (fs) fs.style.display = DSE.config.get('fullscreenBtn') ? '' : 'none';
  },
  init: function () {
    var self = this;
    Utils.onReady(function () {
      self.inject();
      new MutationObserver(Utils.debounce(self.inject.bind(self), 200)).observe(document.body, { childList: true, subtree: true });
    });
  }
};
DSE.modules.buttons = Buttons;

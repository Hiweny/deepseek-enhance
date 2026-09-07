/* ============================================================
 * modules/background：全局背景（图片 URL / 本地上传 + 模糊 + 亮度）
 * ============================================================ */
var Background = {
  layer: null, mask: null, curSrc: null, loadToken: 0,
  ensure: function () {
    if (!document.getElementById('dse-bg-layer')) {
      this.layer = document.createElement('div'); this.layer.id = 'dse-bg-layer';
      this.mask = document.createElement('div'); this.mask.id = 'dse-bg-mask';
      document.body.insertBefore(this.mask, document.body.firstChild);
      document.body.insertBefore(this.layer, this.mask);
    } else {
      this.layer = document.getElementById('dse-bg-layer');
      this.mask = document.getElementById('dse-bg-mask');
    }
  },
  apply: function () {
    this.ensure();
    var bg = DSE.config.get('bg');
    var src = (bg.upload || bg.url || '').trim();
    if (!bg.enabled || !src) {
      this.loadToken++;
      this.layer.classList.remove('dse-on');
      this.layer.style.backgroundImage = '';
      this.curSrc = null;
      document.body.classList.remove('dse-has-bg');
      return;
    }
    var blur = Math.max(0, Math.min(30, Number(bg.blur) || 0));
    var bright = Math.max(20, Math.min(200, Number(bg.brightness) || 100));
    var filterCss = 'blur(' + blur + 'px) brightness(' + (bright / 100) + ')';
    var self = this, token = ++this.loadToken;
    // 滤镜立即生效（旧图仍在，不会闪）；新图完整解码后再替换，消除“填充/渐进”过程
    this.layer.style.filter = filterCss;
    this.layer.style.webkitFilter = filterCss;
    document.body.classList.add('dse-has-bg');
    var safe = 'url("' + String(src).replace(/"/g, '\\"') + '")';
    var show = function () {
      if (token !== self.loadToken) return; // 期间又换了图，作废本次
      if (self.curSrc !== src) { self.layer.style.backgroundImage = safe; self.curSrc = src; }
      self.layer.classList.add('dse-on');
    };
    var img = new Image();
    img.onload = show;
    img.onerror = show; // 加载失败也照常尝试显示，避免空白
    img.src = src;
    if (img.complete && img.naturalWidth) show(); // 已缓存：立即显示
  },
  uploadFile: function (file, cb) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { Utils.toast('图片不要超过 8MB'); return; }
    var reader = new FileReader();
    reader.onload = function (ev) {
      DSE.config.set('bg.upload', ev.target.result);
      Background.apply(); cb && cb();
    };
    reader.readAsDataURL(file);
  },
  init: function () {
    Utils.onReady(this.apply.bind(this));
    DSE.on('cfg:change', function (e) { if (e.path.indexOf('bg') === 0) Background.apply(); });
  }
};
DSE.modules.background = Background;

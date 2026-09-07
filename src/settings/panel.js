/* ============================================================
 * settings/panel：统一设置面板（移动优先；分区清晰、不拥挤）
 *  外观 / 对话 / 提示词 / 其他
 * ============================================================ */
var Panel = {
  el: null, open_: false,

  sw: function (key, label, desc) {
    return '<div class="dse-row"><span><div class="dse-row-label">' + label + '</div>' +
      (desc ? '<div class="dse-row-desc">' + desc + '</div>' : '') + '</span>' +
      '<span class="dse-switch" data-switch="' + key + '"></span></div>';
  },

  build: function () {
    var el = document.createElement('div'); el.id = 'dse-panel';
    el.innerHTML =
      '<button class="dse-p-close" data-act="close">×</button>' +
      '<div class="dse-p-tabs">' +
        [['look', '外观'], ['chat', '对话'], ['prompt', '提示词'], ['more', '其他']].map(function (t, i) {
          return '<button class="dse-p-tab' + (i === 0 ? ' dse-active' : '') + '" data-tab="' + t[0] + '">' + t[1] + '</button>';
        }).join('') +
      '</div><div class="dse-p-body">' +

      // ============ 外观 ============
      '<div class="dse-p-page dse-active" data-page="look">' +
        '<div class="dse-p-title">背景图片</div>' +
        '<input class="dse-text" data-bind="bg.url" placeholder="图片 URL，留空用默认图">' +
        '<div class="dse-btn-row"><button class="dse-btn ghost" data-act="uploadBg">上传</button>' +
        '<button class="dse-btn ghost" data-act="defaultBg">默认图</button>' +
        '<button class="dse-btn danger" data-act="clearBg">关闭背景</button></div>' +
        '<input type="file" data-role="bgFile" accept="image/*" style="display:none">' +
        '<div class="dse-range-row"><span>模糊</span><input type="range" min="0" max="30" data-bind="bg.blur"><span class="dse-range-val" data-val="bg.blur"></span></div>' +
        '<div class="dse-range-row"><span>亮度</span><input type="range" min="40" max="160" data-bind="bg.brightness"><span class="dse-range-val" data-val="bg.brightness"></span></div>' +
        '<div class="dse-p-sec">气泡材质</div>' +
        '<div class="dse-cards" data-cards="bubblePreset">' +
          [['default', '默认', '清爽浅色气泡'], ['frosted', 'iOS 磨砂', '高饱和毛玻璃'], ['water', '水玻璃', '通透高光（推荐）']].map(function (c) {
            return '<button class="dse-card" data-card-val="' + c[0] + '"><b>' + c[1] + '</b><small>' + c[2] + '</small></button>';
          }).join('') + '</div>' +
        '<div class="dse-p-sec">界面</div>' +
        this.sw('inputFrosted', '输入框悬浮磨砂') +
        this.sw('fixTopbar', '统一顶栏', '消除分享按钮单独底色/标题黑条') +
        this.sw('hideDownloadApp', '隐藏“下载应用”', '仅欢迎页，不影响新建对话/侧栏按钮') +
        '<div class="dse-range-row"><span>页面缩放</span><input type="range" min="60" max="180" step="5" data-bind="zoom"><span class="dse-range-val" data-val="zoom"></span></div>' +
      '</div>' +

      // ============ 对话 ============
      '<div class="dse-p-page" data-page="chat">' +
        '<div class="dse-p-title">消息呈现</div>' +
        this.sw('thinkAutoCollapse', '思考区自动折叠', '默认收起 DeepSeek 思考过程') +
        this.sw('hideAiBadge', '隐藏 AI 生成标识', '底部“内容由 AI 生成”等') +
        this.sw('markdownPretty', 'Markdown 排版美化', '只改本地样式，不向 AI 发送任何指令') +
        this.sw('timeInject', '隐式时间注入') +
        '<div class="dse-p-sec">本会话上下文用量</div>' +
        '<div class="dse-ctx"><div class="dse-ctx-track"><div class="dse-ctx-fill" data-ctx-fill></div></div>' +
        '<div class="dse-ctx-meta"><span data-ctx-text></span><span data-ctx-pct></span></div></div>' +
        '<div class="dse-range-row"><span>上下文上限</span><input type="range" min="32000" max="1024000" step="32000" data-bind="ctxLimitTokens"><span class="dse-range-val" data-val="ctxLimitTokens"></span></div>' +
        '<div class="dse-row-desc" style="margin:-2px 0 6px">快速模式约 128K，专家模式(V3.2/V4)约 1M，按所用模型调整。</div>' +
        '<button class="dse-btn ghost" data-act="resetCtx" style="width:100%">重新统计本会话</button>' +
      '</div>' +

      // ============ 提示词 ============
      '<div class="dse-p-page" data-page="prompt">' +
        '<div class="dse-p-title">本会话系统提示词</div>' +
        '<div class="dse-row-desc" style="margin-bottom:6px">只对当前这一个会话生效；切换到其它会话互不影响、互不可见。</div>' +
        this.sw('systemPromptEnabled', '启用本会话系统提示词') +
        '<textarea class="dse-text" data-session="assistantSystemPrompt" placeholder="写给当前会话 AI 的系统设定…" style="min-height:150px;margin-top:8px"></textarea>' +
        '<details class="dse-details" style="margin-top:10px"><summary>高级：实际注入内容预览 / 模板</summary>' +
          '<label class="dse-row-desc">撤回后简短回应（模板，可编辑）</label><textarea class="dse-text" data-tpl="recallBrief" style="min-height:80px"></textarea>' +
          '<div class="dse-btn-row"><button class="dse-btn ghost" data-act="resetTpl">恢复默认</button>' +
          '<button class="dse-btn ghost" data-act="previewPrompt">预览实际注入</button></div>' +
          '<div class="dse-preview" data-preview style="display:none"></div>' +
        '</details>' +
      '</div>' +

      // ============ 其他 ============
      '<div class="dse-p-page" data-page="more">' +
        '<div class="dse-p-title">防撤回 / 隐私</div>' +
        '<div class="dse-seg" data-seg="privacyMode">' +
          '<button data-v="off">关闭</button><button data-v="smart">智能</button><button data-v="full">全量</button></div>' +
        '<div class="dse-row-desc" style="margin:8px 0">智能：连续撤回连续补回；服务端重载上下文后只补最新缺失轮次。全量：每次发送都拼接本地历史。</div>' +
        this.sw('recallBriefHint', '撤回后提示 AI 简短回应', '降低再次撤回概率与 prompt 压力') +
        '<div class="dse-range-row"><span>全量历史条数</span><input type="range" min="5" max="100" step="5" data-bind="privacyCtxMessages"><span class="dse-range-val" data-val="privacyCtxMessages"></span></div>' +
        '<div class="dse-p-sec" data-hist-info></div>' +
        '<button class="dse-btn danger" data-act="clearHist" style="width:100%">清除本会话本地历史</button>' +
        '<div class="dse-p-sec">便捷功能</div>' +
        this.sw('navButtons', '消息上下导航按钮') +
        this.sw('fullscreenBtn', '一键全屏按钮') +
        '<div class="dse-p-sec">关于</div>' +
        '<div class="dse-row-desc">DeepSeek Enhance v' + DSE.version + ' · 全部能力本地运行，不上传数据<br>选择器档案见仓库 docs/dom-research.md，官网改版后可据此修复。</div>' +
      '</div>' +

      '</div>';
    this.el = el;
    document.body.appendChild(el);
    this.bind();
  },

  bind: function () {
    var self = this, el = this.el;
    el.addEventListener('click', function (e) {
      var tab = e.target.closest('.dse-p-tab');
      if (tab) {
        el.querySelectorAll('.dse-p-tab').forEach(function (t) { t.classList.toggle('dse-active', t === tab); });
        el.querySelectorAll('.dse-p-page').forEach(function (p) { p.classList.toggle('dse-active', p.getAttribute('data-page') === tab.getAttribute('data-tab')); });
        self.position();
      }
      var card = e.target.closest('.dse-card');
      if (card && card.parentElement.getAttribute('data-cards')) {
        DSE.config.set(card.parentElement.getAttribute('data-cards'), card.getAttribute('data-card-val')); self.refresh();
      }
      var swi = e.target.closest('.dse-switch');
      if (swi && swi.hasAttribute('data-switch')) {
        var path = swi.getAttribute('data-switch');
        DSE.config.set(path, !DSE.config.get(path)); self.refresh();
      }
      var segv = e.target.closest('.dse-seg button');
      if (segv) {
        DSE.config.set(segv.parentElement.getAttribute('data-seg'), segv.getAttribute('data-v')); self.refresh();
      }
      var act = e.target.closest('[data-act]');
      if (act) self.action(act.getAttribute('data-act'));
    });
    el.querySelectorAll('[data-bind]').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var path = inp.getAttribute('data-bind');
        var v = inp.type === 'range' ? Number(inp.value) : inp.value;
        DSE.config.set(path, v);
        var valEl = el.querySelector('[data-val="' + path + '"]');
        if (valEl) valEl.textContent = inp.type === 'range' ? Panel.fmtLimit(path, Number(inp.value)) : '';
        if (path === 'zoom') DSE.modules.zoom && DSE.modules.zoom.apply(Number(inp.value));
      });
    });
    el.querySelectorAll('[data-session]').forEach(function (ta) {
      ta.addEventListener('input', function () {
        var sid = Utils.currentSid(), key = ta.getAttribute('data-session'), patch = {};
        patch[key] = ta.value;
        if (sid) DSE.config.setSession(sid, patch);
      });
    });
    el.querySelectorAll('[data-tpl]').forEach(function (ta) {
      ta.addEventListener('input', function () { DSE.modules.prompt.setTpl(ta.getAttribute('data-tpl'), ta.value); });
    });
    el.querySelector('[data-role="bgFile"]').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      DSE.modules.background.uploadFile(f, function () { self.refresh(); });
      e.target.value = '';
    });
    document.addEventListener('click', function (e) {
      if (self.open_ && !el.contains(e.target) && e.target.id !== 'dse-btn-settings') self.hide();
    }, true);
  },

  fmtLimit: function (path, v) {
    if (path === 'ctxLimitTokens') return v >= 1000 ? (v / 1000) + 'K' : String(v);
    return String(v);
  },

  action: function (act) {
    var sid = Utils.currentSid();
    if (act === 'close') return this.hide();
    if (act === 'uploadBg') return this.el.querySelector('[data-role="bgFile"]').click();
    if (act === 'defaultBg') { DSE.config.set('bg.url', DSE.config.defaults.bg.url); DSE.config.set('bg.upload', ''); DSE.config.set('bg.enabled', true); this.refresh(); }
    if (act === 'clearBg') { DSE.config.set('bg.enabled', false); DSE.config.set('bg.upload', ''); this.refresh(); }
    if (act === 'resetCtx') { DSE.modules.context.reset(); this.refreshCtx(); }
    if (act === 'resetTpl') { DSE.modules.prompt.resetTpl(); this.refresh(); }
    if (act === 'previewPrompt') {
      var box = this.el.querySelector('[data-preview]');
      box.style.display = 'block'; box.textContent = DSE.modules.prompt.preview();
    }
    if (act === 'clearHist') { DSE.modules.antiRecall.clearHistory(sid); this.refresh(); }
  },

  refresh: function () {
    if (!this.el) return;
    var c = DSE.config.get(), el = this.el;
    function resolve(obj, path) { return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, obj); }
    el.querySelectorAll('[data-switch]').forEach(function (s) {
      s.classList.toggle('dse-on', !!resolve(c, s.getAttribute('data-switch')));
    });
    el.querySelectorAll('[data-bind]').forEach(function (inp) {
      var v = resolve(c, inp.getAttribute('data-bind'));
      if (document.activeElement !== inp) inp.value = v == null ? '' : v;
    });
    el.querySelectorAll('[data-val]').forEach(function (v) {
      var path = v.getAttribute('data-val');
      v.textContent = Panel.fmtLimit(path, resolve(c, path)) ?? '';
    });
    el.querySelectorAll('[data-seg]').forEach(function (seg) {
      var cur = resolve(c, seg.getAttribute('data-seg'));
      seg.querySelectorAll('button').forEach(function (b) { b.classList.toggle('dse-on', b.getAttribute('data-v') === cur); });
    });
    el.querySelectorAll('[data-cards]').forEach(function (box) {
      var cur = resolve(c, box.getAttribute('data-cards'));
      box.querySelectorAll('.dse-card').forEach(function (cd) { cd.classList.toggle('dse-on', cd.getAttribute('data-card-val') === cur); });
    });
    var sess = DSE.config.session(Utils.currentSid());
    el.querySelectorAll('[data-session]').forEach(function (ta) {
      if (document.activeElement !== ta) ta.value = sess[ta.getAttribute('data-session')] || '';
    });
    el.querySelectorAll('[data-tpl]').forEach(function (ta) {
      if (document.activeElement !== ta) ta.value = DSE.modules.prompt.tpl(ta.getAttribute('data-tpl'));
    });
    this.refreshCtx();
    if (this.open_) this.position();
  },
  refreshCtx: function () {
    var u = DSE.modules.context.getUsage();
    var fill = this.el.querySelector('[data-ctx-fill]');
    if (!fill) return;
    fill.style.width = u.pct + '%';
    fill.className = 'dse-ctx-fill ' + (u.level === 'danger' ? 'danger' : u.level === 'warn' ? 'warn' : '');
    var k = function (n) { return n >= 1000 ? (n / 1000).toFixed(0) + 'K' : String(n); };
    this.el.querySelector('[data-ctx-text]').textContent =
      '约 ' + k(u.used) + ' / ' + k(u.limit) + (u.source === 'estimate' ? '（估算）' : '') + (u.pct >= 75 ? '（建议新对话）' : '');
    this.el.querySelector('[data-ctx-pct]').textContent = u.pct + '%';
    var hist = DSE.modules.antiRecall.getHistory(Utils.currentSid());
    var recalled = hist.filter(function (h) { return h.recalled && !h.serverHas; }).length;
    var info = this.el.querySelector('[data-hist-info]');
    if (info) info.textContent = '本地记录 ' + hist.length + ' 条' + (recalled ? '，待回填撤回 ' + recalled + ' 条' : '');
  },
  position: function () {
    var el = this.el;
    if (Utils.isMobile()) { el.style.left = '4vw'; el.style.right = '4vw'; el.style.bottom = 'calc(12px + env(safe-area-inset-bottom))'; el.style.top = 'auto'; el.style.width = ''; return; }
    var btn = document.getElementById('dse-btn-settings');
    el.style.width = '360px';
    var maxH = Math.min(window.innerHeight - 24, 780);
    el.style.maxHeight = maxH + 'px';
    var wantH = Math.min(el.scrollHeight || maxH, maxH);
    var anchorTop = btn ? btn.getBoundingClientRect().top : window.innerHeight - 90;
    var top = Math.max(12, anchorTop + 10 - wantH);
    var r = btn ? btn.getBoundingClientRect() : { right: window.innerWidth / 2 };
    el.style.left = Math.max(8, Math.min(window.innerWidth - 368, r.right - 360)) + 'px';
    el.style.top = top + 'px'; el.style.bottom = 'auto'; el.style.right = 'auto';
  },
  toggle: function () { this.open_ ? this.hide() : this.show(); },
  show: function () {
    if (!this.el) this.build();
    this.open_ = true;
    this.refresh(); this.position(); this.el.classList.add('dse-open');
  },
  hide: function () { this.el && this.el.classList.remove('dse-open'); this.open_ = false; },
  init: function () {
    var self = this;
    Utils.onReady(function () { self.build(); });
    DSE.on('ctx:update', function () { if (self.open_) self.refreshCtx(); });
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'B' || e.code === 'KeyB')) { e.preventDefault(); self.toggle(); }
    });
    window.addEventListener('resize', function () { if (self.open_) self.position(); });
  }
};
DSE.modules.panel = Panel;

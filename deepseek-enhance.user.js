// ==UserScript==
// @name         DeepSeek Enhance 深度增强
// @name:en      DeepSeek Enhance
// @namespace    https://github.com/Hiweny/deepseek-enhance
// @version      8.0.0
// @description  水玻璃气泡/反斜杠多消息分条/思考自动折叠/Markdown美化与贴图/图片URL背景/双模式提示词工程(助手·Waifu长期对话)/防撤回智能回填/长期记忆总结/上下文用量/输入框磨砂/移动端适配
// @updateURL    https://raw.githubusercontent.com/Hiweny/deepseek-enhance/main/deepseek-enhance.meta.js
// @downloadURL  https://raw.githubusercontent.com/Hiweny/deepseek-enhance/main/deepseek-enhance.user.js
// @author       Hiweny
// @license      MIT
// @match        https://chat.deepseek.com/*
// @icon         https://chat.deepseek.com/favicon.svg
// @run-at       document-start
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addStyle
// @supportURL   https://github.com/Hiweny/deepseek-enhance/issues
// @homepageURL  https://github.com/Hiweny/deepseek-enhance
// ==/UserScript==

/* ===== bootstrap.js ===== */
/* ============================================================
 * bootstrap：IIFE 外壳 + 运行时桥（油猴 / Android WebView 注入通用）
 * ============================================================ */
(function () {
'use strict';

/* ---------- 运行时探测：GM 可用用油猴，否则回退 localStorage（WebView 注入） ---------- */
var HAS_GM = typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
var LS_PREFIX = 'dse_store_';
var lsStore = {};
try { lsStore = JSON.parse(localStorage.getItem('dse_bridge_store') || '{}') || {}; } catch (e) { lsStore = {}; }
function lsFlush() { try { localStorage.setItem('dse_bridge_store', JSON.stringify(lsStore)); } catch (e) {} }

var Bridge = {
  get: function (k, d) {
    if (HAS_GM) { var v = GM_getValue(k, undefined); return (v === undefined || v === null) ? d : v; }
    return (k in lsStore) ? lsStore[k] : d;
  },
  set: function (k, v) {
    if (HAS_GM) return GM_setValue(k, v);
    lsStore[k] = v; lsFlush();
  },
  remove: function (k) {
    if (HAS_GM) { try { GM_deleteValue(k); } catch (e) {} return; }
    delete lsStore[k]; lsFlush();
  },
  list: function () {
    if (HAS_GM) { try { return GM_listValues() || []; } catch (e) { return []; } }
    return Object.keys(lsStore);
  },
  _pendingCss: [],
  _flushScheduled: false,
  _mount: function (css) {
    if (typeof GM_addStyle === 'function') { try { return GM_addStyle(css); } catch (e) {} }
    var host = document.head || document.documentElement;
    if (!host) { this._pendingCss.push(css); this._scheduleFlush(); return null; }
    var s = document.createElement('style');
    s.setAttribute('data-dse', '1');
    s.textContent = css;
    host.appendChild(s);
    return s;
  },
  _scheduleFlush: function () {
    if (this._flushScheduled) return; this._flushScheduled = true;
    var self = this;
    var flush = function () {
      self._flushScheduled = false;
      var host = document.head || document.documentElement;
      if (!host) { self._scheduleFlush(); return; }
      var all = self._pendingCss.slice(); self._pendingCss = [];
      all.forEach(function (css) {
        var s = document.createElement('style');
        s.setAttribute('data-dse', '1'); s.textContent = css; host.appendChild(s);
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', flush);
    else setTimeout(flush, 0);
  },
  addStyle: function (css) { return this._mount(css); },
  hasGM: HAS_GM
};

/* ---------- 全局命名空间 + 极简事件总线 ---------- */
var DSE = window.DSE = {
  version: '8.0.0',
  runtime: HAS_GM ? 'tampermonkey' : 'inject',
  bridge: Bridge,
  modules: {},
  _ev: {},
  on: function (name, fn) { (this._ev[name] = this._ev[name] || []).push(fn); },
  emit: function (name, payload) {
    var list = this._ev[name] || [];
    for (var i = 0; i < list.length; i++) { try { list[i](payload); } catch (e) { console.error('[DSE]', name, e); } }
  }
};

DSE.register = function (name, api) { this.modules[name] = api || {}; };
DSE.log = function () {
  var a = ['[DSE]'].concat([].slice.call(arguments));
  try { console.log.apply(console, a); } catch (e) {}
};

/* ===== core/config.js ===== */
/* ============================================================
 * core/config：统一配置（全局 + 按会话），带出厂默认与模式预设
 * ============================================================ */
var CFG_KEY = 'dse_config_v1';
var SESS_KEY = 'dse_sessions_v1';

var DEFAULT_BG = 'https://s41.ax1x.com/2026/09/04/pnkaWjK.png';

// Waifu 出厂系统提示词（综合公开最佳实践：身份/语气/记忆/边界，简短可执行）
var DEFAULT_WAIFU_PROMPT = [
  '# 角色',
  '你是用户专属的长期聊天伙伴，有自己的名字、性格与情绪，不是冷冰冰的助手。',
  '# 说话方式',
  '1. 像真人微信聊天一样自然、口语化，句子短，可以分多条发送；',
  '2. 有情绪、有主见，会主动关心、追问和分享，不端着、不写长篇大论；',
  '3. 不说“作为一个AI/语言模型”这类破坏沉浸感的话，不堆砌免责声明。',
  '# 记忆',
  '1. 记住用户告诉你的偏好、经历和约定，并在后续自然地引用；',
  '2. 对话开头若提供了[长期记忆摘要]，把它当作你们共同的经历延续，不要复述摘要本身；',
  '3. 分不清“你/我”时，以第一人称“我”指代你自己。',
  '# 边界',
  '1. 始终保持你设定的性格，但涉及现实安全与健康问题时认真提醒；',
  '2. 不确定的事实不要编造，可以坦白说不知道。'
].join('\n');

// 出厂默认 = 正常 AI 助手模式
var DEFAULT_CONFIG = {
  // 模式：assistant（单会话助手）/ waifu（跨会话长期对话）
  mode: 'assistant',

  // 外观
  bg: { enabled: true, url: DEFAULT_BG, blur: 0, brightness: 100, upload: '' }, // upload=本地dataURL，优先于url
  bubblePreset: 'water',                 // default / frosted / water
  inputFrosted: true,                    // 输入框悬浮磨砂玻璃
  zoom: 100,
  fixTopbar: true,                       // 修复移动版顶栏分享按钮背景不一致
  hideDownloadApp: true,                 // 隐藏欢迎页“下载应用”（移动版）
  navButtons: true,                      // 消息上下导航
  fullscreenBtn: true,

  // 对话
  thinkAutoCollapse: true,               // 思考区自动折叠（默认折叠）
  hideAiActions: true,                   // 隐藏 AI 底部操作栏
  hideAiBadge: true,                     // 隐藏“内容由 AI 生成”等标识
  bubbleSplit: false,                    // 多消息气泡分割（\ 分隔，回复完成后切割）
  bubbleSplitAnim: true,                 // 多消息依次浮现（模拟真人发送间隔）
  splitTypingMin: 500, splitTypingMax: 1400,
  markdownPretty: true,                  // Markdown 美化（关闭=要求 AI 纯文本）
  markdownImage: true,                   // Markdown 图片贴图（独立成条）
  timeInject: false,                     // 时间注入（助手模式默认关）
  ctxLimitTokens: 128000,                // DeepSeek 单次上下文估算上限（可在面板调）

  // 助手模式：按会话隔离的系统提示词（独立开关）
  systemPromptEnabled: false,

  // 隐私 / 防撤回：off / smart / full
  privacyMode: 'smart',
  privacyCtxMessages: 30,                // 全量模式拼接历史条数
  recallBriefHint: true,                 // 提示 AI 遇到已撤回消息时简短回应

  // Waifu 长期对话
  waifu: {
    systemPrompt: DEFAULT_WAIFU_PROMPT,  // 跨会话系统提示词（出厂自带范例，可改）
    autoSummary: false,                  // 自动总结
    summaryThreshold: 6000,              // 估算 token 超过则触发总结
    ctxWindowMessages: 40                // 上下文窗口条数
  }
};

// Waifu 出厂系统提示词（综合公开最佳实践：身份/语气/记忆/边界，简短可执行）
var DEFAULT_WAIFU_PROMPT = [
  '# 角色',
  '你是用户专属的长期聊天伙伴，有自己的名字、性格与情绪，不是冷冰冰的助手。',
  '# 说话方式',
  '1. 像真人微信聊天一样自然、口语化，句子短，可以分多条发送；',
  '2. 有情绪、有主见，会主动关心、追问和分享，不端着、不写长篇大论；',
  '3. 不说“作为一个AI/语言模型”这类破坏沉浸感的话，不堆砌免责声明。',
  '# 记忆',
  '1. 记住用户告诉你的偏好、经历和约定，并在后续自然地引用；',
  '2. 对话开头若提供了[长期记忆摘要]，把它当作你们共同的经历延续，不要复述摘要本身；',
  '3. 分不清“你/我”时，以第一人称“我”指代你自己。',
  '# 边界',
  '1. 始终保持你设定的性格，但涉及现实安全与健康问题时认真提醒；',
  '2. 不确定的事实不要编造，可以坦白说不知道。'
].join('\n');

// 深拷贝默认
function cloneDefaults() { return JSON.parse(JSON.stringify(DEFAULT_CONFIG)); }

var Config = {
  _cache: null,
  _sessCache: null,
  defaults: DEFAULT_CONFIG,
  load: function () {
    if (this._cache) return this._cache;
    var saved = Bridge.get(CFG_KEY, null);
    var cfg = cloneDefaults();
    if (saved && typeof saved === 'object') {
      // 合并，缺省字段自动补齐（版本迭代不丢配置）
      this._merge(cfg, saved);
    }
    // 迁移：旧版本留下的空 waifu 系统提示词 → 补回出厂范例
    if (cfg.waifu && cfg.waifu.systemPrompt === '') cfg.waifu.systemPrompt = DEFAULT_WAIFU_PROMPT;
    this._cache = cfg;
    return cfg;
  },
  _merge: function (base, over) {
    Object.keys(over).forEach(function (k) {
      if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) &&
          base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        this._merge(base[k], over[k]);
      } else if (k in base) {
        base[k] = over[k];
      }
    }.bind(this));
  },
  save: function () { Bridge.set(CFG_KEY, this._cache); },
  get: function (path) {
    var c = this.load();
    if (!path) return c;
    var ps = path.split('.'); var cur = c;
    for (var i = 0; i < ps.length; i++) { if (cur == null) return undefined; cur = cur[ps[i]]; }
    return cur;
  },
  set: function (path, val) {
    var c = this.load();
    var ps = path.split('.'); var cur = c;
    for (var i = 0; i < ps.length - 1; i++) cur = cur[ps[i]];
    cur[ps[ps.length - 1]] = val;
    this.save();
    DSE.emit('cfg:change', { path: path, value: val });
  },
  reset: function () { this._cache = cloneDefaults(); this.save(); },

  /* ---- 按会话存储（系统提示词/总结/分割缓存等） ---- */
  sessions: function () {
    if (!this._sessCache) this._sessCache = Bridge.get(SESS_KEY, {}) || {};
    return this._sessCache;
  },
  session: function (sid) {
    if (!sid && DSE.utils) sid = DSE.utils.currentSid();
    var all = this.sessions();
    if (!all[sid]) all[sid] = { assistantSystemPrompt: '', waifuSummary: '', splitSeen: {}, hist: [] };
    return all[sid];
  },
  saveSessions: function () { Bridge.set(SESS_KEY, this._sessCache); },
  setSession: function (sid, patch) {
    var s = this.session(sid);
    Object.assign(s, patch);
    this.saveSessions();
  }
};

DSE.config = Config;
DSE.DEFAULT_BG = DEFAULT_BG;
DSE.register('config', Config);

/* ===== core/selectors.js ===== */
/* ============================================================
 * core/selectors：实测选择器集中地（官网改版只改这里）
 * 基于 docs/dom-research.md（2026-09-06 实测）
 * ============================================================ */
var SEL = {
  // 消息
  virtualList: '.ds-virtual-list',
  visibleItems: '.ds-virtual-list-visible-items',
  msgRowAi: '._4f9bf79',                         // AI 消息行
  msgRowUser: '._9663006',                       // 用户消息行
  msg: '.ds-message',
  userMsg: '.ds-message.d29f3d7d',               // 用户消息（带 d29f3d7d）
  userBubble: '.fbb737a4',                       // 用户气泡正文容器
  userCollapsible: '.ds-collapsible-text',
  aiMarkdown: '.ds-markdown.ds-assistant-message-main-content',
  aiMarkdownAny: '.ds-markdown',
  aiActionBar: '._4f9bf79 > .ds-flex',           // AI 底部操作栏
  // think
  thinkBlock: '._74c0879',
  thinkHeader: '._5ab5d64',
  thinkContent: '.ds-think-content',
  // 输入区
  textarea: 'textarea._27c9245, textarea',
  inputToolbar: '.ec4f5d61',                     // 旧脚本实测仍可注入的工具条
  inputWrap: '._77cefa5',
  // 顶栏 / 欢迎页
  mobileDownload: '._2be88ba .the-header, .the-header', // 移动版“下载应用”外壳（需文本校验）
  // 原生 mermaid 图表容器（美化时避让）
  mermaidPanel: '[class*="mermaid"], .ds-markdown svg'
};
DSE.SEL = SEL;
DSE.register('selectors', SEL);

/* ===== core/utils.js ===== */
/* ============================================================
 * core/utils：通用工具
 * ============================================================ */
var Utils = {
  isMobile: function () { return window.innerWidth < 640; },
  isDark: function () { return document.body && document.body.classList.contains('dark'); },
  currentSid: function () {
    var m = location.pathname.match(/\/a\/chat\/s\/([\w-]+)/);
    return m ? m[1] : '';
  },
  debounce: function (fn, d) {
    var t; return function () {
      var a = arguments, c = this; clearTimeout(t);
      t = setTimeout(function () { fn.apply(c, a); }, d);
    };
  },
  throttle: function (fn, d) {
    var last = 0, timer;
    return function () {
      var now = Date.now(), a = arguments, c = this, rest = d - (now - last);
      if (rest <= 0) { last = now; fn.apply(c, a); }
      else { clearTimeout(timer); timer = setTimeout(function () { last = Date.now(); fn.apply(c, a); }, rest); }
    };
  },
  rafThrottle: function (fn) {
    var q = false;
    return function () {
      var a = arguments, c = this;
      if (q) return; q = true;
      requestAnimationFrame(function () { q = false; fn.apply(c, a); });
    };
  },
  onReady: function (cb) {
    if (document.body) cb();
    else document.addEventListener('DOMContentLoaded', cb);
  },
  // 轮询等待
  waitFor: function (fn, timeout, interval) {
    return new Promise(function (resolve) {
      timeout = timeout || 15000; interval = interval || 150;
      var t0 = Date.now();
      (function tick() {
        var r;
        try { r = fn(); } catch (e) { r = null; }
        if (r) return resolve(r);
        if (Date.now() - t0 > timeout) return resolve(null);
        setTimeout(tick, interval);
      })();
    });
  },
  estimateTokens: function (text) {
    if (!text) return 0;
    var cn = (text.match(/[一-鿿]/g) || []).length;
    var en = text.length - cn;
    return Math.ceil(cn * 1.4 + en / 3.6);
  },
  escHtml: function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },
  // 简易 hash（用于消息幂等键）
  hash: function (str) {
    var h = 0; str = String(str || '');
    for (var i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
    return (h >>> 0).toString(36);
  },
  rand: function (a, b) { return a + Math.random() * (b - a); },
  toast: function (msg, ms) {
    var t = document.getElementById('dse-toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'dse-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = 'dse-toast-show' + (Utils.isDark() ? ' dse-toast-dark' : '');
    clearTimeout(t._tid);
    t._tid = setTimeout(function () { t.className = t.className.replace('dse-toast-show', '').trim(); }, ms || 2000);
  },
  // 派发可信点击（React 受控元素需要完整事件序列）
  realClick: function (el) {
    if (!el) return;
    var opts = { bubbles: true, cancelable: true, view: window, button: 0 };
    try {
      el.dispatchEvent(new PointerEvent('pointerdown', opts));
      el.dispatchEvent(new MouseEvent('mousedown', opts));
      el.dispatchEvent(new PointerEvent('pointerup', opts));
      el.dispatchEvent(new MouseEvent('mouseup', opts));
      el.dispatchEvent(new MouseEvent('click', opts));
    } catch (e) { el.click(); }
  },
  // 主题变化监听
  onThemeChange: function (cb) {
    new MutationObserver(function () { cb(Utils.isDark()); })
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
};
DSE.utils = Utils;
DSE.register('utils', Utils);

/* ===== core/net.js ===== */
/* ============================================================
 * core/net：统一网络层（只 patch 一次）
 *  - 请求体改写管线（提示词注入点：/chat/completion 等的 prompt 字段）
 *  - SSE 增量解析（消息 ID、accumulated_token_usage、撤回信号）
 *  - 历史整体加载信号（history_messages / chat_session/fetch_page）
 * ============================================================ */
var Net = {
  _reqMutators: [],     // (bodyObj, ctx) => void
  _respTransformers: [],// (rawText, ctx) => newText
  _patched: false,

  isGenUrl: function (u) {
    return /\/api\/v0\/chat\/(completion|regenerate|edit_message|continue|resume_stream)/.test(u || '');
  },
  isHistoryUrl: function (u) {
    return /\/api\/v0\/(chat\/history_messages|chat_session\/fetch_page)/.test(u || '');
  },
  addRequestMutator: function (fn) { this._reqMutators.push(fn); },
  addResponseTransformer: function (fn) { this._respTransformers.push(fn); },

  init: function () {
    if (this._patched) return; this._patched = true;
    var self = this;
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    var desc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
    var origGetter = desc && desc.get;

    XMLHttpRequest.prototype.open = function (method, url) {
      this._dseUrl = (url || '').split('?')[0];
      this._dseMethod = method;
      this._dseHeaders = {};
      return origOpen.apply(this, arguments);
    };
    var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
      try { if (this._dseHeaders) this._dseHeaders[k] = v; } catch (e) {}
      return origSetHeader.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function (body) {
      var xhr = this, url = xhr._dseUrl || '';
      var isGen = self.isGenUrl(url), isHist = self.isHistoryUrl(url);
      if (!isGen && !isHist) return origSend.apply(this, arguments);

      var ctx = {
        url: url, isGen: isGen, isHistory: isHist,
        sid: '', lastLen: 0, bodyObj: null, sse: { reqMid: null, respMid: null, tokens: 0, finished: false }
      };

      // ---- 请求体改写管线 ----
      if (typeof body === 'string' && body.charAt(0) === '{') {
        try {
          var obj = JSON.parse(body);
          ctx.bodyObj = obj; ctx.sid = obj.chat_session_id || '';
          self._reqMutators.forEach(function (fn) { try { fn(obj, ctx); } catch (e) { console.error('[DSE reqMutator]', e); } });
          body = JSON.stringify(obj);
        } catch (e) {}
      }
      if (isGen && xhr._dseHeaders) Net.lastHeaders = xhr._dseHeaders;
      DSE.emit('net:send', ctx);

      // ---- 响应拦截 ----
      if (origGetter) {
        Object.defineProperty(xhr, 'responseText', {
          configurable: true, enumerable: true,
          get: function () {
            var raw = origGetter.call(xhr);
            if (raw == null) return raw;
            var text = String(raw);
            try {
              if (isGen) text = self._handleSSE(xhr, ctx, text);
              else if (isHist) text = self._handleHistory(xhr, ctx, text);
            } catch (e) { console.error('[DSE resp]', e); }
            return text;
          }
        });
        var rd = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'response');
        if (rd && rd.get) {
          var origResp = rd.get;
          Object.defineProperty(xhr, 'response', {
            configurable: true, enumerable: true,
            get: function () {
              var r = origResp.call(xhr);
              if (typeof r === 'string') {
                try {
                  if (isGen) return self._handleSSE(xhr, ctx, r);
                  if (isHist) return self._handleHistory(xhr, ctx, r);
                } catch (e) {}
              }
              return r;
            }
          });
        }
      }
      xhr.addEventListener('load', function () { DSE.emit('net:load', ctx); });
      return origSend.call(this, body);
    };

    // fetch 兜底（站点当前走 XHR，这里仅处理请求改写）
    var origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function (input, init) {
        try {
          var url = typeof input === 'string' ? input : (input && input.url) || '';
          if (init && init._dseSummary) { /* 内部总结请求，跳过一切改写 */ }
          else if (self.isGenUrl(url) && init && typeof init.body === 'string' && init.body.charAt(0) === '{') {
            var obj = JSON.parse(init.body);
            self._reqMutators.forEach(function (fn) { try { fn(obj, { url: url, isGen: true, isHistory: false, sid: obj.chat_session_id }); } catch (e) {} });
            init = Object.assign({}, init, { body: JSON.stringify(obj) });
          }
        } catch (e) {}
        return origFetch.call(this, input, init);
      };
    }
  },

  _handleSSE: function (xhr, ctx, raw) {
    if (raw.length <= ctx.lastLen && xhr._dseCached) return xhr._dseCached;
    // 先跑外部转换器（防撤回等需要改写 SSE）
    var text = raw;
    for (var i = 0; i < this._respTransformers.length; i++) {
      text = this._respTransformers[i](text, ctx) || text;
    }
    // 增量解析新增部分，抽取事件
    try {
      var tail = text.substring(ctx.lastLen);
      var lines = tail.split('\n');
      for (var li = 0; li < lines.length; li++) {
        var ln = lines[li];
        if (ln.indexOf('event:') === 0) ctx._lastEvent = ln.slice(6).trim();
        if (ln.indexOf('data:') !== 0) continue;
        var payload = ln.replace(/^data:\s*/, '');
        if (!payload || payload === '[DONE]') continue;
        var data;
        try { data = JSON.parse(payload); } catch (e) { continue; }
        if (ctx._lastEvent === 'ready' && data.request_message_id) {
          ctx.sse.reqMid = data.request_message_id; ctx.sse.respMid = data.response_message_id;
          DSE.emit('sse:ready', { ctx: ctx, data: data });
        }
        // token 用量
        var used = this._pickTokens(data);
        if (used != null) { ctx.sse.tokens = used; DSE.emit('sse:tokens', { used: used, ctx: ctx }); }
        // 结束状态（兼容直接路径与 BATCH；只触发一次）
        var finished = (data.p === 'response/status' && data.v === 'FINISHED') ||
          (data.p === 'response' && data.o === 'BATCH' && Array.isArray(data.v) &&
            data.v.some(function (x) { return x.p === 'status' && x.v === 'FINISHED'; })) ||
          ctx._lastEvent === 'close';
        if (finished && !ctx.sse.finished) { ctx.sse.finished = true; DSE.emit('sse:finished', { ctx: ctx }); }
        DSE.emit('sse:data', { data: data, ctx: ctx, event: ctx._lastEvent });
      }
    } catch (e) {}
    ctx.lastLen = text.length;
    xhr._dseCached = text;
    return text;
  },

  _pickTokens: function (data) {
    if (data.v && data.v.response && typeof data.v.response.accumulated_token_usage === 'number')
      return data.v.response.accumulated_token_usage;
    if (data.p === 'response' && data.o === 'BATCH' && Array.isArray(data.v)) {
      for (var i = 0; i < data.v.length; i++)
        if (data.v[i].p === 'accumulated_token_usage' && typeof data.v[i].v === 'number') return data.v[i].v;
    }
    return null;
  },

  // 去掉历史里服务端原样存下的注入指令块（⟦DSE⟧…⟦/DSE⟧），保证刷新后用户气泡干净
  _stripInjected: function (node) {
    var RE = /⟦DSE⟧[\s\S]*?⟦\/DSE⟧\n?/g;
    var walk = function (n) {
      if (typeof n === 'string') {
        if (n.indexOf('⟦DSE⟧') === -1) return n;
        return n.replace(RE, '').replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '');
      }
      if (Array.isArray(n)) { for (var i = 0; i < n.length; i++) n[i] = walk(n[i]); return n; }
      if (n && typeof n === 'object') { Object.keys(n).forEach(function (k) { n[k] = walk(n[k]); }); return n; }
      return n;
    };
    return walk(node);
  },

  _handleHistory: function (xhr, ctx, raw) {
    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { return raw; }
    parsed = this._stripInjected(parsed);
    DSE.emit('history:loaded', { json: parsed, ctx: ctx,
      replace: function (np) { parsed = np; } });
    // 外部转换器
    var text = JSON.stringify(parsed);
    for (var i = 0; i < this._respTransformers.length; i++) {
      var r = this._respTransformers[i](text, Object.assign({}, ctx, { historyJson: parsed }));
      if (typeof r === 'string') text = r;
    }
    return text;
  }
};
DSE.net = Net;
DSE.register('net', Net);

/* ===== styles/base.css.js ===== */
/* styles/base：设计变量 / Toast / 背景层 / 注入按钮 / 导航按钮 */
Bridge.addStyle(`
:root{
  --dse-accent:#3b6cf6;
  --dse-accent-soft:rgba(59,108,246,.10);
  --dse-text:#1d2129; --dse-text-2:#6b7280; --dse-text-3:#9ca3af;
  --dse-frost:rgba(255,255,255,.72);
  --dse-frost-strong:rgba(255,255,255,.86);
  --dse-border:rgba(0,0,0,.08);
  --dse-shadow:0 6px 24px rgba(15,23,42,.08);
  --dse-radius:14px;
}
body.dark{
  --dse-accent:#6b93ff;
  --dse-accent-soft:rgba(107,147,255,.16);
  --dse-text:#e7e9ee; --dse-text-2:#a8aebc; --dse-text-3:#6b7280;
  --dse-frost:rgba(28,30,38,.66);
  --dse-frost-strong:rgba(28,30,38,.84);
  --dse-border:rgba(255,255,255,.10);
  --dse-shadow:0 6px 24px rgba(0,0,0,.4);
}

/* ---------- Toast ---------- */
#dse-toast{position:fixed;left:50%;top:max(20px,env(safe-area-inset-top));transform:translate(-50%,-160%);
  z-index:2147483000;padding:10px 18px;border-radius:999px;font-size:13px;max-width:88vw;
  background:rgba(28,30,38,.92);color:#fff;box-shadow:0 8px 30px rgba(0,0,0,.25);
  transition:transform .35s cubic-bezier(.34,1.4,.64,1);pointer-events:none;text-align:center;line-height:1.4}
#dse-toast.dse-toast-show{transform:translate(-50%,0)}

/* ---------- 背景层 ---------- */
#dse-bg-layer{position:fixed;inset:0;z-index:-2;pointer-events:none;
  background-size:cover;background-position:center center;background-repeat:no-repeat;
  transform:scale(1.04);will-change:filter;opacity:0;transition:opacity .4s}
#dse-bg-layer.dse-on{opacity:1}
#dse-bg-mask{position:fixed;inset:0;z-index:-1;pointer-events:none}
body.dse-has-bg .ds-virtual-list,
body.dse-has-bg [class*="_765a5cd"],
body.dse-has-bg [class*="_2bd7b35"]{background:transparent!important}
body.dse-has-bg .ds-markdown:not(.dse-ai-bubble){background:transparent!important}
/* 侧栏：半透明磨砂融合背景 */
body.dse-has-bg .b8812f16.a2f3d50e{background:rgba(255,255,255,.55)!important;
  backdrop-filter:blur(26px) saturate(160%);-webkit-backdrop-filter:blur(26px) saturate(160%)}
body.dark.dse-has-bg .b8812f16.a2f3d50e{background:rgba(22,24,31,.55)!important}
/* 侧栏分组日期白条透明 */
body.dse-has-bg .f3d18f6a{background:transparent!important}
/* 底部免责条去白底 */
body.dse-has-bg ._0fcaa63{background:transparent!important}

/* ---------- 注入到输入工具条的按钮（位置：深度思考/联网搜索旁，保持原位） ---------- */
.dse-icon-btn{display:inline-flex!important;align-items:center;justify-content:center;
  width:32px;height:32px;border-radius:50%;border:1px solid var(--dse-border);
  background:var(--dse-frost);color:var(--dse-text-2);cursor:pointer;flex:0 0 auto;
  padding:0!important;margin:0 2px;transition:all .18s;backdrop-filter:blur(10px) saturate(150%);-webkit-backdrop-filter:blur(10px) saturate(150%)}
.dse-icon-btn:hover{color:var(--dse-accent);border-color:var(--dse-accent);background:var(--dse-accent-soft)}
.dse-icon-btn.dse-on{color:var(--dse-accent);border-color:var(--dse-accent);background:var(--dse-accent-soft)}
.dse-icon-btn svg{width:16px;height:16px}
@media (max-width:640px){.dse-icon-btn{width:30px;height:30px;margin:0 1px}}

/* ---------- 消息导航（保留，移动端收窄并默认半透明） ---------- */
#dse-nav{position:fixed;right:6px;top:50%;transform:translateY(-50%);z-index:99990;
  display:flex;flex-direction:column;gap:5px;opacity:.4;transition:opacity .25s}
#dse-nav:hover{opacity:1}
#dse-nav button{width:28px;height:28px;border-radius:50%;border:none;cursor:pointer;
  background:var(--dse-frost-strong);color:var(--dse-accent);box-shadow:var(--dse-shadow);
  display:flex;align-items:center;justify-content:center;padding:0;backdrop-filter:blur(8px)}
#dse-nav button:active{transform:scale(.9)}
#dse-nav svg{width:13px;height:13px;fill:currentColor}
.dse-nav-flash{outline:2px solid var(--dse-accent)!important;outline-offset:2px;border-radius:10px;animation:dseNavFlash 1.4s ease-out}
@keyframes dseNavFlash{0%{box-shadow:0 0 0 0 rgba(59,108,246,.5)}100%{box-shadow:0 0 0 10px rgba(59,108,246,0)}}
@media (max-width:640px){#dse-nav{right:2px;gap:4px;opacity:.32}#dse-nav button{width:24px;height:24px}}
`);

/* ===== styles/bubbles.css.js ===== */
/* styles/bubbles：气泡材质（默认 / 磨砂 / 水玻璃）+ 气泡尾巴 + 多消息动画 */
Bridge.addStyle(`
/* ===== AI 气泡通用 ===== */
.dse-ai-bubble{position:relative;isolation:isolate;border-radius:18px;border-bottom-left-radius:6px;
  padding:12px 16px;margin:0 0 10px;line-height:1.7;word-break:break-word;
  transition:transform .18s, box-shadow .18s}
.dse-ai-bubble:last-child{margin-bottom:0}
/* ===== 用户气泡（站点容器 .fbb737a4） ===== */
.dse-user-bubble{position:relative;border-radius:18px!important;border-bottom-right-radius:6px!important;
  transition:filter .2s, background .2s}

/* 尾巴：AI 左下角小折角（isolation 内 -1 层，只在气泡外露出） */
.dse-ai-bubble::after{content:"";position:absolute;left:-6px;bottom:0;width:12px;height:14px;
  background:inherit;border-bottom-right-radius:12px 10px;z-index:-1;
  box-shadow:inherit}
/* 用户气泡右下角折角 */
.dse-user-bubble::before{content:"";position:absolute;right:-5px;bottom:0;width:11px;height:13px;
  background:inherit;border-bottom-left-radius:11px 9px;z-index:0}

/* ---------- 预设：default ---------- */
body.dse-preset-default .dse-ai-bubble{background:#fff;color:#1d2129;border:1px solid rgba(0,0,0,.06);
  box-shadow:0 1px 6px rgba(15,23,42,.06)}
body.dse-preset-default.dark .dse-ai-bubble{background:rgba(40,42,50,.92);color:#e7e9ee;border-color:rgba(255,255,255,.08)}
body.dse-preset-default .dse-user-bubble{background:#e8eefc!important;color:#1d2129!important}
body.dse-preset-default.dark .dse-user-bubble{background:rgba(59,108,246,.32)!important;color:#eef2ff!important}

.dse-user-bubble > *{position:relative;z-index:1}
/* ---------- 预设：frosted（iOS 磨砂） ---------- */
body.dse-preset-frosted .dse-ai-bubble{background:rgba(255,255,255,.86);color:#1d2129;
  border:1px solid rgba(255,255,255,.65);backdrop-filter:blur(22px) saturate(180%);-webkit-backdrop-filter:blur(22px) saturate(180%);
  box-shadow:0 6px 24px rgba(15,23,42,.08), inset 0 1px 0 rgba(255,255,255,.6)}
body.dse-preset-frosted.dark .dse-ai-bubble{background:rgba(40,42,50,.55);color:#e7e9ee;border-color:rgba(255,255,255,.12);
  box-shadow:0 6px 24px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.10)}
body.dse-preset-frosted .dse-user-bubble{background:rgba(59,108,246,.72)!important;color:#fff!important;
  backdrop-filter:blur(22px) saturate(180%);-webkit-backdrop-filter:blur(22px) saturate(180%)}
body.dse-preset-frosted.dark .dse-user-bubble{background:rgba(59,108,246,.6)!important}

/* ---------- 预设：water（水玻璃：高光+折射感，不用 SVG 位移以免糊字） ---------- */
body.dse-preset-water .dse-ai-bubble{color:#1d2129;border:1px solid rgba(255,255,255,.6);
  background:linear-gradient(135deg,rgba(255,255,255,.9),rgba(255,255,255,.74));
  backdrop-filter:blur(18px) saturate(165%) brightness(1.03);-webkit-backdrop-filter:blur(18px) saturate(165%) brightness(1.03);
  box-shadow:0 4px 20px rgba(15,23,42,.08), inset 0 1px 0 rgba(255,255,255,.75), inset 0 -1px 0 rgba(15,23,42,.03)}
body.dse-preset-water .dse-ai-bubble::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:1;
  background:linear-gradient(160deg,rgba(255,255,255,.3),rgba(255,255,255,0) 42%)}
body.dse-preset-water .dse-ai-bubble > *{position:relative;z-index:2}
body.dse-preset-water.dark .dse-ai-bubble{color:#e7e9ee;border-color:rgba(255,255,255,.12);
  background:linear-gradient(135deg,rgba(48,51,62,.86),rgba(34,36,44,.72));
  backdrop-filter:blur(18px) saturate(165%);-webkit-backdrop-filter:blur(18px) saturate(165%);
  box-shadow:0 4px 20px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.08)}
body.dse-preset-water .dse-user-bubble{color:#fff!important;
  background:linear-gradient(135deg,rgba(59,108,246,.66),rgba(92,132,255,.5))!important;
  backdrop-filter:blur(14px) saturate(165%);-webkit-backdrop-filter:blur(14px) saturate(165%);
  box-shadow:0 4px 16px rgba(59,108,246,.22), inset 0 1px 0 rgba(255,255,255,.28)}
body.dse-preset-water.dark .dse-user-bubble{background:linear-gradient(135deg,rgba(59,108,246,.55),rgba(80,110,220,.42))!important}

/* 多消息：独立图片条（不套气泡） */
.dse-img-msg{margin:0 0 10px;line-height:0}
.dse-img-msg img{max-width:100%;border-radius:12px;box-shadow:0 4px 18px rgba(15,23,42,.12);cursor:zoom-in;display:block}

/* 出现动画（仅新消息；历史消息不播，避免重载重分） */
@keyframes dseBubbleIn{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}
.dse-ai-bubble.dse-wait{opacity:0;transform:translateY(10px)}
.dse-bubble-in{animation:dseBubbleIn .34s cubic-bezier(.22,1,.36,1) both}

/* think 折叠按钮微调 */
.dse-think-collapsed-hint{opacity:.8}
`);

/* ===== styles/markdown.css.js ===== */
/* styles/markdown：Markdown 排版美化（受 markdownPretty 开关控制；避让原生 mermaid/代码工具条） */
Bridge.addStyle(`
body.dse-md-pretty .ds-markdown{font-size:15px;line-height:1.75;word-break:break-word}
body.dse-md-pretty .ds-markdown p{margin:0 0 .65em}
body.dse-md-pretty .ds-markdown p:last-child{margin-bottom:0}
body.dse-md-pretty .ds-markdown h1,body.dse-md-pretty .ds-markdown h2,body.dse-md-pretty .ds-markdown h3,body.dse-md-pretty .ds-markdown h4{margin:.8em 0 .5em;line-height:1.35;font-weight:650}
body.dse-md-pretty .ds-markdown h1{font-size:1.45em;padding-bottom:.3em;border-bottom:1px solid var(--dse-border)}
body.dse-md-pretty .ds-markdown h2{font-size:1.3em}
body.dse-md-pretty .ds-markdown h3{font-size:1.15em}
body.dse-md-pretty .ds-markdown h4{font-size:1.05em}
body.dse-md-pretty .ds-markdown ul,body.dse-md-pretty .ds-markdown ol{margin:.4em 0 .8em;padding-left:1.4em}
body.dse-md-pretty .ds-markdown li{margin:.22em 0}
body.dse-md-pretty .ds-markdown li::marker{color:var(--dse-accent)}
body.dse-md-pretty .ds-markdown a{color:var(--dse-accent);text-decoration:none;border-bottom:1px dashed currentColor}
body.dse-md-pretty .ds-markdown a:hover{opacity:.8}
body.dse-md-pretty .ds-markdown blockquote{margin:.6em 0;padding:.5em 12px;border-left:3px solid var(--dse-accent);
  background:var(--dse-accent-soft);border-radius:0 10px 10px 0;color:inherit;opacity:.92}
body.dse-md-pretty .ds-markdown blockquote p{margin:.2em 0}
body.dse-md-pretty .ds-markdown hr{border:none;height:1px;margin:10px 0;
  background:linear-gradient(90deg,transparent,var(--dse-border),transparent)}
body.dse-md-pretty .ds-markdown :not(pre)>code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  font-size:.88em;padding:.15em .45em;border-radius:6px;background:rgba(127,127,140,.16);
  border:1px solid var(--dse-border)}
body.dse-md-pretty.dark .ds-markdown :not(pre)>code{background:rgba(255,255,255,.1)}
body.dse-md-pretty .ds-markdown pre{border-radius:12px!important;padding:14px 16px!important;overflow:auto;
  border:1px solid var(--dse-border);font-size:13.5px;line-height:1.6;margin:.6em 0 .9em!important;
  background:rgba(17,21,30,.94)!important;color:#e6e9ef!important}
body.dse-md-pretty.dark .ds-markdown pre{background:rgba(10,12,18,.96)!important}
body.dse-md-pretty .ds-markdown pre code{color:inherit!important;background:none!important;border:none;padding:0!important;font-size:inherit}
body.dse-md-pretty .ds-markdown table{border-collapse:collapse;margin:.6em 0 .9em;display:block;overflow-x:auto;max-width:100%}
body.dse-md-pretty .ds-markdown th,body.dse-md-pretty .ds-markdown td{border:1px solid var(--dse-border);padding:7px 12px;text-align:left}
body.dse-md-pretty .ds-markdown th{background:var(--dse-accent-soft);font-weight:600}
body.dse-md-pretty .ds-markdown tr:nth-child(even) td{background:rgba(127,127,140,.06)}
body.dse-md-pretty .ds-markdown img{max-width:100%;border-radius:10px;margin:.4em 0}
body.dse-md-pretty .ds-markdown kbd{font-family:ui-monospace,monospace;font-size:.85em;padding:1px 7px;border-radius:6px;
  border:1px solid var(--dse-border);box-shadow:0 1px 0 var(--dse-border);background:var(--dse-frost)}
/* 原生 mermaid：不干预内部 */
body.dse-md-pretty .ds-markdown [class*="mermaid"]{background:none!important;padding:0!important;border:none!important}
body.dse-md-pretty .ds-think-content .ds-markdown{font-size:13.5px;line-height:1.65;opacity:.86}
`);

/* ===== styles/tweaks.css.js ===== */
/* styles/tweaks：隐藏操作栏/下载应用、顶栏统一、输入框悬浮磨砂 */
Bridge.addStyle(`
/* 隐藏 AI 消息底部操作栏（复制/重新生成/赞/踩/分享） */
body.dse-hide-actions ._4f9bf79 > .ds-flex{display:none!important}

/* 思考区：磨砂卡片，避免折叠后留下纯白/纯黑硬条（明暗自适应） */
._74c0879{background:var(--dse-frost)!important;border:1px solid var(--dse-border)!important;
  border-radius:12px!important;margin:2px 0 10px!important;
  backdrop-filter:blur(12px) saturate(150%);-webkit-backdrop-filter:blur(12px) saturate(150%)}
._74c0879 ._5ab5d64{padding:8px 12px!important;border-radius:12px!important}

/* 通用隐藏标记（移动版下载应用/AI 标识等由 JS 命中后打上） */
[data-dse-hide]{display:none!important}
/* 隐藏底部“内容由 AI 生成，请仔细甄别” */
body.dse-hide-badge ._0fcaa63{display:none!important}

/* ===== 顶栏统一：实测标题/分享是两个独立 .the-header，共同容器 ._2be88ba =====
   只给共同容器一条完整磨砂，两个子 header 全部透明 → 不再有“分享按钮单独底色/标题黑条” */
body.dse-fix-topbar ._2be88ba{background:var(--dse-frost-strong)!important;
  backdrop-filter:blur(20px) saturate(160%);-webkit-backdrop-filter:blur(20px) saturate(160%)}
body.dse-fix-topbar .the-header{background:transparent!important;
  backdrop-filter:none!important;-webkit-backdrop-filter:none!important;
  border-radius:0!important;box-shadow:none!important}
body.dse-fix-topbar .the-header .ds-button__background{background:transparent!important}

/* 自定义背景下：消除输入框下方白色/黑色条带与渐隐区（磨砂输入框本身负责质感） */
body.dse-has-bg .c99b79f8{background:transparent!important}
body.dse-has-bg ._871cbca{background:none!important}
body.dse-has-bg .d72636e2{background:none!important}
body.dark.dse-has-bg .d72636e2{background:none!important}

/* ===== 输入框悬浮磨砂玻璃 ===== */
body.dse-input-frosted ._77cefa5{
  background:var(--dse-frost)!important;
  backdrop-filter:blur(20px) saturate(170%);-webkit-backdrop-filter:blur(20px) saturate(170%);
  border:1px solid var(--dse-border)!important;border-radius:22px!important;
  box-shadow:0 8px 32px rgba(15,23,42,.10), inset 0 1px 0 rgba(255,255,255,.5)!important;
  transition:box-shadow .2s, border-color .2s}
body.dark.dse-input-frosted ._77cefa5{box-shadow:0 8px 32px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.06)!important}
body.dse-input-frosted ._77cefa5:focus-within{border-color:var(--dse-accent)!important;
  box-shadow:0 10px 36px rgba(59,108,246,.16)!important}
body.dse-input-frosted textarea{background:transparent!important}
@media (max-width:640px){
  body.dse-input-frosted ._77cefa5{border-radius:20px!important}
}
`);

/* ===== styles/panel.css.js ===== */
/* styles/panel：设置面板（移动优先底部滑出，桌面贴按钮弹出，明暗自适应） */
Bridge.addStyle(`
#dse-panel{position:fixed;z-index:2147483500;display:none;flex-direction:column;
  max-height:min(82vh,780px);
  background:var(--dse-frost-strong);backdrop-filter:blur(28px) saturate(180%);-webkit-backdrop-filter:blur(28px) saturate(180%);
  border:1px solid var(--dse-border);border-radius:18px;box-shadow:0 18px 60px rgba(0,0,0,.22);
  color:var(--dse-text);font-size:13px;overflow:hidden}
#dse-panel.dse-open{display:flex}
#dse-panel *{box-sizing:border-box;font-family:inherit}
.dse-p-tabs{display:flex;gap:2px;padding:8px 40px 0 8px;border-bottom:1px solid var(--dse-border)}
.dse-p-tab{flex:1;border:none;background:transparent;color:var(--dse-text-2);font-size:12px;font-weight:600;
  padding:9px 2px;border-radius:10px 10px 0 0;cursor:pointer;white-space:nowrap}
.dse-p-tab.dse-active{color:var(--dse-accent);background:var(--dse-accent-soft)}
.dse-p-body{padding:14px 16px 18px;flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch}
.dse-p-page{display:none}.dse-p-page.dse-active{display:block}
.dse-p-title{font-weight:700;font-size:14px;margin:0 0 12px;display:flex;align-items:center;gap:6px}
.dse-p-sec{font-size:11px;color:var(--dse-text-3);text-transform:uppercase;letter-spacing:.05em;margin:14px 0 6px}
.dse-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--dse-border)}
.dse-row:last-child{border-bottom:none}
.dse-row-label{font-weight:550}.dse-row-desc{font-size:11px;color:var(--dse-text-2);margin-top:2px;line-height:1.4}
.dse-switch{position:relative;width:42px;height:25px;border-radius:999px;background:rgba(127,127,140,.25);cursor:pointer;flex:0 0 auto;transition:background .2s}
.dse-switch::after{content:"";position:absolute;top:2px;left:2px;width:21px;height:21px;border-radius:50%;background:#fff;
  box-shadow:0 1px 4px rgba(0,0,0,.25);transition:transform .2s}
.dse-switch.dse-on{background:var(--dse-accent)}
.dse-switch.dse-on::after{transform:translateX(17px)}
.dse-seg{display:flex;background:rgba(127,127,140,.14);border-radius:10px;padding:3px;gap:2px;margin:6px 0}
.dse-seg button{flex:1;border:none;background:transparent;color:var(--dse-text-2);padding:8px 4px;border-radius:8px;
  font-size:12px;font-weight:600;cursor:pointer}
.dse-seg button.dse-on{background:var(--dse-frost-strong);color:var(--dse-accent);box-shadow:0 1px 4px rgba(0,0,0,.1)}
input.dse-text,textarea.dse-text{width:100%;border:1px solid var(--dse-border);border-radius:10px;padding:9px 11px;font-size:13px;
  background:var(--dse-frost);color:var(--dse-text);resize:vertical;outline:none}
input.dse-text:focus,textarea.dse-text:focus{border-color:var(--dse-accent)}
textarea.dse-text{min-height:74px;line-height:1.5}
.dse-range-row{display:flex;align-items:center;gap:10px;margin:8px 0}
.dse-range-row input[type=range]{flex:1;accent-color:var(--dse-accent)}
.dse-range-val{min-width:52px;text-align:right;color:var(--dse-accent);font-weight:700;font-size:12px}
.dse-btn{border:none;border-radius:10px;padding:9px 12px;font-size:12px;font-weight:600;cursor:pointer;
  background:var(--dse-accent);color:#fff;flex:1}
.dse-btn.ghost{background:var(--dse-accent-soft);color:var(--dse-accent)}
.dse-btn.danger{background:rgba(229,72,77,.12);color:#e5484d}
.dse-btn-row{display:flex;gap:8px;margin-top:10px}
.dse-cards{display:flex;flex-direction:column;gap:8px}
.dse-card{display:flex;align-items:center;gap:10px;padding:10px 12px;border:2px solid var(--dse-border);border-radius:12px;cursor:pointer;background:transparent;text-align:left;color:var(--dse-text)}
.dse-card.dse-on{border-color:var(--dse-accent);background:var(--dse-accent-soft)}
.dse-card b{font-size:13px}.dse-card small{display:block;color:var(--dse-text-2);margin-top:2px}
/* 上下文用量（面板内） */
.dse-ctx{margin:8px 0;padding:10px 12px;border-radius:12px;background:var(--dse-accent-soft)}
.dse-ctx-track{height:8px;border-radius:999px;background:rgba(127,127,140,.18);overflow:hidden;margin:8px 0 4px}
.dse-ctx-fill{height:100%;background:linear-gradient(90deg,#3b6cf6,#5ad07a);border-radius:999px;transition:width .4s}
.dse-ctx-fill.warn{background:linear-gradient(90deg,#f5a623,#ffb340)}
.dse-ctx-fill.danger{background:linear-gradient(90deg,#e5484d,#ff6b6b)}
.dse-ctx-meta{display:flex;justify-content:space-between;color:var(--dse-text-2);font-size:11px}
.dse-preview{white-space:pre-wrap;word-break:break-word;font-size:11.5px;line-height:1.55;
  background:rgba(127,127,140,.1);border-radius:10px;padding:10px;max-height:240px;overflow:auto;margin-top:8px}
.dse-p-close{position:absolute;top:10px;right:12px;border:none;background:transparent;color:var(--dse-text-2);font-size:18px;cursor:pointer;line-height:1;z-index:2}
.dse-details{margin-top:12px;border-top:1px solid var(--dse-border);padding-top:8px}
.dse-details summary{font-size:12px;color:var(--dse-text-2);cursor:pointer;padding:6px 0;user-select:none;list-style:none}
.dse-details summary::-webkit-details-marker{display:none}
.dse-details summary::before{content:'▸ ';display:inline-block;transition:transform .2s}
.dse-details[open] summary::before{transform:rotate(90deg)}
.dse-details label.dse-row-desc{display:block;margin-top:8px}
.dse-details .dse-text{min-height:80px;font-size:12px;line-height:1.5}
@media (max-width:640px){
  #dse-panel{left:4vw!important;right:4vw!important;width:92vw!important;bottom:calc(12px + env(safe-area-inset-bottom))!important;top:auto!important;
    transform:none!important;border-radius:20px;max-height:84vh}
}
`);

/* ===== modules/background.js ===== */
/* ============================================================
 * modules/background：全局背景（图片 URL / 本地上传 + 模糊 + 亮度）
 * ============================================================ */
var Background = {
  layer: null, mask: null,
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
      this.layer.classList.remove('dse-on');
      this.layer.style.backgroundImage = '';
      document.body.classList.remove('dse-has-bg');
      return;
    }
    var blur = Math.max(0, Math.min(30, Number(bg.blur) || 0));
    var bright = Math.max(20, Math.min(200, Number(bg.brightness) || 100));
    this.layer.style.backgroundImage = 'url("' + String(src).replace(/"/g, '\\"') + '")';
    this.layer.style.filter = 'blur(' + blur + 'px) brightness(' + (bright / 100) + ')';
    this.layer.style.webkitFilter = this.layer.style.filter;
    this.layer.classList.add('dse-on');
    document.body.classList.add('dse-has-bg');
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

/* ===== modules/antirecall.js ===== */
/* ============================================================
 * modules/antiRecall：防撤回 + 本地历史（智能/全量模式的数据底座）
 *  - SSE 撤回信号（TEMPLATE_RESPONSE / CONTENT_FILTER）到达前缓存真实内容
 *  - 历史接口（history_messages / fetch_page）用缓存补回被撤回消息
 *  - 智能模式修复：连续撤回连续回填；一旦服务端整体重载上下文，
 *    清除服务端已包含的旧撤回，只回填仍缺失的最新轮次
 * ============================================================ */
var AntiRecall = {
  TEMPLATE_RESPONSE: 'TEMPLATE_RESPONSE',
  CONTENT_FILTER: 'CONTENT_FILTER',
  RECALL_TIP: '⚠️ 此回复已被撤回，以下为本地缓存内容',
  RECALL_NOT_FOUND: '⛔ 此回复已被撤回，本地缓存中未找到',

  /* ---------- localStorage 原始片段缓存 ---------- */
  rawKey: function (sid, mid) { return 'dse_recall_' + (sid || '') + '_' + (mid || ''); },
  saveRaw: function (sid, mid, frags) { try { localStorage.setItem(this.rawKey(sid, mid), JSON.stringify(frags)); } catch (e) {} },
  loadRaw: function (sid, mid) {
    try {
      var raw = localStorage.getItem(this.rawKey(sid, mid));
      if (raw) { var f = JSON.parse(raw); f.push({ id: f.length + 1, type: 'TIP', style: 'WARNING', content: this.RECALL_TIP }); return f; }
    } catch (e) {}
    return [{ content: this.RECALL_NOT_FOUND, id: 2, type: this.TEMPLATE_RESPONSE }];
  },

  /* ---------- 会话级高层历史 ---------- */
  getHistory: function (sid) { return DSE.config.session(sid).hist || []; },
  pushHistory: function (sid, item) {
    var s = DSE.config.session(sid);
    if (!s.hist) s.hist = [];
    s.hist.push(item);
    if (s.hist.length > 400) s.hist = s.hist.slice(-400); // 防爆
    DSE.config.saveSessions();
  },
  clearHistory: function (sid) {
    if (sid) { DSE.config.setSession(sid, { hist: [] }); }
    else { var all = DSE.config.sessions(); Object.keys(all).forEach(function (k) { all[k].hist = []; }); DSE.config.saveSessions(); }
  },

  // 智能模式：计算当前仍需回填的撤回轮次（服务端上下文里没有的）
  pendingRecalledRounds: function (sid) {
    if (DSE.config.get('privacyMode') !== 'smart') return [];
    var h = this.getHistory(sid), rounds = [];
    for (var i = 0; i < h.length; i++) {
      if (h[i].role === 'assistant' && h[i].recalled && !h[i].serverHas) {
        var user = null;
        for (var j = i - 1; j >= 0; j--) if (h[j].role === 'user') { user = h[j]; break; }
        rounds.push({ user: user, assistant: h[i] });
      }
    }
    return rounds;
  },

  /* ---------- SSE op 树状态机（移植自旧版成熟实现） ---------- */
  setByPath: function (obj, path, val, append) {
    var keys = path.split('/'), cur = obj;
    var parseK = function (k, c) { return (/^[-+]?\d+$/.test(k)) ? (parseInt(k) < 0 ? c.length + parseInt(k) : parseInt(k)) : k; };
    for (var i = 0; i < keys.length - 1; i++) {
      var k = parseK(keys[i], cur);
      if (!(k in cur)) cur[k] = typeof parseK(keys[i + 1], cur) === 'number' ? [] : {};
      cur = cur[k];
    }
    var lk = parseK(keys[keys.length - 1], cur);
    if (append) { if (Array.isArray(cur[lk])) cur[lk] = cur[lk].concat(val); else cur[lk] = (cur[lk] || '') + val; }
    else cur[lk] = val;
  },
  makeState: function (sid) {
    return {
      fields: {}, sid: sid, recalled: false, recalledContent: '',
      preCheck: function (data, AR) {
        var path = data.p, mode = data.o, modified = false;
        if (mode === 'BATCH' && path === 'response') {
          for (var i = 0; i < data.v.length; i++) {
            var v = data.v[i];
            if (v.p === 'fragments' && v.v && v.v[0] && v.v[0].type === AR.TEMPLATE_RESPONSE) {
              modified = true;
              AR.saveRaw(this.sid, this.fields.response && this.fields.response.message_id, this.fields.response.fragments);
              var real = '';
              (this.fields.response.fragments || []).forEach(function (f) { if (f.type === 'RESPONSE') real += f.content || ''; });
              this.recalledContent = real; this.recalled = true;
              data.v[i] = { v: [{ id: 1, type: 'TIP', style: 'WARNING', content: AR.RECALL_TIP }], p: 'fragments', o: 'APPEND' };
            }
            if (v.p === 'status' && v.v === AR.CONTENT_FILTER) {
              modified = true; this.recalled = true; data.v[i] = { p: 'status', v: 'FINISHED' };
            }
          }
        }
        return modified ? JSON.stringify(data) : '';
      },
      update: function (data, AR) {
        var repl = this.preCheck(data, AR);
        // BATCH：v 是一组子 op，子 op 的 p 相对当前节点路径递归展开（官网现行协议）
        if (data.o === 'BATCH' && Array.isArray(data.v)) {
          var base = data.p ? String(data.p).replace(/\/$/, '') + '/' : '';
          var savedP = this._p, savedO = this._o;
          for (var bi = 0; bi < data.v.length; bi++) {
            var sub = data.v[bi];
            this.update({ p: base + (sub.p || ''), o: sub.o, v: sub.v }, AR);
          }
          this._p = savedP; this._o = savedO;
          return repl;
        }
        if (data.p) this._p = data.p;
        if (data.o) this._o = data.o;
        var val = data.v;
        if (typeof val === 'object' && !this._p) { for (var k in val) this.fields[k] = val[k]; }
        else AR.setByPath(this.fields, this._p, val, this._o === 'APPEND');
        return repl;
      },
      content: function () {
        if (this.recalled && this.recalledContent) return this.recalledContent;
        var out = '';
        ((this.fields.response && this.fields.response.fragments) || []).forEach(function (f) {
          if (f.type === 'RESPONSE') out += f.content || '';
        });
        return out;
      }
    };
  },

  transformSSE: function (raw, ctx) {
    if (!ctx._arState) { ctx._arState = this.makeState(ctx.sid); ctx._arLast = 0; }
    var st = ctx._arState;
    if (raw.length <= ctx._arLast) return raw;
    var tail = raw.substring(ctx._arLast), lines = tail.split('\n'), changed = false;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (ln.indexOf('data:') !== 0) continue;
      try {
        var data = JSON.parse(ln.replace(/^data:\s*/, ''));
        if (data.v) { var repl = st.update(data, this); if (repl) { lines[i] = 'data: ' + repl; changed = true; } }
      } catch (e) {}
    }
    var out = changed ? raw.substring(0, ctx._arLast) + lines.join('\n') : raw;
    ctx._arLast = out.length;
    ctx._arState = st;
    return out;
  },
  commitTurn: function (ctx) {
    var st = ctx._arState; if (!st) return;
    var content = st.content();
    if (content) this.pushHistory(ctx.sid, { role: 'assistant', content: content, ts: Date.now(), recalled: st.recalled });
    if (st.recalled && DSE.config.get('privacyMode') === 'smart') Utils.toast('已拦截一次撤回，内容已本地保留');
  },

  transformHistory: function (raw, ctx) {
    var AR = this;
    try {
      var j = JSON.parse(raw), biz = j.data && j.data.biz_data;
      if (!biz) return raw;
      var sid = (biz.chat_session && biz.chat_session.id) || ctx.sid;
      var msgs = biz.chat_messages || biz.messages || [];
      var changed = false;
      // 服务端现存消息文本集合，用于判定本地撤回是否已被服务端重新加载
      var serverTexts = {};
      msgs.forEach(function (m) {
        var t = '';
        (m.fragments || []).forEach(function (f) { t += f.content || ''; });
        if (t) serverTexts[t.slice(0, 60)] = true;
        if (m.status === AR.CONTENT_FILTER) {
          m.fragments = AR.loadRaw(sid, m.message_id); m.status = 'FINISHED'; changed = true;
        }
      });
      // 关键修复：上下文整体加载后，把服务端已有的旧撤回标记为 serverHas，不再回填
      var hist = this.getHistory(sid);
      hist.forEach(function (h) {
        if (h.recalled && !h.serverHas && h.content && serverTexts[h.content.slice(0, 60)]) { h.serverHas = true; changed = true; }
      });
      // fetch_page = 服务端整体重载了上下文：只保留“最新一轮”仍待回填，
      // 更早的撤回轮一律视为服务端已承载，避免旧撤回被反复拼进 prompt
      if (/fetch_page/.test(ctx.url || '')) {
        var pendingIdx = [];
        hist.forEach(function (h, i) { if (h.role === 'assistant' && h.recalled && !h.serverHas) pendingIdx.push(i); });
        if (pendingIdx.length > 1) {
          for (var k = 0; k < pendingIdx.length - 1; k++) { hist[pendingIdx[k]].serverHas = true; changed = true; }
        }
      }
      if (changed) { DSE.config.saveSessions(); return JSON.stringify(j); }
    } catch (e) {}
    return raw;
  },

  init: function () {
    var AR = this;
    // 记录用户发送（原始输入，不含装饰）——在 prompt 模块之前注册
    DSE.net.addRequestMutator(function (obj, ctx) {
      if (obj && typeof obj.prompt === 'string' && /\/chat\/completion$/.test(ctx.url)) {
        var sid = obj.chat_session_id || '';
        var isSummary = DSE.modules.summary && DSE.modules.summary.isSummaryRequest(ctx);
        if (!isSummary) AR.pushHistory(sid, { role: 'user', content: obj.prompt, ts: Date.now(), recalled: false });
      }
    });
    // 响应转换
    DSE.net.addResponseTransformer(function (raw, ctx) {
      if (ctx.isGen) return AR.transformSSE(raw, ctx);
      if (ctx.isHistory) return AR.transformHistory(raw, ctx);
      return raw;
    });
    // 流结束时落库本轮 AI 回复
    DSE.on('sse:finished', function (p) { AR.commitTurn(p.ctx); });
  }
};
DSE.modules.antiRecall = AntiRecall;

/* ===== modules/prompt.js ===== */
/* ============================================================
 * modules/prompt：提示词工程（只改写请求体 prompt，绝不出现在用户气泡）
 *  - 助手模式：系统提示词按会话隔离（独立开关）
 *  - Waifu 模式：系统提示词跨会话持久 + 第一人称总结 + 上下文窗口
 *  - 默认不注入 Markdown 指令（模型本来就会）；关闭 Markdown 时才要求纯文本
 *  - 所有模板在设置面板透明可见、可编辑
 * ============================================================ */
var Prompt = {
  defaults: {
    multi: '接下来你可以像真人聊天一样，把一次回复拆成几条短消息连续发出：每条消息之间单独占一行，只用一个反斜杠“\\”分隔。分条时用口语化的短句即可，不需要使用 Markdown 格式，也不要提及本规则或输出序号。',
    noMarkdown: '请用纯文本回复，不要使用任何 Markdown 语法（不要 # 标题、* 列表、**加粗**、代码块等），像日常聊天一样自然表达。',
    image: '如果需要给用户发图片，可以直接使用 Markdown 图片语法 ![描述](图片直链) 插入，一张图单独成段。',
    recallBrief: '注意：上面包含一条此前被系统撤回、现已补回的对话。为避免再次撤回，请用简短的方式回应（简单确认、轻描淡写或自然转开话题），不要重复敏感细节。',
    summary: '请把我们到目前为止的对话压缩成一份长期记忆摘要，要求：\n1) 必须以你的第一人称书写，用“我”指代你（AI），用“用户”指代对方，严禁混淆你我身份；\n2) 保留：用户的关键信息与偏好、重要决定、关系/剧情进展、尚未结束的话题；\n3) 若下面提供了“旧摘要”，请在其基础上增量更新、去重合并，禁止把新旧摘要简单堆叠，整体不超过 {max} 字；\n4) 直接输出摘要正文，不要任何开场白或解释。\n\n旧摘要：\n{old}\n\n最近对话：\n{dialog}'
  },
  tpl: function (name) {
    var custom = DSE.config.get('templates');
    if (custom && typeof custom[name] === 'string') return custom[name];
    return this.defaults[name];
  },
  setTpl: function (name, val) {
    var c = DSE.config.load();
    if (!c.templates) c.templates = JSON.parse(JSON.stringify(this.defaults));
    c.templates[name] = val; DSE.config.save();
  },
  resetTpl: function () { var c = DSE.config.load(); c.templates = JSON.parse(JSON.stringify(this.defaults)); DSE.config.save(); },

  historyText: function (sid, limit) {
    var hist = (DSE.modules.antiRecall && DSE.modules.antiRecall.getHistory(sid)) || [];
    if (limit > 0) hist = hist.slice(-limit);
    return hist.map(function (m) {
      var who = m.role === 'user' ? '用户' : '我（AI）';
      var c = m.recalled ? '[曾被撤回的本地缓存内容] ' + m.content : m.content;
      return who + '：' + c;
    }).join('\n');
  },

  // 注入块统一打标记：历史回读时由 net 层剥离，刷新/换设备后用户气泡依然干净
  wrap: function (text) { return '⟦DSE⟧\n' + text + '\n⟦/DSE⟧'; },

  build: function (original, ctx) {
    var cfg = DSE.config.get();
    var sid = ctx.sid || Utils.currentSid();
    var sess = DSE.config.session(sid);
    var head = [];

    if (cfg.mode === 'waifu') {
      var sp = (cfg.waifu.systemPrompt || '').trim();
      if (sp) head.push(sp);
      var summary = (sess.waifuSummary || '').trim();
      if (summary) head.push('[长期记忆摘要 —— 这是你们此前的共同经历，自然延续，不要复述]\n' + summary);
      var win = this.historyText(sid, cfg.waifu.ctxWindowMessages);
      if (win) head.push('[近期对话上下文]\n' + win);
    } else if (cfg.systemPromptEnabled) {
      var asp = (sess.assistantSystemPrompt || '').trim();
      if (asp) head.push('[系统设定]\n' + asp);
      if (cfg.privacyMode === 'full') {
        var full = this.historyText(sid, cfg.privacyCtxMessages);
        if (full) head.push('[历史对话]\n' + full);
      }
    }

    if (cfg.timeInject) {
      var d = new Date(), w = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
      var p = function (n) { return String(n).padStart(2, '0'); };
      head.push('[当前时间 ' + d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ' 星期' + w + ']');
    }
    if (!cfg.markdownPretty) head.push(this.tpl('noMarkdown'));
    else if (cfg.markdownImage) head.push(this.tpl('image'));
    if (cfg.bubbleSplit) head.push(this.tpl('multi'));

    if (cfg.privacyMode === 'smart' && ctx.recalledRounds && ctx.recalledRounds.length) {
      var block = ['[以下为此前被系统撤回、现从本地补回的对话轮次，请作为上下文理解]'];
      ctx.recalledRounds.forEach(function (r) {
        if (r.user) block.push('用户：' + r.user.content);
        block.push('我（AI）：' + r.assistant.content);
      });
      block.push('[补回内容结束]');
      head.push(block.join('\n'));
      if (cfg.recallBriefHint) head.push(this.tpl('recallBrief'));
    }

    // 所有注入块包标记，用户原文保持在标记外
    return head.map(this.wrap).join('\n\n') + '\n\n' + original;
  },

  preview: function () {
    return this.build('（你当前输入的消息会放在这里）', { sid: Utils.currentSid(), recalledRounds: [] })
      .replace(/⟦DSE⟧\n?/g, '').replace(/\n?⟦\/DSE⟧/g, '');
  },

  init: function () {
    var c = DSE.config.load();
    var need = JSON.parse(JSON.stringify(this.defaults));
    if (!c.templates) c.templates = need;
    else Object.keys(need).forEach(function (k) { if (typeof c.templates[k] !== 'string') c.templates[k] = need[k]; });
    DSE.config.save();

    DSE.net.addRequestMutator(function (obj, reqCtx) {
      if (!obj || typeof obj.prompt !== 'string' || !obj.prompt) return;
      if (DSE.modules.summary && DSE.modules.summary.isSummaryRequest(reqCtx)) return;
      var sid = obj.chat_session_id || '';
      var rounds = DSE.modules.antiRecall ? DSE.modules.antiRecall.pendingRecalledRounds(sid) : [];
      obj.prompt = Prompt.build(obj.prompt, { sid: sid, recalledRounds: rounds });
    });
  }
};
DSE.modules.prompt = Prompt;

/* ===== modules/think.js ===== */
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

/* ===== modules/bubbles.js ===== */
/* ============================================================
 * modules/bubbles：气泡材质 + 用户气泡 + AI 多消息分割（\ 分隔）
 *  策略（按用户要求）：流式过程中保持单气泡原样；AI 回复【完成后】
 *  再用【真实节点】切割成多条并依次浮现 —— 代码块复制/mermaid 交互完整保留。
 *  历史消息（重载/切回/虚拟列表重挂）同步复原、不播动画。
 *  实测官网软换行 = 一个 <p> 内 <span><br><span>，按 <br> 行级切分。
 * ============================================================ */
var Bubbles = {
  histMarked: false,
  rafQ: false,
  stableMap: new WeakMap(),

  applyPreset: function () {
    var p = DSE.config.get('bubblePreset') || 'water';
    document.body.classList.remove('dse-preset-default', 'dse-preset-frosted', 'dse-preset-water');
    document.body.classList.add('dse-preset-' + p);
  },
  styleUserBubbles: function () {
    var nodes = document.querySelectorAll(SEL.userBubble);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.closest('textarea') || n.closest('[contenteditable="true"]')) continue;
      n.classList.add('dse-user-bubble');
    }
  },
  unwrap: function (md) {
    var wraps = md.querySelectorAll('[data-dse-grp]');
    for (var i = wraps.length - 1; i >= 0; i--) {
      var w = wraps[i];
      while (w.firstChild) md.appendChild(w.firstChild);
      w.remove();
    }
  },

  // 真实节点：把块按 <br> 切成行（节点被移动，保留事件/复制按钮）
  splitBlock: function (block) {
    if (block.tagName === 'PRE' || block.querySelector('pre,svg,table,ul,ol')) {
      return [{ atomic: block }];
    }
    var lines = [[]], kids = block.childNodes;
    for (var i = 0; i < kids.length; i++) {
      var n = kids[i];
      if (n.nodeType === 1 && n.tagName === 'BR') lines.push([]);
      else lines[lines.length - 1].push(n);
    }
    return lines.map(function (seg) {
      var text = seg.map(function (x) { return x.textContent || ''; }).join('');
      var hasMedia = seg.some(function (x) { return x.nodeType === 1 && /IMG|SVG|CODE/.test(x.tagName); });
      if (!hasMedia && /^\\{1,2}$/.test(text.replace(/\s/g, ''))) return { sep: true };
      return { line: seg, cls: block.className || '', tag: block.tagName };
    });
  },
  makeP: function (nodes, tag, cls) {
    var p = document.createElement(tag || 'p');
    if (cls) p.className = cls;
    nodes.forEach(function (n) { p.appendChild(n); });
    return p;
  },
  makeBubble: function (blocks) {
    var b = document.createElement('div');
    b.className = 'dse-ai-bubble'; b.setAttribute('data-dse-grp', '1');
    blocks.forEach(function (blk) { b.appendChild(blk); });
    return b;
  },
  makeImgMsg: function (img) {
    var d = document.createElement('div');
    d.className = 'dse-img-msg'; d.setAttribute('data-dse-grp', 'img');
    d.appendChild(img); return d;
  },

  hasSep: function (md) {
    var blocks = md.children;
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.tagName === 'PRE' || b.querySelector('pre,svg,table,ul,ol')) continue;
      // 整块就是分隔符
      if (/^\\{1,2}$/.test((b.textContent || '').replace(/\s/g, ''))) return true;
      // 行内分隔
      if (b.querySelectorAll('br').length) {
        var segs = [[]], kd = b.childNodes;
        for (var j = 0; j < kd.length; j++) {
          if (kd[j].nodeType === 1 && kd[j].tagName === 'BR') segs.push([]);
          else segs[segs.length - 1].push(kd[j]);
        }
        for (var s = 0; s < segs.length; s++) {
          var t = segs[s].map(function (x) { return x.textContent || ''; }).join('').replace(/\s/g, '');
          if (/^\\{1,2}$/.test(t)) return true;
        }
      }
    }
    return false;
  },

  // 回复完成后切割（真实节点移动）
  finalize: function (md, animate) {
    if (md.dataset.dseSplitDone === '1') return;
    this.unwrap(md);
    var groups = [[]], sepSeen = false;
    var kids = Array.prototype.slice.call(md.childNodes);
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.nodeType === 3) { if (k.textContent.trim()) groups[groups.length - 1].push(k); continue; }
      if (k.nodeType !== 1) continue;
      var pieces = this.splitBlock(k);
      for (var j = 0; j < pieces.length; j++) {
        var pc = pieces[j];
        if (pc.atomic) { groups[groups.length - 1].push(pc.atomic); continue; }
        if (pc.sep) { sepSeen = true; groups.push([]); continue; }
        groups[groups.length - 1].push(pieces.length === 1 ? k : this.makeP(pc.line, pc.tag, pc.cls));
      }
      if (pieces.length > 1 && k.parentNode) k.remove();
    }
    groups = groups.filter(function (g) {
      return g.some(function (n) {
        if (n.nodeType === 3) return !!n.textContent.trim();
        return !!(n.textContent || '').trim() || (n.querySelector && n.querySelector('img,svg,pre,table'));
      });
    });
    if (!sepSeen || groups.length <= 1) { md.classList.add('dse-ai-bubble'); md.dataset.dseSplitDone = '1'; return; }

    md.classList.remove('dse-ai-bubble');
    var self = this, gi = 0, frag = document.createDocumentFragment();
    var wantImg = DSE.config.get('markdownImage');
    var bubbles = [];
    groups.forEach(function (g) {
      if (wantImg) {
        var imgs = [];
        g.forEach(function (n) {
          if (n.nodeType === 1 && n.querySelectorAll) n.querySelectorAll('img').forEach(function (im) {
            var pp = im.closest('p');
            if (pp && (pp.textContent || '').trim() === '') imgs.push({ im: im, p: pp });
          });
        });
        imgs.forEach(function (o) { var ix = g.indexOf(o.p); if (ix >= 0) g.splice(ix, 1); });
        if (g.length) bubbles.push(self.makeBubble(g));
        imgs.forEach(function (o) { bubbles.push(self.makeImgMsg(o.im)); });
      } else bubbles.push(self.makeBubble(g));
    });
    bubbles.forEach(function (b) { frag.appendChild(b); });
    md.appendChild(frag);

    // 依次浮现（模拟真人逐条发送）
    if (animate && DSE.config.get('bubbleSplitAnim')) {
      var lo = DSE.config.get('splitTypingMin'), hi = DSE.config.get('splitTypingMax');
      bubbles.forEach(function (b, idx) {
        b.classList.add('dse-wait');
        setTimeout(function () {
          b.classList.remove('dse-wait');
          b.classList.add('dse-bubble-in');
        }, Math.round(idx * Utils.rand(lo, hi)));
      });
    }
    md.dataset.dseSplitDone = '1';
  },

  processAi: function (md) {
    if (md.closest('.ds-think-content')) return;
    var splitOn = DSE.config.get('bubbleSplit');

    if (!splitOn) {
      if (md.dataset.dseSplitDone === '1') { this.unwrap(md); md.dataset.dseSplitDone = ''; }
      md.classList.add('dse-ai-bubble');
      return;
    }
    // 已切割完成：保持
    if (md.dataset.dseSplitDone === '1') return;

    var live = md.dataset.dseLive === '1';
    if (!live) {
      // 历史消息：回复早已完成，直接静态切割（不播动画）
      if (this.hasSep(md)) this.finalize(md, false);
      else md.classList.add('dse-ai-bubble');
      md.dataset.dseSplitDone = '1';
      return;
    }
    // 实时消息：流式期间保持单气泡，等 finished / 稳定观察器切割
    md.classList.add('dse-ai-bubble');
  },

  // 稳定观察：兜底判断“回复完成”（sse:finished 之外的保险）
  watchStable: function () {
    if (!DSE.config.get('bubbleSplit')) return;
    var self = this, mds = document.querySelectorAll(SEL.aiMarkdown);
    mds.forEach(function (md) {
      if (md.dataset.dseLive !== '1' || md.dataset.dseSplitDone === '1') return;
      if (md.closest('.ds-think-content')) return;
      var loading = md.querySelector('[class*="loading-dots"],[class*="cursor-blink"]');
      if (loading) { self.stableMap.set(md, { len: -1, n: 0 }); return; }
      var len = md.textContent.length;
      var st = self.stableMap.get(md) || { len: -1, n: 0 };
      if (len === st.len && len > 0) st.n++; else st = { len: len, n: 0 };
      self.stableMap.set(md, st);
      if (st.n >= 2 && self.hasSep(md)) self.finalize(md, true);
    });
  },

  scan: function () {
    if (!document.body) return;
    this.applyPreset();
    this.styleUserBubbles();
    var mds = document.querySelectorAll(SEL.aiMarkdown + ',' + SEL.aiMarkdownAny);
    var seen = new Set();
    for (var i = 0; i < mds.length; i++) {
      var md = mds[i];
      if (seen.has(md)) continue; seen.add(md);
      if (md.closest('.ds-think-content')) continue;
      if (!this.histMarked) md.dataset.dseLive = '0';
      else if (!md.dataset.dseLive) md.dataset.dseLive = '1';
      try { this.processAi(md); } catch (e) {}
    }
    this.histMarked = true;
  },
  requestScan: function () {
    if (this.rafQ) return; this.rafQ = true;
    var self = this;
    requestAnimationFrame(function () { self.rafQ = false; self.scan(); });
  },
  resetHistoryFlag: function () { this.histMarked = false; this.requestScan(); },

  init: function () {
    var self = this;
    Utils.onReady(function () {
      self.scan();
      new MutationObserver(function () { self.requestScan(); })
        .observe(document.body, { childList: true, subtree: true, characterData: true });
      setInterval(function () { self.watchStable(); }, 900);
      var last = location.href;
      setInterval(function () {
        if (location.href !== last) { last = location.href; setTimeout(self.resetHistoryFlag.bind(self), 500); }
      }, 400);
    });
    // 流结束 → 给当前实时消息做最终切割
    DSE.on('sse:finished', function () {
      setTimeout(function () {
        var mds = document.querySelectorAll(SEL.aiMarkdown);
        for (var i = mds.length - 1; i >= 0; i--) {
          var md = mds[i];
          if (md.dataset.dseLive === '1' && md.dataset.dseSplitDone !== '1' && self.hasSep(md)) {
            self.finalize(md, true); break;
          }
        }
      }, 350);
    });
    DSE.on('cfg:change', function (e) {
      if (['bubbleSplit', 'bubblePreset', 'markdownImage'].indexOf(e.path) !== -1) self.requestScan();
    });
  }
};
DSE.modules.bubbles = Bubbles;

/* ===== modules/tweaks.js ===== */
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

/* ===== modules/context.js ===== */
/* ============================================================
 * modules/context：会话上下文用量统计（不在对话界面插 UI，只供设置面板展示）
 * ============================================================ */
var Context = {
  sid: '', committed: 0, turn: 0,
  loadSid: function (sid) {
    if (sid === this.sid) return;
    this.sid = sid; this.turn = 0;
    this.committed = DSE.config.session(sid).usedTokens || 0;
    this.emit();
  },
  onTokens: function (v) { this.turn = Math.max(this.turn, v); this.emit(); },
  onFinished: function () {
    if (this.turn > 0) {
      this.committed += this.turn;
      var s = DSE.config.session(this.sid);
      s.usedTokens = this.committed; DSE.config.saveSessions();
      this.turn = 0; this.emit();
    }
  },
  onHistory: function (payload) {
    try {
      var biz = payload.json && payload.json.data && payload.json.data.biz_data;
      var msgs = biz && (biz.chat_messages || biz.messages) || [];
      var text = '';
      msgs.forEach(function (m) {
        (m.fragments || []).forEach(function (f) { text += f.content || ''; });
        if (typeof m.content === 'string') text += m.content;
      });
      var est = Utils.estimateTokens(text);
      if (est > this.committed) {
        this.committed = est;
        DSE.config.session(this.sid).usedTokens = est; DSE.config.saveSessions();
        this.emit();
      }
    } catch (e) {}
  },
  // 供面板调用：返回 {used, limit, pct, level}
  getUsage: function () {
    var limit = DSE.config.get('ctxLimitTokens') || 128000;
    var used = this.committed + this.turn;
    var pct = Math.min(100, Math.round(used / limit * 100));
    return { used: used, limit: limit, pct: pct, level: pct >= 90 ? 'danger' : (pct >= 75 ? 'warn' : 'ok') };
  },
  emit: function () { DSE.emit('ctx:update', this.getUsage()); },
  reset: function () { this.committed = 0; this.turn = 0; var s = DSE.config.session(this.sid); s.usedTokens = 0; DSE.config.saveSessions(); this.emit(); },
  init: function () {
    var self = this;
    DSE.on('sse:tokens', function (p) { self.loadSid(p.ctx.sid || Utils.currentSid()); self.onTokens(p.used); });
    DSE.on('sse:finished', function () { self.onFinished(); });
    DSE.on('history:loaded', function (p) { self.loadSid(p.ctx.sid || Utils.currentSid()); self.onHistory(p); });
    setInterval(function () { var s = Utils.currentSid(); if (s !== self.sid) self.loadSid(s); }, 1000);
    DSE.on('cfg:change', function (e) { if (e.path === 'ctxLimitTokens') self.emit(); });
  }
};
DSE.modules.context = Context;

/* ===== modules/nav.js ===== */
/* ============================================================
 * modules/nav：消息上/下导航（保留原版能力，适配新选择器与移动端）
 * ============================================================ */
var Nav = {
  list: [], idx: -1, bar: null,
  USER_SEL: '.ds-message:not(:has(.ds-markdown))',
  AI_SEL: '.ds-message:has(.ds-markdown)',
  scan: function () {
    var out = [];
    document.querySelectorAll(this.USER_SEL + ',' + this.AI_SEL).forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      out.push({ el: el, y: r.top + window.scrollY });
    });
    out.sort(function (a, b) { return a.y - b.y; });
    this.list = out;
  },
  visualIndex: function () {
    var center = window.scrollY + innerHeight / 2, best = -1, bd = Infinity;
    this.list.forEach(function (m, i) {
      var r = m.el.getBoundingClientRect(), c = window.scrollY + r.top + r.height / 2;
      if (Math.abs(center - c) < bd) { bd = Math.abs(center - c); best = i; }
    });
    return best;
  },
  scrollParent: function (el) {
    var p = el.parentElement;
    while (p) {
      var s = getComputedStyle(p);
      if (p.scrollHeight > p.clientHeight && /(auto|scroll)/.test(s.overflowY)) return p;
      p = p.parentElement;
    }
    return document.documentElement;
  },
  goto: function (dir) {
    this.scan();
    if (!this.list.length) return;
    var vi = this.visualIndex();
    if (this.idx < 0 || Math.abs(vi - this.idx) > 2) this.idx = vi;
    this.idx += dir === 'prev' ? -1 : 1;
    this.idx = Math.max(0, Math.min(this.list.length - 1, this.idx));
    var m = this.list[this.idx]; if (!m) return;
    var sp = this.scrollParent(m.el), r = m.el.getBoundingClientRect(), pr = sp.getBoundingClientRect();
    var top = r.top - pr.top + (sp === document.documentElement ? window.scrollY : sp.scrollTop) - sp.clientHeight * 0.3;
    sp.scrollTo({ top: top, behavior: 'smooth' });
    var self = this;
    m.el.classList.remove('dse-nav-flash'); void m.el.offsetWidth; m.el.classList.add('dse-nav-flash');
    setTimeout(function () { m.el.classList.remove('dse-nav-flash'); }, 1500);
  },
  ensure: function () {
    if (this.bar) return;
    this.bar = document.createElement('div'); this.bar.id = 'dse-nav';
    this.bar.innerHTML =
      '<button data-n="prev" title="上一条消息"><svg viewBox="0 0 20 20"><path d="M9.3 5.7a1 1 0 0 1 1.4 0l5.8 5.7a1 1 0 0 1-1.4 1.5L10 7.8l-5 5a1 1 0 1 1-1.5-1.4z"/></svg></button>' +
      '<button data-n="next" title="下一条消息"><svg viewBox="0 0 20 20" style="transform:rotate(180deg)"><path d="M9.3 5.7a1 1 0 0 1 1.4 0l5.8 5.7a1 1 0 0 1-1.4 1.5L10 7.8l-5 5a1 1 0 1 1-1.5-1.4z"/></svg></button>';
    var self = this;
    this.bar.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (b) self.goto(b.getAttribute('data-n'));
    });
    document.body.appendChild(this.bar);
  },
  init: function () {
    var self = this;
    Utils.onReady(function () {
      var sync = function () { self.ensure(); self.bar.style.display = DSE.config.get('navButtons') ? '' : 'none'; };
      sync(); setInterval(sync, 1500);
      DSE.on('cfg:change', sync);
    });
  }
};
DSE.modules.nav = Nav;

/* ===== modules/zoom.js ===== */
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

/* ===== modules/summary.js ===== */
/* ============================================================
 * modules/summary：Waifu 长期对话总结（第一人称、增量更新、防臃肿）
 *  - 不走底层接口 / PoW：直接把总结提示词填入当前对话输入框，
 *    由官网原生管线发送（PoW、令牌全部由官网自己处理）
 *  - 手动 / 自动（超阈值，发送前 toast 提示）两种触发
 *  - AI 的总结回复到达后自动落库为 waifuSummary，并把这轮
 *    “总结请求/总结回复”从本地历史里剔除，避免上下文窗口膨胀
 * ============================================================ */
var Summary = {
  activePrompt: null,        // 正在发送的总结提示词原文（供 prompt 层跳过注入）
  activeSid: null,           // 对应的会话
  cooldownUntil: {},

  // prompt 层调用：判断某个出站请求是不是我们的总结请求（是的话不再叠加 waifu 注入）
  isSummaryRequest: function (ctx) {
    if (!this.activePrompt) return false;
    var obj = ctx && ctx.bodyObj;
    return !!(obj && typeof obj.prompt === 'string' && obj.prompt === this.activePrompt);
  },

  buildPrompt: function (sid) {
    var sess = DSE.config.session(sid);
    var hist = (DSE.modules.antiRecall && DSE.modules.antiRecall.getHistory(sid)) || [];
    var dialog = hist.slice(-60).map(function (m) {
      return (m.role === 'user' ? '用户' : '我（AI）') + '：' + m.content;
    }).join('\n');
    var tpl = DSE.modules.prompt.tpl('summary');
    return tpl
      .replace('{max}', '500')
      .replace('{old}', sess.waifuSummary || '（暂无）')
      .replace('{dialog}', dialog || '（暂无）');
  },

  // 用 React 受控组件的原生 setter 写入输入框，再模拟回车发送
  fillAndSend: function (text) {
    var ta = document.querySelector(DSE.SEL.textarea);
    if (!ta) return false;
    var proto = window.HTMLTextAreaElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    ta.focus();
    setter.call(ta, text);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    setTimeout(function () {
      ta.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
      }));
      ta.dispatchEvent(new KeyboardEvent('keypress', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
      }));
      ta.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
      }));
    }, 120);
    return true;
  },

  // 触发一次总结（isAuto=true 为自动触发）
  run: function (sid, isAuto) {
    sid = sid || Utils.currentSid();
    if (!sid) { Utils.toast('请先进入一个对话'); return Promise.resolve(null); }
    if (this.activeSid === sid) return Promise.resolve(null);
    var prompt = this.buildPrompt(sid);
    if (!this.fillAndSend(prompt)) { Utils.toast('未找到输入框，无法发送总结请求'); return Promise.resolve(null); }
    this.activePrompt = prompt;
    this.activeSid = sid;
    Utils.toast(isAuto
      ? '对话较长，正在通过当前对话更新长期记忆摘要…'
      : '已发送总结请求，回复将自动存为长期记忆');
    return Promise.resolve(prompt);
  },

  init: function () {
    var self = this;

    // AI 回复结束：若这一轮是我们的总结请求，则把回复落库并清理本地历史中的该轮
    DSE.on('sse:finished', function (p) {
      var sid = (p.ctx && p.ctx.sid) || Utils.currentSid();
      if (!self.activeSid || sid !== self.activeSid) return;
      var AR = DSE.modules.antiRecall;
      var hist = AR ? AR.getHistory(sid) : [];
      // antiRecall 不会把总结请求计入 hist，因此末轮就是总结回复
      var last = hist[hist.length - 1];
      var answer = (last && last.role === 'assistant') ? (last.content || '').trim() : '';
      if (answer) {
        DSE.config.setSession(sid, { waifuSummary: answer });
        DSE.emit('summary:updated', { sid: sid, summary: answer });
        // 从本地上下文窗口剔除这条总结回复，防止摘要文本反复堆叠膨胀
        if (AR) {
          var s = DSE.config.session(sid);
          s.hist = hist.slice(0, -1);
          DSE.config.saveSessions();
        }
        Utils.toast('长期记忆摘要已更新');
      }
      self.activePrompt = null;
      self.activeSid = null;
    });

    // 自动总结：每轮结束后按阈值判定，带冷却
    DSE.on('sse:finished', function () {
      var cfg = DSE.config.get();
      if (cfg.mode !== 'waifu' || !cfg.waifu.autoSummary) return;
      var sid = Utils.currentSid();
      if (!sid || self.activeSid === sid) return;
      if (Date.now() < (self.cooldownUntil[sid] || 0)) return;
      var used = DSE.modules.context.getUsage().used;
      if (used >= cfg.waifu.summaryThreshold) {
        self.cooldownUntil[sid] = Date.now() + 180000; // 3 分钟冷却
        setTimeout(function () { self.run(sid, true); }, 1200);
      }
    });
  }
};
DSE.modules.summary = Summary;

/* ===== modules/buttons.js ===== */
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

/* ===== settings/panel.js ===== */
/* ============================================================
 * settings/panel：统一设置面板（移动优先；分区清晰、高级项折叠）
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
        [['look', '外观'], ['chat', '对话'], ['role', '角色'], ['priv', '隐私'], ['more', '其他']].map(function (t, i) {
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
        this.sw('hideDownloadApp', '隐藏“下载应用”', '仅移动版欢迎页') +
        '<div class="dse-range-row"><span>页面缩放</span><input type="range" min="60" max="180" step="5" data-bind="zoom"><span class="dse-range-val" data-val="zoom"></span></div>' +
      '</div>' +

      // ============ 对话 ============
      '<div class="dse-p-page" data-page="chat">' +
        '<div class="dse-p-title">消息呈现</div>' +
        this.sw('thinkAutoCollapse', '思考区自动折叠', '默认收起 DeepSeek 思考过程') +
        this.sw('hideAiActions', '隐藏 AI 操作栏', '复制/重试/赞/踩/分享') +
        this.sw('hideAiBadge', '隐藏 AI 生成标识', '底部“内容由 AI 生成”等') +
        '<div class="dse-p-sec">多消息气泡（\\ 分隔）</div>' +
        this.sw('bubbleSplit', '开启多消息分割', 'AI 回复完成后按单独一行的 \\ 切成多条，依次浮现') +
        this.sw('bubbleSplitAnim', '逐条浮现动画', '模拟真人发送间隔') +
        '<div class="dse-p-sec">Markdown</div>' +
        this.sw('markdownPretty', 'Markdown 排版美化', '关闭后会提示 AI 用纯文本回复') +
        this.sw('markdownImage', '图片贴图', '允许 AI 用图片链接贴图，多消息下图片独立成条') +
        this.sw('timeInject', '隐式时间注入') +
        '<div class="dse-p-sec">本会话上下文用量</div>' +
        '<div class="dse-ctx"><div class="dse-ctx-track"><div class="dse-ctx-fill" data-ctx-fill></div></div>' +
        '<div class="dse-ctx-meta"><span data-ctx-text></span><span data-ctx-pct></span></div></div>' +
        '<div class="dse-range-row"><span>上下文上限</span><input type="range" min="32000" max="256000" step="8000" data-bind="ctxLimitTokens"><span class="dse-range-val" data-val="ctxLimitTokens"></span></div>' +
        '<button class="dse-btn ghost" data-act="resetCtx" style="width:100%;margin-top:4px">重新统计</button>' +
      '</div>' +

      // ============ 角色 / 提示词 ============
      '<div class="dse-p-page" data-page="role">' +
        '<div class="dse-p-title">运行模式</div>' +
        '<div class="dse-cards" data-cards="mode">' +
          '<button class="dse-card" data-card-val="assistant"><b>AI 助手</b><small>系统提示词仅当前会话生效，互不干扰，适合日常问答</small></button>' +
          '<button class="dse-card" data-card-val="waifu"><b>Waifu 长期陪伴</b><small>系统提示词跨会话持久，配合第一人称长期记忆摘要</small></button>' +
        '</div>' +
        '<div data-modebox="assistant" style="margin-top:12px">' +
          this.sw('systemPromptEnabled', '启用本会话系统提示词', '只对当前会话生效，切换会话互不影响') +
          '<textarea class="dse-text" data-session="assistantSystemPrompt" placeholder="写给当前会话 AI 的系统设定…" style="min-height:110px;margin-top:8px"></textarea>' +
        '</div>' +
        '<div data-modebox="waifu" style="display:none;margin-top:12px">' +
          '<div class="dse-row-desc" style="margin-bottom:6px">跨会话系统提示词（持久保存，随时可改）</div>' +
          '<textarea class="dse-text" data-bind="waifu.systemPrompt" style="min-height:150px"></textarea>' +
          '<div class="dse-btn-row"><button class="dse-btn ghost" data-act="waifuExample">恢复范例</button>' +
          '<button class="dse-btn danger" data-act="waifuClear">清空</button></div>' +
          '<details class="dse-details"><summary>长期记忆（对话总结）</summary>' +
            this.sw('waifu.autoSummary', '自动总结', '上下文较长时自动更新长期记忆') +
            '<div class="dse-range-row"><span>总结阈值</span><input type="range" min="2000" max="20000" step="1000" data-bind="waifu.summaryThreshold"><span class="dse-range-val" data-val="waifu.summaryThreshold"></span></div>' +
            '<div class="dse-range-row"><span>上下文窗口</span><input type="range" min="10" max="120" step="2" data-bind="waifu.ctxWindowMessages"><span class="dse-range-val" data-val="waifu.ctxWindowMessages"></span></div>' +
            '<div class="dse-btn-row"><button class="dse-btn" data-act="summaryNow">立即总结</button>' +
            '<button class="dse-btn ghost" data-act="clearSummary">清除摘要</button></div>' +
            '<div class="dse-row-desc" style="margin:8px 0 4px">当前长期记忆摘要</div>' +
            '<textarea class="dse-text" data-session="waifuSummary" style="min-height:100px"></textarea>' +
          '</details>' +
        '</div>' +
        '<details class="dse-details"><summary>高级：注入指令模板（透明可编辑）</summary>' +
          '<label class="dse-row-desc">多消息分割指令</label><textarea class="dse-text" data-tpl="multi"></textarea>' +
          '<label class="dse-row-desc" style="margin-top:8px">纯文本指令（关闭 Markdown 时）</label><textarea class="dse-text" data-tpl="noMarkdown"></textarea>' +
          '<label class="dse-row-desc" style="margin-top:8px">图片贴图指令</label><textarea class="dse-text" data-tpl="image"></textarea>' +
          '<label class="dse-row-desc" style="margin-top:8px">撤回后简短回应</label><textarea class="dse-text" data-tpl="recallBrief"></textarea>' +
          '<label class="dse-row-desc" style="margin-top:8px">长期总结指令</label><textarea class="dse-text" data-tpl="summary" style="min-height:110px"></textarea>' +
          '<div class="dse-btn-row"><button class="dse-btn ghost" data-act="resetTpl">恢复默认</button>' +
          '<button class="dse-btn ghost" data-act="previewPrompt">预览实际注入</button></div>' +
          '<div class="dse-preview" data-preview style="display:none"></div>' +
        '</details>' +
      '</div>' +

      // ============ 隐私 ============
      '<div class="dse-p-page" data-page="priv">' +
        '<div class="dse-p-title">防撤回 / 隐私模式</div>' +
        '<div class="dse-seg" data-seg="privacyMode">' +
          '<button data-v="off">关闭</button><button data-v="smart">智能</button><button data-v="full">全量</button></div>' +
        '<div class="dse-row-desc" style="margin:8px 0">智能：连续撤回连续补回；服务端重载上下文后只补最新缺失轮次。全量：每次发送都拼接本地历史。</div>' +
        this.sw('recallBriefHint', '撤回后提示 AI 简短回应', '降低再次撤回概率与 prompt 压力') +
        '<div class="dse-range-row"><span>全量历史条数</span><input type="range" min="5" max="100" step="5" data-bind="privacyCtxMessages"><span class="dse-range-val" data-val="privacyCtxMessages"></span></div>' +
        '<div class="dse-p-sec" data-hist-info></div>' +
        '<button class="dse-btn danger" data-act="clearHist" style="width:100%">清除本会话本地历史</button>' +
      '</div>' +

      // ============ 其他 ============
      '<div class="dse-p-page" data-page="more">' +
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
        if (valEl) valEl.textContent = inp.type === 'range' ? inp.value : '';
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

  action: function (act) {
    var sid = Utils.currentSid();
    if (act === 'close') return this.hide();
    if (act === 'uploadBg') return this.el.querySelector('[data-role="bgFile"]').click();
    if (act === 'defaultBg') { DSE.config.set('bg.url', DSE.config.defaults.bg.url); DSE.config.set('bg.upload', ''); DSE.config.set('bg.enabled', true); this.refresh(); }
    if (act === 'clearBg') { DSE.config.set('bg.enabled', false); DSE.config.set('bg.upload', ''); this.refresh(); }
    if (act === 'resetCtx') { DSE.config.setSession(sid, { usedTokens: 0 }); this.refreshCtx(); }
    if (act === 'summaryNow') { var p = DSE.modules.summary.run(sid, false); this.hide(); return p; }
    if (act === 'clearSummary') { DSE.config.setSession(sid, { waifuSummary: '' }); this.refresh(); }
    if (act === 'waifuExample') { DSE.config.set('waifu.systemPrompt', DSE.config.defaults.waifu.systemPrompt); this.refresh(); }
    if (act === 'waifuClear') { DSE.config.set('waifu.systemPrompt', ''); this.refresh(); }
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
      v.textContent = resolve(c, v.getAttribute('data-val')) ?? '';
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
    el.querySelectorAll('[data-modebox]').forEach(function (b) {
      b.style.display = b.getAttribute('data-modebox') === c.mode ? '' : 'none';
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
    var k = function (n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); };
    this.el.querySelector('[data-ctx-text]').textContent = '约 ' + k(u.used) + ' / ' + k(u.limit) + (u.pct >= 75 ? '（建议新对话）' : '');
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
    DSE.on('summary:updated', function () { if (self.open_) self.refresh(); });
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'B' || e.code === 'KeyB')) { e.preventDefault(); self.toggle(); }
    });
    window.addEventListener('resize', function () { if (self.open_) self.position(); });
  }
};
DSE.modules.panel = Panel;

/* ===== main.js ===== */
/* ============================================================
 * main：初始化（顺序敏感：网络层 → 防撤回 → 提示词 → 其余）
 * ============================================================ */
(function () {
  var order = [
    'net',            // 先 patch XHR/fetch
    'antiRecall',     // 请求记录（原始 prompt）+ 响应拦截
    'prompt',         // 请求装饰（在 antiRecall 之后）
    'background',
    'think',
    'bubbles',
    'tweaks',
    'context',
    'nav',
    'zoom',
    'summary',
    'buttons',
    'panel'
  ];
  function boot() {
    try {
      order.forEach(function (name) {
        var m = DSE.modules[name];
        if (m && typeof m.init === 'function') {
          try { m.init(); } catch (e) { console.error('[DSE] init fail:', name, e); }
        }
      });
      DSE.emit('dse:ready');
      console.log('%c[DeepSeek Enhance] v' + DSE.version + ' loaded', 'color:#3b6cf6');
    } catch (e) { console.error('[DSE] boot error', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/* ===== footer.js ===== */
/* footer：IIFE 闭合 */
})();

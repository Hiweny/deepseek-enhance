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

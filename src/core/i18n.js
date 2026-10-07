/* ============================================================
 * core/i18n：界面中英文（以中文字符串为 key，缺省回退中文）
 *  - lang = auto：按 navigator.language 自动判定（zh* → 中文，其余 → English）
 *  - lang = zh / en：手动覆盖
 *  - 只做中英文；未收录的 key 原样返回中文，保证不出现空串
 * ============================================================ */
var I18N = {
  dict: {
    // ---------- 通用 ----------
    '外观': 'Appearance',
    '对话': 'Chat',
    '提示词': 'Prompt',
    '其他': 'More',
    '界面': 'Interface',
    '关于': 'About',
    '上传': 'Upload',
    '默认图': 'Default',
    '关闭背景': 'Disable',
    '模糊': 'Blur',
    '亮度': 'Brightness',
    '页面缩放': 'Page zoom',
    '恢复默认': 'Reset',
    '展开': 'Expand',
    '收起': 'Collapse',

    // ---------- 外观 ----------
    '背景图片': 'Background image',
    '图片 URL，留空用默认图': 'Image URL, leave empty for default',
    '气泡材质': 'Bubble style',
    '默认': 'Default',
    '清爽浅色气泡': 'Clean light bubbles',
    'iOS 磨砂': 'iOS Frosted',
    '高饱和毛玻璃': 'High-saturation blur',
    '水玻璃': 'Aqua glass',
    '通透高光（推荐）': 'Translucent highlight (recommended)',
    '输入框悬浮磨砂': 'Floating frosted input',
    '统一顶栏': 'Unified top bar',
    '消除分享按钮单独底色/标题黑条': 'Remove the share-button patch and title bar',
    '磨砂': 'Frosted',
    '背景透出': 'Transparent',
    '隐藏“下载应用”': 'Hide "Download app"',
    '仅欢迎页，不影响新建对话/侧栏按钮': 'Welcome page only; keeps other buttons',

    // ---------- 对话 ----------
    '消息呈现': 'Messages',
    '思考区自动折叠': 'Auto-collapse thinking',
    '默认收起 DeepSeek 思考过程': 'Collapse DeepSeek reasoning by default',
    '代码块自动折叠': 'Auto-collapse code blocks',
    '超过设定行数自动收起，点击展开': 'Collapse when longer than the limit; click to expand',
    '代码块显示行数': 'Code lines shown',
    '隐藏 AI 生成标识': 'Hide AI notice',
    '底部“内容由 AI 生成”等': 'The "AI-generated" notice at the bottom',
    'Markdown 排版美化': 'Markdown styling',
    '只改本地样式，不向 AI 发送任何指令': 'Local styling only; sends nothing to the AI',
    'LaTeX 公式渲染': 'LaTeX rendering',
    '离线 KaTeX，渲染 \\( \\)、\\[ \\]、$ 公式': 'Offline KaTeX for \\( \\), \\[ \\], $ formulas',
    '隐式时间注入': 'Implicit time injection',
    '本会话上下文用量': 'Session context usage',
    '上下文上限': 'Context limit',
    '快速模式约 128K，专家模式(V3.2/V4)约 1M，按所用模型调整。': 'About 128K for fast mode, about 1M for expert (V3.2/V4). Adjust to your model.',
    '立即重新统计（拉取本会话历史）': 'Recount now (fetch this session history)',
    '约': 'About',
    '（估算）': ' (estimated)',
    '（建议新对话）': ' (start a new chat)',

    // ---------- 提示词 ----------
    '本会话系统提示词': 'Session system prompt',
    '只对当前这一个会话生效；切换到其它会话互不影响、互不可见。': 'Applies to this session only; each session is independent and private.',
    '启用本会话系统提示词': 'Enable session system prompt',
    '写给当前会话 AI 的系统设定…': 'System setup for this session\'s AI…',
    '高级：实际注入内容预览 / 模板': 'Advanced: injected preview / templates',
    '撤回后简短回应（模板，可编辑）': 'Brief reply after recall (editable template)',
    '预览实际注入': 'Preview injection',

    // ---------- 其他 ----------
    '防撤回 / 隐私': 'Anti-recall / Privacy',
    '关闭': 'Off',
    '智能': 'Smart',
    '全量': 'Full',
    '智能：连续撤回连续补回；服务端重载上下文后只补最新缺失轮次。全量：每次发送都拼接本地历史。': 'Smart: refill recalled rounds continuously; after the server reloads context only the latest missing round is refilled. Full: attach local history to every message.',
    '撤回后提示 AI 简短回应': 'Ask AI for a brief reply after recall',
    '降低再次撤回概率与 prompt 压力': 'Lower re-recall risk and prompt load',
    '全量历史条数': 'History messages (full mode)',
    '清除本会话本地历史': 'Clear local history for this session',
    '便捷功能': 'Shortcuts',
    '消息上下导航按钮': 'Message navigation buttons',
    '一键全屏按钮': 'Fullscreen button',
    '语言': 'Language',
    '自动': 'Auto',
    '中文': '中文',
    '界面语言（跟随系统 / 中文 / English）': 'Interface language (system / Chinese / English)',
    '本地记录 {n} 条': 'Local records: {n}',
    '，待回填撤回 {n} 条': ', to refill {n}',

    // ---------- 按钮 title / toast ----------
    '上一条消息': 'Previous message',
    '下一条消息': 'Next message',
    '一键全屏': 'Fullscreen',
    'DeepSeek Enhance 设置': 'DeepSeek Enhance settings',
    '图片不要超过 8MB': 'Image must be under 8MB',
    '请先进入一个对话': 'Open a conversation first',
    '正在重新统计…': 'Recounting…',
    '统计完成：约': 'Done: about ',
    'tokens': 'tokens',
    '统计失败（可能需要联网）': 'Failed (network required?)',
    '已拦截一次撤回，真实内容已本地保留': 'Recall intercepted; content kept locally',

    // ---------- 关于 ----------
    'about.text': 'DeepSeek Enhance v{v} · everything runs locally, no data uploaded<br>Selector archive: docs/dom-research.md.'
  },
  _lang: null,
  resolve: function () {
    var pref = (DSE.config && DSE.config.get('lang')) || 'auto';
    if (pref === 'zh' || pref === 'en') return pref;
    var nav = String((navigator.language || navigator.userLanguage || 'en')).toLowerCase();
    return nav.indexOf('zh') === 0 ? 'zh' : 'en';
  },
  lang: function () { if (!this._lang) this._lang = this.resolve(); return this._lang; },
  refresh: function () { this._lang = this.resolve(); return this._lang; },
  t: function (key, params) {
    var l = this.lang();
    var d = this.dict;
    var s;
    if (l === 'en' && typeof d[key] === 'string') s = d[key];
    else s = key;
    if (params) {
      s = s.replace(/\{(\w+)\}/g, function (m, k) { return (params[k] != null ? params[k] : m); });
    }
    return s;
  }
};
DSE.i18n = I18N;
DSE.t = function (k, p) { return I18N.t(k, p); };
DSE.register('i18n', I18N);

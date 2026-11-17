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

/* ---- cdn.deepseek.com/chat-demo（API 使用 demo）----
 * 与主站是两套独立 bundle：消息区复用 ds-markdown / ds-think-content /
 * md-code-block 等稳定设计 token（上方共用，无需覆盖），但页面骨架与消息
 * 行类名全是构建哈希（message-e1faee / container-_4cfe7 / area-_3d93a /
 * title-_3d93a / actions-_4cfe7 / scroll-_7ccaf）。官方重建 demo 后这些
 * 哈希会变，届时只需更新下面这一组——与主站选择器同一维护模式。
 * demo 无虚拟列表：消息在普通滚动容器 .scroll-_7ccaf 内顺序渲染；
 * 用户消息行与 AI 消息底部容器复用同一 CSS 模块（container-_4cfe7），
 * 取消息行会重复命中，故用户行改用气泡类 bubble-_4cfe7。 */
var SEL_DEMO = {
  virtualList: '.scroll-_7ccaf',
  msg: '.message-e1faee, .bubble-_4cfe7',
  msgRowAi: '.message-e1faee',
  msgRowUser: '.bubble-_4cfe7',
  userMsg: '.bubble-_4cfe7',
  userBubble: '.bubble-_4cfe7',
  aiActionBar: '.actions-_4cfe7',
  thinkBlock: '.area-_3d93a',
  thinkHeader: '.title-_3d93a',
  // demo 是客户端直连 api.deepseek.com：无服务端会话 id、无 history_messages
  // 接口、无 accumulated_token_usage 真值——上下文用量统计整段不适用，
  // 设置面板里对应分区（含"立即重新统计"按钮）据此隐藏。
  noServerSession: true
};
if (location.hostname === 'cdn.deepseek.com') {
  Object.keys(SEL_DEMO).forEach(function (k) { SEL[k] = SEL_DEMO[k]; });
}
DSE.SEL = SEL;
DSE.register('selectors', SEL);

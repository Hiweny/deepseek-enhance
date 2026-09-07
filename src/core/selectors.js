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

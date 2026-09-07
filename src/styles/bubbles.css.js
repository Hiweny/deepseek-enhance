/* styles/bubbles：气泡材质（默认 / 磨砂 / 水玻璃）
 * 直接命中官网稳定类名（AI 正文 / 用户气泡），不依赖 JS 逐节点补 class，
 * 从而避免虚拟列表重挂载时“先原生样式闪一下再变成自定义样式”的闪烁/跳动。
 * AI 气泡的视觉属性一律 !important：本站样式表后于脚本注入，同特异性下会覆盖脚本。
 * 不做尾巴、不移动任何节点，官网长消息“展开/收起”保持可点。 */
Bridge.addStyle(`
/* ===== 消息行间距：AI 与下一条消息不贴在一起 ===== */
._4f9bf79, ._9663006{margin-bottom:14px}
._4f9bf79:last-child, ._9663006:last-child{margin-bottom:4px}

/* ===== 通用几何（只设一次，各预设只换质感） ===== */
.ds-markdown.ds-assistant-message-main-content{border-radius:16px!important;padding:12px 16px!important;line-height:1.7;word-break:break-word}
.fbb737a4{border-radius:16px!important;transition:filter .2s, background .2s}

/* ===== 用户长消息折叠：展开托底必须融入气泡，不能露出官网原色小块；不抢文本点击区 ===== */
.fbb737a4 .ds-collapsible-text-toggle-button{background:transparent!important}
.fbb737a4 .ds-collapsible-text-toggle-button .d077096d,
.fbb737a4 .ds-collapsible-text-toggle-button ._08f18f6{background:transparent!important;box-shadow:none!important}
.fbb737a4 .ds-collapsible-text-toggle-button ._08f18f6{color:inherit!important;opacity:.92}

/* ---------- 预设：default ---------- */
body.dse-preset-default .ds-markdown.ds-assistant-message-main-content{background:#fff!important;color:#1d2129!important;border:1px solid rgba(0,0,0,.06)!important;box-shadow:0 1px 6px rgba(15,23,42,.06)!important}
body.dse-preset-default.dark .ds-markdown.ds-assistant-message-main-content{background:rgba(40,42,50,.92)!important;color:#e7e9ee!important;border-color:rgba(255,255,255,.08)!important}
body.dse-preset-default .fbb737a4{background:#e8eefc!important;color:#1d2129!important}
body.dse-preset-default.dark .fbb737a4{background:rgba(59,108,246,.32)!important;color:#eef2ff!important}

/* ---------- 预设：frosted（iOS 磨砂） ---------- */
body.dse-preset-frosted .ds-markdown.ds-assistant-message-main-content{background:rgba(255,255,255,.86)!important;color:#1d2129!important;border:1px solid rgba(255,255,255,.65)!important;backdrop-filter:blur(22px) saturate(180%);-webkit-backdrop-filter:blur(22px) saturate(180%);box-shadow:0 6px 24px rgba(15,23,42,.08),inset 0 1px 0 rgba(255,255,255,.6)!important}
body.dse-preset-frosted.dark .ds-markdown.ds-assistant-message-main-content{background:rgba(40,42,50,.55)!important;color:#e7e9ee!important;border-color:rgba(255,255,255,.12)!important;box-shadow:0 6px 24px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.10)!important}
body.dse-preset-frosted .fbb737a4{background:rgba(59,108,246,.72)!important;color:#fff!important;backdrop-filter:blur(22px) saturate(180%);-webkit-backdrop-filter:blur(22px) saturate(180%)}
body.dse-preset-frosted.dark .fbb737a4{background:rgba(59,108,246,.6)!important}

/* ---------- 预设：water（水玻璃） ---------- */
body.dse-preset-water .ds-markdown.ds-assistant-message-main-content{position:relative;color:#1d2129!important;border:1px solid rgba(255,255,255,.6)!important;background:linear-gradient(135deg,rgba(255,255,255,.9),rgba(255,255,255,.74))!important;backdrop-filter:blur(18px) saturate(165%) brightness(1.03);-webkit-backdrop-filter:blur(18px) saturate(165%) brightness(1.03);box-shadow:0 4px 20px rgba(15,23,42,.08),inset 0 1px 0 rgba(255,255,255,.75)!important}
body.dse-preset-water .ds-markdown.ds-assistant-message-main-content::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:1;background:linear-gradient(160deg,rgba(255,255,255,.3),rgba(255,255,255,0) 42%)}
body.dse-preset-water .ds-markdown.ds-assistant-message-main-content > *{position:relative;z-index:2}
body.dse-preset-water.dark .ds-markdown.ds-assistant-message-main-content{color:#e7e9ee!important;border-color:rgba(255,255,255,.12)!important;background:linear-gradient(135deg,rgba(48,51,62,.86),rgba(34,36,44,.72))!important;backdrop-filter:blur(18px) saturate(165%);-webkit-backdrop-filter:blur(18px) saturate(165%);box-shadow:0 4px 20px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.08)!important}
body.dse-preset-water .fbb737a4{color:#fff!important;background:linear-gradient(135deg,rgba(59,108,246,.66),rgba(92,132,255,.5))!important;backdrop-filter:blur(14px) saturate(165%);-webkit-backdrop-filter:blur(14px) saturate(165%);box-shadow:0 4px 16px rgba(59,108,246,.22),inset 0 1px 0 rgba(255,255,255,.28)}
body.dse-preset-water.dark .fbb737a4{background:linear-gradient(135deg,rgba(59,108,246,.55),rgba(80,110,220,.42))!important}
`);

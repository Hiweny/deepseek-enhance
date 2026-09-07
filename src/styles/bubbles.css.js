/* styles/bubbles：气泡材质（默认 / 磨砂 / 水玻璃），不做尾巴、不改结构 */
Bridge.addStyle(`
/* ===== 消息行间距：AI 与下一条消息不贴在一起 ===== */
._4f9bf79, ._9663006{margin-bottom:14px}
._4f9bf79:last-child, ._9663006:last-child{margin-bottom:4px}

/* ===== AI 气泡 ===== */
.dse-ai-bubble{position:relative;border-radius:16px;padding:12px 16px;margin:0;
  line-height:1.7;word-break:break-word;transition:background .2s, box-shadow .2s, border-color .2s}
/* ===== 用户气泡（站点容器 .fbb737a4），只改质感，不动布局/折叠交互 ===== */
.dse-user-bubble{position:relative;border-radius:16px!important;transition:filter .2s, background .2s}
/* 用户长消息的官网“展开/收起”保持可点、不被遮挡 */
.dse-user-bubble .ds-collapsible-text,
.dse-user-bubble [class*="collapsible"]{position:relative;z-index:2}

/* ---------- 预设：default ---------- */
body.dse-preset-default .dse-ai-bubble{background:#fff;color:#1d2129;border:1px solid rgba(0,0,0,.06);
  box-shadow:0 1px 6px rgba(15,23,42,.06)}
body.dse-preset-default.dark .dse-ai-bubble{background:rgba(40,42,50,.92);color:#e7e9ee;border-color:rgba(255,255,255,.08)}
body.dse-preset-default .dse-user-bubble{background:#e8eefc!important;color:#1d2129!important}
body.dse-preset-default.dark .dse-user-bubble{background:rgba(59,108,246,.32)!important;color:#eef2ff!important}

/* ---------- 预设：frosted（iOS 磨砂） ---------- */
body.dse-preset-frosted .dse-ai-bubble{background:rgba(255,255,255,.86);color:#1d2129;
  border:1px solid rgba(255,255,255,.65);backdrop-filter:blur(22px) saturate(180%);-webkit-backdrop-filter:blur(22px) saturate(180%);
  box-shadow:0 6px 24px rgba(15,23,42,.08), inset 0 1px 0 rgba(255,255,255,.6)}
body.dse-preset-frosted.dark .dse-ai-bubble{background:rgba(40,42,50,.55);color:#e7e9ee;border-color:rgba(255,255,255,.12);
  box-shadow:0 6px 24px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.10)}
body.dse-preset-frosted .dse-user-bubble{background:rgba(59,108,246,.72)!important;color:#fff!important;
  backdrop-filter:blur(22px) saturate(180%);-webkit-backdrop-filter:blur(22px) saturate(180%)}
body.dse-preset-frosted.dark .dse-user-bubble{background:rgba(59,108,246,.6)!important}

/* ---------- 预设：water（水玻璃：高光+折射感） ---------- */
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
`);

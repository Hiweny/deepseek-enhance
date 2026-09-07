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

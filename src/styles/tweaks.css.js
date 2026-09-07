/* styles/tweaks：思考区卡片、顶栏统一、输入框悬浮磨砂、标识隐藏 */
Bridge.addStyle(`
/* ===== 思考区：统一磨砂卡片（折叠/展开同一容器，内层不再有原生黑条） ===== */
._74c0879{background:var(--dse-frost)!important;border:1px solid var(--dse-border)!important;
  border-radius:14px!important;margin:2px 0 14px!important;padding:4px 8px!important;
  overflow:hidden;backdrop-filter:blur(14px) saturate(150%);-webkit-backdrop-filter:blur(14px) saturate(150%);
  box-shadow:var(--dse-shadow)}
/* 内层所有容器透明，避免出现第二块黑/白条 */
._74c0879 ._245c867,._74c0879 ._34a54ec,._74c0879 .c99b79f8,
._74c0879 .c2b72bb8,._74c0879 ._8f7678d{background:transparent!important;box-shadow:none!important}
/* 官网折叠头用 ::before/::after 伪元素铺了一层纯色条（直角、深色），必须移除 */
._74c0879 ._245c867::before,._74c0879 ._245c867::after,
._74c0879 ._34a54ec::before,._74c0879 ._34a54ec::after{content:none!important;background:none!important;box-shadow:none!important}
._74c0879 ._5ab5d64{padding:6px 4px!important;border-radius:10px!important;min-height:auto!important;height:auto!important}
._74c0879 .ds-think-content{background:transparent!important;padding:4px 6px 8px!important}
._74c0879 .ds-think-content *{background:transparent!important}

/* 通用隐藏标记（移动版下载应用/AI 标识等由 JS 命中后打上） */
[data-dse-hide]{display:none!important}
/* 隐藏底部“内容由 AI 生成，请仔细甄别” */
body.dse-hide-badge ._0fcaa63{display:none!important}

/* ===== 顶栏统一：标题/分享是两个独立 .the-header，共同容器 ._2be88ba =====
   只给共同容器一条完整磨砂，两个子 header 全透明 → 不再有“分享按钮单独底色/标题黑条” */
body.dse-fix-topbar ._2be88ba{background:var(--dse-frost-strong)!important;
  backdrop-filter:blur(20px) saturate(160%);-webkit-backdrop-filter:blur(20px) saturate(160%)}
body.dse-fix-topbar .the-header{background:transparent!important;
  backdrop-filter:none!important;-webkit-backdrop-filter:none!important;
  border-radius:0!important;box-shadow:none!important}
body.dse-fix-topbar .the-header .ds-button__background{background:transparent!important}

/* 自定义背景下：消除输入框下方白色/黑色条带与渐隐区 */
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

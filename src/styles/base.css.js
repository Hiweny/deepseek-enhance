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

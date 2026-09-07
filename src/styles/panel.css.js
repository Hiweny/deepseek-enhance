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

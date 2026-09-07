/* styles/markdown：Markdown 排版美化（受 markdownPretty 开关控制；避让原生 mermaid/代码工具条） */
Bridge.addStyle(`
body.dse-md-pretty .ds-markdown{font-size:15px;line-height:1.75;word-break:break-word}
body.dse-md-pretty .ds-markdown p{margin:0 0 .65em}
body.dse-md-pretty .ds-markdown p:last-child{margin-bottom:0}
body.dse-md-pretty .ds-markdown h1,body.dse-md-pretty .ds-markdown h2,body.dse-md-pretty .ds-markdown h3,body.dse-md-pretty .ds-markdown h4{margin:.8em 0 .5em;line-height:1.35;font-weight:650}
body.dse-md-pretty .ds-markdown h1{font-size:1.45em;padding-bottom:.3em;border-bottom:1px solid var(--dse-border)}
body.dse-md-pretty .ds-markdown h2{font-size:1.3em}
body.dse-md-pretty .ds-markdown h3{font-size:1.15em}
body.dse-md-pretty .ds-markdown h4{font-size:1.05em}
body.dse-md-pretty .ds-markdown ul,body.dse-md-pretty .ds-markdown ol{margin:.4em 0 .8em;padding-left:1.4em}
body.dse-md-pretty .ds-markdown li{margin:.22em 0}
body.dse-md-pretty .ds-markdown li::marker{color:var(--dse-accent)}
body.dse-md-pretty .ds-markdown a{color:var(--dse-accent);text-decoration:none;border-bottom:1px dashed currentColor}
body.dse-md-pretty .ds-markdown a:hover{opacity:.8}
body.dse-md-pretty .ds-markdown blockquote{margin:.6em 0;padding:.5em 12px;border-left:3px solid var(--dse-accent);
  background:var(--dse-accent-soft);border-radius:0 10px 10px 0;color:inherit;opacity:.92}
body.dse-md-pretty .ds-markdown blockquote p{margin:.2em 0}
body.dse-md-pretty .ds-markdown hr{border:none;height:1px;margin:10px 0;
  background:linear-gradient(90deg,transparent,var(--dse-border),transparent)}
body.dse-md-pretty .ds-markdown :not(pre)>code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  font-size:.88em;padding:.15em .45em;border-radius:6px;background:rgba(127,127,140,.16);
  border:1px solid var(--dse-border)}
body.dse-md-pretty.dark .ds-markdown :not(pre)>code{background:rgba(255,255,255,.1)}
body.dse-md-pretty .ds-markdown pre{border-radius:12px!important;padding:14px 16px!important;overflow:auto;
  border:1px solid var(--dse-border);font-size:13.5px;line-height:1.6;margin:.6em 0 .9em!important;
  background:rgba(17,21,30,.94)!important;color:#e6e9ef!important}
body.dse-md-pretty.dark .ds-markdown pre{background:rgba(10,12,18,.96)!important}
body.dse-md-pretty .ds-markdown pre code{color:inherit!important;background:none!important;border:none;padding:0!important;font-size:inherit}
body.dse-md-pretty .ds-markdown table{border-collapse:collapse;margin:.6em 0 .9em;display:block;overflow-x:auto;max-width:100%}
body.dse-md-pretty .ds-markdown th,body.dse-md-pretty .ds-markdown td{border:1px solid var(--dse-border);padding:7px 12px;text-align:left}
body.dse-md-pretty .ds-markdown th{background:var(--dse-accent-soft);font-weight:600}
body.dse-md-pretty .ds-markdown tr:nth-child(even) td{background:rgba(127,127,140,.06)}
body.dse-md-pretty .ds-markdown img{max-width:100%;border-radius:10px;margin:.4em 0}
body.dse-md-pretty .ds-markdown kbd{font-family:ui-monospace,monospace;font-size:.85em;padding:1px 7px;border-radius:6px;
  border:1px solid var(--dse-border);box-shadow:0 1px 0 var(--dse-border);background:var(--dse-frost)}
/* 任务列表：复选框对齐、原生感 */
body.dse-md-pretty .ds-markdown input[type=checkbox]{margin-right:.45em;accent-color:var(--dse-accent);transform:translateY(1px)}
body.dse-md-pretty .ds-markdown li:has(>input[type=checkbox]){list-style:none;margin-left:-1.2em}
/* 表格：表头吸顶浅底、圆角外框，斑马纹已在上方 */
body.dse-md-pretty .ds-markdown th{position:sticky;top:0;backdrop-filter:blur(6px)}
body.dse-md-pretty .ds-markdown table{border:1px solid var(--dse-border);border-radius:10px}
/* 图片：淡入，避免加载完成瞬间跳动 */
body.dse-md-pretty .ds-markdown img{background:rgba(127,127,140,.08);transition:opacity .3s}
/* 代码块横向滚动条更克制 */
body.dse-md-pretty .ds-markdown pre::-webkit-scrollbar{height:6px}
body.dse-md-pretty .ds-markdown pre::-webkit-scrollbar-thumb{background:rgba(127,127,140,.35);border-radius:3px}
/* 加粗/选中色统一 */
body.dse-md-pretty .ds-markdown strong{font-weight:700}
body.dse-md-pretty .ds-markdown ::selection{background:rgba(59,108,246,.22)}
/* 原生 mermaid：不干预内部 */
body.dse-md-pretty .ds-markdown [class*="mermaid"]{background:none!important;padding:0!important;border:none!important}
body.dse-md-pretty .ds-think-content .ds-markdown{font-size:13.5px;line-height:1.65;opacity:.86}
`);

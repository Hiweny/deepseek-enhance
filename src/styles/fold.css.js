/* styles/fold：代码块自动折叠条（纯样式层，融合进原生代码块） */
Bridge.addStyle(`
.md-code-block > .dse-code-fold{display:flex;align-items:center;justify-content:center;gap:6px;
  height:34px;margin:0;cursor:pointer;user-select:none;font-size:12px;line-height:1;
  color:rgba(127,127,140,.9);border-top:1px solid rgba(127,127,140,.16);
  transition:color .15s,background-color .15s;position:relative;z-index:1;
  -webkit-tap-highlight-color:transparent}
.md-code-block > .dse-code-fold:hover,.md-code-block > .dse-code-fold:focus-visible{color:#6b93ff;outline:none}
.md-code-block > .dse-code-fold svg{width:14px!important;height:14px!important;fill:currentColor;transition:transform .2s;flex:0 0 auto}
.md-code-block.dse-code-collapsed > .dse-code-fold svg{transform:rotate(180deg)}
.md-code-block.dse-code-expanded > .dse-code-fold svg{transform:rotate(0deg)}
.md-code-block.dse-code-collapsed > .dse-code-fold::before{content:"";position:absolute;left:0;right:0;bottom:100%;height:26px;
  pointer-events:none;background:linear-gradient(to bottom, rgba(0,0,0,0), var(--dse-fold-bg, rgba(17,21,30,.94)))}
.md-code-block.dse-code-expanded > .dse-code-fold{border-top-color:transparent}
.md-code-block.dse-code-collapsed > pre{overscroll-behavior:contain}
`);

/* ============================================================
 * main：初始化（顺序敏感：网络层 → 防撤回 → 提示词 → 其余）
 * ============================================================ */
(function () {
  var order = [
    'net',            // 先 patch XHR/fetch
    'antiRecall',     // 请求记录（原始 prompt）+ 响应拦截
    'prompt',         // 请求装饰（在 antiRecall 之后）
    'background',
    'think',
    'bubbles',
    'latex',
    'tweaks',
    'context',
    'nav',
    'zoom',
    'buttons',
    'panel'
  ];
  function boot() {
    try {
      order.forEach(function (name) {
        var m = DSE.modules[name];
        if (m && typeof m.init === 'function') {
          try { m.init(); } catch (e) { console.error('[DSE] init fail:', name, e); }
        }
      });
      DSE.emit('dse:ready');
      console.log('%c[DeepSeek Enhance] v' + DSE.version + ' loaded', 'color:#3b6cf6');
    } catch (e) { console.error('[DSE] boot error', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

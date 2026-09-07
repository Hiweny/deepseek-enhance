/* modules/bubbles：气泡材质开关。
 * 样式直接命中官网稳定类名（见 styles/bubbles.css.js），无需逐节点补 class，
 * 因此这里只负责在 body 上切换预设 class，彻底消除补 class 慢一帧导致的闪烁。 */
var Bubbles = {
  applyPreset: function () {
    var p = DSE.config.get('bubblePreset') || 'water';
    document.body.classList.remove('dse-preset-default', 'dse-preset-frosted', 'dse-preset-water');
    document.body.classList.add('dse-preset-' + p);
  },
  init: function () {
    this.applyPreset();
    DSE.on('cfg:change', function (e) { if (e.path === 'bubblePreset') Bubbles.applyPreset(); });
  }
};
DSE.modules.bubbles = Bubbles;

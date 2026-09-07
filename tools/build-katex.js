/* 把 KaTeX（JS + auto-render + CSS 内联 woff2 base64）打包成单个 vendor bundle */
const fs = require('fs'), path = require('path');
const K = path.join(__dirname, '..', 'vendor', 'katex');
let js = fs.readFileSync(path.join(K, 'katex.min.js'), 'utf8');
let ar = fs.readFileSync(path.join(K, 'contrib', 'auto-render.min.js'), 'utf8');
let css = fs.readFileSync(path.join(K, 'katex.min.css'), 'utf8');
css = css.replace(/url\(fonts\/([A-Za-z0-9_.-]+?\.woff2)\)/g, (m, name) => {
  const b64 = fs.readFileSync(path.join(K, 'fonts', name)).toString('base64');
  return 'url(data:font/woff2;base64,' + b64 + ')';
});
// auto-render 挂在 global.renderMathInElement；用 IIFE 喂给它 global
const out = '/* === KaTeX 0.16.11 离线内联 bundle（自动生成，勿手改；tools/build-katex.js） === */\n' +
  '(function(window){\n' + js + '\n' + ar + '\n' +
  'var __katexCss=' + JSON.stringify(css) + ';\n' +
  'window.DSEKatex={css:__katexCss,render:window.renderMathInElement||window.katex&&window.katex.renderToString};\n' +
  '})(window);\n';
fs.writeFileSync(path.join(__dirname, '..', 'vendor', 'katex.bundle.js'), out);
console.log('katex.bundle.js', (out.length/1024).toFixed(0)+'KB');

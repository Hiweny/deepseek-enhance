/* 构建脚本：按固定顺序拼接 src → 根目录 .user.js / .meta.js / dist/inject.js */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');

const ORDER = [
  ['bootstrap.js'],
  ['core/config.js'], ['core/selectors.js'], ['core/utils.js'], ['core/net.js'],
  ['styles/base.css.js'], ['styles/bubbles.css.js'], ['styles/markdown.css.js'],
  ['styles/tweaks.css.js'], ['styles/panel.css.js'],
  ['modules/background.js'], ['modules/antirecall.js'], ['modules/prompt.js'],
  ['modules/think.js'], ['modules/bubbles.js'], ['modules/tweaks.js'],
  ['modules/context.js'], ['modules/nav.js'], ['modules/zoom.js'],
  ['modules/buttons.js'],
  ['settings/panel.js'],
  ['main.js'], ['footer.js']
].map((x) => x[0]);

const header = read('header.user.js').trim();
const body = ORDER.map((f) => '\n/* ===== ' + f + ' ===== */\n' + read(f).trim()).join('\n');

const userJs = header + '\n' + body + '\n';
const meta = header.split('\n').filter((l) => l.startsWith('// ==UserScript==') ||
  l.startsWith('// ==/UserScript==') || /^\/\/\s*@/.test(l)).join('\n') + '\n';
const inject = body.trim() + '\n';

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'deepseek-enhance.user.js'), userJs);
fs.writeFileSync(path.join(ROOT, 'deepseek-enhance.meta.js'), meta);
fs.writeFileSync(path.join(ROOT, 'dist', 'inject.js'), inject);

// 语法校验（分别包成临时文件，header 注释不影响）
const tmp = path.join(ROOT, 'dist', '_check.js');
fs.writeFileSync(tmp, body);
try {
  execSync('node --check "' + tmp + '"', { stdio: 'inherit' });
} finally { fs.unlinkSync(tmp); }

const lines = userJs.split('\n').length;
console.log('build ok: deepseek-enhance.user.js', (userJs.length / 1024).toFixed(1) + 'KB', lines, 'lines');
console.log('           deepseek-enhance.meta.js, dist/inject.js');

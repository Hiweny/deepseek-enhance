# 深海女仆工坊 · 深海女仆皮肤（for DeepSeek Web / DeepSleep）

把 [Small-tailqwq/dsh-deep-whale](https://github.com/Small-tailqwq/dsh-deep-whale) 里的 **maid-atelier（深海女仆工坊）** 皮肤移植到 `chat.deepseek.com`。

## 目录

- `dse-maid.css`：主样式表。图片路径写成占位 `__BASE__xxx.webp`，注入前替换成实际前缀；
- `assets/`：压缩后的美术资源（WebP / PNG，共约 660 KB）。

APK 侧使用内联版（图片已 base64 进 CSS）：`android/app/src/main/assets/dse-theme/dse-maid.css`，
由 `WebViewAssetLoader` 以 `https://appassets.androidplatform.net/assets/` 提供，离线、零外部请求。

## 用法（其它环境）

```js
const base = 'https://raw.githubusercontent.com/Hiweny/deepseek-enhance/main/skin/maid-atelier/assets/';
const css = (await fetch(rawCss)).replaceAll('__BASE__', base);
const style = document.createElement('style');
style.textContent = css;
document.head.appendChild(style);
document.documentElement.setAttribute('data-dse-maid', '1');
document.body.classList.add('dse-maid');
```

深色由 DeepSeek 自身的 `body.dark` 决定（本套样式两套配色都写了），因此天然跟随系统。

## 覆盖范围

对话区（AI 磨砂阅读卡、用户气泡、思考块、代码块、表格、引用）、侧栏（玻璃质感 + 会话行 + 用户区 + 角落纹章）、
顶栏、输入框（金线蕾丝描边）、右侧悬浮工具条、官方「系统设置」弹窗与遮罩、本插件设置面板 `#dse-panel`、欢迎页、手机端窄屏适配。

## 授权与署名

- 代码（CSS/JS）：MIT，同本仓库；
- 美术资源：**禁止商业使用**，保留原权利人版权与 **CC BY-NC-SA 4.0** 授权（署名 — 非商业性使用 — 相同方式共享）。
- 署名链：
  1. 一创 **上善**（[Pixiv](https://www.pixiv.net/users/62155430)）
  2. 二创 **ZipZipPipe**（[Pixiv](https://www.pixiv.net/users/18604994)）
  3. 三创（皮肤）**Small-tailqwq**

原始许可证见上游仓库 `maid-atelier/LICENSE-ARTWORK` 与 `NOTICE`。

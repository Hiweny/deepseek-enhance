# DeepSeek Enhance

面向 [chat.deepseek.com](https://chat.deepseek.com/) 的油猴增强脚本：界面美化、水玻璃气泡、防撤回、按会话隔离的系统提示词、思考自动折叠、上下文用量等。手机浏览器（Kiwi / Edge / Safari 油猴扩展）与桌面端均适配，明暗双色自适应。

## 安装

先安装 Tampermonkey（或兼容用户脚本管理器），再点击安装：

**[deepseek-enhance.user.js](https://raw.githubusercontent.com/Hiweny/deepseek-enhance/main/deepseek-enhance.user.js)**

更新检查 meta：[deepseek-enhance.meta.js](https://raw.githubusercontent.com/Hiweny/deepseek-enhance/main/deepseek-enhance.meta.js)

设置入口在输入框工具条上（「深度思考 / 智能搜索」旁边的齿轮），位置与官网原生按钮一致，不新增悬浮入口。

## 功能

### 外观
- **全局背景**：内置默认背景图，支持填图片 URL 或上传本地图片；亮度 / 模糊可调（旧版无效的“透明度”已替换为亮度）。
- **水玻璃气泡**：默认 / iOS 磨砂 / 水玻璃三种质感预设，普通圆角气泡（不强行加 IM 尾巴），明暗自适应；**只加样式类、不移动官网任何 DOM 节点**，因此不会闪烁、跳动，也不影响官网对超长用户消息的“展开/收起”。
- **输入框磨砂玻璃**：悬浮毛玻璃，移动端与屏幕底部保持安全间距（间隙由背景透出，无黑条），并修掉输入框下方的白色/黑色渐变条。
- **顶栏统一（两种风格可切换）**：「磨砂」把标题区与分享按钮合并为同一条磨砂栏；「背景透出」让顶栏完全透明、背景图直接透上来（按钮不受影响）。修复移动端分享按钮单独一块底色、标题黑条的问题。
- **Markdown 本地美化**：标题、代码块（**保留官网原生复制/下载按钮**）、表格、引用、行内代码、任务列表统一排版，避让官网原生 Mermaid 渲染。只改本地样式，**不向 AI 发送任何 Markdown 指令**。
- **LaTeX 公式渲染**：官网默认不渲染 `\( \)`、`\[ \]`、`$...$`，脚本内置**离线 KaTeX**（字体全部内联，无外部请求），流式输出结束即渲染，行间公式可横向滚动，解析失败不炸排版。
- 可隐藏“内容由 AI 生成”标识。
- 仅移除移动端欢迎页的“下载应用”按钮，**保留**新建对话、展开侧栏按钮。

### 对话
- **思考自动折叠**：独立开关，默认开启，自动收起“深度思考”过程；折叠头与展开内容统一为磨砂卡片，用户手动展开后不再自动收起。
- **消息导航**：保留右侧上下两个跳转按钮，另可选一键全屏。
- **上下文用量**：只在设置面板内显示当前会话 token 用量与进度条（不在对话界面插 UI）。用量直接取每条历史消息自带的 `accumulated_token_usage` 最大值（服务端权威值，脚本注入前的旧对话也能精确显示），实时流取会话级最大值不累加，文本仅作兜底估算；「立即重新统计」会主动拉取本会话 history 接口重算。上限可在 128K（快速模式）~ 1M（专家模式 V3.2/V4）间调整，75% 提醒、90% 红色提示开新对话。
- AI 消息底部的复制/重试/赞/踩操作栏**保持官网原样**，消息间距正常。

### 系统提示词（按会话隔离，独立开关）
- 每个会话拥有独立的系统提示词，切换会话互不影响、互不可见。
- 注入只改写网络请求的 `prompt` 字段并用 `⟦DSE⟧` 标记包裹；历史接口回读时自动剥离，刷新、重新生成都不会让系统提示词出现在用户气泡里。
- 设置面板「提示词」页可编辑当前会话提示词、预览实际注入内容、编辑防撤回简短回应模板，全程透明。

### 隐私 / 防撤回
- 参照成熟的 Anti-recall 实现：SSE 流中先缓存真实内容，撤回信号（TEMPLATE_RESPONSE / CONTENT_FILTER）到达时把撤回动作替换为本地缓存 + 提示条；历史接口加载时用本地缓存回放被撤回消息。
- **智能模式（默认）**：连续撤回连续回填；旧撤回一旦随某次请求正常发出（服务端上下文已吃下）立即标记 `backfilled`，加上 `history_messages` 整体重载时的 `serverHas` 对账，双保险保证旧内容不会被反复拼进 prompt；并提示 AI 极简回应、自然转题，降低再次撤回概率。
- 防撤回拦截/回放全局生效，与隐私模式开关无关；智能/全量只影响请求里的上下文回填。v8.2 起 XHR 响应层严格照搬最初可用实现（单一 responseText 拥有者），消除两层 getter 互相覆盖导致的失效。
- **全量模式**：每轮携带指定条数的完整本地历史；**关闭**则不做任何请求改写。
- 本地历史按会话隔离，可在面板清除。

### 其他
- 时间注入开关、页面缩放；设置面板四页签（外观 / 对话 / 提示词 / 其他），移动端底部弹层不溢出、适配深色。

## 项目结构

```
src/
  header.user.js        油猴 metadata
  bootstrap.js          IIFE 外壳、GM/localStorage 桥、事件总线（注入版共用）
  core/                 config 存储、选择器表、工具函数、统一网络层
  styles/               全部样式（CSS-in-JS 模块）
  modules/              背景、气泡、思考折叠、防撤回、提示词、导航、缩放、顶栏微调等
  settings/panel.js     设置面板
  main.js / footer.js   装载顺序与收尾
vendor/katex*           KaTeX 离线运行库与内联字体 bundle（tools/build-katex.js 生成）
build.js                一键拼接：根目录 user.js / meta.js + dist/inject.js
dist/inject.js          无 GM 环境注入版（供 WebView 套壳使用）
android/                DeepSleep 原生 WebView 套壳工程
tools/                  构建辅助（KaTeX 打包）
docs/                   官网 DOM/协议实地调研档案与架构说明
```

## 构建

```bash
node tools/build-katex.js   # 仅首次/升级 KaTeX 时：把 vendor/katex 源打包成 vendor/katex.bundle.js
node build.js               # 拼接出最终脚本
```

产物：`deepseek-enhance.user.js`、`deepseek-enhance.meta.js`、`dist/inject.js`（三者内容同源，文件名不带版本号）。KaTeX 运行库与字体以 base64 内联在 `vendor/katex.bundle.js`，离线可用。

## Android 套壳（DeepSleep）

`android/` 是把同源 `dist/inject.js` 装进原生 WebView 的全屏套壳工程（应用名 DeepSleep）：

- **document-start 注入**：通过 androidx.webkit 的 `addDocumentStartJavaScript` 在页面任何脚本前运行；无论注册是否成功，onPageStarted/onPageFinished 都幂等补跑完整引导（`__DSE_INJECTED__` guard），三层兜底杜绝“主题生效但增强全死”；早期脚本与 inject.js 整体包在同一个 IIFE 内（顶层 `return` 会导致整段语法错误而静默失效，v8.3.1 已修复）；内联 JS 抽在无 Android 依赖的 `InlineJs.java`，`tools/Gen.java` 直接编译真实类拼出最终注入串再 `node --check`，防止拼接语法错误上线；
- **全屏沉浸**：edge-to-edge（`setDecorFitsSystemWindows(false)`）+ 仅保留 LAYOUT_STABLE/LAYOUT_FULLSCREEN/LAYOUT_HIDE_NAVIGATION 布局穿透标志 + 透明系统栏，手势导航下等同全屏、无黑线；**绝不使用** FLAG_FULLSCREEN / SYSTEM_UI_FLAG_HIDE_NAVIGATION / IMMERSIVE_STICKY——实测这些标志会同时让 adjustResize 与 IME insets 失效（键盘顶不起布局的共同根因）；
- **键盘适配（Android11 模拟器实测通过）**：edge-to-edge 下窗口不会自动 resize，由三通道处理键盘高度——首选 `WindowInsetsAnimationCompat` 在 IME 动画每一帧同步压缩 WebView 布局高度（输入框贴着键盘上沿一起滑动、无黑缝），现代 `WindowInsetsCompat.Type.ime()` 终值校准，`OnGlobalLayoutListener` 可见区域测量（SoftInputAssist 原理）兜底，非动画通道统一 60ms 去抖；关键：必须用该高度压缩 **WebView 的布局高度（bottomMargin）**而不是加 padding——Chromium WebView 的 fixed 元素锚定在自身视口底边，padding 不移动该底边（这是早期版本连原生官网输入框都顶不起来的根因），布局高度收缩后网页 visualViewport 同步收缩，fixed 输入框自然落到键盘上方，收起键盘对称恢复；覆写 `onCreateInputConnection`（多行 + `IME_ACTION_SEND`、清除 `IME_FLAG_NO_ENTER_ACTION`），输入法**同时保留「换行」键并显示独立「发送」动作键**；发送键精确命中 `.ds-button--primary.ds-button--filled` 蓝色实心圆（左侧 iconLabelPrimary 是附件键，不能点），回调必须 `runOnUiThread`；物理键盘 Enter 发送、Shift+Enter 换行；
- **系统级分享联动**：Manifest 注册 `ACTION_SEND text/plain`，任意 App 选中文本 → 分享 → DeepSleep，经 `@JavascriptInterface` 桥用 React 原生 setter 填入输入框；
- **线程安全**：输入法动作键回调在 IME binder 线程，`evaluateJavascript` 必须 `runOnUiThread` 回主线程，否则点发送即闪退；
- **APK 专属出厂默认**（document-start 仅在配置不存在时写入，不影响油猴脚本）：顶栏背景透出、全屏按钮关、时间注入开；
- **零白闪**：root/开屏/WebView 三层底色与官网 body 最终底色严格一致（实测深色 `#151517`、浅色 `#ffffff`）；document-start 注入首帧底色样式，**等 body 挂上 light/dark 主题类（且去掉 change-theme 过渡类）后再移除**（MutationObserver+6s 兜底），避免 load 早于主题应用造成的白闪；键盘弹收时窗口/容器底色同样与页面一致，杜绝 resize 缝隙黑闪；背景层高度钉在「键盘收起时的大视口」（visualViewport 变小时不更新基准、变大才更新），键盘弹起背景图不缩放、不闪烁；
- **流畅度**：显式硬件层 + `setOffscreenPreRaster(true)` 离屏预光栅化 + 关闭边缘回弹，滚动与 resize 更丝滑；APK 出厂默认（顶栏背景透出/全屏按钮关/时间注入开）用版本化迁移只强制一次，老版本升级也会纠正、之后用户自改不覆盖；
- **开屏页**：居中睡鲸 logo，底色随系统明暗（values-night），首屏渲染后淡出；
- **主题跟随系统**：document-start 按系统明暗写入 DeepSeek 主题键，系统切换后自动刷新；
- 保留文件上传（识图）、摄像头/麦克风按需授权、网页内返回。

```bash
node build.js
cd android && ./gradlew assembleRelease   # 产物 app/build/outputs/apk/release/app-release.apk
```

推送到 main 后 GitHub Actions（`.github/workflows/android.yml`）自动构建，Actions 页 Artifacts 可下载。

## 自测

`harness/` 为 Playwright 真机自测脚本（驱动真实 DeepSeek 页面，PC 1440×900 / 移动 390×844、明暗双色）：
- `t16-antirecall-unit.js`：伪造 SSE 撤回流 / 历史回放的确定性单测（替换、缓存、重复读取、连续撤回与重载对账、正常流不误伤）；
- `t17-walk.js`：思考折叠卡片、AI 操作栏、齿轮位置、上下文用量、移动欢迎页按钮；
- `t18-isolation.js`：系统提示词按会话隔离、刷新防泄露、旧对话用量、长消息折叠交互；
- `t20/t20c`：实时撤回流端到端、清缓存首载历史回放；`t22`：智能回填消费逻辑；`t23`：KaTeX 真实渲染与顶栏风格切换。

## 说明

- 脚本依赖官网当前的 CSS 类名与接口结构，官网大版本更新后个别选择器可能需要更新，集中维护在 `src/core/selectors.js` 与 `docs/dom-research.md`。
- 默认背景图为外链，失效后可在设置中更换 URL 或上传本地图片。

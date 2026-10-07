# DeepSeek 网页结构实测档案（chat.deepseek.com）

> 调研日期：2026-09-06
> 调研方式：真实 Chromium 146 + Playwright，使用测试账号登录后实地操作；桌面视口 1440×900、移动视口 390×844（iPhone UA + 触屏模拟），明暗两套主题均实测。
> ⚠️ DeepSeek 类名采用「语义类名 `ds-*`（较稳定）+ 哈希类名 `_xxxx/xxxxxxxx`（发版可能变）」混用。**优先使用 `ds-*` 语义类名**；必须用哈希类名时集中放在 `src/core/selectors.js`，失效后只改这一个文件。

## 1. 全局

| 项 | 结论 |
|---|---|
| 主题 | `<body class="zh_CN light">` / `zh_CN dark`；偏好存于 `localStorage['__appKit_@deepseek/chat_themePreference']`，值形如 `{"value":"dark","__version":"0"}`，写入后 reload 生效 |
| 路由 | SPA，会话 URL 形如 `/a/chat/s/<chat_session_id>`；欢迎页 `/`；用 URL 变化 + history hook 检测切换 |
| 消息列表 | **虚拟列表**：`.ds-virtual-list > .ds-virtual-list-items > .ds-virtual-list-visible-items`，滚动时消息节点会卸载/重挂——所有对消息的 DOM 改造必须**幂等**且能承受重挂，动画只允许播一次 |
| 输入框 | `textarea._27c9245`，父链 `textarea → ._24fad49 → ._020ab5b → ._77cefa5 → .aaff8b8f → ._871cbca`；输入工具条容器旧脚本使用 `.ec4f5d61`（2026-09-06 实测仍可注入成功） |
| 深度思考开关 | `localStorage['thinkingEnabled']`，值形如 `{"value":false,"__version":"2"}` |

## 2. 消息结构（实测）

### AI 消息
```
._4f9bf79（消息行，可能附带 d7dc56a8/_43c05b5）
├─ .ds-message._63c77b1
│  ├─ ._74c0879                     思考块（仅开启深度思考时存在）
│  │  ├─ ._245c867._34a54ec > ._5ab5d64   ← 点击它折叠/展开（标题行）
│  │  ├─ .c2b72bb8
│  │  ├─ .e1675d8b.ds-think-content._767406f  ← 思考正文
│  │  └─ ._8f7678d
│  └─ .ds-markdown.ds-assistant-message-main-content   ← AI 正文（语义类名）
└─ .ds-flex._0a3d93b               ← 操作栏（复制/重新生成/赞/踩/分享，5 个 ds-button--xs）
```

### 用户消息
```
._9663006（消息行）
├─ .d29f3d7d.ds-message._63c77b1
│  └─ .fbb737a4 > .ds-collapsible-text   ← 用户气泡正文
└─ ._11d6b3a > ._425ea0b > .ds-flex._78e0558  ← 用户消息的 2 个小按钮（编辑等）
```

判定口径（稳）：
- 用户消息：`.ds-message.d29f3d7d`，或 `.ds-message:not(:has(.ds-markdown))`
- AI 消息：`.ds-message:has(.ds-markdown)`
- AI 操作栏：`._4f9bf79 > .ds-flex`（行内除 `.ds-message` 外的 flex 子级）

## 3. Think 折叠机制（重要，和网上旧脚本不同）

- 折叠**不是**给容器加 `e47135bc` 类（该类在当前站点已不出现）。
- 实测 MutationObserver：点击 `._5ab5d64` 后，站点**直接把 `.ds-think-content` 与 `._8f7678d` 从 DOM 移除**；展开时再插回，并更换标题箭头 svg。
- 因此「是否已折叠」的唯一可靠判据：**`._74c0879` 内是否还存在 `.ds-think-content`**。自动折叠 = 仅当存在时点击一次，天然幂等。
- 程序内 `el.click()` 不触发，需要真实事件（Playwright 可信点击 / `dispatchEvent(MouseEvent)` 在部分时序下有效）；脚本里直接对标题元素派发完整 pointer/mouse 事件序列更稳。

## 4. 网络协议（实测抓包）

### 发送消息
`POST /api/v0/chat/completion`（XHR），请求体：
```json
{"chat_session_id":"uuid","parent_message_id":null,"model_type":"default",
 "prompt":"用户输入","ref_file_ids":[],"thinking_enabled":false,
 "search_enabled":true,"action":null,"preempt":false}
```
- **`prompt` 字段就是唯一提示词注入点**：在这里改写，页面上用户气泡仍渲染原始输入，重新生成也不会泄露。
- 其它生成类 URL：`/chat/regenerate`、`/chat/edit_message`、`/chat/continue`、`/chat/resume_stream`。

### SSE 返回（`Content-Type: text/event-stream`）
- 事件：`ready`（含 `request_message_id` / `response_message_id`）、`update_session`、`title`、`close`；数据行为 op 树：`{"v":{"response":{...}}}`、`{"p":"response","o":"BATCH","v":[...]}`、`{"p":"response/status","o":"SET","v":"FINISHED"}`。
- **token 用量**：`response.accumulated_token_usage` 逐次累加，BATCH 里也会出现 `{"p":"accumulated_token_usage","v":39}`——上下文进度条用它做真实计数，不拍脑袋估算。
- 撤回信号：BATCH 中 `fragments` 被整体替换为 `[{"type":"TEMPLATE_RESPONSE",...}]`，或 `status` 被置为 `CONTENT_FILTER`。要在替换发生**之前**缓存真实 fragments。

### 历史加载
- 实测接口为 `GET /api/v0/chat_session/fetch_page?lte_cursor.pinned=false`（旧脚本只拦了 `/chat/history_messages`，**需同时覆盖 fetch_page**）。
- 该请求返回 = 服务端当前持有的完整上下文；它一旦返回，意味着 DeepSeek 已重新整体加载上下文——防撤回智能模式据此清掉陈旧的待回填内容，只保留服务端上下文中仍缺失的最新撤回轮次。

## 5. 移动版与桌面版差异

| 项 | 桌面 | 移动（390 宽） |
|---|---|---|
| 「下载应用」按钮 | **不存在** | 欢迎页顶栏中部，外壳 `._2be88ba._1551317 .the-header`，按钮为 `ds-button--outlinedNeutral`，仅移动视口出现 |
| 顶栏 | 左侧会话列表；会话页右上角一个分享箭头 | 左汉堡、中间标题（`._9986c0c`：标题 `.d00ed9c9` + 模式 `.c03d486a`）、右侧「新对话(+)」「分享」两个 44×44 ds-button |
| 输入区 | 工具条横排 | 同构但更紧凑，面板必须底部滑出、宽度 ≤ 92vw |

## 6. 原生能力（不要重复造轮子）

- **Mermaid 原生渲染**：实测让 AI 输出 ` ```mermaid ` 代码块，站点直接渲染为 SVG（自带「图表/代码」切换、缩放、下载、全屏工具条）。旧脚本内置的手写 SVG mermaid 引擎（约 340 行）整体删除；Markdown 美化 CSS 不得破坏其图表容器与 svg。
- 代码块、KaTeX、引用、表格均由 `.ds-markdown` 内的原生类渲染，美化只做样式层覆盖，不改结构。

## 7. 自测方法（本仓库 harness/，不随发布）

- `harness/lib.js`：Playwright 驱动系统 Chromium，复用登录态 `mobile-state.json`，以 addInitScript 注入用户脚本并 polyfill GM_* API，等价模拟油猴/ WebView 注入。
- 每个功能必须留下「桌面/移动 × 明/暗」截图证据后才算完成。

## 8. v8.1 补充实测（2026-09-07）

- **思考折叠头的纯色条来自伪元素**：`._74c0879`（卡片外层）内部 `._245c867._34a54ec` 的 `::before/::after` 被站点设为纯色（暗色 rgb(21,21,23)、亮色近白），只改外层 background 盖不住，视觉上就是一条直角黑/白条。必须 `content:none!important` 移除这两个伪元素，再给外层做圆角磨砂。
- 折叠态：站点移除 `.ds-think-content`；展开态重新插回，二者共用 `._74c0879` 卡片，内层 `c99b79f8 / c2b72bb8 / _8f7678d` 全部透明即可统一。
- **用户长消息折叠**：`.fbb737a4` 内并列两个节点——`.ds-collapsible-text`（inline style `max-height:192px`）与展开按钮 `.ds-collapsible-text-toggle-button._5b3c8cd`；按钮外层 `pointer-events:none`，真正可点的是内部 `._08f18f6`（pointer-events:all）。气泡样式不得移动/包裹这两个节点。
- **欢迎页“下载应用”精确定位**：按钮本体容器 `._9579690`（文本恰为“下载应用”），它与「新对话」iconLabelPrimary 胶囊同处 `._1aa2651.the-header`；**只隐藏 `._9579690`，绝不能给 `.the-header` 整体打隐藏标记**（旧版误伤导致新建对话/侧栏按钮一起消失）。
- **SSE 增量解析**：响应改写会改变文本长度，事件解析游标必须按【原始 raw 长度】推进；防撤回转换器自行维护“持久行数组 + 已处理行数”，且 XHR responseText 会被站点重复读取，撤回发生后每次读取都要用持久行数组重建，不能提前 return 原文。
- **token 用量**：`accumulated_token_usage` 是服务端按整轮上下文累计的值，直接取会话级最大值，禁止逐轮相加；路径式 op `response/accumulated_token_usage` 也要识别。

## 9. v8.4 补充实测（2026-10-07，真实登录实测）

### 9.1 消息区真正的滚动容器（关键）
- 消息区是**内层滚动**，`window` 不滚动（`document.documentElement.scrollHeight == clientHeight`）。
- 真正的滚动容器：`.ds-virtual-list.ds-virtual-list--printable.ds-scroll-area`（`overflow-y:auto`，承载 `scrollTop/scrollHeight`）。
  结构：`.ds-virtual-list > .ds-virtual-list-items._6f2c522 > .ds-virtual-list-visible-items > .ds-message`。
  `items` 层高度 = 全部消息总高（虚拟列表用占位撑开），`visible-items` 只放已挂载的消息。
- **教训**：任何“滚动到某条消息”都必须操作这个容器；用 `window.scrollY / scrollTo` 一律无效（旧消息导航即因此定位错乱）。

### 9.2 长对话“向上滚动乱跳 / 冲到开头”的根因与修复
- 实测（68 条消息的长会话，向上滚 30 步）：原生最大反向上跳 ≈1140px；**加载旧版脚本后 ≈7359px**（甚至一步从 6424 跳到 15029）。
- 二分定位：把 `net/antiRecall/prompt` 保留、其余全关 → 无大跳；**加入 `think` 模块后立刻大跳**。
- 根因：旧 `think` 自动折叠是**对折叠头派发真实点击**，站点会把 `.ds-think-content` 从 DOM 移除；在虚拟列表里，消息被重挂载时会再次渲染出思考正文、脚本又点一次 → 消息高度反复突变 → 虚拟列表重算 → 滚动位置乱跳。
- 修复：折叠改为**纯 CSS**（`body.dse-think-collapse ._74c0879:not(.dse-think-open) .ds-think-content{display:none}`），不点击、不改 DOM；用户点击折叠头时接管为切换 `.dse-think-open` 类（阻止站点移除节点），若该块已无 `.ds-think-content` 则交回站点原生展开。
- 效果：同一测试 maxUp 从 ≈7359 降到 **≈735**（与原生同量级）。

### 9.3 代码块原生结构（用于自动折叠）
```
.ds-markdown.ds-assistant-message-main-content
└─ .md-code-block.md-code-block-light（暗色为 md-code-block-dark）
   ├─ .md-code-block-banner-wrap     ← 语言标签 + 「复制」「下载」（原生按钮，勿动）
   ├─ PRE（line-height 22px、padding 16px；每一行是一个直接子 <span>，行间以 \n 文本节点分隔）
   └─ svg ×2（装饰）
```
- 折叠实现：只给 `pre` 设 `max-height = 行数×lineHeight + paddingTop + paddingBottom`、`overflow-y:hidden`，并在 `.md-code-block` 末尾追加一个自建「展开」条（`.dse-code-fold`）。不移动/包裹任何站点节点，原生复制/下载按钮不受影响。
- 折叠条背景取 `pre` 的计算背景色做同色融合，深浅自适应；`svg` 需 `!important` 定尺寸（站点会把它撑满）。

### 9.4 其它
- 页面缩放走 `document.documentElement.style.zoom`，>100% 会把设置面板一起放大到屏幕外 → 上限收敛为 100%。
- 设置面板需按语言重渲染：语言存 `dse_config_v1.lang`（auto/zh/en）。

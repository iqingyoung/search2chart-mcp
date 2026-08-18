# search2chart-mcp
## Search once, chart instantly
## 搜索趋势，图表展示

> Turn search / research / any tabular data into **inline charts directly inside agent conversations**. One toolkit, two integration paths.

把「检索 / 研究 / 任意表格数据」变成**直接内联在 agent 对话流里的图表**。一个工具集，两条集成路径。

## 两条路径

| 路径 | 目录 | 形态 | 内联程度 | 适用 |
|------|------|------|----------|------|
| **通用 MCP server** | [`mcp/`](mcp/) | stdio MCP，自包含可交互 HTML + 内联 SVG（v0.2） | ✅ 对话框内联出图（ZCode / Claude Desktop / Cursor）+ 🔗 文件链接兜底 | ZCode / Claude Desktop / Cursor / WorkBuddy / Trae / Codex / DSH 通用 |
| **原生 DSH 插件** | [`dsh/`](dsh/) | Cordis 插件，零依赖 SVG + localhost | ✅ 真·内联（图片直接进对话） | DeepSeek Harness |

### 选哪个？

- 用 **ZCode / Claude Desktop / Cursor** 等 MCP 客户端 → 用 [`mcp/`](mcp/)，对话框直接出图
- 用 **DSH** 且想要原生插件体验 → 用 [`dsh/`](dsh/)；DSH 里也能用 `mcp/`（走文件链接）
- 想要**可交互**（hover / 缩放 / 切换类型）图表 → `mcp/` 落盘的 `.html` 在浏览器打开即交互式
- 两者可并存

### 如何安装

本仓库是**源码**，两种方式拿到本地：

| 方式 | 命令 | 说明 |
|------|------|------|
| **git clone（当前推荐）** | `git clone https://github.com/iqingyoung/search2chart-mcp.git` | 直接拿到 `mcp/` 与 `dsh/` 两套代码，再按下方路径接入 |
| **npx（待 npm 发布）** | `npx echarts-chart-mcp` / `npx @deepseek-ai/dsh-chart` | 目前**尚未发布到 npm**，npx 还拉不到；发布后会补。MCP server 发布后可被客户端直接 `npx` 拉起，DSH 插件仍需 clone 后拷进 profile |

按路径落地：

- **`mcp/`（MCP server）**：clone 后**无需 `npm install`**（零运行时依赖）。在你的客户端 MCP 配置里以 stdio 拉起 `node <仓库>/mcp/server.js` 即可（各端配置见 [`mcp/README.md`](mcp/README.md)）。
- **`dsh/`（原生 DSH 插件）**：clone 后把 `dsh/` 目录拷到 DSH profile 的 `node_modules/@deepseek-ai/dsh-chart`（**不是 npx、也不是全局 `npm i`**），再改 `cordis.patch.yml`（详见 [`dsh/README.md`](dsh/README.md)）。

一句话：**clone 是现在唯一可用的获取方式；npx 是「发布到 npm 后」的快捷方式，主要利好 `mcp/` 那条路径。**

## 核心思想：search → chart 直通

agent 用自带搜索 / 本地文件取数 → 调一个工具 → 图表出现在对话里。不用切到 BI 工具、不用搭仪表盘。

- **`mcp/`（v0.2 起）**：模型调 `chart_from_data` → server 同步产出 SVG 与自包含 HTML → 三层返回：① MCP `image` content block（Claude Desktop/Cursor 内联）② `file://` markdown 图片（ZCode 等走模型回写内联）③ `.html` 路径兜底（终端客户端打开即交互式图表）
- **`dsh/`**：模型调 `chart` 工具 → 插件生成 SVG → 经 localhost 暴露成 `http(s)` 图片 → DSH markdown 渲染器内联（根因：DSH 只内联 `http(s)` 图片，`file:` / `data:` 被拦截）

## v0.2 新特性（mcp/）

- **对话框内联出图**：三层兜底，零客户端识别。详见 [`mcp/README.md`](mcp/README.md#对话框直接内联出图)。
- **统一米白底色 `#fafaf7`**：SVG 与 HTML 一致，避免透明背景在深色/灰白客户端不可见。
- **清洗数据留存**：结果附带完整数据（JSON，代码块包裹），让纯文本模型（GLM-5.2 / DeepSeek 等）在上下文里继续分析，无需看图。`returnData` 参数或 `ECHARTS_RETURN_DATA` 可关。
- **图表类型双语**：summary 同时给出中文名与英文键（如「柱状图（bar）」）。

## 目录

```
search2chart-mcp/
├── mcp/          # echarts-chart-mcp：跨端 MCP server（内联 SVG + 可交互 HTML）
│   └── lib/svg.js   # v0.2 新增：零依赖 SVG 渲染器（bar/line/pie）
├── dsh/          # dsh-chart：原生 DSH 内联插件（零依赖 SVG + localhost）
├── LICENSE       # MIT
└── README.md     # 本文件
```

## 快速开始

### MCP 客户端（ZCode / Claude Desktop / Cursor 等）

见 [`mcp/README.md`](mcp/README.md)：各客户端以 stdio 拉起 `node mcp/server.js`，工具返回内联图片（SVG）+ HTML 路径。ZCode 接入踩坑与配置示例见该文档。

### 先测试你的 Agent 能渲染哪种图片

不同 Agent 的渲染器对图片格式支持各异。**首次接入时，先用 `all` 模式一次性测试所有格式**，找出你的 Agent 能正常显示的：

**临时配置**（在你的 MCP 配置里加一个环境变量）：

```json
{
  "env": {
    "ECHARTS_INLINE_MODE": "all"
  }
}
```

> 如果还想测 CDN 公网链接，再加 `ECHARTS_CDN_TOKEN` 与 `ECHARTS_CDN_REPO`（详见 [`mcp/README.md`](mcp/README.md#环境变量)）。

**发给 Agent 的测试 prompt**：

```
用 search2chart-mcp 的 chart_from_data 工具，生成一个简单柱状图。
数据：[["城市","销量"],["北京",120],["上海",200],["广州",150]]
标题：城市销量对比
chartType：bar
```

Agent 返回后，它会给出 3-4 行 `![城市销量对比](url)`，分别标记为：
- **【1·data URI】** — 自包含 base64，无需联网
- **【2·localhost http】** — 本地 HTTP 服务（`http://127.0.0.1:PORT/...svg`）
- **【3·file://】** — 本地文件路径（`file:///...svg`）
- **【4·CDN 公网 https】** — GitHub + jsDelivr 公网地址（`https://cdn.jsdelivr.net/...png`）

**哪个在对话框里真正渲染成了图片，你的 Agent 就支持哪种。** 然后把 `ECHARTS_INLINE_MODE` 固定为对应值：

| 能渲染的格式 | 设置 |
|---|---|
| data URI ✅ | `ECHARTS_INLINE_MODE=inline`（默认，无需改） |
| file:// ✅ | `ECHARTS_INLINE_MODE=file` |
| localhost http ✅ | `ECHARTS_INLINE_MODE=inline` |
| CDN 公网 https ✅ | `ECHARTS_INLINE_MODE=cdn` |
| MCP image block ✅ | `ECHARTS_INLINE_MODE=inline` + 调用时 `returnImage:true` |
| 都显示不了 | `ECHARTS_INLINE_MODE=none`，用 `.html` 交互图 + 预览面板 |

### Agent 自动检测流程

工具结果里已内置 Agent 指令，告诉模型如何根据用户反馈自动设置模式：

```
[Agent]: （调用 chart_from_data，返回 4 行图片）
         哪张图正常显示？请告诉我编号。

[User]:  3正常

[Agent]: 确认了。file:// 格式可渲染 → ECHARTS_INLINE_MODE=file。
         请在 MCP 配置里修改 env.ECHARTS_INLINE_MODE 为 file，重启连接即可。
```

> **已知客户端实测**：ZCode → `file`，OpenCode → `inline`（data URI），WorkBuddy → `cdn`，DSH → `inline`（localhost http），Claude/Cursor → `inline` + `returnImage:true`。

### DSH 内联（原生插件）

见 [`dsh/README.md`](dsh/README.md)：把 `dsh/` 拷到 `~/.dsh/profiles/web/node_modules/@deepseek-ai/dsh-chart`，在 `cordis.patch.yml` 的 `- insert:` 追加 `chart` 条目，重启 DSH。

## License

MIT

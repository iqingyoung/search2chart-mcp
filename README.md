# search2chart-mcp
##Search once, chart instantly
##搜索趋势，图表展示

> Turn search / research / any tabular data into **inline charts directly inside agent conversations**. One toolkit, two integration paths.

把「检索 / 研究 / 任意表格数据」变成**直接内联在 agent 对话流里的图表**。一个工具集，两条集成路径。

## 两条路径

| 路径 | 目录 | 形态 | 内联程度 | 适用 |
|------|------|------|----------|------|
| **原生 DSH 插件** | [`dsh/`](dsh/) | Cordis 插件，零依赖 SVG + localhost | ✅ 真·内联（图片直接进对话） | DeepSeek Harness |
| **通用 MCP server** | [`mcp/`](mcp/) | stdio MCP，自包含可交互 HTML | 🔗 文件链接（点开即交互式图表） | DSH / WorkBuddy / Codex / Trae 通用 |

### 选哪个？

- 用 **DSH** 且想要图表**直接出现在对话里**（不点链接）→ 用 [`dsh/`](dsh/)
- 用 **WorkBuddy / Codex / Trae**，或想要**可交互**（hover / 缩放）图表 → 用 [`mcp/`](mcp/)
- 两者可并存：DSH 里 `mcp/` 走链接、`dsh/` 走内联

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

- **`dsh/`**：模型调 `chart` 工具 → 插件生成 SVG → 经 localhost 暴露成 `http(s)` 图片 → DSH markdown 渲染器内联（根因：DSH 只内联 `http(s)` 图片，`file:` / `data:` 被拦截）
- **`mcp/`**：模型调 `chart_from_data` → server 落盘自包含 HTML → 返回路径 → 宿主以链接 / 预览呈现

## 目录

```
search2chart-mcp/
├── mcp/          # echarts-chart-mcp：跨端 MCP server（文件链接 + 可交互 HTML）
├── dsh/          # dsh-chart：原生 DSH 内联插件（零依赖 SVG）
├── LICENSE       # MIT
└── README.md     # 本文件
```

## 快速开始

### DSH 内联（原生插件）

见 [`dsh/README.md`](dsh/README.md)：把 `dsh/` 拷到 `~/.dsh/profiles/web/node_modules/@deepseek-ai/dsh-chart`，在 `cordis.patch.yml` 的 `- insert:` 追加 `chart` 条目，重启 DSH。

### 其他 agent（MCP）

见 [`mcp/README.md`](mcp/README.md)：各客户端以 stdio 拉起 `node mcp/server.js`，工具返回 HTML 路径。

## License

MIT

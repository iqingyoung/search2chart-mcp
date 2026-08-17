# echarts-chart-mcp

> A cross-agent ECharts chart MCP server. Feed it data (from web search or a CSV/XLSX file), get back an interactive chart as a self-contained HTML file. Works with DeepSeek Harness (DSH), Codex, WorkBuddy, and Trae.

把「数据 → 图表」做成**一次开发、多端通用**的 MCP server。agent 用自带搜索 / 本地文件取数后调用本服务，即可在对话里出图。零运行时依赖（纯 Node 手写 MCP stdio 协议）。

## 特性

- **零运行时依赖**：纯 Node 实现 MCP stdio 协议，不需要 Python 或其他运行时。
- **自包含、可交互图表**：生成内嵌 ECharts 的 HTML 文件，支持类型切换 / 配色 / 宽高调整。
- **离线可用**：`npm run fetch-echarts` 把 echarts 落到 `vendor/`，沙箱禁外网也能渲染。
- **跨端通用**：搜索流（`chart_from_data`）+ 文件流（`chart_from_file`）。
- **Excel 可选**：`npm i xlsx` 后支持 `.xlsx/.xls`；不装也能跑 CSV。

## 工具

| 工具 | 作用 |
|------|------|
| `chart_from_data` | 结构化数据 → 写入图表 HTML 文件，返回**绝对路径 + 数据概要 + ECharts option** |
| `chart_from_file` | CSV/XLSX 路径 → 解析后写入图表 HTML，返回路径 + 概要（首列类别轴，其余列数值序列） |
| `list_chart_types` | 列出支持的类型 / 配色与字段约定 |

字段约定：第一列 = 类别轴；其余列 = 数值序列（多列即多序列）；`chartType: auto` 按数据自动选 饼/柱。

## 为什么输出「文件 + 路径」而不是 HTML 文本

MCP 工具结果在多数宿主里走**文本通道**：宿主（如 DSH 的 mcp-client）会把非文本块折叠成纯文本，直接把 HTML 吐回去只会在工具结果里显示成一长段 / 调试视图，不会被当成网页内联渲染。

因此本 server 统一**把图表写成 `.html` 文件并返回绝对路径**，各宿主用自己擅长的方式呈现：

- **DSH / Web**：模型在终回复用反引号写出路径 → 自动变可点击链接 → 浏览器打开即交互式图表（无需改宿主本体/UI）。
- **WorkBuddy**：助手读文件后用 Visualizer 内联渲染。
- **Codex / Trae**：打开该 HTML 文件即可。

> 想让宿主直接拿到 HTML（而不是走文件链接），把工具参数 `returnHtml: true` 即可额外返回 HTML 原文——前提是宿主能渲染 HTML（如 Trae 的预览、装了 genui 的 DSH）。

图表文件默认写入 `os.tmpdir()/echarts-charts/`，可用环境变量 `ECHARTS_CHARTS_DIR` 覆盖（例如设成你的工作区 `charts/` 目录，产物就落在该目录）。

## 运行

```bash
node server.js            # 由 MCP 客户端以 stdio 拉起，无需手动运行
npm run fetch-echarts     # 可选：下载 echarts 到 vendor/，支持离线/沙箱渲染
npm test                  # 可选：端到端自检（initialize / tools/list / 两路出图）
```

## 接入各客户端

所有客户端统一用 stdio 拉起 `node <绝对路径>/server.js`。

### DeepSeek Harness (DSH)

DSH 用 Cordis 加载插件（**不是** `harness.yaml`）。在 profile 的 patch 层新增一个 mcp-client 实例即可（每个实例只连一个 server）。

编辑 `~/.dsh/profiles/<profile>/cordis.patch.yml`（如 `web` profile）：

```yaml
- insert:
    - id: mcp-client-echarts-chart
      name: '@deepseek-ai/dsh-mcp-client'   # 随 dsh 包预装
      config:
        transport: stdio
        serverName: echarts-chart
        command: 'C:/abs/path/to/node.exe'
        args:
          - 'C:/abs/path/to/echarts-chart-mcp/server.js'
        cwd: 'C:/abs/path/to/echarts-chart-mcp'
        failOnStartupError: false   # 务必 false，否则 server 启动失败会让 DSH 整体启动失败
        reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30000, maxAttempts: 10 }
```

- **务必用 `- insert:` 包裹**：写成顶层 `- id:` 会被 DSH 当成「覆盖已有插件」，因 id 在 bundle 层不存在而静默 skip，表现就是重启后找不到、且不报错。
- `id` 全局唯一；`serverName` 须匹配 `[A-Za-z0-9_-]{1,32}`，决定工具前缀 `mcp__echarts-chart__*`。
- 路径用 `C:/...` 正斜杠（Windows 下 Node 接受），避免重启后相对/PATH 丢失。
- 重启 DSH 后，会话里即可看到 `mcp__echarts-chart__chart_from_data` 等工具；让 agent 搜完数据后调用，终回复里出现可点击的 `.html` 链接，点开即图表。

完整示例见 [`examples/dsh-cordis.patch.yml`](examples/dsh-cordis.patch.yml)。

### WorkBuddy

写入 `~/.workbuddy/mcp.json` 的 `mcpServers`：

```json
{ "mcpServers": { "echarts-chart-mcp": { "command": "node", "args": ["C:/abs/path/echarts-chart-mcp/server.js"] } } }
```

工具返回 HTML 文件路径后，助手用 HTML 预览 / Visualizer 内联展示。

### Trae

在 Trae 的 MCP 设置中加入同上的 stdio 配置（命令 `node`，参数指向 `server.js`），Web IDE 直接预览返回的 HTML（亦可设 `returnHtml: true` 直接拿到 HTML）。

### Codex / Claude Code

```bash
claude mcp add echarts -- node /abs/path/echarts-chart-mcp/server.js
```

终端无内联渲染：工具会落盘 `.html`，用浏览器打开即可。

## 示例

搜索流（agent 搜完把数据喂入）：

```json
{ "data": [["品牌","市占率"],["A",32.5],["B",27.8],["C",18.2]], "chartType": "pie", "title": "品牌市占率" }
```

文件流：

```json
{ "filePath": "/data/sales.csv", "chartType": "bar", "title": "月度销量" }
```

## 目录结构

```
echarts-chart-mcp/
├── server.js                 # MCP stdio 协议 + 工具入口
├── lib/
│   ├── chart.js              # 数据归一化 + 选图推断 + ECharts option
│   ├── html.js               # 自包含可交互 HTML（类型/配色/宽高控件）
│   └── parse.js              # CSV 零依赖解析；XLSX 走可选 xlsx
├── scripts/
│   ├── fetch-echarts.js      # 下载 echarts 到 vendor/（离线用）
│   └── selftest.js           # 端到端自检
├── examples/
│   └── dsh-cordis.patch.yml  # DSH 接入示例
├── sample.csv                # 自测用样例
├── package.json
├── README.md
├── LICENSE
└── .gitignore
```

## 可选：在 DSH 对话流里真正内联渲染

「写文件 + 可点击链接」是零 UI 改动的通用方案，四端都能用。若要在 DSH 对话流里**直接内联**（不点链接），可按 DSH「一切皆插件」的官方扩展路径，加一对「原生 dsh 插件 + 配对 UI 插件」：生成逻辑复用 `lib/chart.js` / `lib/html.js`，只是出口从 MCP 文本换成 Cordis 结构化事件 + ECharts UI 组件（参照 `dsh-client-ui-tool` 的 `searchBody`/`card` 渲染分支）。此方式不碰 DSH 本体。

## License

MIT

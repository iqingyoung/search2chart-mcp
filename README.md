[![DSH Market](https://raw.githubusercontent.com/2BingLing/dsh-market/master/assets/readme/badge-listed-zh.svg)](https://dsh.market/)

# search2chart-mcp

> Turn any tabular data into **inline charts directly inside agent conversations**. Zero runtime dependencies, multi-client adaptive.

把「任意表格数据」变成**直接内联在 agent 对话流里的图表**。零运行时依赖，多端自适应。

<img width="1912" height="948" alt="image" src="https://github.com/user-attachments/assets/676c42c7-dfa0-48ff-8ec9-9f1d51a2e7b2" />


## 安装

```bash
# 方式一：DSH 原生插件（DeepSeek Harness 用户推荐，真·内联）
dsh plugin --profile web add dsh-chart

# 方式二：npx（通用 MCP server，无需 clone）
npx search2chart-mcp

# 方式三：git clone
git clone https://github.com/iqingyoung/search2chart-mcp.git
```

## 两条路径

| 路径 | 目录 | 适用 |
|------|------|------|
| **通用 MCP server** | [`mcp/`](mcp/) | ZCode / Claude Desktop / Cursor / WorkBuddy / Trae / Codex / DSH 通用 |
| **原生 DSH 插件** | [`dsh/`](dsh/) | DeepSeek Harness（真·内联，图片直接进对话） |

- 用 MCP 客户端 → 用 `mcp/`，对话框直接出图
- 用 DSH 且想要原生体验 → 用 `dsh/`；DSH 里也能用 `mcp/`（走文件链接）
- 两者可并存

## 快速开始

### 1. 在你的 MCP 配置里加入

```json
{
  "mcpServers": {
    "search2chart-mcp": {
      "command": "npx",
      "args": ["search2chart-mcp"],
      "env": {}
    }
  }
}
```

> 如果 npx 拉不到，用 clone 后的绝对路径：`"command": "node", "args": ["<仓库>/mcp/server.js"]`

### 2. 首次接入：测试你的 Agent 能渲染哪种图片

不同 Agent 渲染器对图片格式支持各异。先用 `all` 模式一次性测试：

**临时配置**（在 MCP 配置里加环境变量）：

```json
{
  "env": {
    "ECHARTS_INLINE_MODE": "all"
  }
}
```

**发给 Agent 的测试 prompt**：

```
用 chart_from_data 生成一个简单柱状图。
数据：[["城市","销量"],["北京",120],["上海",200],["广州",150]]
标题：城市销量对比
chartType：bar
```

Agent 返回 3-4 行图，分别标记为：
- **【1·data URI】** — 自包含 base64，无需联网
- **【2·localhost http】** — 本地 HTTP 服务
- **【3·file://】** — 本地文件路径
- **【4·CDN 公网 https】** — GitHub + jsDelivr 公网地址

**哪个在对话框里真正渲染成了图片，你的 Agent 就支持哪种。**

### 3. 固定模式

| 能渲染的格式 | 设置 |
|---|---|
| data URI ✅ | `ECHARTS_INLINE_MODE=inline`（默认） |
| file:// ✅ | `ECHARTS_INLINE_MODE=file` |
| localhost http ✅ | `ECHARTS_INLINE_MODE=inline` |
| CDN 公网 https ✅ | `ECHARTS_INLINE_MODE=cdn` |
| MCP image block ✅ | `inline` + 调用时 `returnImage:true` |
| 都显示不了 | `ECHARTS_INLINE_MODE=none`，用 `.html` 交互图 |

### Agent 自动检测

工具结果里已内置 Agent 指令，告诉模型如何根据用户反馈自动设置模式：

```
[Agent]: 返回 4 行图片，哪张正常显示？
[User]:  3正常
[Agent]: 确认了。file:// 可渲染 → 请设置 ECHARTS_INLINE_MODE=file
```

> **已知客户端实测**：ZCode → `file`，OpenCode → `inline`（data URI），WorkBuddy → `cdn`，DSH → `inline`（localhost http），Claude/Cursor → `inline` + `returnImage:true`。

## 核心能力

### 多客户端内联适配

通过 `ECHARTS_INLINE_MODE` 环境变量控制内联行为：

| 模式 | 行为 | 适用客户端 |
|---|---|---|
| `inline`（默认） | data URI → localhost http → file:// 自动 fallback | OpenCode / DSH / 通用 |
| `file` | 只输出 `file://` 本地路径 | ZCode |
| `cdn` | 上传 GitHub+jsDelivr，输出公网 https | WorkBuddy |
| `all` | 测试模式：一次返回所有格式 | 首次接入时测试 |
| `none` | 纯文本（.html 路径 + 数据），无内联 | 纯文本模型 / 终端 |

### CDN 公网图床

- SVG → PNG 栅格化（@resvg/resvg-js，可选依赖）
- GitHub Contents API 上传 + jsDelivr CDN 加速
- GitHub Actions 定时清理（默认保留 3 天）

### 清洗数据留存

结果附带完整数据（JSON，代码块包裹），让纯文本模型在上下文里继续做占比/趋势/对比分析，无需看图。`returnData: false` 可关。

### 自包含可交互 HTML

图表同时写入 `.html` 文件，浏览器打开即支持 hover / 缩放 / 类型切换 / 配色调整。

## 工具

| 工具 | 作用 |
|------|------|
| `chart_from_data` | 结构化数据 → 图表 HTML + 内联图片 |
| `chart_from_file` | CSV/XLSX 路径 → 图表 HTML + 内联图片 |
| `list_chart_types` | 列出支持的类型 / 配色与字段约定 |

字段约定：第一列 = 类别轴；其余列 = 数值序列（多列即多序列）；`chartType: auto` 按数据自动选 饼/柱。

## 接入各客户端

详见 [`mcp/README.md`](mcp/README.md)。

## 目录

```
search2chart-mcp/
├── mcp/              # 跨端 MCP server（内联 SVG + 可交互 HTML）
│   ├── server.js     # MCP stdio 协议 + 工具入口
│   ├── lib/
│   │   ├── chart.js      # 数据归一化 + ECharts option
│   │   ├── html.js       # 自包含可交互 HTML
│   │   ├── svg.js        # 零依赖 SVG 渲染器
│   │   ├── httpserver.js # 本地 HTTP 服务
│   │   ├── rasterize.js  # SVG→PNG
│   │   ├── upload.js     # GitHub + jsDelivr CDN
│   │   └── parse.js      # CSV/XLSX 解析
│   └── scripts/
│       ├── selftest.js    # 端到端自检
│       └── verify_cdn.cjs # CDN 端到端验证
├── dsh/              # 原生 DSH 内联插件
├── LICENSE
└── README.md
```

## License

MIT

# search2chart-mcp

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

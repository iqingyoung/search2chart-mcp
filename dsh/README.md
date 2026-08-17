# dsh-chart

> A native DeepSeek Harness (DSH) plugin that renders structured data as **inline charts inside the conversation** — no clicking a link, no opening a file. Zero runtime dependencies.

原生 DSH 插件：把结构化数据直接画成**对话流里内联的图表**。模型调用 `chart` 工具后，图表作为图片直接出现在对话中（不是可点击链接、也不是文件路径）。零运行时依赖（纯手写 SVG + 一个单例 localhost 服务）。

## 为什么需要它

DSH 的 MCP 客户端会把工具结果折叠成纯文本（`extractText` 丢弃非文本块），所以即使 MCP server 返回 HTML，也只会在工具结果里显示成一长段，不会被当成网页内联渲染。这就是「文件链接」方案绕不开的根本原因。

要让图表**真正内联**到对话流，必须走 DSH「一切皆插件」的官方扩展路径：

1. 原生 dsh 插件生成图表（这里用零依赖 SVG，不依赖 echarts 是否装进 dsh profile）。
2. 通过 `localhost` HTTP 服务把 SVG 暴露成 `http://127.0.0.1:<port>/<id>.svg`。
3. 返回 Markdown 图片 `![title](http://...svg)` —— DSH 的 markdown 渲染器**只内联 `http(s)` 协议的图片**（`sanitizeUrl` 拦截 `file:`/`data:`，原始 HTML 当文本显示），所以 localhost SVG 是唯一不碰 DSH 本体又能内联的出口。

## 特性

- **真·内联**：图表作为图片直接出现在对话流，无需点击。
- **零依赖**：不引入 echarts，手写 SVG 渲染 bar / line / pie，安装即拷即用。
- **自动选图**：`chartType: auto` 时，单序列且合计 ≈ 100 判为饼图，否则柱状；显式指定覆盖。
- **多序列**：多列即多序列，自动分组与图例。
- **配色方案**：`default` / `pastel` / `vivid`。

> 实现要点：通过 dsh-tools 的 `defineTool({ name, parameters, output, execute })` 注册。`output` 是必填项——`output.schema`（值 schema 的 spec，对象须显式 `additionalProperties`）+ `output.render(args, value)` 返回 `[{ type: "text", text }]` 的 Markdown 内容块（DSH 据此内联 `http(s)` 图片）。`execute` 返回被 `output.schema` 校验的值对象。

## 安装

插件必须落在 dsh profile 可解析的 `node_modules` 下（`@deepseek-ai/*` 作用域），并写入该 profile 的 `cordis.patch.yml`。

### 1. 拷贝插件到 profile

```bash
# 把本仓库整体拷到 web profile 的 node_modules
cp -r dsh ~/.dsh/profiles/web/node_modules/@deepseek-ai/dsh-chart
```

> 关键是放到 `profiles/web/node_modules/@deepseek-ai/` 这一层，**不是**浅层的 `profiles/node_modules/` —— 否则 dsh 加载器解析不到。

### 2. 写入 patch 配置

编辑 `~/.dsh/profiles/web/cordis.patch.yml`，在已有的 `- insert:` 数组里**追加**一条（务必用 `- insert:` 包裹，顶层 `- id:` 会被当成覆盖式 patch 而静默 skip）：

```yaml
- insert:
    - id: chart
      name: '@deepseek-ai/dsh-chart'
      config: {}
```

### 3. 重启 DSH

重启后会话里出现 `chart` 工具即可使用。

## 使用

让 agent 把数据喂给 `chart` 工具：

```json
{
  "data": [["月份", "销量"], ["1月", 120], ["2月", 200], ["3月", 150]],
  "chartType": "bar",
  "title": "月度销量"
}
```

工具返回：

```
![月度销量](http://127.0.0.1:18765/ab501295496407b7.svg)

图表已生成（类型=bar）。ECharts option：
{ ... }
```

DSH 把这张 `http(s)` 图片直接内联到对话流。

### 参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `data` | array | 表格数据：数组的数组（首行可当表头）或对象数组 |
| `columns` | array | 可选列名；对象数组或首行非表头时需显式给出 |
| `chartType` | string | `auto` / `bar` / `line` / `pie`，默认 `auto` |
| `title` | string | 图表标题 |
| `palette` | string | `default` / `pastel` / `vivid` |
| `width` | number | 宽度(px)，默认 720 |
| `height` | number | 高度(px)，默认 420 |

## 目录结构

```
dsh/
├── index.mjs              # ESM 插件入口（注册 chart 工具）
├── lib/
│   ├── chart.js           # 数据归一化 + 选图推断 + option
│   ├── svg.js             # 零依赖 SVG 渲染器（bar/line/pie）
│   └── server.js          # 单例 localhost HTTP 服务（暴露 SVG）
├── test.js                # 隔离自测：数据→SVG→HTTP→内联 URL
├── package.json
└── README.md
```

## 自测

```bash
npm test        # 验证 pie/bar/line 全链路：数据 → SVG → localhost HTTP → 可内联 URL
```

（自测不依赖 DSH，只验证核心机制；DSH 侧内联需在 DSH 内实测。）

## 与 echarts-chart-mcp 的关系

- **`echarts-chart-mcp`**：通用 MCP server，输出 `.html` 文件 + 路径，跨端（DSH/WorkBuddy/Codex/Trae）可用，图表可交互。
- **`dsh-chart`**：DSH 专属原生插件，对话内联静态图表，零依赖、即拷即用。

需要 DSH 里「交互式（hover/缩放）」图表时，再叠加一个配对 UI 插件（自定义 `card`/ECharts 组件）——那是更大的工程量，本仓库暂未包含。

## License

MIT

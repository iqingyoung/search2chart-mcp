'use strict';
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { toTable, extractSeries, inferType, buildOption } = require('./lib/chart');
const { renderHTML, PALETTES } = require('./lib/html');
const { parseFile } = require('./lib/parse');
const { renderSVG } = require('./lib/svg');

// 是否返回 image content block（默认开）；可由环境变量全局关闭
const RETURN_IMAGE_DEFAULT = String(process.env.ECHARTS_RETURN_IMAGE || 'true').toLowerCase() !== 'false';
// 是否返回完整清洗数据（默认开，供纯文本模型在上下文里继续分析）；可由环境变量全局关闭
const RETURN_DATA_DEFAULT = String(process.env.ECHARTS_RETURN_DATA || 'true').toLowerCase() !== 'false';
// 返回数据的最大行数（超过则截断）
const DATA_MAX_ROWS = parseInt(process.env.ECHARTS_DATA_MAX_ROWS || '60', 10) || 60;

// 类型中文名，便于模型/用户理解
const TYPE_NAMES = { bar: '柱状图', line: '折线图', pie: '饼图' };

// 把清洗后的表格序列化为紧凑 JSON 数组数组（首行表头），供模型在上下文里继续分析。
// 用户视觉上会被代码块折叠/低调渲染，不会喧宾夺主。
function buildDataBlock(table, maxRows) {
  const { columns, rows } = table;
  const total = rows.length;
  const truncated = total > maxRows;
  const kept = truncated ? rows.slice(0, maxRows) : rows;
  const arr = [columns, ...kept.map(r => r.map(v => (v == null ? null : v)))];
  const head = `（以下为清洗后的完整数据，共 ${total} 行${truncated ? `，已截断显示前 ${maxRows} 行，完整数据已落盘到 .html` : ''}，供你在后续回复中分析：占比/趋势/对比/异常值等，无需依赖图表图像）`;
  return `${head}\n\`\`\`json\n${JSON.stringify(arr)}\n\`\`\``;
}

const SERVER = { name: 'echarts-chart-mcp', version: '0.2.0' };
const VALID_TYPES = ['auto', 'bar', 'line', 'pie'];
const VALID_PALETTES = Object.keys(PALETTES);

const TOOLS = [
  {
    name: 'chart_from_data',
    description: '根据结构化数据生成自包含、可交互的 ECharts 图表，并写入一个 .html 文件。返回：①图表的 image content block（base64 SVG，支持内联渲染的客户端会在对话框直接出图）②该 .html 文件的【绝对路径】文本 + 数据概要 + ECharts option。不支持图片内联的客户端会自动忽略 image 块并回退到路径文本。结果文本里会含一行 `![标题](file://...svg)`，请在最终回复中**原样写回**该行，让支持 file:// 图片的客户端（如 ZCode）在对话框直接渲染图表。',
    inputSchema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          description: '表格数据：数组的数组（首行可当表头）或对象数组，例：[["月份","销量"],["1月",120],["2月",200]]'
        },
        columns: { type: 'array', items: { type: 'string' }, description: '可选列名；对象数组或首行为非表头时需显式给出' },
        chartType: { type: 'string', enum: VALID_TYPES, default: 'auto', description: 'auto 会按数据自动选 饼/柱' },
        title: { type: 'string', default: '', description: '图表标题' },
        seriesName: { type: 'string', default: '', description: '已废弃（由列名决定），保留兼容' },
        palette: { type: 'string', enum: VALID_PALETTES, default: 'default', description: '默认配色方案' },
        width: { type: 'number', default: 720, description: '图表宽度(px)' },
        height: { type: 'number', default: 420, description: '图表高度(px)' },
        returnHtml: { type: 'boolean', default: false, description: '是否额外把 HTML 原文也返回（默认 false；仅当宿主能直接渲染 HTML 时才需要设为 true）' },
        returnImage: { type: 'boolean', default: RETURN_IMAGE_DEFAULT, description: '是否返回 image content block（base64 SVG，默认 true，让支持内联图片的客户端在对话框直接出图；不支持时会被忽略，回退到下方 html 路径）' },
        returnData: { type: 'boolean', default: RETURN_DATA_DEFAULT, description: '是否在结果里附带清洗后的完整数据（JSON 数组数组，默认 true），供纯文本模型（GLM/DeepSeek 等）在上下文里继续分析；用户视觉上会被代码块折叠' }
      },
      required: ['data']
    }
  },
  {
    name: 'chart_from_file',
    description: '读取本地 CSV / TSV / XLSX 生成 ECharts 图表并写入 .html 文件。第一列作类别轴，其余列作数值序列（多列即多序列）。返回【绝对路径】+ 概要。WPS 请先另存为 .xlsx。结果文本里会含一行 `![标题](file://...svg)`，请在最终回复中原样写回该行，让支持 file:// 图片的客户端在对话框直接渲染图表；另用反引号写出 .html 路径可点击打开交互式图表。',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: '文件绝对路径，支持 .csv/.tsv/.txt/.xlsx/.xls' },
        sheet: { type: 'string', description: 'xlsx 工作表名，默认第一张' },
        chartType: { type: 'string', enum: VALID_TYPES, default: 'auto' },
        title: { type: 'string', default: '' },
        palette: { type: 'string', enum: VALID_PALETTES, default: 'default' },
        width: { type: 'number', default: 720 },
        height: { type: 'number', default: 420 },
        returnHtml: { type: 'boolean', default: false, description: '是否额外把 HTML 原文也返回（默认 false）' },
        returnImage: { type: 'boolean', default: RETURN_IMAGE_DEFAULT, description: '是否返回 image content block（base64 SVG，默认 true）' },
        returnData: { type: 'boolean', default: RETURN_DATA_DEFAULT, description: '是否附带清洗后的完整数据（默认 true）' }
      },
      required: ['filePath']
    }
  },
  {
    name: 'list_chart_types',
    description: '列出支持的图表类型、配色方案与字段约定，便于 agent 选图。',
    inputSchema: { type: 'object', properties: {} }
  }
];

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}
function ok(id, result) { send({ jsonrpc: '2.0', id: id, result: result }); }
function fail(id, code, message) { send({ jsonrpc: '2.0', id: id, error: { code: code, message: message } }); }

function toolResult(content) {
  // content: 字符串数组（纯文本）或 content block 数组（混合 text/image）
  const arr = Array.isArray(content) ? content : [content];
  return { content: arr.map(c => (typeof c === 'string' ? { type: 'text', text: c } : c)), isError: false };
}

function resolveOutputDir() {
  if (process.env.ECHARTS_CHARTS_DIR) return process.env.ECHARTS_CHARTS_DIR;
  return path.join(os.tmpdir(), 'echarts-charts');
}

function writeChartHtml(html, title) {
  const dir = resolveOutputDir();
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* 重试在 writeFileSync 报错 */ }
  const base = (title || 'chart').replace(/[^\w\u4e00-\u9fff]+/g, '_').slice(0, 40) || 'chart';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `chart_${base}_${stamp}.html`);
  fs.writeFileSync(file, html, 'utf8');
  return file;
}

// 把 SVG 也落盘一份，返回绝对路径；用于生成 file:// 图片，供支持本地路径内联的客户端（如 ZCode）渲染
function writeChartSvg(svg, title) {
  const dir = resolveOutputDir();
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* 重试在 writeFileSync 报错 */ }
  const base = (title || 'chart').replace(/[^\w\u4e00-\u9fff]+/g, '_').slice(0, 40) || 'chart';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `chart_${base}_${stamp}.svg`);
  fs.writeFileSync(file, svg, 'utf8');
  return file;
}

// 把绝对路径转成 file:// URL（跨平台：Windows 也用三斜线 + 正斜杠）
function toFileUrl(absPath) {
  const sep = absPath.split(path.sep).filter(Boolean).join('/');
  return 'file:///' + sep;
}

function makeChart(args, table) {
  const chartType = args.chartType || 'auto';
  const type = chartType === 'auto' ? inferType(table) : chartType;
  const { categories, seriesList } = extractSeries(table);
  const title = args.title || '';
  const paletteName = args.palette || 'default';
  const palette = PALETTES[paletteName] || PALETTES.default;
  const width = args.width || 720;
  const height = args.height || 420;

  const option = buildOption(categories, seriesList, type, palette, title);
  const html = renderHTML({ title, categories, seriesList, defaultType: type, defaultPalette: paletteName, width, height });

  const filePath = writeChartHtml(html, title);
  const seriesPreview = seriesList
    .map(s => `${s.name}: [${s.data.slice(0, 6).join(', ')}${s.data.length > 6 ? '…' : ''}]`)
    .join('; ');

  // SVG 也落盘一份；路径同时用于「模型回复里渲染」与「image block」两条通路。
  let svgFile = '';
  let svg = '';
  const wantImage = args.returnImage !== false;
  if (wantImage) {
    try {
      const spec = { type, title, categories, seriesList, paletteName };
      svg = renderSVG(spec, { width, height });
      svgFile = writeChartSvg(svg, title);
    } catch (e) { /* 落空则在下面用文本提示 */ }
  }

  // 关键设计：工具结果只返回「文本」，避免某些 MCP 客户端把图片当模型输入过滤掉。
  // 文本里直接给出最终要渲染的 markdown 图片字面量，让模型在「最终回复」原样写回——
  // 模型回复通路由客户端 markdown 渲染器处理，不走 MCP 多模态输入过滤。
  const renderLine = svgFile
    ? `图表预览（请在最终回复中**原样**写回下面这一行，让用户在对话框直接看到图）：\n![${title || 'chart'}](${toFileUrl(svgFile)})`
    : '';

  // 图表类型同时给出英文键与中文名，便于模型与用户双向理解
  const typeName = TYPE_NAMES[type] || type;
  const summary =
    `图表已生成并写入文件：\n${filePath}\n` +
    `图表类型：${typeName}（${type}） | 标题="${title}" | 配色=${paletteName} | 尺寸=${width}x${height}\n` +
    `数据：${categories.length} 个类别；序列：${seriesPreview}\n` +
    (renderLine ? renderLine + '\n' : '') +
    `在 DSH/Web 中把上面 .html 路径用反引号包成行内代码即可点击，在浏览器打开即是交互式图表。`;

  const content = [{ type: 'text', text: summary }];

  // 仍附带 image content block：支持它的客户端（Claude Desktop / Cursor 等）可直接内联。
  // 不支持的客户端（如 ZCode）会忽略它，并依赖上面让模型回写 markdown 图片的通路。
  if (wantImage && svg) {
    const b64 = Buffer.from(svg, 'utf8').toString('base64');
    content.push({ type: 'image', data: b64, mimeType: 'image/svg+xml' });
  }

  if (args.returnHtml === true) content.push({ type: 'text', text: html });

  // 清洗后的完整数据（JSON 数组数组），供纯文本模型在上下文里继续分析；
  // 用代码块包裹，用户视觉上会被折叠/低调渲染，不会喧宾夺主。
  if (args.returnData !== false) {
    try {
      content.push({ type: 'text', text: buildDataBlock(table, DATA_MAX_ROWS) });
    } catch (e) { /* 数据序列化失败忽略 */ }
  }

  content.push({ type: 'text', text: 'ECharts option (JSON):\n```json\n' + JSON.stringify(option) + '\n```' });
  return toolResult(content);
}

function handleCall(msg) {
  const id = msg.id;
  const name = msg.params && msg.params.name;
  const args = (msg.params && msg.params.arguments) || {};
  try {
    if (name === 'chart_from_data') {
      if (!args.data) throw new Error('缺少必填参数 data');
      const table = toTable(args.data, args.columns);
      return ok(id, makeChart(args, table));
    }
    if (name === 'chart_from_file') {
      if (!args.filePath) throw new Error('缺少必填参数 filePath');
      const abs = path.isAbsolute(args.filePath) ? args.filePath : path.resolve(process.cwd(), args.filePath);
      const rows = parseFile(abs, args.sheet);
      const table = { columns: rows[0], rows: rows.slice(1) };
      if (!table.columns || table.rows.length === 0) throw new Error('文件为空或无数据');
      return ok(id, makeChart(args, table));
    }
    if (name === 'list_chart_types') {
      const info = {
        chartTypes: ['bar', 'line', 'pie'],
        palettes: VALID_PALETTES,
        fieldConvention: '第一列=类别轴；其余列=数值序列（多列即多序列）；auto 会按数据自动选 饼/柱',
        dataSource: '由调用方（agent 的网页搜索或本地文件）提供数据，本服务只负责生成图表'
      };
      return ok(id, toolResult([JSON.stringify(info, null, 2)]));
    }
    return fail(id, -32601, '未知工具：' + name);
  } catch (e) {
    return ok(id, { content: [{ type: 'text', text: '错误：' + e.message }], isError: true });
  }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', line => {
  line = line.trim();
  if (!line) return;
  let msg;
  try { msg = JSON.parse(line); } catch (e) { return; }
  if (msg.id !== undefined && msg.method) {
    if (msg.method === 'initialize') {
      ok(msg.id, {
        protocolVersion: (msg.params && msg.params.protocolVersion) || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: SERVER
      });
    } else if (msg.method === 'tools/list') {
      ok(msg.id, { tools: TOOLS });
    } else if (msg.method === 'tools/call') {
      handleCall(msg);
    } else if (msg.method === 'ping') {
      ok(msg.id, {});
    } else {
      fail(msg.id, -32601, 'Method not found: ' + msg.method);
    }
  }
  // 通知类（initialized / cancelled 等）直接忽略
});
rl.on('close', () => process.exit(0));

'use strict';
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { toTable, extractSeries, inferType, buildOption } = require('./lib/chart');
const { renderHTML, PALETTES } = require('./lib/html');
const { parseFile } = require('./lib/parse');

const SERVER = { name: 'echarts-chart-mcp', version: '0.1.0' };
const VALID_TYPES = ['auto', 'bar', 'line', 'pie'];
const VALID_PALETTES = Object.keys(PALETTES);

const TOOLS = [
  {
    name: 'chart_from_data',
    description: '根据结构化数据生成自包含、可交互的 ECharts 图表，并写入一个 .html 文件。返回该文件的【绝对路径】+ 数据概要 + ECharts option。请在最终回复中用反引号(行内代码)写出文件路径，DSH/Web 会将其变为可点击链接，点击即在浏览器打开交互式图表。',
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
        returnHtml: { type: 'boolean', default: false, description: '是否额外把 HTML 原文也返回（默认 false；仅当宿主能直接渲染 HTML 时才需要设为 true）' }
      },
      required: ['data']
    }
  },
  {
    name: 'chart_from_file',
    description: '读取本地 CSV / TSV / XLSX 生成 ECharts 图表并写入 .html 文件。第一列作类别轴，其余列作数值序列（多列即多序列）。返回【绝对路径】+ 概要。WPS 请先另存为 .xlsx。最终回复用反引号写出路径即可点击打开。',
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
        returnHtml: { type: 'boolean', default: false, description: '是否额外把 HTML 原文也返回（默认 false）' }
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

function toolResult(texts) {
  return { content: texts.map(t => ({ type: 'text', text: t })), isError: false };
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
  const summary =
    `图表已生成并写入文件：\n${filePath}\n` +
    `类型=${type} | 标题="${title}" | 配色=${paletteName} | 尺寸=${width}x${height}\n` +
    `数据：${categories.length} 个类别；序列：${seriesPreview}\n` +
    `在 DSH/Web 中把上面路径用反引号包成行内代码即可点击，在浏览器打开即是交互式图表。`;

  const texts = [summary];
  if (args.returnHtml === true) texts.push(html);
  texts.push('ECharts option (JSON):\n```json\n' + JSON.stringify(option) + '\n```');
  return toolResult(texts);
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

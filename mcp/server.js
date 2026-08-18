'use strict';
// search2chart-mcp: 数据 → 自包含可交互 HTML + 对话框内联图片
// 内联优先级（从高到低）：data URI(自包含) → localhost http(本地服务) → CDN(公网https兜底)
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const os = require('os');
const { toTable, extractSeries, inferType, buildOption } = require('./lib/chart');
const { renderHTML, PALETTES } = require('./lib/html');
const { parseFile } = require('./lib/parse');
const { renderSVG } = require('./lib/svg');
const { serveSVG, startServer } = require('./lib/httpserver');
const { isAvailable: rasterizeAvailable } = require('./lib/rasterize');
const { uploadChart } = require('./lib/upload');

// --- 环境变量 ---
const RETURN_IMAGE_DEFAULT = String(process.env.ECHARTS_RETURN_IMAGE || 'true').toLowerCase() !== 'false';
const RETURN_DATA_DEFAULT = String(process.env.ECHARTS_RETURN_DATA || 'true').toLowerCase() !== 'false';
const DATA_MAX_ROWS = parseInt(process.env.ECHARTS_DATA_MAX_ROWS || '60', 10) || 60;
// 内联模式：'none'(纯文本) | 'inline'(data URI + http + file, 默认) | 'file'(仅 file://, ZCode) | 'all'(返回所有格式, 用于测试) | 'cdn'(公网https, WorkBuddy)
const INLINE_MODE = (process.env.ECHARTS_INLINE_MODE || 'inline').toLowerCase();
const DATA_URI_MAX = parseInt(process.env.ECHARTS_DATA_URI_MAX || String(48 * 1024), 10) || 48 * 1024;

const TYPE_NAMES = { bar: '柱状图', line: '折线图', pie: '饼图' };
const SERVER = { name: 'search2chart-mcp', version: '0.4.0' };
const VALID_TYPES = ['auto', 'bar', 'line', 'pie'];
const VALID_PALETTES = Object.keys(PALETTES);

// --- 工具定义 ---
const TOOLS = [
  {
    name: 'chart_from_data',
    description: '根据结构化数据生成 ECharts 图表，写入 .html 文件，并返回可在对话框内联展示的图片地址。\n【内置指令·必须执行】把结果中的 `![<标题>](<url>)` **原样复制到回复中**，图表即在对话框内联出图。',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'array', description: '表格数据：数组的数组（首行可当表头）或对象数组' },
        columns: { type: 'array', items: { type: 'string' }, description: '可选列名' },
        chartType: { type: 'string', enum: VALID_TYPES, default: 'auto', description: 'auto 按数据自动选 饼/柱' },
        title: { type: 'string', default: '', description: '图表标题' },
        palette: { type: 'string', enum: VALID_PALETTES, default: 'default', description: '配色方案' },
        width: { type: 'number', default: 720, description: '图表宽度(px)' },
        height: { type: 'number', default: 420, description: '图表高度(px)' },
        returnHtml: { type: 'boolean', default: false, description: '是否额外返回 HTML 原文' },
        returnImage: { type: 'boolean', default: RETURN_IMAGE_DEFAULT, description: '是否返回 image content block (SVG, 部分客户端不支持会报错)' },
        returnData: { type: 'boolean', default: RETURN_DATA_DEFAULT, description: '是否附带清洗后的完整数据 (JSON)' }
      },
      required: ['data']
    }
  },
  {
    name: 'chart_from_file',
    description: '读取 CSV/TSV/XLSX 生成 ECharts 图表。第一列作类别轴，其余列作数值序列。WPS 请先另存为 .xlsx。\n【内置指令·必须执行】把结果中的 `![<标题>](<url>)` **原样复制到回复中**，图表即在对话框内联出图。',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: '文件绝对路径' },
        sheet: { type: 'string', description: 'xlsx 工作表名，默认第一张' },
        chartType: { type: 'string', enum: VALID_TYPES, default: 'auto' },
        title: { type: 'string', default: '' },
        palette: { type: 'string', enum: VALID_PALETTES, default: 'default' },
        width: { type: 'number', default: 720 },
        height: { type: 'number', default: 420 },
        returnHtml: { type: 'boolean', default: false },
        returnImage: { type: 'boolean', default: RETURN_IMAGE_DEFAULT },
        returnData: { type: 'boolean', default: RETURN_DATA_DEFAULT }
      },
      required: ['filePath']
    }
  },
  {
    name: 'list_chart_types',
    description: '列出支持的图表类型、配色方案与字段约定。',
    inputSchema: { type: 'object', properties: {} }
  }
];

// --- 启动时常驻 HTTP 服务 ---
startServer();

// --- MCP 协议 ---
function send(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }
function ok(id, result) { send({ jsonrpc: '2.0', id: id, result: result }); }
function fail(id, code, message) { send({ jsonrpc: '2.0', id: id, error: { code: code, message: message } }); }
function toolResult(content) {
  const arr = Array.isArray(content) ? content : [content];
  return { content: arr.map(c => (typeof c === 'string' ? { type: 'text', text: c } : c)), isError: false };
}

// --- 文件写入 ---
function resolveOutputDir() {
  return process.env.ECHARTS_CHARTS_DIR || path.join(os.tmpdir(), 'echarts-charts');
}
function writeChartFile(ext, content, title) {
  const dir = resolveOutputDir();
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* 重试在 writeFileSync 报错 */ }
  const base = (title || 'chart').replace(/[^\w\u4e00-\u9fff]+/g, '_').slice(0, 40) || 'chart';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `chart_${base}_${stamp}.${ext}`);
  fs.writeFileSync(file, content, 'utf8');
  return file;
}
function toFileUrl(absPath) { return pathToFileURL(absPath).href; }

// --- 数据块 ---
function buildDataBlock(table, maxRows) {
  const { columns, rows } = table;
  const total = rows.length;
  const truncated = total > maxRows;
  const kept = truncated ? rows.slice(0, maxRows) : rows;
  const arr = [columns, ...kept.map(r => r.map(v => (v == null ? null : v)))];
  const head = `（以下为清洗后的完整数据，共 ${total} 行${truncated ? `，已截断显示前 ${maxRows} 行，完整数据已落盘到 .html` : ''}，供你在后续回复中分析：占比/趋势/对比/异常值等，无需依赖图表图像）`;
  return `${head}\n\`\`\`json\n${JSON.stringify(arr)}\n\`\`\``;
}

// --- 核心：生成图表 ---
async function makeChart(args, table) {
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
  const filePath = writeChartFile('html', html, title);

  const seriesPreview = seriesList.map(s => `${s.name}: [${s.data.slice(0, 6).join(', ')}${s.data.length > 6 ? '…' : ''}]`).join('; ');
  const typeName = TYPE_NAMES[type] || type;

  // --- 内联图片生成（按优先级：data URI → localhost http → CDN） ---
  let svg = '', httpUrl = '', dataUri = '', cdnUrl = '', fileUrl = '';
  if (INLINE_MODE !== 'none') {
    try {
      svg = renderSVG({ type, title, categories, seriesList, paletteName }, { width, height });

      // 优先级1: data URI（自包含、无需联网）
      if (svg.length <= DATA_URI_MAX) {
        dataUri = 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64');
      }

      // 优先级2: localhost http（本地服务，适合 DSH/Web）
      try { httpUrl = await serveSVG(svg); } catch (e) { httpUrl = ''; }

      // 优先级3: file:// 本地文件路径（适合 ZCode 等放行本地路径的客户端）
      try {
        const svgPath = writeChartFile('svg', svg, title);
        fileUrl = toFileUrl(svgPath);
      } catch (e) { /* 写入失败则 fileUrl 为空 */ }

      // 优先级4: CDN 公网 https（兜底，适合 WorkBuddy 等只放行公网的客户端）
      // 触发条件：显式 cdn 模式，或 data URI 太大且 localhost 不可用时自动兜底
      const needCdn = INLINE_MODE === 'cdn' || (!dataUri && !httpUrl && rasterizeAvailable());
      if (needCdn && rasterizeAvailable()) {
        try {
          const { rasterize } = require('./lib/rasterize');
          const png = rasterize(svg);
          const result = await uploadChart(png, title);
          cdnUrl = result.cdnUrl;
        } catch (e) { /* 上传失败则 cdnUrl 为空 */ }
      }
    } catch (e) { /* 内联生成失败不影响主流程 */ }
  }

  // --- 构造内联图片行（按优先级选一个最合适的） ---
  const alt = title || 'chart';
  let inlineMd = '';
  const allLines = [];
  if (INLINE_MODE === 'all') {
    // 测试模式：返回所有格式，让用户判断哪个能显示
    if (dataUri) allLines.push(`【1·data URI】![${alt}](${dataUri})`);
    if (httpUrl) allLines.push(`【2·localhost http】![${alt}](${httpUrl})`);
    if (fileUrl) allLines.push(`【3·file://】![${alt}](${fileUrl})`);
    if (cdnUrl) allLines.push(`【4·CDN 公网 https】![${alt}](${cdnUrl})`);
  } else if (INLINE_MODE === 'cdn' && cdnUrl) {
    inlineMd = `![${alt}](${cdnUrl})`;
  } else if (INLINE_MODE === 'file' && fileUrl) {
    inlineMd = `![${alt}](${fileUrl})`;
  } else if (dataUri) {
    inlineMd = `![${alt}](${dataUri})`;
  } else if (httpUrl) {
    inlineMd = `![${alt}](${httpUrl})`;
  } else if (fileUrl) {
    inlineMd = `![${alt}](${fileUrl})`;
  } else if (cdnUrl) {
    inlineMd = `![${alt}](${cdnUrl})`;
  }

  // --- 构造 summary ---
  let summary = `图表已生成：\n${filePath}\n`;
  summary += `类型：${typeName}（${type}）| 标题="${title}" | 配色=${paletteName} | ${width}x${height}\n`;
  summary += `数据：${categories.length} 个类别；序列：${seriesPreview}\n`;
  if (INLINE_MODE === 'all' && allLines.length) {
    summary += `【内联出图测试·原样复制全部行到回复】把以下所有行原样复制到回复，看哪张图正常显示：\n${allLines.join('\n')}\n`;
    summary += `\n【自动检测·Agent 指令】用户指出能渲染的编号后，按以下映射设置模式：\n`;
    summary += `  "1正常" → data URI 可用 → ECHARTS_INLINE_MODE=inline\n`;
    summary += `  "2正常" → localhost http 可用 → ECHARTS_INLINE_MODE=inline\n`;
    summary += `  "3正常" → file:// 可用 → ECHARTS_INLINE_MODE=file\n`;
    summary += `  "4正常" → CDN 公网 https 可用 → ECHARTS_INLINE_MODE=cdn\n`;
    summary += `  "都行" → 优先 ECHARTS_INLINE_MODE=inline（data URI 自包含、无需联网）\n`;
    summary += `  "都不行" → ECHARTS_INLINE_MODE=none（纯文本 + .html 交互图）\n`;
    summary += `设置方法：修改 MCP 配置的 env.ECHARTS_INLINE_MODE 值，重启 MCP 连接生效。\n`;
  } else if (inlineMd) {
    summary += `【内联出图·必须执行】把下方这行 **原样复制到回复中**，图表即在对话框内联：\n${inlineMd}\n`;
  }
  summary += `【交互图】在 DSH/Web 中把 .html 路径用反引号包成行内代码即可点击打开。`;

  const content = [{ type: 'text', text: summary }];

  // image content block（给支持它的客户端，如 Claude Desktop / Cursor；不支持的会忽略）
  if (args.returnImage !== false && svg) {
    content.push({ type: 'image', data: Buffer.from(svg, 'utf8').toString('base64'), mimeType: 'image/svg+xml' });
  }

  if (args.returnHtml === true) content.push({ type: 'text', text: html });
  if (args.returnData !== false) {
    try { content.push({ type: 'text', text: buildDataBlock(table, DATA_MAX_ROWS) }); } catch (e) { /* ignore */ }
  }
  content.push({ type: 'text', text: 'ECharts option (JSON):\n```json\n' + JSON.stringify(option) + '\n```' });

  return toolResult(content);
}

// --- 工具分发 ---
async function handleCall(msg) {
  const id = msg.id;
  const name = msg.params && msg.params.name;
  const args = (msg.params && msg.params.arguments) || {};
  try {
    if (name === 'chart_from_data') {
      if (!args.data) throw new Error('缺少必填参数 data');
      return ok(id, await makeChart(args, toTable(args.data, args.columns)));
    }
    if (name === 'chart_from_file') {
      if (!args.filePath) throw new Error('缺少必填参数 filePath');
      const abs = path.isAbsolute(args.filePath) ? args.filePath : path.resolve(process.cwd(), args.filePath);
      const rows = parseFile(abs, args.sheet);
      if (!rows[0] || rows.length < 2) throw new Error('文件为空或无数据');
      return ok(id, await makeChart(args, { columns: rows[0], rows: rows.slice(1) }));
    }
    if (name === 'list_chart_types') {
      return ok(id, toolResult([JSON.stringify({
        chartTypes: ['bar', 'line', 'pie'], palettes: VALID_PALETTES,
        fieldConvention: '第一列=类别轴；其余列=数值序列（多列即多序列）；auto 会按数据自动选 饼/柱',
        dataSource: '由调用方（agent 的网页搜索或本地文件）提供数据，本服务只负责生成图表'
      }, null, 2)]));
    }
    return fail(id, -32601, '未知工具：' + name);
  } catch (e) {
    return ok(id, { content: [{ type: 'text', text: '错误：' + e.message }], isError: true });
  }
}

// --- MCP 主循环 ---
const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', line => {
  line = line.trim();
  if (!line) return;
  let msg;
  try { msg = JSON.parse(line); } catch (e) { return; }
  if (msg.id !== undefined && msg.method) {
    if (msg.method === 'initialize') {
      ok(msg.id, { protocolVersion: (msg.params && msg.params.protocolVersion) || '2024-11-05', capabilities: { tools: {} }, serverInfo: SERVER });
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
});
rl.on('close', () => process.exit(0));

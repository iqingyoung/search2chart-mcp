import { createRequire } from 'module';
import { defineTool } from '@deepseek-ai/dsh-tools';

// 原生 DSH 插件（ESM）。核心图表逻辑在 CJS 的 lib/ 下，用 createRequire 复用。
const require = createRequire(import.meta.url);
const { pack } = require('./lib/chart.js');
const { renderSVG } = require('./lib/svg.js');
const { serveSVG } = require('./lib/server.js');

export const name = 'chart';
export const inject = ['tools'];

function buildMarkdown(value) {
  const image = `![${value.title || 'chart'}](${value.url})`;
  return `${image}\n\n图表已生成（类型=${value.type}）。ECharts option：\n\`\`\`json\n${value.optionJson}\n\`\`\``;
}

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'chart',
    description: '根据结构化数据生成图表并在对话中内联显示。返回 Markdown 图片，DSH 直接内联渲染（无需点击链接）。支持 bar/line/pie，多列即多序列。',
    parameters: {
      data: { type: 'array', required: true, description: '表格数据：数组的数组（首行可当表头）或对象数组，例：[["月份","销量"],["1月",120],["2月",200]]' },
      columns: { type: 'array', items: { type: 'string' }, description: '可选列名；对象数组或首行为非表头时需显式给出' },
      chartType: { type: 'string', enum: ['auto', 'bar', 'line', 'pie'], default: 'auto', description: 'auto 按数据自动选（单序列且合计≈100 判为饼图）' },
      title: { type: 'string', default: '', description: '图表标题' },
      palette: { type: 'string', enum: ['default', 'pastel', 'vivid'], default: 'default', description: '配色方案' },
      width: { type: 'number', default: 720, description: '图表宽度(px)，仅影响导出尺寸' },
      height: { type: 'number', default: 420, description: '图表高度(px)，仅影响导出尺寸' }
    },
    // output.schema 是「值 schema 的 spec」，由 dsh-tools 编译成受支持的 JSON Schema 子集。
    // render 返回内容块数组；这里返回 Markdown 文本——DSH 的 markdown 渲染器会把
    // http(s) 图片（http://127.0.0.1:<port>/<id>.svg）内联到对话流。
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          url: { type: 'string' },
          type: { type: 'string' },
          title: { type: 'string' },
          optionJson: { type: 'string' }
        }
      },
      render: (_args, value) => [{ type: 'text', text: buildMarkdown(value) }]
    },
    presentCall: (args) => ({ card: 'generic', title: args.title || 'Chart', kind: 'execute', rawInput: JSON.stringify(args).slice(0, 160) }),
    async execute(args) {
      const option = pack(args.data, args.columns, args.chartType, args.title, args.palette);
      const svg = renderSVG(option, { width: args.width || 720, height: args.height || 420 });
      const url = await serveSVG(svg);
      return { url, type: option.type, title: option.title || '', optionJson: JSON.stringify(option) };
    }
  }));
}

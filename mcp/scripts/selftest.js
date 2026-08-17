'use strict';
// 端到端自检：用 process.execPath 拉起 server，走一遍 MCP 握手与两路出图。
// 用法：npm test
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const SERVER = path.join(__dirname, '..', 'server.js');
const SAMPLE = path.join(__dirname, '..', 'sample.csv');
const node = process.execPath;

const requests = [
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {} } },
  { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'chart_from_data', arguments: { data: [['品牌', '市占率'], ['A', 22.1], ['B', 18.4], ['C', 15.2]], chartType: 'bar', title: '市占率示例' } } },
  { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_chart_types' } },
  { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'chart_from_file', arguments: { filePath: SAMPLE, chartType: 'pie', title: '示例饼图' } } },
  { jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'chart_from_data', arguments: { data: [['月', '销'], ['1', 10], ['2', 30], ['3', 25]], chartType: 'line', title: '折线', returnImage: false } } }
];

const expectedTools = ['chart_from_data', 'chart_from_file', 'list_chart_types'];

function run() {
  const child = spawn(node, [SERVER], { stdio: ['pipe', 'pipe', 'inherit'] });
  let out = '';
  child.stdout.on('data', d => { out += d.toString(); });
  child.on('close', () => {
    const lines = out.split('\n').filter(Boolean);
    let okInit = false;
    let tools = [];
    let dataFile = null;
    let fileFile = null;
    let typesOk = false;
    let dataHasImage = false;     // id=3 默认应含 image block
    let fileHasImage = false;     // id=5 默认应含 image block
    let dataHasMdFile = false;    // id=3 应含 ![](file://...svg) 且 svg 文件存在
    let dataHasTypeName = false;  // id=3 summary 应含中文类型名（如"柱状图"）
    let dataHasDataBlock = false; // id=3 应含清洗数据 JSON 块
    let lineNoImage = true;       // id=6 returnImage=false 应不含 image block 与 md 图片

    for (const l of lines) {
      let m; try { m = JSON.parse(l); } catch { continue; }
      if (m.id === 1 && m.result && m.result.serverInfo) okInit = true;
      if (m.id === 2 && m.result && m.result.tools) tools = m.result.tools.map(t => t.name);
      if ((m.id === 3 || m.id === 5) && m.result && m.result.content) {
        const blocks = m.result.content;
        const txt = blocks.find(b => b.type === 'text').text;
        const fm = txt.match(/[^\s"]+\.html/);
        if (fm && fs.existsSync(fm[0])) {
          if (m.id === 3) dataFile = fm[0];
          if (m.id === 5) fileFile = fm[0];
        }
        const img = blocks.find(b => b.type === 'image');
        if (img && img.mimeType === 'image/svg+xml' && img.data) {
          if (m.id === 3) dataHasImage = true;
          if (m.id === 5) fileHasImage = true;
        }
        // 校验 summary 文本里含一行 ![...](file:///...svg) 且 svg 文件存在
        const um = txt.match(/file:\/\/\/(.+\.svg)/);
        if (um && fs.existsSync('/' + um[1]) && m.id === 3) dataHasMdFile = true;
        // 校验中文类型名
        if (m.id === 3 && /图表类型：[柱状图|折线图|饼图]/.test(txt)) dataHasTypeName = true;
        // 校验清洗数据 JSON 块
        if (m.id === 3 && blocks.some(b => b.type === 'text' && b.text.includes('清洗后的完整数据'))) dataHasDataBlock = true;
      }
      if (m.id === 6 && m.result && m.result.content) {
        const noImgBlock = !m.result.content.some(b => b.type === 'image');
        const noMdLine = !m.result.content.some(b => b.type === 'text' && /file:\/\/\/.+\.svg/.test(b.text));
        lineNoImage = noImgBlock && noMdLine;
      }
      if (m.id === 4 && m.result && m.result.content) typesOk = true;
    }

    const toolsOk = expectedTools.every(t => tools.includes(t));
    const allPass = okInit && toolsOk && !!dataFile && !!fileFile && typesOk && dataHasImage && fileHasImage && dataHasMdFile && dataHasTypeName && dataHasDataBlock && lineNoImage;

    console.log('initialize handshake :', okInit ? 'PASS' : 'FAIL');
    console.log('tools/list           :', toolsOk ? 'PASS (' + tools.join(', ') + ')' : 'FAIL (got ' + tools.join(',') + ')');
    console.log('chart_from_data file :', dataFile ? 'PASS -> ' + dataFile : 'FAIL');
    console.log('chart_from_data image:', dataHasImage ? 'PASS (image/svg+xml block)' : 'FAIL');
    console.log('chart_from_data mdImg:', dataHasMdFile ? 'PASS (file:// .svg 内联图片)' : 'FAIL');
    console.log('chart_from_data type :', dataHasTypeName ? 'PASS (中文类型名)' : 'FAIL');
    console.log('chart_from_data data :', dataHasDataBlock ? 'PASS (清洗数据 JSON 块)' : 'FAIL');
    console.log('chart_from_file file :', fileFile ? 'PASS -> ' + fileFile : 'FAIL');
    console.log('chart_from_file image:', fileHasImage ? 'PASS (image/svg+xml block)' : 'FAIL');
    console.log('returnImage=false    :', lineNoImage ? 'PASS (no image/md block)' : 'FAIL');
    console.log('list_chart_types     :', typesOk ? 'PASS' : 'FAIL');
    console.log('\nRESULT:', allPass ? 'ALL PASS' : 'SOME FAILED');
    process.exit(allPass ? 0 : 1);
  });

  for (const r of requests) child.stdin.write(JSON.stringify(r) + '\n');
  child.stdin.end();
}

run();

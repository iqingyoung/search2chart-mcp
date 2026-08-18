'use strict';
// 隔离自测：验证「数据 → SVG → localhost HTTP 服务 → 可内联的 http(s) 图片 URL」全链路。
// 不依赖 DSH，仅验证核心机制（DSH 侧渲染需在 DSH 内实测）。
const http = require('http');
const { pack } = require('./lib/chart.js');
const { renderSVG } = require('./lib/svg.js');
const { serveSVG } = require('./lib/server.js');

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, ct: res.headers['content-type'], body }));
    }).on('error', reject);
  });
}

(async () => {
  const cases = [
    { name: 'pie', data: [['品牌', '市占率'], ['A', 22.1], ['B', 18.4], ['C', 15.2], ['D', 11.8], ['E', 9.3]], type: 'pie', title: '去年市占率' },
    { name: 'bar', data: [['月份', '销量'], ['1月', 120], ['2月', 200], ['3月', 150]], type: 'bar', title: '月度销量' },
    { name: 'line', data: [['周', 'A', 'B'], ['W1', 10, 5], ['W2', 15, 8], ['W3', 12, 9]], type: 'line', title: '双序列' }
  ];
  let allPass = true;
  for (const c of cases) {
    const option = pack(c.data, null, c.type, c.title, 'default');
    const svg = renderSVG(option, { width: 720, height: 420 });
    const okSvg = svg.startsWith('<svg') && svg.includes('</svg>');
    const url = await serveSVG(svg);
    const r = await get(url);
    const okHttp = r.status === 200 && (r.ct || '').includes('svg') && r.body.startsWith('<svg');
    console.log(`[${c.name}] svg=${okSvg} http=${okHttp} (${r.status}) url=${url}`);
    if (!okSvg || !okHttp) allPass = false;
  }
  console.log('\nRESULT:', allPass ? 'ALL PASS' : 'SOME FAILED');
  process.exit(allPass ? 0 : 1);
})();

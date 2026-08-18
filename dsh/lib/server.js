'use strict';
// 单例 localhost HTTP 服务：把生成的 SVG 以 http(s) 暴露给 DSH 浏览器。
// 为什么必须走 HTTP：DSH 的 markdown 图片渲染只放行 http(s) 协议
// （sanitizeUrl 拦截 file:/data:），所以内联图表只能由本服务喂 http URL。
const http = require('http');
const crypto = require('crypto');

const PORT_START = 18765;
const store = new Map(); // id -> svg string
let server = null;
let port = null;

function handler(req, res) {
  const url = req.url || '/';
  if (url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  const m = url.match(/^\/([a-f0-9]{16})\.svg$/);
  if (m && store.has(m[1])) {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(store.get(m[1]));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
}

function listen(p) {
  return new Promise((resolve, reject) => {
    const s = http.createServer(handler);
    s.once('error', (e) => { if (e.code === 'EADDRINUSE') reject(e); else reject(e); });
    s.listen(p, '127.0.0.1', () => { server = s; port = p; resolve(p); });
  });
}

async function ensureServer() {
  if (server) return port;
  let p = PORT_START;
  for (let i = 0; i < 20; i++) {
    try { await listen(p); return port; } catch (e) { if (e.code !== 'EADDRINUSE') throw e; p++; }
  }
  throw new Error('无法在 ' + PORT_START + '~ 区间绑定 localhost 端口');
}

// 存入 SVG，返回可被 DSH 内联渲染的 http(s) 图片 URL
async function serveSVG(svg) {
  const p = await ensureServer();
  const id = crypto.randomBytes(8).toString('hex');
  store.set(id, svg);
  return `http://127.0.0.1:${p}/${id}.svg`;
}

module.exports = { serveSVG, _store: store };

'use strict';
// 零依赖本地 HTTP 服务：把 SVG 暴露成 http://127.0.0.1:PORT/<id>.svg
// 用途：让「只放行 http(s) 图片」的客户端（DSH/WorkBuddy 的 markdown 渲染器）
// 能在对话框内联渲染图表，而不依赖被多模态输入过滤掉的 image content block。
const http = require('http');
const crypto = require('crypto');

// 端口：优先用环境变量固定（便于调试与跨会话稳定），否则在 18765-18784 区间自动挑选空闲端口。
const FIXED_PORT = parseInt(process.env.SEARCH2CHART_PORT || '0', 10) || 0;
const PORTS = [];
for (let p = 18765; p <= 18784; p++) PORTS.push(p);

const store = new Map(); // id(16hex) -> svg 文本
let server = null;
let port = null;
let starting = null; // 防止并发重复拉起

function ensureServer() {
  if (server) return Promise.resolve(port);
  if (starting) return starting;
  starting = new Promise((resolve, reject) => {
    // 固定端口优先，但被占用时自动回退到 18765-18784 区间，避免「端口被占 → 整条内联链路失效」。
    const candidates = FIXED_PORT ? [FIXED_PORT, ...PORTS] : PORTS;
    let i = 0;
    function tryNext() {
      if (i >= candidates.length) return reject(new Error('no free port available'));
      const p = candidates[i++];
      const s = http.createServer((req, res) => {
        // 仅放行 /<16hex>.svg，避免目录遍历与任意路径访问
        const u = req.url || '';
        const m = u.match(/^\/([0-9a-f]{16})\.svg$/);
        if (!m) { res.writeHead(404); res.end('not found'); return; }
        const svg = store.get(m[1]);
        if (!svg) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
          'Access-Control-Allow-Origin': '*',
          'Server': 'search2chart'
        });
        res.end(svg);
      });
      s.on('error', (e) => {
        if (e.code === 'EADDRINUSE') { tryNext(); }
        else reject(e);
      });
      s.listen(p, '127.0.0.1', () => { server = s; port = p; starting = null; resolve(p); });
    }
    tryNext();
  });
  return starting;
}

// 在 MCP 进程启动时调用一次：提前占好端口并常驻，保证整个会话期间图表 URL 始终可访问。
// 这样模型在对话里贴出的 http(s) 图片链接不会因「服务未启动/已退出」而变成死链（图片图标但不加载）。
function startServer() {
  return ensureServer().catch(e => { /* 端口占用等不影响主流程，首次 serveSVG 时再尝试 */ });
}

// 返回形如 http://127.0.0.1:18765/abcdef0123456789.svg 的 URL
async function serveSVG(svg) {
  const p = await ensureServer();
  const id = crypto.randomBytes(8).toString('hex');
  store.set(id, svg);
  // 会话级存活：1 小时后自动清理，避免内存无限增长；未到期前图表 URL 一直可访问。
  setTimeout(() => store.delete(id), 60 * 60 * 1000).unref();
  return `http://127.0.0.1:${p}/${id}.svg`;
}

function getPort() { return port; }

module.exports = { serveSVG, ensureServer, startServer, getPort };

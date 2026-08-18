'use strict';
// GitHub 上传 + jsDelivr CDN 适配 + 定期清理
// 零依赖（原生 https）

const https = require('https');

const REPO = process.env.ECHARTS_CDN_REPO || 'iqingyoung/search2chart-cdn';
const TOKEN = process.env.ECHARTS_CDN_TOKEN || '';
const BRANCH = process.env.ECHARTS_CDN_BRANCH || 'main';
const CDN_PREFIX = `https://cdn.jsdelivr.net/gh/${REPO}@${BRANCH}/charts/`;
const RETENTION_DAYS = parseInt(process.env.ECHARTS_CDN_RETENTION_DAYS || '3', 10) || 3;

function ghRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    if (!TOKEN) return reject(new Error('ECHARTS_CDN_TOKEN not set'));
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      'Authorization': `Bearer ${TOKEN}`,
      'User-Agent': 'search2chart-mcp',
      'Accept': 'application/vnd.github.v3+json',
    };
    if (data) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(data);
    }
    const req = https.request({
      hostname: 'api.github.com',
      path,
      method,
      headers,
    }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(b)); } catch (e) { resolve(b); }
        } else {
          reject(new Error(`GitHub API ${method} ${path} → ${res.statusCode}: ${b.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function listCharts() {
  try {
    const r = await ghRequest('GET', `/repos/${REPO}/contents/charts?ref=${BRANCH}`);
    return Array.isArray(r) ? r.filter(f => f.name.endsWith('.png' || f.type === 'file')) : [];
  } catch (e) {
    return [];
  }
}

async function cleanupOldFiles() {
  const files = await listCharts();
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const toDelete = files.filter(f => {
    // 文件名里含时间戳 chart_xxx_YYYY-MM-DDTHH-MM-SS.png
    const m = f.name.match(/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
    if (!m) return false;
    const ts = new Date(m[1].replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3'));
    return ts.getTime() < cutoff;
  });
  const deleted = [];
  for (const f of toDelete) {
    try {
      await ghRequest('DELETE', `/repos/${REPO}/contents/${f.path}`, {
        message: `auto-cleanup: remove ${f.name} (>${RETENTION_DAYS}d)`,
        sha: f.sha,
        branch: BRANCH,
      });
      deleted.push(f.name);
    } catch (e) { /* 单个失败不影响 */ }
  }
  return deleted;
}

async function uploadPNG(pngBytes, fileName) {
  const content = Buffer.from(pngBytes).toString('base64');
  const r = await ghRequest('PUT', `/repos/${REPO}/contents/charts/${fileName}`, {
    message: `chart: ${fileName}`,
    content,
    branch: BRANCH,
  });
  return {
    cdnUrl: CDN_PREFIX + fileName,
    path: r.content?.path,
    sha: r.content?.sha,
  };
}

async function uploadChart(pngBytes, title) {
  const base = (title || 'chart').replace(/[^\w\u4e00-\u9fff]+/g, '_').slice(0, 40) || 'chart';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `chart_${base}_${stamp}.png`;
  const result = await uploadPNG(pngBytes, fileName);
  // 上传成功后顺手清理旧文件（异步，不阻塞返回）
  cleanupOldFiles().catch(() => {});
  return result;
}

module.exports = { uploadChart, cleanupOldFiles, listCharts, CDN_PREFIX, REPO };

'use strict';
// 下载 echarts 到 vendor/，使生成的 HTML 离线/沙箱内也能渲染（无需 CDN）。
// 用法：npm run fetch-echarts
const https = require('https');
const fs = require('fs');
const path = require('path');

const URL = 'https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js';
const out = path.join(__dirname, '..', 'vendor', 'echarts.min.js');

https.get(URL, res => {
  if (res.statusCode !== 200) { console.error('下载失败，状态码', res.statusCode); process.exit(1); }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const file = fs.createWriteStream(out);
  res.pipe(file);
  file.on('finish', () => { file.close(); console.log('已保存到', out); });
}).on('error', e => { console.error('下载出错：', e.message); process.exit(1); });

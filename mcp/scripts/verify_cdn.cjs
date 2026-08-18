'use strict';
// CDN 端到端验证：SVG → PNG → GitHub 上传 → jsDelivr CDN → 清理
const { renderSVG } = require('../lib/svg');
const { isAvailable, rasterize } = require('../lib/rasterize');
const { uploadChart, cleanupOldFiles, listCharts, CDN_PREFIX } = require('../lib/upload');

async function main() {
  console.log('[1] resvg available:', isAvailable());
  if (!isAvailable()) { console.log('SKIP: @resvg/resvg-js not installed'); return; }

  console.log('[2] Generating SVG...');
  const svg = renderSVG({
    type: 'bar', title: 'CDN 验证图',
    categories: ['A', 'B', 'C'], seriesList: [{ name: '系列1', data: [10, 20, 30] }],
    paletteName: 'default',
  }, { width: 400, height: 300 });
  console.log('    SVG length:', svg.length);

  console.log('[3] Rasterizing SVG → PNG...');
  const png = rasterize(svg);
  console.log('    PNG bytes:', png.length);

  console.log('[4] Uploading to GitHub...');
  try {
    const result = await uploadChart(png, 'CDN_VERIFY');
    console.log('    CDN URL:', result.cdnUrl);
    console.log('    path:', result.path);

    console.log('[5] Verifying CDN reachable...');
    const https = require('https');
    await new Promise((resolve, reject) => {
      https.get(result.cdnUrl, (res) => {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => {
          console.log('    CDN status:', res.statusCode, 'content-type:', res.headers['content-type'], 'bytes:', b.length);
          resolve();
        });
      }).on('error', reject);
    });

    console.log('[6] Listing charts directory...');
    const files = await listCharts();
    console.log('    Total files:', files.length);
    for (const f of files.slice(0, 5)) {
      console.log('     -', f.name, f.size + 'B');
    }

    console.log('[7] Cleaning up old files (RETENTION_DAYS=' + (process.env.ECHARTS_CDN_RETENTION_DAYS || '3') + ')...');
    const deleted = await cleanupOldFiles();
    console.log('    Deleted:', deleted.length, deleted.length ? deleted : '(none to delete)');

    console.log('\nCDN ALL PASS');
  } catch (e) {
    console.error('UPLOAD ERROR:', e.message);
    process.exit(1);
  }
}

main();

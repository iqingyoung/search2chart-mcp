'use strict';
// 单元测试：upload 过滤 / toTable 列校验 / 非数值 null 化 / BOM 与 CSV 边界 / HTML 宽高。
// 零依赖，node 原生 assert。运行：npm test（先跑本文件，再跑 selftest.js）。
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { isChartFile } = require('../lib/upload');
const { toTable, extractSeries, inferType } = require('../lib/chart');
const { parseFile, parseCSV } = require('../lib/parse');
const { renderHTML } = require('../lib/html');

let passed = 0;
function t(name, fn) {
  fn();
  passed++;
  console.log(`  ✔ ${name}`);
}

// --- #1 upload 过滤：仅 .png 命名且类型为 file 的条目进入清理范围 ---
t('isChartFile 放行 png 文件、拦截目录与非 png', () => {
  assert.equal(isChartFile({ name: 'chart_市占_2026-09-06T10-00-00.png', type: 'file' }), true);
  assert.equal(isChartFile({ name: 'notes.png', type: 'dir' }), false);
  assert.equal(isChartFile({ name: 'chart.jpg', type: 'file' }), false);
});

// --- #15 toTable 列数一致性校验 ---
t('toTable 对列数参差的数组数据报错并指明行号', () => {
  assert.throws(
    () => toTable([['a', 'b'], [1, 2], [3]]),
    /第 2 行有 1 列，与表头 2 列不一致/
  );
  assert.doesNotThrow(() => toTable([['a', 'b'], [1, 2], [3, 4]]));
});

// --- #8 非数值置 null 且计入 ignored，不再静默归 0 ---
t('extractSeries 非数值单元格置 null 并统计', () => {
  const { seriesList, ignored } = extractSeries(toTable([['月份', '销量'], ['1月', '10'], ['2月', 'abc'], ['3月', 30]]));
  assert.deepEqual(seriesList[0].data, [10, null, 30]);
  assert.equal(ignored.length, 1);
  assert.equal(ignored[0].column, '销量');
});

t('inferType 忽略 null 判断正值', () => {
  const table = toTable([['k', 'v'], ['a', 1], ['b', 'x'], ['c', 2], ['d', 3]]);
  // null 不再把 allPositive 判为 false
  assert.equal(inferType(table), 'pie');
});

// --- #14 BOM 剥离 ---
t('parseFile 剥离 UTF-8 BOM', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's2c-test-'));
  const file = path.join(dir, 'bom.csv');
  fs.writeFileSync(file, '\uFEFF城市,GDP\n北京,4\n上海,3\n');
  const rows = parseFile(file);
  assert.equal(rows[0][0], '城市');
  fs.rmSync(dir, { recursive: true, force: true });
});

// --- #15 超大文件 / 列数参差报错 ---
t('parseFile 拒绝超过 20MB 的文件', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 's2c-test-'));
  const file = path.join(dir, 'big.csv');
  const line = 'a,b,c,d,e,f,g,h\n';
  fs.writeFileSync(file, line.repeat(Math.ceil(21 * 1024 * 1024 / line.length)));
  assert.throws(() => parseFile(file), /文件过大/);
  fs.rmSync(dir, { recursive: true, force: true });
});

t('parseCSV 引号与换行回归', () => {
  const rows = parseCSV('a,b\n"1,5","he said ""hi"""\n');
  assert.deepEqual(rows[1], ['1,5', 'he said "hi"']);
});

// --- #10 HTML 使用传入宽高，不再硬编码 720x420 ---
t('renderHTML 把传入宽高注入 #chart 样式', () => {
  const html = renderHTML({ title: 't', categories: ['a'], seriesList: [{ name: 's', data: [1] }], defaultType: 'bar', width: 960, height: 540 });
  assert.ok(html.includes('#chart{width:960px;height:540px'), html.slice(0, 400));
});

// --- #12 includeOption 默认省略（server 层行为在 selftest 端到端覆盖）---
t('renderHTML 产物含交互控件与数据 payload', () => {
  const html = renderHTML({ title: 't', categories: ['a'], seriesList: [{ name: 's', data: [1] }], defaultType: 'bar', width: 720, height: 420 });
  assert.ok(html.includes('const D=') && html.includes('id="chart"'));
});

console.log(`\n单元测试通过：${passed} 项`);

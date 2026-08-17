'use strict';
// 数据归一化 + 选图推断 + ECharts 风格 option（零依赖）。
// 产物是一个与渲染器无关的结构：{ type, title, categories, seriesList, paletteName }
// 供 lib/svg.js 渲染成内联 SVG（DSH 对话内联），也可被 echarts 直接消费。

const PALETTES = {
  default: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4'],
  pastel: ['#8ecafe', '#b3e6b3', '#ffe08a', '#ffb3b3', '#a8d8ff', '#c2e0c2', '#ffd6a5', '#d8b3ff'],
  vivid: ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#bfef45']
};

function toTable(data, columns) {
  if (Array.isArray(data) && data.length && Array.isArray(data[0])) {
    let cols = columns;
    let rows = data;
    if (!cols && data.length && Array.isArray(data[0]) && typeof data[0][0] === 'string' && String(data[0][0]).length && !isFinite(Number(data[0][0]))) {
      cols = data[0];
      rows = data.slice(1);
    }
    return { columns: cols || [], rows };
  }
  if (Array.isArray(data) && data.length && typeof data[0] === 'object') {
    const cols = columns || Object.keys(data[0]);
    const rows = data.map((o) => cols.map((c) => o[c]));
    return { columns: cols, rows };
  }
  throw new Error('data 格式无法解析：需为数组的数组或对象数组');
}

function isNumeric(v) { return typeof v === 'number' && isFinite(v); }

function extractSeries(table) {
  const { columns, rows } = table;
  const cats = rows.map((r) => String(r[0]));
  const seriesList = [];
  for (let c = 1; c < (columns.length || rows[0].length); c++) {
    const name = columns[c] !== undefined ? String(columns[c]) : `系列${c}`;
    const data = rows.map((r) => (isNumeric(r[c]) ? r[c] : (r[c] === undefined || r[c] === '' ? 0 : Number(r[c]) || 0)));
    seriesList.push({ name, data });
  }
  return { categories: cats, seriesList };
}

function inferType(table) {
  const { seriesList } = extractSeries(table);
  if (seriesList.length === 1) {
    const d = seriesList[0].data;
    const sum = d.reduce((a, b) => a + b, 0);
    const allPos = d.every((v) => v >= 0);
    if (allPos && sum > 0 && Math.abs(sum - 100) < 1.5) return 'pie';
  }
  return 'bar';
}

function buildOption(categories, seriesList, type, paletteName, title) {
  return {
    type: type || 'bar',
    title: title || '',
    categories,
    seriesList,
    paletteName: paletteName || 'default'
  };
}

function pack(data, columns, chartType, title, paletteName) {
  const table = toTable(data, columns);
  const type = chartType && chartType !== 'auto' ? chartType : inferType(table);
  const { categories, seriesList } = extractSeries(table);
  const option = buildOption(categories, seriesList, type, paletteName, title);
  return option;
}

module.exports = { PALETTES, toTable, extractSeries, inferType, buildOption, pack };

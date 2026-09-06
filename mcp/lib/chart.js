'use strict';

// 把输入数据归一化为 { columns, rows }
function toTable(data, columns) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('data 不能为空');
  }
  let rows;
  if (Array.isArray(data[0])) {
    rows = data.map(r => r);
    // 首行全为字符串且未显式给 columns，则视为表头
    if (!columns && data.length > 1 && data[0].every(x => typeof x === 'string')) {
      columns = data[0];
      rows = data.slice(1);
    }
    // 列数一致性：参差数据会让后续取列行为含糊，尽早报错
    if (columns) {
      const bad = rows.findIndex(r => r.length !== columns.length);
      if (bad >= 0) {
        throw new Error(`第 ${bad + 1} 行有 ${rows[bad].length} 列，与表头 ${columns.length} 列不一致，请检查数据`);
      }
    }
  } else if (typeof data[0] === 'object' && data[0] !== null) {
    if (!columns) columns = Object.keys(data[0]);
    rows = data.map(o => columns.map(c => o[c]));
  } else {
    throw new Error('data 需为「数组的数组」或「对象数组」');
  }
  if (!columns) columns = rows[0].map((_, i) => 'col' + (i + 1));
  return { columns, rows };
}

// 从表格抽取类别轴 + 多个数值序列
// 非数值单元格不再静默归 0（掩盖脏数据），置为 null 并计入 ignored 供 summary 提示
function extractSeries(table) {
  const { columns, rows } = table;
  const ignored = [];
  const categories = rows.map(r => String(r[0] == null ? '' : r[0]));
  const seriesList = columns.slice(1).map((name, idx) => ({
    name: String(name),
    data: rows.map((r, ri) => {
      const raw = r[idx + 1];
      const v = parseFloat(raw);
      if (isNaN(v)) {
        ignored.push({ row: ri + 1, column: String(name), value: raw });
        return null;
      }
      return v;
    })
  }));
  if (seriesList.length === 0) {
    throw new Error('至少需要两列（类别 + 数值）才能绘图');
  }
  return { categories, seriesList, ignored };
}

// 自动推断图表类型
function inferType(table) {
  const { seriesList } = extractSeries(table);
  const values = seriesList[0].data;
  const allPositive = values.every(v => v === null || v >= 0);
  const smallCardinality = table.rows.length <= 12;
  // 类别少且都为正 -> 适合饼图；否则默认柱状
  if (smallCardinality && allPositive && seriesList.length === 1) return 'pie';
  return 'bar';
}

// 生成 ECharts option（与 html.js 中的浏览器端 builder 逻辑保持一致）
function buildOption(categories, seriesList, type, palette, title) {
  const colors = palette && palette.length ? palette : undefined;
  if (type === 'pie') {
    const s = seriesList[0];
    return {
      backgroundColor: 'transparent',
      title: { text: title || '', left: 'center' },
      tooltip: { trigger: 'item' },
      legend: { bottom: 0 },
      series: [{
        type: 'pie',
        radius: ['35%', '65%'],
        data: categories.map((c, i) => ({ name: c, value: s.data[i] })),
        itemStyle: { borderColor: '#fff', borderWidth: 1 },
        color: colors
      }]
    };
  }
  const series = seriesList.map((s, i) => ({
    name: s.name,
    type: type,
    data: s.data,
    itemStyle: colors ? { color: colors[i % colors.length] } : undefined,
    areaStyle: type === 'line' ? { opacity: 0.12 } : undefined,
    smooth: type === 'line'
  }));
  return {
    backgroundColor: 'transparent',
    title: { text: title || '', left: 'center' },
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    grid: { left: 48, right: 24, top: 48, bottom: 48 },
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: { interval: 0, rotate: categories.length > 8 ? 30 : 0 }
    },
    yAxis: { type: 'value' },
    series: series
  };
}

module.exports = { toTable, extractSeries, inferType, buildOption };

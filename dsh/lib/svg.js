'use strict';
// 零依赖 SVG 渲染器：把 chart.js 的 option 画成内联 SVG 字符串。
// 支持 bar / line / pie；多序列分组；自带坐标轴、网格、图例。
const { PALETTES } = require('./chart.js');

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}
function fmt(n) {
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1);
}
function niceMax(v) {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}
function color(i) {
  const p = PALETTES.default;
  return p[i % p.length];
}

function axes(title, width, height, padL, padR, padT, padB, plotW, plotH, maxV) {
  let s = '';
  if (title) s += `<text x="${width / 2}" y="22" text-anchor="middle" font-size="16" font-family="sans-serif" font-weight="600" fill="#1f2329">${esc(title)}</text>`;
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const y = padT + plotH * (i / ticks);
    const val = maxV * (1 - i / ticks);
    s += `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="#eceef1" stroke-width="1"/>`;
    s += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="11" font-family="sans-serif" fill="#8a8f99">${esc(fmt(val))}</text>`;
  }
  // y axis line
  s += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="#d0d3d9" stroke-width="1"/>`;
  return s;
}

function legend(seriesList, width, padT, colors) {
  let s = `<g font-size="12" font-family="sans-serif" fill="#1f2329">`;
  let x = 12;
  const y = padT - 18 > 6 ? padT - 14 : 10;
  seriesList.forEach((se, i) => {
    const c = colors[i % colors.length];
    s += `<rect x="${x}" y="${y - 10}" width="11" height="11" rx="2" fill="${c}"/>`;
    const label = esc(se.name);
    s += `<text x="${x + 16}" y="${y}" dominant-baseline="middle">${label}</text>`;
    x += 16 + label.length * 7 + 18;
  });
  s += `</g>`;
  return s;
}

function renderBar(option, width, height, colors) {
  const padL = 56, padR = 16, padT = option.title ? 44 : 22, padB = 46;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const { categories, seriesList } = option;
  const all = seriesList.flatMap((s) => s.data);
  const maxV = niceMax(Math.max(0, ...all));
  let s = axes(option.title, width, height, padL, padR, padT, padB, plotW, plotH, maxV);
  const n = categories.length || 1;
  const band = plotW / n;
  const bw = Math.min(46, (band * 0.72) / Math.max(1, seriesList.length));
  seriesList.forEach((se, si) => {
    const c = colors[si % colors.length];
    se.data.forEach((v, ci) => {
      const cx = padL + band * (ci + 0.5);
      const x = cx - (seriesList.length * bw) / 2 + si * bw;
      const y = padT + plotH * (1 - v / maxV);
      const h = padT + plotH - y;
      s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="2" fill="${c}"/>`;
    });
  });
  categories.forEach((c, ci) => {
    s += `<text x="${padL + band * (ci + 0.5)}" y="${padT + plotH + 18}" text-anchor="middle" font-size="11" font-family="sans-serif" fill="#5b6068">${esc(String(c).slice(0, 12))}</text>`;
  });
  if (seriesList.length > 1) s += legend(seriesList, width, padT, colors);
  return s;
}

function renderLine(option, width, height, colors) {
  const padL = 56, padR = 16, padT = option.title ? 44 : 22, padB = 46;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const { categories, seriesList } = option;
  const all = seriesList.flatMap((s) => s.data);
  const maxV = niceMax(Math.max(0, ...all));
  let s = axes(option.title, width, height, padL, padR, padT, padB, plotW, plotH, maxV);
  const n = categories.length;
  const xAt = (i) => padL + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
  seriesList.forEach((se, si) => {
    const c = colors[si % colors.length];
    const pts = se.data.map((v, i) => `${xAt(i).toFixed(1)},${(padT + plotH * (1 - v / maxV)).toFixed(1)}`).join(' ');
    s += `<polyline points="${pts}" fill="none" stroke="${c}" stroke-width="2.4"/>`;
    se.data.forEach((v, i) => {
      s += `<circle cx="${xAt(i).toFixed(1)}" cy="${(padT + plotH * (1 - v / maxV)).toFixed(1)}" r="3" fill="${c}"/>`;
    });
  });
  categories.forEach((c, ci) => {
    s += `<text x="${xAt(ci)}" y="${padT + plotH + 18}" text-anchor="middle" font-size="11" font-family="sans-serif" fill="#5b6068">${esc(String(c).slice(0, 12))}</text>`;
  });
  if (seriesList.length > 1) s += legend(seriesList, width, padT, colors);
  return s;
}

function renderPie(option, width, height, colors) {
  const { seriesList } = option;
  const se = seriesList[0] || { name: '', data: [] };
  const total = se.data.reduce((a, b) => a + b, 0) || 1;
  const cx = width * 0.36, cy = height * 0.52, r = Math.min(width * 0.26, height * 0.34);
  let s = option.title ? `<text x="${width / 2}" y="22" text-anchor="middle" font-size="16" font-family="sans-serif" font-weight="600" fill="#1f2329">${esc(option.title)}</text>` : '';
  let ang = -Math.PI / 2;
  se.data.forEach((v, i) => {
    const a2 = ang + (2 * Math.PI * v) / total;
    const large = a2 - ang > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    const c = colors[i % colors.length];
    s += `<path d="M${cx} ${cy} L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${c}" stroke="#fff" stroke-width="1"/>`;
    const mid = (ang + a2) / 2;
    const lx = cx + (r + 16) * Math.cos(mid), ly = cy + (r + 16) * Math.sin(mid);
    const pct = ((v / total) * 100).toFixed(1);
    s += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="11" font-family="sans-serif" fill="#5b6068">${pct}%</text>`;
    ang = a2;
  });
  // legend
  const lx = width * 0.66;
  let ly = cy - se.data.length * 9;
  const cats = option.categories;
  se.data.forEach((v, i) => {
    s += `<rect x="${lx}" y="${ly - 9}" width="11" height="11" rx="2" fill="${colors[i % colors.length]}"/>`;
    s += `<text x="${lx + 16}" y="${ly}" dominant-baseline="middle" font-size="12" font-family="sans-serif" fill="#1f2329">${esc((cats[i] !== undefined ? String(cats[i]) : se.name + i).slice(0, 14))}</text>`;
    ly += 20;
  });
  return s;
}

function renderSVG(option, opts) {
  const width = (opts && opts.width) || 720;
  const height = (opts && opts.height) || 420;
  const colors = PALETTES[option.paletteName] || PALETTES.default;
  let body = '';
  if (option.type === 'pie') body = renderPie(option, width, height, colors);
  else if (option.type === 'line') body = renderLine(option, width, height, colors);
  else body = renderBar(option, width, height, colors);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif">${body}</svg>`;
}

module.exports = { renderSVG };

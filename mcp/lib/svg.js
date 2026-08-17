'use strict';
// 零依赖 SVG 渲染器：把 { type, title, categories, seriesList, paletteName }
// 画成内联 SVG 字符串（bar / line / pie），用于 MCP image content block。
// 与 dsh/lib/svg.js 同源，配色对齐 mcp/lib/html.js 的 PALETTES。
const { PALETTES } = require('./html');

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

function renderBar(spec, width, height, colors) {
  const padL = 56, padR = 16, padT = spec.title ? 44 : 22, padB = 46;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const { categories, seriesList } = spec;
  const all = seriesList.flatMap((s) => s.data);
  const maxV = niceMax(Math.max(0, ...all));
  let s = axes(spec.title, width, height, padL, padR, padT, padB, plotW, plotH, maxV);
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

function renderLine(spec, width, height, colors) {
  const padL = 56, padR = 16, padT = spec.title ? 44 : 22, padB = 46;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const { categories, seriesList } = spec;
  const all = seriesList.flatMap((s) => s.data);
  const maxV = niceMax(Math.max(0, ...all));
  let s = axes(spec.title, width, height, padL, padR, padT, padB, plotW, plotH, maxV);
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

function renderPie(spec, width, height, colors) {
  const { categories, seriesList } = spec;
  const se = seriesList[0] || { name: '', data: [] };
  const total = se.data.reduce((a, b) => a + b, 0) || 1;
  const cx = width * 0.36, cy = height * 0.52, r = Math.min(width * 0.26, height * 0.34);
  let s = spec.title ? `<text x="${width / 2}" y="22" text-anchor="middle" font-size="16" font-family="sans-serif" font-weight="600" fill="#1f2329">${esc(spec.title)}</text>` : '';
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
  const lx = width * 0.66;
  let ly = cy - se.data.length * 9;
  se.data.forEach((v, i) => {
    s += `<rect x="${lx}" y="${ly - 9}" width="11" height="11" rx="2" fill="${colors[i % colors.length]}"/>`;
    s += `<text x="${lx + 16}" y="${ly}" dominant-baseline="middle" font-size="12" font-family="sans-serif" fill="#1f2329">${esc((categories[i] !== undefined ? String(categories[i]) : se.name + i).slice(0, 14))}</text>`;
    ly += 20;
  });
  return s;
}

// spec: { type, title, categories, seriesList:[{name, data:[Number]}], paletteName }
function renderSVG(spec, opts) {
  const width = (opts && opts.width) || 720;
  const height = (opts && opts.height) || 420;
  const colors = PALETTES[spec.paletteName] || PALETTES.default;
  // 米白底色：避免透明背景在深色/灰白客户端（如 ZCode）不可见
  const bg = `<rect x="0" y="0" width="${width}" height="${height}" fill="#fafaf7"/>`;
  let body = '';
  if (spec.type === 'pie') body = renderPie(spec, width, height, colors);
  else if (spec.type === 'line') body = renderLine(spec, width, height, colors);
  else body = renderBar(spec, width, height, colors);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif">${bg}${body}</svg>`;
}

module.exports = { renderSVG };

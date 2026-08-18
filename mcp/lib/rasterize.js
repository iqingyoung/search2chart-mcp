'use strict';
// SVG → PNG 栅格化封装
// 依赖 @resvg/resvg-js（Rust 后端，零浏览器依赖）

let Resvg;
try {
  Resvg = require('@resvg/resvg-js').Resvg;
} catch (e) {
  Resvg = null;
}

function isAvailable() {
  return !!Resvg;
}

function rasterize(svg, options) {
  if (!Resvg) throw new Error('@resvg/resvg-js not installed');
  const r = new Resvg(svg, options);
  return r.render().asPng();
}

module.exports = { isAvailable, rasterize };

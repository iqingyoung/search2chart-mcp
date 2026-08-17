'use strict';
const fs = require('fs');
const path = require('path');

const ECHARTS_CDN = 'https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js';

const PALETTES = {
  default: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4'],
  warm: ['#ee6666', '#fac858', '#fc8452', '#ff9f7f', '#ffd666', '#e86f3a'],
  cool: ['#5470c6', '#73c0de', '#3ba272', '#9ad0ec', '#5b8ff9', '#2ca9b9'],
  business: ['#1f4e79', '#2e75b6', '#9dc3e6', '#c55a11', '#ed7d31', '#a5a5a5']
};

// 决定 echarts 加载方式：本地 vendor 内联（离线/沙箱友好）> CDN
function getLoader() {
  const vendor = path.join(__dirname, '..', 'vendor', 'echarts.min.js');
  if (fs.existsSync(vendor)) {
    return '<script>' + fs.readFileSync(vendor, 'utf8') + '</script>';
  }
  return '<script src="' + ECHARTS_CDN + '"></script>';
}

// 浏览器端 builder（与 lib/chart.js 逻辑一致，支持交互切换）
const BUILDER = `
const PAL=D.palettes;
let chart=null;
function buildOption(type,palette){
  const colors=PAL[palette]||PAL.default;
  const cats=D.categories, sl=D.seriesList;
  if(type==='pie'){
    const s=sl[0];
    return { backgroundColor:'transparent', title:{text:D.title,left:'center'},
      tooltip:{trigger:'item'}, legend:{bottom:0},
      series:[{ type:'pie', radius:['35%','65%'], data:cats.map((c,i)=>({name:c,value:s.data[i]})),
        itemStyle:{borderColor:'#fff',borderWidth:1}, color:colors }] };
  }
  const series=sl.map((s,i)=>({ name:s.name, type:type, data:s.data,
    itemStyle: colors?{color:colors[i%colors.length]}:undefined,
    areaStyle: type==='line'?{opacity:0.12}:undefined, smooth: type==='line' }));
  return { backgroundColor:'transparent', title:{text:D.title,left:'center'},
    tooltip:{trigger:'axis'}, legend:{bottom:0},
    grid:{left:48,right:24,top:48,bottom:48},
    xAxis:{type:'category',data:cats,axisLabel:{interval:0,rotate:cats.length>8?30:0}},
    yAxis:{type:'value'}, series:series };
}
function render(){
  const t=document.getElementById('type').value;
  const p=document.getElementById('palette').value;
  chart.setOption(buildOption(t,p),true);
  chart.resize({width:+document.getElementById('w').value,height:+document.getElementById('h').value});
}
window.addEventListener('DOMContentLoaded',function(){
  chart=echarts.init(document.getElementById('chart'));
  document.getElementById('type').value=D.defaultType;
  document.getElementById('palette').value=D.defaultPalette;
  document.getElementById('w').value=D.width; document.getElementById('h').value=D.height;
  ['type','palette','w','h'].forEach(function(id){ document.getElementById(id).addEventListener('change',render); });
  render();
  window.addEventListener('resize',function(){ chart.resize(); });
});`;

function renderHTML(opts) {
  const payload = {
    title: opts.title || '',
    categories: opts.categories,
    seriesList: opts.seriesList,
    palettes: PALETTES,
    defaultType: opts.defaultType,
    defaultPalette: opts.defaultPalette || 'default',
    width: opts.width || 720,
    height: opts.height || 420
  };
  // 防止 JSON 中的 </script> 提前闭合
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  return '<!DOCTYPE html>\n<html lang="zh">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<style>body{font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;margin:0;padding:12px;background:#fff;color:#222}' +
    '#controls{display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-bottom:10px;font-size:13px;color:#444}' +
    '#controls label{display:flex;gap:4px;align-items:center}#controls select,#controls input{font-size:13px;padding:3px 6px;border:1px solid #d9d9d9;border-radius:6px}' +
    '#chart{width:720px;height:420px;max-width:100%}</style>\n' +
    getLoader() + '\n</head>\n<body>\n' +
    '<div id="controls">' +
    '<label>类型 <select id="type"><option value="bar">柱状图</option><option value="line">折线图</option><option value="pie">饼图</option></select></label>' +
    '<label>配色 <select id="palette"><option value="default">默认</option><option value="warm">暖色</option><option value="cool">冷色</option><option value="business">商务</option></select></label>' +
    '<label>宽 <input id="w" type="number" min="320" max="1600" step="20"></label>' +
    '<label>高 <input id="h" type="number" min="240" max="1000" step="20"></label>' +
    '</div>\n<div id="chart"></div>\n' +
    '<script>const D=' + json + ';' + BUILDER + '</script>\n</body>\n</html>';
}

module.exports = { renderHTML, PALETTES, ECHARTS_CDN };

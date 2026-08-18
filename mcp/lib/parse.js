'use strict';
const fs = require('fs');
const path = require('path');

// 零依赖 CSV 解析（支持引号、转义、换行）
function parseCSV(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; } else { q = false; }
      } else { cur += c; }
    } else {
      if (c === '"') { q = true; }
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c === '\r') { /* skip */ }
      else { cur += c; }
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

// 读取本地文件 -> 二维数组（首行通常为表头）
function parseFile(filePath, sheet) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv' || ext === '.tsv' || ext === '.txt') {
    const text = fs.readFileSync(filePath, 'utf8');
    return ext === '.tsv' ? parseTSV(text) : parseCSV(text);
  }
  if (ext === '.xlsx' || ext === '.xls') {
    let xlsx;
    try { xlsx = require('xlsx'); }
    catch (e) {
      throw new Error('读取 Excel 需要安装依赖，请先执行：npm install xlsx');
    }
    const wb = xlsx.readFile(filePath);
    const name = sheet || wb.SheetNames[0];
    const ws = wb.Sheets[name];
    if (!ws) throw new Error('找不到工作表：' + name);
    return xlsx.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  }
  if (ext === '.et') {
    throw new Error('WPS .et 暂不直接支持，请先「另存为 .xlsx」再上传');
  }
  throw new Error('不支持的文件类型：' + ext);
}

function parseTSV(text) {
  return text.split(/\r?\n/).map(line => line.split('\t'));
}

module.exports = { parseCSV, parseFile };

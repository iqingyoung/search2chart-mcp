'use strict';
const fs = require('fs');
const path = require('path');

// 输入边界：超大文件直接拒绝，避免撑爆内存与解析时间
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB
const MAX_FILE_ROWS = 100000;            // 10 万行

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
  let stat;
  try { stat = fs.statSync(filePath); }
  catch (e) { throw new Error('文件不存在或不可读：' + filePath); }
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`文件过大（${(stat.size / 1024 / 1024).toFixed(1)}MB），上限 20MB，请精简后再试`);
  }
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv' || ext === '.tsv' || ext === '.txt') {
    // 去除 UTF-8 BOM，否则首列名带 \uFEFF 导致列匹配失败
    const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    const rows = ext === '.tsv' ? parseTSV(text) : parseCSV(text);
    if (rows.length > MAX_FILE_ROWS) {
      throw new Error(`数据行数 ${rows.length} 超过上限 ${MAX_FILE_ROWS}，请分段处理`);
    }
    return rows;
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
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    if (rows.length > MAX_FILE_ROWS) {
      throw new Error(`数据行数 ${rows.length} 超过上限 ${MAX_FILE_ROWS}，请分段处理`);
    }
    return rows;
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

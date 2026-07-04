// 批量添加 @copyright 头到所有 .ts/.tsx 源文件
// 运行: node add_copyright.js

const fs = require('fs');
const path = require('path');

const HEADER = `/**
 * @copyright 2025 hanson601 (LAS-yonglu526). All rights reserved.
 * 好事100 (GoodThings100) — 数字清单 App
 */

`;

function addHeader(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('@copyright 2025 hanson601')) {
    console.log(`SKIP (已有版权头): ${filePath}`);
    return;
  }
  fs.writeFileSync(filePath, HEADER + content, 'utf8');
  console.log(`OK: ${filePath}`);
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(full);
    } else if (/\.(ts|tsx)$/.test(e.name)) {
      addHeader(full);
    }
  }
}

addHeader('App.tsx');
addHeader('index.ts');
walk('src');
console.log('全部完成 ✅');
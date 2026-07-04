// 批量替换版权头: hanson601 → L.A.S 庸禄
const fs = require('fs');
const path = require('path');

const OLD = '@copyright 2025 hanson601 (LAS-yonglu526)';
const NEW = '@copyright 2025 L.A.S 庸禄 (LAS-yonglu526)';

let count = 0;

function fix(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes(OLD)) {
    console.log(`SKIP: ${filePath}`);
    return;
  }
  content = content.replace(new RegExp(OLD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), NEW);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`OK: ${filePath}`);
  count++;
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(e.name)) fix(full);
  }
}

fix('App.tsx');
fix('index.ts');
walk('src');
console.log(`全部完成 ✅ 共 ${count} 个文件`);
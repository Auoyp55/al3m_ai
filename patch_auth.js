const fs = require('fs');

const file = 'server.js';
let code = fs.readFileSync(file, 'utf8');

if (code.includes('AETHER_AUTH_V1')) {
  console.log('نظام المصادقة موجود مسبقاً.');
  process.exit(0);
}

const anchor = "const db = require('./server/database');";

if (!code.includes(anchor)) {
  console.error('لم أجد مكان قاعدة البيانات.');
  process.exit(1);
}

code = code.replace(
  anchor,
  anchor + "\nconst auth = require('./server/auth');"
);

fs.writeFileSync(file, code);
console.log('تم ربط وحدة المصادقة بالخادم.');

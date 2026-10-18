require('dotenv').config();
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL غير موجود في ملف .env');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000
});

pool.on('error', (err) => {
  console.error('خطأ اتصال PostgreSQL:', err.message);
});

async function query(text, params = []) {
  return pool.query(text, params);
}

async function testConnection() {
  const result = await query(
    'SELECT NOW() AS server_time, current_database() AS database'
  );
  return result.rows[0];
}

module.exports = { pool, query, testConnection };

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load root .env first (if present)
dotenv.config();

// Fallback: also load backend/.env if it exists and variables are still missing
const backendEnvPath = path.resolve(__dirname, '.env');
if (fs.existsSync(backendEnvPath)) {
  dotenv.config({
    path: backendEnvPath,
    override: false, // keep already defined vars
  });
}

const dbUser = process.env.DB_USER || 'postgres';
const dbHost = process.env.DB_HOST || 'localhost';
const dbName = process.env.DB_NAME || 'transport_app';
const dbPassword = (process.env.DB_PASSWORD ?? '').toString();
const dbPort = parseInt(process.env.DB_PORT || '5432', 10);

if (!dbPassword) {
  console.warn('[DB] Warning: DB_PASSWORD is empty. Set it in backend/.env');
}

const pool = new Pool({
  user: dbUser,
  host: dbHost,
  database: dbName,
  password: dbPassword,
  port: dbPort,
  // تنظیمات connection pool برای جلوگیری از timeout و connection leak
  max: 20, // حداکثر تعداد connection‌های همزمان
  idleTimeoutMillis: 30000, // 30 ثانیه - اگر connection بیش از این مدت idle باشد، بسته می‌شود
  connectionTimeoutMillis: 10000, // 10 ثانیه - timeout برای گرفتن connection از pool
  // تنظیمات statement timeout (برای هر query)
  statement_timeout: 30000, // 30 ثانیه timeout برای هر query
});

// Event listeners برای monitoring connection pool
pool.on('error', (err, client) => {
  console.error('❌ [DB Pool] Unexpected error on idle client', err);
  // اگر client وجود دارد، آن را release کن
  if (client) {
    client.release();
  }
});

// Log pool stats periodically (every 5 minutes) - فقط در حالت development
if (process.env.NODE_ENV !== 'production') {
  setInterval(() => {
    console.log('📊 [DB Pool] Stats:', {
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount
    });
  }, 5 * 60 * 1000);
}

module.exports = pool;

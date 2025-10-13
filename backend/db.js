const { Pool } = require('pg');
require('dotenv').config();

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
});

module.exports = pool;

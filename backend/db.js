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
});

module.exports = pool;

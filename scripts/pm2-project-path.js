#!/usr/bin/env node
/**
 * مسیر ریشه پروژه را از PM2 (transport-backend) برمی‌گرداند.
 * خروجی: یک خط مسیر — یا exit 1
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const APP_NAME = process.env.PM2_APP_NAME || 'transport-backend';

function isProjectRoot(dir) {
  if (!dir) return false;
  return (
    fs.existsSync(path.join(dir, 'backend', 'server.js')) &&
    fs.existsSync(path.join(dir, 'frontend'))
  );
}

function rootFromBackendDir(dir) {
  if (!dir) return null;
  if (isProjectRoot(dir)) return dir;
  const parent = path.dirname(dir);
  if (isProjectRoot(parent)) return parent;
  return null;
}

function parsePm2List() {
  const raw = execSync('pm2 jlist', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  const list = JSON.parse(raw);
  const app = list.find((a) => a.name === APP_NAME);
  if (!app) return null;

  const env = app.pm2_env || {};
  const cwd = env.pm_cwd || env.cwd || null;
  const script = env.pm_exec_path || env.script || null;

  const fromCwd = rootFromBackendDir(cwd);
  if (fromCwd) return fromCwd;

  if (script) {
    const scriptDir = path.dirname(script);
    const fromScript = rootFromBackendDir(scriptDir);
    if (fromScript) return fromScript;
  }

  return null;
}

try {
  const root = parsePm2List();
  if (root) {
    process.stdout.write(root);
    process.exit(0);
  }
  process.exit(1);
} catch {
  process.exit(1);
}

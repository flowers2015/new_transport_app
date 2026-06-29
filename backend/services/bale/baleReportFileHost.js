const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'bale-reports');
const FILE_TTL_MS = 60 * 60 * 1000;

function ensureDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function publishBuffer(buffer, ext) {
  ensureDir();
  const id = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  const filename = `report-${id}.${ext.replace(/^\./, '')}`;
  const fullPath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(fullPath, buffer);
  setTimeout(() => {
    fs.unlink(fullPath, () => {});
  }, FILE_TTL_MS);
  return filename;
}

function buildPublicUrl(publicBaseUrl, filename) {
  const base = String(publicBaseUrl || '').trim().replace(/\/+$/, '');
  if (!base) return null;
  return `${base}/uploads/bale-reports/${filename}`;
}

module.exports = {
  publishBuffer,
  buildPublicUrl,
  UPLOAD_DIR,
};

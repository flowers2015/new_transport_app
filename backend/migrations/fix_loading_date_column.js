/**
 * یک‌بار دستی روی سرور (اختیاری — معمولاً با restart خودکار اجرا می‌شود):
 *   cd ~/project/backend && node migrations/fix_loading_date_column.js
 */
const { ensureJalaliDateColumns } = require('../services/ensureJalaliDateColumns');

async function fixLoadingDateColumn() {
  await ensureJalaliDateColumns();
}

if (require.main === module) {
  fixLoadingDateColumn()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = fixLoadingDateColumn;

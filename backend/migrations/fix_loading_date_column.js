const { ensureJalaliDateColumns } = require('../services/ensureJalaliDateColumns');

/**
 * loading_date باید VARCHAR باشد تا تاریخ شمسی (مثلاً 1405/04/31) ذخیره شود.
 */
async function fixLoadingDateColumn() {
  await ensureJalaliDateColumns();
}

if (require.main === module) {
  fixLoadingDateColumn()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = fixLoadingDateColumn;

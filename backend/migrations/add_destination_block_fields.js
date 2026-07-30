/**
 * بلوک مقصد: تاریخ بارگیری و ساعت حضور روی خود مقصد
 * (برای حفظ مقدار هر مقصد بعد از چیدمان / جداسازی)
 *
 * دستی:
 *   cd backend && node migrations/add_destination_block_fields.js
 */
const pool = require('../db');

async function addDestinationBlockFields() {
  await pool.query(`
    ALTER TABLE freight_destinations
    ADD COLUMN IF NOT EXISTS loading_date VARCHAR(20)
  `);
  console.log('✅ freight_destinations.loading_date ready');

  await pool.query(`
    ALTER TABLE freight_destinations
    ADD COLUMN IF NOT EXISTS platform_arrival_time VARCHAR(20)
  `);
  console.log('✅ freight_destinations.platform_arrival_time ready');
}

if (require.main === module) {
  addDestinationBlockFields()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ add_destination_block_fields failed:', err);
      process.exit(1);
    });
}

module.exports = addDestinationBlockFields;

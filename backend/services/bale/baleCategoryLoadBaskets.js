const pool = require('../../db');
const runMigration = require('../../migrations/create_bale_category_load_baskets');

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await runMigration();
  tableReady = true;
}

function parseIdList(raw) {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapRow(row) {
  if (!row) return null;
  return {
    vehicleCategory: row.vehicle_category,
    selectedIds: parseIdList(row.selected_ids),
    allowExtra: Boolean(row.allow_extra),
    confirmed: Boolean(row.confirmed),
    queueCount: Number(row.queue_count) || 0,
    loadCount: Number(row.load_count) || 0,
    stage: row.stage || null,
    updatedBy: row.updated_by || null,
    updatedAt: row.updated_at || null,
  };
}

async function listCategoryLoadBaskets() {
  await ensureTable();
  const { rows } = await pool.query(
    `SELECT * FROM bale_category_load_baskets ORDER BY vehicle_category`
  );
  return rows.map(mapRow);
}

async function getCategoryLoadBasket(vehicleCategory) {
  await ensureTable();
  const category = String(vehicleCategory || '').trim();
  if (!category) return null;
  const { rows } = await pool.query(
    `SELECT * FROM bale_category_load_baskets WHERE vehicle_category = $1`,
    [category]
  );
  return mapRow(rows[0]);
}

async function upsertCategoryLoadBasket({
  vehicleCategory,
  selectedIds,
  allowExtra = false,
  confirmed = true,
  queueCount = 0,
  loadCount = 0,
  stage = null,
  updatedBy = null,
}) {
  await ensureTable();
  const category = String(vehicleCategory || '').trim();
  if (!category) throw new Error('دسته خودرو الزامی است.');
  const ids = Array.isArray(selectedIds) ? selectedIds.map(String).filter(Boolean) : [];
  const { rows } = await pool.query(
    `INSERT INTO bale_category_load_baskets (
       vehicle_category, selected_ids, allow_extra, confirmed, queue_count, load_count, stage, updated_by, updated_at
     ) VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (vehicle_category) DO UPDATE SET
       selected_ids = EXCLUDED.selected_ids,
       allow_extra = EXCLUDED.allow_extra,
       confirmed = EXCLUDED.confirmed,
       queue_count = EXCLUDED.queue_count,
       load_count = EXCLUDED.load_count,
       stage = EXCLUDED.stage,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING *`,
    [
      category,
      JSON.stringify(ids),
      Boolean(allowExtra),
      Boolean(confirmed),
      Number(queueCount) || 0,
      Number(loadCount) || ids.length,
      stage || null,
      updatedBy || null,
    ]
  );
  return mapRow(rows[0]);
}

module.exports = {
  listCategoryLoadBaskets,
  getCategoryLoadBasket,
  upsertCategoryLoadBasket,
};

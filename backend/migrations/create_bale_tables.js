const pool = require('../db');

async function createBaleTables() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS bale_settings (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bale_channels (
        id SERIAL PRIMARY KEY,
        slot_number INTEGER NOT NULL UNIQUE CHECK (slot_number BETWEEN 1 AND 4),
        chat_id BIGINT,
        vehicle_category VARCHAR(100),
        label VARCHAR(255),
        is_active BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      INSERT INTO bale_channels (slot_number, label, vehicle_category, is_active)
      VALUES
        (1, 'گروه تست', NULL, TRUE),
        (2, 'کانال تریلی', 'تریلی', FALSE),
        (3, 'کانال مینی تریلی', 'مینی تریلی', FALSE),
        (4, 'کانال ده چرخ', 'ده چرخ', FALSE)
      ON CONFLICT (slot_number) DO NOTHING
    `);

    await client.query(`
      UPDATE bale_channels SET
        label = COALESCE(NULLIF(label, ''), CASE slot_number
          WHEN 2 THEN 'کانال تریلی'
          WHEN 3 THEN 'کانال مینی تریلی'
          WHEN 4 THEN 'کانال ده چرخ'
          ELSE label
        END),
        vehicle_category = CASE slot_number
          WHEN 2 THEN COALESCE(vehicle_category, 'تریلی')
          WHEN 3 THEN COALESCE(vehicle_category, 'مینی تریلی')
          WHEN 4 THEN COALESCE(vehicle_category, 'ده چرخ')
          ELSE vehicle_category
        END
      WHERE slot_number BETWEEN 2 AND 4
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bale_driver_outreach (
        driver_id VARCHAR(255) PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
        employee_id VARCHAR(100) NOT NULL,
        outreach_chat_id BIGINT NOT NULL,
        bale_user_id BIGINT,
        is_test_simulation BOOLEAN DEFAULT FALSE,
        notes TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_bale_driver_outreach_employee
      ON bale_driver_outreach(employee_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_bale_driver_outreach_chat
      ON bale_driver_outreach(outreach_chat_id)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bale_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        status VARCHAR(50) NOT NULL DEFAULT 'idle',
        mode VARCHAR(30) NOT NULL DEFAULT 'hybrid',
        stage VARCHAR(20) NOT NULL DEFAULT 'stage1',
        vehicle_category VARCHAR(100),
        group_channel_slot INTEGER DEFAULT 1,
        current_turn_index INTEGER NOT NULL DEFAULT 0,
        queue_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
        eligible_announcements JSONB NOT NULL DEFAULT '[]'::jsonb,
        turn_timeout_sec INTEGER NOT NULL DEFAULT 180,
        pending_selection JSONB,
        current_turn_message_id BIGINT,
        current_turn_chat_id BIGINT,
        turn_deadline_at TIMESTAMPTZ,
        rejected_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
        started_by_user_id VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_bale_sessions_status
      ON bale_sessions(status, updated_at DESC)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bale_session_logs (
        id SERIAL PRIMARY KEY,
        session_id UUID REFERENCES bale_sessions(id) ON DELETE CASCADE,
        event_type VARCHAR(80) NOT NULL,
        payload JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bale_auto_assign_stats (
        driver_id VARCHAR(255) PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
        auto_assign_count INTEGER NOT NULL DEFAULT 0,
        last_auto_assigned_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      INSERT INTO bale_settings (key, value)
      VALUES ('defaults', '{"turnTimeoutSec":180,"pilotEnabled":true}'::jsonb)
      ON CONFLICT (key) DO NOTHING
    `);

    await client.query('COMMIT');
    console.log('✅ Bale tables ensured');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Failed to create Bale tables:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  createBaleTables()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = createBaleTables;

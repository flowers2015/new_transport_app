const pool = require('../db');

async function columnExists(client, table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column]
  );
  return rows.length > 0;
}

async function createSupportTicketsTable() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id VARCHAR(255) PRIMARY KEY,
        subject VARCHAR(500) NOT NULL,
        description TEXT NOT NULL,
        priority VARCHAR(50) NOT NULL DEFAULT 'عادی',
        status VARCHAR(50) NOT NULL DEFAULT 'باز',
        created_by_user_id VARCHAR(255) NOT NULL,
        created_by_user_name VARCHAR(255),
        created_by_role VARCHAR(255),
        employee_id VARCHAR(100),
        contact_phone VARCHAR(50),
        contact_extension VARCHAR(50) NOT NULL DEFAULT '',
        admin_response TEXT,
        assigned_to_user_id VARCHAR(255),
        assigned_to_user_name VARCHAR(255),
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // ارتقای جدول قدیمی (title / created_by / ticket_number متنی)
    if (!(await columnExists(client, 'support_tickets', 'subject'))) {
      await client.query(`ALTER TABLE support_tickets ADD COLUMN subject VARCHAR(500)`);
    }
    if (await columnExists(client, 'support_tickets', 'title')) {
      await client.query(`
        UPDATE support_tickets SET subject = title WHERE subject IS NULL AND title IS NOT NULL
      `);
      try {
        await client.query(`ALTER TABLE support_tickets ALTER COLUMN title DROP NOT NULL`);
      } catch {
        /* ignore */
      }
    }

    if (!(await columnExists(client, 'support_tickets', 'created_by_user_id'))) {
      await client.query(`ALTER TABLE support_tickets ADD COLUMN created_by_user_id VARCHAR(255)`);
    }
    if (await columnExists(client, 'support_tickets', 'created_by')) {
      await client.query(`
        UPDATE support_tickets SET created_by_user_id = created_by
        WHERE created_by_user_id IS NULL AND created_by IS NOT NULL
      `);
    }

    const alters = [
      `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS priority VARCHAR(50) DEFAULT 'عادی'`,
      `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS created_by_role VARCHAR(255)`,
      `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS created_by_user_name VARCHAR(255)`,
      `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS employee_id VARCHAR(100)`,
      `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50)`,
      `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS contact_extension VARCHAR(50) DEFAULT ''`,
      `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS admin_response TEXT`,
      `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_to_user_id VARCHAR(255)`,
      `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_to_user_name VARCHAR(255)`,
      `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`,
      `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
    ];

    for (const sql of alters) {
      try {
        await client.query(sql);
      } catch (e) {
        console.warn('⚠️ [support_tickets] alter:', e.message);
      }
    }

    // ticket_number عددی
    if (!(await columnExists(client, 'support_tickets', 'ticket_number'))) {
      await client.query(`ALTER TABLE support_tickets ADD COLUMN ticket_number INTEGER`);
    }
    await client.query(`CREATE SEQUENCE IF NOT EXISTS support_tickets_ticket_number_seq`);
    await client.query(`
      UPDATE support_tickets SET ticket_number = nextval('support_tickets_ticket_number_seq')
      WHERE ticket_number IS NULL
    `);
    await client.query(`
      ALTER TABLE support_tickets
      ALTER COLUMN ticket_number SET DEFAULT nextval('support_tickets_ticket_number_seq')
    `);

    // وضعیت‌های انگلیسی قدیمی → فارسی
    await client.query(`
      UPDATE support_tickets SET status = 'باز' WHERE status IN ('Open', 'open', 'OPEN')
    `);
    await client.query(`
      UPDATE support_tickets SET status = 'در حال بررسی'
      WHERE status IN ('In Progress', 'InProgress', 'in_progress', 'در حال بررسی')
    `);
    await client.query(`
      UPDATE support_tickets SET status = 'بسته شده'
      WHERE status IN ('Closed', 'closed', 'CLOSED')
    `);
    await client.query(`
      UPDATE support_tickets SET priority = 'عادی'
      WHERE priority IN ('Medium', 'Normal', 'normal', 'medium') OR priority IS NULL
    `);
    await client.query(`
      UPDATE support_tickets SET priority = 'بالا'
      WHERE priority IN ('High', 'high', 'Urgent', 'urgent')
    `);
    await client.query(`
      UPDATE support_tickets SET priority = 'کم'
      WHERE priority IN ('Low', 'low')
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_support_tickets_ticket_number
      ON support_tickets (ticket_number) WHERE ticket_number IS NOT NULL
    `);

    await client.query('COMMIT');
    console.log('✅ [migration] support_tickets آماده است');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ [migration] support_tickets:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  createSupportTicketsTable()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = createSupportTicketsTable;

const crypto = require('crypto');
const pool = require('../db');

const VALID_PRIORITIES = ['کم', 'عادی', 'بالا', 'فوری'];
const VALID_STATUSES = ['باز', 'در حال بررسی', 'پاسخ داده شده', 'بسته شده'];

function mapTicket(row) {
  if (!row) return null;
  const statusMap = {
    Open: 'باز',
    Closed: 'بسته شده',
    'In Progress': 'در حال بررسی',
  };
  const priorityMap = {
    Low: 'کم',
    Medium: 'عادی',
    Normal: 'عادی',
    High: 'بالا',
    Urgent: 'فوری',
  };
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    subject: row.subject || row.title,
    description: row.description,
    priority: priorityMap[row.priority] || row.priority || 'عادی',
    status: statusMap[row.status] || row.status || 'باز',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByUserId: row.created_by_user_id || row.created_by,
    createdByUserName: row.created_by_user_name,
    createdByRole: row.created_by_role,
    employeeId: row.employee_id,
    contactPhone: row.contact_phone,
    contactExtension: row.contact_extension || '',
    adminResponse: row.admin_response,
    assignedToUserId: row.assigned_to_user_id || row.assigned_to,
    assignedToUserName: row.assigned_to_user_name,
    resolvedAt: row.resolved_at,
  };
}

async function loadUserMeta(userId) {
  const { rows } = await pool.query(
    `SELECT id, username, name, role FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const user = rows[0] || null;
  if (!user) return null;
  try {
    const emp = await pool.query(
      `SELECT employee_id FROM users WHERE id = $1 LIMIT 1`,
      [userId]
    );
    if (emp.rows[0]?.employee_id) user.employee_id = emp.rows[0].employee_id;
  } catch {
    /* ستون employee_id ممکن است وجود نداشته باشد */
  }
  return user;
}

function isAdmin(req) {
  return req.user?.role === 'admin' || req.user?.role === 'ادمین';
}

let ownerColumnCache = null;

async function getOwnerColumn() {
  if (ownerColumnCache) return ownerColumnCache;
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'support_tickets'
       AND column_name IN ('created_by_user_id', 'created_by')`
  );
  const names = new Set(rows.map(r => r.column_name));
  if (names.has('created_by_user_id')) {
    ownerColumnCache = 'created_by_user_id';
  } else if (names.has('created_by')) {
    ownerColumnCache = 'created_by';
  } else {
    ownerColumnCache = 'created_by_user_id';
  }
  return ownerColumnCache;
}

async function listTickets(req, res) {
  try {
    const admin = isAdmin(req);
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'کاربر احراز هویت نشده' });
    }

    const { status, priority, mine } = req.query || {};

    const conditions = [];
    const params = [];
    let idx = 1;

    if (!admin || mine === 'true') {
      const ownerCol = await getOwnerColumn();
      conditions.push(`${ownerCol} = $${idx++}`);
      params.push(userId);
    }

    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }
    if (priority) {
      conditions.push(`priority = $${idx++}`);
      params.push(priority);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM support_tickets ${where} ORDER BY created_at DESC NULLS LAST LIMIT 500`,
      params
    );
    res.json(rows.map(mapTicket));
  } catch (error) {
    console.error('❌ [support-tickets] list:', error);
    res.status(500).json({
      message: 'خطا در دریافت تیکت‌ها',
      detail: error.message,
    });
  }
}

async function insertSupportTicket(payload) {
  const {
    id,
    subject,
    description,
    priority,
    userId,
    displayName,
    role,
    employeeId,
    contactPhone,
    contactExtension,
  } = payload;

  const ticketNumStr = `TKT-${Date.now()}`;
  const attempts = [
    {
      sql: `INSERT INTO support_tickets (
        id, subject, title, description, priority, status,
        created_by_user_id, created_by, created_by_user_name, created_by_role,
        employee_id, contact_phone, contact_extension, ticket_number
      ) VALUES ($1,$2,$2,$3,$4,'باز',$5,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      params: [
        id, subject, description, priority, userId, displayName, role,
        employeeId, contactPhone, contactExtension, ticketNumStr,
      ],
    },
    {
      sql: `INSERT INTO support_tickets (
        id, subject, description, priority, status,
        created_by_user_id, created_by_user_name, created_by_role,
        employee_id, contact_phone, contact_extension
      ) VALUES ($1,$2,$3,$4,'باز',$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      params: [
        id, subject, description, priority, userId, displayName, role,
        employeeId, contactPhone, contactExtension,
      ],
    },
    {
      sql: `INSERT INTO support_tickets (
        id, title, description, priority, status, created_by,
        created_by_user_name, created_by_role, employee_id, contact_phone,
        contact_extension, ticket_number
      ) VALUES ($1,$2,$3,$4,'Open',$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      params: [
        id, subject, description, priority, userId, displayName, role,
        employeeId, contactPhone, contactExtension, ticketNumStr,
      ],
    },
  ];

  let lastError;
  for (const attempt of attempts) {
    try {
      const { rows } = await pool.query(attempt.sql, attempt.params);
      if (rows[0]) return rows[0];
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error('ثبت تیکت ناموفق بود');
}

async function createTicket(req, res) {
  try {
    const userId = req.user?.userId || req.user?.id;
    const user = await loadUserMeta(userId);
    if (!user) return res.status(401).json({ message: 'کاربر یافت نشد' });

    const {
      subject,
      description,
      priority = 'عادی',
      contactPhone,
      contactExtension,
      employeeId,
    } = req.body || {};

    if (!subject?.trim()) return res.status(400).json({ message: 'عنوان تیکت الزامی است' });
    if (!description?.trim()) return res.status(400).json({ message: 'متن تیکت الزامی است' });
    if (!contactExtension?.trim()) {
      return res.status(400).json({ message: 'شماره داخلی الزامی است' });
    }
    if (!contactPhone?.trim() && !contactExtension?.trim()) {
      return res.status(400).json({ message: 'حداقل شماره داخلی یا موبایل لازم است' });
    }
    if (!VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ message: 'اولویت نامعتبر است' });
    }

    const id = crypto.randomUUID();
    const displayName = user.name || user.username;
    const row = await insertSupportTicket({
      id,
      subject: subject.trim(),
      description: description.trim(),
      priority,
      userId,
      displayName,
      role: user.role,
      employeeId: (employeeId || user.employee_id || '').trim() || null,
      contactPhone: contactPhone?.trim() || null,
      contactExtension: contactExtension.trim(),
    });

    res.status(201).json(mapTicket(row));
  } catch (error) {
    console.error('❌ [support-tickets] create:', error);
    res.status(500).json({
      message: 'خطا در ثبت تیکت',
      detail: error.message,
    });
  }
}

async function updateTicket(req, res) {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ message: 'فقط ادمین می‌تواند تیکت را ویرایش کند' });
    }

    const { id } = req.params;
    const { status, priority, adminResponse, assignedToUserId } = req.body || {};

    const { rows: existing } = await pool.query(
      `SELECT * FROM support_tickets WHERE id = $1`,
      [id]
    );
    if (!existing[0]) return res.status(404).json({ message: 'تیکت یافت نشد' });

    const updates = [];
    const params = [];
    let idx = 1;

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ message: 'وضعیت نامعتبر است' });
      }
      updates.push(`status = $${idx++}`);
      params.push(status);
      if (status === 'بسته شده' || status === 'پاسخ داده شده') {
        updates.push(`resolved_at = NOW()`);
      }
    }

    if (priority !== undefined) {
      if (!VALID_PRIORITIES.includes(priority)) {
        return res.status(400).json({ message: 'اولویت نامعتبر است' });
      }
      updates.push(`priority = $${idx++}`);
      params.push(priority);
    }

    if (adminResponse !== undefined) {
      updates.push(`admin_response = $${idx++}`);
      params.push(adminResponse?.trim() || null);
    }

    if (assignedToUserId !== undefined) {
      let assigneeName = null;
      if (assignedToUserId) {
        const assignee = await loadUserMeta(assignedToUserId);
        if (!assignee) return res.status(400).json({ message: 'کاربر مسئول یافت نشد' });
        assigneeName = assignee.name || assignee.username;
      }
      updates.push(`assigned_to_user_id = $${idx++}`);
      params.push(assignedToUserId || null);
      updates.push(`assigned_to_user_name = $${idx++}`);
      params.push(assigneeName);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'فیلدی برای به‌روزرسانی ارسال نشده' });
    }

    updates.push('updated_at = NOW()');
    params.push(id);

    const { rows } = await pool.query(
      `UPDATE support_tickets SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    res.json(mapTicket(rows[0]));
  } catch (error) {
    console.error('❌ [support-tickets] update:', error);
    res.status(500).json({ message: 'خطا در به‌روزرسانی تیکت' });
  }
}

async function getTicketStats(req, res) {
  try {
    if (!isAdmin(req)) return res.status(403).json({ message: 'Forbidden' });
    const { rows } = await pool.query(`
      SELECT status, COUNT(*)::int AS count
      FROM support_tickets
      GROUP BY status
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'خطا در آمار تیکت‌ها' });
  }
}

module.exports = {
  listTickets,
  createTicket,
  updateTicket,
  getTicketStats,
};

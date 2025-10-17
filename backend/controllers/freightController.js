const pool = require('../db'); // Assuming a db connection pool is exported from ../db.js
const crypto = require('crypto');

/**
 * Fetches all freight announcements with related information.
 */
async function getFreightAnnouncements(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT 
        fa.*,
        fa.rejection_reason,
        d.name as assigned_driver_name,
        d.employee_id as assigned_driver_employee_id,
        v.model as assigned_vehicle_model,
        v.brand as assigned_vehicle_brand,
        v.plate_part1, v.plate_letter, v.plate_part2, v.plate_city_code
      FROM freight_announcements fa
      LEFT JOIN drivers d ON fa.assigned_driver_id = d.id
      LEFT JOIN vehicles v ON fa.assigned_vehicle_id = v.id
      ORDER BY fa.created_at DESC
    `);
    
    // Fetch destinations for each announcement
    for (let announcement of rows) {
      const destRows = await pool.query(
        'SELECT * FROM freight_destinations WHERE freight_announcement_id = $1',
        [announcement.id]
      );
      announcement.destinations = destRows.rows;
    }
    
    res.json(rows);
  } catch (error) {
    console.error('Failed to get freight announcements:', error);
    res.status(500).json({ message: 'Internal server error while fetching freight announcements.' });
  }
}

/**
 * Fetches a single freight announcement by ID.
 */
async function getFreightAnnouncementById(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM freight_announcements WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Freight announcement not found.' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(`Failed to get freight announcement ${id}:`, error);
    res.status(500).json({ message: 'Internal server error while fetching the freight announcement.' });
  }
}

/**
 * Updates an existing freight announcement. Supports updating status and core fields.
 * If destinations are provided, replaces existing destinations.
 */
async function updateFreightAnnouncement(req, res) {
  const { id } = req.params;
  try {
    const {
      loadingDate,
      lineType,
      cargoValue,
      vehicleType,
      notes,
      status,
      destinations,
    } = req.body || {};

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const fields = [];
      const values = [];
      let idx = 1;
      if (loadingDate) { fields.push(`loading_date = $${idx++}`); values.push(new Date(loadingDate)); }
      if (lineType) { fields.push(`line_type = $${idx++}`); values.push(lineType); }
      if (cargoValue !== undefined) { fields.push(`cargo_value = $${idx++}`); values.push(cargoValue); }
      if (vehicleType) { fields.push(`vehicle_type = $${idx++}`); values.push(vehicleType); }
      // Only update notes if the column exists in the DB
      if (notes !== undefined) {
        const notesColumn = await client.query(
          `SELECT 1 FROM information_schema.columns WHERE table_name = 'freight_announcements' AND column_name = 'notes'`
        );
        if (notesColumn.rowCount > 0) {
          fields.push(`notes = $${idx++}`);
          values.push(notes);
        }
      }
      if (status) { fields.push(`status = $${idx++}`); values.push(status); }
      fields.push(`updated_at = NOW()`);

      if (fields.length > 0) {
        const updateQuery = `UPDATE freight_announcements SET ${fields.join(', ')} WHERE id = $${idx}`;
        values.push(id);
        await client.query(updateQuery, values);
      }

      if (Array.isArray(destinations)) {
        await client.query('DELETE FROM freight_destinations WHERE freight_announcement_id = $1', [id]);

        // Check if unload_time column exists to build correct insert
        const columnCheck = await client.query(
          `SELECT 1 FROM information_schema.columns WHERE table_name = 'freight_destinations' AND column_name = 'unload_time'`
        );
        const hasUnloadTime = columnCheck.rowCount > 0;

        const insertDestQuery = hasUnloadTime
          ? `INSERT INTO freight_destinations (id, freight_announcement_id, city, representative_name, tonnage, freight_cost, unload_time, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`
          : `INSERT INTO freight_destinations (id, freight_announcement_id, city, representative_name, tonnage, freight_cost, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`;

        for (const d of destinations) {
          const params = [
            crypto.randomUUID(),
            id,
            d.city || null,
            d.representativeName || null,
            d.tonnage || null,
            d.freightCost || null,
          ];
          if (hasUnloadTime) params.push(d.unloadTime || null);
          await client.query(insertDestQuery, params);
        }
      }

      await client.query('COMMIT');

      // Return updated record
      const { rows } = await pool.query('SELECT * FROM freight_announcements WHERE id = $1', [id]);
      const updated = rows[0];
      const destRows = await pool.query('SELECT * FROM freight_destinations WHERE freight_announcement_id = $1 ORDER BY created_at ASC', [id]);
      updated.destinations = destRows.rows;
      return res.json(updated);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Failed to update freight announcement:', error);
    return res.status(500).json({ message: 'Internal server error while updating freight announcement.' });
  }
}

/**
 * Creates a new freight announcement with optional destinations.
 * Expects camelCase fields from frontend; maps to DB snake_case.
 */
async function createFreightAnnouncement(req, res) {
  try {
    const {
      loadingDate,
      lineType,
      cargoValue,
      vehicleType,
      notes,
      originCity,
      brand,
      representativeType,
      representativeName,
      cartonCount,
      priority,
      products,
      platformArrivalTime,
      destinations = [],
      isDraft,
    } = req.body || {};

    if (!loadingDate || !lineType || !vehicleType) {
      return res.status(400).json({ message: 'loadingDate, lineType and vehicleType are required.' });
    }

    const id = crypto.randomUUID();
    const announcementCode = `ANN-${Date.now()}`;
    const status = isDraft ? 'Draft' : 'PendingManagerApproval';

    // Calculate total freight cost if provided in destinations
    const totalFreightCost = Array.isArray(destinations)
      ? destinations.reduce((sum, d) => sum + (Number(d.freightCost) || 0), 0)
      : 0;

    const insertAnnouncementQuery = `
      INSERT INTO freight_announcements (
        id, announcement_code, loading_date, line_type, status, cargo_value,
        vehicle_type, assignment_type, assigned_driver_id, assigned_vehicle_id,
        total_freight_cost, platform_arrival_time, carton_count, created_at, updated_at,
        origin_city, brand, representative_type, representative_name, priority, products, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, NULL, NULL,
        $9, $10, $11, NOW(), NOW(),
        $12, $13, $14, $15, $16, $17, $18
      )
    `;

    await pool.query(insertAnnouncementQuery, [
      id,
      announcementCode,
      new Date(loadingDate),
      lineType,
      status,
      cargoValue || 0,
      vehicleType,
      representativeType || null, // using assignment_type to store representativeType when applicable
      totalFreightCost || null,
      platformArrivalTime || null,
      cartonCount || null,
      originCity || null,
      brand || null,
      representativeType || null,
      representativeName || null,
      priority || null,
      Array.isArray(products) ? JSON.stringify(products) : '[]',
      notes || null,
    ]);

    // Insert destinations if provided
    if (Array.isArray(destinations) && destinations.length > 0) {
      // Detect unload_time column existence for flexible insert
      const columnCheck = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = 'freight_destinations' AND column_name = 'unload_time'`
      );
      const hasUnloadTime = columnCheck.rowCount > 0;
      const insertDestQuery = hasUnloadTime
        ? `INSERT INTO freight_destinations (
             id, freight_announcement_id, city, representative_name, tonnage, freight_cost, unload_time, created_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, NOW()
           )`
        : `INSERT INTO freight_destinations (
             id, freight_announcement_id, city, representative_name, tonnage, freight_cost, created_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, NOW()
           )`;

      for (const d of destinations) {
        const destId = crypto.randomUUID();
        const params = [
          destId,
          id,
          d.city || null,
          d.representativeName || null,
          d.tonnage || null,
          d.freightCost || null,
        ];
        if (hasUnloadTime) params.push(d.unloadTime || null);
        await pool.query(insertDestQuery, params);
      }
    }

    // Fetch the created record with destinations for response
    const { rows } = await pool.query(
      `SELECT 
         fa.*,
         d.name as assigned_driver_name,
         d.employee_id as assigned_driver_employee_id,
         v.model as assigned_vehicle_model,
         v.brand as assigned_vehicle_brand,
         v.plate_part1, v.plate_letter, v.plate_part2, v.plate_city_code
       FROM freight_announcements fa
       LEFT JOIN drivers d ON fa.assigned_driver_id = d.id
       LEFT JOIN vehicles v ON fa.assigned_vehicle_id = v.id
       WHERE fa.id = $1`,
      [id]
    );

    const created = rows[0];
    const destRows = await pool.query(
      'SELECT * FROM freight_destinations WHERE freight_announcement_id = $1 ORDER BY created_at ASC',
      [id]
    );
    created.destinations = destRows.rows;

    // Attach optional UI fields if supplied to avoid null reference on client
    created.origin_city = originCity || null;
    created.brand = brand || null;
    created.representative_type = representativeType || null;
    created.representative_name = representativeName || null;
    created.priority = priority || null;
    created.products = Array.isArray(products) ? products : [];
    created.platform_arrival_time = platformArrivalTime || null;
    created.notes = notes || null;

    return res.status(201).json(created);
  } catch (error) {
    console.error('Failed to create freight announcement:', error);
    return res.status(500).json({ message: 'Internal server error while creating freight announcement.' });
  }
}

/**
 * A helper function to atomically update an announcement's status and record the change in history.
 * @param {string} announcementId - The ID of the announcement to update.
 * @param {string} newStatus - The new status to set.
 * @param {string} userId - The ID of the user performing the action.
 * @param {string} changeDescription - A text description of the change for the history log.
 * @param {object} res - The Express response object.
 * @param {function} [updateFn] - An optional function to run additional updates within the transaction.
 */
async function updateStatusWithHistory(announcementId, newStatus, userId, changeDescription, res, updateFn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Optional additional updates (e.g., assigning vehicle/driver)
    if (updateFn) {
      await updateFn(client);
    }
    
    // Update the announcement status
    const updateQuery = 'UPDATE freight_announcements SET status = $1, updated_at = NOW() WHERE id = $2';
    const updateResult = await client.query(updateQuery, [newStatus, announcementId]);

    if (updateResult.rowCount === 0) {
      throw new Error('Announcement not found.');
    }

    // Record the change in the history table (comprehensive schema)
    const historyQuery = 'INSERT INTO freight_announcement_history (freight_announcement_id, user_id, action, details) VALUES ($1, $2, $3, $4)';
    await client.query(historyQuery, [announcementId, userId, 'STATUS_CHANGE', changeDescription]);

    await client.query('COMMIT');
    res.status(200).json({ message: `Announcement status updated to ${newStatus}.` });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to update announcement status:', error);
    res.status(500).json({ message: error.message || 'Internal server error.' });
  } finally {
    client.release();
  }
}

// POST /:id/approve
async function approveAnnouncement(req, res) {
  const { id: announcementId } = req.params;
  const { userId } = req.user;
  try {
    // Fetch line type to determine routing
    const { rows } = await pool.query('SELECT line_type FROM freight_announcements WHERE id = $1', [announcementId]);
    if (rows.length === 0) return res.status(404).json({ message: 'Announcement not found.' });
    const lineType = rows[0].line_type;
    let newStatus;
    let assignmentType;
    const iceCreamMatches = ['IceCream', 'بستنی'];
    const dairyMatches = ['Dairy', 'پاستوریزه'];
    const ambientMatches = ['Ambient', 'لبنیات-فروتلند'];
    if (iceCreamMatches.includes(lineType)) {
      newStatus = 'PendingCompanyAssignment';
      assignmentType = 'company';
    } else if (dairyMatches.includes(lineType) || ambientMatches.includes(lineType)) {
      newStatus = 'PendingPersonalAssignment';
      assignmentType = 'personal';
    } else {
      newStatus = 'PendingCompanyAssignment';
      assignmentType = 'company';
    }

    const changeDescription = `Status changed to ${newStatus} with assignment_type=${assignmentType}`;

    await updateStatusWithHistory(
      announcementId,
      newStatus,
      userId,
      changeDescription,
      res,
      async (client) => {
        await client.query('UPDATE freight_announcements SET assignment_type = $1 WHERE id = $2', [assignmentType, announcementId]);
      }
    );
  } catch (e) {
    console.error('Failed to approve announcement:', e);
    res.status(500).json({ message: 'Internal server error while approving announcement.' });
  }
}

// POST /:id/reject
async function rejectAnnouncement(req, res) {
  const { id: announcementId } = req.params;
  const { userId } = req.user;
  const newStatus = 'Rejected'; // As per requirement
  const reason = (req.body && req.body.reason) || null;
  const changeDescription = `Status changed to ${newStatus}${reason ? `, reason: ${reason}` : ''}`;

  await updateStatusWithHistory(
    announcementId,
    newStatus,
    userId,
    changeDescription,
    res,
    async (client) => {
      // Try to write rejection_reason if column exists, otherwise append to notes
      const col = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'freight_announcements' AND column_name = 'rejection_reason'`);
      if (col.rowCount > 0) {
        await client.query('UPDATE freight_announcements SET rejection_reason = $1 WHERE id = $2', [reason, announcementId]);
      } else if (reason) {
        await client.query("UPDATE freight_announcements SET notes = COALESCE(notes, '') || $1 WHERE id = $2", [" Rejected: " + reason, announcementId]);
      }
    }
  );
}

// PUT /:id/assignment
async function assignVehicleAndDriver(req, res) {
  const { id: announcementId } = req.params;
  const { vehicleId, driverId } = req.body;
  const { userId, role } = req.user;

  if (!vehicleId || !driverId) {
    return res.status(400).json({ message: 'Vehicle ID and Driver ID are required for assignment.' });
  }

  // Enforce queue by role
  try {
    const { rows } = await pool.query('SELECT assignment_type FROM freight_announcements WHERE id = $1', [announcementId]);
    if (rows.length === 0) return res.status(404).json({ message: 'Announcement not found.' });
    const assignmentType = rows[0].assignment_type;
    // transport_user → only when assignment_type = company
    // personal_transport_user → only when assignment_type = personal
    if (role === 'transport_user' && assignmentType !== 'company') {
      return res.status(403).json({ message: 'Assignment not allowed in current queue for Transport Company.' });
    }
    if (role === 'personal_transport_user' && assignmentType !== 'personal') {
      return res.status(403).json({ message: 'Assignment not allowed in current queue for Personal Transport.' });
    }
  } catch (e) {
    console.error('Queue check failed:', e);
    return res.status(500).json({ message: 'Internal server error while checking assignment queue.' });
  }

  const newStatus = 'Assigned'; // As per requirement
  const changeDescription = `Status changed to ${newStatus}. Assigned vehicle ${vehicleId} and driver ${driverId}.`;

  const assignmentUpdateFn = async (client) => {
    const query = 'UPDATE freight_announcements SET assigned_vehicle_id = $1, assigned_driver_id = $2 WHERE id = $3';
    await client.query(query, [vehicleId, driverId, announcementId]);
  };

  await updateStatusWithHistory(announcementId, newStatus, userId, changeDescription, res, assignmentUpdateFn);
}

// POST /:id/assignment-queue
async function setAssignmentQueue(req, res) {
  const { id: announcementId } = req.params;
  const { nextQueue } = req.body || {};
  const { userId } = req.user;
  if (!['company', 'personal'].includes(nextQueue)) {
    return res.status(400).json({ message: 'nextQueue must be "company" or "personal"' });
  }
  const newStatus = nextQueue === 'company' ? 'PendingCompanyAssignment' : 'PendingPersonalAssignment';
  const changeDescription = `Assignment queue changed to ${nextQueue} → ${newStatus}`;
  await updateStatusWithHistory(
    announcementId,
    newStatus,
    userId,
    changeDescription,
    res,
    async (client) => {
      await client.query('UPDATE freight_announcements SET assignment_type = $1 WHERE id = $2', [nextQueue, announcementId]);
    }
  );
}

async function deleteFreightAnnouncement(req, res) {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // First delete destinations to satisfy foreign key constraints
    await client.query('DELETE FROM freight_destinations WHERE freight_announcement_id = $1', [id]);
    const del = await client.query('DELETE FROM freight_announcements WHERE id = $1', [id]);
    await client.query('COMMIT');
    if (del.rowCount === 0) {
      return res.status(404).json({ message: 'Freight announcement not found.' });
    }
    return res.status(204).send();
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to delete freight announcement:', error);
    return res.status(500).json({ message: 'Internal server error while deleting freight announcement.' });
  } finally {
    client.release();
  }
}

module.exports = {
  getFreightAnnouncements,
  getFreightAnnouncementById,
  approveAnnouncement,
  rejectAnnouncement,
  assignVehicleAndDriver,
  createFreightAnnouncement,
  updateFreightAnnouncement,
  setAssignmentQueue,
  deleteFreightAnnouncement,
};

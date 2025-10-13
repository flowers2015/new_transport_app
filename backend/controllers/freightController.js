const pool = require('../db'); // Assuming a db connection pool is exported from ../db.js

/**
 * Fetches all freight announcements with related information.
 */
async function getFreightAnnouncements(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT 
        fa.*,
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

    // Record the change in the history table
    const historyQuery = 'INSERT INTO announcement_history (announcement_id, changed_by_user_id, change_description) VALUES ($1, $2, $3)';
    await client.query(historyQuery, [announcementId, userId, changeDescription]);

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
  const newStatus = 'PendingAssignment'; // As per requirement, though not in original ENUM
  const changeDescription = `Status changed to ${newStatus}`;
  
  // Note: 'PendingAssignment' is not in the schema's ENUM. You may need to add it.
  // ALTER TYPE freight_announcement_status_enum ADD VALUE 'PendingAssignment';
  // ALTER TYPE freight_announcement_status_enum ADD VALUE 'Rejected';
  // ALTER TYPE freight_announcement_status_enum ADD VALUE 'Assigned';
  await updateStatusWithHistory(announcementId, newStatus, userId, changeDescription, res);
}

// POST /:id/reject
async function rejectAnnouncement(req, res) {
  const { id: announcementId } = req.params;
  const { userId } = req.user;
  const newStatus = 'Rejected'; // As per requirement
  const changeDescription = `Status changed to ${newStatus}`;

  await updateStatusWithHistory(announcementId, newStatus, userId, changeDescription, res);
}

// PUT /:id/assignment
async function assignVehicleAndDriver(req, res) {
  const { id: announcementId } = req.params;
  const { vehicleId, driverId } = req.body;
  const { userId } = req.user;

  if (!vehicleId || !driverId) {
    return res.status(400).json({ message: 'Vehicle ID and Driver ID are required for assignment.' });
  }

  const newStatus = 'Assigned'; // As per requirement
  const changeDescription = `Status changed to ${newStatus}. Assigned vehicle ${vehicleId} and driver ${driverId}.`;

  const assignmentUpdateFn = async (client) => {
    const query = 'UPDATE freight_announcements SET vehicle_id = $1, driver_id = $2 WHERE id = $3';
    await client.query(query, [vehicleId, driverId, announcementId]);
  };

  await updateStatusWithHistory(announcementId, newStatus, userId, changeDescription, res, assignmentUpdateFn);
}

module.exports = {
  getFreightAnnouncements,
  getFreightAnnouncementById,
  approveAnnouncement,
  rejectAnnouncement,
  assignVehicleAndDriver,
};

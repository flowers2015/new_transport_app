const pool = require('../db');

/**
 * Fetches all alerts.
 */
async function getAlerts(req, res) {
  try {
    const { rows } = await pool.query('SELECT * FROM alerts WHERE is_active = true ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    console.error('Failed to get alerts:', error);
    res.status(500).json({ message: 'Internal server error while fetching alerts.' });
  }
}

/**
 * Fetches a single alert by ID.
 */
async function getAlertById(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM alerts WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Alert not found.' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(`Failed to get alert ${id}:`, error);
    res.status(500).json({ message: 'Internal server error while fetching the alert.' });
  }
}

module.exports = {
  getAlerts,
  getAlertById,
};

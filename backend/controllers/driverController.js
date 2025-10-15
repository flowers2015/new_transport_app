const pool = require('../db');

/**
 * Fetches all drivers.
 */
async function getDrivers(req, res) {
  try {
    const { rows } = await pool.query('SELECT * FROM drivers ORDER BY name');
    res.json(rows);
  } catch (error) {
    console.error('Failed to get drivers:', error);
    res.status(500).json({ message: 'Internal server error while fetching drivers.' });
  }
}

/**
 * Fetches a single driver by ID.
 */
async function getDriverById(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM drivers WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Driver not found.' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(`Failed to get driver ${id}:`, error);
    res.status(500).json({ message: 'Internal server error while fetching the driver.' });
  }
}

module.exports = {
  getDrivers,
  getDriverById,
};




























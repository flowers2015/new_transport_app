const pool = require('../db');

/**
 * Fetches all vehicles with branch information.
 */
async function getVehicles(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT v.*, b.name as branch_name, b.location as branch_location 
      FROM vehicles v 
      LEFT JOIN branches b ON v.branch_id = b.id 
      ORDER BY v.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Failed to get vehicles:', error);
    res.status(500).json({ message: 'Internal server error while fetching vehicles.' });
  }
}

/**
 * Fetches a single vehicle by ID.
 */
async function getVehicleById(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM vehicles WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Vehicle not found.' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(`Failed to get vehicle ${id}:`, error);
    res.status(500).json({ message: 'Internal server error while fetching the vehicle.' });
  }
}

module.exports = {
  getVehicles,
  getVehicleById,
};

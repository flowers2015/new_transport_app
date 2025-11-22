const pool = require('../db');

/**
 * Fetches all vehicle permits.
 */
async function getVehiclePermits(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT vp.*, v.model as vehicle_model, v.plate_part1, v.plate_letter, v.plate_part2, v.plate_city_code,
             b.name as branch_name
      FROM vehicle_permits vp
      LEFT JOIN vehicles v ON vp.vehicle_id = v.id
      LEFT JOIN branches b ON vp.branch_id = b.id
      ORDER BY vp.request_date DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Failed to get vehicle permits:', error);
    res.status(500).json({ message: 'Internal server error while fetching vehicle permits.' });
  }
}

/**
 * Fetches a single vehicle permit by ID.
 */
async function getVehiclePermitById(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM vehicle_permits WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Vehicle permit not found.' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(`Failed to get vehicle permit ${id}:`, error);
    res.status(500).json({ message: 'Internal server error while fetching the vehicle permit.' });
  }
}

module.exports = {
  getVehiclePermits,
  getVehiclePermitById,
};













































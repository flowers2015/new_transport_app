const pool = require('../db');

/**
 * Fetches all traffic fines.
 */
async function getTrafficFines(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT tf.*, v.model as vehicle_model, v.plate_part1, v.plate_letter, v.plate_part2, v.plate_city_code,
             b.name as branch_name
      FROM traffic_fines tf
      LEFT JOIN vehicles v ON tf.vehicle_id = v.id
      LEFT JOIN branches b ON tf.branch_id = b.id
      ORDER BY tf.fine_date DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Failed to get traffic fines:', error);
    res.status(500).json({ message: 'Internal server error while fetching traffic fines.' });
  }
}

/**
 * Fetches a single traffic fine by ID.
 */
async function getTrafficFineById(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM traffic_fines WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Traffic fine not found.' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(`Failed to get traffic fine ${id}:`, error);
    res.status(500).json({ message: 'Internal server error while fetching the traffic fine.' });
  }
}

module.exports = {
  getTrafficFines,
  getTrafficFineById,
};
































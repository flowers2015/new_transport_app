const pool = require('../db');

/**
 * Fetches all technicians.
 */
async function getTechnicians(req, res) {
  try {
    const { rows } = await pool.query('SELECT * FROM technicians ORDER BY name');
    res.json(rows);
  } catch (error) {
    console.error('Failed to get technicians:', error);
    res.status(500).json({ message: 'Internal server error while fetching technicians.' });
  }
}

/**
 * Fetches a single technician by ID.
 */
async function getTechnicianById(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM technicians WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Technician not found.' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(`Failed to get technician ${id}:`, error);
    res.status(500).json({ message: 'Internal server error while fetching the technician.' });
  }
}

module.exports = {
  getTechnicians,
  getTechnicianById,
};










































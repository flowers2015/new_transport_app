const pool = require('../db');

/**
 * Fetches all parts.
 */
async function getParts(req, res) {
  try {
    const { rows } = await pool.query('SELECT * FROM parts ORDER BY name');
    res.json(rows);
  } catch (error) {
    console.error('Failed to get parts:', error);
    res.status(500).json({ message: 'Internal server error while fetching parts.' });
  }
}

/**
 * Fetches a single part by ID.
 */
async function getPartById(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM parts WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Part not found.' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(`Failed to get part ${id}:`, error);
    res.status(500).json({ message: 'Internal server error while fetching the part.' });
  }
}

module.exports = {
  getParts,
  getPartById,
};




























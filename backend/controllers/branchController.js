const pool = require('../db');

/**
 * Fetches all branches.
 */
async function getBranches(req, res) {
  try {
    const { rows } = await pool.query('SELECT * FROM branches ORDER BY name');
    res.json(rows);
  } catch (error) {
    console.error('Failed to get branches:', error);
    res.status(500).json({ message: 'Internal server error while fetching branches.' });
  }
}

/**
 * Fetches a single branch by ID.
 */
async function getBranchById(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM branches WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Branch not found.' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(`Failed to get branch ${id}:`, error);
    res.status(500).json({ message: 'Internal server error while fetching the branch.' });
  }
}

module.exports = {
  getBranches,
  getBranchById,
};




























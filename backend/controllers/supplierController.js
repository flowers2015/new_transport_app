const pool = require('../db');

/**
 * Fetches all suppliers.
 */
async function getSuppliers(req, res) {
  try {
    const { rows } = await pool.query('SELECT * FROM suppliers ORDER BY name');
    res.json(rows);
  } catch (error) {
    console.error('Failed to get suppliers:', error);
    res.status(500).json({ message: 'Internal server error while fetching suppliers.' });
  }
}

/**
 * Fetches a single supplier by ID.
 */
async function getSupplierById(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM suppliers WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Supplier not found.' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(`Failed to get supplier ${id}:`, error);
    res.status(500).json({ message: 'Internal server error while fetching the supplier.' });
  }
}

module.exports = {
  getSuppliers,
  getSupplierById,
};



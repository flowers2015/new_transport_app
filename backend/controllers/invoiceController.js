const pool = require('../db');

/**
 * Fetches all invoices with related information.
 */
async function getInvoices(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT 
        i.*,
        v.model as vehicle_model,
        v.brand as vehicle_brand,
        v.plate_part1, v.plate_letter, v.plate_part2, v.plate_city_code,
        ro.description as repair_order_description
      FROM invoices i
      LEFT JOIN vehicles v ON i.vehicle_id = v.id
      LEFT JOIN repair_orders ro ON i.repair_order_id = ro.id
      ORDER BY i.issued_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Failed to get invoices:', error);
    res.status(500).json({ message: 'Internal server error while fetching invoices.' });
  }
}

/**
 * Fetches a single invoice by ID.
 */
async function getInvoiceById(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM invoices WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Invoice not found.' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(`Failed to get invoice ${id}:`, error);
    res.status(500).json({ message: 'Internal server error while fetching the invoice.' });
  }
}

module.exports = {
  getInvoices,
  getInvoiceById,
};

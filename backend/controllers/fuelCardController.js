const pool = require('../db');

/**
 * Fetches all fuel card requests.
 */
async function getFuelCardRequests(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT fcr.*, v.model as vehicle_model, v.plate_part1, v.plate_letter, v.plate_part2, v.plate_city_code,
             b.name as branch_name
      FROM fuel_card_requests fcr
      LEFT JOIN vehicles v ON fcr.vehicle_id = v.id
      LEFT JOIN branches b ON fcr.branch_id = b.id
      ORDER BY fcr.request_date DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Failed to get fuel card requests:', error);
    res.status(500).json({ message: 'Internal server error while fetching fuel card requests.' });
  }
}

/**
 * Fetches a single fuel card request by ID.
 */
async function getFuelCardRequestById(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM fuel_card_requests WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Fuel card request not found.' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(`Failed to get fuel card request ${id}:`, error);
    res.status(500).json({ message: 'Internal server error while fetching the fuel card request.' });
  }
}

module.exports = {
  getFuelCardRequests,
  getFuelCardRequestById,
};






































const pool = require('../db');
const crypto = require('crypto');

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

/**
 * Creates a new branch.
 */
async function createBranch(req, res) {
  try {
    const { name, location } = req.body;

    if (!name || !location) {
      return res.status(400).json({ message: 'Name and location are required.' });
    }

    const id = crypto.randomUUID();
    const { rows } = await pool.query(
      'INSERT INTO branches (id, name, location, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW()) RETURNING *',
      [id, name, location]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error('Failed to create branch:', error);
    res.status(500).json({ message: 'Internal server error while creating branch.' });
  }
}

/**
 * Updates an existing branch.
 */
async function updateBranch(req, res) {
  try {
    const { id } = req.params;
    const { name, location } = req.body;

    if (!name || !location) {
      return res.status(400).json({ message: 'Name and location are required.' });
    }

    const { rows } = await pool.query(
      'UPDATE branches SET name = $1, location = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [name, location, id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Branch not found.' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error(`Failed to update branch ${id}:`, error);
    res.status(500).json({ message: 'Internal server error while updating branch.' });
  }
}

/**
 * Deletes a branch.
 */
async function deleteBranch(req, res) {
  try {
    const { id } = req.params;

    const { rows } = await pool.query('DELETE FROM branches WHERE id = $1 RETURNING *', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Branch not found.' });
    }

    res.json({ message: 'Branch deleted successfully.' });
  } catch (error) {
    console.error(`Failed to delete branch ${id}:`, error);
    res.status(500).json({ message: 'Internal server error while deleting branch.' });
  }
}

module.exports = {
  getBranches,
  getBranchById,
  createBranch,
  updateBranch,
  deleteBranch,
};




























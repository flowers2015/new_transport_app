const pool = require('../db'); // Assuming a db connection pool is exported from ../db.js
const { registerPartUsage } = require('../services/inventoryService');

/**
 * Fetches all repair orders with related information.
 */
async function getRepairOrders(req, res) {
  try {
    const { rows } = await pool.query(`
      SELECT 
        ro.*,
        v.model as vehicle_model,
        v.brand as vehicle_brand,
        v.plate_part1, v.plate_letter, v.plate_part2, v.plate_city_code,
        d.name as driver_name,
        d.employee_id as driver_employee_id,
        b.name as branch_name,
        t.name as technician_name
      FROM repair_orders ro
      LEFT JOIN vehicles v ON ro.vehicle_id = v.id
      LEFT JOIN drivers d ON ro.driver_id = d.id
      LEFT JOIN branches b ON ro.branch_id = b.id
      LEFT JOIN technicians t ON ro.assigned_technician_id = t.id
      ORDER BY ro.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error('Failed to get repair orders:', error);
    res.status(500).json({ message: 'Internal server error while fetching repair orders.' });
  }
}

/**
 * Fetches a single repair order by ID.
 */
async function getRepairOrderById(req, res) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT * FROM repair_orders WHERE id = $1', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Repair order not found.' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error(`Failed to get repair order ${id}:`, error);
    res.status(500).json({ message: 'Internal server error while fetching the repair order.' });
  }
}

/**
 * Fetches repair orders assigned to the currently authenticated technician.
 */
async function getMyRepairOrders(req, res) {
  // The user's ID should be attached to the request by the auth middleware
  const { userId } = req.user; 

  if (!userId) {
    return res.status(401).json({ message: 'Authentication error: User ID not found.' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT * FROM repair_orders WHERE technician_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Failed to get assigned repair orders:', error);
    res.status(500).json({ message: 'Internal server error while fetching assigned repair orders.' });
  }
}

/**
 * Adds a part usage record to a repair order.
 * This operation is transactional.
 */
async function addPartUsage(req, res) {
  const { id: orderId } = req.params;
  const { partId, quantity } = req.body;

  if (!partId || !quantity || quantity <= 0) {
    return res.status(400).json({ message: 'Part ID and a positive quantity are required.' });
  }

  const dbClient = await pool.connect();

  try {
    await dbClient.query('BEGIN');

    // Call the service function with the transaction client
    await registerPartUsage(orderId, partId, quantity, dbClient);

    await dbClient.query('COMMIT');
    
    res.status(200).json({ message: 'Part usage registered successfully.' });

  } catch (error) {
    await dbClient.query('ROLLBACK');
    console.error('Failed to register part usage:', error);
    res.status(500).json({ message: 'Internal server error while registering part usage.' });
  } finally {
    dbClient.release();
  }
}

/**
 * Fetches part usages for a specific repair order.
 */
async function getPartUsages(req, res) {
  const { id: orderId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT pu.*, p.name as part_name FROM part_usages pu JOIN parts p ON pu.part_id = p.id WHERE pu.repair_order_id = $1 ORDER BY pu.usage_date DESC',
      [orderId]
    );
    res.json(rows);
  } catch (error) {
    console.error(`Failed to get part usages for order ${orderId}:`, error);
    res.status(500).json({ message: 'Internal server error while fetching part usages.' });
  }
}

/**
 * Creates an outsourcing request for a repair order.
 */
async function createOutsourcingRequest(req, res) {
  const { id: orderId } = req.params;
  const { supplierId } = req.body;
  
  if (!supplierId) {
    return res.status(400).json({ message: 'Supplier ID is required.' });
  }

  try {
    const { rows } = await pool.query(
      'INSERT INTO outsourcing_requests (repair_order_id, supplier_id) VALUES ($1, $2) RETURNING *',
      [orderId, supplierId]
    );
    res.status(201).json({ message: 'Outsourcing request created successfully.', request: rows[0] });
  } catch (error) {
    console.error(`Failed to create outsourcing request for order ${orderId}:`, error);
    res.status(500).json({ message: 'Internal server error while creating outsourcing request.' });
  }
}

/**
 * Assigns a technician to a repair order.
 */
async function assignTechnician(req, res) {
  const { id: orderId } = req.params;
  const { technicianId } = req.body;
  
  if (!technicianId) {
    return res.status(400).json({ message: 'Technician ID is required.' });
  }

  try {
    const { rows } = await pool.query(
      'UPDATE repair_orders SET technician_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [technicianId, orderId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Repair order not found.' });
    }
    
    res.json({ message: 'Technician assigned successfully.', order: rows[0] });
  } catch (error) {
    console.error(`Failed to assign technician to order ${orderId}:`, error);
    res.status(500).json({ message: 'Internal server error while assigning technician.' });
  }
}

/**
 * Updates the status of a repair order.
 */
async function updateStatus(req, res) {
  const { id: orderId } = req.params;
  const { status } = req.body;
  
  if (!status) {
    return res.status(400).json({ message: 'Status is required.' });
  }

  try {
    const { rows } = await pool.query(
      'UPDATE repair_orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [status, orderId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Repair order not found.' });
    }
    
    res.json({ message: 'Status updated successfully.', order: rows[0] });
  } catch (error) {
    console.error(`Failed to update status for order ${orderId}:`, error);
    res.status(500).json({ message: 'Internal server error while updating status.' });
  }
}

module.exports = {
  addPartUsage,
  getRepairOrders,
  getRepairOrderById,
  getMyRepairOrders,
  getPartUsages,
  createOutsourcingRequest,
  assignTechnician,
  updateStatus,
};

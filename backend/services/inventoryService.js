// A placeholder function to simulate checking for low stock and creating an alert.
async function checkLowStock(partId, dbClient) {
  // In a real implementation, this would check the stock level
  // and create an alert if it falls below a certain threshold.
  console.log(`Checking stock for part ${partId}. This is a placeholder.`);
  // For example, you might query the parts table:
  // const { rows } = await dbClient.query('SELECT stock_quantity FROM parts WHERE id = $1', [partId]);
  // if (rows[0].stock_quantity < 10) {
  //   // Logic to create an alert
  // }
}

/**
 * Registers the usage of a part for a repair order within a database transaction.
 * @param {string} orderId - The UUID of the repair order.
 * @param {string} partId - The UUID of the part used.
 * @param {number} quantity - The quantity of the part used.
 * @param {object} dbClient - The database client from a transaction.
 */
async function registerPartUsage(orderId, partId, quantity, dbClient) {
  // Decrement the stock quantity in the (hypothetical) parts table
  // This query assumes a 'parts' table exists with 'id' and 'stock_quantity' columns.
  const updateStockQuery = `
    UPDATE parts
    SET stock_quantity = stock_quantity - $1
    WHERE id = $2;
  `;
  await dbClient.query(updateStockQuery, [quantity, partId]);

  // Update the repair_orders table to record the part usage.
  // This query assumes 'repair_orders' has a JSONB column 'part_usages'.
  const updateRepairOrderQuery = `
    UPDATE repair_orders
    SET part_usages = COALESCE(part_usages, '[]'::jsonb) || $1::jsonb
    WHERE id = $2;
  `;
  const partUsageRecord = { partId, quantity, usedAt: new Date().toISOString() };
  await dbClient.query(updateRepairOrderQuery, [JSON.stringify(partUsageRecord), orderId]);

  // Check for low stock after decrementing.
  await checkLowStock(partId, dbClient);

  console.log(`Registered usage of quantity ${quantity} for part ${partId} in order ${orderId}.`);
}

module.exports = {
  registerPartUsage,
};

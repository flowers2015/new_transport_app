const pool = require('../db'); // Assuming a db connection pool is exported from ../db.js

function logAudit(req, res, next) {
  res.on('finish', async () => {
    // Log only for successful mutating requests (POST, PUT, DELETE)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const userId = req.user ? req.user.userId : null;

      // Do not log if there is no user attached to the request
      if (!userId) {
        return;
      }

      const action = `${req.method} ${req.originalUrl}`;
      const details = Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : null;

      try {
        await pool.query(
          'INSERT INTO audit_log (user_id, action, details) VALUES ($1, $2, $3)',
          [userId, action, details]
        );
      } catch (error) {
        console.error('Failed to write to audit log:', error);
      }
    }
  });

  next();
}

module.exports = {
  logAudit,
};

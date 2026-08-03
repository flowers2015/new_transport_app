/**
 * احراز هویت لایه یکپارچه‌سازی — فقط با کلید API (جدا از لاگین کاربران)
 * هدر: X-API-Key: <INTEGRATION_LIS_API_KEY>
 */
function requireIntegrationApiKey(req, res, next) {
  const expected = (process.env.INTEGRATION_LIS_API_KEY || '').trim();
  if (!expected) {
    return res.status(503).json({
      message: 'سرویس یکپارچه‌سازی فعال نیست. INTEGRATION_LIS_API_KEY در سرور تنظیم نشده است.',
    });
  }

  const provided = String(req.headers['x-api-key'] || '').trim();
  if (!provided || provided !== expected) {
    return res.status(401).json({ message: 'کلید API نامعتبر است.' });
  }

  next();
}

module.exports = { requireIntegrationApiKey };

async function getMetabaseConfig(req, res) {
  const publicUrl = (process.env.METABASE_PUBLIC_URL || '').trim();
  const embedUrl = (process.env.METABASE_EMBED_URL || publicUrl).trim();
  const adminUrl = (process.env.METABASE_ADMIN_URL || '').trim();
  const isAdmin = req.user?.role === 'admin';

  res.json({
    configured: Boolean(publicUrl || embedUrl),
    title: process.env.METABASE_REPORT_TITLE || 'گزارش‌های ترابری',
    description:
      process.env.METABASE_REPORT_DESCRIPTION ||
      'گزارش‌های تحلیلی بر اساس داده‌های سیستم ناوگان',
    publicUrl,
    embedUrl,
    adminUrl: isAdmin ? adminUrl || publicUrl.replace(/\/public\/.*/, '/') : null,
    embedEnabled: process.env.METABASE_EMBED_ENABLED !== 'false',
  });
}

module.exports = {
  getMetabaseConfig,
};

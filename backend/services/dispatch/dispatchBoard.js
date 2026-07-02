/**
 * وقتی خودرو/راننده شرکتی به اعلام بار جدید تخصیص می‌شود،
 * ردیف قبلی همان خودرو یا راننده در تابلو اعلام بار باطل می‌شود.
 *
 * شناسه خودرو/راننده در این پروژه VARCHAR است (مثلاً vehicle_code به‌عنوان id) — از cast به uuid استفاده نکنید.
 */
async function clearPriorBoardAssignments(client, { vehicleId, driverId, excludeFreightAnnouncementId }) {
  if (!excludeFreightAnnouncementId || (!vehicleId && !driverId)) {
    return { rowCount: 0 };
  }

  const vehicleKey = vehicleId != null && String(vehicleId).trim() !== '' ? String(vehicleId) : null;
  const driverKey = driverId != null && String(driverId).trim() !== '' ? String(driverId) : null;

  const result = await client.query(
    `UPDATE dispatch_assignments da
     SET is_cancelled = TRUE
     FROM freight_announcements fa
     WHERE da.freight_announcement_id = fa.id
       AND da.freight_announcement_id::text <> $1::text
       AND fa.status NOT IN ('Cancelled')
       AND (da.is_cancelled IS NULL OR da.is_cancelled = FALSE)
       AND (
         ($2::text IS NOT NULL AND da.vehicle_id::text = $2::text)
         OR ($3::text IS NOT NULL AND da.driver_id::text = $3::text)
       )`,
    [excludeFreightAnnouncementId, vehicleKey, driverKey]
  );

  if (result.rowCount > 0) {
    console.log(
      `✅ [clearPriorBoardAssignments] Cancelled ${result.rowCount} prior board row(s) for vehicle=${vehicleKey || '—'} driver=${driverKey || '—'} before freight ${excludeFreightAnnouncementId}`
    );
  }

  return result;
}

module.exports = {
  clearPriorBoardAssignments,
};

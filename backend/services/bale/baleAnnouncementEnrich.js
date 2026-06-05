const pool = require('../../db');

function combineOrigins(row) {
  if (!row?.origin_city) return '—';
  return String(row.origin_city).trim() || '—';
}

function combineBrands(row) {
  if (!row?.brand) return '—';
  return String(row.brand).trim() || '—';
}

async function enrichAnnouncements(announcements) {
  const ids = (announcements || []).map(a => a.id).filter(Boolean);
  if (!ids.length) return announcements || [];

  const { rows: faRows } = await pool.query(
    `SELECT id, brand, origin_city, cargo_value, notes, delivery_date, line_type, loading_date
     FROM freight_announcements WHERE id = ANY($1::varchar[])`,
    [ids]
  );
  const faMap = new Map(faRows.map(r => [r.id, r]));

  const { rows: destRows } = await pool.query(
    `SELECT freight_announcement_id, city, delivery_date
     FROM freight_destinations WHERE freight_announcement_id = ANY($1::varchar[])
     ORDER BY created_at ASC`,
    [ids]
  );
  const destMap = new Map();
  for (const d of destRows) {
    if (!destMap.has(d.freight_announcement_id)) {
      destMap.set(d.freight_announcement_id, []);
    }
    destMap.get(d.freight_announcement_id).push(d);
  }

  return (announcements || []).map(ann => {
    const row = faMap.get(ann.id);
    const dests = destMap.get(ann.id) || ann.allDestinations || [];
    const deliveryDates = dests
      .map(d => d.delivery_date)
      .filter(Boolean)
      .map(d => String(d).replace(/-/g, '/'));
    const destCities = dests.map(d => d.city).filter(Boolean);

    return {
      ...ann,
      lineType: ann.lineType || row?.line_type,
      originCity: combineOrigins(row || { origin_city: ann.originCity }),
      brand: combineBrands(row || { brand: ann.brand }),
      cargoValue: ann.cargoValue ?? (row?.cargo_value != null ? Number(row.cargo_value) : null),
      notes: ann.notes ?? row?.notes ?? null,
      deliveryDate: (() => {
        const raw = row?.delivery_date;
        if (raw) {
          if (typeof raw === 'string') return raw.replace(/-/g, '/').slice(0, 10);
          if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
            return raw.toISOString().slice(0, 10).replace(/-/g, '/');
          }
        }
        return deliveryDates[0] || null;
      })(),
      deliveryDates,
      destinationCities: destCities.length
        ? destCities.join(' و ')
        : ann.destination?.city || null,
    };
  });
}

module.exports = { enrichAnnouncements };

/**
 * تور چندمقصدی: هر مقصد route/km خودش؛ در نمایش یک سطر با «یزد، جیرفت» و km دورترین مقصد.
 */

async function lookupActiveRouteForCity(db, city) {
  if (!city) return null;
  const { rows } = await db.query(
    `SELECT id, city, province, route_category, round_trip_km, distance_category
     FROM dispatch_routes
     WHERE is_active = TRUE AND city = $1
     ORDER BY round_trip_km DESC NULLS LAST, route_category DESC
     LIMIT 1`,
    [city]
  );
  return rows[0] || null;
}

async function lookupRoutesForDestinations(db, destinations) {
  const routes = [];
  for (const dest of destinations || []) {
    routes.push(await lookupActiveRouteForCity(db, dest.city));
  }
  return routes;
}

function pickPrimaryRouteFromList(destinations, routes) {
  let route = null;
  let primaryDestination = destinations?.[destinations.length - 1] || null;
  let maxKm = 0;

  for (let i = 0; i < (destinations || []).length; i++) {
    const destRoute = routes[i];
    if (!destRoute) continue;
    const km = Number(destRoute.round_trip_km) || 0;
    if (km >= maxKm) {
      maxKm = km;
      route = destRoute;
      primaryDestination = destinations[i];
    }
  }

  if (!route && destinations?.length) {
    primaryDestination = destinations[destinations.length - 1];
  }

  return { route, primaryDestination };
}

function groupAssignmentsByTrip(assignments) {
  if (!assignments?.length) return [];

  const groups = new Map();

  for (const item of assignments) {
    const tripKey = item.announcementId;
    if (!tripKey) {
      groups.set(`singleton-${item.id}`, [item]);
      continue;
    }
    const list = groups.get(tripKey) || [];
    list.push(item);
    groups.set(tripKey, list);
  }

  const result = [];

  for (const parts of groups.values()) {
    if (parts.length === 1) {
      result.push(parts[0]);
      continue;
    }

    const sorted = [...parts].sort((a, b) => {
      const orderDiff = (a.destinationOrder ?? 0) - (b.destinationOrder ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return String(a.destinationCity || '').localeCompare(String(b.destinationCity || ''), 'fa');
    });

    const cities = [];
    const seen = new Set();
    for (const part of sorted) {
      const city = part.destinationCity;
      if (city && !seen.has(city)) {
        seen.add(city);
        cities.push(city);
      }
    }

    let maxPart = sorted[0];
    for (const part of sorted) {
      if ((part.roundTripKm ?? 0) > (maxPart.roundTripKm ?? 0)) {
        maxPart = part;
      }
    }

    const primary = sorted[0];
    result.push({
      ...primary,
      destinationCity: cities.join('، '),
      destinationCities: cities,
      roundTripKm: maxPart.roundTripKm ?? primary.roundTripKm,
      isVeryFar: maxPart.isVeryFar,
      routeBucket: maxPart.routeBucket,
      routeCategory: maxPart.routeCategory,
      distanceCategory: maxPart.distanceCategory,
    });
  }

  return result;
}

module.exports = {
  lookupActiveRouteForCity,
  lookupRoutesForDestinations,
  pickPrimaryRouteFromList,
  groupAssignmentsByTrip,
};

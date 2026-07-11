const pool = require('../db');

const VEHICLE_SOFT_CAPACITY_KG = {
  تریلی: 24000,
  'مینی تریلی': 24000,
  'ده چرخ': 14000,
  تک: 10000,
  'مینی تک': 5000,
  خاور: 4000,
};

const RULE_SCORES = {
  SAME_AXIS_PRIMARY: 100,
  SAME_AXIS_SECONDARY: 80,
  SHARED_HUB: 70,
  COASTAL_LINK: 55,
  SAME_GEO_ZONE: 30,
  REPAIR_REMOVE: 96,
  REPAIR_REPLACE: 98,
};

const AXIS_LABELS = {
  R44: 'محور ۴۴ امام‌رضا (شرق/مشهد)',
  FW14: 'آزادراه حرم‌تاحرم',
  R59: 'محور چالوس / کندوان',
  FW3: 'آزادراه تهران–شمال',
  R77: 'محور هراز / فیروزکوه',
  R49: 'محور قزوین–رشت',
  FW1: 'آزادراه قزوین–رشت',
  R22_CASPIAN: 'جاده ساحلی خزر',
  R22_EAST: 'محور گرگان–بجنورد–مشهد',
  R32: 'محور تبریز',
  FW2: 'آزادراه تهران–تبریز',
  R65: 'محور اصفهان–شیراز',
  R71: 'محور یزد–کرمان–بندرعباس',
  FW7: 'آزادراه خلیج فارس',
  R39: 'محور اهواز',
  R48: 'محور همدان–کرمانشاه',
  R46: 'محور سنندج / کردستان',
  R91: 'محور بندرعباس–سیرجان–کرمان',
};

function normalizeCity(city) {
  return String(city || '').trim().toLowerCase();
}

async function loadMembershipsForCities(cities) {
  const unique = [...new Set(cities.map((c) => String(c || '').trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const result = await pool.query(
    `SELECT city, province, axis_code, membership_type, geo_zone, km_from_origin::float AS km
     FROM city_axis_membership
     WHERE LOWER(TRIM(city)) = ANY($1::text[])`,
    [unique.map((c) => c.toLowerCase())]
  );
  return result.rows;
}

function membershipIndex(rows) {
  const byCity = new Map();
  for (const row of rows) {
    const key = normalizeCity(row.city);
    const list = byCity.get(key) || [];
    list.push(row);
    byCity.set(key, list);
  }
  return byCity;
}

function primaryAxesOf(mems) {
  return new Set(
    (mems || [])
      .filter((m) => m.membership_type === 'primary')
      .map((m) => m.axis_code)
      .filter(Boolean)
  );
}

function allAxesOf(mems) {
  return new Set((mems || []).map((m) => m.axis_code).filter(Boolean));
}

function intersectSets(sets) {
  if (!sets.length) return new Set();
  let out = new Set(sets[0]);
  for (let i = 1; i < sets.length; i++) {
    out = new Set([...out].filter((x) => sets[i].has(x)));
  }
  return out;
}

function uniqueCityLabels(seedCities) {
  const out = [];
  const seen = new Set();
  for (const raw of seedCities || []) {
    const label = String(raw || '').trim();
    if (!label) continue;
    const key = normalizeCity(label);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/**
 * تشخیص شهرهای ناهم‌خوان در ردیف:
 * بزرگ‌ترین خوشه هم‌محور را نگه می‌دارد؛ بقیه outlier هستند.
 * مثال: گرگان+گنبد+سیرجان → سیرجان حذف؛ سنندج+کرمانشاه+قم → قم حذف
 */
function findSeedOutliers(seedCities, byCity) {
  const uniqueLabels = uniqueCityLabels(seedCities);
  if (uniqueLabels.length < 2) {
    return {
      divergent: false,
      keepCities: uniqueLabels,
      outlierCities: [],
      dominantAxis: null,
    };
  }

  const axisCover = new Map();
  for (const city of uniqueLabels) {
    const mems = byCity.get(normalizeCity(city)) || [];
    const seenAxes = new Set();
    for (const m of mems) {
      if (!m.axis_code || seenAxes.has(m.axis_code)) continue;
      seenAxes.add(m.axis_code);
      const prev = axisCover.get(m.axis_code) || { count: 0, weight: 0, cities: [] };
      prev.count += 1;
      prev.weight += m.membership_type === 'primary' ? 2 : 1;
      prev.cities.push(city);
      axisCover.set(m.axis_code, prev);
    }
  }

  let bestAxis = null;
  let best = { count: 0, weight: 0 };
  for (const [axis, info] of axisCover.entries()) {
    if (info.count < 2) continue;
    if (
      info.count > best.count ||
      (info.count === best.count && info.weight > best.weight)
    ) {
      bestAxis = axis;
      best = info;
    }
  }

  if (bestAxis) {
    const keepKeys = new Set(
      (axisCover.get(bestAxis).cities || []).map((c) => normalizeCity(c))
    );
    const keepCities = uniqueLabels.filter((c) => keepKeys.has(normalizeCity(c)));
    const outlierCities = uniqueLabels.filter((c) => !keepKeys.has(normalizeCity(c)));
    return {
      divergent: outlierCities.length > 0,
      keepCities,
      outlierCities,
      dominantAxis: bestAxis,
    };
  }

  // هیچ محور مشترکی بین حداقل ۲ شهر نیست — لنگر + هم‌محورهایش
  const anchor = uniqueLabels[0];
  const anchorAxes = allAxesOf(byCity.get(normalizeCity(anchor)) || []);
  const keepCities = [anchor];
  const outlierCities = [];
  for (const city of uniqueLabels.slice(1)) {
    const axes = allAxesOf(byCity.get(normalizeCity(city)) || []);
    if ([...anchorAxes].some((a) => axes.has(a))) keepCities.push(city);
    else outlierCities.push(city);
  }

  // fallback geo_zone با لنگر
  if (outlierCities.length === uniqueLabels.length - 1) {
    const anchorZones = new Set(
      (byCity.get(normalizeCity(anchor)) || []).map((m) => m.geo_zone).filter(Boolean)
    );
    if (anchorZones.size) {
      const keep2 = [anchor];
      const out2 = [];
      for (const city of uniqueLabels.slice(1)) {
        const zones = (byCity.get(normalizeCity(city)) || []).map((m) => m.geo_zone);
        if (zones.some((z) => anchorZones.has(z))) keep2.push(city);
        else out2.push(city);
      }
      return {
        divergent: out2.length > 0,
        keepCities: keep2,
        outlierCities: out2,
        dominantAxis: null,
      };
    }
  }

  return {
    divergent: outlierCities.length > 0,
    keepCities,
    outlierCities,
    dominantAxis: null,
  };
}

/**
 * امتیاز کاندید نسبت به کل شهرهای ردیف (seed).
 * اگر ردیف خودش ناهم‌محور باشد، اولویت با شهر اول (لنگر) است.
 */
function scoreCandidateAgainstSeed(seedCities, byCity, candidateCity) {
  const candMems = byCity.get(normalizeCity(candidateCity)) || [];
  if (!candMems.length) {
    return { score: 0, rule: null, axisCode: null, reason: 'محور مشترک یافت نشد' };
  }

  const seedKeys = seedCities.map((c) => normalizeCity(c)).filter(Boolean);
  const uniqueSeedKeys = [...new Set(seedKeys)];
  const seedMemsList = uniqueSeedKeys.map((k) => byCity.get(k) || []);
  const seedPrimarySets = seedMemsList.map(primaryAxesOf);
  const commonPrimary = intersectSets(seedPrimarySets.filter((s) => s.size > 0));
  const candPrimary = primaryAxesOf(candMems);
  const candAll = allAxesOf(candMems);

  for (const axis of commonPrimary) {
    if (candPrimary.has(axis) || candAll.has(axis)) {
      const bothPrimary = candPrimary.has(axis);
      return {
        score: bothPrimary ? RULE_SCORES.SAME_AXIS_PRIMARY : RULE_SCORES.SAME_AXIS_SECONDARY,
        rule: bothPrimary ? 'SAME_AXIS_PRIMARY' : 'SAME_AXIS_SECONDARY',
        axisCode: axis,
        reason: `${AXIS_LABELS[axis] || axis} · محور مشترک کل ردیف`,
      };
    }
  }

  const perSeed = [];
  for (let i = 0; i < uniqueSeedKeys.length; i++) {
    const seedMems = seedMemsList[i];
    if (!seedMems.length) continue;
    let bestForSeed = { score: 0, rule: null, axisCode: null };
    for (const s of seedMems) {
      for (const c of candMems) {
        if (s.axis_code !== c.axis_code) continue;
        const bothPrimary = s.membership_type === 'primary' && c.membership_type === 'primary';
        const rule =
          bothPrimary
            ? 'SAME_AXIS_PRIMARY'
            : s.axis_code === 'R22_CASPIAN'
              ? 'COASTAL_LINK'
              : 'SAME_AXIS_SECONDARY';
        const score = RULE_SCORES[rule];
        if (score > bestForSeed.score) {
          bestForSeed = { score, rule, axisCode: s.axis_code };
        }
      }
    }
    if (bestForSeed.score > 0) {
      perSeed.push({
        cityKey: uniqueSeedKeys[i],
        cityLabel: seedCities.find((c) => normalizeCity(c) === uniqueSeedKeys[i]) || uniqueSeedKeys[i],
        isAnchor: i === 0,
        ...bestForSeed,
      });
    }
  }

  if (perSeed.length === 0) {
    const anchorMems = seedMemsList[0] || [];
    for (const s of anchorMems) {
      for (const c of candMems) {
        if (s.geo_zone && s.geo_zone === c.geo_zone) {
          return {
            score: RULE_SCORES.SAME_GEO_ZONE,
            rule: 'SAME_GEO_ZONE',
            axisCode: null,
            reason: `فقط منطقه جغرافیایی یکسان با «${seedCities[0]}»`,
          };
        }
      }
    }
    return { score: 0, rule: null, axisCode: null, reason: 'محور مشترک یافت نشد' };
  }

  if (perSeed.length === uniqueSeedKeys.length && uniqueSeedKeys.length > 1) {
    const best = perSeed.reduce((a, b) => (b.score > a.score ? b : a));
    return {
      score: best.score,
      rule: best.rule,
      axisCode: best.axisCode,
      reason: `${AXIS_LABELS[best.axisCode] || best.axisCode} · هم‌محور با همه شهرهای ردیف`,
    };
  }

  const anchorMatch = perSeed.find((p) => p.isAnchor);
  const onlyNonAnchor = perSeed.length > 0 && !anchorMatch;

  if (anchorMatch && perSeed.length === 1) {
    return {
      score: Math.min(anchorMatch.score, 90),
      rule: anchorMatch.rule,
      axisCode: anchorMatch.axisCode,
      reason: `${AXIS_LABELS[anchorMatch.axisCode] || anchorMatch.axisCode} · هم‌محور با «${anchorMatch.cityLabel}» (شهر اول ردیف)`,
    };
  }

  if (onlyNonAnchor || (perSeed.length >= 1 && !anchorMatch)) {
    const best = perSeed.reduce((a, b) => (b.score > a.score ? b : a));
    return {
      score: Math.min(best.score, 40),
      rule: 'PARTIAL_SEED_AXIS',
      axisCode: best.axisCode,
      reason: `${AXIS_LABELS[best.axisCode] || best.axisCode} · فقط با «${best.cityLabel}» هم‌محور است، نه با بقیه ردیف`,
    };
  }

  if (anchorMatch) {
    return {
      score: Math.min(anchorMatch.score, 90),
      rule: anchorMatch.rule,
      axisCode: anchorMatch.axisCode,
      reason: `${AXIS_LABELS[anchorMatch.axisCode] || anchorMatch.axisCode} · هم‌محور با «${anchorMatch.cityLabel}»`,
    };
  }

  return { score: 0, rule: null, axisCode: null, reason: 'محور مشترک یافت نشد' };
}

function groupCandidatesByCity(candidates) {
  const map = new Map();
  for (const cand of candidates) {
    const city = String(cand.city || '').trim();
    if (!city) continue;
    const key = normalizeCity(city);
    const list = map.get(key) || [];
    list.push(cand);
    map.set(key, list);
  }
  return map;
}

function buildSuggestionId(parts) {
  return parts.join('::');
}

function mapStop(g) {
  return {
    announcementId: g.announcementId,
    announcementCode: g.announcementCode || '',
    destinationId: g.destinationId,
    city: g.city,
    province: g.province || null,
    tonnage: Number(g.tonnage) || 0,
    representativeType: g.representativeType || null,
    representativeName: g.representativeName || null,
  };
}

function buildCitySuggestions(seedCities, cityGroups, byCity, remainingCapacity) {
  const citySuggestions = [];
  for (const [cityKey, group] of cityGroups.entries()) {
    const cityName = group[0].city;
    const isSameAsSeed = seedCities.some((s) => normalizeCity(s) === cityKey);
    const scored = isSameAsSeed
      ? {
          score: RULE_SCORES.SAME_AXIS_PRIMARY,
          rule: 'SAME_CITY',
          axisCode: null,
          reason: `همان شهر «${cityName}» — امکان ادغام تناژ`,
        }
      : scoreCandidateAgainstSeed(seedCities, byCity, cityName);

    if (scored.score < RULE_SCORES.SAME_GEO_ZONE && !isSameAsSeed) continue;

    const groupTonnage = group.reduce((s, g) => s + (Number(g.tonnage) || 0), 0);
    if (groupTonnage <= 0) continue;
    if (groupTonnage > remainingCapacity * 1.05) continue;

    citySuggestions.push({
      cityKey,
      city: cityName,
      score: scored.score,
      rule: scored.rule,
      axisCode: scored.axisCode,
      reason: scored.reason || 'ترکیب پیشنهادی',
      tonnageKg: groupTonnage,
      stops: group.map(mapStop),
    });
  }

  citySuggestions.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.tonnageKg - b.tonnageKg;
  });
  return citySuggestions;
}

function pushAddSuggestions(suggestions, citySuggestions, opts) {
  const {
    remainingSlots,
    remainingCapacity,
    seedTonnageKg,
    capacityKg,
    vehicleType,
  } = opts;

  if (remainingSlots < 1) return;

  for (const item of citySuggestions.slice(0, 12)) {
    if (item.stops.length > remainingSlots) continue;
    const totalTonnage = seedTonnageKg + item.tonnageKg;
    suggestions.push({
      id: buildSuggestionId(['add', item.cityKey, item.stops.map((s) => s.destinationId).join('-')]),
      kind: 'add',
      score: item.score,
      rule: item.rule,
      axisCode: item.axisCode,
      reason: item.reason,
      vehicleType,
      capacityKg,
      seedTonnageKg,
      addedTonnageKg: item.tonnageKg,
      removedTonnageKg: 0,
      totalTonnageKg: totalTonnage,
      fillRatio: capacityKg > 0 ? totalTonnage / capacityKg : 0,
      stops: item.stops,
      removeStops: [],
      stopCities: item.stops.map((s) => s.city),
    });
  }

  if (remainingSlots >= 2) {
    const top = citySuggestions.filter((c) => c.score >= 70).slice(0, 8);
    for (let i = 0; i < top.length; i++) {
      for (let j = i + 1; j < top.length; j++) {
        const a = top[i];
        const b = top[j];
        const pairStops = [...a.stops, ...b.stops];
        if (pairStops.length > remainingSlots) continue;
        const added = a.tonnageKg + b.tonnageKg;
        if (added > remainingCapacity * 1.05) continue;
        if (a.axisCode && b.axisCode && a.axisCode !== b.axisCode) continue;
        const score = Math.min(a.score, b.score);
        const totalTonnage = seedTonnageKg + added;
        suggestions.push({
          id: buildSuggestionId([
            'pair',
            a.cityKey,
            b.cityKey,
            pairStops.map((s) => s.destinationId).join('-'),
          ]),
          kind: 'add',
          score,
          rule: a.rule === b.rule ? a.rule : 'MIXED',
          axisCode: a.axisCode || b.axisCode,
          reason: `${a.reason} + ${b.reason}`,
          vehicleType,
          capacityKg,
          seedTonnageKg,
          addedTonnageKg: added,
          removedTonnageKg: 0,
          totalTonnageKg: totalTonnage,
          fillRatio: capacityKg > 0 ? totalTonnage / capacityKg : 0,
          stops: pairStops,
          removeStops: [],
          stopCities: pairStops.map((s) => s.city),
        });
      }
    }
  }
}

function resolveSeedStops(reqBody, seedCities) {
  const raw = Array.isArray(reqBody?.seedStops) ? reqBody.seedStops : [];
  const mapped = raw
    .filter((s) => s?.destinationId && s?.city)
    .map((s) => ({
      announcementId: s.announcementId || '',
      announcementCode: s.announcementCode || '',
      destinationId: String(s.destinationId),
      city: String(s.city || '').trim(),
      province: s.province || null,
      tonnage: Number(s.tonnage) || 0,
      representativeType: s.representativeType || null,
      representativeName: s.representativeName || null,
    }));
  if (mapped.length) return mapped;
  // fallback بدون id — فقط برای امتیازدهی؛ اصلاح حذف ممکن نیست
  return seedCities.map((city, idx) => ({
    announcementId: '',
    announcementCode: '',
    destinationId: `seed-fallback-${idx}`,
    city,
    province: null,
    tonnage: 0,
    representativeType: null,
    representativeName: null,
  }));
}

function stopsForOutlierCities(seedStops, outlierCities) {
  const keys = new Set(outlierCities.map(normalizeCity));
  return seedStops.filter((s) => keys.has(normalizeCity(s.city)));
}

/**
 * POST /api/v1/freight-announcements/dairy-route-suggestions
 */
async function getDairyRouteSuggestions(req, res) {
  try {
    const vehicleType = String(req.body?.vehicleType || 'ده چرخ').trim();
    const capacityKg = VEHICLE_SOFT_CAPACITY_KG[vehicleType] || 14000;
    const seedCities = Array.isArray(req.body?.seedCities)
      ? req.body.seedCities.map((c) => String(c || '').trim()).filter(Boolean)
      : [];
    const seedDestinationIds = new Set(
      (Array.isArray(req.body?.seedDestinationIds) ? req.body.seedDestinationIds : []).map(String)
    );
    const seedTonnageKg = Number(req.body?.seedTonnageKg) || 0;
    const candidates = Array.isArray(req.body?.candidates) ? req.body.candidates : [];
    const seedStops = resolveSeedStops(req.body, seedCities);

    if (seedCities.length === 0) {
      return res.status(400).json({ message: 'حداقل یک شهر مبدأ برای پیشنهاد لازم است.' });
    }

    const usableCandidates = candidates.filter((c) => {
      if (!c?.destinationId || !c?.city) return false;
      if (seedDestinationIds.has(String(c.destinationId))) return false;
      return true;
    });

    const allCities = [
      ...seedCities,
      ...usableCandidates.map((c) => c.city),
      ...seedStops.map((s) => s.city),
    ];
    const memberships = await loadMembershipsForCities(allCities);
    const byCity = membershipIndex(memberships);

    const remainingSlots = Math.max(0, 4 - (Number(req.body?.seedStopCount) || seedCities.length || 1));
    const remainingCapacity = Math.max(0, capacityKg - seedTonnageKg);

    const analysis = findSeedOutliers(seedCities, byCity);
    const scoringSeed = analysis.divergent ? analysis.keepCities : uniqueCityLabels(seedCities);
    const cityGroups = groupCandidatesByCity(usableCandidates);
    const suggestions = [];

    // —— اصلاح چینش: حذف شهرهای ناهم‌خوان ——
    const removeStops = stopsForOutlierCities(seedStops, analysis.outlierCities).filter(
      (s) => s.destinationId && !String(s.destinationId).startsWith('seed-fallback-')
    );

    if (analysis.divergent && removeStops.length > 0) {
      const removedTonnage = removeStops.reduce((s, x) => s + (Number(x.tonnage) || 0), 0);
      const afterRemoveTonnage = Math.max(0, seedTonnageKg - removedTonnage);
      const afterRemoveSlots = remainingSlots + removeStops.length;
      const afterRemoveCapacity = Math.max(0, capacityKg - afterRemoveTonnage);
      const axisLabel = analysis.dominantAxis
        ? AXIS_LABELS[analysis.dominantAxis] || analysis.dominantAxis
        : 'محور مشترک خوشه اصلی';
      const outlierNames = [...new Set(removeStops.map((s) => s.city))].join('، ');
      const keepNames = analysis.keepCities.join('، ');

      suggestions.push({
        id: buildSuggestionId([
          'repair_remove',
          removeStops.map((s) => s.destinationId).join('-'),
        ]),
        kind: 'repair_remove',
        score: RULE_SCORES.REPAIR_REMOVE,
        rule: 'REPAIR_REMOVE_OUTLIER',
        axisCode: analysis.dominantAxis,
        reason: `اصلاح چینش: جدا کردن «${outlierNames}» به ردیف جدید — ناهم‌محور با «${keepNames}» (${axisLabel})`,
        vehicleType,
        capacityKg,
        seedTonnageKg,
        addedTonnageKg: 0,
        removedTonnageKg: removedTonnage,
        totalTonnageKg: afterRemoveTonnage,
        fillRatio: capacityKg > 0 ? afterRemoveTonnage / capacityKg : 0,
        stops: [],
        removeStops,
        stopCities: [],
      });

      // حذف outlier + افزودن کاندید هم‌محور با خوشه درست
      const cleanedSuggestions = buildCitySuggestions(
        scoringSeed,
        cityGroups,
        byCity,
        afterRemoveCapacity
      );
      for (const item of cleanedSuggestions.filter((c) => c.score >= 70).slice(0, 6)) {
        if (item.stops.length > afterRemoveSlots) continue;
        const totalTonnage = afterRemoveTonnage + item.tonnageKg;
        suggestions.push({
          id: buildSuggestionId([
            'repair_replace',
            removeStops.map((s) => s.destinationId).join('-'),
            item.cityKey,
            item.stops.map((s) => s.destinationId).join('-'),
          ]),
          kind: 'repair_replace',
          score: RULE_SCORES.REPAIR_REPLACE,
          rule: 'REPAIR_REPLACE',
          axisCode: item.axisCode || analysis.dominantAxis,
          reason: `اصلاح: جدا کردن «${outlierNames}» به ردیف جدید + افزودن «${item.city}» · ${item.reason}`,
          vehicleType,
          capacityKg,
          seedTonnageKg,
          addedTonnageKg: item.tonnageKg,
          removedTonnageKg: removedTonnage,
          totalTonnageKg: totalTonnage,
          fillRatio: capacityKg > 0 ? totalTonnage / capacityKg : 0,
          stops: item.stops,
          removeStops,
          stopCities: item.stops.map((s) => s.city),
        });
      }
    }

    // —— افزودن معمولی فقط وقتی ردیف از نظر محور هم‌خوان است ——
    if (!analysis.divergent) {
      const citySuggestions = buildCitySuggestions(
        scoringSeed,
        cityGroups,
        byCity,
        remainingCapacity
      );
      pushAddSuggestions(suggestions, citySuggestions, {
        remainingSlots,
        remainingCapacity,
        seedTonnageKg,
        capacityKg,
        vehicleType,
      });
    }

    suggestions.sort((x, y) => {
      if (y.score !== x.score) return y.score - x.score;
      const fillX = Math.min(x.fillRatio, 1);
      const fillY = Math.min(y.fillRatio, 1);
      const penX = x.fillRatio > 1 ? x.fillRatio - 1 : 1 - fillX;
      const penY = y.fillRatio > 1 ? y.fillRatio - 1 : 1 - fillY;
      return penX - penY;
    });

    const strong = suggestions.filter((s) => s.score >= 70);
    const output = strong.length > 0 ? strong : suggestions.filter((s) => s.score >= 50);

    res.json({
      vehicleType,
      capacityKg,
      seedCities,
      seedTonnageKg,
      divergent: analysis.divergent,
      keepCities: analysis.keepCities,
      outlierCities: analysis.outlierCities,
      dominantAxis: analysis.dominantAxis,
      suggestions: output.slice(0, 20),
    });
  } catch (error) {
    console.error('❌ [getDairyRouteSuggestions]', error);
    res.status(500).json({ message: 'خطا در ساخت پیشنهاد ترکیب مسیر', error: error.message });
  }
}

module.exports = {
  getDairyRouteSuggestions,
  VEHICLE_SOFT_CAPACITY_KG,
  findSeedOutliers,
};

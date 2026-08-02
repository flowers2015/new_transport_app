/**
 * ادغام/جداسازی توضیحات چندکاربره اعلام‌بار
 * جداکنندهٔ استاندارد: " :- "
 */

const NOTES_SEPARATOR = ' :- ';

function normalizeNotesPart(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function splitNotesSegments(notes) {
  const raw = String(notes ?? '').trim();
  if (!raw) return [];
  return raw
    .split(/\s*:-\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * چند توضیح را با " :- " یکی می‌کند؛ تکراری‌ها را حذف می‌کند.
 */
function joinAnnouncementNotes(...parts) {
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    const segments = splitNotesSegments(part);
    const fallback = normalizeNotesPart(part);
    const list = segments.length > 0 ? segments : fallback ? [fallback] : [];
    for (const seg of list) {
      const key = seg.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(seg);
    }
  }
  return out.length > 0 ? out.join(NOTES_SEPARATOR) : null;
}

/**
 * هنگام جداسازی مقصد: یک بخش توضیح به ردیف جدید می‌رود، بقیه روی میزبان می‌ماند.
 * @param {string|null|undefined} combinedNotes
 * @param {{ leavingCreatorId?: string|null, remainingCreatorIds?: Array<string|null|undefined> }} opts
 */
function partitionNotesForDestinationSplit(combinedNotes, opts = {}) {
  const segments = splitNotesSegments(combinedNotes);
  if (segments.length === 0) {
    return { hostNotes: null, splitNotes: null };
  }

  const leaving = opts.leavingCreatorId != null ? String(opts.leavingCreatorId) : '';
  const remainingCreators = new Set(
    (opts.remainingCreatorIds || [])
      .map((id) => (id != null ? String(id) : ''))
      .filter(Boolean)
  );
  const leavingStillOnHost = leaving && remainingCreators.has(leaving);

  if (segments.length === 1) {
    const only = segments[0];
    if (leaving && !leavingStillOnHost) {
      // توضیح متعلق به کسی است که دیگر روی میزبان مقصد ندارد → با ردیف جدید برود
      return { hostNotes: null, splitNotes: only };
    }
    // هنوز روی میزبان همکار/همان کاربر مقصد دارد → هر دو ببینند
    return { hostNotes: only, splitNotes: only };
  }

  // چند بخش: اگر خارج‌شونده دیگر روی میزبان مقصد ندارد، آخرین بخش را ببر
  if (leaving && !leavingStillOnHost) {
    return {
      splitNotes: segments[segments.length - 1],
      hostNotes: joinAnnouncementNotes(...segments.slice(0, -1)),
    };
  }

  // خارج‌شونده هنوز مقصد روی میزبان دارد → همه بخش‌ها را برای هر دو نگه دار
  const all = joinAnnouncementNotes(...segments);
  return { hostNotes: all, splitNotes: all };
}

module.exports = {
  NOTES_SEPARATOR,
  splitNotesSegments,
  joinAnnouncementNotes,
  partitionNotesForDestinationSplit,
};

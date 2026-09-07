function toAsciiDigits(text) {
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  return String(text ?? '')
    .trim()
    .replace(/[۰-۹]/g, c => String(persian.indexOf(c)))
    .replace(/[٠-٩]/g, c => String(arabic.indexOf(c)));
}

/** رشتهٔ عددی chat_id — Number روی id بزرگ دقت را خراب می‌کند. */
function normalizeBaleChatId(value) {
  const raw = toAsciiDigits(value).replace(/\s+/g, '');
  if (!raw || !/^-?\d+$/.test(raw)) return null;
  return raw;
}

function toBaleApiChatId(value) {
  const raw = normalizeBaleChatId(value);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : raw;
}

module.exports = { normalizeBaleChatId, toBaleApiChatId };

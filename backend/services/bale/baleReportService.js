const jalaali = require('jalaali-js');
const baleApi = require('./baleApi');
const { publishBuffer, buildPublicUrl } = require('./baleReportFileHost');
const { buildExcelBuffer } = require('./baleReportExcel');

const FILE_SEND_ERROR =
  /upload file bytes|failed to upload|failed to get HTTP URL|unsupported_file|invalid url/i;

function formatNowJalaliDateTime() {
  const d = new Date();
  const j = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const date = `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
  const time = d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  return `${date} — ${time}`;
}

function buildCaption(rowCount) {
  return `گزارش تخصیص شرکتی\n${formatNowJalaliDateTime()}\n${rowCount} مورد`;
}

function formatReportAsText(rows, downloadUrl) {
  const lines = [buildCaption(rows.length), ''];
  rows.forEach((r) => {
    lines.push(
      `${r.row}. ${r.destinations}`,
      `   مبدا: ${r.origin} | برند: ${r.brand}`,
      `   نماینده: ${r.representativeType} / ${r.representativeName}`,
      `   محصولات: ${r.products || '-'} | نوع خودرو: ${r.vehicleType || '-'}`,
      `   خودرو: ${r.vehicleCode} | راننده: ${r.driverName} | تماس: ${r.driverContact}`,
      ''
    );
  });
  if (downloadUrl) {
    lines.push('📎 دانلود فایل (۱ ساعت):', downloadUrl);
  }
  return lines.join('\n').trim();
}

function formatLinkOnlyMessage(caption, downloadUrl, label) {
  return `${caption}\n\n📎 ${label}:\n${downloadUrl}`;
}

function normalizeRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('ردیفی برای ارسال وجود ندارد.');
  }
  return rows.map((row, idx) => ({
    row: row.row ?? idx + 1,
    destinations: String(row.destinations ?? '-'),
    origin: String(row.origin ?? '-'),
    brand: String(row.brand ?? '-'),
    representativeType: String(row.representativeType ?? '-'),
    representativeName: String(row.representativeName ?? '-'),
    products: String(row.products ?? ''),
    vehicleType: String(row.vehicleType ?? '-'),
    vehicleCode: String(row.vehicleCode ?? '-'),
    driverName: String(row.driverName ?? '-'),
    driverContact: String(row.driverContact ?? '-'),
    isDairy: Boolean(row.isDairy),
  }));
}

function decodeImageBase64(imageBase64) {
  const raw = String(imageBase64 || '').trim();
  if (!raw) {
    throw new Error('تصویر ارسال نشده است.');
  }
  const match = /^data:image\/(\w+);base64,(.+)$/i.exec(raw);
  const b64 = match ? match[2] : raw;
  const buffer = Buffer.from(b64, 'base64');
  const ext =
    match?.[1]?.toLowerCase() === 'jpeg' || match?.[1]?.toLowerCase() === 'jpg' ? 'jpg' : 'png';
  const mimeType = ext === 'jpg' ? 'image/jpeg' : 'image/png';
  return { buffer, ext, mimeType };
}

function resolveImageInput(imageBase64, imageBuffer, imageMimeType) {
  if (imageBuffer && imageBuffer.length >= 100) {
    const mime = String(imageMimeType || 'image/jpeg').toLowerCase();
    const ext = mime.includes('png') ? 'png' : 'jpg';
    return {
      buffer: imageBuffer,
      ext,
      mimeType: ext === 'jpg' ? 'image/jpeg' : 'image/png',
    };
  }
  return decodeImageBase64(imageBase64);
}

async function tryMultipartSend(sendFn) {
  try {
    await sendFn();
    return true;
  } catch (err) {
    const msg = String(err?.message || err);
    if (!FILE_SEND_ERROR.test(msg)) {
      throw err;
    }
    console.warn('⚠️ [bale] multipart send failed:', msg);
    return false;
  }
}

async function sendCompanyReport({
  chatId,
  format,
  rows,
  imageBase64,
  imageBuffer,
  imageMimeType,
  publicBaseUrl,
}) {
  if (!baleApi.isConfigured()) {
    throw new Error('BALE_BOT_TOKEN تنظیم نشده است.');
  }
  if (!chatId) {
    throw new Error('chat_id مقصد مشخص نشده است.');
  }

  const normalized = normalizeRows(rows);
  const caption = buildCaption(normalized.length);

  if (format === 'text') {
    await baleApi.sendMessage(chatId, formatReportAsText(normalized));
    return { sent: true, format: 'text', rowCount: normalized.length, delivery: 'text' };
  }

  if (format === 'excel') {
    const xlsxBuffer = await buildExcelBuffer(normalized);
    const filename = `company-report-${Date.now()}.xlsx`;

    const sent = await tryMultipartSend(() =>
      baleApi.sendDocument(chatId, xlsxBuffer, filename, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        caption,
      })
    );

    if (sent) {
      return { sent: true, format: 'excel', rowCount: normalized.length, delivery: 'file' };
    }

    const publishedName = publishBuffer(xlsxBuffer, 'xlsx');
    const downloadUrl = buildPublicUrl(publicBaseUrl, publishedName);
    if (downloadUrl) {
      await baleApi.sendMessage(
        chatId,
        formatLinkOnlyMessage(caption, downloadUrl, 'دانلود اکسل')
      );
      return {
        sent: true,
        format: 'excel',
        rowCount: normalized.length,
        delivery: 'link',
        downloadUrl,
      };
    }

    await baleApi.sendMessage(chatId, formatReportAsText(normalized));
    return { sent: true, format: 'excel', rowCount: normalized.length, delivery: 'text' };
  }

  if (format === 'image') {
    const { buffer, ext, mimeType } = resolveImageInput(imageBase64, imageBuffer, imageMimeType);
    if (buffer.length < 100) {
      throw new Error('فایل تصویر نامعتبر است.');
    }
    const filename = `company-report-${Date.now()}.${ext}`;

    // document: بدون فشرده‌سازی شدید sendPhoto — کیفیت زوم در گروه بهتر می‌ماند
    const sent = await tryMultipartSend(() =>
      baleApi.sendDocument(chatId, buffer, filename, {
        mimeType,
        caption,
      })
    );

    if (sent) {
      return { sent: true, format: 'image', rowCount: normalized.length, delivery: 'file' };
    }

    const publishedName = publishBuffer(buffer, ext);
    const downloadUrl = buildPublicUrl(publicBaseUrl, publishedName);
    if (downloadUrl) {
      await baleApi.sendMessage(
        chatId,
        formatLinkOnlyMessage(caption, downloadUrl, 'دانلود تصویر')
      );
      return {
        sent: true,
        format: 'image',
        rowCount: normalized.length,
        delivery: 'link',
        downloadUrl,
      };
    }

    throw new Error('ارسال تصویر ممکن نشد. PUBLIC_API_BASE_URL را روی سرور تنظیم کنید.');
  }

  throw new Error('فرمت ارسال نامعتبر است.');
}

module.exports = {
  sendCompanyReport,
  buildCaption,
};

const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { promisify } = require('util');
const { pathToFileURL } = require('url');
const {
  formatRepresentativeType,
  getDestinationDisplay,
  getOriginDisplay,
  formatCargoValueToman,
} = require('./baleFormat');

const execFileAsync = promisify(execFile);

const TABLE_WIDTH = 1680;
const COL_UNITS = [6, 10, 16, 20, 12, 8, 14, 12, 16];
const COL_TOTAL = COL_UNITS.reduce((a, b) => a + b, 0);
const HEADERS = [
  'شماره بار',
  'نماینده یا پخش',
  'نام نماینده',
  'مقاصد',
  'مبدا بارگیری',
  'برند',
  'محصولات',
  'ارزش بار',
  'توضیحات',
];

function tableHeightPx(rowCount) {
  const header = 120;
  const row = 150;
  const pad = 80;
  return header + Math.max(1, rowCount) * row + pad;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dash(value) {
  const s = String(value || '').trim();
  return s || '—';
}

function isDairyAnn(ann) {
  const t = String(ann.lineType || ann.line_type || '').toLowerCase();
  return t.includes('پاستوریزه') || t.includes('dairy') || t.includes('لبن');
}

function destList(ann) {
  return ann.allDestinations || ann.destinations || [];
}

function uniqueJoin(values) {
  return [...new Set((values || []).map(v => String(v || '').trim()).filter(Boolean))].join('، ');
}

function representativeTypeLabel(ann) {
  const fromDests = destList(ann)
    .map(d => formatRepresentativeType(d.representativeType || d.representative_type))
    .filter(Boolean);
  if (fromDests.length) return uniqueJoin(fromDests);
  return formatRepresentativeType(ann.representativeType || ann.representative_type);
}

function representativeNameLabel(ann) {
  const fromDests = destList(ann).map(d => d.representativeName || d.representative_name);
  if (fromDests.some(Boolean)) return uniqueJoin(fromDests);
  return String(ann.representativeName || ann.representative_name || '').trim();
}

function destinationsLabel(ann) {
  const cities = destList(ann)
    .map(d => String(d.city || '').trim())
    .filter(Boolean);
  if (cities.length) return cities.join('\n');
  return getDestinationDisplay(ann);
}

function productsLabel(ann) {
  const fromAnn = Array.isArray(ann.products) ? ann.products : [];
  const fromDests = destList(ann).flatMap(d => (Array.isArray(d.products) ? d.products : []));
  return uniqueJoin([...fromAnn, ...fromDests]);
}

function notesLabel(ann) {
  const notes = String(ann.notes || '').trim();
  if (!notes) return '';
  return notes;
}

function announcementsToTableRows(announcements, vehicleCategory) {
  void vehicleCategory;
  return (announcements || []).map((ann, idx) => ({
    row: idx + 1,
    representativeType: dash(representativeTypeLabel(ann)),
    representativeName: dash(representativeNameLabel(ann)),
    destinations: dash(destinationsLabel(ann)),
    origin: dash(getOriginDisplay(ann)),
    brand: dash(ann.brand),
    products: dash(productsLabel(ann)),
    cargoValue: dash(formatCargoValueToman(ann.cargoValue ?? ann.cargo_value)),
    notes: dash(notesLabel(ann)),
    isDairy: isDairyAnn(ann),
  }));
}

function cellHtml(text, multiline) {
  const safe = escapeHtml(text || '—').replace(/\n/g, '<br/>');
  const innerStyle = multiline
    ? 'display:block;text-align:center;white-space:pre-wrap;line-height:1.55;padding:14px 8px;font-size:15.5px;'
    : 'display:flex;align-items:center;justify-content:center;min-height:50px;padding:14px 8px;font-size:15.5px;line-height:1.55;';
  return `<td style="border:1px solid #cbd5e1;padding:0;vertical-align:middle;overflow:hidden;"><div style="${innerStyle}font-family:Tahoma,'Segoe UI',sans-serif;color:#0f172a;font-weight:500;">${safe}</div></td>`;
}

function buildTableHtml(rows, title) {
  const colgroup = COL_UNITS.map(
    (u) => `<col style="width:${((u / COL_TOTAL) * 100).toFixed(4)}%;" />`
  ).join('');
  const header = HEADERS.map(
    (h) =>
      `<th style="border:1px solid #64748b;padding:0;background:#dbeafe;"><div style="min-height:58px;padding:16px 8px;font-weight:700;text-align:center;font-size:16.5px;font-family:Tahoma,'Segoe UI',sans-serif;color:#0f172a;">${escapeHtml(h)}</div></th>`
  ).join('');
  const body = rows
    .map((r) => {
      const bg = r.isDairy ? '#fef9c3' : r.row % 2 === 0 ? '#f8fafc' : '#ffffff';
      return `<tr style="background:${bg};">${[
        cellHtml(String(r.row)),
        cellHtml(r.representativeType),
        cellHtml(r.representativeName, true),
        cellHtml(r.destinations, true),
        cellHtml(r.origin),
        cellHtml(r.brand),
        cellHtml(r.products, true),
        cellHtml(r.cargoValue),
        cellHtml(r.notes, true),
      ].join('')}</tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; padding: 0; background: #ffffff; }
    body { width: ${TABLE_WIDTH}px; }
  </style>
</head>
<body>
  <div style="width:${TABLE_WIDTH}px;padding:24px;background:#ffffff;box-sizing:border-box;font-family:Tahoma,'Segoe UI',sans-serif;color:#0f172a;">
    <div style="text-align:center;font-size:22px;font-weight:800;margin-bottom:16px;">${escapeHtml(title)}</div>
    <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:15px;">
      <colgroup>${colgroup}</colgroup>
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>
</body>
</html>`;
}

function findBrowser() {
  const candidates = [
    process.env.BALE_TABLE_CHROME,
    process.env.CHROME_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/microsoft-edge',
  ].filter(Boolean);
  return (
    candidates.find((p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    }) || null
  );
}

function psSingleQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function runBrowserScreenshot(browser, htmlPath, pngPath, width, height, cwd) {
  const url = pathToFileURL(htmlPath).href;
  if (process.platform !== 'win32') {
    await execFileAsync(
      browser,
      [
        '--headless',
        '--disable-gpu',
        '--hide-scrollbars',
        `--window-size=${width},${height}`,
        `--screenshot=${pngPath}`,
        url,
      ],
      { timeout: 30000, cwd }
    );
    if (!fs.existsSync(pngPath) || fs.statSync(pngPath).size < 100) {
      throw new Error('خروجی تصویر ساخته نشد.');
    }
    return;
  }

  const scriptPath = path.join(cwd, 'shot.ps1');
  const script = [
    `$ErrorActionPreference = 'Stop'`,
    `Set-Location ${psSingleQuote(cwd)}`,
    `& ${psSingleQuote(browser)} --headless --disable-gpu --hide-scrollbars --window-size=${width},${height} --screenshot=${psSingleQuote(path.join(cwd, 'table.png'))} ${psSingleQuote(url)}`,
    `Start-Sleep -Seconds 2`,
    `if (-not (Test-Path ${psSingleQuote(path.join(cwd, 'table.png'))})) {`,
    `  & ${psSingleQuote(browser)} --headless=new --disable-gpu --hide-scrollbars --window-size=${width},${height} --screenshot=table.png ${psSingleQuote(url)}`,
    `}`,
  ].join('\n');
  await fs.promises.writeFile(scriptPath, script, 'utf8');
  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
    { timeout: 30000, windowsHide: true, cwd }
  );
  const produced = [pngPath, path.join(cwd, 'table.png'), path.join(cwd, 'screenshot.png')];
  const found = produced.find((p) => {
    try {
      return fs.existsSync(p) && fs.statSync(p).size > 100;
    } catch {
      return false;
    }
  });
  if (!found) {
    throw new Error('خروجی تصویر ساخته نشد.');
  }
  if (found !== pngPath) {
    await fs.promises.copyFile(found, pngPath);
  }
}

async function screenshotHtmlToPng(html, width, height) {
  const browser = findBrowser();
  if (!browser) {
    throw new Error('مرورگر برای ساخت تصویر جدول پیدا نشد.');
  }
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bale-table-'));
  const htmlPath = path.join(tmpDir, 'table.html');
  const pngPath = path.join(tmpDir, 'table.png');
  await fs.promises.writeFile(htmlPath, html, 'utf8');
  try {
    await runBrowserScreenshot(browser, htmlPath, pngPath, width, height, tmpDir);
    const buffer = await fs.promises.readFile(pngPath);
    if (!buffer || buffer.length < 100) {
      throw new Error('خروجی تصویر خالی بود.');
    }
    return buffer;
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function renderAnnouncementTablePng(announcements, { vehicleCategory } = {}) {
  const rows = announcementsToTableRows(announcements, vehicleCategory);
  if (rows.length === 0) {
    throw new Error('باری برای تصویر وجود ندارد.');
  }
  const html = buildTableHtml(rows, 'لیست بار');
  const height = tableHeightPx(rows.length);
  const buffer = await screenshotHtmlToPng(html, TABLE_WIDTH + 8, height);
  return { buffer, rowCount: rows.length, rows };
}

async function renderAnnouncementTableXlsx(announcements, { vehicleCategory } = {}) {
  const ExcelJS = require('exceljs');
  const rows = announcementsToTableRows(announcements, vehicleCategory);
  if (rows.length === 0) {
    throw new Error('باری برای تصویر وجود ندارد.');
  }
  const workbook = new ExcelJS.Workbook();
  workbook.views = [{ rightToLeft: true }];
  const sheet = workbook.addWorksheet('لیست بار', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
  });
  const headerRow = sheet.addRow(HEADERS);
  headerRow.font = { bold: true };
  rows.forEach(r => {
    sheet.addRow([
      r.row,
      r.representativeType,
      r.representativeName,
      r.destinations,
      r.origin,
      r.brand,
      r.products,
      r.cargoValue,
      r.notes,
    ]);
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer, rowCount: rows.length, rows };
}

module.exports = {
  announcementsToTableRows,
  renderAnnouncementTablePng,
  renderAnnouncementTableXlsx,
};

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import {
    Destination,
    Driver,
    FreightAnnouncement,
    FreightLineType,
    PersonalDriver,
    PersonalVehicle,
    User,
    Vehicle,
} from '../types';
import { formatJalali, formatJalaliDateTime, splitJalaliDateTime } from './jalali';
import {
    formatAnnouncementDestinationProductsLabel,
    formatDestinationBrandLabel,
    formatDestinationProductsLabel,
    formatFreightAmountCell,
    formatRepresentativeType,
    formatTonnageKg,
    formatTotalTonnageFromDestinations,
    getAnnouncementAssignedAt,
    getAnnouncementRepDisplayLabel,
    getAssignedDriverContact,
    getAssignedDriverDisplayName,
    getAssignedVehiclePlate,
    getCarrierName,
    getDestinationCitiesLabel,
    parseNumericField,
    resolveDestinationRepTypeLabel,
} from './freightDisplay';
import { getAssignedVehicleCode } from './transportLiveViewUtils';

const DEST_TITLES = ['مقصد ۱', 'مقصد ۲', 'مقصد ۳', 'مقصد ۴'] as const;
const PRIORITY_LABEL: Record<string, string> = { low: 'کم اهمیت', normal: 'عادی', high: 'فوری' };

const A4_W_MM = 297;
const A4_H_MM = 210;
const A4_W_PX = Math.round((A4_W_MM / 25.4) * 96);
const A4_H_PX = Math.round((A4_H_MM / 25.4) * 96);

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function text(value: unknown): string {
    if (value === null || value === undefined || value === '') return '-';
    const s = String(value).trim();
    return s || '-';
}

function dateTimeText(value: Date | string | null | undefined): string {
    const parts = splitJalaliDateTime(value);
    if (parts?.date) return parts.time ? `${parts.date}  ${parts.time}` : parts.date;
    const fallback = formatJalaliDateTime(value);
    return fallback && fallback !== '-' ? fallback : '-';
}

function destTonnage(dest?: Destination): string {
    if (dest?.tonnage == null || dest.tonnage === '') return '-';
    return formatTonnageKg(parseNumericField(dest.tonnage));
}

function isUuidLike(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function kv(label: string, value: unknown, extraClass = ''): string {
    return `<div class="cell${extraClass ? ` ${extraClass}` : ''}"><div class="k">${escapeHtml(label)}</div><div class="v">${escapeHtml(text(value))}</div></div>`;
}

function buildPrintByLine(user: User): string {
    const name = (user.name || '').trim();
    const safeName = name && !isUuidLike(name) ? name : '';
    const username = (user.username || '').trim();
    const branch = (user.branchCity || '').trim();
    const safeBranch = branch && !isUuidLike(branch) ? branch : '';
    const who = [safeName, username ? `(${username})` : ''].filter(Boolean).join(' ');
    const parts = ['چاپ توسط کارمند مالی شعب'];
    if (who) parts.push(who);
    if (safeBranch) parts.push(`شعبه ${safeBranch}`);
    parts.push(formatJalaliDateTime(new Date()));
    return parts.join(' — ');
}

function destPairs(
    ann: FreightAnnouncement,
    dest: Destination | undefined,
    isDairy: boolean
): Array<[string, string]> {
    if (!dest) return [['وضعیت', 'بدون مقصد']];
    if (isDairy) {
        return [
            ['نوع برند', formatDestinationBrandLabel(dest)],
            ['کد LIS', text(dest.lisCode)],
            ['محصولات', formatDestinationProductsLabel(dest)],
            ['نماینده', resolveDestinationRepTypeLabel(ann, dest)],
            ['مقصد', text(dest.city)],
            ['تناژ', destTonnage(dest)],
            ['تاریخ تحویل', text(dest.deliveryDate)],
            ['ساعت تخلیه', text(dest.unloadTime)],
        ];
    }
    return [
        ['نماینده', resolveDestinationRepTypeLabel(ann, dest)],
        ['مقصد', text(dest.city)],
        ['تناژ', destTonnage(dest)],
        ['تاریخ تحویل', text(dest.deliveryDate)],
        ['ساعت تخلیه', text(dest.unloadTime)],
    ];
}

function cardCss(): string {
    return `
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #fff; }
      .page {
        width: ${A4_W_PX}px;
        height: ${A4_H_PX}px;
        padding: 18px 22px 16px;
        font-family: 'Vazirmatn', 'Tahoma', sans-serif;
        color: #111;
        direction: rtl;
        background: #fff;
        -webkit-font-smoothing: antialiased;
      }
      .title { text-align: center; font-size: 16px; font-weight: 700; margin: 0; }
      .sub {
        text-align: center;
        font-size: 11px;
        color: #334155;
        margin: 4px 0 10px;
        unicode-bidi: isolate;
      }
      .card { border: 1px solid #334155; }
      .card-head {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 28px;
        background: #e2e8f0;
        border-bottom: 1px solid #334155;
        padding: 7px 10px;
        font-size: 12px;
        font-weight: 700;
        text-align: center;
      }
      .tier-top {
        display: grid;
        grid-template-columns: 1fr 1fr;
        border-bottom: 1px solid #334155;
      }
      .block { padding: 7px 8px; }
      .block + .block { border-right: 1px solid #94a3b8; }
      .block h3, .dest h3 {
        margin: 0 0 6px;
        font-size: 12px;
        font-weight: 700;
        text-align: center;
        padding: 7px 8px;
        border: 1px solid #cbd5e1;
        line-height: 1.5;
      }
      .block h3 { background: #f1f5f9; }
      .kv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
      .cell {
        border: 1px solid #e2e8f0;
        background: #fff;
        padding: 6px 8px 8px;
        min-height: 36px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 3px;
        overflow: visible;
      }
      .k { font-size: 10px; color: #64748b; font-weight: 500; line-height: 1.45; padding: 0 4px; }
      .v {
        font-size: 12px;
        font-weight: 700;
        line-height: 1.55;
        word-break: break-word;
        overflow-wrap: anywhere;
        padding: 0 4px 1px;
        max-width: 100%;
      }
      .cell.freight {
        background: #fef3c7;
        border: 1px solid #d97706;
      }
      .cell.freight .k { color: #92400e; font-weight: 700; }
      .cell.freight .v { font-size: 13px; color: #78350f; }
      .tier-dest { display: grid; grid-template-columns: repeat(4, 1fr); }
      .dest { padding: 6px 7px; }
      .dest + .dest { border-right: 1px solid #94a3b8; }
      .dest.empty { background: #f8fafc; }
      .dest h3 { background: #dbeafe; border-color: #93c5fd; margin-bottom: 5px; }
      .dest .kv-grid { grid-template-columns: 1fr 1fr; gap: 5px; }
      .dest .cell { min-height: 36px; padding: 6px 8px 8px; }
      .dest .cell.freight { grid-column: 1 / -1; min-height: 40px; margin-bottom: 5px; }
      .page.dairy .card-head { padding: 6px 10px; font-size: 11px; }
      .page.dairy .block { padding: 5px 7px; }
      .page.dairy .block h3 { margin-bottom: 5px; padding: 6px 8px; font-size: 11px; }
      .page.dairy .tier-top .k { font-size: 9px; }
      .page.dairy .tier-top .v { font-size: 11px; }
      .page.ice .card-head { padding: 6px 10px; font-size: 11px; gap: 18px; }
      .page.ice .block { padding: 5px 7px; }
      .page.ice .block h3 { margin-bottom: 5px; padding: 6px 8px; font-size: 11px; }
      .page.ice .kv-grid { gap: 5px; }
      .page.ice .k { font-size: 9px; }
      .page.ice .v { font-size: 11px; }
      .ice-dest {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: 6px;
        padding: 8px;
        background: #eff6ff;
      }
      .ice-dest .cell { min-height: 48px; background: #fff; }
      .ice-dest .cell.freight {
        background: #fef3c7;
        border: 1px solid #d97706;
      }
      .ice-dest .cell.freight .k { color: #92400e; font-weight: 700; }
      .ice-dest .cell.freight .v { font-size: 15px; color: #78350f; }
    `;
}

function renderTwoTierCard(
    ann: FreightAnnouncement,
    idx: number,
    ctx: {
        lineLabel: string;
        isDairy: boolean;
        isAmbient: boolean;
        vehicles: Vehicle[];
        drivers: Driver[];
        personalDrivers: PersonalDriver[];
        personalVehicles: PersonalVehicle[];
    }
): string {
    const basic: Array<[string, string]> = [
        ['لاین', ctx.lineLabel],
        ['کارمند اعلام‌کننده', text((ann as any).creator_full_name || (ann as any).creator_username)],
        ['نوع خودرو', text(ann.vehicleType)],
        ['مبدا بارگیری', text(ann.originCity)],
        ['کل تناژ', formatTotalTonnageFromDestinations(ann.destinations)],
        ['ارزش بار (ریال)', (ann.cargoValue || 0).toLocaleString('fa-IR')],
        ['ساعت حضور', text(ann.platformArrivalTime)],
        ['تاریخ بارگیری', text(formatJalali(ann.loadingDate))],
        ['تاریخ اعلام بار', dateTimeText(ann.createdAt)],
        ['تاریخ تخصیص', dateTimeText(getAnnouncementAssignedAt(ann) as any)],
    ];
    if (ctx.isAmbient) {
        basic.splice(4, 0, ['برند', text(ann.brand)]);
        basic.splice(4, 0, ['محصولات', text(formatAnnouncementDestinationProductsLabel(ann))]);
    }

    const vehicle: Array<[string, string]> = [
        ['باربری', text(getCarrierName(ann, ctx.personalDrivers))],
        ['نام راننده', text(getAssignedDriverDisplayName(ann, ctx.drivers, ctx.personalDrivers))],
        ['تماس راننده', text(getAssignedDriverContact(ann, ctx.drivers, ctx.personalDrivers))],
        ['کد خودرو', text(getAssignedVehicleCode(ann, ctx.vehicles))],
        ['پلاک خودرو', text(getAssignedVehiclePlate(ann, ctx.vehicles, ctx.personalVehicles))],
        ['شماره بارنامه', text(ann.billOfLadingNumber)],
        ['کرایه کل (ریال)', formatFreightAmountCell(ann.totalFreightCost)],
        ['توضیحات', text(ann.notes)],
    ];

    const destBoxes = DEST_TITLES.map((title, i) => {
        const dest = ann.destinations?.[i];
        const pairs = destPairs(ann, dest, ctx.isDairy);
        const empty = !dest;
        const freight = empty ? '-' : formatFreightAmountCell(dest?.freightCost);
        return `<div class="dest${empty ? ' empty' : ''}">
          <h3>${title}${dest?.city ? ` — ${escapeHtml(dest.city)}` : ''}</h3>
          ${kv('کرایه مقصد (ریال)', freight, 'freight')}
          <div class="kv-grid">${pairs.map(([k, v]) => kv(k, v)).join('')}</div>
        </div>`;
    }).join('');

    return `<article class="card">
      <div class="card-head">
        <span>ردیف ${idx + 1}</span>
        <span>${escapeHtml(ctx.lineLabel)}</span>
        <span>کد ${escapeHtml(text(ann.announcementCode))}</span>
      </div>
      <div class="tier-top">
        <div class="block">
          <h3>اطلاعات اعلام‌بار</h3>
          <div class="kv-grid">${basic.map(([k, v]) => kv(k, v)).join('')}</div>
        </div>
        <div class="block">
          <h3>راننده و خودرو</h3>
          <div class="kv-grid">${vehicle.map(([k, v]) => kv(k, v)).join('')}</div>
        </div>
      </div>
      <div class="tier-dest">${destBoxes}</div>
    </article>`;
}

function renderIceCreamCard(
    ann: FreightAnnouncement,
    idx: number,
    ctx: {
        lineLabel: string;
        vehicles: Vehicle[];
        drivers: Driver[];
        personalDrivers: PersonalDriver[];
        personalVehicles: PersonalVehicle[];
    }
): string {
    const basic: Array<[string, string]> = [
        ['لاین', ctx.lineLabel],
        ['کارمند اعلام‌کننده', text((ann as any).creator_full_name || (ann as any).creator_username)],
        ['نوع خودرو', text(ann.vehicleType)],
        ['نوع نماینده', formatRepresentativeType(ann.representativeType)],
        ['مقصد', text(getDestinationCitiesLabel(ann))],
        ['نام نماینده', text(getAnnouncementRepDisplayLabel(ann))],
        ['مبدا', text(ann.originCity)],
        ['برند', text(ann.brand)],
        ['محصولات', text(Array.isArray(ann.products) ? ann.products.join('، ') : ann.products)],
        ['کارتن', text(ann.cartonCount ?? '-')],
        ['پالت', text(ann.palletCount ?? '-')],
        ['ارزش بار (ریال)', (ann.cargoValue || 0).toLocaleString('fa-IR')],
        ['اولویت', PRIORITY_LABEL[ann.priority || 'normal'] || '-'],
        ['تاریخ بارگیری', text(formatJalali(ann.loadingDate))],
        ['تاریخ اعلام بار', dateTimeText(ann.createdAt)],
        ['تاریخ تخصیص', dateTimeText(getAnnouncementAssignedAt(ann) as any)],
    ];
    const vehicle: Array<[string, string]> = [
        ['نام راننده', text(getAssignedDriverDisplayName(ann, ctx.drivers, ctx.personalDrivers))],
        ['تماس راننده', text(getAssignedDriverContact(ann, ctx.drivers, ctx.personalDrivers))],
        ['کد خودرو', text(getAssignedVehicleCode(ann, ctx.vehicles))],
        ['پلاک خودرو', text(getAssignedVehiclePlate(ann, ctx.vehicles, ctx.personalVehicles))],
        ['شماره بارنامه', text(ann.billOfLadingNumber)],
        ['کرایه کل (ریال)', formatFreightAmountCell(ann.totalFreightCost)],
        ['توضیحات', text(ann.notes)],
    ];
    const dest = ann.destinations?.[0];
    const destCells = [
        kv('مقصد', dest?.city || getDestinationCitiesLabel(ann)),
        kv('نماینده', dest ? resolveDestinationRepTypeLabel(ann, dest) : getAnnouncementRepDisplayLabel(ann)),
        kv('تناژ', destTonnage(dest)),
        kv('تاریخ تحویل', dest?.deliveryDate),
        `<div class="cell freight"><div class="k">کرایه مقصد (ریال)</div><div class="v">${escapeHtml(formatFreightAmountCell(dest?.freightCost))}</div></div>`,
        `<div class="cell freight"><div class="k">کرایه کل (ریال)</div><div class="v">${escapeHtml(formatFreightAmountCell(ann.totalFreightCost))}</div></div>`,
    ].join('');

    return `<article class="card">
      <div class="card-head">
        <span>ردیف ${idx + 1}</span>
        <span>${escapeHtml(ctx.lineLabel)}</span>
        <span>کد ${escapeHtml(text(ann.announcementCode))}</span>
      </div>
      <div class="tier-top">
        <div class="block">
          <h3>اطلاعات اعلام‌بار</h3>
          <div class="kv-grid">${basic.map(([k, v]) => kv(k, v)).join('')}</div>
        </div>
        <div class="block">
          <h3>راننده و خودرو</h3>
          <div class="kv-grid">${vehicle.map(([k, v]) => kv(k, v)).join('')}</div>
        </div>
      </div>
      <div class="block" style="border-top:1px solid #94a3b8">
        <h3>اطلاعات مقصد و کرایه</h3>
        <div class="ice-dest">${destCells}</div>
      </div>
    </article>`;
}

async function capturePagesToPdf(
    pageHtmls: string[],
    employeeLine: string,
    lineLabel: string,
    pageClass = ''
): Promise<void> {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = `position:fixed;left:-${A4_W_PX + 40}px;top:0;width:${A4_W_PX}px;height:${A4_H_PX}px;border:0;opacity:1;pointer-events:none;`;
    document.body.appendChild(iframe);
    const idoc = iframe.contentDocument;
    if (!idoc) {
        document.body.removeChild(iframe);
        throw new Error('ساخت صفحه PDF ممکن نشد.');
    }
    idoc.open();
    idoc.write(
        '<!DOCTYPE html><html><head><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=block"></head><body></body></html>'
    );
    idoc.close();
    idoc.body.style.margin = '0';
    idoc.body.style.background = '#ffffff';
    try {
        await Promise.race([
            (idoc as Document).fonts?.ready ?? Promise.resolve(),
            new Promise((resolve) => setTimeout(resolve, 1200)),
        ]);
    } catch {
        await new Promise((resolve) => setTimeout(resolve, 400));
    }

    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    try {
        for (let i = 0; i < pageHtmls.length; i++) {
            const stage = idoc.createElement('div');
            stage.className = `page${pageClass ? ` ${pageClass}` : ''}`;
            stage.innerHTML = `
              <style>${cardCss()}</style>
              <p class="title">مالی حمل — جدول کامل ${escapeHtml(lineLabel)}${
                  pageHtmls.length > 1 ? ` — صفحه ${i + 1} از ${pageHtmls.length}` : ''
              }</p>
              <p class="sub">${escapeHtml(employeeLine)}</p>
              ${pageHtmls[i]}
            `;
            idoc.body.innerHTML = '';
            idoc.body.appendChild(stage);

            const canvas = await html2canvas(stage, {
                scale: 3,
                useCORS: true,
                backgroundColor: '#ffffff',
                logging: false,
                width: A4_W_PX,
                height: A4_H_PX,
                windowWidth: A4_W_PX,
                windowHeight: A4_H_PX,
                scrollX: 0,
                scrollY: 0,
            });
            if (i > 0) pdf.addPage('a4', 'landscape');
            const marginMm = 8;
            pdf.addImage(
                canvas.toDataURL('image/jpeg', 0.97),
                'JPEG',
                marginMm,
                marginMm,
                A4_W_MM - marginMm * 2,
                A4_H_MM - marginMm * 2
            );
        }
    } finally {
        document.body.removeChild(iframe);
    }
    const stamp = formatJalali(new Date()).replace(/\//g, '-');
    pdf.save(`mali-haml-full-${lineLabel}-${stamp}.pdf`);
}

export async function downloadFinanceSearchPdf(opts: {
    announcements: FreightAnnouncement[];
    lineLabel: string;
    currentUser: User;
    vehicles: Vehicle[];
    drivers: Driver[];
    personalDrivers: PersonalDriver[];
    personalVehicles: PersonalVehicle[];
}): Promise<void> {
    const { announcements, lineLabel, currentUser, vehicles, drivers, personalDrivers, personalVehicles } = opts;
    if (!announcements.length) {
        throw new Error('ردیفی برای خروجی PDF وجود ندارد.');
    }

    const employeeLine = buildPrintByLine(currentUser);

    const isDairy = lineLabel === FreightLineType.Dairy;
    const isAmbient = lineLabel === FreightLineType.Ambient;
    const ctx = { lineLabel, isDairy, isAmbient, vehicles, drivers, personalDrivers, personalVehicles };

    const cards = announcements.map((ann, idx) =>
        isDairy || isAmbient
            ? renderTwoTierCard(ann, idx, ctx)
            : renderIceCreamCard(ann, idx, ctx)
    );

    const cardsPerPage = isDairy || isAmbient ? 1 : 1;
    const pages: string[] = [];
    for (let i = 0; i < cards.length; i += cardsPerPage) {
        pages.push(cards.slice(i, i + cardsPerPage).join(''));
    }

    await capturePagesToPdf(pages, employeeLine, lineLabel, isDairy || isAmbient ? 'dairy' : 'ice');
}

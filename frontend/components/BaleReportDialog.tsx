import React, { useCallback, useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { apiFetch, getApiUrl, isAuthFailureStatus } from '../utils/apiConfig';
import {
    BaleCompanyReportRow,
    COMPANY_BALE_REPORT_HEADERS,
} from '../utils/baleCompanyReport';
import { downloadCompanyBaleReportExcel } from '../utils/baleReportExcel';

type BaleReportRecipient = {
    id: number;
    label: string;
    chat_id: number;
    is_default: boolean;
};

type SendFormat = 'text' | 'excel' | 'image';

interface Props {
    open: boolean;
    onClose: () => void;
    rows: BaleCompanyReportRow[];
}

async function readApiError(res: Response): Promise<string> {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    return body.message || res.statusText || 'خطا در ارتباط با سرور';
}

const CAPTURE_FONT = "'Vazirmatn', 'Tahoma', sans-serif";
const REPORT_TITLE = 'گزارش تخصیص شرکتی';
const CAPTURE_TABLE_WIDTH = 1420;
/** نسبت عرض ستون‌ها — مقاصد و نام نماینده پهن‌تر */
const CAPTURE_COLUMN_UNITS = [6, 34, 16, 9, 11, 28, 9, 16, 12];
const CAPTURE_COLUMN_TOTAL = CAPTURE_COLUMN_UNITS.reduce((sum, w) => sum + w, 0);
const CAPTURE_COLUMN_WIDTHS = CAPTURE_COLUMN_UNITS.map(
    (w) => `${((w / CAPTURE_COLUMN_TOTAL) * 100).toFixed(4)}%`
);

/** اصلاح برچسب‌های شناخته‌شده و حفظ فاصله برای html2canvas */
function fixKnownPersianLabels(text: string): string {
    return text
        .replace(/شهرلبنیات/g, 'شهر لبنیات')
        .replace(/\s*;\s*/g, '؛ ')
        .replace(/\s*,\s*/g, '، ');
}

function textForHtml2Canvas(text: string | number): string {
    const normalized = fixKnownPersianLabels(String(text ?? '-').trim() || '-');
    return normalized.replace(/ /g, '\u00A0');
}

/** شکستن مقاصد و نام‌های چندگانه در خطوط جدا برای جا شدن در ستون */
function textForHtml2CanvasMultiline(text: string | number): string {
    const normalized = fixKnownPersianLabels(String(text ?? '-').trim() || '-');
    const parts = normalized.split(/\s*[،;]\s*/).map((p) => p.trim()).filter(Boolean);
    const lines = parts.length > 1 ? parts : [normalized];
    return lines.map((line) => line.replace(/ /g, '\u00A0')).join('\n');
}

const captureHeaderShellStyle: React.CSSProperties = {
    border: '1px solid #64748b',
    padding: 0,
    verticalAlign: 'middle',
    background: '#dbeafe',
    overflow: 'hidden',
};

const captureHeaderInnerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: '0.3em',
    minHeight: 52,
    padding: '14px 8px',
    fontWeight: 700,
    textAlign: 'center',
    lineHeight: 1.55,
    fontFamily: CAPTURE_FONT,
    fontSize: 13.5,
    color: '#0f172a',
    boxSizing: 'border-box',
    width: '100%',
};

const captureCellShellStyle: React.CSSProperties = {
    border: '1px solid #cbd5e1',
    padding: 0,
    verticalAlign: 'middle',
    overflow: 'hidden',
};

const captureCellInnerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    padding: '12px 8px',
    textAlign: 'center',
    lineHeight: 1.55,
    fontFamily: CAPTURE_FONT,
    fontSize: 13,
    fontWeight: 500,
    color: '#0f172a',
    whiteSpace: 'pre-wrap',
    wordBreak: 'normal',
    overflowWrap: 'break-word',
    boxSizing: 'border-box',
    width: '100%',
};

const captureCellInnerMultilineStyle: React.CSSProperties = {
    ...captureCellInnerStyle,
    display: 'block',
    padding: '10px 6px',
    fontSize: 12.5,
    lineHeight: 1.65,
};

const CaptureTitle: React.FC = () => (
    <div
        style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.4em',
            marginBottom: 18,
            direction: 'rtl',
            fontFamily: CAPTURE_FONT,
            fontSize: 21,
            fontWeight: 700,
            color: '#0f172a',
            lineHeight: 1.7,
        }}
    >
        {REPORT_TITLE.split(/\s+/).map((word) => (
            <span key={word} style={{ display: 'inline-block' }}>
                {word}
            </span>
        ))}
    </div>
);

const CaptureHeaderLabel: React.FC<{ label: string }> = ({ label }) => (
    <th style={captureHeaderShellStyle}>
        <div style={captureHeaderInnerStyle}>
            {label.split(/\s+/).map((word) => (
                <span key={word} style={{ display: 'inline-block' }}>
                    {word}
                </span>
            ))}
        </div>
    </th>
);

const CaptureCell: React.FC<{ value: string | number; multiline?: boolean }> = ({
    value,
    multiline = false,
}) => (
    <td style={captureCellShellStyle}>
        <div style={multiline ? captureCellInnerMultilineStyle : captureCellInnerStyle}>
            {multiline ? textForHtml2CanvasMultiline(value) : textForHtml2Canvas(value)}
        </div>
    </td>
);

const BaleReportDialog: React.FC<Props> = ({ open, onClose, rows }) => {
    const captureRef = useRef<HTMLDivElement>(null);
    const [recipients, setRecipients] = useState<BaleReportRecipient[]>([]);
    const [loadingRecipients, setLoadingRecipients] = useState(false);
    const [selectedRecipientId, setSelectedRecipientId] = useState<number | ''>('');
    const [manualChatId, setManualChatId] = useState('');
    const [format, setFormat] = useState<SendFormat>('text');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newLabel, setNewLabel] = useState('');
    const [newChatId, setNewChatId] = useState('');
    const [newIsDefault, setNewIsDefault] = useState(false);
    const [savingRecipient, setSavingRecipient] = useState(false);

    const loadRecipients = useCallback(async () => {
        setLoadingRecipients(true);
        setError(null);
        try {
            const res = await apiFetch(getApiUrl('bale/report/recipients'));
            if (isAuthFailureStatus(res.status)) {
                throw new Error('نشست منقضی شده — دوباره وارد شوید.');
            }
            if (!res.ok) throw new Error(await readApiError(res));
            const data = (await res.json()) as BaleReportRecipient[];
            setRecipients(data);
            const def = data.find((r) => r.is_default) || data[0];
            if (def) setSelectedRecipientId(def.id);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'خطا در بارگذاری مخاطبین');
        } finally {
            setLoadingRecipients(false);
        }
    }, []);

    useEffect(() => {
        if (open) {
            setError(null);
            setSuccess(null);
            void loadRecipients();
        }
    }, [open, loadRecipients]);

    const resolveChatId = (): number | null => {
        if (selectedRecipientId) {
            const found = recipients.find((r) => r.id === selectedRecipientId);
            if (found) return found.chat_id;
        }
        const manual = Number(manualChatId.trim());
        if (Number.isFinite(manual)) return manual;
        return null;
    };

    const handleSaveRecipient = async () => {
        const chatId = Number(newChatId.trim());
        if (!newLabel.trim()) {
            setError('نام مخاطب را وارد کنید.');
            return;
        }
        if (!Number.isFinite(chatId)) {
            setError('chat_id عددی معتبر وارد کنید.');
            return;
        }
        setSavingRecipient(true);
        setError(null);
        try {
            const res = await apiFetch(getApiUrl('bale/report/recipients'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    label: newLabel.trim(),
                    chatId,
                    isDefault: newIsDefault,
                }),
            });
            if (!res.ok) throw new Error(await readApiError(res));
            const saved = (await res.json()) as BaleReportRecipient;
            await loadRecipients();
            setSelectedRecipientId(saved.id);
            setShowAddForm(false);
            setNewLabel('');
            setNewChatId('');
            setNewIsDefault(false);
            setSuccess('مخاطب ذخیره شد.');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'خطا در ذخیره مخاطب');
        } finally {
            setSavingRecipient(false);
        }
    };

    const handleDeleteRecipient = async (id: number) => {
        if (!confirm('این مخاطب حذف شود؟')) return;
        setError(null);
        try {
            const res = await apiFetch(getApiUrl(`bale/report/recipients/${id}`), {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error(await readApiError(res));
            if (selectedRecipientId === id) setSelectedRecipientId('');
            await loadRecipients();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'خطا در حذف مخاطب');
        }
    };

    const downloadExcelLocal = () => {
        void downloadCompanyBaleReportExcel(rows);
    };

    const captureTableImage = async (): Promise<Blob> => {
        const el = captureRef.current;
        if (!el) throw new Error('جدول پیش‌نمایش یافت نشد.');
        await document.fonts.load('700 21px Vazirmatn');
        await document.fonts.load('700 13px Vazirmatn');
        await document.fonts.load('500 13px Vazirmatn');
        await document.fonts.ready;
        await new Promise((resolve) => setTimeout(resolve, 80));
        const canvas = await html2canvas(el, {
            scale: 1.5,
            backgroundColor: '#ffffff',
            useCORS: true,
            logging: false,
            width: el.scrollWidth,
            height: el.scrollHeight,
            windowWidth: el.scrollWidth,
            windowHeight: el.scrollHeight,
        });
        const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
                (b) => (b ? resolve(b) : reject(new Error('ساخت تصویر ناموفق بود.'))),
                'image/jpeg',
                0.82
            );
        });
        return blob;
    };

    const handleSend = async () => {
        const chatId = resolveChatId();
        if (!chatId) {
            setError('مخاطب یا chat_id را انتخاب کنید.');
            return;
        }
        if (rows.length === 0) {
            setError('ردیفی برای ارسال وجود ندارد.');
            return;
        }
        setSending(true);
        setError(null);
        setSuccess(null);
        try {
            let res: Response;
            if (format === 'image') {
                const imageBlob = await captureTableImage();
                const form = new FormData();
                form.append('chatId', String(chatId));
                form.append('format', format);
                form.append('rows', JSON.stringify(rows));
                form.append('image', imageBlob, 'company-report.jpg');
                res = await apiFetch(getApiUrl('bale/report/send'), {
                    method: 'POST',
                    body: form,
                });
            } else {
                res = await apiFetch(getApiUrl('bale/report/send'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chatId,
                        format,
                        rows,
                    }),
                });
            }
            if (!res.ok) throw new Error(await readApiError(res));
            const body = (await res.json()) as { delivery?: string; downloadUrl?: string };
            if (body.delivery === 'file') {
                setSuccess('فایل گزارش با موفقیت به بله ارسال شد.');
            } else if (body.delivery === 'link' && body.downloadUrl) {
                setSuccess('فایل در بله ضمیمه نشد؛ یک پیام با لینک دانلود فایل ارسال شد.');
            } else if (body.delivery === 'text' && format !== 'text') {
                setSuccess('فایل ارسال نشد؛ گزارش متنی ارسال شد. از «دانلود اکسل (محلی)» هم می‌توانید استفاده کنید.');
            } else {
                setSuccess('گزارش متنی با موفقیت به بله ارسال شد.');
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'خطا در ارسال');
        } finally {
            setSending(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                    <h3 className="text-lg font-bold text-slate-800">ارسال گزارش تخصیص شرکتی به بله</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-500 hover:text-slate-800 text-xl leading-none px-2"
                        aria-label="بستن"
                    >
                        ×
                    </button>
                </div>

                <div className="p-4 overflow-y-auto space-y-4 flex-1">
                    <p className="text-sm text-slate-600">
                        {rows.length.toLocaleString('fa-IR')} تخصیص شرکتی از پیگیری زنده (همه خطوط، بدون در
                        انتظار بارنامه)
                    </p>

                    {error && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                            {success}
                        </div>
                    )}

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">مخاطب ذخیره‌شده</label>
                            <select
                                value={selectedRecipientId}
                                onChange={(e) =>
                                    setSelectedRecipientId(e.target.value ? Number(e.target.value) : '')
                                }
                                disabled={loadingRecipients}
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md"
                            >
                                <option value="">— انتخاب —</option>
                                {recipients.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {r.label} ({r.chat_id.toLocaleString('fa-IR')})
                                        {r.is_default ? ' ★' : ''}
                                    </option>
                                ))}
                            </select>
                            {recipients.length > 0 && selectedRecipientId && (
                                <button
                                    type="button"
                                    onClick={() => void handleDeleteRecipient(Number(selectedRecipientId))}
                                    className="mt-1 text-xs text-red-600 hover:underline"
                                >
                                    حذف مخاطب انتخاب‌شده
                                </button>
                            )}
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-700 mb-1">
                                یا chat_id دستی
                            </label>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={manualChatId}
                                onChange={(e) => setManualChatId(e.target.value)}
                                placeholder="مثلاً -1001234567890"
                                className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-md font-mono ltr text-left"
                                dir="ltr"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setShowAddForm((v) => !v)}
                            className="px-3 py-1 text-xs rounded-md border border-slate-300 hover:bg-slate-50"
                        >
                            {showAddForm ? 'بستن فرم مخاطب' : '+ مخاطب جدید'}
                        </button>
                    </div>

                    {showAddForm && (
                        <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 grid gap-2 sm:grid-cols-3">
                            <input
                                type="text"
                                value={newLabel}
                                onChange={(e) => setNewLabel(e.target.value)}
                                placeholder="نام (مثلاً گروه ترابری)"
                                className="px-2 py-1.5 text-sm border rounded-md"
                            />
                            <input
                                type="text"
                                value={newChatId}
                                onChange={(e) => setNewChatId(e.target.value)}
                                placeholder="chat_id"
                                className="px-2 py-1.5 text-sm border rounded-md font-mono ltr"
                                dir="ltr"
                            />
                            <div className="flex items-center gap-2">
                                <label className="flex items-center gap-1 text-xs text-slate-600">
                                    <input
                                        type="checkbox"
                                        checked={newIsDefault}
                                        onChange={(e) => setNewIsDefault(e.target.checked)}
                                    />
                                    پیش‌فرض
                                </label>
                                <button
                                    type="button"
                                    disabled={savingRecipient}
                                    onClick={() => void handleSaveRecipient()}
                                    className="px-3 py-1 text-xs bg-sky-600 text-white rounded-md hover:bg-sky-700 disabled:opacity-50"
                                >
                                    ذخیره
                                </button>
                            </div>
                        </div>
                    )}

                    <div>
                        <span className="block text-xs font-medium text-slate-700 mb-2">فرمت ارسال به بله</span>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setFormat('text')}
                                className={`px-3 py-1.5 text-sm rounded-md border ${
                                    format === 'text'
                                        ? 'bg-green-600 text-white border-green-600'
                                        : 'border-slate-300 hover:bg-slate-50'
                                }`}
                            >
                                پیام متنی
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormat('excel')}
                                className={`px-3 py-1.5 text-sm rounded-md border ${
                                    format === 'excel'
                                        ? 'bg-green-600 text-white border-green-600'
                                        : 'border-slate-300 hover:bg-slate-50'
                                }`}
                            >
                                فایل اکسل
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormat('image')}
                                className={`px-3 py-1.5 text-sm rounded-md border ${
                                    format === 'image'
                                        ? 'bg-green-600 text-white border-green-600'
                                        : 'border-slate-300 hover:bg-slate-50'
                                }`}
                            >
                                تصویر جدول
                            </button>
                            <button
                                type="button"
                                onClick={downloadExcelLocal}
                                disabled={rows.length === 0}
                                className="px-3 py-1.5 text-sm rounded-md border border-slate-300 hover:bg-slate-50 disabled:opacity-50"
                            >
                                دانلود اکسل (محلی)
                            </button>
                        </div>
                        <p className="text-[11px] text-amber-700 mt-1.5">
                            فقط همان فرمت انتخاب‌شده ارسال می‌شود. اکسل مستقیم (بدون ZIP) است. اگر فایل
                            در بله نرسد، یک پیام با لینک دانلود می‌آید.
                        </p>
                    </div>

                    {/* پیش‌نمایش در UI */}
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                        <div className="min-w-[720px] bg-white p-2">
                            <table className="w-full text-xs border-collapse text-center">
                                <thead>
                                    <tr className="bg-slate-100">
                                        {COMPANY_BALE_REPORT_HEADERS.map((h) => (
                                            <th
                                                key={h}
                                                className="border border-slate-300 px-2 py-2 font-semibold"
                                            >
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.length === 0 ? (
                                        <tr>
                                            <td
                                                colSpan={COMPANY_BALE_REPORT_HEADERS.length}
                                                className="p-4 text-slate-500 border"
                                            >
                                                موردی یافت نشد
                                            </td>
                                        </tr>
                                    ) : (
                                        rows.map((r) => (
                                            <tr key={r.row} className="even:bg-slate-50">
                                                <td className="border border-slate-200 px-2 py-2">{r.row}</td>
                                                <td className="border border-slate-200 px-2 py-2 text-right">{r.destinations}</td>
                                                <td className="border border-slate-200 px-2 py-2">{r.origin}</td>
                                                <td className="border border-slate-200 px-2 py-2">{r.brand}</td>
                                                <td className="border border-slate-200 px-2 py-2">{r.representativeType}</td>
                                                <td className="border border-slate-200 px-2 py-2 text-right">{r.representativeName}</td>
                                                <td className="border border-slate-200 px-2 py-2 font-mono">{r.vehicleCode}</td>
                                                <td className="border border-slate-200 px-2 py-2">{r.driverName}</td>
                                                <td className="border border-slate-200 px-2 py-2 font-mono dir-ltr">{r.driverContact}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* جدول مخصوص عکس — در viewport ولی نامرئی برای رندر درست html2canvas */}
                    <div
                        aria-hidden
                        className="fixed pointer-events-none"
                        style={{ left: 0, top: 0, opacity: 0, zIndex: -1, overflow: 'hidden' }}
                    >
                        <div
                            ref={captureRef}
                            dir="rtl"
                            data-capture-root
                            style={{
                                width: CAPTURE_TABLE_WIDTH,
                                padding: 24,
                                background: '#ffffff',
                                fontFamily: CAPTURE_FONT,
                                color: '#0f172a',
                            }}
                        >
                            <CaptureTitle />
                            <table
                                style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    fontSize: 13,
                                    tableLayout: 'fixed',
                                    color: '#0f172a',
                                    fontFamily: CAPTURE_FONT,
                                }}
                            >
                                <colgroup>
                                    {CAPTURE_COLUMN_WIDTHS.map((width, i) => (
                                        <col key={i} style={{ width }} />
                                    ))}
                                </colgroup>
                                <thead>
                                    <tr>
                                        {COMPANY_BALE_REPORT_HEADERS.map((h) => (
                                            <CaptureHeaderLabel key={h} label={h} />
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => (
                                        <tr key={r.row} style={{ background: r.row % 2 === 0 ? '#f8fafc' : '#fff' }}>
                                            <CaptureCell value={r.row} />
                                            <CaptureCell value={r.destinations} multiline />
                                            <CaptureCell value={r.origin} />
                                            <CaptureCell value={r.brand} />
                                            <CaptureCell value={r.representativeType} />
                                            <CaptureCell value={r.representativeName} multiline />
                                            <CaptureCell value={r.vehicleCode} />
                                            <CaptureCell value={r.driverName} />
                                            <CaptureCell value={r.driverContact} />
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <p className="text-[11px] text-slate-500">
                        بازو باید عضو گروه مقصد باشد. chat_id گروه را از تنظیمات بله یا فوروارد پیام به بازو
                        دریافت کنید.
                    </p>
                </div>

                <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-200 bg-slate-50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm rounded-md border border-slate-300 hover:bg-white"
                    >
                        انصراف
                    </button>
                    <button
                        type="button"
                        disabled={sending || rows.length === 0}
                        onClick={() => void handleSend()}
                        className="px-4 py-2 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                        {sending ? 'در حال ارسال…' : 'ارسال به بله'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BaleReportDialog;

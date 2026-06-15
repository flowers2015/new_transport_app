import React, { useMemo, useState } from 'react';
import {
    buildCommissionSummaries,
    buildTourDetailsFromCalculations,
    DriverCommissionSummary,
    DriverTourDetail,
    MileageRegulation,
} from '../utils/commissionSummary';
import { downloadStyledExcelWorkbook } from '../utils/excelExport';
import { getApiUrl } from '../utils/apiConfig';

type ArchiveTab = 'trailer' | 'tenWheeler' | 'driverSearch';

interface PeriodInfo {
    id: string;
    periodName: string;
    startDate: string;
    endDate: string;
    status: string;
    recordedTours?: number;
    totalAmount?: number;
    closedAt?: string;
}

interface Props {
    open: boolean;
    onClose: () => void;
    periods: PeriodInfo[];
    mileageRegulations: MileageRegulation[];
    onSelectPeriod: (period: PeriodInfo) => Promise<Record<string, unknown>[]>;
    loadingPeriodTours: boolean;
}

const SUMMARY_HEADERS = [
    'کد پرسنلی',
    'نام راننده',
    'خودرو غالب',
    'نوع صف',
    'تعداد تور',
    'تور تریلی',
    'تور ده‌چرخ',
    'کل پیمایش (کیلومتر)',
    'اجرت (ریال)',
    'اجرت ثابت (ریال)',
];

function summaryToRow(s: DriverCommissionSummary) {
    return [
        s.employeeId,
        s.driverName,
        s.dominantVehicleLabel,
        s.queueTypeLabel,
        s.totalTourCount,
        s.trailerTourCount,
        s.tenWheelerTourCount,
        s.totalKilometers,
        s.totalCommission,
        s.fixedAllowance,
    ];
}

function filterSummariesByTab(data: DriverCommissionSummary[], tab: ArchiveTab) {
    if (tab === 'trailer') return data.filter((s) => s.commissionBase === 'تریلی');
    if (tab === 'tenWheeler') return data.filter((s) => s.commissionBase === 'ده چرخ');
    return data;
}

const CommissionPeriodArchiveDialog: React.FC<Props> = ({
    open,
    onClose,
    periods,
    mileageRegulations,
    onSelectPeriod,
    loadingPeriodTours,
}) => {
    const [listOpen, setListOpen] = useState(true);
    const [selectedPeriod, setSelectedPeriod] = useState<PeriodInfo | null>(null);
    const [rawCalcs, setRawCalcs] = useState<Record<string, unknown>[]>([]);
    const [archiveTab, setArchiveTab] = useState<ArchiveTab>('trailer');
    const [searchTerm, setSearchTerm] = useState('');
    const [driverSearchTerm, setDriverSearchTerm] = useState('');
    const [driverPeriodLimit, setDriverPeriodLimit] = useState(10);
    const [driverHistoryLoading, setDriverHistoryLoading] = useState(false);
    const [driverHistoryRows, setDriverHistoryRows] = useState<
        Array<{ period: PeriodInfo; summary: DriverCommissionSummary }>
    >([]);

    const summaries = useMemo(
        () => buildCommissionSummaries(rawCalcs, mileageRegulations),
        [rawCalcs, mileageRegulations]
    );
    const tourDetails = useMemo(() => buildTourDetailsFromCalculations(rawCalcs), [rawCalcs]);

    const filteredSummaries = useMemo(() => {
        let list = filterSummariesByTab(summaries, archiveTab);
        if (searchTerm.trim()) {
            const t = searchTerm.toLowerCase();
            list = list.filter(
                (s) =>
                    s.employeeId?.toLowerCase().includes(t) ||
                    s.driverName?.toLowerCase().includes(t)
            );
        }
        return list;
    }, [summaries, archiveTab, searchTerm]);

    const handleOpenPeriod = async (period: PeriodInfo) => {
        setSelectedPeriod(period);
        setListOpen(false);
        setArchiveTab('trailer');
        setSearchTerm('');
        const calcs = await onSelectPeriod(period);
        setRawCalcs(calcs);
    };

    const handleBackToList = () => {
        setListOpen(true);
        setSelectedPeriod(null);
        setRawCalcs([]);
        setDriverHistoryRows([]);
    };

    const handleExportExcel = async () => {
        if (!selectedPeriod || rawCalcs.length === 0) return;

        const trailerRows = summaries
            .filter((s) => s.commissionBase === 'تریلی')
            .map(summaryToRow);
        const tenWheelerRows = summaries
            .filter((s) => s.commissionBase === 'ده چرخ')
            .map(summaryToRow);
        const detailRows = tourDetails.map((t) => [
            t.employeeId,
            t.driverName,
            t.billOfLadingNumber,
            t.billOfLadingDate,
            t.destinations,
            t.vehicleType,
            t.queueTypeLabel,
            t.totalKilometers,
            t.fixedAllowance,
        ]);

        await downloadStyledExcelWorkbook({
            fileName: `بایگانی_${selectedPeriod.periodName.replace(/\s/g, '_')}.xlsx`,
            sheets: [
                { sheetName: 'پیمایش تریلی', headers: SUMMARY_HEADERS, rows: trailerRows },
                { sheetName: 'پیمایش ده چرخ', headers: SUMMARY_HEADERS, rows: tenWheelerRows },
                {
                    sheetName: 'ریز تورها',
                    headers: [
                        'کد پرسنلی',
                        'نام راننده',
                        'شماره بارنامه',
                        'تاریخ بارنامه',
                        'مقاصد',
                        'نوع خودرو',
                        'نوع صف',
                        'پیمایش (کیلومتر)',
                        'اجرت ثابت (ریال)',
                    ],
                    rows: detailRows,
                },
            ],
        });
    };

    const handleDriverHistorySearch = async () => {
        if (!driverSearchTerm.trim()) {
            alert('کد پرسنلی یا نام راننده را وارد کنید.');
            return;
        }
        setDriverHistoryLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(
                getApiUrl(
                    `financial/periods/driver-history?search=${encodeURIComponent(driverSearchTerm)}&periodLimit=${driverPeriodLimit}`
                ),
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!res.ok) throw new Error('خطا در جستجو');
            const data = await res.json();
            const periodMap = new Map<string, PeriodInfo>(
                (data.periods || []).map((p: PeriodInfo) => [p.id, p])
            );
            const byPeriod = new Map<string, Record<string, unknown>[]>();
            (data.calculations || []).forEach((c: Record<string, unknown>) => {
                const pid = String(c.period_id ?? '');
                if (!byPeriod.has(pid)) byPeriod.set(pid, []);
                byPeriod.get(pid)!.push(c);
            });
            const rows: Array<{ period: PeriodInfo; summary: DriverCommissionSummary }> = [];
            byPeriod.forEach((calcs, periodId) => {
                const period = periodMap.get(periodId);
                if (!period) return;
                const built = buildCommissionSummaries(calcs, mileageRegulations);
                built.forEach((summary) => rows.push({ period, summary }));
            });
            rows.sort((a, b) =>
                String(b.period.closedAt || b.period.startDate).localeCompare(
                    String(a.period.closedAt || a.period.startDate)
                )
            );
            setDriverHistoryRows(rows);
            setArchiveTab('driverSearch');
            setListOpen(false);
            setSelectedPeriod(null);
        } catch (e: unknown) {
            alert('خطا: ' + (e instanceof Error ? e.message : 'جستجو ناموفق'));
        } finally {
            setDriverHistoryLoading(false);
        }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-6xl max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-slate-800">📁 بایگانی دوره‌های مالی</h2>
                    <button
                        onClick={onClose}
                        className="px-3 py-1 bg-slate-200 rounded text-sm hover:bg-slate-300"
                    >
                        بستن
                    </button>
                </div>

                {listOpen ? (
                    <>
                        <div className="bg-slate-50 rounded-lg p-4 mb-4">
                            <p className="text-sm text-slate-600 mb-3">
                                جستجوی راننده در دوره‌های بسته (بدون انتخاب دوره):
                            </p>
                            <div className="flex flex-wrap gap-2 items-end">
                                <input
                                    type="text"
                                    value={driverSearchTerm}
                                    onChange={(e) => setDriverSearchTerm(e.target.value)}
                                    placeholder="کد پرسنلی یا نام راننده"
                                    className="px-3 py-2 border rounded-md text-sm flex-1 min-w-[200px]"
                                />
                                <select
                                    value={driverPeriodLimit}
                                    onChange={(e) => setDriverPeriodLimit(Number(e.target.value))}
                                    className="px-3 py-2 border rounded-md text-sm"
                                >
                                    <option value={5}>۵ دوره آخر</option>
                                    <option value={10}>۱۰ دوره آخر</option>
                                    <option value={20}>۲۰ دوره آخر</option>
                                </select>
                                <button
                                    onClick={handleDriverHistorySearch}
                                    disabled={driverHistoryLoading}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm hover:bg-indigo-700 disabled:bg-slate-400"
                                >
                                    {driverHistoryLoading ? '...' : '🔍 جستجوی راننده'}
                                </button>
                            </div>
                        </div>

                        {periods.length === 0 ? (
                            <p className="text-slate-500 text-center py-8">هیچ دوره‌ای ثبت نشده است.</p>
                        ) : (
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="bg-slate-700 text-white">
                                        <th className="p-2 border">ردیف</th>
                                        <th className="p-2 border">نام دوره</th>
                                        <th className="p-2 border">از</th>
                                        <th className="p-2 border">تا</th>
                                        <th className="p-2 border">تور</th>
                                        <th className="p-2 border">وضعیت</th>
                                        <th className="p-2 border">عملیات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {periods.map((period, idx) => (
                                        <tr key={period.id} className="hover:bg-slate-50">
                                            <td className="p-2 border text-center">{idx + 1}</td>
                                            <td className="p-2 border font-medium">{period.periodName}</td>
                                            <td className="p-2 border text-center">{period.startDate}</td>
                                            <td className="p-2 border text-center">{period.endDate}</td>
                                            <td className="p-2 border text-center">{period.recordedTours}</td>
                                            <td className="p-2 border text-center">
                                                {period.status === 'closed'
                                                    ? 'بسته'
                                                    : period.status === 'archived'
                                                      ? 'بایگانی'
                                                      : period.status}
                                            </td>
                                            <td className="p-2 border text-center">
                                                <button
                                                    onClick={() => handleOpenPeriod(period)}
                                                    disabled={loadingPeriodTours}
                                                    className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 disabled:bg-slate-400"
                                                >
                                                    {loadingPeriodTours ? '⏳' : 'مشاهده'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </>
                ) : archiveTab === 'driverSearch' ? (
                    <>
                        <button
                            onClick={handleBackToList}
                            className="mb-3 text-sm text-blue-600 hover:underline"
                        >
                            ← بازگشت به لیست دوره‌ها
                        </button>
                        <h3 className="font-bold mb-3">
                            تاریخچه راننده: {driverSearchTerm} ({driverPeriodLimit} دوره آخر)
                        </h3>
                        {driverHistoryRows.length === 0 ? (
                            <p className="text-slate-500 text-center py-8">رکوردی یافت نشد.</p>
                        ) : (
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="bg-indigo-700 text-white">
                                        <th className="p-2 border">دوره</th>
                                        <th className="p-2 border">بازه</th>
                                        <th className="p-2 border">خودرو غالب</th>
                                        <th className="p-2 border">تور</th>
                                        <th className="p-2 border">کل پیمایش</th>
                                        <th className="p-2 border">اجرت</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {driverHistoryRows.map(({ period, summary }) => (
                                        <tr key={`${period.id}-${summary.driverId}`} className="hover:bg-slate-50">
                                            <td className="p-2 border">{period.periodName}</td>
                                            <td className="p-2 border text-center text-xs">
                                                {period.startDate} — {period.endDate}
                                            </td>
                                            <td className="p-2 border text-center">
                                                {summary.dominantVehicleLabel}
                                            </td>
                                            <td className="p-2 border text-center">{summary.totalTourCount}</td>
                                            <td className="p-2 border text-left">
                                                {summary.totalKilometers.toLocaleString('fa-IR')}
                                            </td>
                                            <td className="p-2 border text-left">
                                                {(summary.totalCommission + summary.fixedAllowance).toLocaleString(
                                                    'fa-IR'
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                            <div>
                                <button
                                    onClick={handleBackToList}
                                    className="text-sm text-blue-600 hover:underline mb-1 block"
                                >
                                    ← بازگشت
                                </button>
                                <h3 className="font-bold text-lg">{selectedPeriod?.periodName}</h3>
                                <p className="text-sm text-slate-500">
                                    {selectedPeriod?.startDate} — {selectedPeriod?.endDate} |{' '}
                                    {summaries.length} راننده | {tourDetails.length} تور
                                </p>
                            </div>
                            <button
                                onClick={handleExportExcel}
                                disabled={rawCalcs.length === 0}
                                className="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:bg-slate-400"
                            >
                                📥 خروجی اکسل
                            </button>
                        </div>

                        <div className="flex gap-2 mb-4">
                            {(
                                [
                                    ['trailer', '🚛 تریلی / مینی', 'purple'],
                                    ['tenWheeler', '🚚 ده چرخ', 'orange'],
                                ] as const
                            ).map(([tab, label, color]) => (
                                <button
                                    key={tab}
                                    onClick={() => setArchiveTab(tab)}
                                    className={`px-4 py-2 rounded-t-lg text-sm font-medium ${
                                        archiveTab === tab
                                            ? color === 'purple'
                                                ? 'bg-purple-600 text-white'
                                                : 'bg-orange-600 text-white'
                                            : 'bg-slate-200 text-slate-700'
                                    }`}
                                >
                                    {label} (
                                    {filterSummariesByTab(summaries, tab).length})
                                </button>
                            ))}
                        </div>

                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="جستجو کد پرسنلی یا نام..."
                            className="w-full md:w-1/3 px-3 py-2 border rounded-md text-sm mb-4"
                        />

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr
                                        className={`${archiveTab === 'trailer' ? 'bg-purple-700' : 'bg-orange-700'} text-white`}
                                    >
                                        <th className="p-2 border">ردیف</th>
                                        <th className="p-2 border">کد پرسنلی</th>
                                        <th className="p-2 border">نام راننده</th>
                                        <th className="p-2 border">خودرو غالب</th>
                                        <th className="p-2 border">نوع صف</th>
                                        <th className="p-2 border">تور</th>
                                        <th className="p-2 border">کل پیمایش</th>
                                        <th className="p-2 border">اجرت</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredSummaries.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="p-6 text-center text-slate-500">
                                                راننده‌ای در این تب نیست.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredSummaries.map((s, idx) => (
                                            <tr key={s.driverId} className="hover:bg-slate-50 border-b">
                                                <td className="p-2 border text-center">{idx + 1}</td>
                                                <td className="p-2 border">{s.employeeId}</td>
                                                <td className="p-2 border font-medium">{s.driverName}</td>
                                                <td className="p-2 border text-center">
                                                    {s.dominantVehicleLabel}
                                                </td>
                                                <td className="p-2 border text-center">{s.queueTypeLabel}</td>
                                                <td className="p-2 border text-center">{s.totalTourCount}</td>
                                                <td className="p-2 border text-left">
                                                    {s.totalKilometers.toLocaleString('fa-IR')}
                                                </td>
                                                <td className="p-2 border text-left text-blue-700">
                                                    {(s.totalCommission + s.fixedAllowance).toLocaleString('fa-IR')}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default CommissionPeriodArchiveDialog;

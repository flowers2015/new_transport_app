import React from 'react';
import { FreightAnnouncement, FreightLineType, PersonalDriver } from '../types';
import { isPendingBillOfLadingTab, TransportLiveTab } from '../utils/freightDisplay';
import {
    buildTransportLiveSummary,
    resolveSummaryLineType,
    summaryLineTitle,
    type AmbientLiveSummary,
    type DairyLiveSummary,
    type IceCreamLiveSummary,
    type NamedCountRow,
} from '../utils/transportLiveSummary';

type Props = {
    open: boolean;
    onClose: () => void;
    announcements: FreightAnnouncement[];
    activeLine: TransportLiveTab;
    pendingSubLine: FreightLineType;
    personalDrivers?: PersonalDriver[];
};

const fa = (n: number) => n.toLocaleString('fa-IR');

function SummaryTable({
    headers,
    rows,
}: {
    headers: string[];
    rows: Array<Array<string | number>>;
}) {
    if (rows.length === 0) {
        return <p className="text-xs text-slate-500 py-2">موردی برای نمایش نیست.</p>;
    }
    return (
        <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="w-full text-xs text-right">
                <thead className="bg-slate-50 text-slate-600">
                    <tr>
                        {headers.map((h) => (
                            <th key={h} className="px-2 py-1.5 font-semibold whitespace-nowrap">
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                            {row.map((cell, j) => (
                                <td key={j} className="px-2 py-1.5 whitespace-nowrap tabular-nums">
                                    {typeof cell === 'number' ? fa(cell) : cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function IceCreamBody({ summary }: { summary: IceCreamLiveSummary }) {
    return (
        <div className="space-y-4">
            <section>
                <h4 className="text-sm font-semibold text-slate-800 mb-2">ترابری شرکت / شخصی</h4>
                <SummaryTable
                    headers={['صف', 'تعداد اعلام بار', 'تخصیص‌شده']}
                    rows={[
                        ['ترابری شرکت', summary.companyTotal, summary.companyAssigned],
                        ['ترابری شخصی', summary.personalTotal, summary.personalAssigned],
                    ]}
                />
            </section>
            <section>
                <h4 className="text-sm font-semibold text-slate-800 mb-2">برحسب مبدا بارگیری</h4>
                <SummaryTable
                    headers={['مبدا', 'اعلام بار', 'تخصیص‌شده', 'اعلام مجدد']}
                    rows={summary.byOrigin.map((r: NamedCountRow) => [
                        r.label,
                        r.total,
                        r.assigned ?? 0,
                        r.reannounced ?? 0,
                    ])}
                />
            </section>
            <section>
                <h4 className="text-sm font-semibold text-slate-800 mb-2">برحسب نوع نماینده</h4>
                <SummaryTable
                    headers={['نوع نماینده', 'اعلام بار', 'تخصیص‌شده']}
                    rows={summary.byRepType.map((r: NamedCountRow) => [
                        r.label,
                        r.total,
                        r.assigned ?? 0,
                    ])}
                />
            </section>
        </div>
    );
}

function DairyBody({ summary }: { summary: DairyLiveSummary }) {
    return (
        <section>
            <h4 className="text-sm font-semibold text-slate-800 mb-2">وضعیت تخصیص</h4>
            <SummaryTable
                headers={['وضعیت', 'تعداد']}
                rows={[
                    ['تخصیص انجام‌شده', summary.assigned],
                    ['تخصیص انجام‌نشده', summary.unassigned],
                    ['جمع', summary.total],
                ]}
            />
        </section>
    );
}

function AmbientBody({ summary }: { summary: AmbientLiveSummary }) {
    return (
        <div className="space-y-4">
            <section>
                <h4 className="text-sm font-semibold text-slate-800 mb-2">ارجاع به باربری</h4>
                <SummaryTable
                    headers={['باربری', 'تعداد ارجاع']}
                    rows={summary.byCarrier.map((r) => [r.label, r.total])}
                />
            </section>
            <section>
                <h4 className="text-sm font-semibold text-slate-800 mb-2">اعلام مجدد</h4>
                <SummaryTable
                    headers={['مورد', 'تعداد']}
                    rows={[
                        ['اعلام مجدد', summary.reannouncedTotal],
                        ['کل ردیف‌های قابل‌مشاهده', summary.total],
                    ]}
                />
            </section>
        </div>
    );
}

const TransportLiveSummaryDialog: React.FC<Props> = ({
    open,
    onClose,
    announcements,
    activeLine,
    pendingSubLine,
    personalDrivers = [],
}) => {
    if (!open) return null;

    const lineType = resolveSummaryLineType(activeLine, pendingSubLine);
    const summary = buildTransportLiveSummary(announcements, lineType, personalDrivers);
    const title = summaryLineTitle(lineType, isPendingBillOfLadingTab(activeLine));

    return (
        <div
            className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
                dir="rtl"
            >
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50">
                    <div>
                        <h3 className="text-base font-bold text-slate-800">{title}</h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                            بر اساس ردیف‌هایی که الان در جدول می‌بینید ({fa(announcements.length)} ردیف)
                            — با فیلتر/جستجو به‌روز می‌شود.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-3 py-1.5 text-xs rounded-md bg-slate-200 hover:bg-slate-300 text-slate-700"
                    >
                        بستن
                    </button>
                </div>
                <div className="p-4 overflow-y-auto">
                    {summary.kind === 'iceCream' && <IceCreamBody summary={summary} />}
                    {summary.kind === 'dairy' && <DairyBody summary={summary} />}
                    {summary.kind === 'ambient' && <AmbientBody summary={summary} />}
                    {summary.kind === 'none' && (
                        <p className="text-sm text-slate-500">برای این تب خلاصه‌ای تعریف نشده است.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TransportLiveSummaryDialog;

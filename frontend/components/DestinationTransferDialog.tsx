import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FreightAnnouncement, Destination, FreightLineType } from '../types';
import {
    formatTonnageKg,
    lineTypeFromAnnouncement,
    matchesFreightLine,
    parseNumericField,
    TransportLiveTab,
    isPendingBillOfLading,
} from '../utils/freightDisplay';

type Props = {
    sourceAnnouncement: FreightAnnouncement;
    allAnnouncements: FreightAnnouncement[];
    onClose: () => void;
    onSave: (
        sourceAnnouncementId: string,
        destinationId: string,
        targetAnnouncementId: string,
        newPosition: number
    ) => Promise<boolean>;
};

const resolveDestinationRepType = (ann: FreightAnnouncement, dest: Destination): string => {
    const repTypeValue = ann.representativeType;
    if (repTypeValue === 'distributor' || repTypeValue === 'agent' || repTypeValue === 'پخش') return 'پخش';
    if (repTypeValue === 'representative' || repTypeValue === 'نماینده') return 'نماینده';

    if (ann.representativeName) {
        const repName = ann.representativeName.toLowerCase();
        if (repName.includes('پخش') || repName.includes('distributor')) return 'پخش';
        if (repName.includes('نماینده') || repName.includes('representative')) return 'نماینده';
    }

    const destRepType = (dest as { representativeType?: string }).representativeType;
    if (destRepType === 'distributor' || destRepType === 'agent' || destRepType === 'پخش') return 'پخش';
    if (destRepType === 'representative' || destRepType === 'نماینده') return 'نماینده';

    if (dest.representativeName) {
        const repName = dest.representativeName.toLowerCase();
        if (repName.includes('پخش') || repName.includes('distributor')) return 'پخش';
        if (repName.includes('نماینده') || repName.includes('representative')) return 'نماینده';
    }
    return '';
};

const formatTransferDestinationLine = (
    dest: Destination,
    index: number,
    ann: FreightAnnouncement
): string => {
    const repType = resolveDestinationRepType(ann, dest);
    const tonnage = dest.tonnage ? formatTonnageKg(parseNumericField(dest.tonnage)) : '';
    return `${index + 1}- ${repType ? `(${repType}) ` : ''}${dest.city}${tonnage ? ` (${tonnage})` : ''}`;
};

const announcementMatchesTransferSearch = (ann: FreightAnnouncement, query: string): boolean => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const haystack = [
        ann.announcementCode,
        ann.originCity,
        ann.vehicleType,
        ann.representativeName,
        ...ann.destinations.flatMap(d => [d.city, d.representativeName, d.tonnage != null ? String(d.tonnage) : '']),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    return haystack.includes(q);
};

const DestinationTransferDialog: React.FC<Props> = ({
    sourceAnnouncement,
    allAnnouncements,
    onClose,
    onSave,
}) => {
    const sourceLine = useMemo(() => {
        const backend = lineTypeFromAnnouncement(sourceAnnouncement);
        if (backend === 'IceCream') return FreightLineType.IceCream;
        if (backend === 'Dairy') return FreightLineType.Dairy;
        return FreightLineType.Ambient;
    }, [sourceAnnouncement]);

    const sameLineAnnouncements = useMemo(
        () =>
            allAnnouncements.filter(
                a => matchesFreightLine(a, sourceLine) && !isPendingBillOfLading(a)
            ),
        [allAnnouncements, sourceLine]
    );

    const getRowNumber = useCallback(
        (announcementId: string): number => {
            const index = sameLineAnnouncements.findIndex(a => a.id === announcementId);
            return index >= 0 ? index + 1 : 0;
        },
        [sameLineAnnouncements]
    );

    const [sourceAnnouncementId, setSourceAnnouncementId] = useState(sourceAnnouncement.id);
    const [destinationId, setDestinationId] = useState('');
    const [targetAnnouncementId, setTargetAnnouncementId] = useState('');
    const [targetSearch, setTargetSearch] = useState('');
    const [newPosition, setNewPosition] = useState(1);
    const [saving, setSaving] = useState(false);

    const selectedSourceAnn =
        sameLineAnnouncements.find(a => a.id === sourceAnnouncementId) || sourceAnnouncement;
    const targetAnnouncement = sameLineAnnouncements.find(a => a.id === targetAnnouncementId);

    const isSameRow = targetAnnouncementId === sourceAnnouncementId;
    const currentDestCount = targetAnnouncement ? targetAnnouncement.destinations.length : 0;
    const maxPosition = isSameRow && destinationId ? currentDestCount : currentDestCount + 1;
    const availablePositions = Array.from({ length: Math.max(maxPosition, 1) }, (_, i) => i + 1);

    const filteredTargetAnnouncements = useMemo(
        () => sameLineAnnouncements.filter(ann => announcementMatchesTransferSearch(ann, targetSearch)),
        [sameLineAnnouncements, targetSearch]
    );

    useEffect(() => {
        setSourceAnnouncementId(sourceAnnouncement.id);
        setDestinationId('');
        setTargetAnnouncementId('');
        setTargetSearch('');
        setNewPosition(1);
    }, [sourceAnnouncement.id]);

    useEffect(() => {
        setDestinationId('');
    }, [sourceAnnouncementId]);

    useEffect(() => {
        if (targetAnnouncementId) setNewPosition(1);
    }, [targetAnnouncementId, destinationId]);

    useEffect(() => {
        if (newPosition > availablePositions.length) {
            setNewPosition(availablePositions.length || 1);
        }
    }, [availablePositions.length, newPosition]);

    const handleSave = async () => {
        if (!destinationId || !targetAnnouncementId) {
            alert('لطفاً مقصد و ردیف مقصد را انتخاب کنید.');
            return;
        }
        setSaving(true);
        try {
            const ok = await onSave(
                sourceAnnouncementId,
                destinationId,
                targetAnnouncementId,
                newPosition
            );
            if (ok) onClose();
        } finally {
            setSaving(false);
        }
    };

    const renderAnnouncementCard = (
        ann: FreightAnnouncement,
        selected: boolean,
        onSelect: () => void
    ) => (
        <button
            key={ann.id}
            type="button"
            onClick={onSelect}
            className={`w-full text-right rounded-lg border-2 p-3 transition ${
                selected
                    ? 'border-sky-500 bg-sky-50 shadow-sm'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}
        >
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-2">
                <span className="font-bold text-slate-800">ردیف {getRowNumber(ann.id)}</span>
                <span>·</span>
                <span>کد {ann.announcementCode || '—'}</span>
                <span>·</span>
                <span>{ann.vehicleType || '—'}</span>
            </div>
            <div className="space-y-1">
                {ann.destinations.length === 0 ? (
                    <div className="text-xs text-slate-400">بدون مقصد</div>
                ) : (
                    ann.destinations.map((d, idx) => (
                        <div key={d.id} className="text-sm text-slate-800 leading-relaxed">
                            {formatTransferDestinationLine(d, idx, ann)}
                        </div>
                    ))
                )}
            </div>
        </button>
    );

    return (
        <div
            className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <div className="p-4 border-b shrink-0">
                    <h3 className="text-lg font-bold">جابجایی / انتقال مقصد</h3>
                    <p className="text-xs text-slate-500 mt-1">
                        ردیف مبدا، مقصد انتقالی و ردیف مقصد را انتخاب کنید.
                    </p>
                </div>

                <div className="p-4 md:p-5 space-y-5 overflow-y-auto flex-1">
                    <section className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">
                            ۱. ردیف اعلام بار (مبدا)
                        </label>
                        <div className="max-h-48 overflow-y-auto space-y-2 rounded-lg border border-slate-200 p-2 bg-slate-50">
                            {sameLineAnnouncements.map(ann =>
                                renderAnnouncementCard(
                                    ann,
                                    ann.id === sourceAnnouncementId,
                                    () => setSourceAnnouncementId(ann.id)
                                )
                            )}
                        </div>
                    </section>

                    <section className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">
                            ۲. مقصد انتقالی از ردیف {getRowNumber(sourceAnnouncementId)}
                        </label>
                        {selectedSourceAnn.destinations.length === 0 ? (
                            <div className="text-sm text-slate-400 border border-dashed rounded-lg p-4 text-center">
                                این ردیف مقصدی ندارد.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {selectedSourceAnn.destinations.map((d, idx) => (
                                    <button
                                        key={d.id}
                                        type="button"
                                        onClick={() => setDestinationId(d.id)}
                                        className={`w-full text-right rounded-lg border-2 px-4 py-3 text-sm transition ${
                                            destinationId === d.id
                                                ? 'border-amber-500 bg-amber-50 font-semibold text-amber-950'
                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                        }`}
                                    >
                                        {formatTransferDestinationLine(d, idx, selectedSourceAnn)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">
                            ۳. ردیف مقصد (انتقال به)
                        </label>
                        <input
                            type="search"
                            value={targetSearch}
                            onChange={e => setTargetSearch(e.target.value)}
                            placeholder="جستجو: شهر، نماینده، کد بار، نوع خودرو..."
                            className="input-style w-full"
                            autoComplete="off"
                        />
                        <div className="max-h-56 overflow-y-auto space-y-2 rounded-lg border border-slate-200 p-2 bg-slate-50">
                            <button
                                type="button"
                                onClick={() => setTargetAnnouncementId(sourceAnnouncementId)}
                                className={`w-full text-right rounded-lg border-2 px-4 py-3 text-sm transition ${
                                    targetAnnouncementId === sourceAnnouncementId
                                        ? 'border-emerald-500 bg-emerald-50 font-semibold'
                                        : 'border-slate-200 bg-white hover:border-slate-300'
                                }`}
                            >
                                همان ردیف {getRowNumber(sourceAnnouncementId)} — فقط تغییر ترتیب تخلیه
                            </button>
                            {filteredTargetAnnouncements
                                .filter(a => a.id !== sourceAnnouncementId)
                                .map(ann =>
                                    renderAnnouncementCard(
                                        ann,
                                        ann.id === targetAnnouncementId,
                                        () => setTargetAnnouncementId(ann.id)
                                    )
                                )}
                            {filteredTargetAnnouncements.filter(a => a.id !== sourceAnnouncementId)
                                .length === 0 && (
                                <div className="text-xs text-slate-400 text-center py-3">
                                    ردیفی با این جستجو پیدا نشد.
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="space-y-2">
                        <label className="text-sm font-semibold text-slate-700">
                            ۴. موقعیت جدید در ردیف مقصد
                        </label>
                        <select
                            value={newPosition}
                            onChange={e => setNewPosition(Number(e.target.value))}
                            className="input-style w-full max-w-xs"
                            disabled={!targetAnnouncementId}
                            autoComplete="off"
                        >
                            {availablePositions.map(n => (
                                <option key={n} value={n}>
                                    مقصد {n}
                                    {n === availablePositions.length && !isSameRow ? ' (آخر)' : ''}
                                </option>
                            ))}
                        </select>
                    </section>
                </div>

                <div className="p-4 bg-slate-50 border-t flex justify-end gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-slate-200 rounded-md text-sm"
                        disabled={saving}
                    >
                        انصراف
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving || !destinationId || !targetAnnouncementId}
                        className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm disabled:opacity-50"
                    >
                        {saving ? 'در حال انتقال...' : 'انتقال'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DestinationTransferDialog;

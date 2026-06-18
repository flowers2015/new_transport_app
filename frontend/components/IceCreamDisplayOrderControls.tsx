import React from 'react';
import { FreightAnnouncement } from '../types';

type Props = {
    announcement: FreightAnnouncement;
    index: number;
    total: number;
    disabled?: boolean;
    onTogglePin: (id: string) => void;
    onMove: (id: string, direction: 'up' | 'down') => void;
    onDragStart: (id: string) => void;
    onDragOver: (e: React.DragEvent, id: string) => void;
    onDrop: (id: string) => void;
    isDragOver?: boolean;
};

const IceCreamDisplayOrderControls: React.FC<Props> = ({
    announcement,
    index,
    total,
    disabled = false,
    onTogglePin,
    onMove,
    onDragStart,
    onDragOver,
    onDrop,
    isDragOver = false,
}) => {
    const pinned = !!announcement.displayPinned;

    return (
        <div
            className={`flex items-center justify-center gap-0.5 print:hidden ${isDragOver ? 'bg-sky-100 rounded' : ''}`}
            onDragOver={(e) => {
                e.preventDefault();
                onDragOver(e, announcement.id);
            }}
            onDrop={(e) => {
                e.preventDefault();
                onDrop(announcement.id);
            }}
        >
            <button
                type="button"
                title={pinned ? 'برداشتن سنجاق' : 'سنجاق در ابتدای جدول'}
                disabled={disabled}
                onClick={() => onTogglePin(announcement.id)}
                className={`p-1 rounded text-sm leading-none ${pinned ? 'text-amber-600 hover:bg-amber-50' : 'text-slate-400 hover:bg-slate-100'} disabled:opacity-40`}
            >
                {pinned ? '📌' : '📍'}
            </button>
            <button
                type="button"
                title="جابجایی با کشیدن"
                disabled={disabled}
                draggable={!disabled}
                onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', announcement.id);
                    onDragStart(announcement.id);
                }}
                className="p-1 rounded text-slate-500 hover:bg-slate-100 cursor-grab active:cursor-grabbing disabled:opacity-40"
            >
                ⠿
            </button>
            <button
                type="button"
                title="بالا"
                disabled={disabled || index === 0}
                onClick={() => onMove(announcement.id, 'up')}
                className="p-1 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"
            >
                ▲
            </button>
            <button
                type="button"
                title="پایین"
                disabled={disabled || index >= total - 1}
                onClick={() => onMove(announcement.id, 'down')}
                className="p-1 rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"
            >
                ▼
            </button>
        </div>
    );
};

export default IceCreamDisplayOrderControls;

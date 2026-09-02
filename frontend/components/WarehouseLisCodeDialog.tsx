import React, { useState } from 'react';
import { FreightAnnouncement } from '../types';
import { getApiUrl } from '../utils/apiConfig';

type Props = {
  announcement: FreightAnnouncement;
  onClose: () => void;
  onSaved: () => void;
};

const WarehouseLisCodeDialog: React.FC<Props> = ({ announcement, onClose, onSaved }) => {
  const [rows, setRows] = useState(
    (announcement.destinations || []).map((d) => ({
      id: d.id,
      city: d.city || '',
      lisCode: d.lisCode || (d as any).lis_code || '',
    }))
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      const tk = localStorage.getItem('token');
      const r = await fetch(getApiUrl('freight-announcements/' + announcement.id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
        body: JSON.stringify({
          lineType: announcement.lineType,
          destinations: rows.map((d) => ({ id: d.id, lisCode: d.lisCode })),
          lisCodeOnly: true,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(data.message || 'خطا در ذخیره کد LIS');
        return;
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setErr(e.message || 'خطا');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md p-4"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-slate-800 mb-1">ثبت کد LIS</h3>
        <p className="text-xs text-slate-500 mb-3">
          اعلام بار #{announcement.announcementCode} — فقط کد LIS هر مقصد. بقیه فیلدها قفل است.
        </p>
        {err && <div className="bg-red-50 text-red-700 text-xs px-3 py-2 rounded mb-3">{err}</div>}
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">مقصدی ثبت نشده است.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {rows.map((row, i) => (
              <div key={row.id || i} className="flex items-center gap-2">
                <span className="text-xs text-slate-600 w-28 shrink-0 truncate" title={row.city}>
                  {row.city || 'مقصد ' + (i + 1)}
                </span>
                <input
                  value={row.lisCode}
                  onChange={(e) =>
                    setRows((prev) => prev.map((x, idx) => (idx === i ? { ...x, lisCode: e.target.value } : x)))
                  }
                  className="flex-1 border border-teal-400 rounded px-2 py-1.5 text-sm"
                  placeholder="کد LIS"
                  autoComplete="off"
                />
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm rounded bg-slate-200 hover:bg-slate-300">
            انصراف
          </button>
          <button
            type="button"
            disabled={busy || rows.length === 0}
            onClick={() => void save()}
            className="px-3 py-1.5 text-sm rounded bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {busy ? '...' : 'ذخیره کد LIS'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WarehouseLisCodeDialog;

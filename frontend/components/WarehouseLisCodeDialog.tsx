import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FreightAnnouncement } from '../types';
import { getApiUrl } from '../utils/apiConfig';

type Receiver = {
  id: string;
  employeeId: string;
  fullName: string;
};

type Props = {
  announcement: FreightAnnouncement;
  onClose: () => void;
  onSaved: () => void;
};

function receiverLabel(r: Receiver): string {
  return `${r.fullName} — ${r.employeeId}`;
}

const WarehouseLisCodeDialog: React.FC<Props> = ({ announcement, onClose, onSaved }) => {
  const [rows, setRows] = useState(
    (announcement.destinations || []).map((d) => ({
      id: d.id,
      city: d.city || '',
      lisCode: d.lisCode || (d as any).lis_code || '',
    }))
  );
  const [dockNumber, setDockNumber] = useState(
    announcement.dockNumber != null ? String(announcement.dockNumber) : ''
  );
  const [receivers, setReceivers] = useState<Receiver[]>([]);
  const [receiverId, setReceiverId] = useState(announcement.remittanceReceiverId || '');
  const [receiverQuery, setReceiverQuery] = useState(announcement.remittanceReceiverName || '');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [referred, setReferred] = useState(!!announcement.remittanceReferredToPicker);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const tk = localStorage.getItem('token');
    fetch(getApiUrl('warehouses/lis-receivers'), { headers: { Authorization: 'Bearer ' + tk } })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list: Receiver[] = Array.isArray(d) ? d : [];
        setReceivers(list);
        if (announcement.remittanceReceiverId) {
          const found = list.find((x) => x.id === announcement.remittanceReceiverId);
          if (found) {
            setReceiverId(found.id);
            setReceiverQuery(receiverLabel(found));
          }
        }
      })
      .catch(() => setReceivers([]));
  }, [announcement.remittanceReceiverId]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setSuggestOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filteredReceivers = useMemo(() => {
    const q = receiverQuery.trim().toLowerCase();
    if (!q) return receivers.slice(0, 20);
    return receivers
      .filter(
        (r) =>
          (r.fullName || '').toLowerCase().includes(q) ||
          (r.employeeId || '').toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [receiverQuery, receivers]);

  const selectedReceiver = receivers.find((r) => r.id === receiverId) || null;

  const pickReceiver = (r: Receiver) => {
    setReceiverId(r.id);
    setReceiverQuery(receiverLabel(r));
    setSuggestOpen(false);
    setErr('');
  };

  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      const dockDigits = dockNumber.replace(/\D/g, '');
      if (!selectedReceiver) {
        setErr('حواله‌گیر را از فهرست انتخاب کنید. ورود دستی مجاز نیست.');
        setBusy(false);
        return;
      }
      const tk = localStorage.getItem('token');
      const r = await fetch(getApiUrl('freight-announcements/' + announcement.id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
        body: JSON.stringify({
          lineType: announcement.lineType,
          destinations: rows.map((d) => ({ id: d.id, lisCode: d.lisCode })),
          lisCodeOnly: true,
          dockNumber: dockDigits ? Number(dockDigits) : null,
          remittanceReceiverId: selectedReceiver.id,
          remittanceReceiverName: selectedReceiver.fullName,
          remittanceReferredToPicker: referred,
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
        className="bg-white rounded-lg shadow-xl w-full max-w-lg p-4 max-h-[90vh] overflow-y-auto"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-slate-800 mb-1">ثبت کد LIS</h3>
        <p className="text-xs text-slate-500 mb-3">
          اعلام بار #{announcement.announcementCode} — کد LIS هر مقصد، شماره سکو و حواله‌گیر.
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

        <div className="space-y-3 mb-4 border-t border-slate-100 pt-3">
          <label className="block text-xs">
            <span className="font-medium text-slate-700">شماره سکو</span>
            <input
              value={dockNumber}
              onChange={(e) => setDockNumber(e.target.value.replace(/\D/g, ''))}
              inputMode="numeric"
              className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm"
              placeholder="فقط عدد"
            />
          </label>
          <div ref={boxRef} className="relative">
            <label className="block text-xs">
              <span className="font-medium text-slate-700">نام حواله‌گیر *</span>
              <input
                value={receiverQuery}
                onChange={(e) => {
                  setReceiverQuery(e.target.value);
                  setReceiverId('');
                  setSuggestOpen(true);
                }}
                onFocus={() => setSuggestOpen(true)}
                className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm"
                placeholder="کد پرسنلی یا بخشی از نام..."
                autoComplete="off"
              />
            </label>
            {suggestOpen && (
              <div className="absolute z-20 mt-1 w-full max-h-44 overflow-auto bg-white border border-slate-200 rounded-md shadow-lg text-sm">
                {filteredReceivers.length === 0 ? (
                  <div className="px-3 py-2 text-slate-500 text-xs">موردی در فهرست تعریف‌شده نیست.</div>
                ) : (
                  filteredReceivers.map((r) => (
                    <button
                      type="button"
                      key={r.id}
                      className={`w-full text-right px-3 py-1.5 hover:bg-sky-50 ${
                        r.id === receiverId ? 'bg-sky-50 font-medium' : ''
                      }`}
                      onClick={() => pickReceiver(r)}
                    >
                      {receiverLabel(r)}
                    </button>
                  ))
                )}
              </div>
            )}
            {selectedReceiver && (
              <p className="text-[11px] text-emerald-700 mt-1">انتخاب‌شده: {receiverLabel(selectedReceiver)}</p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input type="checkbox" checked={referred} onChange={(e) => setReferred(e.target.checked)} />
            حواله به بارچین ارجاع شده
          </label>
        </div>

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

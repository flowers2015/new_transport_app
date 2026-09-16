import React, { useEffect, useState } from 'react';
import { getApiUrl } from '../utils/apiConfig';

type Receiver = {
  id: string;
  employeeId: string;
  fullName: string;
};

type Props = {
  onClose: () => void;
};

const emptyForm = { employeeId: '', fullName: '' };

const RemittanceReceiverManageDialog: React.FC<Props> = ({ onClose }) => {
  const [rows, setRows] = useState<Receiver[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    const tk = localStorage.getItem('token');
    const r = await fetch(getApiUrl('warehouses/lis-receivers'), {
      headers: { Authorization: 'Bearer ' + tk },
    });
    const data = await r.json().catch(() => []);
    if (!r.ok) throw new Error(data.message || 'خطا در دریافت فهرست');
    setRows(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    load().catch((e) => setErr(e.message || 'خطا'));
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const save = async () => {
    const employeeId = form.employeeId.trim();
    const fullName = form.fullName.trim();
    if (!employeeId) {
      setErr('کد پرسنلی را وارد کنید');
      return;
    }
    if (!fullName) {
      setErr('نام و نام خانوادگی را وارد کنید');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const tk = localStorage.getItem('token');
      const url = editingId
        ? getApiUrl('warehouses/lis-receivers/' + encodeURIComponent(editingId))
        : getApiUrl('warehouses/lis-receivers');
      const r = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk },
        body: JSON.stringify({ employeeId, fullName }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(data.message || 'خطا در ثبت');
        return;
      }
      resetForm();
      await load();
    } catch (e: any) {
      setErr(e.message || 'خطا');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('این حواله‌گیر حذف شود؟')) return;
    setBusy(true);
    setErr('');
    try {
      const tk = localStorage.getItem('token');
      const r = await fetch(getApiUrl('warehouses/lis-receivers/' + encodeURIComponent(id)), {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + tk },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(data.message || 'خطا در حذف');
        return;
      }
      if (editingId === id) resetForm();
      await load();
    } catch (e: any) {
      setErr(e.message || 'خطا');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-slate-800">تعریف حواله‌گیر</h3>
        <p className="text-xs text-slate-500 mt-1 mb-3">
          انباردار لاین پاستوریزه می‌تواند حواله‌گیر را با کد پرسنلی و نام ثبت کند. همین فهرست در ثبت LIS استفاده می‌شود.
        </p>
        {err && <div className="bg-red-50 text-red-700 text-xs px-3 py-2 rounded mb-3">{err}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <label className="text-xs">
            <span className="font-medium text-slate-700">کد پرسنلی</span>
            <input
              value={form.employeeId}
              onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
              className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs">
            <span className="font-medium text-slate-700">نام و نام خانوادگی</span>
            <input
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              className="mt-1 w-full border rounded-md px-2 py-1.5 text-sm"
            />
          </label>
        </div>
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="px-3 py-1.5 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {editingId ? 'ذخیره ویرایش' : 'افزودن'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="px-3 py-1.5 text-sm rounded-md border border-slate-300">
              انصراف از ویرایش
            </button>
          )}
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-2 text-right">کد پرسنلی</th>
                <th className="p-2 text-right">نام و نام خانوادگی</th>
                <th className="p-2 w-28" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="p-3 text-center text-slate-500">
                    هنوز حواله‌گیری ثبت نشده است.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2 font-mono text-xs">{r.employeeId}</td>
                    <td className="p-2">{r.fullName}</td>
                    <td className="p-2 whitespace-nowrap">
                      <button
                        type="button"
                        className="text-sky-700 text-xs ml-2"
                        onClick={() => {
                          setEditingId(r.id);
                          setForm({ employeeId: r.employeeId, fullName: r.fullName });
                        }}
                      >
                        ویرایش
                      </button>
                      <button type="button" className="text-red-600 text-xs" onClick={() => void remove(r.id)}>
                        حذف
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="text-left mt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 border rounded-md text-sm">
            بستن
          </button>
        </div>
      </div>
    </div>
  );
};

export default RemittanceReceiverManageDialog;

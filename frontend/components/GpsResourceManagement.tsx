import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getApiUrl } from '../utils/apiConfig';

type AssetKind = 'tractor' | 'semi_trailer';

interface GpsModel {
  id: string;
  name: string;
  isActive: boolean;
}

interface GpsResource {
  id: string;
  vehicleCode: string;
  plateNumber: string;
  assetKind: AssetKind;
  assetKindLabel: string;
  imei: string;
  simCardNumber: string;
  gpsModelId: string | null;
  gpsModelName: string | null;
  notes: string;
  isActive: boolean;
}

interface VehicleOption {
  id: string;
  vehicleCode: string;
  plateNumber: string;
  vehicleType: string;
}

const emptyForm = {
  vehicleCode: '',
  plateNumber: '',
  assetKind: 'tractor' as AssetKind,
  imei: '',
  simCardNumber: '',
  gpsModelId: '',
  notes: '',
};

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('token')}`,
  'Content-Type': 'application/json',
});

const GpsResourceManagement: React.FC = () => {
  const [enabled, setEnabled] = useState(true);
  const [resources, setResources] = useState<GpsResource[]>([]);
  const [models, setModels] = useState<GpsModel[]>([]);
  const [vehicleOptions, setVehicleOptions] = useState<VehicleOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  const [modelOpen, setModelOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [newModelName, setNewModelName] = useState('');
  const [modelSaving, setModelSaving] = useState(false);
  const [sortKey, setSortKey] = useState<
    'vehicleCode' | 'plateNumber' | 'assetKindLabel' | 'imei' | 'simCardNumber' | 'gpsModelName' | 'isActive'
  >('vehicleCode');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const statusRes = await fetch(getApiUrl('gps-resources/status'), { headers: authHeaders() });
      const status = await statusRes.json().catch(() => ({ enabled: true }));
      if (status.enabled === false) {
        setEnabled(false);
        setResources([]);
        setModels([]);
        return;
      }
      setEnabled(true);

      const [resRes, modelRes, vehRes] = await Promise.all([
        fetch(getApiUrl('gps-resources'), { headers: authHeaders() }),
        fetch(getApiUrl('gps-resources/models'), { headers: authHeaders() }),
        fetch(getApiUrl('gps-resources/vehicle-options'), { headers: authHeaders() }),
      ]);

      if (resRes.status === 503 || modelRes.status === 503) {
        setEnabled(false);
        return;
      }
      if (!resRes.ok) throw new Error((await resRes.json().catch(() => ({}))).message || 'خطا در دریافت منابع');
      if (!modelRes.ok) throw new Error((await modelRes.json().catch(() => ({}))).message || 'خطا در دریافت مدل‌ها');

      const resData = await resRes.json();
      const modelData = await modelRes.json();
      const vehData = vehRes.ok ? await vehRes.json() : [];

      setResources(Array.isArray(resData) ? resData : []);
      setModels(Array.isArray(modelData) ? modelData : []);
      setVehicleOptions(Array.isArray(vehData) ? vehData : []);
    } catch (e: any) {
      setError(e?.message || 'خطا در بارگذاری');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return resources.filter((r) => {
      if (!showInactive && !r.isActive) return false;
      if (!q) return true;
      return (
        r.vehicleCode.toLowerCase().includes(q) ||
        (r.plateNumber || '').toLowerCase().includes(q) ||
        r.imei.includes(q) ||
        (r.simCardNumber || '').includes(q) ||
        (r.gpsModelName || '').toLowerCase().includes(q)
      );
    });
  }, [resources, search, showInactive]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'isActive') {
        return (Number(a.isActive) - Number(b.isActive)) * dir;
      }
      const va = String(a[sortKey] || '');
      const vb = String(b[sortKey] || '');
      return va.localeCompare(vb, 'fa', { numeric: true }) * dir;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const modelStats = useMemo(() => {
    const map = new Map<string, { name: string; active: number; total: number }>();
    for (const r of resources) {
      const name = (r.gpsModelName || '').trim() || 'بدون مدل';
      const row = map.get(name) || { name, active: 0, total: 0 };
      row.total += 1;
      if (r.isActive) row.active += 1;
      map.set(name, row);
    }
    return [...map.values()].sort((a, b) => b.active - a.active || a.name.localeCompare(b.name, 'fa'));
  }, [resources]);

  const toggleSort = (
    key: 'vehicleCode' | 'plateNumber' | 'assetKindLabel' | 'imei' | 'simCardNumber' | 'gpsModelName' | 'isActive'
  ) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  };

  const sortMark = (key: typeof sortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  const activeModels = useMemo(() => models.filter((m) => m.isActive), [models]);

  const openCreate = () => {
    setEditId(null);
    setForm({ ...emptyForm });
    setFormOpen(true);
  };

  const openEdit = (r: GpsResource) => {
    setEditId(r.id);
    setForm({
      vehicleCode: r.vehicleCode,
      plateNumber: r.plateNumber || '',
      assetKind: r.assetKind,
      imei: r.imei,
      simCardNumber: r.simCardNumber || '',
      gpsModelId: r.gpsModelId || '',
      notes: r.notes || '',
    });
    setFormOpen(true);
  };

  const pickVehicle = (code: string) => {
    const v = vehicleOptions.find((o) => o.vehicleCode === code);
    setForm((f) => ({
      ...f,
      vehicleCode: code,
      plateNumber: v?.plateNumber || f.plateNumber,
    }));
  };

  const saveResource = async (e: React.FormEvent) => {
    e.preventDefault();
    const imeiDigits = form.imei.replace(/\D/g, '');
    if (!form.vehicleCode.trim()) {
      alert('کد خودرو الزامی است');
      return;
    }
    if (!imeiDigits) {
      alert('IMEI فقط باید عدد باشد');
      return;
    }
    const simDigits = form.simCardNumber.replace(/\D/g, '');
    if (!simDigits) {
      alert('شماره سیم‌کارت الزامی است');
      return;
    }
    if (simDigits.length < 10 || simDigits.length > 15) {
      alert('شماره سیم‌کارت باید بین ۱۰ تا ۱۵ رقم باشد');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        vehicleCode: form.vehicleCode.trim(),
        plateNumber: form.plateNumber.trim(),
        assetKind: form.assetKind,
        imei: imeiDigits,
        simCardNumber: simDigits,
        gpsModelId: form.gpsModelId || null,
        notes: form.notes.trim(),
      };
      const url = editId ? getApiUrl(`gps-resources/${editId}`) : getApiUrl('gps-resources');
      const res = await fetch(url, {
        method: editId ? 'PUT' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'خطا در ذخیره');
      setFormOpen(false);
      await loadAll();
    } catch (err: any) {
      alert(err?.message || 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (r: GpsResource) => {
    if (!confirm(`منبع GPS کد ${r.vehicleCode} غیرفعال شود؟`)) return;
    try {
      const res = await fetch(getApiUrl(`gps-resources/${r.id}`), {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'خطا');
      }
      await loadAll();
    } catch (err: any) {
      alert(err?.message || 'خطا در غیرفعال‌سازی');
    }
  };

  const reactivate = async (r: GpsResource) => {
    try {
      const res = await fetch(getApiUrl(`gps-resources/${r.id}`), {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ isActive: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'خطا');
      }
      await loadAll();
    } catch (err: any) {
      alert(err?.message || 'خطا');
    }
  };

  const addModel = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newModelName.trim();
    if (!name) return;
    setModelSaving(true);
    try {
      const res = await fetch(getApiUrl('gps-resources/models'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ name }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || 'خطا در ثبت مدل');
      setNewModelName('');
      await loadAll();
    } catch (err: any) {
      alert(err?.message || 'خطا');
    } finally {
      setModelSaving(false);
    }
  };

  const toggleModel = async (m: GpsModel) => {
    try {
      const res = await fetch(getApiUrl(`gps-resources/models/${m.id}`), {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({ isActive: !m.isActive }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'خطا');
      }
      await loadAll();
    } catch (err: any) {
      alert(err?.message || 'خطا');
    }
  };

  if (!enabled) {
    return (
      <div className="bg-white rounded-xl shadow p-6 max-w-3xl mx-auto">
        <h2 className="text-xl font-bold text-slate-800 mb-2">مدیریت منابع GPS</h2>
        <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
          این بخش با <code className="font-mono">GPS_ADMIN_ENABLED=false</code> غیرفعال شده است.
          برای فعال‌سازی دوباره در <code className="font-mono">backend/.env</code> مقدار را{' '}
          <code className="font-mono">true</code> کنید و بک‌اند را ری‌استارت کنید.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div className="bg-white rounded-xl shadow p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">مدیریت منابع GPS</h2>
            <p className="text-xs text-slate-500 mt-1">
              جدا از مدیریت منابع — فقط نگاشت کد خودرو / پلاک / IMEI. برای خاموش کردن سریع:{' '}
              <code className="font-mono bg-slate-100 px-1 rounded">GPS_ADMIN_ENABLED=false</code>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setModelOpen(true)}
              className="px-3 py-2 text-sm rounded-md border border-slate-300 hover:bg-slate-50"
            >
              تعریف مدل GPS
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="px-3 py-2 text-sm rounded-md bg-sky-600 text-white hover:bg-sky-700"
            >
              + ثبت IMEI
            </button>
            <button
              type="button"
              onClick={() => setStatsOpen(true)}
              className="px-3 py-2 text-sm rounded-md border border-slate-300 hover:bg-slate-50"
            >
              آمار
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو: کد، پلاک، IMEI، سیم‌کارت، مدل..."
            className="flex-1 min-w-[200px] border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <label className="text-sm text-slate-600 flex items-center gap-2">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            نمایش غیرفعال‌ها
          </label>
          <button
            type="button"
            onClick={loadAll}
            className="px-3 py-2 text-sm rounded-md bg-slate-100 hover:bg-slate-200"
          >
            به‌روزرسانی
          </button>
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        {loading ? (
          <p className="text-slate-500 text-sm">در حال بارگذاری...</p>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="p-2 text-right font-semibold">
                    <button type="button" className="hover:text-sky-700" onClick={() => toggleSort('vehicleCode')}>
                      کد خودرو{sortMark('vehicleCode')}
                    </button>
                  </th>
                  <th className="p-2 text-right font-semibold">
                    <button type="button" className="hover:text-sky-700" onClick={() => toggleSort('plateNumber')}>
                      پلاک{sortMark('plateNumber')}
                    </button>
                  </th>
                  <th className="p-2 text-right font-semibold">
                    <button type="button" className="hover:text-sky-700" onClick={() => toggleSort('assetKindLabel')}>
                      نوع{sortMark('assetKindLabel')}
                    </button>
                  </th>
                  <th className="p-2 text-right font-semibold">
                    <button type="button" className="hover:text-sky-700" onClick={() => toggleSort('imei')}>
                      IMEI{sortMark('imei')}
                    </button>
                  </th>
                  <th className="p-2 text-right font-semibold">
                    <button type="button" className="hover:text-sky-700" onClick={() => toggleSort('simCardNumber')}>
                      سیم‌کارت{sortMark('simCardNumber')}
                    </button>
                  </th>
                  <th className="p-2 text-right font-semibold">
                    <button type="button" className="hover:text-sky-700" onClick={() => toggleSort('gpsModelName')}>
                      مدل GPS{sortMark('gpsModelName')}
                    </button>
                  </th>
                  <th className="p-2 text-right font-semibold">
                    <button type="button" className="hover:text-sky-700" onClick={() => toggleSort('isActive')}>
                      وضعیت{sortMark('isActive')}
                    </button>
                  </th>
                  <th className="p-2 text-center font-semibold">عملیات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-slate-500">
                      موردی ثبت نشده است.
                    </td>
                  </tr>
                ) : (
                  sorted.map((r) => (
                    <tr key={r.id} className={`border-t ${r.isActive ? '' : 'bg-slate-50 text-slate-400'}`}>
                      <td className="p-2 font-medium">{r.vehicleCode}</td>
                      <td className="p-2 font-mono text-xs">{r.plateNumber || '—'}</td>
                      <td className="p-2">{r.assetKindLabel}</td>
                      <td className="p-2 font-mono text-xs">{r.imei}</td>
                      <td className="p-2 font-mono text-xs">{r.simCardNumber || '—'}</td>
                      <td className="p-2">{r.gpsModelName || '—'}</td>
                      <td className="p-2">{r.isActive ? 'فعال' : 'غیرفعال'}</td>
                      <td className="p-2 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEdit(r)}
                          className="px-2 py-1 text-xs rounded bg-slate-600 text-white hover:bg-slate-700 ml-1"
                        >
                          ویرایش
                        </button>
                        {r.isActive ? (
                          <button
                            type="button"
                            onClick={() => deactivate(r)}
                            className="px-2 py-1 text-xs rounded bg-red-50 text-red-700 hover:bg-red-100"
                          >
                            غیرفعال
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => reactivate(r)}
                            className="px-2 py-1 text-xs rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          >
                            فعال‌سازی
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setFormOpen(false)}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold">{editId ? 'ویرایش منبع GPS' : 'ثبت IMEI جدید'}</h3>
            <form onSubmit={saveResource} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">کد خودرو *</label>
                <input
                  list="gps-vehicle-codes"
                  value={form.vehicleCode}
                  onChange={(e) => pickVehicle(e.target.value)}
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                  required
                />
                <datalist id="gps-vehicle-codes">
                  {vehicleOptions.map((v) => (
                    <option key={v.id} value={v.vehicleCode}>
                      {v.plateNumber} {v.vehicleType}
                    </option>
                  ))}
                </datalist>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">پلاک</label>
                <input
                  value={form.plateNumber}
                  onChange={(e) => setForm((f) => ({ ...f, plateNumber: e.target.value }))}
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">نوع متحرک *</label>
                <select
                  value={form.assetKind}
                  onChange={(e) => setForm((f) => ({ ...f, assetKind: e.target.value as AssetKind }))}
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                >
                  <option value="tractor">کشنده / خودرو سنگین</option>
                  <option value="semi_trailer">نیمه یدک</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  برای کد ۱۸۲ می‌توانید دو ردیف جدا (کشنده + نیمه یدک) با IMEI جدا ثبت کنید.
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">IMEI * (فقط عدد)</label>
                <input
                  value={form.imei}
                  onChange={(e) => setForm((f) => ({ ...f, imei: e.target.value.replace(/\D/g, '') }))}
                  inputMode="numeric"
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm font-mono"
                  required
                  minLength={8}
                  maxLength={20}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">شماره سیم‌کارت *</label>
                <input
                  value={form.simCardNumber}
                  onChange={(e) => setForm((f) => ({ ...f, simCardNumber: e.target.value.replace(/\D/g, '') }))}
                  inputMode="numeric"
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm font-mono"
                  required
                  minLength={10}
                  maxLength={15}
                  placeholder="مثلاً 09121234567"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">مدل GPS</label>
                <select
                  value={form.gpsModelId}
                  onChange={(e) => setForm((f) => ({ ...f, gpsModelId: e.target.value }))}
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                >
                  <option value="">— انتخاب مدل —</option>
                  {activeModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">یادداشت</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 border rounded-md text-sm">
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm disabled:opacity-50"
                >
                  {saving ? 'در حال ذخیره...' : 'ذخیره'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modelOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setModelOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">تعریف مدل GPS</h3>
            <form onSubmit={addModel} className="flex gap-2">
              <input
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                placeholder="نام مدل جدید"
                className="flex-1 border rounded-md px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={modelSaving}
                className="px-3 py-2 bg-sky-600 text-white rounded-md text-sm disabled:opacity-50"
              >
                افزودن
              </button>
            </form>
            <ul className="max-h-64 overflow-y-auto divide-y border rounded-md">
              {models.map((m) => (
                <li key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className={m.isActive ? '' : 'text-slate-400 line-through'}>{m.name}</span>
                  <button
                    type="button"
                    onClick={() => toggleModel(m)}
                    className="text-xs px-2 py-1 rounded border hover:bg-slate-50"
                  >
                    {m.isActive ? 'غیرفعال' : 'فعال'}
                  </button>
                </li>
              ))}
            </ul>
            <div className="text-left">
              <button type="button" onClick={() => setModelOpen(false)} className="px-4 py-2 border rounded-md text-sm">
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {statsOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setStatsOpen(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold">آمار مدل‌های GPS</h3>
            <p className="text-xs text-slate-500">تعداد دستگاه ثبت‌شده از هر نوع</p>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-2 text-right">مدل</th>
                    <th className="p-2 text-center">فعال</th>
                    <th className="p-2 text-center">کل</th>
                  </tr>
                </thead>
                <tbody>
                  {modelStats.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="p-3 text-center text-slate-500">
                        موردی ثبت نشده است.
                      </td>
                    </tr>
                  ) : (
                    modelStats.map((row) => (
                      <tr key={row.name} className="border-t">
                        <td className="p-2">{row.name}</td>
                        <td className="p-2 text-center font-medium">{row.active.toLocaleString('fa-IR')}</td>
                        <td className="p-2 text-center">{row.total.toLocaleString('fa-IR')}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="text-left">
              <button type="button" onClick={() => setStatsOpen(false)} className="px-4 py-2 border rounded-md text-sm">
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GpsResourceManagement;

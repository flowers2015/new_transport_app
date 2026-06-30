import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { User, UserRole } from '../types';
import { getApiUrl } from '../utils/apiConfig';

interface CarrierManagementProps {
  currentUser: User;
}

interface CarrierRecord {
  id: string;
  name: string;
  contact: string;
  notes: string;
  active: boolean;
  enabledLines: string[];
  hasLoginUser?: boolean;
  userCount?: number;
  usernames?: string;
}

interface CarrierUserRecord {
  id: string;
  username: string;
  full_name: string;
}

const CarrierManagement: React.FC<CarrierManagementProps> = ({ currentUser }) => {
  const isAdmin = currentUser.role === UserRole.Admin;
  const isPersonal = currentUser.role === UserRole.Transportation_Personal_Vehicle_User;

  const [carriers, setCarriers] = useState<CarrierRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CarrierRecord | null>(null);
  const [form, setForm] = useState({ name: '', contact: '', notes: '' });
  const [userDialog, setUserDialog] = useState<CarrierRecord | null>(null);
  const [carrierUsers, setCarrierUsers] = useState<CarrierUserRecord[]>([]);
  const [userForm, setUserForm] = useState({ username: '', password: '', fullName: '' });

  const headers = useMemo(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
    }),
    []
  );

  const loadCarriers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl('carriers?activeOnly=false'), { headers });
      if (!res.ok) throw new Error('خطا در دریافت باربری‌ها');
      const data = await res.json();
      setCarriers(data.carriers || []);
    } catch (e: any) {
      setError(e?.message || 'خطا');
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => {
    loadCarriers();
  }, [loadCarriers]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return carriers;
    return carriers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.contact || '').toLowerCase().includes(q)
    );
  }, [carriers, searchTerm]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', contact: '', notes: '' });
    setShowForm(true);
  };

  const openEdit = (c: CarrierRecord) => {
    setEditing(c);
    setForm({ name: c.name, contact: c.contact || '', notes: c.notes || '' });
    setShowForm(true);
  };

  const saveCarrier = async () => {
    if (!form.name.trim()) {
      alert('نام باربری الزامی است.');
      return;
    }
    try {
      const url = editing
        ? getApiUrl(`carriers/${editing.id}`)
        : getApiUrl('carriers');
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers,
        body: JSON.stringify({
          name: form.name.trim(),
          contact: form.contact.trim() || null,
          notes: form.notes.trim() || null,
          enabledLines: ['Ambient'],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'خطا در ذخیره');
      }
      setShowForm(false);
      await loadCarriers();
    } catch (e: any) {
      alert(e?.message || 'خطا در ذخیره باربری');
    }
  };

  const toggleActive = async (c: CarrierRecord) => {
    if (!isAdmin) return;
    if (!window.confirm(`باربری «${c.name}» ${c.active ? 'غیرفعال' : 'فعال'} شود؟`)) return;
    try {
      const res = await fetch(getApiUrl(`carriers/${c.id}`), {
        method: 'PUT',
        headers,
        body: JSON.stringify({ active: !c.active }),
      });
      if (!res.ok) throw new Error('خطا');
      await loadCarriers();
    } catch (e: any) {
      alert(e?.message || 'خطا');
    }
  };

  const openUserDialog = async (c: CarrierRecord) => {
    setUserDialog(c);
    setUserForm({ username: '', password: '', fullName: c.name });
    try {
      const res = await fetch(getApiUrl(`carriers/${c.id}/users`), { headers });
      if (res.ok) {
        const data = await res.json();
        setCarrierUsers(data.users || []);
      } else {
        setCarrierUsers([]);
      }
    } catch {
      setCarrierUsers([]);
    }
  };

  const createUser = async () => {
    if (!userDialog) return;
    if (!userForm.username || !userForm.password) {
      alert('نام کاربری و رمز عبور الزامی است.');
      return;
    }
    try {
      const res = await fetch(getApiUrl(`carriers/${userDialog.id}/users`), {
        method: 'POST',
        headers,
        body: JSON.stringify(userForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'خطا');
      }
      alert('کاربر باربری ایجاد شد.');
      setUserForm({ username: '', password: '', fullName: userDialog.name });
      await openUserDialog(userDialog);
      await loadCarriers();
    } catch (e: any) {
      alert(e?.message || 'خطا در ایجاد کاربر');
    }
  };

  const resetCarrierUserPassword = async (u: CarrierUserRecord) => {
    if (!userDialog) return;
    const password = window.prompt(`رمز عبور جدید برای «${u.username}»:`);
    if (!password?.trim()) return;
    if (password.trim().length < 4) {
      alert('رمز عبور باید حداقل ۴ کاراکتر باشد.');
      return;
    }
    try {
      const res = await fetch(getApiUrl(`carriers/${userDialog.id}/users/${u.id}/password`), {
        method: 'PUT',
        headers,
        body: JSON.stringify({ password: password.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'خطا در تغییر رمز');
      alert(data.message || 'رمز عبور به‌روزرسانی شد.');
    } catch (e: any) {
      alert(e?.message || 'خطا در تغییر رمز');
    }
  };

  const deleteCarrierUser = async (u: CarrierUserRecord) => {
    if (!userDialog) return;
    if (!window.confirm(`کاربر ورود «${u.username}» حذف شود؟`)) return;
    try {
      const res = await fetch(getApiUrl(`carriers/${userDialog.id}/users/${u.id}`), {
        method: 'DELETE',
        headers,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'خطا در حذف');
      alert(data.message || 'کاربر حذف شد.');
      await openUserDialog(userDialog);
      await loadCarriers();
    } catch (e: any) {
      alert(e?.message || 'خطا در حذف کاربر');
    }
  };

  if (!isAdmin && !isPersonal) {
    return <div className="p-8 text-center text-red-600">دسترسی غیرمجاز</div>;
  }

  return (
    <div className="p-4 max-w-6xl mx-auto" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-xl font-bold text-slate-800">تعریف باربری</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm hover:bg-sky-700"
        >
          باربری جدید
        </button>
      </div>

      <p className="text-sm text-slate-600 mb-4">
        {isAdmin
          ? 'مدیریت پروفایل باربری‌ها و ساخت کاربر ورود برای هر باربری.'
          : 'ثبت و ویرایش پروفایل باربری برای ارجاع بار در لبنیات-فروتلند. ساخت کاربر ورود فقط توسط ادمین انجام می‌شود.'}
      </p>

      <input
        type="text"
        placeholder="جستجو نام یا تماس..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full max-w-md mb-4 px-3 py-2 border border-slate-300 rounded-lg text-sm"
      />

      {loading && <div className="text-center py-8">در حال بارگذاری...</div>}
      {error && <div className="text-red-600 mb-4">{error}</div>}

      {!loading && (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3 text-right">نام</th>
                <th className="p-3 text-right">تماس</th>
                <th className="p-3 text-right">کاربران ورود</th>
                <th className="p-3 text-center">ورود</th>
                {isAdmin && <th className="p-3 text-center">وضعیت</th>}
                <th className="p-3 text-center">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="p-6 text-center text-slate-500">
                    باربری ثبت نشده است.
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="p-3 font-medium">{c.name}</td>
                    <td className="p-3">{c.contact || '—'}</td>
                    <td className="p-3 text-xs text-slate-700">
                      {c.usernames ? c.usernames : '—'}
                      {c.userCount != null && c.userCount > 0 && (
                        <span className="text-slate-400 mr-1">({c.userCount.toLocaleString('fa-IR')})</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {c.hasLoginUser ? (
                        <span className="text-green-700 text-xs bg-green-50 px-2 py-1 rounded">فعال</span>
                      ) : (
                        <span className="text-amber-700 text-xs bg-amber-50 px-2 py-1 rounded">بدون کاربر</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="p-3 text-center">
                        <button
                          onClick={() => toggleActive(c)}
                          className={`text-xs px-2 py-1 rounded ${
                            c.active ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {c.active ? 'فعال' : 'غیرفعال'}
                        </button>
                      </td>
                    )}
                    <td className="p-3 text-center">
                      <div className="flex gap-2 justify-center flex-wrap">
                        <button
                          onClick={() => openEdit(c)}
                          className="px-2 py-1 bg-slate-600 text-white rounded text-xs"
                        >
                          ویرایش
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => openUserDialog(c)}
                            className="px-2 py-1 bg-purple-600 text-white rounded text-xs"
                          >
                            کاربر ورود
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <h2 className="text-lg font-bold mb-4">{editing ? 'ویرایش باربری' : 'باربری جدید'}</h2>
            <label className="block text-sm mb-1">نام *</label>
            <input
              className="w-full border rounded-lg px-3 py-2 mb-3 text-sm"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <label className="block text-sm mb-1">تماس</label>
            <input
              className="w-full border rounded-lg px-3 py-2 mb-3 text-sm"
              value={form.contact}
              onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
            />
            <label className="block text-sm mb-1">یادداشت</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 mb-4 text-sm"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-slate-200 rounded-lg text-sm">
                انصراف
              </button>
              <button onClick={saveCarrier} className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm">
                ذخیره
              </button>
            </div>
          </div>
        </div>
      )}

      {userDialog && isAdmin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5">
            <h2 className="text-lg font-bold mb-2">کاربر ورود — {userDialog.name}</h2>
            <p className="text-xs text-slate-500 mb-3">می‌توانید چند کاربر ورود برای یک باربری تعریف کنید.</p>
            {carrierUsers.length > 0 ? (
              <div className="mb-4 border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="p-2 text-right">نام کاربری</th>
                      <th className="p-2 text-right">نام نمایشی</th>
                      <th className="p-2 text-center">عملیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carrierUsers.map((u) => (
                      <tr key={u.id} className="border-t">
                        <td className="p-2 font-mono">{u.username}</td>
                        <td className="p-2">{u.full_name || '—'}</td>
                        <td className="p-2">
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            <button
                              type="button"
                              onClick={() => resetCarrierUserPassword(u)}
                              className="px-2 py-1 text-xs bg-amber-100 text-amber-800 rounded hover:bg-amber-200"
                            >
                              ریست رمز
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteCarrierUser(u)}
                              className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                            >
                              حذف
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-amber-700 mb-4">هنوز کاربر ورودی ثبت نشده است.</p>
            )}
            <p className="text-sm font-semibold mb-2">افزودن کاربر جدید</p>
            <label className="block text-sm mb-1">نام کاربری *</label>
            <input
              className="w-full border rounded-lg px-3 py-2 mb-3 text-sm"
              value={userForm.username}
              onChange={(e) => setUserForm((f) => ({ ...f, username: e.target.value }))}
            />
            <label className="block text-sm mb-1">رمز عبور *</label>
            <input
              type="password"
              className="w-full border rounded-lg px-3 py-2 mb-3 text-sm"
              value={userForm.password}
              onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))}
            />
            <label className="block text-sm mb-1">نام نمایشی</label>
            <input
              className="w-full border rounded-lg px-3 py-2 mb-4 text-sm"
              value={userForm.fullName}
              onChange={(e) => setUserForm((f) => ({ ...f, fullName: e.target.value }))}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setUserDialog(null)} className="px-4 py-2 bg-slate-200 rounded-lg text-sm">
                بستن
              </button>
              <button onClick={createUser} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm">
                ایجاد کاربر
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CarrierManagement;

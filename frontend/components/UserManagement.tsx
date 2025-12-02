import React, { useState, useEffect, useMemo } from 'react';
import { User } from '../types';
import { getApiUrl } from '../utils/apiConfig';
import { formatJalaliDateTime } from '../utils/jalali';

interface UserManagementProps {
  currentUser: User;
}

interface UserData {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: string;
  branchId: string | null;
  branchName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Branch {
  id: string;
  name: string;
  location: string;
}

interface AdminAction {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  actionType: 'create' | 'update' | 'delete' | 'activate' | 'deactivate';
  tableName: string;
  recordId: string;
  oldValue: any;
  newValue: any;
  reason: string;
  ipAddress: string;
  createdAt: string;
}

const UserManagement: React.FC<UserManagementProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<UserData[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [auditActions, setAuditActions] = useState<AdminAction[]>([]);

  // Form states
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    fullName: '',
    password: '',
    role: '',
    branchId: ''
  });
  const [editReason, setEditReason] = useState('');
  const [deleteReason, setDeleteReason] = useState('');

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
  }), []);

  // نقش‌های موجود
  const roles = [
    { value: 'admin', label: 'مدیر سیستم' },
    { value: 'planner', label: 'کارمند برنامه‌ریزی' },
    { value: 'planner_manager', label: 'مدیر برنامه‌ریزی' },
    { value: 'transport_user', label: 'کاربر ترابری (شرکت)' },
    { value: 'personal_transport_user', label: 'کاربر ترابری (خودرو شخصی)' },
    { value: 'finance', label: 'مالی شعب' },
    { value: 'central_finance', label: 'مالی مرکزی' },
    { value: 'transport_finance', label: 'مالی ترابری' },
    { value: 'workshop', label: 'تعمیرگاه' },
    { value: 'transport', label: 'ترابری (مدیریت ناوگان)' },
    { value: 'warehouse', label: 'انبار' },
    { value: 'merchant', label: 'بازرگان (تدارکات)' },
    { value: 'docs', label: 'کارشناس مدارک خودرو' },
    { value: 'accident', label: 'کارشناس تصادفات' },
    { value: 'allocation', label: 'کارشناس تغییر و تحول' },
    { value: 'insurance', label: 'کارشناس بیمه' }
  ];

  // دریافت لیست کاربران
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20'
      });
      if (searchTerm) params.append('search', searchTerm);
      if (roleFilter) params.append('role', roleFilter);
      if (branchFilter) params.append('branch_id', branchFilter);

      const res = await fetch(getApiUrl(`admin/users?${params}`), { headers });
      if (!res.ok) throw new Error('خطا در دریافت لیست کاربران');
      const data = await res.json();
      setUsers(data.users);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // دریافت لیست شعب
  const fetchBranches = async () => {
    try {
      const res = await fetch(getApiUrl('branches'), { headers });
      if (!res.ok) throw new Error('خطا در دریافت لیست شعب');
      const data = await res.json();
      setBranches(data);
    } catch (err) {
      console.error('خطا در دریافت شعب:', err);
    }
  };

  // دریافت لاگ تغییرات
  const fetchAuditActions = async (userId?: string) => {
    try {
      const params = new URLSearchParams({ page: '1', limit: '50' });
      if (userId) params.append('userId', userId);

      const res = await fetch(getApiUrl(`admin/admin-actions?${params}`), { headers });
      if (!res.ok) throw new Error('خطا در دریافت لاگ تغییرات');
      const data = await res.json();
      setAuditActions(data.actions);
    } catch (err: any) {
      console.error('خطا در دریافت لاگ:', err);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchBranches();
  }, [page, searchTerm, roleFilter, branchFilter]);

  // ایجاد کاربر جدید
  const handleCreateUser = async () => {
    try {
      if (!formData.username || !formData.password || !formData.role) {
        alert('لطفاً فیلدهای الزامی (نام کاربری، رمز عبور و نقش) را پر کنید');
        return;
      }

      const res = await fetch(getApiUrl('admin/users'), {
        method: 'POST',
        headers,
        body: JSON.stringify(formData)
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'خطا در ایجاد کاربر');
      }

      alert('کاربر با موفقیت ایجاد شد');
      setShowAddDialog(false);
      setFormData({ username: '', email: '', fullName: '', password: '', role: '', branchId: '' });
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // ویرایش کاربر
  const handleUpdateUser = async () => {
    try {
      if (!editReason) {
        alert('لطفاً دلیل تغییر را وارد کنید');
        return;
      }

      if (!selectedUser) return;

      const updateData: any = { reason: editReason };
      if (formData.email) updateData.email = formData.email;
      if (formData.fullName !== undefined) updateData.fullName = formData.fullName;
      if (formData.role) updateData.role = formData.role;
      if (formData.branchId !== undefined) updateData.branchId = formData.branchId;
      if (formData.password) updateData.password = formData.password;

      const res = await fetch(getApiUrl(`admin/users/${selectedUser.id}`), {
        method: 'PUT',
        headers,
        body: JSON.stringify(updateData)
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'خطا در به‌روزرسانی کاربر');
      }

      alert('کاربر با موفقیت به‌روزرسانی شد');
      setShowEditDialog(false);
      setSelectedUser(null);
      setEditReason('');
      setFormData({ username: '', email: '', fullName: '', password: '', role: '', branchId: '' });
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // حذف کاربر
  const handleDeleteUser = async () => {
    try {
      if (!deleteReason) {
        alert('لطفاً دلیل حذف را وارد کنید');
        return;
      }

      if (!selectedUser) return;

      const res = await fetch(getApiUrl(`admin/users/${selectedUser.id}`), {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ reason: deleteReason })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'خطا در حذف کاربر');
      }

      alert('کاربر با موفقیت حذف شد');
      setShowDeleteDialog(false);
      setSelectedUser(null);
      setDeleteReason('');
      fetchUsers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // باز کردن دیالوگ ویرایش
  const openEditDialog = (user: UserData) => {
    setSelectedUser(user);
    setFormData({
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      password: '',
      role: user.role,
      branchId: user.branchId || ''
    });
    setShowEditDialog(true);
  };

  // باز کردن دیالوگ حذف
  const openDeleteDialog = (user: UserData) => {
    setSelectedUser(user);
    setShowDeleteDialog(true);
  };

  // باز کردن لاگ تغییرات
  const openAuditTrail = (user?: UserData) => {
    fetchAuditActions(user?.id);
    setShowAuditTrail(true);
  };

  if (loading && users.length === 0) {
    return <div className="p-4">در حال بارگذاری...</div>;
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-2xl font-bold">مدیریت کاربران</h1>
        <div className="flex gap-2">
          <button
            onClick={() => openAuditTrail()}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            مشاهده لاگ تغییرات
          </button>
          <button
            onClick={() => setShowAddDialog(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            افزودن کاربر جدید
          </button>
        </div>
      </div>

      {/* فیلترها */}
      <div className="mb-4 flex gap-4">
        <input
          type="text"
          placeholder="جستجو (نام کاربری، ایمیل، نام)"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-4 py-2 border rounded flex-1"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="px-4 py-2 border rounded"
        >
          <option value="">همه نقش‌ها</option>
          {roles.map(role => (
            <option key={role.value} value={role.value}>{role.label}</option>
          ))}
        </select>
        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          className="px-4 py-2 border rounded"
        >
          <option value="">همه شعب</option>
          {branches.map(branch => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </select>
      </div>

      {/* جدول کاربران */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">نام کاربری</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">ایمیل</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">نام کامل</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">نقش</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">شعبه</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">تاریخ ایجاد</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">عملیات</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map(user => (
              <tr key={user.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.username}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.email}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.fullName || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {roles.find(r => r.value === user.role)?.label || user.role}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.branchName || '-'}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatJalaliDateTime(user.createdAt)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditDialog(user)}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      ویرایش
                    </button>
                    <button
                      onClick={() => openDeleteDialog(user)}
                      className="text-red-600 hover:text-red-900"
                    >
                      حذف
                    </button>
                    <button
                      onClick={() => openAuditTrail(user)}
                      className="text-gray-600 hover:text-gray-900"
                    >
                      لاگ
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* صفحه‌بندی */}
      <div className="mt-4 flex justify-between items-center">
        <div className="text-sm text-gray-700">
          نمایش {((page - 1) * 20) + 1} تا {Math.min(page * 20, total)} از {total} کاربر
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 border rounded disabled:opacity-50"
          >
            قبلی
          </button>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page * 20 >= total}
            className="px-4 py-2 border rounded disabled:opacity-50"
          >
            بعدی
          </button>
        </div>
      </div>

      {/* دیالوگ افزودن کاربر */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">افزودن کاربر جدید</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">نام کاربری *</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="مثلاً: admin, planner, transport_user"
                />
                <p className="text-xs text-gray-500 mt-1">نام کاربری برای ورود به سیستم استفاده می‌شود</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">نام کامل</label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="مثلاً: علی احمدی، محمد رضایی"
                />
                <p className="text-xs text-gray-500 mt-1">نام و نام خانوادگی کاربر (اختیاری)</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ایمیل (اختیاری)</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="مثلاً: user@example.com"
                />
                <p className="text-xs text-gray-500 mt-1">ایمیل کاربر (اختیاری - برای اطلاع‌رسانی)</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">رمز عبور *</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">نقش *</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="">انتخاب نقش</option>
                  {roles.map(role => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">شعبه</label>
                <select
                  value={formData.branchId}
                  onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="">بدون شعبه</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowAddDialog(false);
                  setFormData({ username: '', email: '', fullName: '', password: '', role: '', branchId: '' });
                }}
                className="px-4 py-2 border rounded"
              >
                انصراف
              </button>
              <button
                onClick={handleCreateUser}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                ایجاد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* دیالوگ ویرایش کاربر */}
      {showEditDialog && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">ویرایش کاربر: {selectedUser.username}</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">نام کامل</label>
                <input
                  type="text"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="مثلاً: علی احمدی، محمد رضایی"
                />
                <p className="text-xs text-gray-500 mt-1">نام و نام خانوادگی کاربر (اختیاری)</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">ایمیل (اختیاری)</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="مثلاً: user@example.com"
                />
                <p className="text-xs text-gray-500 mt-1">ایمیل کاربر (اختیاری - برای اطلاع‌رسانی)</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">رمز عبور جدید (اختیاری)</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="در صورت خالی بودن تغییر نمی‌کند"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">نقش</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                >
                  {roles.map(role => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">شعبه</label>
                <select
                  value={formData.branchId}
                  onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="">بدون شعبه</option>
                  {branches.map(branch => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">دلیل تغییر *</label>
                <textarea
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  rows={3}
                  placeholder="لطفاً دلیل تغییر را وارد کنید"
                />
              </div>
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowEditDialog(false);
                  setSelectedUser(null);
                  setEditReason('');
                }}
                className="px-4 py-2 border rounded"
              >
                انصراف
              </button>
              <button
                onClick={handleUpdateUser}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                ذخیره
              </button>
            </div>
          </div>
        </div>
      )}

      {/* دیالوگ حذف کاربر */}
      {showDeleteDialog && selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4 text-red-600">حذف کاربر</h2>
            <p className="mb-4">آیا از حذف کاربر <strong>{selectedUser.username}</strong> مطمئن هستید؟</p>
            <div>
              <label className="block text-sm font-medium mb-1">دلیل حذف *</label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="w-full px-3 py-2 border rounded"
                rows={3}
                placeholder="لطفاً دلیل حذف را وارد کنید"
              />
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowDeleteDialog(false);
                  setSelectedUser(null);
                  setDeleteReason('');
                }}
                className="px-4 py-2 border rounded"
              >
                انصراف
              </button>
              <button
                onClick={handleDeleteUser}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                حذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* دیالوگ لاگ تغییرات */}
      {showAuditTrail && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[80vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">لاگ تغییرات</h2>
              <button
                onClick={() => setShowAuditTrail(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-right text-xs font-medium">کاربر</th>
                    <th className="px-4 py-2 text-right text-xs font-medium">نوع عملیات</th>
                    <th className="px-4 py-2 text-right text-xs font-medium">جدول</th>
                    <th className="px-4 py-2 text-right text-xs font-medium">دلیل</th>
                    <th className="px-4 py-2 text-right text-xs font-medium">تاریخ</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {auditActions.map(action => (
                    <tr key={action.id}>
                      <td className="px-4 py-2 text-sm">{action.userName} ({action.userRole})</td>
                      <td className="px-4 py-2 text-sm">
                        <span className={`px-2 py-1 rounded text-xs ${
                          action.actionType === 'create' ? 'bg-green-100 text-green-800' :
                          action.actionType === 'update' ? 'bg-blue-100 text-blue-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {action.actionType === 'create' ? 'ایجاد' :
                           action.actionType === 'update' ? 'ویرایش' : 'حذف'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm">{action.tableName}</td>
                      <td className="px-4 py-2 text-sm">{action.reason}</td>
                      <td className="px-4 py-2 text-sm">{formatJalaliDateTime(action.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}
    </div>
  );
};

export default UserManagement;


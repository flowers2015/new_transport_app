import React, { useState, useEffect, useMemo } from 'react';
import { getApiUrl } from '../utils/apiConfig';
import { User, FreightLineType } from '../types';

interface TransportUser {
  id: string;
  username: string;
  full_name: string;
  role: string;
  employee_id?: string;
  transport_type?: 'company' | 'personal' | 'other';
}

interface FinalizePermission {
  id: string;
  user_id: string;
  username: string;
  full_name: string;
  line_type: string;
  created_at: string;
  updated_at: string;
  role?: string;
}

interface FinalizePermissionManagementProps {
  currentUser: User;
}

const FinalizePermissionManagement: React.FC<FinalizePermissionManagementProps> = ({ currentUser }) => {
  const [transportUsers, setTransportUsers] = useState<TransportUser[]>([]);
  const [permissions, setPermissions] = useState<FinalizePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLineType, setSelectedLineType] = useState<FreightLineType>(FreightLineType.IceCream);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [transportTypeFilter, setTransportTypeFilter] = useState<'all' | 'company' | 'personal'>('all');

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
  }), []);

  const lineTypes = [
    { value: FreightLineType.IceCream, label: 'بستنی' },
    { value: FreightLineType.Dairy, label: 'پاستوریزه' },
    { value: FreightLineType.Ambient, label: 'لبنیات-فروتلند' },
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersRes, permissionsRes] = await Promise.all([
        fetch(getApiUrl('finalize-permissions/transport-users'), { headers }),
        fetch(getApiUrl('finalize-permissions/permissions'), { headers }),
      ]);

      if (!usersRes.ok || !permissionsRes.ok) {
        throw new Error('خطا در دریافت اطلاعات');
      }

      const [usersData, permissionsData] = await Promise.all([
        usersRes.json(),
        permissionsRes.json(),
      ]);

      setTransportUsers(usersData);
      setPermissions(permissionsData);
    } catch (err: any) {
      setError(err.message || 'خطا در دریافت اطلاعات');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPermission = async () => {
    if (!selectedUser) {
      alert('لطفاً کاربر را انتخاب کنید');
      return;
    }

    const user = transportUsers.find(u => u.id === selectedUser);
    if (!user) {
      alert('کاربر یافت نشد');
      return;
    }

    try {
      const response = await fetch(getApiUrl('finalize-permissions/permissions'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          userId: selectedUser,
          username: user.username,
          fullName: user.full_name,
          lineType: selectedLineType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'خطا در افزودن دسترسی');
      }

      alert('دسترسی با موفقیت اضافه شد');
      setSelectedUser('');
      fetchData();
    } catch (err: any) {
      alert(err.message || 'خطا در افزودن دسترسی');
    }
  };

  const handleDeletePermission = async (id: string) => {
    if (!confirm('آیا از حذف این دسترسی اطمینان دارید؟')) return;

    try {
      const response = await fetch(getApiUrl(`finalize-permissions/permissions/${id}`), {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        throw new Error('خطا در حذف دسترسی');
      }

      alert('دسترسی با موفقیت حذف شد');
      fetchData();
    } catch (err: any) {
      alert(err.message || 'خطا در حذف دسترسی');
    }
  };

  const getLineTypeLabel = (lineType: string) => {
    if (lineType === 'IceCream' || lineType === FreightLineType.IceCream) return 'بستنی';
    if (lineType === 'Dairy' || lineType === FreightLineType.Dairy) return 'پاستوریزه';
    if (lineType === 'Ambient' || lineType === FreightLineType.Ambient) return 'لبنیات-فروتلند';
    return lineType;
  };

  const filteredPermissions = useMemo(() => {
    return permissions.filter(p => {
      const matchesLineType = p.line_type === selectedLineType || 
        (selectedLineType === FreightLineType.IceCream && p.line_type === 'IceCream') ||
        (selectedLineType === FreightLineType.Dairy && p.line_type === 'Dairy') ||
        (selectedLineType === FreightLineType.Ambient && p.line_type === 'Ambient');
      
      const matchesSearch = !searchQuery || 
        p.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.full_name.toLowerCase().includes(searchQuery.toLowerCase());
      
      return matchesLineType && matchesSearch;
    });
  }, [permissions, selectedLineType, searchQuery]);

  const filteredUsers = useMemo(() => {
    return transportUsers.filter(u => {
      // فیلتر بر اساس نوع ترابری
      const matchesTransportType = transportTypeFilter === 'all' || 
        (transportTypeFilter === 'company' && u.transport_type === 'company') ||
        (transportTypeFilter === 'personal' && u.transport_type === 'personal');
      
      // فیلتر بر اساس جستجو
      const matchesSearch = !searchQuery || 
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.employee_id && u.employee_id.toLowerCase().includes(searchQuery.toLowerCase()));
      
      // فقط کاربرانی که هنوز برای این تب دسترسی ندارند
      const hasPermission = permissions.some(p => 
        p.user_id === u.id && 
        (p.line_type === selectedLineType || 
         (selectedLineType === FreightLineType.IceCream && p.line_type === 'IceCream') ||
         (selectedLineType === FreightLineType.Dairy && p.line_type === 'Dairy') ||
         (selectedLineType === FreightLineType.Ambient && p.line_type === 'Ambient'))
      );
      
      return matchesTransportType && matchesSearch && !hasPermission;
    });
  }, [transportUsers, permissions, selectedLineType, searchQuery, transportTypeFilter]);

  if (loading) {
    return <div className="text-center p-8">در حال بارگذاری...</div>;
  }

  if (error) {
    return <div className="text-center p-8 text-red-500">{error}</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="bg-white rounded-lg shadow-md">
        <div className="p-4 border-b">
          <h2 className="text-2xl font-bold">مدیریت دسترسی‌های اتمام تخصیص</h2>
          <p className="text-sm text-gray-600 mt-1">
            در این بخش می‌توانید تعیین کنید کدام کاربران می‌توانند برای هر تب (بستنی، پاستوریزه، لبنیات-فروتلند) اتمام تخصیص بزنند.
          </p>
        </div>

        {/* انتخاب تب */}
        <div className="p-4 border-b bg-gray-50">
          <label className="block text-sm font-medium mb-2">انتخاب تب:</label>
          <div className="flex gap-2">
            {lineTypes.map(lt => (
              <button
                key={lt.value}
                onClick={() => setSelectedLineType(lt.value)}
                className={`px-4 py-2 rounded-md font-semibold transition-colors ${
                  selectedLineType === lt.value
                    ? 'bg-blue-600 text-white shadow'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border'
                }`}
              >
                {lt.label}
              </button>
            ))}
          </div>
        </div>

        {/* فیلتر و جستجو */}
        <div className="p-4 border-b space-y-3">
          <div className="flex gap-2 items-center">
            <label className="text-sm font-medium">نوع ترابری:</label>
            <select
              value={transportTypeFilter}
              onChange={(e) => setTransportTypeFilter(e.target.value as 'all' | 'company' | 'personal')}
              className="px-3 py-2 border rounded-lg"
            >
              <option value="all">همه</option>
              <option value="company">شرکتی</option>
              <option value="personal">شخصی</option>
            </select>
          </div>
          <input
            type="text"
            placeholder="جستجو بر اساس نام کاربری، نام کامل یا کد پرسنلی..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg"
          />
        </div>

        {/* افزودن دسترسی جدید */}
        <div className="p-4 border-b bg-blue-50">
          <h3 className="font-semibold mb-3">افزودن دسترسی جدید برای تب "{getLineTypeLabel(selectedLineType)}":</h3>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">انتخاب کاربر:</label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">-- انتخاب کاربر --</option>
                {filteredUsers.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.full_name} ({user.username}) - {user.transport_type === 'company' ? 'شرکتی' : user.transport_type === 'personal' ? 'شخصی' : user.role}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleAddPermission}
              disabled={!selectedUser}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              افزودن دسترسی
            </button>
          </div>
        </div>

        {/* لیست دسترسی‌های فعلی */}
        <div className="p-4">
          <h3 className="font-semibold mb-3">
            کاربران دارای دسترسی برای تب "{getLineTypeLabel(selectedLineType)}":
          </h3>
          {filteredPermissions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              هیچ دسترسی‌ای برای این تب ثبت نشده است
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">ردیف</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">نام کاربری</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">نام کامل</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">نقش</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">تب</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">عملیات</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPermissions.map((permission, idx) => (
                    <tr key={permission.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">{idx + 1}</td>
                      <td className="px-4 py-3 text-sm font-medium">{permission.username}</td>
                      <td className="px-4 py-3 text-sm">{permission.full_name}</td>
                      <td className="px-4 py-3 text-sm">{permission.role || '-'}</td>
                      <td className="px-4 py-3 text-sm">{getLineTypeLabel(permission.line_type)}</td>
                      <td className="px-4 py-3 text-sm">
                        <button
                          onClick={() => handleDeletePermission(permission.id)}
                          className="px-3 py-1 bg-red-500 text-white rounded-md text-xs hover:bg-red-600"
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FinalizePermissionManagement;


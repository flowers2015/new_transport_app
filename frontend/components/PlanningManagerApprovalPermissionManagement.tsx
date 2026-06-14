import React, { useState, useEffect, useMemo } from 'react';
import { getApiUrl } from '../utils/apiConfig';
import { FreightLineType } from '../types';

interface PlanningUser {
  id: string;
  username: string;
  full_name: string;
  role: string;
  employee_id?: string;
}

interface ApprovalPermission {
  id: string;
  user_id: string;
  username: string;
  full_name: string;
  line_type: string;
  permission_type: 'approval' | 'create'; // approval برای مدیر، create برای کارمند
  created_at: string;
  updated_at: string;
  role?: string;
}

type UserType = 'manager' | 'employee' | 'all';

const MANAGER_ROLES = new Set([
  'planner_manager',
  'مدیر برنامه‌ریزی',
  'PlanningManager',
  'planning_manager',
]);

const EMPLOYEE_ROLES = new Set([
  'planner',
  'کارمند برنامه‌ریزی',
  'PlanningEmployee',
  'planning_employee',
]);

const normalizePlanningUser = (raw: any): PlanningUser => ({
  id: String(raw.id || ''),
  username: raw.username || '',
  full_name: raw.full_name || raw.fullName || raw.name || raw.username || '',
  role: raw.role || '',
  employee_id: raw.employee_id || raw.employeeId || undefined,
});

const isManagerRole = (role: string) => MANAGER_ROLES.has(role);
const isEmployeeRole = (role: string) => EMPLOYEE_ROLES.has(role);

const PlanningManagerApprovalPermissionManagement: React.FC = () => {
  const [planningManagers, setPlanningManagers] = useState<PlanningUser[]>([]);
  const [planningEmployees, setPlanningEmployees] = useState<PlanningUser[]>([]);
  const [permissions, setPermissions] = useState<ApprovalPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedLineType, setSelectedLineType] = useState<FreightLineType>(FreightLineType.IceCream);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedUserType, setSelectedUserType] = useState<UserType>('manager');
  const [selectedLineTypes, setSelectedLineTypes] = useState<FreightLineType[]>([]);
  const [listSearchQuery, setListSearchQuery] = useState('');
  const [userPickerSearch, setUserPickerSearch] = useState('');

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
      setError(null);

      const [usersRes, permissionsRes] = await Promise.all([
        fetch(getApiUrl('planning-manager-approval-permissions/planning-users'), { headers }),
        fetch(getApiUrl('planning-manager-approval-permissions/permissions'), { headers }),
      ]);

      let managers: PlanningUser[] = [];
      let employees: PlanningUser[] = [];

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        managers = (usersData.managers || []).map(normalizePlanningUser);
        employees = (usersData.employees || []).map(normalizePlanningUser);
      }

      if (!usersRes.ok || (managers.length === 0 && employees.length === 0)) {
        const fallbackRes = await fetch(getApiUrl('admin/users?limit=500'), { headers });
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          const allUsers = (fallbackData.users || fallbackData || []).map(normalizePlanningUser);
          managers = allUsers.filter((u) => isManagerRole(u.role));
          employees = allUsers.filter((u) => isEmployeeRole(u.role));
        } else if (!usersRes.ok) {
          const body = await usersRes.json().catch(() => ({}));
          throw new Error(body.message || body.error || 'خطا در دریافت کاربران برنامه‌ریزی');
        }
      }

      if (!permissionsRes.ok) {
        const body = await permissionsRes.json().catch(() => ({}));
        throw new Error(body.message || body.error || 'خطا در دریافت مجوزها');
      }

      const permissionsData = await permissionsRes.json();

      setPlanningManagers(managers);
      setPlanningEmployees(employees);
      setPermissions(permissionsData);
    } catch (err: any) {
      setError(err.message || 'خطا در دریافت اطلاعات');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPermission = async () => {
    if (!selectedUser) {
      alert(`لطفاً ${selectedUserType === 'manager' ? 'مدیر' : 'کارمند'} برنامه‌ریزی را انتخاب کنید`);
      return;
    }

    if (selectedLineTypes.length === 0) {
      alert('لطفاً حداقل یک لاین را انتخاب کنید');
      return;
    }

    const user = selectedUserType === 'manager' 
      ? planningManagers.find(m => m.id === selectedUser)
      : planningEmployees.find(e => e.id === selectedUser);
    
    if (!user) {
      alert(`${selectedUserType === 'manager' ? 'مدیر' : 'کارمند'} برنامه‌ریزی یافت نشد`);
      return;
    }

    try {
      // برای هر لاین انتخاب شده یک مجوز ایجاد می‌کنیم
      const permissionType = selectedUserType === 'manager' ? 'approval' : 'create';
      const promises = selectedLineTypes.map(lineType =>
        fetch(getApiUrl('planning-manager-approval-permissions/permissions'), {
          method: 'POST',
          headers,
          body: JSON.stringify({
            userId: selectedUser,
            username: user.username,
            fullName: user.full_name,
            lineType: lineType,
            permissionType: permissionType,
          }),
        })
      );

      const results = await Promise.all(promises);
      const errors = results.filter(r => !r.ok);

      if (errors.length > 0) {
        const errorData = await errors[0].json();
        throw new Error(errorData.message || 'خطا در افزودن مجوز');
      }

      alert('مجوز با موفقیت اضافه شد');
      setSelectedUser('');
      setSelectedLineTypes([]);
      fetchData();
    } catch (err: any) {
      alert(err.message || 'خطا در افزودن مجوز');
    }
  };

  const handleDeletePermission = async (id: string) => {
    if (!confirm('آیا از حذف این مجوز اطمینان دارید؟')) return;

    try {
      const response = await fetch(getApiUrl(`planning-manager-approval-permissions/permissions/${id}`), {
        method: 'DELETE',
        headers,
      });

      if (!response.ok) {
        throw new Error('خطا در حذف مجوز');
      }

      alert('مجوز با موفقیت حذف شد');
      fetchData();
    } catch (err: any) {
      alert(err.message || 'خطا در حذف مجوز');
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
      const matchesLineType = !selectedLineType || p.line_type === selectedLineType || 
        (selectedLineType === FreightLineType.IceCream && p.line_type === 'IceCream') ||
        (selectedLineType === FreightLineType.Dairy && p.line_type === 'Dairy') ||
        (selectedLineType === FreightLineType.Ambient && p.line_type === 'Ambient');
      
      const matchesSearch = !listSearchQuery || 
        (p.username || '').toLowerCase().includes(listSearchQuery.toLowerCase()) ||
        (p.full_name || '').toLowerCase().includes(listSearchQuery.toLowerCase());
      
      return matchesLineType && matchesSearch;
    });
  }, [permissions, selectedLineType, listSearchQuery]);

  const availableUsers = useMemo(() => {
    if (selectedUserType === 'manager') return planningManagers;
    if (selectedUserType === 'employee') return planningEmployees;
    return [...planningManagers, ...planningEmployees];
  }, [selectedUserType, planningManagers, planningEmployees]);

  const filteredUsers = useMemo(() => {
    const permissionType = selectedUserType === 'manager' ? 'approval' : 'create';

    return availableUsers.filter(u => {
      const displayName = (u.full_name || u.username || '').toLowerCase();
      const matchesSearch = !userPickerSearch ||
        (u.username || '').toLowerCase().includes(userPickerSearch.toLowerCase()) ||
        displayName.includes(userPickerSearch.toLowerCase()) ||
        (u.employee_id && u.employee_id.toLowerCase().includes(userPickerSearch.toLowerCase()));

      if (!matchesSearch) return false;

      if (selectedLineTypes.length === 0) return true;

      const hasPermissionForAllSelected = selectedLineTypes.every(lt =>
        permissions.some(p =>
          p.user_id === u.id &&
          p.permission_type === permissionType &&
          (p.line_type === lt ||
           (lt === FreightLineType.IceCream && p.line_type === 'IceCream') ||
           (lt === FreightLineType.Dairy && p.line_type === 'Dairy') ||
           (lt === FreightLineType.Ambient && p.line_type === 'Ambient'))
        )
      );

      return !hasPermissionForAllSelected;
    });
  }, [availableUsers, permissions, userPickerSearch, selectedLineTypes, selectedUserType]);

  // گروه‌بندی مجوزها بر اساس مدیر
  const groupedPermissions = useMemo(() => {
    const grouped: { [userId: string]: { user: PlanningUser; lineTypes: string[] } } = {};
    
    permissions.forEach(p => {
      if (!grouped[p.user_id]) {
        const user = [...planningManagers, ...planningEmployees].find(u => u.id === p.user_id);
        if (user) {
          grouped[p.user_id] = { user, lineTypes: [] };
        }
      }
      if (grouped[p.user_id]) {
        grouped[p.user_id].lineTypes.push(p.line_type);
      }
    });
    
    return Object.values(grouped);
  }, [permissions, planningManagers, planningEmployees]);

  if (loading) {
    return <div className="text-center p-8">در حال بارگذاری...</div>;
  }

  if (error) {
    return <div className="text-center p-8 text-red-500">{error}</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="bg-white rounded-lg shadow-md">
        <div className="p-4 border-b">
          <h2 className="text-2xl font-bold">مجوز تاییدیه مدیران و کارمندان برنامه‌ریزی</h2>
          <p className="text-sm text-gray-600 mt-1">
            در این بخش می‌توانید تعیین کنید:
            <br />
            • کدام مدیران برنامه‌ریزی می‌توانند برای هر لاین تاییدیه بدهند (و فقط بارهای همان لاین را ببینند)
            <br />
            • کدام کارمندان برنامه‌ریزی می‌توانند برای هر لاین اعلام بار ایجاد کنند (و فقط تب‌های مربوط به لاین‌های مجاز را ببینند)
          </p>
          <p className="text-xs text-slate-500 mt-2">
            کاربران یافت‌شده: {planningManagers.length.toLocaleString('fa-IR')} مدیر، {planningEmployees.length.toLocaleString('fa-IR')} کارمند
          </p>
        </div>

        {/* افزودن مجوز جدید */}
        <div className="p-4 border-b bg-blue-50">
          <h3 className="font-semibold mb-3">افزودن مجوز جدید:</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">نوع کاربر:</label>
              <select
                value={selectedUserType}
                onChange={(e) => {
                  setSelectedUserType(e.target.value as UserType);
                  setSelectedUser('');
                  setUserPickerSearch('');
                }}
                className="w-full px-3 py-2 border rounded-lg bg-white"
              >
                <option value="manager">مدیر برنامه‌ریزی (مجوز تاییدیه)</option>
                <option value="employee">کارمند برنامه‌ریزی (مجوز ایجاد اعلام بار)</option>
              </select>
              {selectedUserType && (
                <div className="mt-2 p-3 rounded-lg bg-white border-2 border-blue-200">
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      selectedUserType === 'manager' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {selectedUserType === 'manager' ? '📋 مجوز تاییدیه' : '➕ مجوز ایجاد اعلام بار'}
                    </span>
                    <span className="text-sm text-gray-700">
                      {selectedUserType === 'manager' 
                        ? 'این کاربر می‌تواند اعلام بارها را تایید کند و فقط بارهای لاین‌های مجاز را می‌بیند'
                        : 'این کاربر می‌تواند اعلام بار ایجاد کند و فقط تب‌های لاین‌های مجاز را می‌بیند'}
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                انتخاب {selectedUserType === 'manager' ? 'مدیر' : 'کارمند'} برنامه‌ریزی:
              </label>
              <input
                type="text"
                placeholder={`جستجو بین ${availableUsers.length} ${selectedUserType === 'manager' ? 'مدیر' : 'کارمند'}...`}
                value={userPickerSearch}
                onChange={(e) => setUserPickerSearch(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg mb-2"
              />
              <select
                key={`user-select-${selectedUserType}`}
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg bg-white"
              >
                <option value="">
                  -- انتخاب {selectedUserType === 'manager' ? 'مدیر' : 'کارمند'} برنامه‌ریزی --
                </option>
                {filteredUsers.map(user => (
                  <option key={user.id} value={user.id}>
                    {(user.full_name || user.username)} ({user.username})
                    {user.employee_id ? ` - ${user.employee_id}` : ''}
                  </option>
                ))}
              </select>
              {availableUsers.length === 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  هیچ {selectedUserType === 'manager' ? 'مدیر' : 'کارمند'} برنامه‌ریزی در سیستم ثبت نشده است.
                </p>
              )}
              {availableUsers.length > 0 && filteredUsers.length === 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  کاربری برای انتخاب باقی نمانده (همه مجوز دارند یا جستجو نتیجه‌ای ندارد).
                </p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">
                انتخاب لاین‌های مجاز:
              </label>
              {selectedUserType && (
                <p className="text-xs text-gray-600 mb-2">
                  {selectedUserType === 'manager' 
                    ? 'لاین‌هایی که این مدیر می‌تواند برای آن‌ها تاییدیه بدهد:'
                    : 'لاین‌هایی که این کارمند می‌تواند برای آن‌ها اعلام بار ایجاد کند:'}
                </p>
              )}
              <div className="flex gap-2 flex-wrap">
                {lineTypes.map(lt => (
                  <label key={lt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedLineTypes.includes(lt.value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedLineTypes([...selectedLineTypes, lt.value]);
                        } else {
                          setSelectedLineTypes(selectedLineTypes.filter(t => t !== lt.value));
                        }
                      }}
                      className="w-4 h-4"
                    />
                    <span>{lt.label}</span>
                  </label>
                ))}
              </div>
            </div>
            
            <button
              onClick={handleAddPermission}
              disabled={!selectedUser || selectedLineTypes.length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              افزودن مجوز
            </button>
          </div>
        </div>

        {/* جستجو */}
        <div className="p-4 border-b">
          <input
            type="text"
            placeholder="جستجو بر اساس نام کاربری، نام کامل یا کد پرسنلی..."
            value={listSearchQuery}
            onChange={(e) => setListSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg"
          />
        </div>

        {/* انتخاب تب برای فیلتر */}
        <div className="p-4 border-b bg-gray-50">
          <label className="block text-sm font-medium mb-2">فیلتر بر اساس لاین:</label>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedLineType(FreightLineType.IceCream)}
              className={`px-4 py-2 rounded-md font-semibold transition-colors ${
                selectedLineType === FreightLineType.IceCream
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border'
              }`}
            >
              بستنی
            </button>
            <button
              onClick={() => setSelectedLineType(FreightLineType.Dairy)}
              className={`px-4 py-2 rounded-md font-semibold transition-colors ${
                selectedLineType === FreightLineType.Dairy
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border'
              }`}
            >
              پاستوریزه
            </button>
            <button
              onClick={() => setSelectedLineType(FreightLineType.Ambient)}
              className={`px-4 py-2 rounded-md font-semibold transition-colors ${
                selectedLineType === FreightLineType.Ambient
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border'
              }`}
            >
              لبنیات-فروتلند
            </button>
            <button
              onClick={() => setSelectedLineType('' as any)}
              className={`px-4 py-2 rounded-md font-semibold transition-colors ${
                selectedLineType === ('' as any)
                  ? 'bg-blue-600 text-white shadow'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border'
              }`}
            >
              همه
            </button>
          </div>
        </div>

        {/* لیست مجوزهای فعلی */}
        <div className="p-4">
          <h3 className="font-semibold mb-3">
            مجوزهای ثبت شده{selectedLineType ? ` برای لاین "${getLineTypeLabel(selectedLineType)}"` : ''}:
          </h3>
          <div className="mb-3 flex gap-2">
            <span className="px-2 py-1 rounded text-xs bg-blue-100 text-blue-800">
              📋 تاییدیه = مدیر برنامه‌ریزی
            </span>
            <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-800">
              ➕ ایجاد اعلام بار = کارمند برنامه‌ریزی
            </span>
          </div>
          {filteredPermissions.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              هیچ مجوزی ثبت نشده است
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">ردیف</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">نام کاربری</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">نام کامل</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">کد پرسنلی</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">نوع مجوز</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">لاین</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">عملیات</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPermissions.map((permission, idx) => {
                    const user = [...planningManagers, ...planningEmployees].find(u => u.id === permission.user_id);
                    return (
                      <tr key={permission.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">{idx + 1}</td>
                        <td className="px-4 py-3 text-sm font-medium">{permission.username}</td>
                        <td className="px-4 py-3 text-sm">{permission.full_name}</td>
                        <td className="px-4 py-3 text-sm">{user?.employee_id || '-'}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            permission.permission_type === 'approval' 
                              ? 'bg-blue-100 text-blue-800 border border-blue-300' 
                              : 'bg-green-100 text-green-800 border border-green-300'
                          }`}>
                            {permission.permission_type === 'approval' ? '📋 تاییدیه (مدیر)' : '➕ ایجاد اعلام بار (کارمند)'}
                          </span>
                        </td>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlanningManagerApprovalPermissionManagement;


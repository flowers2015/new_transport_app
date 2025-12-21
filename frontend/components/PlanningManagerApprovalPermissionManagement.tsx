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
  const [searchQuery, setSearchQuery] = useState('');

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
      const [managersRes, employeesRes, permissionsRes] = await Promise.all([
        fetch(getApiUrl('planning-manager-approval-permissions/planning-managers'), { headers }),
        fetch(getApiUrl('planning-manager-approval-permissions/planning-employees'), { headers }),
        fetch(getApiUrl('planning-manager-approval-permissions/permissions'), { headers }),
      ]);

      if (!managersRes.ok || !employeesRes.ok || !permissionsRes.ok) {
        throw new Error('خطا در دریافت اطلاعات');
      }

      const [managersData, employeesData, permissionsData] = await Promise.all([
        managersRes.json(),
        employeesRes.json(),
        permissionsRes.json(),
      ]);

      setPlanningManagers(managersData);
      setPlanningEmployees(employeesData);
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
    const users = selectedUserType === 'manager' ? planningManagers : 
                  selectedUserType === 'employee' ? planningEmployees :
                  [...planningManagers, ...planningEmployees];
    
    return users.filter(u => {
      const matchesSearch = !searchQuery || 
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.employee_id && u.employee_id.toLowerCase().includes(searchQuery.toLowerCase()));
      
      // فقط کاربرانی که هنوز برای این لاین‌های انتخاب شده مجوز ندارند
      const permissionType = selectedUserType === 'manager' ? 'approval' : 
                            selectedUserType === 'employee' ? 'create' : 
                            undefined;
      
      const hasPermissionForAllSelected = selectedLineTypes.length > 0 && selectedLineTypes.every(lt => 
        permissions.some(p => 
          p.user_id === u.id && 
          p.permission_type === (permissionType || p.permission_type) &&
          (p.line_type === lt || 
           (lt === FreightLineType.IceCream && p.line_type === 'IceCream') ||
           (lt === FreightLineType.Dairy && p.line_type === 'Dairy') ||
           (lt === FreightLineType.Ambient && p.line_type === 'Ambient'))
        )
      );
      
      return matchesSearch && !hasPermissionForAllSelected;
    });
  }, [planningManagers, planningEmployees, permissions, searchQuery, selectedLineTypes, selectedUserType]);

  // گروه‌بندی مجوزها بر اساس مدیر
  const groupedPermissions = useMemo(() => {
    const grouped: { [userId: string]: { manager: PlanningManager; lineTypes: string[] } } = {};
    
    permissions.forEach(p => {
      if (!grouped[p.user_id]) {
        const manager = planningManagers.find(m => m.id === p.user_id);
        if (manager) {
          grouped[p.user_id] = { manager, lineTypes: [] };
        }
      }
      if (grouped[p.user_id]) {
        grouped[p.user_id].lineTypes.push(p.line_type);
      }
    });
    
    return Object.values(grouped);
  }, [permissions, planningManagers]);

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
                }}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="manager">مدیر برنامه‌ریزی (مجوز تاییدیه)</option>
                <option value="employee">کارمند برنامه‌ریزی (مجوز ایجاد اعلام بار)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                انتخاب {selectedUserType === 'manager' ? 'مدیر' : 'کارمند'} برنامه‌ریزی:
              </label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">-- انتخاب {selectedUserType === 'manager' ? 'مدیر' : 'کارمند'} برنامه‌ریزی --</option>
                {filteredUsers.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.full_name} ({user.username}) {user.employee_id ? `- ${user.employee_id}` : ''}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">
                انتخاب لاین‌های مجاز ({selectedUserType === 'manager' ? 'برای تاییدیه' : 'برای ایجاد اعلام بار'}):
              </label>
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
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
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
            مدیران دارای مجوز تاییدیه:
          </h3>
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
                          <span className={`px-2 py-1 rounded text-xs ${
                            permission.permission_type === 'approval' 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-green-100 text-green-800'
                          }`}>
                            {permission.permission_type === 'approval' ? 'تاییدیه' : 'ایجاد اعلام بار'}
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


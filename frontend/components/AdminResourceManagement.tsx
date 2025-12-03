import React, { useState, useEffect, useMemo } from 'react';
import { getApiUrl } from '../utils/apiConfig';
import {
  persianAlphabet,
  holdingCompanies,
  mihanCompanies,
  vehicleTypes,
  fuelTypes,
  vehicleColors,
  vehicleStatuses,
  wheelCounts,
  axleCounts,
  cylinderCounts,
  usageTypes,
  capacities,
  getBrandsForType,
  getModelsForBrand
} from '../utils/vehicleConstants';

// ============================================
// Types
// ============================================
interface CompanyDriver {
  id: string;
  employeeId: string;
  name: string;
  fatherName?: string;
  nationalId: string;
  birthDate?: string;
  idNumber?: string;
  birthPlace?: string;
  issuePlace?: string;
  homePhone?: string;
  workPhone?: string;
  mobile?: string;
  postalCode?: string;
  homeAddress?: string;
  workLocation?: string;
  jobTitle?: string;
  hireDate?: string;
  terminationDate?: string;
  licenseNumber?: string;
  licenseType?: string;
  licenseIssueDate?: string;
  licenseIssuePlace?: string;
  licenseExpiryDate?: string;
  currentVehicleType?: string;
  currentVehiclePlate?: string;
  createdAt: string;
  updatedAt: string;
}

interface CompanyVehicle {
  id: string;
  plateNumber: { part1: string; letter: string; part2: string; cityCode: string };
  serialNumber?: string;
  model: string;
  brand?: string;
  type?: string;
  branchId?: string;
  branchName?: string;
  holdingCompany?: string;
  mihanCompany?: string;
  vehicleCategory?: string;
  ownerName?: string;
  color?: string;
  usageType?: string;
  engineNumber?: string;
  vehicleTip?: string;
  chassisNumber?: string;
  capacity?: string;
  vin?: string;
  year?: number;
  wheelCount?: number;
  axleCount?: number;
  cylinderCount?: number;
  domainName?: string;
  fuelType?: string;
  vehicleCode?: string;
  status?: string;
  createdAt: string;
  updatedAt: string;
}

interface PersonalDriver {
  id: string;
  nationalId: string;
  name: string;
  mobile: string;
  driverSmartId: string;
  createdAt: string;
  updatedAt?: string;
}

interface PersonalVehicle {
  id: string;
  truckSmartId: string;
  platePart1: string;
  plateLetter: string;
  platePart2: string;
  plateCityCode: string;
  vehicleType: string;
  vehicleUsage?: string;
  formattedPlate?: string;
  createdAt: string;
  updatedAt?: string;
}

type TabType = 'company-drivers' | 'company-vehicles' | 'personal-drivers' | 'personal-vehicles';

// ============================================
// Main Component
// ============================================
const AdminResourceManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('company-drivers');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Data states
  const [companyDrivers, setCompanyDrivers] = useState<CompanyDriver[]>([]);
  const [companyVehicles, setCompanyVehicles] = useState<CompanyVehicle[]>([]);
  const [personalDrivers, setPersonalDrivers] = useState<PersonalDriver[]>([]);
  const [personalVehicles, setPersonalVehicles] = useState<PersonalVehicle[]>([]);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectedItem, setSelectedItem] = useState<any>(null);

  const headers = {
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json',
  };

  // ============================================
  // Data Fetching
  // ============================================
  const fetchCompanyDrivers = async () => {
    try {
      const res = await fetch(getApiUrl('drivers'), { headers });
      if (!res.ok) throw new Error('خطا در دریافت رانندگان');
      const data = await res.json();
      setCompanyDrivers(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchCompanyVehicles = async () => {
    try {
      const res = await fetch(getApiUrl('vehicles'), { headers });
      if (!res.ok) throw new Error('خطا در دریافت خودروها');
      const data = await res.json();
      setCompanyVehicles(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchPersonalDrivers = async () => {
    try {
      const res = await fetch(getApiUrl('personal-drivers'), { headers });
      if (!res.ok) throw new Error('خطا در دریافت رانندگان شخصی');
      const data = await res.json();
      setPersonalDrivers(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchPersonalVehicles = async () => {
    try {
      const res = await fetch(getApiUrl('personal-vehicles'), { headers });
      if (!res.ok) throw new Error('خطا در دریافت خودروهای شخصی');
      const data = await res.json();
      setPersonalVehicles(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([
        fetchCompanyDrivers(),
        fetchCompanyVehicles(),
        fetchPersonalDrivers(),
        fetchPersonalVehicles(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery]);

  // ============================================
  // CRUD Operations
  // ============================================
  const handleDelete = async (type: TabType, id: string) => {
    if (!confirm('آیا از حذف این رکورد اطمینان دارید؟')) return;

    try {
      let url = '';
      switch (type) {
        case 'company-drivers':
          url = getApiUrl(`drivers/${id}`);
          break;
        case 'company-vehicles':
          // Vehicles don't have soft delete, just remove from UI
          alert('امکان حذف خودرو شرکتی وجود ندارد');
          return;
        case 'personal-drivers':
          url = getApiUrl(`personal-drivers/${id}`);
          break;
        case 'personal-vehicles':
          url = getApiUrl(`personal-vehicles/${id}`);
          break;
      }

      const res = await fetch(url, { method: 'DELETE', headers });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'خطا در حذف');
      }
      
      alert('با موفقیت حذف شد');
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSave = async (data: any) => {
    try {
      let url = '';
      let method = modalMode === 'add' ? 'POST' : 'PUT';

      switch (activeTab) {
        case 'company-drivers':
          url = modalMode === 'add' 
            ? getApiUrl('drivers') 
            : getApiUrl(`drivers/${selectedItem.id}`);
          break;
        case 'company-vehicles':
          url = modalMode === 'add' 
            ? getApiUrl('vehicles') 
            : getApiUrl(`vehicles/${selectedItem.id}`);
          break;
        case 'personal-drivers':
          url = modalMode === 'add' 
            ? getApiUrl('personal-drivers') 
            : getApiUrl(`personal-drivers/${selectedItem.id}`);
          break;
        case 'personal-vehicles':
          url = modalMode === 'add' 
            ? getApiUrl('personal-vehicles') 
            : getApiUrl(`personal-vehicles/${selectedItem.id}`);
          break;
      }

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'خطا در ذخیره');
      }

      alert(modalMode === 'add' ? 'با موفقیت ایجاد شد' : 'با موفقیت ویرایش شد');
      setShowModal(false);
      setSelectedItem(null);
      fetchData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // ============================================
  // Filtering & Pagination
  // ============================================
  const getFilteredData = () => {
    const query = searchQuery.toLowerCase();
    
    switch (activeTab) {
      case 'company-drivers':
        return companyDrivers.filter(d => 
          d.name?.toLowerCase().includes(query) ||
          d.employeeId?.toLowerCase().includes(query) ||
          d.nationalId?.includes(query) ||
          d.mobile?.includes(query)
        );
      case 'company-vehicles':
        return companyVehicles.filter(v => 
          v.model?.toLowerCase().includes(query) ||
          v.brand?.toLowerCase().includes(query) ||
          v.vin?.toLowerCase().includes(query) ||
          v.vehicleCode?.toLowerCase().includes(query) ||
          `${v.plateNumber?.part1}${v.plateNumber?.letter}${v.plateNumber?.part2}`.includes(query)
        );
      case 'personal-drivers':
        return personalDrivers.filter(d => 
          d.name?.toLowerCase().includes(query) ||
          d.nationalId?.includes(query) ||
          d.mobile?.includes(query) ||
          d.driverSmartId?.includes(query)
        );
      case 'personal-vehicles':
        return personalVehicles.filter(v => 
          v.truckSmartId?.toLowerCase().includes(query) ||
          v.vehicleType?.toLowerCase().includes(query) ||
          `${v.platePart1}${v.plateLetter}${v.platePart2}`.includes(query)
        );
      default:
        return [];
    }
  };

  const filteredData = useMemo(() => getFilteredData(), [
    activeTab, searchQuery, companyDrivers, companyVehicles, personalDrivers, personalVehicles
  ]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // ============================================
  // Render Helpers
  // ============================================
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('fa-IR');
    } catch {
      return dateStr;
    }
  };

  const formatPlate = (plate: any) => {
    if (!plate) return '-';
    return `${plate.part1 || ''} ${plate.letter || ''} ${plate.part2 || ''} - ${plate.cityCode || ''}`;
  };

  const tabs = [
    { key: 'company-drivers' as TabType, label: 'رانندگان شرکتی', count: companyDrivers.length },
    { key: 'company-vehicles' as TabType, label: 'خودروهای شرکتی', count: companyVehicles.length },
    { key: 'personal-drivers' as TabType, label: 'رانندگان شخصی', count: personalDrivers.length },
    { key: 'personal-vehicles' as TabType, label: 'خودروهای شخصی', count: personalVehicles.length },
  ];

  // ============================================
  // Table Renderers
  // ============================================
  const renderCompanyDriversTable = () => (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-right font-medium text-gray-500">ردیف</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">کد پرسنلی</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">نام</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">نام پدر</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">کد ملی</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">موبایل</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">شماره گواهینامه</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">نوع گواهینامه</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">تاریخ انقضا</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">تاریخ استخدام</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">عنوان شغلی</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">عملیات</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {(paginatedData as CompanyDriver[]).map((driver, idx) => (
            <tr key={driver.id} className="hover:bg-gray-50">
              <td className="px-3 py-2">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
              <td className="px-3 py-2 font-mono">{driver.employeeId || '-'}</td>
              <td className="px-3 py-2 font-medium">{driver.name || '-'}</td>
              <td className="px-3 py-2">{driver.fatherName || '-'}</td>
              <td className="px-3 py-2 font-mono">{driver.nationalId || '-'}</td>
              <td className="px-3 py-2 font-mono" dir="ltr">{driver.mobile || '-'}</td>
              <td className="px-3 py-2">{driver.licenseNumber || '-'}</td>
              <td className="px-3 py-2">{driver.licenseType || '-'}</td>
              <td className="px-3 py-2">{formatDate(driver.licenseExpiryDate)}</td>
              <td className="px-3 py-2">{formatDate(driver.hireDate)}</td>
              <td className="px-3 py-2">{driver.jobTitle || '-'}</td>
              <td className="px-3 py-2">
                <div className="flex gap-1">
                  <button
                    onClick={() => { setSelectedItem(driver); setModalMode('edit'); setShowModal(true); }}
                    className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    ویرایش
                  </button>
                  <button
                    onClick={() => handleDelete('company-drivers', driver.id)}
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
  );

  const renderCompanyVehiclesTable = () => (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-right font-medium text-gray-500">ردیف</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">کد خودرو</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">پلاک</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">برند</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">مدل</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">نوع</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">رنگ</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">سال ساخت</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">VIN</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">شماره شاسی</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">شماره موتور</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">شعبه</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">وضعیت</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">عملیات</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {(paginatedData as CompanyVehicle[]).map((vehicle, idx) => (
            <tr key={vehicle.id} className="hover:bg-gray-50">
              <td className="px-3 py-2">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
              <td className="px-3 py-2 font-mono">{vehicle.vehicleCode || '-'}</td>
              <td className="px-3 py-2 font-mono" dir="ltr">{formatPlate(vehicle.plateNumber)}</td>
              <td className="px-3 py-2">{vehicle.brand || '-'}</td>
              <td className="px-3 py-2">{vehicle.model || '-'}</td>
              <td className="px-3 py-2">{vehicle.type || '-'}</td>
              <td className="px-3 py-2">{vehicle.color || '-'}</td>
              <td className="px-3 py-2">{vehicle.year || '-'}</td>
              <td className="px-3 py-2 font-mono text-xs">{vehicle.vin || '-'}</td>
              <td className="px-3 py-2 font-mono text-xs">{vehicle.chassisNumber || '-'}</td>
              <td className="px-3 py-2 font-mono text-xs">{vehicle.engineNumber || '-'}</td>
              <td className="px-3 py-2">{vehicle.branchName || '-'}</td>
              <td className="px-3 py-2">
                <span className={`px-2 py-1 rounded text-xs ${
                  vehicle.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                }`}>
                  {vehicle.status || '-'}
                </span>
              </td>
              <td className="px-3 py-2">
                <button
                  onClick={() => { setSelectedItem(vehicle); setModalMode('edit'); setShowModal(true); }}
                  className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                  ویرایش
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderPersonalDriversTable = () => (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-right font-medium text-gray-500">ردیف</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">کد ملی</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">نام</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">موبایل</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">هوشمند راننده</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">تاریخ ثبت</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">عملیات</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {(paginatedData as PersonalDriver[]).map((driver, idx) => (
            <tr key={driver.id} className="hover:bg-gray-50">
              <td className="px-3 py-2">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
              <td className="px-3 py-2 font-mono">{driver.nationalId || '-'}</td>
              <td className="px-3 py-2 font-medium">{driver.name || '-'}</td>
              <td className="px-3 py-2 font-mono" dir="ltr">{driver.mobile || '-'}</td>
              <td className="px-3 py-2 font-mono">{driver.driverSmartId || '-'}</td>
              <td className="px-3 py-2">{formatDate(driver.createdAt)}</td>
              <td className="px-3 py-2">
                <div className="flex gap-1">
                  <button
                    onClick={() => { setSelectedItem(driver); setModalMode('edit'); setShowModal(true); }}
                    className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    ویرایش
                  </button>
                  <button
                    onClick={() => handleDelete('personal-drivers', driver.id)}
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
  );

  const renderPersonalVehiclesTable = () => (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-2 text-right font-medium text-gray-500">ردیف</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">هوشمند کامیون</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">پلاک</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">نوع خودرو</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">نوع استفاده</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">تاریخ ثبت</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">عملیات</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {(paginatedData as PersonalVehicle[]).map((vehicle, idx) => (
            <tr key={vehicle.id} className="hover:bg-gray-50">
              <td className="px-3 py-2">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
              <td className="px-3 py-2 font-mono">{vehicle.truckSmartId || '-'}</td>
              <td className="px-3 py-2 font-mono" dir="ltr">
                {vehicle.formattedPlate || `${vehicle.platePart1} ${vehicle.plateLetter} ${vehicle.platePart2} - ${vehicle.plateCityCode}`}
              </td>
              <td className="px-3 py-2">{vehicle.vehicleType || '-'}</td>
              <td className="px-3 py-2">{vehicle.vehicleUsage || '-'}</td>
              <td className="px-3 py-2">{formatDate(vehicle.createdAt)}</td>
              <td className="px-3 py-2">
                <div className="flex gap-1">
                  <button
                    onClick={() => { setSelectedItem(vehicle); setModalMode('edit'); setShowModal(true); }}
                    className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    ویرایش
                  </button>
                  <button
                    onClick={() => handleDelete('personal-vehicles', vehicle.id)}
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
  );

  const renderTable = () => {
    switch (activeTab) {
      case 'company-drivers':
        return renderCompanyDriversTable();
      case 'company-vehicles':
        return renderCompanyVehiclesTable();
      case 'personal-drivers':
        return renderPersonalDriversTable();
      case 'personal-vehicles':
        return renderPersonalVehiclesTable();
      default:
        return null;
    }
  };

  // ============================================
  // Modal Forms
  // ============================================
  const renderModal = () => {
    if (!showModal) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">
              {modalMode === 'add' ? 'افزودن' : 'ویرایش'} {
                activeTab === 'company-drivers' ? 'راننده شرکتی' :
                activeTab === 'company-vehicles' ? 'خودرو شرکتی' :
                activeTab === 'personal-drivers' ? 'راننده شخصی' :
                'خودرو شخصی'
              }
            </h2>
            <button
              onClick={() => { setShowModal(false); setSelectedItem(null); }}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ✕
            </button>
          </div>

          {activeTab === 'company-drivers' && (
            <CompanyDriverForm
              initialData={modalMode === 'edit' ? selectedItem : null}
              onSave={handleSave}
              onCancel={() => { setShowModal(false); setSelectedItem(null); }}
            />
          )}
          {activeTab === 'company-vehicles' && (
            <CompanyVehicleForm
              initialData={modalMode === 'edit' ? selectedItem : null}
              onSave={handleSave}
              onCancel={() => { setShowModal(false); setSelectedItem(null); }}
            />
          )}
          {activeTab === 'personal-drivers' && (
            <PersonalDriverForm
              initialData={modalMode === 'edit' ? selectedItem : null}
              onSave={handleSave}
              onCancel={() => { setShowModal(false); setSelectedItem(null); }}
            />
          )}
          {activeTab === 'personal-vehicles' && (
            <PersonalVehicleForm
              initialData={modalMode === 'edit' ? selectedItem : null}
              onSave={handleSave}
              onCancel={() => { setShowModal(false); setSelectedItem(null); }}
            />
          )}
        </div>
      </div>
    );
  };

  // ============================================
  // Main Render
  // ============================================
  return (
    <div className="p-6 bg-gray-50 min-h-screen" dir="rtl">
      <div className="bg-white rounded-lg shadow-sm">
        {/* Header */}
        <div className="p-4 border-b">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">مدیریت منابع (ادمین)</h1>
          
          {/* Tabs */}
          <div className="flex flex-wrap gap-2 mb-4">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  activeTab === tab.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tab.label}
                <span className="mr-2 px-2 py-0.5 bg-white/20 rounded text-sm">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search & Add */}
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="جستجو..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button
              onClick={() => { setModalMode('add'); setSelectedItem(null); setShowModal(true); }}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
            >
              + افزودن جدید
            </button>
            <button
              onClick={fetchData}
              disabled={loading}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              {loading ? 'در حال بارگذاری...' : '🔄 بازخوانی'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-50 text-red-700 border-b border-red-200">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="p-4">
          {loading ? (
            <div className="text-center py-10 text-gray-500">در حال بارگذاری...</div>
          ) : filteredData.length === 0 ? (
            <div className="text-center py-10 text-gray-500">هیچ رکوردی یافت نشد</div>
          ) : (
            <>
              {renderTable()}
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-4 pt-4 border-t">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 bg-gray-100 rounded disabled:opacity-50"
                  >
                    قبلی
                  </button>
                  <span className="px-4 py-1 text-sm text-gray-600">
                    صفحه {currentPage} از {totalPages} (کل: {filteredData.length})
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 bg-gray-100 rounded disabled:opacity-50"
                  >
                    بعدی
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {renderModal()}
    </div>
  );
};

// ============================================
// Form Components
// ============================================

// Company Driver Form
const CompanyDriverForm: React.FC<{
  initialData: CompanyDriver | null;
  onSave: (data: any) => void;
  onCancel: () => void;
}> = ({ initialData, onSave, onCancel }) => {
  const [form, setForm] = useState({
    employeeId: initialData?.employeeId || '',
    name: initialData?.name || '',
    fatherName: initialData?.fatherName || '',
    nationalId: initialData?.nationalId || '',
    birthDate: initialData?.birthDate?.split('T')[0] || '',
    idNumber: initialData?.idNumber || '',
    birthPlace: initialData?.birthPlace || '',
    issuePlace: initialData?.issuePlace || '',
    homePhone: initialData?.homePhone || '',
    workPhone: initialData?.workPhone || '',
    mobile: initialData?.mobile || '',
    postalCode: initialData?.postalCode || '',
    homeAddress: initialData?.homeAddress || '',
    workLocation: initialData?.workLocation || '',
    jobTitle: initialData?.jobTitle || '',
    hireDate: initialData?.hireDate?.split('T')[0] || '',
    terminationDate: initialData?.terminationDate?.split('T')[0] || '',
    licenseNumber: initialData?.licenseNumber || '',
    licenseType: initialData?.licenseType || '',
    licenseIssueDate: initialData?.licenseIssueDate?.split('T')[0] || '',
    licenseIssuePlace: initialData?.licenseIssuePlace || '',
    licenseExpiryDate: initialData?.licenseExpiryDate?.split('T')[0] || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employeeId || !form.name) {
      alert('کد پرسنلی و نام الزامی است');
      return;
    }
    onSave(form);
  };

  const inputClass = "w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 text-sm";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label className={labelClass}>کد پرسنلی *</label>
        <input type="text" value={form.employeeId} onChange={e => setForm({...form, employeeId: e.target.value})} className={inputClass} required />
      </div>
      <div>
        <label className={labelClass}>نام *</label>
        <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className={inputClass} required />
      </div>
      <div>
        <label className={labelClass}>نام پدر</label>
        <input type="text" value={form.fatherName} onChange={e => setForm({...form, fatherName: e.target.value})} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>کد ملی</label>
        <input type="text" value={form.nationalId} onChange={e => setForm({...form, nationalId: e.target.value})} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>تاریخ تولد</label>
        <input type="date" value={form.birthDate} onChange={e => setForm({...form, birthDate: e.target.value})} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>شماره شناسنامه</label>
        <input type="text" value={form.idNumber} onChange={e => setForm({...form, idNumber: e.target.value})} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>محل تولد</label>
        <input type="text" value={form.birthPlace} onChange={e => setForm({...form, birthPlace: e.target.value})} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>محل صدور</label>
        <input type="text" value={form.issuePlace} onChange={e => setForm({...form, issuePlace: e.target.value})} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>تلفن منزل</label>
        <input type="text" value={form.homePhone} onChange={e => setForm({...form, homePhone: e.target.value})} className={inputClass} dir="ltr" />
      </div>
      <div>
        <label className={labelClass}>تلفن کار</label>
        <input type="text" value={form.workPhone} onChange={e => setForm({...form, workPhone: e.target.value})} className={inputClass} dir="ltr" />
      </div>
      <div>
        <label className={labelClass}>موبایل</label>
        <input type="text" value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} className={inputClass} dir="ltr" />
      </div>
      <div>
        <label className={labelClass}>کد پستی</label>
        <input type="text" value={form.postalCode} onChange={e => setForm({...form, postalCode: e.target.value})} className={inputClass} />
      </div>
      <div className="md:col-span-2">
        <label className={labelClass}>آدرس منزل</label>
        <input type="text" value={form.homeAddress} onChange={e => setForm({...form, homeAddress: e.target.value})} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>محل کار</label>
        <select value={form.workLocation} onChange={e => setForm({...form, workLocation: e.target.value})} className={inputClass}>
          <option value="">انتخاب کنید</option>
          <option value="تهران">تهران</option>
          <option value="کرج">کرج</option>
          <option value="اصفهان">اصفهان</option>
          <option value="شیراز">شیراز</option>
          <option value="مشهد">مشهد</option>
          <option value="تبریز">تبریز</option>
          <option value="اهواز">اهواز</option>
          <option value="قم">قم</option>
          <option value="رشت">رشت</option>
          <option value="کرمان">کرمان</option>
          <option value="ارومیه">ارومیه</option>
          <option value="سایر">سایر</option>
        </select>
      </div>
      <div>
        <label className={labelClass}>عنوان شغلی</label>
        <select value={form.jobTitle} onChange={e => setForm({...form, jobTitle: e.target.value})} className={inputClass}>
          <option value="">انتخاب کنید</option>
          <option value="راننده پایه یکم">راننده پایه یکم</option>
          <option value="راننده پایه دوم">راننده پایه دوم</option>
          <option value="راننده پایه سوم">راننده پایه سوم</option>
          <option value="راننده کمکی">راننده کمکی</option>
          <option value="راننده سرویس">راننده سرویس</option>
          <option value="راننده توزیع">راننده توزیع</option>
          <option value="راننده مدیریت">راننده مدیریت</option>
          <option value="سرپرست رانندگان">سرپرست رانندگان</option>
          <option value="سایر">سایر</option>
        </select>
      </div>
      <div>
        <label className={labelClass}>تاریخ استخدام</label>
        <input type="date" value={form.hireDate} onChange={e => setForm({...form, hireDate: e.target.value})} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>تاریخ پایان کار</label>
        <input type="date" value={form.terminationDate} onChange={e => setForm({...form, terminationDate: e.target.value})} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>شماره گواهینامه</label>
        <input type="text" value={form.licenseNumber} onChange={e => setForm({...form, licenseNumber: e.target.value})} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>نوع گواهینامه</label>
        <select value={form.licenseType} onChange={e => setForm({...form, licenseType: e.target.value})} className={inputClass}>
          <option value="">انتخاب کنید</option>
          <option value="پایه یکم">پایه یکم</option>
          <option value="پایه دوم">پایه دوم</option>
          <option value="پایه سوم">پایه سوم</option>
        </select>
      </div>
      <div>
        <label className={labelClass}>تاریخ صدور گواهینامه</label>
        <input type="date" value={form.licenseIssueDate} onChange={e => setForm({...form, licenseIssueDate: e.target.value})} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>محل صدور گواهینامه</label>
        <input type="text" value={form.licenseIssuePlace} onChange={e => setForm({...form, licenseIssuePlace: e.target.value})} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>تاریخ انقضا گواهینامه</label>
        <input type="date" value={form.licenseExpiryDate} onChange={e => setForm({...form, licenseExpiryDate: e.target.value})} className={inputClass} />
      </div>

      <div className="md:col-span-3 flex justify-end gap-3 pt-4 border-t mt-4">
        <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
          انصراف
        </button>
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          ذخیره
        </button>
      </div>
    </form>
  );
};

// Company Vehicle Form
const CompanyVehicleForm: React.FC<{
  initialData: CompanyVehicle | null;
  onSave: (data: any) => void;
  onCancel: () => void;
}> = ({ initialData, onSave, onCancel }) => {
  const [form, setForm] = useState({
    vehicleCode: initialData?.vehicleCode || '',
    platePart1: initialData?.plateNumber?.part1 || '',
    plateLetter: initialData?.plateNumber?.letter || '',
    platePart2: initialData?.plateNumber?.part2 || '',
    plateCityCode: initialData?.plateNumber?.cityCode || '',
    brand: initialData?.brand || '',
    model: initialData?.model || '',
    type: initialData?.type || '',
    color: initialData?.color || '',
    year: initialData?.year?.toString() || '',
    vin: initialData?.vin || '',
    chassisNumber: initialData?.chassisNumber || '',
    engineNumber: initialData?.engineNumber || '',
    serialNumber: initialData?.serialNumber || '',
    ownerName: initialData?.ownerName || '',
    holdingCompany: initialData?.holdingCompany || '',
    mihanCompany: initialData?.mihanCompany || '',
    vehicleCategory: initialData?.vehicleCategory || '',
    usageType: initialData?.usageType || '',
    vehicleTip: initialData?.vehicleTip || '',
    capacity: initialData?.capacity || '',
    wheelCount: initialData?.wheelCount?.toString() || '',
    axleCount: initialData?.axleCount?.toString() || '',
    cylinderCount: initialData?.cylinderCount?.toString() || '',
    domainName: initialData?.domainName || '',
    fuelType: initialData?.fuelType || '',
    status: initialData?.status || 'Active',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.holdingCompany || !form.type) {
      alert('انتخاب هلدینگ و نوع وسیله نقلیه الزامی است');
      return;
    }
    onSave({
      ...form,
      plateNumber: {
        part1: form.platePart1,
        letter: form.plateLetter,
        part2: form.platePart2,
        cityCode: form.plateCityCode,
      },
      year: form.year ? parseInt(form.year) : null,
      wheelCount: form.wheelCount ? parseInt(form.wheelCount) : null,
      axleCount: form.axleCount ? parseInt(form.axleCount) : null,
      cylinderCount: form.cylinderCount ? parseInt(form.cylinderCount) : null,
    });
  };

  const inputClass = "w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 text-sm";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";
  const sectionClass = "bg-gray-50 p-4 rounded-lg mb-4";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* بخش ۱: انتخاب هلدینگ و نوع وسیله نقلیه */}
      <div className={sectionClass}>
        <h3 className="font-bold text-gray-700 mb-3 border-b pb-2">۱. انتخاب هلدینگ و نوع وسیله</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>انتخاب هلدینگ *</label>
            <select value={form.holdingCompany} onChange={e => setForm({...form, holdingCompany: e.target.value})} className={inputClass} required>
              <option value="">-- انتخاب کنید --</option>
              <option value="هلدینگ میهن">هلدینگ میهن</option>
              <option value="متفرقه">متفرقه</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>نوع وسیله نقلیه *</label>
            <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className={inputClass} required>
              <option value="">-- انتخاب کنید --</option>
              <option value="خودرو سنگین">خودرو سنگین</option>
              <option value="خودرو نیمه سنگین">خودرو نیمه سنگین</option>
              <option value="سواری">سواری</option>
              <option value="نیمه یدک (تریلر)">نیمه یدک (تریلر)</option>
              <option value="نیمه یدک (کفی و چادری)">نیمه یدک (کفی و چادری)</option>
              <option value="نیمه یدک (تانکر)">نیمه یدک (تانکر)</option>
              <option value="وانت">وانت</option>
              <option value="ادوات کشاورزی">ادوات کشاورزی</option>
              <option value="ادوات راه سازی و پروژه ای">ادوات راه سازی و پروژه ای</option>
              <option value="موتور سیکلت">موتور سیکلت</option>
              <option value="لیفتراک">لیفتراک</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>شرکت *</label>
            <select value={form.mihanCompany} onChange={e => setForm({...form, mihanCompany: e.target.value})} className={inputClass}>
              <option value="">-- انتخاب کنید --</option>
              <option value="پخش سراسری میهن">پخش سراسری میهن</option>
              <option value="شهرنوشیدنی">شهرنوشیدنی</option>
              <option value="پاندا">پاندا</option>
              <option value="کارخانه میهن">کارخانه میهن</option>
            </select>
          </div>
        </div>
      </div>

      {/* بخش ۲: شناسه و مدل خودرو */}
      <div className={sectionClass}>
        <h3 className="font-bold text-gray-700 mb-3 border-b pb-2">۲. شناسه و مدل خودرو</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>برند *</label>
            <input 
              type="text" 
              value={form.brand} 
              onChange={e => setForm({...form, brand: e.target.value, model: '', vehicleTip: ''})} 
              className={inputClass} 
              placeholder="انتخاب یا تایپ کنید..."
              list="brand-list"
            />
            <datalist id="brand-list">
              {getBrandsForType(form.type).map(b => <option key={b} value={b} />)}
            </datalist>
          </div>
          <div>
            <label className={labelClass}>مدل اصلی *</label>
            <input 
              type="text" 
              value={form.model} 
              onChange={e => setForm({...form, model: e.target.value, vehicleTip: ''})} 
              className={inputClass} 
              placeholder="انتخاب یا تایپ کنید..."
              list="model-list"
            />
            <datalist id="model-list">
              {Object.keys(getModelsForBrand(form.type, form.brand)).map(m => <option key={m} value={m} />)}
            </datalist>
          </div>
          <div>
            <label className={labelClass}>تیپ خودرو</label>
            <input 
              type="text" 
              value={form.vehicleTip} 
              onChange={e => setForm({...form, vehicleTip: e.target.value})} 
              className={inputClass} 
              placeholder="انتخاب یا تایپ کنید..."
              list="tip-list"
            />
            <datalist id="tip-list">
              {(getModelsForBrand(form.type, form.brand)[form.model] || []).map(t => <option key={t} value={t} />)}
            </datalist>
          </div>
        </div>
      </div>

      {/* بخش ۳: پلاک و شناسه */}
      <div className={sectionClass}>
        <h3 className="font-bold text-gray-700 mb-3 border-b pb-2">۳. پلاک</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>پلاک خودرو</label>
            <div className="flex gap-2 items-center" dir="ltr">
              <input type="text" value={form.platePart1} onChange={e => setForm({...form, platePart1: e.target.value.replace(/\D/g, '')})} className={inputClass + " w-14 text-center"} placeholder="12" maxLength={2} />
              <select value={form.plateLetter} onChange={e => setForm({...form, plateLetter: e.target.value})} className={inputClass + " w-16"}>
                <option value="">-</option>
                {persianAlphabet.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <input type="text" value={form.platePart2} onChange={e => setForm({...form, platePart2: e.target.value.replace(/\D/g, '')})} className={inputClass + " w-16 text-center"} placeholder="888" maxLength={3} />
              <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded">ایران</span>
              <input type="text" value={form.plateCityCode} onChange={e => setForm({...form, plateCityCode: e.target.value.replace(/\D/g, '')})} className={inputClass + " w-14 text-center"} placeholder="21" maxLength={2} />
            </div>
          </div>
          <div>
            <label className={labelClass}>شماره بدنه/سریال</label>
            <input type="text" value={form.serialNumber} onChange={e => setForm({...form, serialNumber: e.target.value})} className={inputClass} dir="ltr" placeholder="برای خودروهای بدون پلاک" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label className={labelClass}>کد خودرو (سنگین/نیمه یدک)</label>
            <input type="text" value={form.vehicleCode} onChange={e => setForm({...form, vehicleCode: e.target.value})} className={inputClass} placeholder="مثال: TRK-001, SEMI-002" />
            <p className="text-xs text-gray-500 mt-1">کد منحصر به فرد برای جستجو و تخصیص خودرو</p>
          </div>
        </div>
      </div>

      {/* بخش ۴: مشخصات عمومی */}
      <div className={sectionClass}>
        <h3 className="font-bold text-gray-700 mb-3 border-b pb-2">۴. مشخصات عمومی</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>انتخاب شعبه *</label>
            <input 
              type="text" 
              value={form.domainName} 
              onChange={e => setForm({...form, domainName: e.target.value})} 
              className={inputClass}
              placeholder="انتخاب یا تایپ کنید..."
              list="domain-list"
            />
            <datalist id="domain-list">
              <option value="تهران" />
              <option value="البرز" />
              <option value="اصفهان" />
              <option value="شیراز" />
              <option value="مشهد" />
              <option value="تبریز" />
              <option value="کرمان" />
              <option value="یزد" />
              <option value="قم" />
            </datalist>
          </div>
          <div>
            <label className={labelClass}>رنگ</label>
            <input 
              type="text" 
              value={form.color} 
              onChange={e => setForm({...form, color: e.target.value})} 
              className={inputClass}
              placeholder="انتخاب یا تایپ کنید..."
              list="color-list"
            />
            <datalist id="color-list">
              {vehicleColors.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label className={labelClass}>وضعیت خودرو</label>
            <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className={inputClass}>
              {vehicleStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* بخش ۵: مشخصات فنی و تکمیلی */}
      <div className={sectionClass}>
        <h3 className="font-bold text-gray-700 mb-3 border-b pb-2">۵. مشخصات فنی و تکمیلی</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className={labelClass}>شماره VIN</label>
            <input type="text" value={form.vin} onChange={e => setForm({...form, vin: e.target.value})} className={inputClass} dir="ltr" />
          </div>
          <div>
            <label className={labelClass}>شماره شاسی</label>
            <input type="text" value={form.chassisNumber} onChange={e => setForm({...form, chassisNumber: e.target.value})} className={inputClass} dir="ltr" />
          </div>
          <div>
            <label className={labelClass}>شماره موتور</label>
            <input type="text" value={form.engineNumber} onChange={e => setForm({...form, engineNumber: e.target.value})} className={inputClass} dir="ltr" />
          </div>
          <div>
            <label className={labelClass}>سال ساخت</label>
            <input type="number" value={form.year} onChange={e => setForm({...form, year: e.target.value})} className={inputClass} placeholder="1402" />
          </div>
          <div>
            <label className={labelClass}>نوع سوخت</label>
            <select value={form.fuelType} onChange={e => setForm({...form, fuelType: e.target.value})} className={inputClass}>
              <option value="">-- انتخاب کنید --</option>
              {fuelTypes.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4">
          <div>
            <label className={labelClass}>تعداد سیلندر</label>
            <select value={form.cylinderCount} onChange={e => setForm({...form, cylinderCount: e.target.value})} className={inputClass}>
              <option value="">-</option>
              {cylinderCounts.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>تعداد محور</label>
            <select value={form.axleCount} onChange={e => setForm({...form, axleCount: e.target.value})} className={inputClass}>
              <option value="">-</option>
              {axleCounts.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>تعداد چرخ</label>
            <select value={form.wheelCount} onChange={e => setForm({...form, wheelCount: e.target.value})} className={inputClass}>
              <option value="">-</option>
              {wheelCounts.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>ظرفیت</label>
            <select value={form.capacity} onChange={e => setForm({...form, capacity: e.target.value})} className={inputClass}>
              <option value="">-</option>
              {capacities.map(c => <option key={c} value={c}>{c} تن</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>نوع کاربری</label>
            <select value={form.usageType} onChange={e => setForm({...form, usageType: e.target.value})} className={inputClass}>
              <option value="">-</option>
              {usageTypes.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div>
            <label className={labelClass}>نام حوزه</label>
            <input type="text" value={form.domainName} onChange={e => setForm({...form, domainName: e.target.value})} className={inputClass} placeholder="مثلاً: تهران، البرز، ..." />
          </div>
        </div>
      </div>

      {/* دکمه‌های ذخیره/انصراف */}
      <div className="flex justify-end gap-3 pt-4 border-t mt-4">
        <button type="button" onClick={onCancel} className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
          انصراف
        </button>
        <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          ذخیره
        </button>
      </div>
    </form>
  );
};

// Personal Driver Form
const PersonalDriverForm: React.FC<{
  initialData: PersonalDriver | null;
  onSave: (data: any) => void;
  onCancel: () => void;
}> = ({ initialData, onSave, onCancel }) => {
  const [form, setForm] = useState({
    nationalId: initialData?.nationalId || '',
    name: initialData?.name || '',
    mobile: initialData?.mobile || '',
    driverSmartId: initialData?.driverSmartId || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nationalId || !form.name || !form.mobile || !form.driverSmartId) {
      alert('همه فیلدها الزامی است');
      return;
    }
    onSave(form);
  };

  const inputClass = "w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 text-sm";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className={labelClass}>کد ملی *</label>
        <input 
          type="text" 
          value={form.nationalId} 
          onChange={e => setForm({...form, nationalId: e.target.value})} 
          className={inputClass} 
          required 
        />
      </div>
      <div>
        <label className={labelClass}>نام *</label>
        <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className={inputClass} required />
      </div>
      <div>
        <label className={labelClass}>موبایل *</label>
        <input type="text" value={form.mobile} onChange={e => setForm({...form, mobile: e.target.value})} className={inputClass} required dir="ltr" />
      </div>
      <div>
        <label className={labelClass}>هوشمند راننده *</label>
        <input type="text" value={form.driverSmartId} onChange={e => setForm({...form, driverSmartId: e.target.value})} className={inputClass} required />
      </div>

      <div className="md:col-span-2 flex justify-end gap-3 pt-4 border-t mt-4">
        <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
          انصراف
        </button>
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          ذخیره
        </button>
      </div>
    </form>
  );
};

// Personal Vehicle Form
const PersonalVehicleForm: React.FC<{
  initialData: PersonalVehicle | null;
  onSave: (data: any) => void;
  onCancel: () => void;
}> = ({ initialData, onSave, onCancel }) => {
  const [form, setForm] = useState({
    truckSmartId: initialData?.truckSmartId || '',
    platePart1: initialData?.platePart1 || '',
    plateLetter: initialData?.plateLetter || '',
    platePart2: initialData?.platePart2 || '',
    plateCityCode: initialData?.plateCityCode || '',
    vehicleType: initialData?.vehicleType || '',
    vehicleUsage: initialData?.vehicleUsage || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.truckSmartId || !form.platePart1 || !form.plateLetter || !form.platePart2 || !form.plateCityCode || !form.vehicleType) {
      alert('هوشمند کامیون، پلاک و نوع خودرو الزامی است');
      return;
    }
    onSave(form);
  };

  const inputClass = "w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500 text-sm";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className={labelClass}>هوشمند کامیون *</label>
        <input type="text" value={form.truckSmartId} onChange={e => setForm({...form, truckSmartId: e.target.value})} className={inputClass} required />
      </div>
      <div>
        <label className={labelClass}>پلاک *</label>
        <div className="flex gap-2 items-center" dir="ltr">
          <input type="text" value={form.platePart1} onChange={e => setForm({...form, platePart1: e.target.value.replace(/\D/g, '')})} className={inputClass + " w-14 text-center"} placeholder="12" maxLength={2} required />
          <select value={form.plateLetter} onChange={e => setForm({...form, plateLetter: e.target.value})} className={inputClass + " w-16"} required>
            <option value="">-</option>
            {persianAlphabet.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <input type="text" value={form.platePart2} onChange={e => setForm({...form, platePart2: e.target.value.replace(/\D/g, '')})} className={inputClass + " w-16 text-center"} placeholder="345" maxLength={3} required />
          <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded">ایران</span>
          <input type="text" value={form.plateCityCode} onChange={e => setForm({...form, plateCityCode: e.target.value.replace(/\D/g, '')})} className={inputClass + " w-14 text-center"} placeholder="67" maxLength={2} required />
        </div>
      </div>
      <div>
        <label className={labelClass}>نوع خودرو *</label>
        <select value={form.vehicleType} onChange={e => setForm({...form, vehicleType: e.target.value})} className={inputClass} required>
          <option value="">انتخاب کنید</option>
          {vehicleTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          <option value="کامیون">کامیون</option>
          <option value="کامیونت">کامیونت</option>
          <option value="تریلی">تریلی</option>
          <option value="کشنده">کشنده</option>
          <option value="خاور">خاور</option>
          <option value="یخچالدار">یخچالدار</option>
          <option value="تانکر">تانکر</option>
          <option value="کفی">کفی</option>
          <option value="چادری">چادری</option>
          <option value="بونکر">بونکر</option>
          <option value="سایر">سایر</option>
        </select>
      </div>
      <div>
        <label className={labelClass}>نوع استفاده</label>
        <select value={form.vehicleUsage} onChange={e => setForm({...form, vehicleUsage: e.target.value})} className={inputClass}>
          <option value="">انتخاب کنید</option>
          <option value="حمل بار">حمل بار</option>
          <option value="حمل یخچالی">حمل یخچالی</option>
          <option value="حمل مایعات">حمل مایعات</option>
          <option value="حمل فله">حمل فله</option>
          <option value="حمل کانتینر">حمل کانتینر</option>
          <option value="توزیع شهری">توزیع شهری</option>
          <option value="توزیع بین شهری">توزیع بین شهری</option>
          <option value="سایر">سایر</option>
        </select>
      </div>

      <div className="md:col-span-2 flex justify-end gap-3 pt-4 border-t mt-4">
        <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
          انصراف
        </button>
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          ذخیره
        </button>
      </div>
    </form>
  );
};

export default AdminResourceManagement;


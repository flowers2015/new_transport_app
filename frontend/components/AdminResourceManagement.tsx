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
  accountNumber?: string;
  createdAt: string;
  updatedAt: string;
}

interface CompanyVehicle {
  id: string;
  plateNumber: { part1: string; letter: string; part2: string; cityCode: string };
  serialNumber?: string;
  model: string;
  brand?: string;
  vehicleType?: string;
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
      const { cachedFetch } = await import('../utils/apiCache');
      const data = await cachedFetch(getApiUrl('drivers'), { headers }, 10 * 60 * 1000); // 10 min cache
      setCompanyDrivers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchCompanyVehicles = async () => {
    try {
      const { cachedFetch } = await import('../utils/apiCache');
      const data = await cachedFetch(getApiUrl('vehicles'), { headers }, 10 * 60 * 1000); // 10 min cache
      setCompanyVehicles(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchPersonalDrivers = async () => {
    try {
      console.log('🔄 [fetchPersonalDrivers] Fetching personal drivers...');
      const { cachedFetch } = await import('../utils/apiCache');
      const data = await cachedFetch(getApiUrl('personal-drivers'), { headers }, 10 * 60 * 1000); // 10 min cache
      console.log('✅ [fetchPersonalDrivers] Received data:', Array.isArray(data) ? data.length : 0, 'drivers');
      setPersonalDrivers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('❌ [fetchPersonalDrivers] Error:', err);
      setError(err.message);
    }
  };

  const fetchPersonalVehicles = async () => {
    try {
      const { cachedFetch } = await import('../utils/apiCache');
      const data = await cachedFetch(getApiUrl('personal-vehicles'), { headers }, 10 * 60 * 1000); // 10 min cache
      setPersonalVehicles(Array.isArray(data) ? data : []);
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
          d.mobile?.includes(query) ||
          d.accountNumber?.includes(query)
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
            <th className="px-3 py-2 text-right font-medium text-gray-500">شماره حساب</th>
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
              <td className="px-3 py-2 font-mono" dir="ltr">{driver.accountNumber || '-'}</td>
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
            <th className="px-3 py-2 text-right font-medium text-gray-500">نوع وسیله نقلیه</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">نوع خودرو</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">برند</th>
            <th className="px-3 py-2 text-right font-medium text-gray-500">مدل</th>
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
              <td className="px-3 py-2">
                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                  {vehicle.vehicleCategory || vehicle.type || '-'}
                </span>
              </td>
              <td className="px-3 py-2">
                <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                  {vehicle.vehicleType || '-'}
                </span>
              </td>
              <td className="px-3 py-2">{vehicle.brand || '-'}</td>
              <td className="px-3 py-2">{vehicle.model || '-'}</td>
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
            <ImportExcelButton 
              type={activeTab} 
              onImportSuccess={fetchData}
            />
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
    accountNumber: initialData?.accountNumber || '',
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
      <div>
        <label className={labelClass}>شماره حساب</label>
        <input type="text" value={form.accountNumber} onChange={e => setForm({...form, accountNumber: e.target.value})} className={inputClass} dir="ltr" />
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
    vehicleType: initialData?.vehicleType || '',
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

  // States for API data
  const [apiVehicleTypes, setApiVehicleTypes] = useState<string[]>([]);
  const [apiBrands, setApiBrands] = useState<string[]>([]);
  const [apiModels, setApiModels] = useState<string[]>([]);
  const [apiTips, setApiTips] = useState<any[]>([]);

  // Fetch vehicle types from API
  useEffect(() => {
    const fetchVehicleTypes = async () => {
      if (!form.type) {
        setApiVehicleTypes([]);
        return;
      }
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(getApiUrl(`vehicle-specs/vehicle-types?category=${encodeURIComponent(form.type)}`), {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setApiVehicleTypes(data);
        }
      } catch (err) {
        console.error('Error fetching vehicle types:', err);
      }
    };
    fetchVehicleTypes();
  }, [form.type]);

  // Fetch brands from API
  useEffect(() => {
    const fetchBrands = async () => {
      if (!form.type) {
        setApiBrands([]);
        return;
      }
      try {
        const token = localStorage.getItem('token');
        let url = `vehicle-specs/brands?category=${encodeURIComponent(form.type)}`;
        if (form.vehicleType) {
          url += `&vehicleType=${encodeURIComponent(form.vehicleType)}`;
        }
        const res = await fetch(getApiUrl(url), {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setApiBrands(data);
        }
      } catch (err) {
        console.error('Error fetching brands:', err);
      }
    };
    fetchBrands();
  }, [form.type, form.vehicleType]);

  // Fetch models from API
  useEffect(() => {
    const fetchModels = async () => {
      if (!form.type || !form.brand) {
        setApiModels([]);
        return;
      }
      try {
        const token = localStorage.getItem('token');
        let url = `vehicle-specs/models?category=${encodeURIComponent(form.type)}&brand=${encodeURIComponent(form.brand)}`;
        if (form.vehicleType) {
          url += `&vehicleType=${encodeURIComponent(form.vehicleType)}`;
        }
        const res = await fetch(getApiUrl(url), {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setApiModels(data);
        }
      } catch (err) {
        console.error('Error fetching models:', err);
      }
    };
    fetchModels();
  }, [form.type, form.brand, form.vehicleType]);

  // Fetch tips from API
  useEffect(() => {
    const fetchTips = async () => {
      if (!form.type || !form.brand || !form.model) {
        setApiTips([]);
        return;
      }
      try {
        const token = localStorage.getItem('token');
        let url = `vehicle-specs/tips?category=${encodeURIComponent(form.type)}&brand=${encodeURIComponent(form.brand)}&model=${encodeURIComponent(form.model)}`;
        if (form.vehicleType) {
          url += `&vehicleType=${encodeURIComponent(form.vehicleType)}`;
        }
        const res = await fetch(getApiUrl(url), {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setApiTips(data);
        }
      } catch (err) {
        console.error('Error fetching tips:', err);
      }
    };
    fetchTips();
  }, [form.type, form.brand, form.model, form.vehicleType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.holdingCompany || !form.type) {
      alert('انتخاب هلدینگ و نوع وسیله نقلیه الزامی است');
      return;
    }
    
    // Ensure model is not empty (required field)
    const finalModel = form.model?.trim() || form.vehicleTip?.trim() || 'نامشخص';
    
    onSave({
      ...form,
      model: finalModel,
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>نوع خودرو</label>
            <input 
              type="text" 
              value={form.vehicleType} 
              onChange={e => {
                const newVehicleType = e.target.value;
                // فقط vehicleTip را reset کنیم، brand و model را نگه داریم (برای ویرایش)
                setForm({...form, vehicleType: newVehicleType, vehicleTip: ''});
              }} 
              className={inputClass} 
              placeholder="انتخاب یا تایپ کنید..."
              list="vehicle-type-list"
            />
            <datalist id="vehicle-type-list">
              {apiVehicleTypes.map(vt => <option key={vt} value={vt} />)}
            </datalist>
          </div>
          <div>
            <label className={labelClass}>برند *</label>
            <input 
              type="text" 
              value={form.brand} 
              onChange={e => {
                const newBrand = e.target.value;
                // فقط model و vehicleTip را reset کنیم (brand را نگه داریم)
                setForm({...form, brand: newBrand, model: '', vehicleTip: ''});
              }} 
              className={inputClass} 
              placeholder="انتخاب یا تایپ کنید..."
              list="brand-list"
              required
            />
            <datalist id="brand-list">
              {(apiBrands.length > 0 ? apiBrands : getBrandsForType(form.type)).map(b => <option key={b} value={b} />)}
            </datalist>
          </div>
          <div>
            <label className={labelClass}>مدل اصلی *</label>
            <input 
              type="text" 
              value={form.model} 
              onChange={e => {
                const newModel = e.target.value;
                // فقط vehicleTip را reset کنیم (model را نگه داریم)
                setForm({...form, model: newModel, vehicleTip: ''});
              }} 
              className={inputClass} 
              placeholder="انتخاب یا تایپ کنید..."
              list="model-list"
              required
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

// ============================================
// Import Excel Component
// ============================================
const ImportExcelButton: React.FC<{
  type: 'company-drivers' | 'company-vehicles' | 'personal-drivers' | 'personal-vehicles';
  onImportSuccess: () => void;
}> = ({ type, onImportSuccess }) => {
  const [showDialog, setShowDialog] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      alert('لطفاً فایل اکسل را انتخاب کنید');
      return;
    }

    setUploading(true);
    setResult(null);

    try {
      console.log('🚀 [ImportExcel] Starting upload...', { type, fileName: file.name });
      
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);

      let endpoint = '';
      switch (type) {
        case 'company-drivers':
          endpoint = 'drivers/import-excel';
          break;
        case 'company-vehicles':
          endpoint = 'vehicles/import-excel';
          break;
        case 'personal-drivers':
          endpoint = 'personal-drivers/import-excel';
          break;
        case 'personal-vehicles':
          endpoint = 'personal-vehicles/import-excel';
          break;
        default:
          throw new Error('نوع نامعتبر');
      }

      console.log('📡 [ImportExcel] Sending request to:', getApiUrl(endpoint));

      const response = await fetch(getApiUrl(endpoint), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      console.log('📥 [ImportExcel] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [ImportExcel] Error response:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText || 'خطا در آپلود فایل' };
        }
        throw new Error(errorData.message || 'خطا در آپلود فایل');
      }

      const responseText = await response.text();
      console.log('📦 [ImportExcel] Response text:', responseText);
      
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ [ImportExcel] JSON parse error:', parseError);
        throw new Error('پاسخ سرور قابل پردازش نیست');
      }

      console.log('✅ [ImportExcel] Parsed data:', data);
      
      // Backend response structure: { message, results: { total, success, updated, skipped, errors: [] } }
      const results = data.results || data; // اگر results وجود داشت استفاده کن، وگرنه خود data
      setResult(results);
      
      const successCount = results.success || 0;
      const updatedCount = results.updated || 0;
      const skippedCount = results.skipped || 0;
      const errorCount = Array.isArray(results.errors) ? results.errors.length : (results.errors || 0);
      const totalCount = results.total || 0;
      
      console.log('📊 [ImportExcel] Import summary:', {
        total: totalCount,
        success: successCount,
        updated: updatedCount,
        skipped: skippedCount,
        errors: errorCount
      });
      
      alert(`✅ Import موفق!\n\nکل: ${totalCount}\nموفق: ${successCount}\nبه‌روزرسانی شده: ${updatedCount}\nرد شده: ${skippedCount}\nخطا: ${errorCount}`);
      
      if (errorCount > 0 && results.errors && Array.isArray(results.errors)) {
        console.error('❌ [ImportExcel] جزئیات خطاها:', results.errors);
        if (results.errors.length > 0) {
          const errorDetails = results.errors.slice(0, 5).map((e: any) => `ردیف ${e.row}: ${e.error}`).join('\n');
          console.warn('⚠️ [ImportExcel] نمونه خطاها:', errorDetails);
        }
      }
      
      console.log('🔄 [ImportExcel] Calling onImportSuccess...');
      // فراخوانی fetchData برای refresh کردن جدول
      await onImportSuccess();
      console.log('✅ [ImportExcel] Data refreshed');
      setFile(null);
      setShowDialog(false);
      console.log('✅ [ImportExcel] Import completed successfully');
    } catch (error: any) {
      console.error('❌ [ImportExcel] Error:', error);
      alert(`❌ خطا: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowDialog(true)}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
      >
        📥 Import از اکسل
      </button>

      {showDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                Import {
                  type === 'company-drivers' ? 'رانندگان شرکتی' :
                  type === 'company-vehicles' ? 'خودروهای شرکتی' :
                  type === 'personal-drivers' ? 'رانندگان شخصی' : 'خودروهای شخصی'
                } از اکسل
              </h2>
              <button
                onClick={() => { setShowDialog(false); setFile(null); setResult(null); }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  انتخاب فایل اکسل (.xlsx, .xls)
                </label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileSelect}
                  className="w-full px-3 py-2 border rounded-lg"
                  disabled={uploading}
                />
                {file && (
                  <p className="mt-2 text-sm text-gray-600">
                    فایل انتخاب شده: {file.name}
                  </p>
                )}
              </div>

              {type === 'company-drivers' && (
                <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
                  <strong>ستون‌های مورد نیاز:</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li><strong>کد پرسنلی</strong> (اجباری) - نام‌های قابل قبول: "کد پرسنلی", "کدپرسنلی", "employee_id", "employeeId"</li>
                    <li><strong>نام</strong> (اجباری) - نام‌های قابل قبول: "نام", "name"</li>
                    <li><strong>کد ملی</strong> (اختیاری) - نام‌های قابل قبول: "کد ملی", "کدملی", "national_id", "nationalId"</li>
                    <li><strong>نام پدر</strong> (اختیاری) - نام‌های قابل قبول: "نام پدر", "father_name", "fatherName"</li>
                    <li><strong>موبایل</strong> (اختیاری) - نام‌های قابل قبول: "موبایل", "شماره موبایل", "mobile"</li>
                    <li><strong>تلفن محل کار</strong> (اختیاری) - نام‌های قابل قبول: "تلفن محل کار", "تلفن کار", "work_phone", "workPhone"</li>
                    <li><strong>تلفن منزل</strong> (اختیاری) - نام‌های قابل قبول: "تلفن منزل", "تلفن خانه", "home_phone", "homePhone"</li>
                    <li><strong>عنوان شغلی</strong> (اختیاری) - نام‌های قابل قبول: "عنوان شغلی", "شغل", "job_title", "jobTitle"</li>
                    <li><strong>محل کار</strong> (اختیاری) - نام‌های قابل قبول: "محل کار", "work_location", "workLocation"</li>
                    <li><strong>شماره گواهینامه</strong> (اختیاری) - نام‌های قابل قبول: "شماره گواهینامه", "گواهینامه", "license_number", "licenseNumber"</li>
                    <li><strong>نوع گواهینامه</strong> (اختیاری) - نام‌های قابل قبول: "نوع گواهینامه", "license_type", "licenseType"</li>
                    <li><strong>تاریخ استخدام</strong> (اختیاری) - نام‌های قابل قبول: "تاریخ استخدام", "hire_date", "hireDate"</li>
                    <li><strong>تاریخ انقضای گواهینامه</strong> (اختیاری) - نام‌های قابل قبول: "تاریخ انقضای گواهینامه", "license_expiry_date", "licenseExpiryDate"</li>
                  </ul>
                  <p className="mt-2 text-xs text-blue-700">
                    ⚠️ توجه: اگر راننده با کد پرسنلی یا کد ملی موجود باشد، اطلاعات به‌روزرسانی می‌شود
                  </p>
                </div>
              )}

              {type === 'company-vehicles' && (
                <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
                  <strong>ستون‌های مورد نیاز:</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li><strong>مدل</strong> (اجباری) - نام‌های قابل قبول: "مدل", "model"</li>
                    <li><strong>برند</strong> (اختیاری) - نام‌های قابل قبول: "برند", "brand"</li>
                    <li><strong>نوع</strong> (اختیاری) - نام‌های قابل قبول: "نوع", "type", "vehicle_type", "vehicleType"</li>
                    <li><strong>بخش اول پلاک</strong> (اختیاری) - نام‌های قابل قبول: "بخش اول پلاک", "پلاک بخش اول", "plate_part1", "platePart1"</li>
                    <li><strong>حرف پلاک</strong> (اختیاری) - نام‌های قابل قبول: "حرف پلاک", "پلاک حرف", "plate_letter", "plateLetter"</li>
                    <li><strong>بخش دوم پلاک</strong> (اختیاری) - نام‌های قابل قبول: "بخش دوم پلاک", "پلاک بخش دوم", "plate_part2", "platePart2"</li>
                    <li><strong>کد شهر پلاک</strong> (اختیاری) - نام‌های قابل قبول: "کد شهر پلاک", "پلاک کد شهر", "plate_city_code", "plateCityCode"</li>
                    <li><strong>VIN</strong> (اختیاری) - نام‌های قابل قبول: "VIN", "vin", "شماره VIN", "شمارهVIN"</li>
                    <li><strong>شماره سریال</strong> (اختیاری) - نام‌های قابل قبول: "شماره سریال", "serial_number", "serialNumber"</li>
                    <li><strong>کد خودرو</strong> (اختیاری) - نام‌های قابل قبول: "کد خودرو", "vehicle_code", "vehicleCode"</li>
                    <li><strong>شرکت هولدینگ</strong> (اختیاری) - نام‌های قابل قبول: "شرکت هولدینگ", "holding_company", "holdingCompany"</li>
                    <li><strong>شرکت میهن</strong> (اختیاری) - نام‌های قابل قبول: "شرکت میهن", "mihan_company", "mihanCompany"</li>
                    <li><strong>دسته خودرو</strong> (اختیاری) - نام‌های قابل قبول: "دسته خودرو", "vehicle_category", "vehicleCategory"</li>
                    <li><strong>سال</strong> (اختیاری) - نام‌های قابل قبول: "سال", "year"</li>
                    <li><strong>وضعیت</strong> (اختیاری) - نام‌های قابل قبول: "وضعیت", "status"</li>
                  </ul>
                  <p className="mt-2 text-xs text-blue-700">
                    ⚠️ توجه: اگر خودرو با VIN یا کد خودرو موجود باشد، اطلاعات به‌روزرسانی می‌شود
                  </p>
                </div>
              )}

              {type === 'personal-drivers' && (
                <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
                  <strong>ستون‌های مورد نیاز (نام ستون‌ها باید دقیقاً مطابق زیر باشد):</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li><strong>کد ملی</strong> (اجباری) - نام‌های قابل قبول: "کد ملی", "کدملی", "national_id", "nationalId"</li>
                    <li><strong>نام</strong> (اجباری) - نام‌های قابل قبول: "نام", "name"</li>
                    <li><strong>موبایل</strong> (اختیاری) - اگر خالی باشد، بعداً از کاربر گرفته می‌شود</li>
                    <li><strong>کد هوشمند راننده</strong> (اختیاری) - اگر خالی باشد، بعداً از کاربر گرفته می‌شود</li>
                  </ul>
                  <p className="mt-2 text-xs text-blue-700">
                    ⚠️ توجه: نام ستون‌ها در اکسل باید دقیقاً مطابق یکی از نام‌های بالا باشد (بدون فاصله اضافی یا کاراکتر خاص)
                  </p>
                  <p className="mt-1 text-xs text-green-700">
                    ✅ اگر موبایل یا کد هوشمند راننده خالی باشد، در زمان تخصیص از کاربر سوال می‌شود
                  </p>
                </div>
              )}

              {type === 'personal-vehicles' && (
                <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800">
                  <strong>ستون‌های مورد نیاز:</strong>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>کد هوشمند کامیون (اجباری)</li>
                    <li>بخش اول پلاک (اجباری)</li>
                    <li>حرف پلاک (اجباری)</li>
                    <li>بخش دوم پلاک (اجباری)</li>
                    <li>کد شهر پلاک (اجباری)</li>
                    <li>نوع خودرو (اجباری)</li>
                    <li>کاربرد خودرو (اختیاری)</li>
                  </ul>
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowDialog(false); setFile(null); setResult(null); }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  disabled={uploading}
                >
                  انصراف
                </button>
                <button
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {uploading ? 'در حال آپلود...' : 'آپلود و Import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminResourceManagement;


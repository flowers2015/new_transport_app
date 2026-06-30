import React, { useState, useEffect } from 'react';
import { formatJalaliDateTime } from '../utils/jalali';
import { FreightAnnouncementStatus } from '../types';
import { getApiUrl } from '../utils/apiConfig';

interface HistoryEntry {
  id: string;
  user_name: string;
  action: string;
  old_status?: string;
  new_status?: string;
  field_changes?: any;
  description: string;
  created_at: string;
}

interface HistoryResponse {
  announcementId: string;
  announcementCode: string;
  currentStatus: string;
  history: HistoryEntry[];
  totalEvents: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  announcementId: string;
  announcementCode: string;
}

// آیکون‌های مربوط به انواع اکشن‌ها
const ActionIcon: React.FC<{ action: string }> = ({ action }) => {
  const iconClass = "w-6 h-6";
  
  switch (action) {
    case 'CREATED':
      return (
        <div className="bg-green-100 p-2 rounded-full">
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </div>
      );
    case 'EDITED':
    case 'DESTINATIONS_CHANGED':
      return (
        <div className="bg-blue-100 p-2 rounded-full">
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </div>
      );
    case 'APPROVED':
      return (
        <div className="bg-green-100 p-2 rounded-full">
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      );
    case 'REJECTED':
      return (
        <div className="bg-red-100 p-2 rounded-full">
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      );
    case 'ASSIGNED':
    case 'REASSIGNED':
      return (
        <div className="bg-purple-100 p-2 rounded-full">
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
      );
    case 'QUEUE_CHANGED':
      return (
        <div className="bg-orange-100 p-2 rounded-full">
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </div>
      );
    case 'STATUS_CHANGED':
      return (
        <div className="bg-yellow-100 p-2 rounded-full">
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
          </svg>
        </div>
      );
    case 'PAYMENT_RECORDED':
    case 'PAYMENT_CONFIRMED':
      return (
        <div className="bg-green-100 p-2 rounded-full">
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
      );
    case 'DELETED':
      return (
        <div className="bg-red-100 p-2 rounded-full">
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
      );
    case 'CHANGE_REQUESTED':
      return (
        <div className="bg-orange-100 p-2 rounded-full">
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </div>
      );
    case 'CANCELLED':
      return (
        <div className="bg-red-100 p-2 rounded-full">
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      );
    case 'REFERRED_TO_CARRIER':
    case 'CARRIER_REFERRAL_CANCELLED':
    case 'RETURNED_FROM_CARRIER':
    case 'CARRIER_HANDOFF_DONE':
      return (
        <div className="bg-purple-100 p-2 rounded-full">
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </div>
      );
    default:
      return (
        <div className="bg-gray-100 p-2 rounded-full">
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      );
  }
};

// نمایش تغییرات فیلد (اگر موجود باشد)
const FieldChangesDetails: React.FC<{ fieldChanges: any; driverMap?: { [key: string]: { name: string; employeeId: string } }; vehicleMap?: { [key: string]: { plate: string; model?: string } }; personalDriverMap?: { [key: string]: { name: string; contact?: string } }; personalVehicleMap?: { [key: string]: { plate: string; model?: string } } }> = ({ fieldChanges, driverMap = {}, vehicleMap = {}, personalDriverMap = {}, personalVehicleMap = {} }) => {
  if (!fieldChanges || Object.keys(fieldChanges).length === 0) {
    return null;
  }

  return (
    <div className="mt-2 bg-slate-50 rounded p-2 text-xs">
      <div className="font-semibold text-slate-600 mb-1">جزئیات تغییرات:</div>
      <div className="space-y-1">
        {Object.entries(fieldChanges).map(([key, value]: [string, any]) => {
          // مقاصد
          if (key.startsWith('destination_')) {
            if (key.endsWith('_added')) {
              return (
                <div key={key} className="text-green-700">
                  + مقصد اضافه شد: {value.new?.city}
                  {value.new?.tonnage && ` (${Number(value.new.tonnage).toLocaleString('fa-IR')} کیلوگرم)`}
                </div>
              );
            } else if (key.endsWith('_removed')) {
              return (
                <div key={key} className="text-red-700">
                  - مقصد حذف شد: {value.old?.city}
                </div>
              );
            } else {
              // تغییر در مقصد موجود
              const destNum = key.match(/\d+/)?.[0];
              return (
                <div key={key} className="text-blue-700">
                  <div className="font-semibold">مقصد {destNum}:</div>
                  <div className="mr-4 space-y-0.5">
                    {value.city && <div>شهر: از {value.city.old} به {value.city.new}</div>}
                    {value.tonnage && <div>تناژ: از {Number(value.tonnage.old || 0).toLocaleString('fa-IR')} به {Number(value.tonnage.new || 0).toLocaleString('fa-IR')} کیلوگرم</div>}
                    {value.freightCost && <div>کرایه: از {Number(value.freightCost.old || 0).toLocaleString('fa-IR')} به {Number(value.freightCost.new || 0).toLocaleString('fa-IR')} ریال</div>}
                    {value.unloadTime && <div>ساعت تخلیه: از {value.unloadTime.old} به {value.unloadTime.new}</div>}
                  </div>
                </div>
              );
            }
          }
          
      // سایر فیلدها - ترجمه به فارسی
      const fieldLabels: { [key: string]: string } = {
        assignmentType: 'صف تخصیص',
        assignment_type: 'صف تخصیص',
        status: 'وضعیت',
        cargoValue: 'ارزش بار',
        cargo_value: 'ارزش بار',
        vehicleType: 'نوع خودرو',
        vehicle_type: 'نوع خودرو',
        notes: 'توضیحات',
        totalFreightCost: 'کرایه کل',
        total_freight_cost: 'کرایه کل',
        assignedDriverId: 'راننده',
        assigned_driver_id: 'راننده',
        assignedVehicleId: 'خودرو',
        assigned_vehicle_id: 'خودرو',
        originCity: 'مبدا',
        origin_city: 'مبدا',
        brand: 'برند',
        cartonCount: 'تعداد کارتن',
        carton_count: 'تعداد کارتن',
        priority: 'اولویت',
        platformArrivalTime: 'ساعت حضور در سکو',
        platform_arrival_time: 'ساعت حضور در سکو',
        loadingDate: 'تاریخ بارگیری',
        loading_date: 'تاریخ بارگیری',
        rejectionReason: 'علت رد',
        rejection_reason: 'علت رد',
        representativeName: 'نام نماینده',
        representative_name: 'نام نماینده',
        representativeType: 'نوع نماینده',
        representative_type: 'نوع نماینده',
        request_type: 'نوع درخواست',
        target_queue: 'صف مقصد',
        handoff_carrier_id: 'باربری ارجاع‌شده',
        باربری: 'باربری',
        handoff_status: 'وضعیت واگذاری',
        freight_cost_locked_at: 'زمان قفل کرایه',
      };
      
      const label = fieldLabels[key] || key;
      
      // ترجمه مقادیر خاص
      let oldValue = value.old;
      let newValue = value.new;
      
      if (key === 'assignmentType' || key === 'assignment_type' || key === 'target_queue') {
        oldValue = oldValue === 'company' ? 'شرکتی' : oldValue === 'personal' ? 'شخصی' : oldValue;
        newValue = newValue === 'company' ? 'شرکتی' : newValue === 'personal' ? 'شخصی' : newValue;
      } else if (key === 'request_type') {
        const requestTypeLabels: { [key: string]: string } = {
          'change': 'تغییر نوع خودرو',
          'split': 'تقسیم',
          'merge': 'تجمیع'
        };
        oldValue = requestTypeLabels[oldValue] || oldValue;
        newValue = requestTypeLabels[newValue] || newValue;
      } else if (key === 'status') {
        // ترجمه وضعیت‌ها
        const statusLabels: { [key: string]: string } = {
          'Draft': 'پیش‌نویس',
          'PendingManagerApproval': 'در انتظار تایید مدیر',
          'PendingCompanyAssignment': 'در انتظار تخصیص شرکتی',
          'PendingPersonalAssignment': 'در انتظار تخصیص شخصی',
          'Assigned': 'تخصیص یافته',
          'InTransit': 'در حال حمل',
          'Delivered': 'تحویل داده شده',
          'Cancelled': 'لغو شده',
          'Rejected': 'رد شده',
          'ChangeRequested': 'درخواست تغییر',
          'Reannounced': 'اعلام مجدد شده',
          'Leftover': 'بار مانده'
        };
        oldValue = statusLabels[oldValue] || oldValue;
        newValue = statusLabels[newValue] || newValue;
      } else if (key === 'loadingDate' || key === 'loading_date') {
        // فرمت تاریخ
        try {
          if (oldValue) {
            const oldDate = new Date(oldValue);
            oldValue = oldDate.toLocaleDateString('fa-IR');
          }
          if (newValue) {
            const newDate = new Date(newValue);
            newValue = newDate.toLocaleDateString('fa-IR');
          }
        } catch (e) {
          // اگه تاریخ معتبر نبود، همون مقدار اصلی رو نگه دار
        }
      } else if (key === 'assigned_driver_id' || key === 'assignedDriverId') {
        // تبدیل UUID راننده به نام و کد پرسنلی (اول شرکتی، بعد شخصی)
        const oldDriver = oldValue ? (driverMap[oldValue] || personalDriverMap[oldValue]) : null;
        const newDriver = newValue ? (driverMap[newValue] || personalDriverMap[newValue]) : null;
        if (oldDriver) {
          if ('employeeId' in oldDriver) {
            // راننده شرکتی
            oldValue = `${oldDriver.name}${oldDriver.employeeId ? ` (${oldDriver.employeeId})` : ''}`;
          } else {
            // راننده شخصی
            oldValue = oldDriver.name || '-';
          }
        } else {
          oldValue = oldValue || '-';
        }
        if (newDriver) {
          if ('employeeId' in newDriver) {
            // راننده شرکتی
            newValue = `${newDriver.name}${newDriver.employeeId ? ` (${newDriver.employeeId})` : ''}`;
          } else {
            // راننده شخصی
            newValue = newDriver.name || '-';
          }
        } else {
          newValue = newValue || '-';
        }
      } else if (key === 'assigned_vehicle_id' || key === 'assignedVehicleId') {
        // تبدیل UUID خودرو به پلاک (اول شرکتی، بعد شخصی)
        const oldVehicle = oldValue ? (vehicleMap[oldValue] || personalVehicleMap[oldValue]) : null;
        const newVehicle = newValue ? (vehicleMap[newValue] || personalVehicleMap[newValue]) : null;
        oldValue = oldVehicle ? oldVehicle.plate : (oldValue || '-');
        newValue = newVehicle ? newVehicle.plate : (newValue || '-');
      }
      
      // نمایش تغییرات کرایه کل با فرمت مناسب
      if (key === 'total_freight_cost' || key === 'totalFreightCost') {
        oldValue = oldValue ? Number(oldValue).toLocaleString('fa-IR') : '-';
        newValue = newValue ? Number(newValue).toLocaleString('fa-IR') : '-';
      }
      
      return (
        <div key={key} className="text-slate-700">
          {label}: 
          <span className="text-red-600 line-through mx-1">{String(oldValue || '-')}</span>
          <span className="mx-1">→</span>
          <span className="text-green-600 mx-1">{String(newValue || '-')}</span>
        </div>
      );
        })}
      </div>
    </div>
  );
};

const FreightHistoryDialog: React.FC<Props> = ({ isOpen, onClose, announcementId, announcementCode }) => {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [driverMap, setDriverMap] = useState<{ [key: string]: { name: string; employeeId: string } }>({});
  const [vehicleMap, setVehicleMap] = useState<{ [key: string]: { plate: string; model?: string } }>({});
  const [personalDriverMap, setPersonalDriverMap] = useState<{ [key: string]: { name: string; contact?: string } }>({});
  const [personalVehicleMap, setPersonalVehicleMap] = useState<{ [key: string]: { plate: string; model?: string } }>({});
  
  useEffect(() => {
    if (isOpen && announcementId) {
      fetchHistory();
    }
  }, [isOpen, announcementId]);
  
  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
      
      const response = await fetch(getApiUrl(`freight-announcements/${announcementId}/history`), { headers });
      
      if (!response.ok) {
        throw new Error('خطا در دریافت تاریخچه');
      }
      
      const data: HistoryResponse = await response.json();
      const historyEntries = data.history || [];
      setHistory(historyEntries);
      
      // استخراج UUID های راننده و خودرو از fieldChanges
      const driverIds = new Set<string>();
      const vehicleIds = new Set<string>();
      
      historyEntries.forEach(entry => {
        if (entry.field_changes) {
          Object.entries(entry.field_changes).forEach(([key, value]: [string, any]) => {
            if ((key === 'assigned_driver_id' || key === 'assignedDriverId') && value?.old) driverIds.add(value.old);
            if ((key === 'assigned_driver_id' || key === 'assignedDriverId') && value?.new) driverIds.add(value.new);
            if ((key === 'assigned_vehicle_id' || key === 'assignedVehicleId') && value?.old) vehicleIds.add(value.old);
            if ((key === 'assigned_vehicle_id' || key === 'assignedVehicleId') && value?.new) vehicleIds.add(value.new);
          });
        }
      });
      
      // بهینه‌سازی: لود موازی driver/vehicle ها برای سرعت بیشتر
      const fetchPromises: Promise<void>[] = [];
      
      if (driverIds.size > 0) {
        // لود رانندگان شرکتی
        fetchPromises.push(
          fetch(getApiUrl('drivers'), { headers })
            .then(res => res.ok ? res.json() : Promise.resolve([]))
            .then(drivers => {
              const driverMapData: { [key: string]: { name: string; employeeId: string } } = {};
              drivers.forEach((d: any) => {
                if (driverIds.has(d.id)) {
                  driverMapData[d.id] = { name: d.name, employeeId: d.employee_id || '' };
                }
              });
              setDriverMap(driverMapData);
            })
            .catch(e => console.error('Failed to fetch drivers:', e))
        );
        
        // لود رانندگان شخصی
        fetchPromises.push(
          fetch(getApiUrl('personal-drivers'), { headers })
            .then(res => res.ok ? res.json() : Promise.resolve([]))
            .then(personalDrivers => {
              const personalDriverMapData: { [key: string]: { name: string; contact?: string } } = {};
              personalDrivers.forEach((d: any) => {
                if (driverIds.has(d.id)) {
                  personalDriverMapData[d.id] = { name: d.name || d.driver_name || '-', contact: d.mobile || d.contact || '' };
                }
              });
              setPersonalDriverMap(personalDriverMapData);
            })
            .catch(e => console.error('Failed to fetch personal drivers:', e))
        );
      }
      
      if (vehicleIds.size > 0) {
        // لود خودروهای شرکتی
        fetchPromises.push(
          fetch(getApiUrl('vehicles'), { headers })
            .then(res => res.ok ? res.json() : Promise.resolve([]))
            .then(vehicles => {
              const vehicleMapData: { [key: string]: { plate: string; model?: string } } = {};
              vehicles.forEach((v: any) => {
                if (vehicleIds.has(v.id)) {
                  const plate = v.plate_part1 && v.plate_letter && v.plate_part2 && v.plate_city_code
                    ? `${v.plate_part1}${v.plate_letter}${v.plate_part2}-${v.plate_city_code}`
                    : v.vehicle_code || v.model || 'نامشخص';
                  vehicleMapData[v.id] = { plate, model: v.model };
                }
              });
              setVehicleMap(vehicleMapData);
            })
            .catch(e => console.error('Failed to fetch vehicles:', e))
        );
        
        // لود خودروهای شخصی
        fetchPromises.push(
          fetch(getApiUrl('personal-vehicles'), { headers })
            .then(res => res.ok ? res.json() : Promise.resolve([]))
            .then(personalVehicles => {
              const personalVehicleMapData: { [key: string]: { plate: string; model?: string } } = {};
              personalVehicles.forEach((v: any) => {
                if (vehicleIds.has(v.id)) {
                  const plate = v.plate_part1 && v.plate_letter && v.plate_part2 && v.plate_city_code
                    ? `${v.plate_part1}${v.plate_letter}${v.plate_part2}-${v.plate_city_code}`
                    : (v.platePart1 && v.plateLetter && v.platePart2 && v.plateCityCode
                      ? `${v.platePart1}${v.plateLetter}${v.platePart2}-${v.plateCityCode}`
                      : v.vehicle_type || 'نامشخص');
                  personalVehicleMapData[v.id] = { plate, model: v.vehicle_type || v.model };
                }
              });
              setPersonalVehicleMap(personalVehicleMapData);
            })
            .catch(e => console.error('Failed to fetch personal vehicles:', e))
        );
      }
      
      // اجرای همه fetch ها به صورت موازی
      await Promise.all(fetchPromises);
    } catch (err: any) {
      console.error('Failed to fetch history:', err);
      setError(err.message || 'خطای ناشناخته');
    } finally {
      setLoading(false);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* هدر */}
        <div className="p-4 border-b flex justify-between items-center bg-gradient-to-r from-sky-50 to-blue-50">
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-lg font-bold text-slate-800">
              تاریخچه اعلام بار #{announcementCode}
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-3xl leading-none transition-colors"
          >
            &times;
          </button>
        </div>
        
        {/* بدنه - Timeline */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex justify-center items-center h-64">
              <div className="text-slate-500">در حال بارگذاری...</div>
            </div>
          )}
          
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
              {error}
            </div>
          )}
          
          {!loading && !error && history.length === 0 && (
            <div className="text-center text-slate-500 py-12">
              <svg className="w-16 h-16 mx-auto mb-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>هیچ رویدادی در تاریخچه ثبت نشده است</p>
            </div>
          )}
          
          {!loading && !error && history.length > 0 && (
            <div className="relative">
              {/* خط عمودی Timeline */}
              <div className="absolute right-5 top-0 bottom-0 w-0.5 bg-slate-200"></div>
              
              {/* رویدادها */}
              <div className="space-y-6">
                {history.map((entry, index) => (
                  <div key={entry.id} className="relative pr-16">
                    {/* آیکون */}
                    <div className="absolute right-0 top-0">
                      <ActionIcon action={entry.action} />
                    </div>
                    
                    {/* محتوا */}
                    <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                      {/* ردیف اول: کاربر و زمان */}
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span className="font-semibold text-slate-700">
                            {(() => {
                              // اگر userName به فرمت "username - name" هست، همون رو نشون بده
                              // در غیر این صورت، از userLabels استفاده کن
                              const userName = entry.user_name || '';
                              if (userName.includes(' - ')) {
                                // فرمت: "username - name" یا "username - name - role"
                                return userName;
                              }
                              const userLabels: { [key: string]: string } = {
                                'transport_user': 'کاربر ترابری (شرکت)',
                                'personal_transport_user': 'کاربر ترابری (شخصی)',
                                'planner': 'کارمند برنامه‌ریزی',
                                'planner_manager': 'مدیر برنامه‌ریزی',
                                'system': 'سیستم'
                              };
                              return userLabels[userName] || userName;
                            })()}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {formatJalaliDateTime(new Date(entry.created_at))}
                        </div>
                      </div>
                      
                      {/* شرح عملیات */}
                      <div className="text-sm text-slate-800 mb-2">
                        {entry.description}
                      </div>
                      
                      {/* تغییر وضعیت */}
                      {entry.old_status && entry.new_status && entry.old_status !== entry.new_status && (
                        <div className="flex items-center gap-2 text-xs mb-2">
                          <span className="text-slate-400">از</span>
                          <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded">
                            {(() => {
                              const statusLabels: { [key: string]: string } = {
                                'Draft': 'پیش‌نویس',
                                'PendingManagerApproval': 'در انتظار تایید مدیر',
                                'PendingCompanyAssignment': 'در انتظار تخصیص شرکتی',
                                'PendingPersonalAssignment': 'در انتظار تخصیص شخصی',
                                'Assigned': 'تخصیص یافته',
                                'InTransit': 'در حال حمل',
                                'Delivered': 'تحویل داده شده',
                                'Cancelled': 'لغو شده',
                                'Rejected': 'رد شده',
                                'ChangeRequested': 'درخواست تغییر',
                                'Reannounced': 'اعلام مجدد شده',
                                'Leftover': 'بار مانده'
                              };
                              return statusLabels[entry.old_status] || entry.old_status;
                            })()}
                          </span>
                          <span className="text-slate-400">به</span>
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded font-semibold">
                            {(() => {
                              const statusLabels: { [key: string]: string } = {
                                'Draft': 'پیش‌نویس',
                                'PendingManagerApproval': 'در انتظار تایید مدیر',
                                'PendingCompanyAssignment': 'در انتظار تخصیص شرکتی',
                                'PendingPersonalAssignment': 'در انتظار تخصیص شخصی',
                                'Assigned': 'تخصیص یافته',
                                'InTransit': 'در حال حمل',
                                'Delivered': 'تحویل داده شده',
                                'Cancelled': 'لغو شده',
                                'Rejected': 'رد شده',
                                'ChangeRequested': 'درخواست تغییر',
                                'Reannounced': 'اعلام مجدد شده',
                                'Leftover': 'بار مانده'
                              };
                              return statusLabels[entry.new_status] || entry.new_status;
                            })()}
                          </span>
                        </div>
                      )}
                      
                      {/* جزئیات تغییرات فیلدها */}
                      {entry.field_changes && (
                        <FieldChangesDetails fieldChanges={entry.field_changes} driverMap={driverMap} vehicleMap={vehicleMap} personalDriverMap={personalDriverMap} personalVehicleMap={personalVehicleMap} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        {/* فوتر */}
        <div className="p-4 border-t bg-slate-50 flex justify-between items-center">
          <div className="text-sm text-slate-600">
            {history.length > 0 ? `${history.length} رویداد ثبت شده` : ''}
          </div>
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-slate-600 text-white rounded-md text-sm hover:bg-slate-700 transition-colors"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
};

export default FreightHistoryDialog;


import React, { useState, useEffect, useMemo } from 'react';
import { User } from '../types';
import { getApiUrl } from '../utils/apiConfig';
import { formatJalali, parseJalaliDateString, gregorianToJalali } from '../utils/jalali';
import * as XLSX from 'xlsx';

interface MonthlyCommissionCalculationProps {
    currentUser: User;
}

// Helper function for padding
const pad2 = (n: number): string => n < 10 ? `0${n}` : String(n);

interface DriverCommissionSummary {
    driverId: string;
    employeeId: string;
    driverName: string;
    // نوع صف
    queueType: 'porsant' | 'fixed_allowance' | 'mixed';
    queueTypeLabel: string;
    // تعداد تورها
    trailerTourCount: number; // تریلی + مینی تریلی
    tenWheelerTourCount: number; // ده چرخ
    totalTourCount: number;
    // پیمایش
    trailerKilometers: number;
    tenWheelerKilometers: number;
    totalKilometers: number;
    // اجرت پیمایش/ثابت
    trailerCommission: number;
    tenWheelerCommission: number;
    totalCommission: number;
    // اجرت ثابت جداگانه
    fixedAllowance: number;
    // هزینه‌های اضافی
    totalFoodCost: number;
    totalFuelCost: number;
    totalTollCost: number;
    totalLoadingCost: number;
    totalReturnCargoCost: number;
    totalReturnBillOfLadingCost: number;
    totalMultiUnloadCost: number;
    totalExcessMissionCost: number;
    totalHelperDriverCost: number;
    // مبنای محاسبه
    commissionBase: 'تریلی' | 'ده چرخ';
    // جمع کل قابل پرداخت
    totalPayable: number;
    // وضعیت
    commissionStatus: string;
}

// تورهای جداگانه هر راننده
interface DriverTourDetail {
    id: string;
    driverId: string;
    employeeId: string;
    driverName: string;
    announcementId: string;
    billOfLadingNumber: string;
    billOfLadingDate: string;
    destinations: string;
    vehicleType: string;
    queueType: string;
    queueTypeLabel: string;
    approvedKilometers: number;
    excessKilometers: number;
    totalKilometers: number;
    commission: number;
    fixedAllowance: number;
    foodCost: number;
    fuelCost: number;
    tollCost: number;
    totalCost: number;
    commissionStatus: string;
}

type VehicleTab = 'trailer' | 'tenWheeler';

const MonthlyCommissionCalculation: React.FC<MonthlyCommissionCalculationProps> = ({ currentUser }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [calculations, setCalculations] = useState<any[]>([]);
    const [summaries, setSummaries] = useState<DriverCommissionSummary[]>([]);
    const [tourDetails, setTourDetails] = useState<DriverTourDetail[]>([]);
    
    // تب فعال (تریلی یا ده چرخ)
    const [activeTab, setActiveTab] = useState<VehicleTab>('trailer');
    
    // بازه زمانی (پیش‌فرض: 26 ماه قبل تا 25 این ماه)
    const getDefaultDateRange = (): { start: string; end: string } => {
        const now = new Date();
        const [jy, jm, jd] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
        
        let startYear = jy;
        let startMonth = jm - 1;
        if (startMonth < 1) {
            startMonth = 12;
            startYear = jy - 1;
        }
        
        return {
            start: `${startYear}/${pad2(startMonth)}/26`,
            end: `${jy}/${pad2(jm)}/25`
        };
    };
    
    const defaultDates = useMemo(() => getDefaultDateRange(), []);
    const [startDate, setStartDate] = useState<string>(defaultDates.start);
    const [endDate, setEndDate] = useState<string>(defaultDates.end);
    
    // جستجو
    const [searchTerm, setSearchTerm] = useState<string>('');
    
    // مرتب‌سازی
    type SortField = 'employeeId' | 'driverName' | 'totalTourCount' | 'totalKilometers' | 'totalCommission' | 'totalPayable' | 'commissionBase' | 'queueType';
    const [sortField, setSortField] = useState<SortField>('queueType');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    
    // صفحه‌بندی
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [itemsPerPage, setItemsPerPage] = useState<number>(30);
    
    // بخشنامه‌های اجرت پیمایش
    const [mileageRegulations, setMileageRegulations] = useState<any[]>([]);
    
    // دیالوگ بستن دوره
    const [showClosePeriodDialog, setShowClosePeriodDialog] = useState(false);
    const [periodCheckData, setPeriodCheckData] = useState<any>(null);
    const [closingPeriod, setClosingPeriod] = useState(false);
    
    // دیالوگ رانندگان بدون ثبت
    const [showUnrecordedDriversDialog, setShowUnrecordedDriversDialog] = useState(false);
    
    // لاگ برای دیباگ دیالوگ رانندگان
    useEffect(() => {
        if (showUnrecordedDriversDialog && periodCheckData) {
            console.log('🔍 [showUnrecordedDriversDialog] دیالوگ باز شد:', {
                unrecordedDrivers: periodCheckData.unrecordedDrivers?.length || 0,
                data: periodCheckData.unrecordedDrivers
            });
        }
    }, [showUnrecordedDriversDialog, periodCheckData]);
    
    // دوره‌های مالی
    const [financialPeriods, setFinancialPeriods] = useState<any[]>([]);
    const [showPeriodsDialog, setShowPeriodsDialog] = useState(false);
    
    // تورهای یک دوره
    const [selectedPeriodTours, setSelectedPeriodTours] = useState<any[]>([]);
    const [showPeriodToursDialog, setShowPeriodToursDialog] = useState(false);
    const [selectedPeriod, setSelectedPeriod] = useState<any>(null);
    const [loadingPeriodTours, setLoadingPeriodTours] = useState(false);
    
    // گزارش راننده
    const [showDriverReportDialog, setShowDriverReportDialog] = useState(false);
    const [selectedDriverId, setSelectedDriverId] = useState<string>('');
    const [driverReportData, setDriverReportData] = useState<any[]>([]);
    
    // بارگذاری بخشنامه‌ها
    useEffect(() => {
        const fetchRegulations = async () => {
            try {
                const token = localStorage.getItem('token');
                const headers = {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                };
                
                const res = await fetch(getApiUrl('allowance-regulations/mileage'), { headers });
                if (res.ok) {
                    const data = await res.json();
                    setMileageRegulations(data.filter((r: any) => r.isActive !== false));
                }
            } catch (err) {
                console.error('❌ خطا در دریافت بخشنامه‌ها:', err);
            }
        };
        
        fetchRegulations();
    }, []);
    
    // محاسبه اجرت بر اساس بخشنامه و تاریخ بارنامه
    const calculateMileageAllowance = (vehicleType: string, kilometers: number, billOfLadingDate?: string): number => {
        // تعیین نوع خودرو برای بخشنامه
        const isTrailerOrMini = vehicleType.includes('تریلی') || vehicleType.includes('مینی');
        const isTenWheeler = vehicleType.includes('ده چرخ') || vehicleType.includes('دهچرخ');
        
        const regType = isTrailerOrMini ? 'تریلی' : (isTenWheeler ? 'ده چرخ' : null);
        if (!regType) return 0;
        
        // فیلتر بخشنامه‌ها بر اساس تاریخ بارنامه (اگه موجود باشه)
        let filteredRegs = mileageRegulations.filter(r => r.vehicleType === regType);
        
        if (billOfLadingDate && filteredRegs.some(r => r.startDate && r.endDate)) {
            // فقط بخشنامه‌هایی که تاریخ بارنامه در بازه زمانیشون هست
            const regsInDateRange = filteredRegs.filter(r => {
                if (!r.startDate || !r.endDate) return true; // اگه تاریخ نداشت، همه رو بگیر
                return billOfLadingDate >= r.startDate && billOfLadingDate <= r.endDate;
            });
            
            if (regsInDateRange.length > 0) {
                filteredRegs = regsInDateRange;
            }
        }
        
        // پیدا کردن بخشنامه مناسب بر اساس بازه کیلومتر
        const regulation = filteredRegs.find(r => 
            kilometers >= r.minKilometers &&
            kilometers <= r.maxKilometers
        );
        
        if (regulation) {
            return kilometers * regulation.allowancePerKm;
        }
        
        // اگر بخشنامه‌ای پیدا نشد، بالاترین بازه رو بگیر
        const highestReg = filteredRegs
            .sort((a, b) => b.maxKilometers - a.maxKilometers)[0];
        
        if (highestReg && kilometers > highestReg.maxKilometers) {
            return kilometers * highestReg.allowancePerKm;
        }
        
        return 0;
    };
    
    // محاسبه پورسانت
    const handleCalculate = async () => {
        if (!startDate || !endDate) {
            setError('لطفاً بازه زمانی را مشخص کنید.');
            return;
        }
        
        setLoading(true);
        setError(null);
        
        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };
            
            // دریافت محاسبات ذخیره شده در بازه زمانی
            const res = await fetch(
                getApiUrl(`driver-calculations/by-date-range?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`),
                { headers }
            );
            
            if (!res.ok) {
                throw new Error('خطا در دریافت داده‌ها');
            }
            
            const data = await res.json();
            console.log('📦 [MonthlyCommission] داده‌های دریافتی:', data.length, 'رکورد');
            setCalculations(data);
            
            // تورهای جداگانه
            const details: DriverTourDetail[] = data.map((calc: any) => {
                const queueType = calc.queue_type || 'porsant';
                const vehicleType = calc.vehicle_type || '';
                const approvedKm = Number(calc.approved_kilometers) || 0;
                const excessKm = Number(calc.excess_kilometers) || 0;
                const totalKm = approvedKm + excessKm;
                const billOfLadingDate = calc.bill_of_lading_date || '';
                
                let commission = 0;
                let fixedAllowance = 0;
                
                if (queueType === 'fixed_allowance') {
                    fixedAllowance = Number(calc.fixed_allowance) || Number(calc.tour_cost) || 0;
                } else {
                    commission = calculateMileageAllowance(vehicleType, totalKm, billOfLadingDate);
                }
                
                return {
                    id: calc.id,
                    driverId: calc.driver_id,
                    employeeId: calc.employee_id || '',
                    driverName: calc.driver_name || '',
                    announcementId: calc.announcement_id,
                    billOfLadingNumber: calc.bill_of_lading_number || '',
                    billOfLadingDate,
                    destinations: calc.destinations || '',
                    vehicleType,
                    queueType,
                    queueTypeLabel: queueType === 'fixed_allowance' ? 'اجرت ثابت' : 'پورسانتی',
                    approvedKilometers: approvedKm,
                    excessKilometers: excessKm,
                    totalKilometers: totalKm,
                    commission,
                    fixedAllowance,
                    foodCost: Number(calc.food_cost) || 0,
                    fuelCost: Number(calc.fuel_cost) || 0,
                    tollCost: Number(calc.toll_cost) || 0,
                    totalCost: Number(calc.total_cost) || 0,
                    commissionStatus: calc.commission_status || 'recorded',
                };
            });
            setTourDetails(details);
            
            // جمع‌بندی بر اساس راننده
            const driverMap = new Map<string, DriverCommissionSummary>();
            
            data.forEach((calc: any) => {
                const driverId = calc.driver_id;
                const vehicleType = calc.vehicle_type || '';
                const queueType = calc.queue_type || 'porsant'; // صف (پورسانت، اجرت ثابت)
                const isTrailerOrMini = vehicleType.includes('تریلی') || vehicleType.includes('مینی');
                const isTenWheeler = vehicleType.includes('ده چرخ') || vehicleType.includes('دهچرخ');
                
                const approvedKm = Number(calc.approved_kilometers) || 0;
                const excessKm = Number(calc.excess_kilometers) || 0;
                const totalKm = approvedKm + excessKm;
                const billOfLadingDate = calc.bill_of_lading_date || '';
                
                // محاسبه اجرت بر اساس صف
                let commission = 0;
                let fixedAllowanceVal = 0;
                if (queueType === 'fixed_allowance') {
                    // اجرت ثابت: از مقدار ذخیره شده
                    fixedAllowanceVal = Number(calc.fixed_allowance) || Number(calc.tour_cost) || 0;
                } else {
                    // پورسانت: از بخشنامه پلکانی
                    commission = calculateMileageAllowance(vehicleType, totalKm, billOfLadingDate);
                }
                
                const existing = driverMap.get(driverId);
                
                if (existing) {
                    // به‌روزرسانی
                    if (isTrailerOrMini) {
                        existing.trailerTourCount += 1;
                        existing.trailerKilometers += totalKm;
                        existing.trailerCommission += commission + fixedAllowanceVal;
                    } else if (isTenWheeler) {
                        existing.tenWheelerTourCount += 1;
                        existing.tenWheelerKilometers += totalKm;
                        existing.tenWheelerCommission += commission + fixedAllowanceVal;
                    }
                    
                    existing.totalTourCount += 1;
                    existing.totalKilometers += totalKm;
                    existing.totalCommission += commission;
                    existing.fixedAllowance += fixedAllowanceVal;
                    
                    // تعیین نوع صف
                    if (existing.queueType === 'porsant' && queueType === 'fixed_allowance') {
                        existing.queueType = 'mixed';
                    } else if (existing.queueType === 'fixed_allowance' && queueType === 'porsant') {
                        existing.queueType = 'mixed';
                    }
                    
                    // هزینه‌های اضافی
                    existing.totalFoodCost += Number(calc.food_cost) || 0;
                    existing.totalFuelCost += Number(calc.fuel_cost) || 0;
                    existing.totalTollCost += Number(calc.toll_cost) || 0;
                    existing.totalLoadingCost += Number(calc.loading_cost) || 0;
                    existing.totalReturnCargoCost += Number(calc.return_cargo_cost) || 0;
                    existing.totalReturnBillOfLadingCost += Number(calc.return_bill_of_lading_cost) || 0;
                    existing.totalMultiUnloadCost += Number(calc.multi_unload_cost) || 0;
                    existing.totalExcessMissionCost += Number(calc.excess_mission_cost) || 0;
                    existing.totalHelperDriverCost += Number(calc.helper_driver_cost) || 0;
                } else {
                    // ایجاد جدید
                    driverMap.set(driverId, {
                        driverId,
                        employeeId: calc.employee_id || '',
                        driverName: calc.driver_name || '',
                        queueType: queueType as 'porsant' | 'fixed_allowance',
                        queueTypeLabel: queueType === 'fixed_allowance' ? 'اجرت ثابت' : 'پورسانتی',
                        trailerTourCount: isTrailerOrMini ? 1 : 0,
                        tenWheelerTourCount: isTenWheeler ? 1 : 0,
                        totalTourCount: 1,
                        trailerKilometers: isTrailerOrMini ? totalKm : 0,
                        tenWheelerKilometers: isTenWheeler ? totalKm : 0,
                        totalKilometers: totalKm,
                        trailerCommission: isTrailerOrMini ? (commission + fixedAllowanceVal) : 0,
                        tenWheelerCommission: isTenWheeler ? (commission + fixedAllowanceVal) : 0,
                        totalCommission: commission,
                        fixedAllowance: fixedAllowanceVal,
                        totalFoodCost: Number(calc.food_cost) || 0,
                        totalFuelCost: Number(calc.fuel_cost) || 0,
                        totalTollCost: Number(calc.toll_cost) || 0,
                        totalLoadingCost: Number(calc.loading_cost) || 0,
                        totalReturnCargoCost: Number(calc.return_cargo_cost) || 0,
                        totalReturnBillOfLadingCost: Number(calc.return_bill_of_lading_cost) || 0,
                        totalMultiUnloadCost: Number(calc.multi_unload_cost) || 0,
                        totalExcessMissionCost: Number(calc.excess_mission_cost) || 0,
                        totalHelperDriverCost: Number(calc.helper_driver_cost) || 0,
                        commissionBase: 'تریلی',
                        totalPayable: 0,
                        commissionStatus: calc.commission_status || 'recorded',
                    });
                }
            });
            
            // محاسبه مبنای پورسانت و جمع کل
            const summaryList = Array.from(driverMap.values()).map(summary => {
                // تعیین مبنای محاسبه (>50% تریلی/مینی = تریلی)
                const trailerPercent = summary.totalTourCount > 0 
                    ? (summary.trailerTourCount / summary.totalTourCount) * 100 
                    : 0;
                summary.commissionBase = trailerPercent >= 50 ? 'تریلی' : 'ده چرخ';
                
                // تعیین لیبل صف
                if (summary.queueType === 'mixed') {
                    summary.queueTypeLabel = 'ترکیبی';
                } else if (summary.queueType === 'fixed_allowance') {
                    summary.queueTypeLabel = 'اجرت ثابت';
                } else {
                    summary.queueTypeLabel = 'پورسانتی';
                }
                
                // محاسبه جمع کل قابل پرداخت
                summary.totalPayable = 
                    summary.totalCommission +
                    summary.fixedAllowance +
                    summary.totalFoodCost +
                    summary.totalFuelCost +
                    summary.totalTollCost +
                    summary.totalLoadingCost +
                    summary.totalReturnCargoCost +
                    summary.totalReturnBillOfLadingCost +
                    summary.totalMultiUnloadCost +
                    summary.totalExcessMissionCost;
                
                return summary;
            });
            
            setSummaries(summaryList);
            console.log('✅ [MonthlyCommission] جمع‌بندی:', summaryList.length, 'راننده');
            
        } catch (err: any) {
            console.error('❌ [MonthlyCommission] خطا:', err);
            setError(err.message || 'خطا در محاسبه');
        } finally {
            setLoading(false);
        }
    };
    
    // فیلتر بر اساس تب فعال و نوع خودرو
    const getFilteredByTab = (data: DriverCommissionSummary[]): DriverCommissionSummary[] => {
        return data.filter(s => {
            if (activeTab === 'trailer') {
                return s.commissionBase === 'تریلی';
            } else {
                return s.commissionBase === 'ده چرخ';
            }
        });
    };
    
    // فیلتر و مرتب‌سازی
    const filteredAndSorted = useMemo(() => {
        let filtered = getFilteredByTab([...summaries]);
        
        // جستجو
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(s => 
                s.employeeId?.toLowerCase().includes(term) ||
                s.driverName?.toLowerCase().includes(term)
            );
        }
        
        // مرتب‌سازی - پورسانتی‌ها بالا، ثابت‌ها پایین
        filtered.sort((a, b) => {
            // اول بر اساس صف
            if (sortField === 'queueType' || sortField !== 'queueType') {
                // پورسانتی‌ها اول
                const queueOrder = { 'porsant': 0, 'mixed': 1, 'fixed_allowance': 2 };
                const aQueue = queueOrder[a.queueType] ?? 1;
                const bQueue = queueOrder[b.queueType] ?? 1;
                
                if (aQueue !== bQueue) {
                    return aQueue - bQueue;
                }
            }
            
            // سپس بر اساس فیلد انتخابی
            let aVal: any, bVal: any;
            
            switch (sortField) {
                case 'employeeId':
                    aVal = a.employeeId || '';
                    bVal = b.employeeId || '';
                    break;
                case 'driverName':
                    aVal = a.driverName || '';
                    bVal = b.driverName || '';
                    break;
                case 'totalTourCount':
                    aVal = a.totalTourCount;
                    bVal = b.totalTourCount;
                    break;
                case 'totalKilometers':
                    aVal = a.totalKilometers;
                    bVal = b.totalKilometers;
                    break;
                case 'totalCommission':
                    aVal = a.totalCommission + a.fixedAllowance;
                    bVal = b.totalCommission + b.fixedAllowance;
                    break;
                case 'totalPayable':
                    aVal = a.totalPayable;
                    bVal = b.totalPayable;
                    break;
                case 'commissionBase':
                    aVal = a.commissionBase;
                    bVal = b.commissionBase;
                    break;
                default:
                    aVal = 0;
                    bVal = 0;
            }
            
            if (typeof aVal === 'string') {
                return sortDirection === 'asc'
                    ? aVal.localeCompare(bVal, 'fa')
                    : bVal.localeCompare(aVal, 'fa');
            }
            
            return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        });
        
        return filtered;
    }, [summaries, searchTerm, sortField, sortDirection, activeTab]);
    
    // صفحه‌بندی
    const totalPages = Math.ceil(filteredAndSorted.length / itemsPerPage);
    const paginated = filteredAndSorted.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );
    
    // خروجی اکسل با دو تب
    const handleExportExcel = () => {
        if (summaries.length === 0) {
            alert('داده‌ای برای خروجی وجود ندارد.');
            return;
        }
        
        const wb = XLSX.utils.book_new();
        
        // تابع ایجاد شیت
        const createSheet = (data: DriverCommissionSummary[], sheetName: string) => {
            const wsData = [
                ['ردیف', 'کد پرسنلی', 'نام راننده', 'نوع صف', 'تعداد تور', 'تور تریلی/مینی', 'تور ده‌چرخ', 
                 'کل پیمایش (کیلومتر)', 'پیمایش تریلی', 'پیمایش ده‌چرخ',
                 'اجرت پورسانتی (ریال)', 'اجرت ثابت (ریال)', 'هزینه غذا', 'هزینه سوخت', 'هزینه عوارض', 
                 'هزینه بارگیری', 'بار برگشتی', 'بارنامه برگشتی', 'چندجا تخلیه', 'ماموریت مازاد',
                 'مبنای محاسبه', 'جمع قابل پرداخت (ریال)']
            ];
            
            // مرتب‌سازی: پورسانتی اول، ثابت آخر
            const sortedData = [...data].sort((a, b) => {
                const queueOrder = { 'porsant': 0, 'mixed': 1, 'fixed_allowance': 2 };
                return (queueOrder[a.queueType] ?? 1) - (queueOrder[b.queueType] ?? 1);
            });
            
            sortedData.forEach((s, idx) => {
                wsData.push([
                    idx + 1,
                    s.employeeId,
                    s.driverName,
                    s.queueTypeLabel,
                    s.totalTourCount,
                    s.trailerTourCount,
                    s.tenWheelerTourCount,
                    s.totalKilometers,
                    s.trailerKilometers,
                    s.tenWheelerKilometers,
                    s.totalCommission,
                    s.fixedAllowance,
                    s.totalFoodCost,
                    s.totalFuelCost,
                    s.totalTollCost,
                    s.totalLoadingCost,
                    s.totalReturnCargoCost,
                    s.totalReturnBillOfLadingCost,
                    s.totalMultiUnloadCost,
                    s.totalExcessMissionCost,
                    s.commissionBase,
                    s.totalPayable
                ] as any);
            });
            
            // جمع کل
            wsData.push([
                '',
                'جمع کل',
                '',
                '',
                sortedData.reduce((sum, s) => sum + s.totalTourCount, 0),
                sortedData.reduce((sum, s) => sum + s.trailerTourCount, 0),
                sortedData.reduce((sum, s) => sum + s.tenWheelerTourCount, 0),
                sortedData.reduce((sum, s) => sum + s.totalKilometers, 0),
                sortedData.reduce((sum, s) => sum + s.trailerKilometers, 0),
                sortedData.reduce((sum, s) => sum + s.tenWheelerKilometers, 0),
                sortedData.reduce((sum, s) => sum + s.totalCommission, 0),
                sortedData.reduce((sum, s) => sum + s.fixedAllowance, 0),
                sortedData.reduce((sum, s) => sum + s.totalFoodCost, 0),
                sortedData.reduce((sum, s) => sum + s.totalFuelCost, 0),
                sortedData.reduce((sum, s) => sum + s.totalTollCost, 0),
                sortedData.reduce((sum, s) => sum + s.totalLoadingCost, 0),
                sortedData.reduce((sum, s) => sum + s.totalReturnCargoCost, 0),
                sortedData.reduce((sum, s) => sum + s.totalReturnBillOfLadingCost, 0),
                sortedData.reduce((sum, s) => sum + s.totalMultiUnloadCost, 0),
                sortedData.reduce((sum, s) => sum + s.totalExcessMissionCost, 0),
                '',
                sortedData.reduce((sum, s) => sum + s.totalPayable, 0)
            ] as any);
            
            return XLSX.utils.aoa_to_sheet(wsData);
        };
        
        // شیت تریلی
        const trailerData = summaries.filter(s => s.commissionBase === 'تریلی');
        const wsTrailer = createSheet(trailerData, 'تریلی');
        XLSX.utils.book_append_sheet(wb, wsTrailer, 'تریلی');
        
        // شیت ده چرخ
        const tenWheelerData = summaries.filter(s => s.commissionBase === 'ده چرخ');
        const wsTenWheeler = createSheet(tenWheelerData, 'ده چرخ');
        XLSX.utils.book_append_sheet(wb, wsTenWheeler, 'ده چرخ');
        
        const fileName = `پورسانت_${startDate.replace(/\//g, '-')}_تا_${endDate.replace(/\//g, '-')}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };
    
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };
    
    // جمع کل‌ها بر اساس تب
    const totals = useMemo(() => ({
        tourCount: filteredAndSorted.reduce((sum, s) => sum + s.totalTourCount, 0),
        kilometers: filteredAndSorted.reduce((sum, s) => sum + s.totalKilometers, 0),
        commission: filteredAndSorted.reduce((sum, s) => sum + s.totalCommission, 0),
        fixedAllowance: filteredAndSorted.reduce((sum, s) => sum + s.fixedAllowance, 0),
        payable: filteredAndSorted.reduce((sum, s) => sum + s.totalPayable, 0),
    }), [filteredAndSorted]);
    
    // بررسی وضعیت دوره قبل از بستن
    const handleCheckPeriod = async () => {
        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };
            
            const res = await fetch(
                getApiUrl(`financial/periods/check?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`),
                { headers }
            );
            
            if (!res.ok) {
                throw new Error('خطا در بررسی دوره');
            }
            
            const data = await res.json();
            console.log('📊 [handleCheckPeriod] داده‌های دریافتی:', {
                unrecordedTours: data.unrecordedTours,
                unrecordedFromAnnouncements: data.unrecordedFromAnnouncements,
                unrecordedWithZeroCost: data.unrecordedWithZeroCost,
                unrecordedDriversCount: data.unrecordedDrivers?.length || 0,
                unrecordedDriversData: data.unrecordedDrivers
            });
            if (data.unrecordedDrivers && data.unrecordedDrivers.length > 0) {
                console.log('✅ [handleCheckPeriod] نمونه راننده:', data.unrecordedDrivers[0]);
            } else {
                console.warn('⚠️ [handleCheckPeriod] unrecordedDrivers خالی است!');
            }
            setPeriodCheckData(data);
            setShowClosePeriodDialog(true);
            
        } catch (err: any) {
            console.error('❌ خطا در بررسی دوره:', err);
            setError(err.message || 'خطا در بررسی دوره');
        }
    };
    
    // بستن دوره
    const handleClosePeriod = async () => {
        if (!periodCheckData) return;
        
        setClosingPeriod(true);
        
        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };
            
            // نام دوره
            const startParts = startDate.split('/');
            const persianMonths = ['', 'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
            const monthNum = parseInt(startParts[1]);
            const periodName = `${persianMonths[monthNum]} ${startParts[0]}`;
            
            const res = await fetch(getApiUrl('financial/periods/close'), {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    periodName,
                    startDate,
                    endDate,
                    userId: currentUser.id,
                    userName: currentUser.name,
                    notes: `بسته شده توسط ${currentUser.name}`
                })
            });
            
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.message || 'خطا در بستن دوره');
            }
            
            const result = await res.json();
            alert(`✅ دوره با موفقیت بسته شد!\n\n📊 ${result.recordedTours} تور محاسبه شد\n⚠️ ${result.unrecordedTours} تور ثبت نشده باقی ماند`);
            
            setShowClosePeriodDialog(false);
            setPeriodCheckData(null);
            
            // رفرش داده‌ها
            handleCalculate();
            
        } catch (err: any) {
            console.error('❌ خطا در بستن دوره:', err);
            alert('خطا: ' + (err.message || 'خطا در بستن دوره'));
        } finally {
            setClosingPeriod(false);
        }
    };
    
    // دریافت دوره‌های مالی
    const fetchPeriods = async () => {
        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };
            
            const res = await fetch(getApiUrl('financial/periods'), { headers });
            if (res.ok) {
                const data = await res.json();
                setFinancialPeriods(data);
            }
        } catch (err) {
            console.error('❌ خطا در دریافت دوره‌ها:', err);
        }
    };
    
    // گزارش راننده
    const handleDriverReport = (driverId: string) => {
        const driverTours = tourDetails.filter(t => t.driverId === driverId);
        setDriverReportData(driverTours);
        setSelectedDriverId(driverId);
        setShowDriverReportDialog(true);
    };
    
    // دریافت تورهای یک دوره
    const handleViewPeriodTours = async (period: any) => {
        setLoadingPeriodTours(true);
        setSelectedPeriod(period);
        
        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };
            
            const res = await fetch(getApiUrl(`financial/periods/${period.id}/tours`), { headers });
            
            if (!res.ok) {
                throw new Error('خطا در دریافت تورهای دوره');
            }
            
            const data = await res.json();
            setSelectedPeriodTours(data.tours || []);
            setShowPeriodToursDialog(true);
            
        } catch (err: any) {
            console.error('❌ خطا در دریافت تورهای دوره:', err);
            alert('خطا: ' + (err.message || 'خطا در دریافت تورهای دوره'));
        } finally {
            setLoadingPeriodTours(false);
        }
    };
    
    // خروجی اکسل از تورهای یک دوره
    const handleExportPeriodExcel = (period: any, tours: any[]) => {
        if (tours.length === 0) {
            alert('تورهایی برای خروجی وجود ندارد.');
            return;
        }
        
        const wb = XLSX.utils.book_new();
        let sheetAdded = false;
        
        // شیت تریلی
        const trailerTours = tours.filter(t => {
            const vehicleType = (t.vehicleType || '').toString().toLowerCase();
            return vehicleType.includes('تریلی') || vehicleType.includes('مینی');
        });
        if (trailerTours.length > 0) {
            const wsTrailer = createPeriodToursSheet(trailerTours, 'تریلی');
            XLSX.utils.book_append_sheet(wb, wsTrailer, 'تریلی');
            sheetAdded = true;
        }
        
        // شیت ده چرخ
        const tenWheelerTours = tours.filter(t => {
            const vehicleType = (t.vehicleType || '').toString().toLowerCase();
            return vehicleType.includes('ده چرخ') || vehicleType.includes('دهچرخ');
        });
        if (tenWheelerTours.length > 0) {
            const wsTenWheeler = createPeriodToursSheet(tenWheelerTours, 'ده چرخ');
            XLSX.utils.book_append_sheet(wb, wsTenWheeler, 'ده چرخ');
            sheetAdded = true;
        }
        
        // اگر هیچ شیتی اضافه نشد، همه تورها رو در یک شیت بذار
        if (!sheetAdded) {
            const wsAll = createPeriodToursSheet(tours, 'همه تورها');
            XLSX.utils.book_append_sheet(wb, wsAll, 'همه تورها');
        }
        
        const fileName = `تورهای_دوره_${period.periodName.replace(/\s/g, '_')}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };
    
    // تابع ایجاد شیت تورهای دوره
    const createPeriodToursSheet = (tours: any[], sheetName: string) => {
        const wsData = [
            ['ردیف', 'کد پرسنلی', 'نام راننده', 'شماره بارنامه', 'تاریخ بارنامه', 'مقاصد', 
             'نوع خودرو', 'نوع صف', 'پیمایش (کیلومتر)', 'اجرت پورسانتی', 'اجرت ثابت',
             'هزینه غذا', 'هزینه سوخت', 'هزینه عوارض', 'هزینه بارنامه', 'بار برگشتی',
             'بارنامه برگشتی', 'چندجا تخلیه', 'ماموریت مازاد', 'راننده کمکی', 'جمع کل (ریال)']
        ];
        
        tours.forEach((tour, idx) => {
            // Parse destinations
            let destinationsStr = '';
            if (tour.destinations) {
                if (Array.isArray(tour.destinations)) {
                    destinationsStr = tour.destinations.map((d: any) => {
                        if (typeof d === 'string') return d;
                        if (d && typeof d === 'object') return d.city || d.representative_name || JSON.stringify(d);
                        return String(d);
                    }).join(' - ');
                } else if (typeof tour.destinations === 'string') {
                    try {
                        const parsed = JSON.parse(tour.destinations);
                        if (Array.isArray(parsed)) {
                            destinationsStr = parsed.map((d: any) => {
                                if (typeof d === 'string') return d;
                                if (d && typeof d === 'object') return d.city || d.representative_name || JSON.stringify(d);
                                return String(d);
                            }).join(' - ');
                        } else {
                            destinationsStr = tour.destinations;
                        }
                    } catch {
                        destinationsStr = tour.destinations;
                    }
                } else {
                    destinationsStr = String(tour.destinations);
                }
            }
            
            // Parse numeric fields
            const parseNum = (val: any) => {
                if (val === null || val === undefined) return 0;
                const num = typeof val === 'string' ? parseInt(val, 10) : Number(val);
                return isNaN(num) ? 0 : num;
            };
            
            wsData.push([
                idx + 1,
                tour.employeeId || '',
                tour.driverName || '',
                tour.billOfLadingNumber || '',
                tour.billOfLadingDate || '',
                destinationsStr,
                tour.vehicleType || '',
                tour.queueType === 'fixed_allowance' ? 'اجرت ثابت' : 'پورسانتی',
                parseNum(tour.totalKilometers),
                tour.queueType === 'fixed_allowance' ? 0 : parseNum(tour.commission),
                tour.queueType === 'fixed_allowance' ? parseNum(tour.fixedAllowance) : 0,
                parseNum(tour.foodCost),
                parseNum(tour.fuelCost),
                parseNum(tour.tollCost),
                parseNum(tour.billOfLadingCost),
                parseNum(tour.returnCargoCost),
                parseNum(tour.returnBillOfLadingCost),
                parseNum(tour.multiUnloadCost),
                parseNum(tour.excessMissionCost),
                parseNum(tour.helperDriverCost),
                parseNum(tour.totalCost)
            ] as any);
        });
        
        // جمع کل
        const parseNum = (val: any) => {
            if (val === null || val === undefined) return 0;
            const num = typeof val === 'string' ? parseInt(val, 10) : Number(val);
            return isNaN(num) ? 0 : num;
        };
        
        wsData.push([
            '',
            'جمع کل',
            '',
            '',
            '',
            '',
            '',
            '',
            tours.reduce((s, t) => s + parseNum(t.totalKilometers), 0),
            tours.reduce((s, t) => s + (t.queueType === 'fixed_allowance' ? 0 : parseNum(t.commission)), 0),
            tours.reduce((s, t) => s + (t.queueType === 'fixed_allowance' ? parseNum(t.fixedAllowance) : 0), 0),
            tours.reduce((s, t) => s + parseNum(t.foodCost), 0),
            tours.reduce((s, t) => s + parseNum(t.fuelCost), 0),
            tours.reduce((s, t) => s + parseNum(t.tollCost), 0),
            tours.reduce((s, t) => s + parseNum(t.billOfLadingCost), 0),
            tours.reduce((s, t) => s + parseNum(t.returnCargoCost), 0),
            tours.reduce((s, t) => s + parseNum(t.returnBillOfLadingCost), 0),
            tours.reduce((s, t) => s + parseNum(t.multiUnloadCost), 0),
            tours.reduce((s, t) => s + parseNum(t.excessMissionCost), 0),
            tours.reduce((s, t) => s + parseNum(t.helperDriverCost), 0),
            tours.reduce((s, t) => s + parseNum(t.totalCost), 0)
        ] as any);
        
        return XLSX.utils.aoa_to_sheet(wsData);
    };

    return (
        <div className="max-w-full mx-auto p-6 space-y-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold text-slate-800">
                        محاسبه پورسانت ماهانه
                    </h1>
                    <div className="flex gap-2">
                        <button
                            onClick={() => { fetchPeriods(); setShowPeriodsDialog(true); }}
                            className="px-4 py-2 bg-slate-600 text-white rounded-md text-sm hover:bg-slate-700 transition-colors"
                        >
                            📁 بایگانی دوره‌ها
                        </button>
                    </div>
                </div>
                
                {/* بازه زمانی و دکمه‌ها */}
                <div className="bg-slate-50 rounded-lg p-4 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                از تاریخ (صدور بارنامه)
                            </label>
                            <input
                                type="text"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                placeholder="1403/09/26"
                                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                dir="ltr"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                تا تاریخ (صدور بارنامه)
                            </label>
                            <input
                                type="text"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                placeholder="1403/10/25"
                                className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                dir="ltr"
                            />
                        </div>
                        <div>
                            <button
                                onClick={handleCalculate}
                                disabled={loading}
                                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors disabled:bg-slate-400"
                            >
                                {loading ? 'در حال محاسبه...' : '📊 محاسبه پورسانت'}
                            </button>
                        </div>
                        <div>
                            <button
                                onClick={handleExportExcel}
                                disabled={summaries.length === 0}
                                className="w-full px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 transition-colors disabled:bg-slate-400"
                            >
                                📥 خروجی اکسل (2 شیت)
                            </button>
                        </div>
                        <div>
                            <button
                                onClick={handleCheckPeriod}
                                disabled={summaries.length === 0}
                                className="w-full px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700 transition-colors disabled:bg-slate-400"
                            >
                                🔒 بستن دوره
                            </button>
                        </div>
                    </div>
                </div>
                
                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700">
                        {error}
                    </div>
                )}
                
                {/* تب‌ها */}
                {summaries.length > 0 && (
                    <div className="flex gap-2 mb-4">
                        <button
                            onClick={() => { setActiveTab('trailer'); setCurrentPage(1); }}
                            className={`px-6 py-3 rounded-t-lg font-medium transition-colors ${
                                activeTab === 'trailer'
                                    ? 'bg-purple-600 text-white'
                                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                            }`}
                        >
                            🚛 تریلی / مینی تریلی
                            <span className="mr-2 text-sm">
                                ({summaries.filter(s => s.commissionBase === 'تریلی').length} راننده)
                            </span>
                        </button>
                        <button
                            onClick={() => { setActiveTab('tenWheeler'); setCurrentPage(1); }}
                            className={`px-6 py-3 rounded-t-lg font-medium transition-colors ${
                                activeTab === 'tenWheeler'
                                    ? 'bg-orange-600 text-white'
                                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                            }`}
                        >
                            🚚 ده چرخ
                            <span className="mr-2 text-sm">
                                ({summaries.filter(s => s.commissionBase === 'ده چرخ').length} راننده)
                            </span>
                        </button>
                    </div>
                )}
                
                {/* آمار کلی */}
                {summaries.length > 0 && (
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-4">
                        <div className="bg-blue-50 rounded-lg p-2 border border-blue-200">
                            <div className="text-xs text-blue-600">رانندگان</div>
                            <div className="text-lg font-bold text-blue-800">{filteredAndSorted.length.toLocaleString('fa-IR')}</div>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-2 border border-purple-200">
                            <div className="text-xs text-purple-600">تورها</div>
                            <div className="text-lg font-bold text-purple-800">{totals.tourCount.toLocaleString('fa-IR')}</div>
                        </div>
                        <div className="bg-orange-50 rounded-lg p-2 border border-orange-200">
                            <div className="text-xs text-orange-600">پیمایش (کیلومتر)</div>
                            <div className="text-lg font-bold text-orange-800">{totals.kilometers.toLocaleString('fa-IR')}</div>
                        </div>
                        <div className="bg-emerald-50 rounded-lg p-2 border border-emerald-200">
                            <div className="text-xs text-emerald-600">اجرت پورسانتی</div>
                            <div className="text-lg font-bold text-emerald-800">{totals.commission.toLocaleString('fa-IR')}</div>
                        </div>
                        <div className="bg-cyan-50 rounded-lg p-2 border border-cyan-200">
                            <div className="text-xs text-cyan-600">اجرت ثابت</div>
                            <div className="text-lg font-bold text-cyan-800">{totals.fixedAllowance.toLocaleString('fa-IR')}</div>
                        </div>
                        <div className="bg-green-50 rounded-lg p-2 border border-green-200">
                            <div className="text-xs text-green-600">جمع کل قابل پرداخت</div>
                            <div className="text-lg font-bold text-green-800">{totals.payable.toLocaleString('fa-IR')}</div>
                        </div>
                    </div>
                )}
                
                {/* جستجو */}
                <div className="mb-4">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="جستجو بر اساس کد پرسنلی یا نام راننده..."
                        className="w-full md:w-1/3 px-3 py-2 border border-slate-300 rounded-md text-sm"
                    />
                </div>
                
                {/* جدول */}
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right border-collapse">
                        <thead>
                            <tr className={`${activeTab === 'trailer' ? 'bg-purple-700' : 'bg-orange-700'} text-white`}>
                                <th className="p-3 border-l border-opacity-30">ردیف</th>
                                <th 
                                    className="p-3 border-l border-opacity-30 cursor-pointer hover:bg-opacity-80"
                                    onClick={() => handleSort('employeeId')}
                                >
                                    کد پرسنلی {sortField === 'employeeId' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="p-3 border-l border-opacity-30 cursor-pointer hover:bg-opacity-80"
                                    onClick={() => handleSort('driverName')}
                                >
                                    نام راننده {sortField === 'driverName' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="p-3 border-l border-opacity-30 cursor-pointer hover:bg-opacity-80"
                                    onClick={() => handleSort('queueType')}
                                >
                                    نوع صف {sortField === 'queueType' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="p-3 border-l border-opacity-30 cursor-pointer hover:bg-opacity-80"
                                    onClick={() => handleSort('totalTourCount')}
                                >
                                    تعداد تور {sortField === 'totalTourCount' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th className="p-3 border-l border-opacity-30">تور تریلی</th>
                                <th className="p-3 border-l border-opacity-30">تور ده‌چرخ</th>
                                <th 
                                    className="p-3 border-l border-opacity-30 cursor-pointer hover:bg-opacity-80"
                                    onClick={() => handleSort('totalKilometers')}
                                >
                                    کل پیمایش {sortField === 'totalKilometers' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="p-3 border-l border-opacity-30 cursor-pointer hover:bg-opacity-80"
                                    onClick={() => handleSort('totalCommission')}
                                >
                                    اجرت {sortField === 'totalCommission' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th className="p-3 border-l border-opacity-30">سایر هزینه‌ها</th>
                                <th 
                                    className="p-3 border-l border-opacity-30 cursor-pointer hover:bg-opacity-80"
                                    onClick={() => handleSort('totalPayable')}
                                >
                                    جمع قابل پرداخت {sortField === 'totalPayable' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th className="p-3">عملیات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginated.length === 0 ? (
                                <tr>
                                    <td colSpan={12} className="p-6 text-center text-slate-500">
                                        {loading ? 'در حال بارگذاری...' : 'ابتدا بازه زمانی را انتخاب و دکمه محاسبه را بزنید.'}
                                    </td>
                                </tr>
                            ) : (
                                paginated.map((summary, index) => {
                                    const otherCosts = 
                                        summary.totalFoodCost + 
                                        summary.totalFuelCost + 
                                        summary.totalTollCost +
                                        summary.totalLoadingCost +
                                        summary.totalReturnCargoCost +
                                        summary.totalReturnBillOfLadingCost +
                                        summary.totalMultiUnloadCost +
                                        summary.totalExcessMissionCost;
                                    
                                    const totalAllowance = summary.totalCommission + summary.fixedAllowance;
                                    
                                    return (
                                        <tr key={summary.driverId} className={`border-b border-slate-200 hover:bg-slate-50 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                                            <td className="p-3 border-l border-slate-200 text-center">
                                                {((currentPage - 1) * itemsPerPage) + index + 1}
                                            </td>
                                            <td className="p-3 border-l border-slate-200 font-medium">{summary.employeeId}</td>
                                            <td className="p-3 border-l border-slate-200 font-semibold text-slate-800">{summary.driverName}</td>
                                            <td className="p-3 border-l border-slate-200 text-center">
                                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                                                    summary.queueType === 'porsant'
                                                        ? 'bg-green-100 text-green-800'
                                                        : summary.queueType === 'fixed_allowance'
                                                        ? 'bg-blue-100 text-blue-800'
                                                        : 'bg-yellow-100 text-yellow-800'
                                                }`}>
                                                    {summary.queueTypeLabel}
                                                </span>
                                            </td>
                                            <td className="p-3 border-l border-slate-200 text-center font-medium">{summary.totalTourCount}</td>
                                            <td className="p-3 border-l border-slate-200 text-center">
                                                {summary.trailerTourCount > 0 ? (
                                                    <span className="text-xs">
                                                        {summary.trailerTourCount} ({Math.round((summary.trailerTourCount / summary.totalTourCount) * 100)}%)
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className="p-3 border-l border-slate-200 text-center">
                                                {summary.tenWheelerTourCount > 0 ? (
                                                    <span className="text-xs">
                                                        {summary.tenWheelerTourCount} ({Math.round((summary.tenWheelerTourCount / summary.totalTourCount) * 100)}%)
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className="p-3 border-l border-slate-200 text-left font-medium">
                                                {summary.totalKilometers.toLocaleString('fa-IR')}
                                            </td>
                                            <td className="p-3 border-l border-slate-200 text-left font-medium text-blue-700">
                                                {totalAllowance.toLocaleString('fa-IR')}
                                                {summary.fixedAllowance > 0 && (
                                                    <span className="block text-xs text-cyan-600">
                                                        (ثابت: {summary.fixedAllowance.toLocaleString('fa-IR')})
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-3 border-l border-slate-200 text-left text-xs text-slate-600">
                                                {otherCosts > 0 ? otherCosts.toLocaleString('fa-IR') : '-'}
                                            </td>
                                            <td className="p-3 border-l border-slate-200 text-left font-bold text-green-700">
                                                {summary.totalPayable.toLocaleString('fa-IR')}
                                            </td>
                                            <td className="p-3 text-center">
                                                <button
                                                    onClick={() => handleDriverReport(summary.driverId)}
                                                    className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-xs hover:bg-slate-300"
                                                    title="گزارش تورها"
                                                >
                                                    📋
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                        {paginated.length > 0 && (
                            <tfoot>
                                <tr className={`${activeTab === 'trailer' ? 'bg-purple-100' : 'bg-orange-100'} font-bold`}>
                                    <td colSpan={4} className="p-3 text-right">جمع کل:</td>
                                    <td className="p-3 text-center">{totals.tourCount.toLocaleString('fa-IR')}</td>
                                    <td className="p-3"></td>
                                    <td className="p-3"></td>
                                    <td className="p-3 text-left">{totals.kilometers.toLocaleString('fa-IR')}</td>
                                    <td className="p-3 text-left text-blue-700">{(totals.commission + totals.fixedAllowance).toLocaleString('fa-IR')}</td>
                                    <td className="p-3"></td>
                                    <td className="p-3 text-left text-green-700">{totals.payable.toLocaleString('fa-IR')}</td>
                                    <td className="p-3"></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
                
                {/* صفحه‌بندی */}
                {totalPages > 1 && (
                    <div className="mt-4 flex justify-center items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                            className="px-3 py-1 bg-slate-200 rounded-md text-sm hover:bg-slate-300 disabled:opacity-50"
                        >
                            اول
                        </button>
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1 bg-slate-200 rounded-md text-sm hover:bg-slate-300 disabled:opacity-50"
                        >
                            قبلی
                        </button>
                        <span className="px-3 py-1 text-sm">
                            صفحه {currentPage.toLocaleString('fa-IR')} از {totalPages.toLocaleString('fa-IR')}
                        </span>
                        <button
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1 bg-slate-200 rounded-md text-sm hover:bg-slate-300 disabled:opacity-50"
                        >
                            بعدی
                        </button>
                        <button
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1 bg-slate-200 rounded-md text-sm hover:bg-slate-300 disabled:opacity-50"
                        >
                            آخر
                        </button>
                    </div>
                )}
            </div>
            
            {/* دیالوگ بستن دوره */}
            {showClosePeriodDialog && periodCheckData && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold text-slate-800 mb-4">
                            🔒 بستن دوره مالی پورسانت
                        </h2>
                        
                        {/* اطلاعات دوره */}
                        <div className="bg-slate-50 rounded-lg p-4 mb-4">
                            <div className="grid grid-cols-2 gap-4 mb-3">
                                <div>
                                    <span className="text-sm text-slate-500">از تاریخ:</span>
                                    <span className="font-medium mr-2">{startDate}</span>
                                </div>
                                <div>
                                    <span className="text-sm text-slate-500">تا تاریخ:</span>
                                    <span className="font-medium mr-2">{endDate}</span>
                                </div>
                            </div>
                            <hr className="my-3 border-slate-200" />
                            
                            {/* تورهای ثبت شده */}
                            <div className="bg-green-50 rounded p-3 mb-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-green-800 font-medium">✅ تورهای هزینه ثبت شده (محاسبه می‌شوند):</span>
                                    <span className="font-bold text-green-700 text-lg">{periodCheckData.recordedTours} تور</span>
                                </div>
                                <div className="flex justify-between items-center mt-2">
                                    <span className="text-sm text-green-600">مجموع پورسانت/اجرت قابل پرداخت:</span>
                                    <span className="font-bold text-green-700">{periodCheckData.totalAmount?.toLocaleString('fa-IR')} ریال</span>
                                </div>
                                <p className="text-xs text-green-600 mt-2">
                                    این تورها به بایگانی منتقل می‌شوند و از کارتابل محاسبه هزینه تور حذف می‌شوند.
                                </p>
                            </div>
                            
                            {/* تورهای ثبت نشده (کل سیستم - بدون فیلتر تاریخ) */}
                            <div className={`rounded p-3 ${periodCheckData.unrecordedTours > 0 ? 'bg-amber-50' : 'bg-slate-100'}`}>
                                <div className="flex justify-between items-center">
                                    <span className={`font-medium ${periodCheckData.unrecordedTours > 0 ? 'text-amber-800' : 'text-slate-600'}`}>
                                        ⚠️ تورهای ثبت نشده در کارتابل (کل سیستم):
                                    </span>
                                    <span className={`font-bold text-lg ${periodCheckData.unrecordedTours > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
                                        {periodCheckData.unrecordedTours} تور
                                    </span>
                                </div>
                                {periodCheckData.unrecordedTours > 0 && (
                                    <>
                                        <div className="text-xs text-amber-600 mt-2 space-y-1">
                                            {periodCheckData.unrecordedWithZeroCost > 0 && (
                                                <p>• {periodCheckData.unrecordedWithZeroCost} تور با هزینه صفر</p>
                                            )}
                                            {periodCheckData.unrecordedFromAnnouncements > 0 && (
                                                <p>• {periodCheckData.unrecordedFromAnnouncements} تور بدون رکورد</p>
                                            )}
                                            <p className="mt-1 text-slate-500">(این آمار شامل همه تورهای ثبت نشده است، نه فقط این دوره)</p>
                                        </div>
                                        <button
                                            onClick={() => setShowUnrecordedDriversDialog(true)}
                                            className="text-sm text-amber-700 underline hover:text-amber-900 mt-2"
                                        >
                                            📋 مشاهده لیست رانندگان
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                        
                        {periodCheckData.alreadyCalculatedTours > 0 && (
                            <div className="bg-blue-50 border border-blue-300 rounded-lg p-4 mb-4">
                                <div className="text-blue-800 text-sm">
                                    ℹ️ {periodCheckData.alreadyCalculatedTours} تور قبلاً در دوره دیگری محاسبه و بسته شده است.
                                </div>
                            </div>
                        )}
                        
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                            <p className="text-red-700 text-sm">
                                <strong>⚠️ توجه:</strong> پس از بستن دوره:
                            </p>
                            <ul className="text-red-600 text-xs mt-2 list-disc list-inside">
                                <li>تورهای ثبت شده قفل می‌شوند و قابل ویرایش نیستند</li>
                                <li>این تورها از کارتابل محاسبه هزینه تور حذف می‌شوند</li>
                                <li>فقط مدیر سیستم می‌تواند دوره را باز کند</li>
                            </ul>
                        </div>
                        
                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => { setShowClosePeriodDialog(false); setPeriodCheckData(null); }}
                                className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300"
                            >
                                انصراف
                            </button>
                            <button
                                onClick={handleClosePeriod}
                                disabled={closingPeriod}
                                className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-slate-400"
                            >
                                {closingPeriod ? 'در حال بستن...' : '🔒 تأیید و بستن دوره'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* دیالوگ رانندگان بدون ثبت */}
            {showUnrecordedDriversDialog && periodCheckData && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-3xl max-h-[80vh] overflow-y-auto">
                        <h2 className="text-lg font-bold text-amber-800 mb-4">
                            ⚠️ رانندگان با تور ثبت نشده
                        </h2>
                        
                        {periodCheckData.unrecordedDrivers && periodCheckData.unrecordedDrivers.length > 0 ? (
                            <>
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="bg-amber-100">
                                            <th className="p-2 border text-right">ردیف</th>
                                            <th className="p-2 border text-right">کد پرسنلی</th>
                                            <th className="p-2 border text-right">نام راننده</th>
                                            <th className="p-2 border text-right">تعداد تور ثبت نشده</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {periodCheckData.unrecordedDrivers.map((driver: any, idx: number) => (
                                            <tr key={`${driver.employeeId || driver.driverName || idx}-${idx}`} className="hover:bg-amber-50">
                                                <td className="p-2 border text-center">{idx + 1}</td>
                                                <td className="p-2 border">{driver.employeeId || '-'}</td>
                                                <td className="p-2 border font-medium">{driver.driverName || 'نامشخص'}</td>
                                                <td className="p-2 border text-center text-red-600 font-bold">{driver.tours?.length || 0}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </>
                        ) : (
                            <div className="text-center py-8 text-slate-500">
                                <p>هیچ راننده‌ای با تور ثبت نشده یافت نشد.</p>
                            </div>
                        )}
                        
                        <div className="flex justify-end mt-4">
                            <button
                                onClick={() => setShowUnrecordedDriversDialog(false)}
                                className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300"
                            >
                                بستن
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* دیالوگ بایگانی دوره‌ها */}
            {showPeriodsDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-4xl max-h-[80vh] overflow-y-auto">
                        <h2 className="text-xl font-bold text-slate-800 mb-4">
                            📁 بایگانی دوره‌های مالی
                        </h2>
                        
                        {financialPeriods.length === 0 ? (
                            <p className="text-slate-500 text-center py-8">هیچ دوره‌ای ثبت نشده است.</p>
                        ) : (
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="bg-slate-700 text-white">
                                        <th className="p-2 border">ردیف</th>
                                        <th className="p-2 border">نام دوره</th>
                                        <th className="p-2 border">از تاریخ</th>
                                        <th className="p-2 border">تا تاریخ</th>
                                        <th className="p-2 border">تعداد تور</th>
                                        <th className="p-2 border">مبلغ کل (ریال)</th>
                                        <th className="p-2 border">وضعیت</th>
                                        <th className="p-2 border">تاریخ بستن</th>
                                        <th className="p-2 border">عملیات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {financialPeriods.map((period: any, idx: number) => (
                                        <tr key={period.id} className="hover:bg-slate-50">
                                            <td className="p-2 border text-center">{idx + 1}</td>
                                            <td className="p-2 border font-medium">{period.periodName}</td>
                                            <td className="p-2 border text-center">{period.startDate}</td>
                                            <td className="p-2 border text-center">{period.endDate}</td>
                                            <td className="p-2 border text-center">{period.recordedTours}</td>
                                            <td className="p-2 border text-left">{period.totalAmount?.toLocaleString('fa-IR')}</td>
                                            <td className="p-2 border text-center">
                                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                                                    period.status === 'open'
                                                        ? 'bg-green-100 text-green-800'
                                                        : period.status === 'closed'
                                                        ? 'bg-red-100 text-red-800'
                                                        : 'bg-slate-100 text-slate-800'
                                                }`}>
                                                    {period.status === 'open' ? 'باز' : period.status === 'closed' ? 'بسته' : 'بایگانی'}
                                                </span>
                                            </td>
                                            <td className="p-2 border text-center text-xs">
                                                {period.closedAt ? new Date(period.closedAt).toLocaleDateString('fa-IR') : '-'}
                                            </td>
                                            <td className="p-2 border text-center">
                                                <div className="flex gap-1 justify-center">
                                                    <button
                                                        onClick={() => handleViewPeriodTours(period)}
                                                        disabled={loadingPeriodTours}
                                                        className="px-2 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 disabled:bg-slate-400"
                                                        title="مشاهده تورها"
                                                    >
                                                        {loadingPeriodTours && selectedPeriod?.id === period.id ? '⏳' : '📋'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        
                        <div className="flex justify-end mt-4">
                            <button
                                onClick={() => setShowPeriodsDialog(false)}
                                className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300"
                            >
                                بستن
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* دیالوگ نمایش تورهای یک دوره */}
            {showPeriodToursDialog && selectedPeriod && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-slate-800">
                                📋 تورهای دوره: {selectedPeriod.periodName}
                            </h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleExportPeriodExcel(selectedPeriod, selectedPeriodTours)}
                                    className="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
                                >
                                    📥 خروجی اکسل
                                </button>
                                <button
                                    onClick={() => {
                                        setShowPeriodToursDialog(false);
                                        setSelectedPeriod(null);
                                        setSelectedPeriodTours([]);
                                    }}
                                    className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md text-sm hover:bg-slate-300"
                                >
                                    بستن
                                </button>
                            </div>
                        </div>
                        
                        <div className="bg-slate-50 rounded-lg p-3 mb-4">
                            <div className="grid grid-cols-4 gap-4 text-sm">
                                <div>
                                    <span className="text-slate-500">از تاریخ:</span>
                                    <span className="font-medium mr-2">{selectedPeriod.startDate}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500">تا تاریخ:</span>
                                    <span className="font-medium mr-2">{selectedPeriod.endDate}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500">تعداد تور:</span>
                                    <span className="font-medium text-blue-600 mr-2">{selectedPeriodTours.length}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500">مبلغ کل:</span>
                                    <span className="font-medium text-green-600 mr-2">
                                        {selectedPeriodTours.reduce((s, t) => s + (t.totalCost || 0), 0).toLocaleString('fa-IR')} ریال
                                    </span>
                                </div>
                            </div>
                        </div>
                        
                        {selectedPeriodTours.length === 0 ? (
                            <p className="text-slate-500 text-center py-8">تورهایی یافت نشد.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-slate-600 text-white">
                                            <th className="p-2 border">ردیف</th>
                                            <th className="p-2 border">کد پرسنلی</th>
                                            <th className="p-2 border">نام راننده</th>
                                            <th className="p-2 border">شماره بارنامه</th>
                                            <th className="p-2 border">تاریخ بارنامه</th>
                                            <th className="p-2 border">مقاصد</th>
                                            <th className="p-2 border">نوع خودرو</th>
                                            <th className="p-2 border">نوع صف</th>
                                            <th className="p-2 border">پیمایش</th>
                                            <th className="p-2 border">اجرت</th>
                                            <th className="p-2 border">هزینه کل</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedPeriodTours.map((tour, idx) => (
                                            <tr key={tour.id} className="hover:bg-slate-50">
                                                <td className="p-2 border text-center">{idx + 1}</td>
                                                <td className="p-2 border">{tour.employeeId || '-'}</td>
                                                <td className="p-2 border font-medium">{tour.driverName || ''}</td>
                                                <td className="p-2 border">{tour.billOfLadingNumber || '-'}</td>
                                                <td className="p-2 border text-center">{tour.billOfLadingDate || '-'}</td>
                                                <td className="p-2 border">
                                                    {Array.isArray(tour.destinations) 
                                                        ? tour.destinations.map((d: any) => d.city || d).join(' - ')
                                                        : (tour.destinations || '-')}
                                                </td>
                                                <td className="p-2 border">{tour.vehicleType || '-'}</td>
                                                <td className="p-2 border text-center">
                                                    <span className={`inline-flex items-center px-1 py-0.5 rounded text-xs ${
                                                        tour.queueType === 'fixed_allowance'
                                                            ? 'bg-blue-100 text-blue-800'
                                                            : 'bg-green-100 text-green-800'
                                                    }`}>
                                                        {tour.queueType === 'fixed_allowance' ? 'اجرت ثابت' : 'پورسانتی'}
                                                    </span>
                                                </td>
                                                <td className="p-2 border text-left">{tour.totalKilometers?.toLocaleString('fa-IR') || 0}</td>
                                                <td className="p-2 border text-left">
                                                    {(tour.commission + tour.fixedAllowance).toLocaleString('fa-IR')}
                                                </td>
                                                <td className="p-2 border text-left font-medium">
                                                    {tour.totalCost?.toLocaleString('fa-IR') || 0}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="bg-slate-100 font-bold">
                                            <td colSpan={8} className="p-2 border text-right">جمع کل:</td>
                                            <td className="p-2 border text-left">
                                                {selectedPeriodTours.reduce((s, t) => s + (t.totalKilometers || 0), 0).toLocaleString('fa-IR')}
                                            </td>
                                            <td className="p-2 border text-left">
                                                {selectedPeriodTours.reduce((s, t) => s + (t.commission + t.fixedAllowance), 0).toLocaleString('fa-IR')}
                                            </td>
                                            <td className="p-2 border text-left">
                                                {selectedPeriodTours.reduce((s, t) => s + (t.totalCost || 0), 0).toLocaleString('fa-IR')}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            {/* دیالوگ گزارش راننده */}
            {showDriverReportDialog && driverReportData.length > 0 && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-5xl max-h-[85vh] overflow-y-auto">
                        <h2 className="text-lg font-bold text-slate-800 mb-4">
                            📋 گزارش تورهای راننده: {driverReportData[0]?.driverName}
                            <span className="text-sm font-normal text-slate-500 mr-2">
                                (کد پرسنلی: {driverReportData[0]?.employeeId})
                            </span>
                        </h2>
                        
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs border-collapse">
                                <thead>
                                    <tr className="bg-slate-600 text-white">
                                        <th className="p-2 border">ردیف</th>
                                        <th className="p-2 border">شماره بارنامه</th>
                                        <th className="p-2 border">تاریخ</th>
                                        <th className="p-2 border">مقاصد</th>
                                        <th className="p-2 border">نوع خودرو</th>
                                        <th className="p-2 border">نوع صف</th>
                                        <th className="p-2 border">پیمایش</th>
                                        <th className="p-2 border">اجرت پورسانتی</th>
                                        <th className="p-2 border">اجرت ثابت</th>
                                        <th className="p-2 border">هزینه کل</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {driverReportData.map((tour, idx) => (
                                        <tr key={tour.id} className="hover:bg-slate-50">
                                            <td className="p-2 border text-center">{idx + 1}</td>
                                            <td className="p-2 border">{tour.billOfLadingNumber}</td>
                                            <td className="p-2 border text-center">{tour.billOfLadingDate}</td>
                                            <td className="p-2 border">{tour.destinations}</td>
                                            <td className="p-2 border">{tour.vehicleType}</td>
                                            <td className="p-2 border text-center">
                                                <span className={`inline-flex items-center px-1 py-0.5 rounded text-xs ${
                                                    tour.queueType === 'fixed_allowance'
                                                        ? 'bg-blue-100 text-blue-800'
                                                        : 'bg-green-100 text-green-800'
                                                }`}>
                                                    {tour.queueTypeLabel}
                                                </span>
                                            </td>
                                            <td className="p-2 border text-left">{tour.totalKilometers.toLocaleString('fa-IR')}</td>
                                            <td className="p-2 border text-left">{tour.commission.toLocaleString('fa-IR')}</td>
                                            <td className="p-2 border text-left">{tour.fixedAllowance.toLocaleString('fa-IR')}</td>
                                            <td className="p-2 border text-left font-medium">{tour.totalCost.toLocaleString('fa-IR')}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-slate-100 font-bold">
                                        <td colSpan={6} className="p-2 border text-right">جمع کل:</td>
                                        <td className="p-2 border text-left">{driverReportData.reduce((s, t) => s + t.totalKilometers, 0).toLocaleString('fa-IR')}</td>
                                        <td className="p-2 border text-left">{driverReportData.reduce((s, t) => s + t.commission, 0).toLocaleString('fa-IR')}</td>
                                        <td className="p-2 border text-left">{driverReportData.reduce((s, t) => s + t.fixedAllowance, 0).toLocaleString('fa-IR')}</td>
                                        <td className="p-2 border text-left">{driverReportData.reduce((s, t) => s + t.totalCost, 0).toLocaleString('fa-IR')}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        
                        <div className="flex justify-end mt-4">
                            <button
                                onClick={() => { setShowDriverReportDialog(false); setDriverReportData([]); }}
                                className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md hover:bg-slate-300"
                            >
                                بستن
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MonthlyCommissionCalculation;

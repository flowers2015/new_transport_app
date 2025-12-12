import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User, Driver, Vehicle, FreightAnnouncement, DriverAllowanceCalculation, DriverTourDetail } from '../types';
import { getApiUrl } from '../utils/apiConfig';
import { formatJalali, formatJalaliDateTime, parseJalaliDateString, gregorianToJalali } from '../utils/jalali';

// Helper function for padding
const pad2 = (n: number): string => n < 10 ? `0${n}` : String(n);
import { generateUUID } from '../utils/uuid';
import { formatNumberWhileTyping, parseNumberFromFormatted } from '../utils/numberFormatter';
import * as XLSX from 'xlsx';

interface TransportFinanceCalculationProps {
    currentUser: User;
}

// Types برای این component
interface DriverCalculationRow {
    id: string;
    driverId: string;
    employeeId: string;
    driverName: string;
    queueType: 'porsant' | 'fixed_allowance' | 'helper';
    tourCount: number;
    totalKilometers: number;
    tourCost: number;
    tours: DriverTourDetailWithCalculation[];
    isExpanded?: boolean;
}

interface DriverTourDetailWithCalculation extends DriverTourDetail {
    // اطلاعات ثبت شده برای این تور
    billOfLadingNumber?: string; // شماره بارنامه
    billOfLadingDate?: Date | string; // تاریخ صدور بارنامه
    calculationDate?: string; // تاریخ محاسبه (شمسی YYYY/MM/DD)
    announcementDate?: Date; // تاریخ اعلام بار
    approvedKilometers?: number;
    excessKilometers?: number;
    approvedMissionDays?: number;
    excessMissionDays?: number;
    foodCost?: number;
    fuelCost?: number;
    tollCost?: number;
    loadingCost?: number;
    totalCost?: number;
    notes?: string;
    isDataRecorded?: boolean;
}

interface AllowanceInputDialogData {
    tourId: string; // شناسه تور (announcementId)
    driverId: string;
    driverEmployeeId?: string; // کد پرسنلی راننده (فیلد ثابت - فقط نمایش)
    driverName?: string; // نام راننده (فیلد ثابت - فقط نمایش)
    vehicleCode?: string; // کد خودرو
    vehiclePlate?: string; // پلاک خودرو
    vehicleType?: string; // نوع خودرو
    destinations?: string; // فیلد مقاصد (متن)
    billOfLadingNumber: string;
    billOfLadingDate: string; // تاریخ صدور بارنامه (شمسی YYYY/MM/DD)
    billOfLadingCost: number; // هزینه بارنامه (ریال) - لندی گراف و ...
    approvedKilometers: number;
    excessKilometers: number;
    approvedMissionDays: number;
    excessMissionDays: number;
    multiUnloadCount?: number; // تعداد چندجا تخلیه
    tollCost: number; // هزینه عوارض آزاد راهی
    fuelCost: number; // هزینه سوخت (ریال) - محاسبه خودکار
    loadingCost: number; // هزینه بارگیری اصلی
    returnCargoCost: number; // هزینه بار برگشتی (ریال)
    returnBillOfLadingCost: number; // هزینه بارنامه برگشتی (ریال)
    multiUnloadCost: number; // هزینه چندجا تخلیه (ریال)
    excessMissionCost: number; // حق ماموریت (ماموریت مازاد) (ریال)
    helperDriverCost: number; // هزینه راننده کمکی (ریال)
    fixedAllowance: number; // اجرت ثابت (در صورتی که اجرت ثابت باشد)
    advancePayment?: number; // پیش پرداخت (ریال)
    calculationDate: string; // تاریخ محاسبه (شمسی YYYY/MM/DD)
    notes: string;
    // فیلدهای راننده کمکی
    helperDriverId?: string; // شناسه راننده کمکی
    helperDriverEmployeeId?: string; // کد پرسنلی راننده کمکی
    helperDriverName?: string; // نام و نام خانوادگی راننده کمکی
    helperDriverAllowance?: number; // اجرت راننده کمکی
    helperDriverFoodCost?: number; // هزینه غذا راننده کمکی
    helperDriverExcessMissionDays?: number; // ماموریت مازاد راننده کمکی
    helperDriverExcessMissionCost?: number; // هزینه ماموریت مازاد راننده کمکی
    helperDriverExcessKilometers?: number; // پیمایش مازاد راننده کمکی
    
    // فیلدهای محاسبات دپو
    depotMissionDays?: number; // تعداد روز ماموریت دپو
    depotShipmentCount?: number; // تعداد بار ارسالی (محاسبه خودکار از تعداد ردیف‌ها)
    depotCargoHandlingCost?: number; // هزینه جابجایی بار در دپو (محاسبه خودکار)
    depotKilometerRate?: number; // اجرت کیلومتر دپو (محاسبه خودکار برای اجرت ثابت)
    depotTotalMileage?: number; // پیمایش کل دپو (محاسبه خودکار از مجموع mileage ردیف‌ها)
    depotFoodCost?: number; // هزینه غذا دپو (محاسبه خودکار: تعداد روز × هزینه غذا) - فقط برای محاسبه، نمایش داده نمی‌شود
    depotMissionCost?: number; // حق ماموریت دپو (محاسبه خودکار)
    depotRows?: Array<{ // ردیف‌های جدول محاسبات دپو
        id: string;
        destination: string; // مقاصد اعزامی دپو
        mileage: number; // پیمایش حمل دپو
        billOfLadingNumber: string; // شماره بارنامه
    }>;
}

const TransportFinanceCalculation: React.FC<TransportFinanceCalculationProps> = ({ currentUser }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [announcements, setAnnouncements] = useState<FreightAnnouncement[]>([]);
    const [calculations, setCalculations] = useState<DriverCalculationRow[]>([]);
    
    // فیلتر تاریخ (تاریخ صدور بارنامه)
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    
    // فیلتر تاریخ برای خروجی اکسل (پیش‌فرض: 26 ماه قبل تا 25 ماه جاری)
    const getDefaultExcelDateRange = (): { start: string; end: string } => {
        const now = new Date();
        const [jy, jm, jd] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
        
        // همیشه از 26 ماه قبل تا 25 ماه جاری
        let startYear = jy;
        let startMonth = jm - 1;
        let startDay = 26;
        let endYear = jy;
        let endMonth = jm;
        let endDay = 25;
        
        // اگر ماه قبل کمتر از 1 باشد، به سال قبل برو
        if (startMonth < 1) {
            startMonth = 12;
            startYear = jy - 1;
        }
        
        return {
            start: `${startYear}/${pad2(startMonth)}/${pad2(startDay)}`,
            end: `${endYear}/${pad2(endMonth)}/${pad2(endDay)}`
        };
    };
    
    const defaultExcelDates = useMemo(() => getDefaultExcelDateRange(), []);
    const [excelStartDate, setExcelStartDate] = useState<string>(defaultExcelDates.start);
    const [excelEndDate, setExcelEndDate] = useState<string>(defaultExcelDates.end);
    
    // جستجو
    const [searchTerm, setSearchTerm] = useState<string>(''); // جستجو بر اساس کد پرسنلی و نام
    
    // مرتب‌سازی
    type SortField = 'employeeId' | 'driverName' | 'queueType' | 'tourCount' | 'recordedTours' | 'unrecordedTours' | 'totalKilometers' | 'tourCost' | 'billOfLadingDate' | 'trailerCount' | 'miniTrailerCount' | 'tenWheelerCount' | 'commissionBase';
    type SortDirection = 'asc' | 'desc';
    // به‌صورت پیش‌فرض بر اساس «تعداد تور محاسبه‌نشده» از بیشترین به کمترین مرتب شود
    const [sortField, setSortField] = useState<SortField>('unrecordedTours');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    
    // صفحه‌بندی
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [itemsPerPage, setItemsPerPage] = useState<number>(30);
    
    // دیالوگ ثبت اطلاعات
    const [showInputDialog, setShowInputDialog] = useState(false);
    const [inputDialogData, setInputDialogData] = useState<AllowanceInputDialogData | null>(null);
    // تب‌ها حذف شدند - همه محتوا در یک صفحه نمایش داده می‌شود
    const [helperDriverSearchResults, setHelperDriverSearchResults] = useState<Driver[]>([]);
    const [dialogZoom, setDialogZoom] = useState(100); // بزرگنمایی دیالوگ
    
    // دیالوگ نمایش جزئیات تور
    const [showTourDetailsDialog, setShowTourDetailsDialog] = useState(false);
    const [selectedTourDetails, setSelectedTourDetails] = useState<DriverTourDetailWithCalculation[] | null>(null);
    const [selectedDriverName, setSelectedDriverName] = useState<string>('');
    const [selectedDriverId, setSelectedDriverId] = useState<string>('');
    const [selectedDriverQueueType, setSelectedDriverQueueType] = useState<'porsant' | 'fixed_allowance' | 'helper'>('porsant');
    
    // State برای باز/بستن بخش محاسبات دپو
    const [isDepotSectionOpen, setIsDepotSectionOpen] = useState(false);
    
    // State برای دیالوگ قوانین محاسبات
    const [showCalculationRulesDialog, setShowCalculationRulesDialog] = useState(false);
    
    // بخشنامه‌ها
    const [allowanceRegulations, setAllowanceRegulations] = useState<any[]>([]);
    const [fixedAllowance, setFixedAllowance] = useState<number>(0);
    const [foodCostPerDay, setFoodCostPerDay] = useState<number>(0);
    const [fuelConsumptionRegulations, setFuelConsumptionRegulations] = useState<{ [key: string]: { consumptionPercentage: number; fuelPrice: number } }>({});
    const [excessMissionCostPerDay, setExcessMissionCostPerDay] = useState<number>(0);
    const [multiUnloadCostPerUnit, setMultiUnloadCostPerUnit] = useState<number>(0);
    const [helperAllowancePerKm, setHelperAllowancePerKm] = useState<number>(0);
    const [returnCargoRegulations, setReturnCargoRegulations] = useState<Array<{ vehicleType: 'تریلی' | 'ده چرخ'; cargoType: 'full_product' | 'full_box_pallet_basket' | 'half'; cost: number; startDate?: string; endDate?: string; isActive?: boolean }>>([]);

    useEffect(() => {
        fetchData();
        fetchRegulations();
    }, []);

    // محاسبه اتوماتیک اجرت وقتی دیالوگ باز شد و صف "اجرت ثابت" هست یا پیمایش تغییر کرد (با debounce)
    useEffect(() => {
        if (!showInputDialog || !inputDialogData || selectedDriverQueueType === 'porsant') {
            return;
        }
        
        const timeoutId = setTimeout(async () => {
            const calc = calculations.find(c => c.driverId === inputDialogData.driverId);
            if (!calc) return;
            
            const tour = calc.tours.find(t => t.announcementId === inputDialogData.tourId);
            if (!tour) return;
            
            try {
                const token = localStorage.getItem('token');
                const headers = {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                };
                
                const vehicleType = tour.vehicleType || '';
                const isTrailer = vehicleType.includes('تریلی');
                const isTenWheeler = vehicleType.includes('ده چرخ');
                let vehicleTypeForApi = '';
                if (isTrailer) vehicleTypeForApi = 'تریلی';
                else if (isTenWheeler) vehicleTypeForApi = 'ده چرخ';
                
                if (vehicleTypeForApi) {
                    // پیمایش کل = پیمایش مصوب + پیمایش مازاد + پیمایش کل دپو
                    const depotMileage = Number(inputDialogData.depotTotalMileage) || 0;
                    const totalKm = (Number(inputDialogData.approvedKilometers) || 0) + (Number(inputDialogData.excessKilometers) || 0) + depotMileage;
                    const billDate = inputDialogData.billOfLadingDate || '';
                    
                    // دریافت بخشنامه اجرت ثابت برای نوع خودرو
                    const fixedAllowanceRes = await fetch(
                        getApiUrl(`allowance-regulations/fixed-allowance?vehicleType=${encodeURIComponent(vehicleTypeForApi)}`),
                        { headers }
                    );
                    
                    if (fixedAllowanceRes.ok) {
                        const fixedAllowanceData = await fixedAllowanceRes.json();
                        console.log('📋 [useEffect] بخشنامه‌های اجرت ثابت:', fixedAllowanceData);
                        
                        // پیدا کردن بخشنامه مناسب بر اساس تاریخ بارنامه
                        let applicableRegulation = null;
                        if (billDate && fixedAllowanceData.length > 0) {
                            applicableRegulation = fixedAllowanceData.find((reg: any) => {
                                const start = reg.startDate || '';
                                const end = reg.endDate || '';
                                return billDate >= start && billDate <= end && reg.isActive !== false;
                            });
                        }
                        // اگر بر اساس تاریخ پیدا نشد، اولین بخشنامه فعال رو بگیر
                        if (!applicableRegulation && fixedAllowanceData.length > 0) {
                            applicableRegulation = fixedAllowanceData.find((reg: any) => reg.isActive !== false);
                        }
                        
                        if (applicableRegulation) {
                            const ratePerKm = Number(applicableRegulation.fixedAllowancePerKm) || 0;
                            const calculatedAllowance = Math.round(totalKm * ratePerKm);
                            console.log('💰 [useEffect] اجرت ثابت محاسبه شده:', { totalKm, ratePerKm, calculatedAllowance, vehicleTypeForApi });
                            
                            setInputDialogData(prev => prev ? {
                                ...prev,
                                fixedAllowance: calculatedAllowance
                            } : null);
                        } else {
                            console.warn('⚠️ [useEffect] بخشنامه اجرت ثابت یافت نشد برای:', vehicleTypeForApi);
                        }
                    } else {
                        console.warn('⚠️ [useEffect] خطا در API اجرت ثابت:', fixedAllowanceRes.status);
                    }
                }
            } catch (err) {
                console.warn('⚠️ [useEffect] خطا در محاسبه اجرت:', err);
            }
        }, 500); // debounce 500ms
        
        return () => clearTimeout(timeoutId);
    }, [showInputDialog, inputDialogData?.tourId, inputDialogData?.approvedKilometers, inputDialogData?.excessKilometers, inputDialogData?.depotTotalMileage, selectedDriverQueueType]);

    // محاسبه خودکار فیلدهای محاسبات دپو
    useEffect(() => {
        if (!inputDialogData || !showInputDialog) return;

        const depotRows = inputDialogData.depotRows || [];
        
        // تعداد بار ارسالی = تعداد ردیف‌هایی که destination یا mileage دارند
        const validRows = depotRows.filter(row => (row.destination && row.destination.trim()) || (row.mileage && row.mileage > 0));
        const shipmentCount = validRows.length;

        // پیمایش کل دپو = مجموع mileage همه ردیف‌ها
        const totalMileage = depotRows.reduce((sum, row) => sum + (Number(row.mileage) || 0), 0);

        // محاسبه هزینه جابجایی بار در دپو
        let cargoHandlingCost = 0;
        if (shipmentCount > 0 && inputDialogData.vehicleType) {
            const vehicleType = inputDialogData.vehicleType;
            const isTrailer = vehicleType.includes('تریلی');
            const isTenWheeler = vehicleType.includes('ده چرخ');
            const vehicleTypeForReg = isTrailer ? 'تریلی' : (isTenWheeler ? 'ده چرخ' : null);

            if (vehicleTypeForReg) {
                // پیدا کردن بخشنامه اجرت بار برگشتی برای "هزینه بار کامل (محصول)"
                const regulation = returnCargoRegulations.find(reg => 
                    reg.vehicleType === vehicleTypeForReg && 
                    reg.cargoType === 'full_product'
                );
                
                if (regulation) {
                    cargoHandlingCost = shipmentCount * (Number(regulation.cost) || 0);
                }
            }
        }

        // محاسبه اجرت دپو (فقط برای اجرت ثابت)
        let depotKilometerRate = inputDialogData.depotKilometerRate || 0;
        if (selectedDriverQueueType === 'fixed_allowance' && totalMileage > 0 && fixedAllowance > 0) {
            // اجرت دپو = پیمایش کل دپو × (اجرت ثابت ÷ پیمایش کل)
            const totalKm = (inputDialogData.approvedKilometers || 0) + (inputDialogData.excessKilometers || 0) + totalMileage;
            if (totalKm > 0) {
                const fixedAllowancePerKm = fixedAllowance / totalKm;
                depotKilometerRate = Math.round(totalMileage * fixedAllowancePerKm);
            }
        }

        // محاسبه هزینه غذا دپو
        const depotMissionDays = inputDialogData.depotMissionDays || 0;
        const depotFoodCost = Math.round(depotMissionDays * (Number(foodCostPerDay) || 0)) || 0;

        // محاسبه حق ماموریت دپو
        const depotMissionCost = Math.round(depotMissionDays * (Number(excessMissionCostPerDay) || 0)) || 0;

        // به‌روزرسانی مقادیر
        setInputDialogData(prev => {
            if (!prev) return prev;
            const hasChanges = 
                prev.depotShipmentCount !== shipmentCount || 
                prev.depotCargoHandlingCost !== cargoHandlingCost ||
                prev.depotTotalMileage !== totalMileage ||
                (selectedDriverQueueType === 'fixed_allowance' && prev.depotKilometerRate !== depotKilometerRate) ||
                prev.depotFoodCost !== depotFoodCost ||
                prev.depotMissionCost !== depotMissionCost;
            
            if (hasChanges) {
                return {
                    ...prev,
                    depotShipmentCount: shipmentCount,
                    depotCargoHandlingCost: cargoHandlingCost,
                    depotTotalMileage: totalMileage,
                    depotKilometerRate: selectedDriverQueueType === 'fixed_allowance' ? depotKilometerRate : prev.depotKilometerRate,
                    depotFoodCost: depotFoodCost,
                    depotMissionCost: depotMissionCost
                };
            }
            return prev;
        });
    }, [inputDialogData?.depotRows, inputDialogData?.vehicleType, inputDialogData?.depotMissionDays, inputDialogData?.approvedKilometers, inputDialogData?.excessKilometers, returnCargoRegulations, foodCostPerDay, excessMissionCostPerDay, fixedAllowance, selectedDriverQueueType, showInputDialog]);

    // Fetch بخشنامه‌ها
    const fetchRegulations = async () => {
        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            // Fetch همه بخشنامه‌ها
            const [foodRes, excessMissionRes, multiUnloadRes, helperRes, fuelConsumptionRes, returnCargoRes] = await Promise.all([
                fetch(getApiUrl('allowance-regulations/food'), { headers }),
                fetch(getApiUrl('allowance-regulations/excess-mission'), { headers }),
                fetch(getApiUrl('allowance-regulations/multi-unload'), { headers }),
                fetch(getApiUrl('allowance-regulations/helper'), { headers }),
                fetch(getApiUrl('allowance-regulations/fuel-consumption'), { headers }),
                fetch(getApiUrl('allowance-regulations/return-cargo'), { headers }),
            ]);

            if (foodRes.ok) {
                const foodData = await foodRes.json();
                if (foodData && foodData.length > 0) {
                    // استفاده از آخرین بخشنامه فعال
                    const latestFood = foodData[0];
                    setFoodCostPerDay(Number(latestFood.foodCost) || 0);
                }
            }

            if (excessMissionRes.ok) {
                const excessMissionData = await excessMissionRes.json();
                if (excessMissionData && excessMissionData.length > 0) {
                    const latestExcessMission = excessMissionData[0];
                    setExcessMissionCostPerDay(Number(latestExcessMission.excessMissionCost) || 0);
                }
            }

            if (multiUnloadRes.ok) {
                const multiUnloadData = await multiUnloadRes.json();
                if (multiUnloadData && multiUnloadData.length > 0) {
                    const latestMultiUnload = multiUnloadData[0];
                    setMultiUnloadCostPerUnit(Number(latestMultiUnload.multiUnloadCost) || 0);
                }
            }

            if (helperRes.ok) {
                const helperData = await helperRes.json();
                if (helperData && helperData.length > 0) {
                    const latestHelper = helperData[0];
                    setHelperAllowancePerKm(Number(latestHelper.helperAllowance) || 0);
                }
            }

            if (fuelConsumptionRes.ok) {
                const fuelConsumptionData = await fuelConsumptionRes.json();
                if (fuelConsumptionData && fuelConsumptionData.length > 0) {
                    // تبدیل به map بر اساس نوع خودرو
                    const fuelMap: { [key: string]: { consumptionPercentage: number; fuelPrice: number } } = {};
                    fuelConsumptionData.forEach((reg: any) => {
                        if (reg.isActive !== false) {
                            fuelMap[reg.vehicleType] = {
                                consumptionPercentage: Number(reg.consumptionPercentage) || 0,
                                fuelPrice: Number(reg.fuelPrice) || 0,
                            };
                        }
                    });
                    setFuelConsumptionRegulations(fuelMap);
                }
            }

            if (returnCargoRes.ok) {
                const returnCargoData = await returnCargoRes.json();
                if (returnCargoData && returnCargoData.length > 0) {
                    setReturnCargoRegulations(returnCargoData.filter((reg: any) => reg.isActive !== false));
                }
            }
        } catch (err) {
            console.error('❌ [fetchRegulations] خطا در دریافت بخشنامه‌ها:', err);
        }
    };

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);
            
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            // Fetch drivers, vehicles, and announcements
            const [driversRes, vehiclesRes, announcementsRes] = await Promise.all([
                fetch(getApiUrl('drivers'), { headers }),
                fetch(getApiUrl('vehicles'), { headers }),
                fetch(getApiUrl('freight-announcements?includeFinalized=true'), { headers }),
            ]);

            if (!driversRes.ok) throw new Error('خطا در دریافت رانندگان');
            if (!vehiclesRes.ok) throw new Error('خطا در دریافت خودروها');
            if (!announcementsRes.ok) throw new Error('خطا در دریافت اعلام بارها');

            const [driversData, vehiclesData, announcementsData] = await Promise.all([
                driversRes.json(),
                vehiclesRes.json(),
                announcementsRes.json(),
            ]);

            setDrivers(Array.isArray(driversData) ? driversData : []);
            setVehicles(Array.isArray(vehiclesData) ? vehiclesData : []);
            
            // فیلتر کردن فقط بارهای تخصیص داده شده به رانندگان و خودروهای شرکت
            const companyAnnouncements = (Array.isArray(announcementsData) ? announcementsData : []).filter(
                (ann: any) => 
                    ann.assignment_type === 'company' && 
                    ann.assigned_driver_id && 
                    ann.assigned_vehicle_id &&
                    (ann.status === 'Finalized' || ann.status === 'InTransit')
            );
            
            setAnnouncements(companyAnnouncements);
            
        } catch (err: any) {
            console.error('❌ [TransportFinanceCalculation] Failed to fetch data:', err);
            setError(err.message || 'خطا در بارگذاری داده‌ها');
        } finally {
            setLoading(false);
        }
    };

    // محاسبه داده‌های رانندگان بر اساس اعلام بارها
    const calculateDriverData = useMemo(() => {
        if (!announcements.length || !drivers.length || !vehicles.length) return [];

        const driverMap = new Map<string, DriverCalculationRow>();

        announcements.forEach((ann: any) => {
            if (!ann.assigned_driver_id || ann.assignment_type !== 'company') return;

            const driver = drivers.find(d => d.id === ann.assigned_driver_id);
            const vehicle = vehicles.find(v => v.id === ann.assigned_vehicle_id);
            
            if (!driver || !vehicle) return;

            const driverId = driver.id;
            const existing = driverMap.get(driverId);

            // محاسبه roundTripKm از route (باید از API گرفته شود)
            const roundTripKm = ann.route?.round_trip_km || 0;

            const tourDetail: DriverTourDetailWithCalculation = {
                announcementId: ann.id,
                announcementCode: ann.announcement_code || '',
                vehicleType: ann.vehicle_type || '',
                vehicleId: vehicle.id,
                vehicleCode: vehicle.vehicleCode,
                plateNumber: vehicle.plateNumber ? 
                    `${vehicle.plateNumber.part1}${vehicle.plateNumber.letter}${vehicle.plateNumber.part2}-${vehicle.plateNumber.cityCode}` : 
                    '',
                lineType: ann.line_type || '',
                destinations: (ann.destinations || []).map((d: any) => d.city || '').filter(Boolean),
                roundTripKm,
                billOfLadingNumber: ann.bill_of_lading_number || '',
                billOfLadingDate: ann.bill_of_lading_date ? (typeof ann.bill_of_lading_date === 'string' ? new Date(ann.bill_of_lading_date) : ann.bill_of_lading_date) : undefined,
                announcementDate: ann.created_at ? new Date(ann.created_at) : undefined,
            };

            if (existing) {
                existing.tourCount += 1;
                existing.totalKilometers += roundTripKm;
                existing.tours.push(tourDetail);
            } else {
                driverMap.set(driverId, {
                    id: generateUUID(),
                    driverId: driver.id,
                    employeeId: driver.employeeId,
                    driverName: driver.name,
                    queueType: 'porsant', // پیش‌فرض
                    tourCount: 1,
                    totalKilometers: roundTripKm,
                    tourCost: 0, // بعداً محاسبه می‌شود
                    tours: [tourDetail],
                });
            }
        });

        return Array.from(driverMap.values());
    }, [announcements, drivers, vehicles]);

    useEffect(() => {
        setCalculations(calculateDriverData);
    }, [calculateDriverData]);

    // بارگذاری داده‌های ذخیره شده از دیتابیس - بعد از fetchData
    useEffect(() => {
        const loadSavedCalculations = async () => {
            // صبر کن تا announcements بارگذاری شوند
            if (!announcements.length) return;
            
            // صبر کن تا calculateDriverData تنظیم شود
            if (calculateDriverData.length === 0) return;
            
            try {
                const token = localStorage.getItem('token');
                const headers = {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                };
                
                // دریافت همه محاسبات ذخیره شده
                const savedRes = await fetch(getApiUrl('driver-calculations'), { headers });
                if (savedRes.ok) {
                    const savedData = await savedRes.json();
                    console.log('📦 [loadSavedCalculations] داده‌های ذخیره شده:', savedData.length, 'رکورد');
                    
                    // فیلتر کردن تورهایی که دوره‌شان بسته شده (commission_calculated یا paid)
                    const closedTourIds = new Set(
                        savedData
                            .filter((s: any) => s.commission_status === 'commission_calculated' || s.commission_status === 'paid')
                            .map((s: any) => s.announcement_id)
                    );
                    console.log('🔒 [loadSavedCalculations] تورهای بسته شده:', closedTourIds.size, 'تور');
                    
                    // Merge کردن داده‌های ذخیره شده با calculateDriverData
                    const updated = calculateDriverData.map(calc => {
                            // فیلتر کردن تورهایی که بسته نشده‌اند
                            const openTours = calc.tours.filter(tour => !closedTourIds.has(tour.announcementId));
                            
                            const updatedTours = openTours.map(tour => {
                                const saved = savedData.find((s: any) => 
                                    s.driver_id === calc.driverId && s.announcement_id === tour.announcementId
                                );
                                
                                if (saved) {
                                    console.log('✅ [loadSavedCalculations] پیدا شد:', {
                                        driverId: calc.driverId,
                                        announcementId: tour.announcementId,
                                        saved
                                    });
                                    return {
                                        ...tour,
                                        billOfLadingNumber: saved.bill_of_lading_number || saved.billOfLadingNumber || '',
                                        billOfLadingDate: saved.bill_of_lading_date ? (typeof saved.bill_of_lading_date === 'string' ? (saved.bill_of_lading_date.includes('/') ? parseJalaliDateString(saved.bill_of_lading_date) : new Date(saved.bill_of_lading_date)) : saved.bill_of_lading_date) : undefined,
                                        calculationDate: saved.calculation_date || saved.calculationDate || '',
                                        approvedKilometers: saved.approved_kilometers || saved.approvedKilometers || 0,
                                        excessKilometers: saved.excess_kilometers || saved.excessKilometers || 0,
                                        approvedMissionDays: saved.approved_mission_days || saved.approvedMissionDays || 1,
                                        excessMissionDays: saved.excess_mission_days || saved.excessMissionDays || 0,
                                        tollCost: saved.toll_cost || saved.tollCost || 0,
                                        loadingCost: saved.loading_cost || saved.loadingCost || 0,
                                        billOfLadingCost: saved.bill_of_lading_cost || saved.billOfLadingCost || 0,
                                        returnCargoCost: saved.return_cargo_cost || saved.returnCargoCost || 0,
                                        returnBillOfLadingCost: saved.return_bill_of_lading_cost || saved.returnBillOfLadingCost || 0,
                                        multiUnloadCost: saved.multi_unload_cost || saved.multiUnloadCost || 0,
                                        excessMissionCost: saved.excess_mission_cost || saved.excessMissionCost || 0,
                                        helperDriverCost: saved.helper_driver_cost || saved.helperDriverCost || 0,
                                        fixedAllowance: saved.fixed_allowance || saved.fixedAllowance || 0,
                                        foodCost: saved.food_cost || saved.foodCost || 0,
                                        fuelCost: saved.fuel_cost || saved.fuelCost || 0,
                                        tourCost: saved.tour_cost || saved.tourCost || 0,
                                        totalCost: saved.total_cost || saved.totalCost || 0,
                                        notes: saved.notes || '',
                                        isDataRecorded: true,
                                        commissionStatus: saved.commission_status || 'recorded',
                                        // فیلدهای راننده کمکی
                                        helperDriverId: saved.helper_driver_id || saved.helperDriverId || '',
                                        helperDriverEmployeeId: saved.helper_driver_employee_id || saved.helperDriverEmployeeId || '',
                                        helperDriverName: saved.helper_driver_name || saved.helperDriverName || '',
                                        helperDriverAllowance: saved.helper_driver_allowance || saved.helperDriverAllowance || 0,
                                        helperDriverFoodCost: saved.helper_driver_food_cost || saved.helperDriverFoodCost || 0,
                                        helperDriverExcessMissionDays: saved.helper_driver_excess_mission_days || saved.helperDriverExcessMissionDays || 0,
                                        helperDriverExcessMissionCost: saved.helper_driver_excess_mission_cost || saved.helperDriverExcessMissionCost || 0,
                                        helperDriverExcessKilometers: saved.helper_driver_excess_kilometers || saved.helperDriverExcessKilometers || 0,
                                        isPaid: saved.is_paid || saved.isPaid || false,
                                        // فیلدهای محاسبات دپو
                                        depotMissionDays: saved.depot_mission_days || saved.depotMissionDays || 0,
                                        depotShipmentCount: saved.depot_shipment_count || saved.depotShipmentCount || 0,
                                        depotCargoHandlingCost: saved.depot_cargo_handling_cost || saved.depotCargoHandlingCost || 0,
                                        depotKilometerRate: saved.depot_kilometer_rate || saved.depotKilometerRate || 0,
                                        depotTotalMileage: saved.depot_total_mileage || saved.depotTotalMileage || 0,
                                        depotFoodCost: saved.depot_food_cost || saved.depotFoodCost || 0,
                                        depotMissionCost: saved.depot_mission_cost || saved.depotMissionCost || 0,
                                        depotRows: saved.depot_rows ? (typeof saved.depot_rows === 'string' ? (saved.depot_rows.trim() ? JSON.parse(saved.depot_rows).map((row: any) => ({
                                            ...row,
                                            billOfLadingNumber: row.billOfLadingNumber || row.notes || ''
                                        })) : []) : saved.depot_rows.map((row: any) => ({
                                            ...row,
                                            billOfLadingNumber: row.billOfLadingNumber || row.notes || ''
                                        }))) : (saved.depotRows || []),
                                    } as any;
                                }
                                return tour;
                            });
                            
                            // محاسبه مجموع هزینه کل و پیمایش کل (از مجموع مصوب + مازاد)
                            const totalCost = updatedTours.reduce((sum, tour) => sum + (Number(tour.totalCost) || 0), 0);
                            const totalKm = updatedTours.reduce((sum, tour) => {
                                const tourTotalKm = (Number(tour.approvedKilometers) || 0) + (Number(tour.excessKilometers) || 0);
                                return sum + tourTotalKm;
                            }, 0);
                            
                            return {
                                ...calc,
                                tours: updatedTours,
                                tourCost: totalCost,
                                totalKilometers: totalKm,
                            };
                    });
                    
                    // فیلتر کردن رانندگانی که تور باز ندارند
                    const filteredUpdated = updated.filter(calc => calc.tours.length > 0);
                    console.log('📊 [loadSavedCalculations] رانندگان با تور باز:', filteredUpdated.length, 'از', updated.length);
                    
                    // تنظیم calculations با داده‌های merge شده
                    setCalculations(filteredUpdated);
                } else {
                    console.error('❌ [loadSavedCalculations] خطا در دریافت:', savedRes.status, savedRes.statusText);
                }
            } catch (err) {
                console.error('❌ [loadSavedCalculations] خطا در بارگذاری داده‌های ذخیره شده:', err);
            }
        };
        
        loadSavedCalculations();
    }, [announcements.length, calculateDriverData]);

    // به‌روزرسانی مجموع هزینه کل و پیمایش کل برای هر راننده - بعد از هر تغییر در tours
    useEffect(() => {
        if (calculations.length === 0) return;
        
        setCalculations(prev => {
            const updated = prev.map(calc => {
                // محاسبه هزینه کل از مجموع totalCost تورها
                const totalCost = calc.tours.reduce((sum, tour) => sum + (Number(tour.totalCost) || 0), 0);
                // محاسبه پیمایش کل از مجموع مصوب + مازاد
                const totalKm = calc.tours.reduce((sum, tour) => {
                    const tourTotalKm = (Number(tour.approvedKilometers) || 0) + (Number(tour.excessKilometers) || 0);
                    return sum + tourTotalKm;
                }, 0);
                return {
                    ...calc,
                    tourCost: totalCost,
                    totalKilometers: totalKm,
                };
            });
            return updated;
        });
    }, [calculations.map(c => `${c.driverId}-${c.tours.map(t => `${t.announcementId}-${t.totalCost || 0}-${t.approvedKilometers || 0}-${t.excessKilometers || 0}`).join('|')}`).join('||')]);

    const handleExpandRow = (driverId: string) => {
        const calc = calculations.find(c => c.driverId === driverId);
        if (calc) {
            setSelectedTourDetails(calc.tours);
            setSelectedDriverName(calc.driverName);
            setSelectedDriverId(calc.driverId);
            setSelectedDriverQueueType(calc.queueType || 'porsant');
            setShowTourDetailsDialog(true);
        }
    };
    

    // فیلتر و جستجو
    const filteredAndSortedCalculations = useMemo(() => {
        let filtered = [...calculations];

        // فیلتر بر اساس جستجو (کد پرسنلی و نام)
        if (searchTerm.trim()) {
            const searchLower = searchTerm.toLowerCase();
            filtered = filtered.filter(calc => 
                calc.employeeId?.toLowerCase().includes(searchLower) ||
                calc.driverName?.toLowerCase().includes(searchLower)
            );
        }

        // فیلتر بر اساس تاریخ صدور بارنامه
        if (startDate || endDate) {
            filtered = filtered.filter(calc => {
                // پیدا کردن اولین تاریخ صدور بارنامه از تورها
                const billOfLadingDates = calc.tours
                    .map(t => t.billOfLadingDate)
                    .filter(Boolean)
                    .map(d => {
                        if (typeof d === 'string') return parseJalaliDateString(d);
                        return d instanceof Date ? d : null;
                    })
                    .filter(Boolean) as Date[];
                
                if (billOfLadingDates.length === 0) return false;
                
                const firstDate = billOfLadingDates[0];
                if (!firstDate) return false;
                
                const jalaliDate = formatJalali(firstDate);
                
                if (startDate && jalaliDate < startDate) return false;
                if (endDate && jalaliDate > endDate) return false;
                
                return true;
            });
        }

        // مرتب‌سازی
        filtered.sort((a, b) => {
            let aValue: any;
            let bValue: any;

            switch (sortField) {
                case 'employeeId':
                    aValue = a.employeeId || '';
                    bValue = b.employeeId || '';
                    break;
                case 'driverName':
                    aValue = a.driverName || '';
                    bValue = b.driverName || '';
                    break;
                case 'tourCount':
                    aValue = a.tourCount || 0;
                    bValue = b.tourCount || 0;
                    break;
                case 'totalKilometers':
                    aValue = a.totalKilometers || 0;
                    bValue = b.totalKilometers || 0;
                    break;
                case 'tourCost':
                    aValue = a.tourCost || 0;
                    bValue = b.tourCost || 0;
                    break;
                case 'billOfLadingDate':
                    const aDates = a.tours.map(t => t.billOfLadingDate).filter(Boolean).map(d => {
                        if (typeof d === 'string') return parseJalaliDateString(d);
                        return d instanceof Date ? d : null;
                    }).filter(Boolean) as Date[];
                    const bDates = b.tours.map(t => t.billOfLadingDate).filter(Boolean).map(d => {
                        if (typeof d === 'string') return parseJalaliDateString(d);
                        return d instanceof Date ? d : null;
                    }).filter(Boolean) as Date[];
                    aValue = aDates.length > 0 ? aDates[0].getTime() : 0;
                    bValue = bDates.length > 0 ? bDates[0].getTime() : 0;
                    break;
                case 'queueType':
                    const queueTypeMap: { [key: string]: number } = { 'porsant': 1, 'fixed_allowance': 2, 'helper': 3 };
                    aValue = queueTypeMap[a.queueType] || 0;
                    bValue = queueTypeMap[b.queueType] || 0;
                    break;
                case 'recordedTours':
                    aValue = a.tours.filter(t => t.isDataRecorded).length;
                    bValue = b.tours.filter(t => t.isDataRecorded).length;
                    break;
                case 'unrecordedTours':
                    aValue = a.tours.filter(t => !t.isDataRecorded).length;
                    bValue = b.tours.filter(t => !t.isDataRecorded).length;
                    break;
                case 'trailerCount':
                    aValue = a.tours.filter(t => {
                        const vehicleType = t.vehicleType || '';
                        return vehicleType.includes('تریلی') && !vehicleType.includes('مینی');
                    }).length;
                    bValue = b.tours.filter(t => {
                        const vehicleType = t.vehicleType || '';
                        return vehicleType.includes('تریلی') && !vehicleType.includes('مینی');
                    }).length;
                    break;
                case 'miniTrailerCount':
                    aValue = a.tours.filter(t => {
                        const vehicleType = t.vehicleType || '';
                        return vehicleType.includes('مینی تریلی') || vehicleType.includes('مینیتریلی');
                    }).length;
                    bValue = b.tours.filter(t => {
                        const vehicleType = t.vehicleType || '';
                        return vehicleType.includes('مینی تریلی') || vehicleType.includes('مینیتریلی');
                    }).length;
                    break;
                case 'tenWheelerCount':
                    aValue = a.tours.filter(t => {
                        const vehicleType = t.vehicleType || '';
                        return vehicleType.includes('ده چرخ') || vehicleType.includes('دهچرخ');
                    }).length;
                    bValue = b.tours.filter(t => {
                        const vehicleType = t.vehicleType || '';
                        return vehicleType.includes('ده چرخ') || vehicleType.includes('دهچرخ');
                    }).length;
                    break;
                case 'commissionBase':
                    const getCommissionBase = (calc: DriverCalculationRow): string => {
                        const trailerCount = calc.tours.filter(t => {
                            const vehicleType = t.vehicleType || '';
                            return vehicleType.includes('تریلی') && !vehicleType.includes('مینی');
                        }).length;
                        const miniTrailerCount = calc.tours.filter(t => {
                            const vehicleType = t.vehicleType || '';
                            return vehicleType.includes('مینی تریلی') || vehicleType.includes('مینیتریلی');
                        }).length;
                        const totalTours = calc.tours.length;
                        const trailerAndMiniTrailerCount = trailerCount + miniTrailerCount;
                        const trailerAndMiniTrailerPercent = totalTours > 0 ? Math.round((trailerAndMiniTrailerCount / totalTours) * 100) : 0;
                        
                        if (trailerAndMiniTrailerPercent > 50) {
                            return 'تریلی';
                        } else if (trailerAndMiniTrailerPercent < 50) {
                            return 'ده چرخ';
                        } else {
                            return 'تریلی';
                        }
                    };
                    aValue = getCommissionBase(a);
                    bValue = getCommissionBase(b);
                    break;
                default:
                    aValue = a.employeeId || '';
                    bValue = b.employeeId || '';
            }

            if (typeof aValue === 'string' && typeof bValue === 'string') {
                return sortDirection === 'asc' 
                    ? aValue.localeCompare(bValue, 'fa')
                    : bValue.localeCompare(aValue, 'fa');
            } else if (sortField === 'commissionBase') {
                // برای commissionBase، مقایسه string انجام می‌شود
                const aStr = String(aValue);
                const bStr = String(bValue);
                return sortDirection === 'asc' 
                    ? aStr.localeCompare(bStr, 'fa')
                    : bStr.localeCompare(aStr, 'fa');
            } else {
                return sortDirection === 'asc' 
                    ? (aValue as number) - (bValue as number)
                    : (bValue as number) - (aValue as number);
            }
        });

        return filtered;
    }, [calculations, searchTerm, startDate, endDate, sortField, sortDirection]);

    // محاسبه صفحه‌بندی
    const totalPages = Math.ceil(filteredAndSortedCalculations.length / itemsPerPage);
    const paginatedCalculations = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredAndSortedCalculations.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredAndSortedCalculations, currentPage, itemsPerPage]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
        setCurrentPage(1); // بازگشت به صفحه اول
    };

    // فیلتر داده‌ها بر اساس تاریخ خروجی اکسل
    const getExcelFilteredData = () => {
        if (!excelStartDate && !excelEndDate) return filteredAndSortedCalculations;
        
        return filteredAndSortedCalculations.filter(calc => {
            const billOfLadingDates = calc.tours
                .map(t => t.billOfLadingDate)
                .filter(Boolean)
                .map(d => {
                    if (typeof d === 'string') return parseJalaliDateString(d);
                    return d instanceof Date ? d : null;
                })
                .filter(Boolean) as Date[];
            
            if (billOfLadingDates.length === 0) return false;
            
            const firstDate = billOfLadingDates[0];
            if (!firstDate) return false;
            
            const jalaliDate = formatJalali(firstDate);
            
            if (excelStartDate && jalaliDate < excelStartDate) return false;
            if (excelEndDate && jalaliDate > excelEndDate) return false;
            
            return true;
        });
    };

    // خلاصه تورها در بازه فیلتر شده (بر اساس تاریخ صدور بارنامه)
    const tourSummary = useMemo(() => {
        let totalTours = 0;
        let unrecordedTours = 0;
        let recordedPaidTours = 0;
        let recordedUnpaidTours = 0;
        let recordedPaidCost = 0;
        let recordedUnpaidCost = 0;

        if (!calculations || calculations.length === 0) {
            return {
                totalTours: 0,
                unrecordedTours: 0,
                recordedPaidTours: 0,
                recordedUnpaidTours: 0,
                recordedPaidCost: 0,
                recordedUnpaidCost: 0,
            };
        }

        calculations.forEach(calc => {
            if (!calc.tours || calc.tours.length === 0) return;
            
            calc.tours.forEach(tour => {
                // فیلتر بر اساس جستجو راننده
                if (searchTerm.trim()) {
                    const searchLower = searchTerm.toLowerCase();
                    const matchesDriver =
                        (calc.employeeId || '').toLowerCase().includes(searchLower) ||
                        (calc.driverName || '').toLowerCase().includes(searchLower);
                    if (!matchesDriver) return;
                }

                // برای تورهای محاسبه شده: فقط آن‌هایی که تاریخ صدور بارنامه دارند و در بازه فیلتر هستند
                if (tour.isDataRecorded) {
                    // تورهای محاسبه شده باید تاریخ صدور بارنامه داشته باشند
                    if (!tour.billOfLadingDate) return;
                    
                    // فیلتر تاریخ صدور بارنامه
                    let jalaliDate: string;
                    if (typeof tour.billOfLadingDate === 'string') {
                        jalaliDate = tour.billOfLadingDate;
                    } else {
                        jalaliDate = formatJalali(tour.billOfLadingDate as Date);
                    }
                    
                    if (startDate || endDate) {
                        if (startDate && jalaliDate < startDate) return;
                        if (endDate && jalaliDate > endDate) return;
                    }

                    // محاسبه هزینه
                    const tourCost = Number(tour.totalCost) || 0;
                    
                    if ((tour as any).isPaid) {
                        recordedPaidTours += 1;
                        recordedPaidCost += tourCost;
                    } else {
                        recordedUnpaidTours += 1;
                        recordedUnpaidCost += tourCost;
                    }
                    
                    totalTours += 1;
                } else {
                    // تورهای محاسبه نشده: همه را در نظر بگیر (حتی بدون تاریخ)
                    // فیلتر تاریخ برای تورهای محاسبه نشده اعمال نمی‌شود
                    unrecordedTours += 1;
                    totalTours += 1;
                }
            });
        });

        return {
            totalTours,
            unrecordedTours,
            recordedPaidTours,
            recordedUnpaidTours,
            recordedPaidCost,
            recordedUnpaidCost,
        };
    }, [calculations, searchTerm, startDate, endDate]);

    // خروجی اکسل - نوع اول: فقط ردیف‌های اصلی
    const exportToExcelMainRows = () => {
        const excelData = getExcelFilteredData();
        
        const wsData = [
            ['ردیف', 'کد پرسنلی', 'نام و نام خانوادگی', 'صف', 'تعداد تور', 'تور محاسبه نشده', 'تور محاسبه شده', 'پیمایش کل (کیلومتر)', 'هزینه کل تور (ریال)', 'تاریخ صدور بارنامه']
        ];

        excelData.forEach((calc, index) => {
            const recordedTours = calc.tours.filter(t => t.isDataRecorded).length;
            const unrecordedTours = calc.tours.length - recordedTours;
            const totalKm = calc.tours.reduce((sum, tour) => {
                const tourTotalKm = (Number(tour.approvedKilometers) || 0) + (Number(tour.excessKilometers) || 0);
                return sum + tourTotalKm;
            }, 0);
            const totalCost = calc.tours.reduce((sum, tour) => sum + (Number(tour.totalCost) || 0), 0);
            
            // پیدا کردن اولین تاریخ صدور بارنامه
            const firstBillDate = calc.tours
                .map(t => t.billOfLadingDate)
                .filter(Boolean)[0];
            const billDateStr = firstBillDate 
                ? (typeof firstBillDate === 'string' ? firstBillDate : formatJalali(firstBillDate))
                : '';

            const queueTypeStr = calc.queueType === 'porsant' ? 'پورسانت' : 
                                calc.queueType === 'fixed_allowance' ? 'اجرت ثابت' : 
                                'راننده کمکی';

            wsData.push([
                index + 1,
                calc.employeeId || '',
                calc.driverName || '',
                queueTypeStr,
                calc.tourCount || 0,
                unrecordedTours,
                recordedTours,
                totalKm,
                totalCost,
                billDateStr
            ]);
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        
        // تنظیم راست‌چین برای تمام ستون‌ها
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                if (!ws[cellAddress]) continue;
                
                if (!ws[cellAddress].s) ws[cellAddress].s = {};
                if (!ws[cellAddress].s.alignment) ws[cellAddress].s.alignment = {};
                ws[cellAddress].s.alignment.horizontal = 'right';
                ws[cellAddress].s.alignment.vertical = 'center';
                
                // فرمت اعداد برای ستون‌های عددی (ردیف 0 = هدر)
                if (R > 0) {
                    const colIndex = C;
                    // ستون‌های عددی: ردیف (0), تعداد تور (4), تور محاسبه‌نشده (5), تور محاسبه‌شده (6), پیمایش (7), هزینه (8)
                    if ([0, 4, 5, 6, 7, 8].includes(colIndex)) {
                        if (typeof wsData[R][colIndex] === 'number') {
                            ws[cellAddress].z = '#,##0';
                        }
                    }
                }
            }
        }
        
        // تنظیم عرض ستون‌ها
        ws['!cols'] = [
            { wch: 8 },  // ردیف
            { wch: 12 }, // کد پرسنلی
            { wch: 20 }, // نام
            { wch: 15 }, // صف
            { wch: 12 }, // تعداد تور
            { wch: 14 }, // تور محاسبه‌نشده
            { wch: 14 }, // تور محاسبه‌شده
            { wch: 18 }, // پیمایش کل
            { wch: 18 }, // هزینه کل
            { wch: 18 }  // تاریخ
        ];
        
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'محاسبه هزینه تور');
        XLSX.writeFile(wb, `محاسبات_اجرت_پیمایش_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    // خروجی اکسل - نوع دوم: ریز ردیف‌ها با تمام جزئیات
    const exportToExcelDetailRows = () => {
        const excelData = getExcelFilteredData();
        
        const wsData = [
            ['ردیف', 'کد پرسنلی', 'نام و نام خانوادگی', 'شماره تور', 'نوع خودرو', 'کد * پلاک', 'لاین', 'مقاصد', 'شماره بارنامه', 'تاریخ صدور بارنامه', 'پیمایش مصوب (کیلومتر)', 'پیمایش مازاد (کیلومتر)', 'ماموریت مصوب (روز)', 'ماموریت مازاد (روز)', 'هزینه عوارض (ریال)', 'هزینه بارگیری (ریال)', 'هزینه غذا (ریال)', 'هزینه سوخت (ریال)', 'هزینه تور (ریال)', 'هزینه کل (ریال)', 'توضیحات']
        ];

        let rowIndex = 1;
        excelData.forEach((calc) => {
            calc.tours.forEach((tour) => {
                const billDateStr = tour.billOfLadingDate 
                    ? (typeof tour.billOfLadingDate === 'string' ? tour.billOfLadingDate : formatJalali(tour.billOfLadingDate))
                    : '';

                wsData.push([
                    rowIndex++,
                    calc.employeeId || '',
                    calc.driverName || '',
                    tour.announcementCode || '',
                    tour.vehicleType || '',
                    `${tour.vehicleCode || '-'} * ${tour.plateNumber || '-'}`,
                    tour.lineType || '',
                    tour.destinations.join('، ') || '',
                    tour.billOfLadingNumber || '',
                    billDateStr,
                    tour.approvedKilometers || 0,
                    tour.excessKilometers || 0,
                    tour.approvedMissionDays || 0,
                    tour.excessMissionDays || 0,
                    tour.tollCost || 0,
                    tour.loadingCost || 0,
                    tour.foodCost || 0,
                    tour.fuelCost || 0,
                    tour.tourCost || 0,
                    tour.totalCost || 0,
                    tour.notes || ''
                ]);
            });
        });

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        
        // تنظیم راست‌چین برای تمام ستون‌ها
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                if (!ws[cellAddress]) continue;
                
                if (!ws[cellAddress].s) ws[cellAddress].s = {};
                if (!ws[cellAddress].s.alignment) ws[cellAddress].s.alignment = {};
                ws[cellAddress].s.alignment.horizontal = 'right';
                ws[cellAddress].s.alignment.vertical = 'center';
                
                // فرمت اعداد برای ستون‌های عددی (ردیف 0 = هدر)
                if (R > 0) {
                    const colIndex = C;
                    // ستون‌های عددی: ردیف (0), پیمایش مصوب (10), پیمایش مازاد (11), ماموریت مصوب (12), ماموریت مازاد (13), هزینه‌ها (14-19)
                    if ([0, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].includes(colIndex)) {
                        if (typeof wsData[R][colIndex] === 'number') {
                            ws[cellAddress].z = '#,##0';
                        }
                    }
                }
            }
        }
        
        // تنظیم عرض ستون‌ها
        ws['!cols'] = [
            { wch: 8 },  // ردیف
            { wch: 12 }, // کد پرسنلی
            { wch: 20 }, // نام
            { wch: 15 }, // شماره تور
            { wch: 12 }, // نوع خودرو
            { wch: 15 }, // کد * پلاک
            { wch: 12 }, // لاین
            { wch: 20 }, // مقاصد
            { wch: 15 }, // شماره بارنامه
            { wch: 18 }, // تاریخ
            { wch: 18 }, // پیمایش مصوب
            { wch: 18 }, // پیمایش مازاد
            { wch: 15 }, // ماموریت مصوب
            { wch: 15 }, // ماموریت مازاد
            { wch: 18 }, // هزینه عوارض
            { wch: 18 }, // هزینه بارگیری
            { wch: 18 }, // هزینه غذا
            { wch: 18 }, // هزینه سوخت
            { wch: 18 }, // هزینه تور
            { wch: 18 }, // هزینه کل
            { wch: 30 }  // توضیحات
        ];
        
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'جزئیات محاسبات');
        XLSX.writeFile(wb, `جزئیات_محاسبات_اجرت_پیمایش_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handleEditData = async (driverId: string, tourId: string) => {
        const calc = calculations.find(c => c.driverId === driverId);
        if (!calc) return;
        
        const tour = calc.tours.find(t => t.announcementId === tourId);
        if (!tour) return;

        // اگر داده‌ای ثبت شده، آن را نمایش بده
        if (tour.isDataRecorded) {
            // تاریخ محاسبه پیش‌فرض: امروز
            const today = new Date();
            const [jy, jm, jd] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
            const defaultCalculationDate = `${jy}/${pad2(jm)}/${pad2(jd)}`;
            
            // تاریخ صدور بارنامه
            const billDateStr = tour.billOfLadingDate 
                ? (typeof tour.billOfLadingDate === 'string' ? tour.billOfLadingDate : formatJalali(tour.billOfLadingDate))
                : '';
            
            // محاسبه هزینه سوخت برای نمایش در دیالوگ
            const vehicleTypeForFuel = tour.vehicleType || '';
            let initialFuelCost = tour.fuelCost || 0;
            const fuelReg = fuelConsumptionRegulations[vehicleTypeForFuel];
            if (fuelReg && !initialFuelCost) {
                const totalKmForFuel = (tour.approvedKilometers || 0) + (tour.excessKilometers || 0);
                initialFuelCost = Math.round((totalKmForFuel / 100) * fuelReg.consumptionPercentage * fuelReg.fuelPrice) || 0;
            }
            
            // محاسبه تعداد چندجا تخلیه
            const multiUnloadCount = Math.max(0, (tour.destinations?.length || 0) - 1);
            
            setInputDialogData({
                tourId: tour.announcementId,
                driverId: calc.driverId,
                driverEmployeeId: calc.employeeId || '',
                driverName: calc.driverName || '',
                vehicleCode: tour.vehicleCode || '',
                vehiclePlate: tour.plateNumber || '',
                vehicleType: tour.vehicleType || '',
                destinations: tour.destinations?.join('، ') || '',
                billOfLadingNumber: tour.billOfLadingNumber || '',
                billOfLadingDate: billDateStr,
                billOfLadingCost: (tour as any).billOfLadingCost || 0,
                approvedKilometers: tour.approvedKilometers || 0,
                excessKilometers: tour.excessKilometers || 0,
                approvedMissionDays: tour.approvedMissionDays || 1,
                excessMissionDays: tour.excessMissionDays || 0,
                multiUnloadCount: multiUnloadCount,
                tollCost: tour.tollCost || 0,
                fuelCost: initialFuelCost,
                loadingCost: tour.loadingCost || 0,
                returnCargoCost: (tour as any).returnCargoCost || 0,
                returnBillOfLadingCost: (tour as any).returnBillOfLadingCost || 0,
                multiUnloadCost: (tour as any).multiUnloadCost || 0,
                excessMissionCost: (tour as any).excessMissionCost || 0,
                helperDriverCost: (tour as any).helperDriverCost || 0,
                fixedAllowance: (tour as any).fixedAllowance || 0,
                advancePayment: (tour as any).advancePayment || 0,
                calculationDate: tour.calculationDate || defaultCalculationDate,
                notes: tour.notes || '',
                helperDriverId: (tour as any).helperDriverId || '',
                helperDriverEmployeeId: (tour as any).helperDriverEmployeeId || '',
                helperDriverName: (tour as any).helperDriverName || '',
                helperDriverAllowance: (tour as any).helperDriverAllowance || 0,
                helperDriverFoodCost: (tour as any).helperDriverFoodCost || 0,
                helperDriverExcessMissionDays: (tour as any).helperDriverExcessMissionDays || (tour as any).excessMissionDays || 0,
                helperDriverExcessMissionCost: (tour as any).helperDriverExcessMissionCost || 0,
                helperDriverExcessKilometers: (tour as any).helperDriverExcessKilometers || 0,
                // فیلدهای محاسبات دپو
                depotMissionDays: (tour as any).depotMissionDays || 0,
                depotShipmentCount: (tour as any).depotShipmentCount || 0,
                depotCargoHandlingCost: (tour as any).depotCargoHandlingCost || 0,
                depotKilometerRate: (tour as any).depotKilometerRate || 0,
                depotTotalMileage: (tour as any).depotTotalMileage || 0,
                depotFoodCost: (tour as any).depotFoodCost || (tour as any).depot_food_cost || 0,
                depotMissionCost: (tour as any).depotMissionCost || (tour as any).depot_mission_cost || 0,
                depotRows: (tour as any).depotRows ? (typeof (tour as any).depotRows === 'string' ? ((tour as any).depotRows.trim() ? JSON.parse((tour as any).depotRows).map((row: any) => ({
                    ...row,
                    billOfLadingNumber: row.billOfLadingNumber || row.notes || ''
                })) : []) : (tour as any).depotRows.map((row: any) => ({
                    ...row,
                    billOfLadingNumber: row.billOfLadingNumber || row.notes || ''
                }))) : ((tour as any).depot_rows ? (typeof (tour as any).depot_rows === 'string' ? ((tour as any).depot_rows.trim() ? JSON.parse((tour as any).depot_rows).map((row: any) => ({
                    ...row,
                    billOfLadingNumber: row.billOfLadingNumber || row.notes || ''
                })) : []) : (tour as any).depot_rows.map((row: any) => ({
                    ...row,
                    billOfLadingNumber: row.billOfLadingNumber || row.notes || ''
                }))) : []),
            });
            
            // اگر اطلاعات دپو وجود دارد، بخش دپو را به صورت خودکار باز کن
            const hasDepotData = (tour as any).depotRows || (tour as any).depot_rows || (tour as any).depotTotalMileage || (tour as any).depot_total_mileage || (tour as any).depotShipmentCount || (tour as any).depot_shipment_count || (tour as any).depotMissionDays || (tour as any).depot_mission_days;
            if (hasDepotData) {
                setIsDepotSectionOpen(true);
            }
            
            setShowInputDialog(true);
        }
    };

    const handleRecordData = async (driverId: string, tourId: string) => {
        const calc = calculations.find(c => c.driverId === driverId);
        if (!calc) return;
        
        const tour = calc.tours.find(t => t.announcementId === tourId);
        if (!tour) return;

        // دریافت اطلاعات مصوب از API بر اساس مسیر و شهر
        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };
            
            // دریافت اطلاعات اعلام بار
            const announcementRes = await fetch(getApiUrl(`freight-announcements/${tourId}`), { headers });
            let approvedKm = tour.roundTripKm || 0;
            let approvedDays = 1;
            let billOfLading = '';
            let announcementData: any = null;
            
            if (announcementRes.ok) {
                announcementData = await announcementRes.json();
                console.log('📦 [handleRecordData] اطلاعات اعلام بار:', {
                    bill_of_lading_number: announcementData.bill_of_lading_number,
                    billOfLadingNumber: announcementData.billOfLadingNumber,
                    approved_kilometers: announcementData.approved_kilometers,
                    approved_mission_days: announcementData.approved_mission_days
                });
                
                // دریافت شماره بارنامه
                billOfLading = announcementData.bill_of_lading_number || announcementData.billOfLadingNumber || '';
                
                // دریافت اطلاعات مصوب از dispatch_routes بر اساس آخرین شهر مقصد (برای مسیرهای چندمقصدی)
                if (tour.destinations && tour.destinations.length > 0) {
                    // استفاده از آخرین شهر مقصد (آخرین مقصد)
                    const lastCity = tour.destinations[tour.destinations.length - 1];
                    try {
                        const routeRes = await fetch(
                            getApiUrl(`freight-announcements/routes/search?city=${encodeURIComponent(lastCity)}`), 
                            { headers }
                        );
                        
                        if (routeRes.ok) {
                            const routeData = await routeRes.json();
                            console.log('🛣️ [handleRecordData] داده‌های مسیر دریافت شده:', {
                                lastCity,
                                routeDataCount: routeData?.length || 0,
                                routeData
                            });
                            
                            if (routeData && routeData.length > 0) {
                                // استفاده از اولین route پیدا شده (بزرگترین round_trip_km)
                                const route = routeData[0];
                                approvedKm = route.roundTripKm || route.round_trip_km || tour.roundTripKm || 0;
                                // استفاده از approved_allowance از dispatch_routes برای مدت ماموریت مصوب (بر حسب روز)
                                // approved_allowance در dispatch_routes به معنای مدت ماموریت مصوب بر حسب روز است
                                if (route.approvedAllowance !== undefined && route.approvedAllowance !== null) {
                                    approvedDays = Number(route.approvedAllowance);
                                } else if (route.approved_allowance !== undefined && route.approved_allowance !== null) {
                                    approvedDays = Number(route.approved_allowance);
                                } else if (route.expectedDays !== undefined && route.expectedDays !== null) {
                                    approvedDays = Number(route.expectedDays);
                                } else if (route.expected_days !== undefined && route.expected_days !== null) {
                                    approvedDays = Number(route.expected_days);
                                } else {
                                    approvedDays = announcementData.approved_mission_days || 1;
                                }
                                console.log('✅ [handleRecordData] اطلاعات مصوب از dispatch_routes:', {
                                    lastCity,
                                    allDestinations: tour.destinations,
                                    approvedKm,
                                    approvedDays,
                                    routeExpectedDays: route.expectedDays,
                                    routeExpected_days: route.expected_days,
                                    routeApprovedAllowance: route.approvedAllowance,
                                    routeApproved_allowance: route.approved_allowance,
                                    announcementApprovedDays: announcementData.approved_mission_days,
                                    route
                                });
                            } else {
                                console.warn('⚠️ [handleRecordData] هیچ مسیری برای شهر پیدا نشد:', lastCity);
                            }
                        } else {
                            console.warn('⚠️ [handleRecordData] خطا در دریافت route:', routeRes.status, routeRes.statusText);
                        }
                    } catch (routeErr) {
                        console.warn('⚠️ [handleRecordData] خطا در دریافت اطلاعات مسیر:', routeErr);
                    }
                }
                
                // اگر از API اطلاعات مصوب نیامد، از announcementData استفاده کن
                if (announcementData.approved_kilometers && approvedKm === 0) {
                    approvedKm = announcementData.approved_kilometers;
                }
                if (announcementData.approved_mission_days && approvedDays === 1) {
                    approvedDays = announcementData.approved_mission_days;
                }
            } else {
                console.warn('⚠️ [handleRecordData] خطا در دریافت اعلام بار:', announcementRes.status, announcementRes.statusText);
            }
            
            // تاریخ محاسبه پیش‌فرض: امروز
            const today = new Date();
            const [jy, jm, jd] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
            const defaultCalculationDate = `${jy}/${pad2(jm)}/${pad2(jd)}`;
            
            // دریافت تاریخ صدور بارنامه از announcementData (که قبلاً خوانده شده)
            let billOfLadingDateStr = '';
            if (announcementRes.ok && announcementData) {
                if (announcementData.bill_of_lading_date) {
                    billOfLadingDateStr = typeof announcementData.bill_of_lading_date === 'string' 
                        ? announcementData.bill_of_lading_date 
                        : formatJalali(announcementData.bill_of_lading_date);
                } else if (tour.billOfLadingDate) {
                    billOfLadingDateStr = typeof tour.billOfLadingDate === 'string' 
                        ? tour.billOfLadingDate 
                        : formatJalali(tour.billOfLadingDate);
                }
            } else if (tour.billOfLadingDate) {
                billOfLadingDateStr = typeof tour.billOfLadingDate === 'string' 
                    ? tour.billOfLadingDate 
                    : formatJalali(tour.billOfLadingDate);
            }
            
            // محاسبه هزینه سوخت برای نمایش در دیالوگ
            const vehicleTypeForFuel = tour.vehicleType || '';
            let initialFuelCost = 0;
            const fuelReg = fuelConsumptionRegulations[vehicleTypeForFuel];
            if (fuelReg) {
                const totalKmForFuel = approvedKm + (tour.excessKilometers || 0);
                initialFuelCost = Math.round((totalKmForFuel / 100) * fuelReg.consumptionPercentage * fuelReg.fuelPrice) || 0;
            }
            
            // محاسبه اجرت از بخشنامه برای صف اجرت ثابت (پیشنهاد)
            let initialFixedAllowance = (tour as any).fixedAllowance || 0;
            const activeQueueTypeForInit = selectedDriverQueueType || calc.queueType || 'porsant';
            if (activeQueueTypeForInit !== 'porsant' && initialFixedAllowance === 0) {
                try {
                    const vehicleType = tour.vehicleType || '';
                    const isTrailer = vehicleType.includes('تریلی');
                    const isTenWheeler = vehicleType.includes('ده چرخ');
                    let vehicleTypeForApi = '';
                    if (isTrailer) vehicleTypeForApi = 'تریلی';
                    else if (isTenWheeler) vehicleTypeForApi = 'ده چرخ';
                    
                    if (vehicleTypeForApi) {
                        const totalKm = approvedKm + (tour.excessKilometers || 0);
                        const allowanceRes = await fetch(
                            getApiUrl(`allowance-regulations/calculate?vehicleType=${encodeURIComponent(vehicleTypeForApi)}&kilometers=${totalKm}&billOfLadingDate=${encodeURIComponent(billOfLadingDateStr)}`),
                            { headers }
                        );
                        
                        if (allowanceRes.ok) {
                            const allowanceData = await allowanceRes.json();
                            initialFixedAllowance = Math.round(allowanceData.allowance || 0) || 0;
                            console.log('💰 [handleRecordData] اجرت پیشنهادی از بخشنامه:', initialFixedAllowance);
                        }
                    }
                } catch (err) {
                    console.warn('⚠️ [handleRecordData] خطا در محاسبه اجرت پیشنهادی:', err);
                }
            }
            
            // محاسبه تعداد چندجا تخلیه
            const multiUnloadCount = Math.max(0, (tour.destinations?.length || 0) - 1);
            
            setInputDialogData({
                tourId: tour.announcementId,
                driverId: calc.driverId,
                driverEmployeeId: calc.employeeId || '',
                driverName: calc.driverName || '',
                vehicleCode: tour.vehicleCode || '',
                vehiclePlate: tour.plateNumber || '',
                vehicleType: tour.vehicleType || '',
                destinations: tour.destinations?.join('، ') || '',
                billOfLadingNumber: billOfLading,
                billOfLadingDate: billOfLadingDateStr,
                billOfLadingCost: (tour as any).billOfLadingCost || 0,
                approvedKilometers: approvedKm,
                excessKilometers: tour.excessKilometers || 0,
                approvedMissionDays: approvedDays,
                excessMissionDays: tour.excessMissionDays || 0,
                multiUnloadCount: multiUnloadCount,
                tollCost: tour.tollCost || 0,
                fuelCost: initialFuelCost,
                loadingCost: (tour as any).loadingCost || 0,
                returnCargoCost: (tour as any).returnCargoCost || 0,
                returnBillOfLadingCost: (tour as any).returnBillOfLadingCost || 0,
                multiUnloadCost: (tour as any).multiUnloadCost || 0,
                excessMissionCost: (tour as any).excessMissionCost || 0,
                helperDriverCost: (tour as any).helperDriverCost || 0,
                fixedAllowance: initialFixedAllowance,
                advancePayment: (tour as any).advancePayment || 0,
                calculationDate: tour.calculationDate || defaultCalculationDate,
                notes: tour.notes || '',
                helperDriverId: (tour as any).helperDriverId || '',
                helperDriverEmployeeId: (tour as any).helperDriverEmployeeId || '',
                helperDriverName: (tour as any).helperDriverName || '',
                helperDriverAllowance: (tour as any).helperDriverAllowance || 0,
                helperDriverFoodCost: (tour as any).helperDriverFoodCost || 0,
                helperDriverExcessMissionDays: (tour as any).helperDriverExcessMissionDays || (tour as any).excessMissionDays || 0,
                helperDriverExcessMissionCost: (tour as any).helperDriverExcessMissionCost || 0,
                helperDriverExcessKilometers: (tour as any).helperDriverExcessKilometers || 0,
            });
        } catch (err) {
            console.error('خطا در دریافت اطلاعات مصوب:', err);
            // تاریخ محاسبه پیش‌فرض: امروز
            const today = new Date();
            const [jy, jm, jd] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
            const defaultCalculationDate = `${jy}/${pad2(jm)}/${pad2(jd)}`;
            
            // تاریخ صدور بارنامه
            const billDateStr = tour.billOfLadingDate 
                ? (typeof tour.billOfLadingDate === 'string' ? tour.billOfLadingDate : formatJalali(tour.billOfLadingDate))
                : '';
            
            // محاسبه هزینه سوخت برای نمایش در دیالوگ (در صورت خطا)
            const vehicleTypeForFuel = tour.vehicleType || '';
            let initialFuelCost = 0;
            const fuelReg = fuelConsumptionRegulations[vehicleTypeForFuel];
            if (fuelReg) {
                const totalKmForFuel = (tour.approvedKilometers || tour.roundTripKm || 0) + (tour.excessKilometers || 0);
                initialFuelCost = Math.round((totalKmForFuel / 100) * fuelReg.consumptionPercentage * fuelReg.fuelPrice) || 0;
            }
            
            // محاسبه تعداد چندجا تخلیه
            const multiUnloadCount = Math.max(0, (tour.destinations?.length || 0) - 1);
            
            // در صورت خطا، از مقادیر موجود در tour استفاده کن
            setInputDialogData({
                tourId: tour.announcementId,
                driverId: calc.driverId,
                driverEmployeeId: calc.employeeId || '',
                driverName: calc.driverName || '',
                vehicleCode: tour.vehicleCode || '',
                vehiclePlate: tour.plateNumber || '',
                vehicleType: tour.vehicleType || '',
                destinations: tour.destinations?.join('، ') || '',
                billOfLadingNumber: tour.billOfLadingNumber || '',
                billOfLadingDate: billDateStr,
                billOfLadingCost: (tour as any).billOfLadingCost || 0,
                approvedKilometers: tour.approvedKilometers || tour.roundTripKm || 0,
                excessKilometers: tour.excessKilometers || 0,
                approvedMissionDays: tour.approvedMissionDays || 1,
                excessMissionDays: tour.excessMissionDays || 0,
                multiUnloadCount: multiUnloadCount,
                tollCost: tour.tollCost || 0,
                fuelCost: initialFuelCost,
                loadingCost: (tour as any).loadingCost || 0,
                returnCargoCost: (tour as any).returnCargoCost || 0,
                returnBillOfLadingCost: (tour as any).returnBillOfLadingCost || 0,
                multiUnloadCost: (tour as any).multiUnloadCost || 0,
                excessMissionCost: (tour as any).excessMissionCost || 0,
                helperDriverCost: (tour as any).helperDriverCost || 0,
                fixedAllowance: (tour as any).fixedAllowance || 0,
                advancePayment: (tour as any).advancePayment || 0,
                calculationDate: tour.calculationDate || defaultCalculationDate,
                notes: tour.notes || '',
                helperDriverId: (tour as any).helperDriverId || '',
                helperDriverEmployeeId: (tour as any).helperDriverEmployeeId || '',
                helperDriverName: (tour as any).helperDriverName || '',
                helperDriverAllowance: (tour as any).helperDriverAllowance || 0,
                helperDriverFoodCost: (tour as any).helperDriverFoodCost || 0,
                helperDriverExcessMissionDays: (tour as any).helperDriverExcessMissionDays || (tour as any).excessMissionDays || 0,
                helperDriverExcessMissionCost: (tour as any).helperDriverExcessMissionCost || 0,
                helperDriverExcessKilometers: (tour as any).helperDriverExcessKilometers || 0,
                // فیلدهای محاسبات دپو
                depotMissionDays: (tour as any).depotMissionDays || 0,
                depotShipmentCount: (tour as any).depotShipmentCount || 0,
                depotCargoHandlingCost: (tour as any).depotCargoHandlingCost || 0,
                depotKilometerRate: (tour as any).depotKilometerRate || 0,
                depotTotalMileage: (tour as any).depotTotalMileage || 0,
                depotFoodCost: (tour as any).depotFoodCost || (tour as any).depot_food_cost || 0,
                depotMissionCost: (tour as any).depotMissionCost || (tour as any).depot_mission_cost || 0,
                depotRows: (tour as any).depotRows ? (typeof (tour as any).depotRows === 'string' ? ((tour as any).depotRows.trim() ? JSON.parse((tour as any).depotRows).map((row: any) => ({
                    ...row,
                    billOfLadingNumber: row.billOfLadingNumber || row.notes || ''
                })) : []) : (tour as any).depotRows.map((row: any) => ({
                    ...row,
                    billOfLadingNumber: row.billOfLadingNumber || row.notes || ''
                }))) : ((tour as any).depot_rows ? (typeof (tour as any).depot_rows === 'string' ? ((tour as any).depot_rows.trim() ? JSON.parse((tour as any).depot_rows).map((row: any) => ({
                    ...row,
                    billOfLadingNumber: row.billOfLadingNumber || row.notes || ''
                })) : []) : (tour as any).depot_rows.map((row: any) => ({
                    ...row,
                    billOfLadingNumber: row.billOfLadingNumber || row.notes || ''
                }))) : []),
            });
            
            // اگر اطلاعات دپو وجود دارد، بخش دپو را به صورت خودکار باز کن
            const hasDepotData = (tour as any).depotRows || (tour as any).depot_rows || (tour as any).depotTotalMileage || (tour as any).depot_total_mileage || (tour as any).depotShipmentCount || (tour as any).depot_shipment_count || (tour as any).depotMissionDays || (tour as any).depot_mission_days;
            if (hasDepotData) {
                setIsDepotSectionOpen(true);
            }
        }
        
        setShowInputDialog(true);
    };

    // محاسبه اتوماتیک اجرت وقتی فرم باز می‌شه و صف "اجرت ثابت" هست
    useEffect(() => {
        const calculateFixedAllowance = async () => {
            if (!showInputDialog || !inputDialogData || selectedDriverQueueType === 'porsant') return;
            if (inputDialogData.fixedAllowance > 0) return; // اگه قبلاً محاسبه شده، دوباره محاسبه نکن
            
            const calc = calculations.find(c => c.driverId === inputDialogData.driverId);
            if (!calc) return;
            
            const tour = calc.tours.find(t => t.announcementId === inputDialogData.tourId);
            if (!tour) return;
            
            try {
                const token = localStorage.getItem('token');
                const headers = {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                };
                
                const vehicleType = tour.vehicleType || '';
                const isTrailer = vehicleType.includes('تریلی');
                const isTenWheeler = vehicleType.includes('ده چرخ');
                let vehicleTypeForApi = '';
                if (isTrailer) vehicleTypeForApi = 'تریلی';
                else if (isTenWheeler) vehicleTypeForApi = 'ده چرخ';
                
                if (vehicleTypeForApi) {
                    // پیمایش کل = پیمایش مصوب + پیمایش مازاد + پیمایش کل دپو
                    const depotMileage = Number(inputDialogData.depotTotalMileage) || 0;
                    const totalKm = (Number(inputDialogData.approvedKilometers) || 0) + (Number(inputDialogData.excessKilometers) || 0) + depotMileage;
                    const billOfLadingDate = inputDialogData.billOfLadingDate || '';
                    
                    // دریافت بخشنامه اجرت ثابت
                    const fixedAllowanceRes = await fetch(
                        getApiUrl(`allowance-regulations/fixed-allowance?vehicleType=${encodeURIComponent(vehicleTypeForApi)}`),
                        { headers }
                    );
                    
                    if (fixedAllowanceRes.ok) {
                        const fixedAllowanceData = await fixedAllowanceRes.json();
                        
                        // پیدا کردن بخشنامه مناسب بر اساس تاریخ بارنامه
                        let applicableRegulation = null;
                        if (billOfLadingDate && fixedAllowanceData.length > 0) {
                            applicableRegulation = fixedAllowanceData.find((reg: any) => {
                                const start = reg.startDate || '';
                                const end = reg.endDate || '';
                                return billOfLadingDate >= start && billOfLadingDate <= end && reg.isActive !== false;
                            });
                        }
                        if (!applicableRegulation && fixedAllowanceData.length > 0) {
                            applicableRegulation = fixedAllowanceData.find((reg: any) => reg.isActive !== false);
                        }
                        
                        if (applicableRegulation) {
                            const ratePerKm = Number(applicableRegulation.fixedAllowancePerKm) || 0;
                            const calculatedAllowance = Math.round(totalKm * ratePerKm);
                            console.log('💰 [useEffect-init] اجرت ثابت محاسبه شده:', { totalKm, ratePerKm, calculatedAllowance });
                            
                            if (calculatedAllowance > 0) {
                                setInputDialogData(prev => prev ? { ...prev, fixedAllowance: calculatedAllowance } : null);
                            }
                        }
                    }
                }
            } catch (err) {
                console.warn('⚠️ [useEffect] خطا در محاسبه اجرت:', err);
            }
        };
        
        calculateFixedAllowance();
    }, [showInputDialog, inputDialogData?.tourId, selectedDriverQueueType]);

    const handleSaveInputData = async () => {
        if (!inputDialogData) return;

        const calc = calculations.find(c => c.driverId === inputDialogData.driverId);
        if (!calc) return;

        const tour = calc.tours.find(t => t.announcementId === inputDialogData.tourId);
        if (!tour) return;

        // محاسبات خودکار برای این تور خاص
        
        // 1. هزینه غذا راننده اصلی = ماموریت مصوب × بخشنامه غذا
        const approvedMissionDays = Number(inputDialogData.approvedMissionDays) || 0;
        const foodCost = Math.round(approvedMissionDays * (Number(foodCostPerDay) || 0)) || 0;
        
        // 2. هزینه ماموریت مازاد = ماموریت مازاد × بخشنامه ماموریت مازاد
        const excessMissionDays = Number(inputDialogData.excessMissionDays) || 0;
        const calculatedExcessMissionCost = Math.round(excessMissionDays * (Number(excessMissionCostPerDay) || 0)) || 0;
        
        // 3. هزینه چندجا تخلیه = (تعداد مقاصد - 1) × بخشنامه چندجا تخلیه
        const destinationsCount = tour.destinations?.length || 0;
        const multiUnloadUnits = Math.max(0, destinationsCount - 1);
        const calculatedMultiUnloadCost = Math.round(multiUnloadUnits * (Number(multiUnloadCostPerUnit) || 0)) || 0;
        
        // 4. اجرت راننده کمکی = بخشنامه اجرت راننده کمکی × (کیلومتر مصوب + کیلومتر مازاد راننده کمکی)
        const helperExcessKilometers = Number(inputDialogData.helperDriverExcessKilometers) || 0;
        const totalKmForHelper = (Number(inputDialogData.approvedKilometers) || 0) + helperExcessKilometers;
        const calculatedHelperDriverAllowance = Math.round(totalKmForHelper * (Number(helperAllowancePerKm) || 0)) || 0;
        
        // 5. هزینه غذا راننده کمکی = ماموریت مصوب × بخشنامه غذا
        const calculatedHelperDriverFoodCost = Math.round(approvedMissionDays * (Number(foodCostPerDay) || 0)) || 0;
        
        // 6. هزینه ماموریت مازاد راننده کمکی = ماموریت مازاد راننده کمکی × بخشنامه ماموریت مازاد
        const helperExcessMissionDays = Number(inputDialogData.helperDriverExcessMissionDays) || 0;
        const calculatedHelperDriverExcessMissionCost = Math.round(helperExcessMissionDays * (Number(excessMissionCostPerDay) || 0)) || 0;
        
        // محاسبه هزینه سوخت بر اساس نوع خودرو و بخشنامه مصرف سوخت
        const vehicleType = tour.vehicleType || '';
        let fuelCost = 0;
        const fuelReg = fuelConsumptionRegulations[vehicleType];
        if (fuelReg) {
            // محاسبه کل پیمایش
            const totalKm = (inputDialogData.approvedKilometers || 0) + (inputDialogData.excessKilometers || 0) + (inputDialogData.depotTotalMileage || 0);
            // هزینه سوخت = (کل پیمایش / 100) × درصد مصرف × قیمت هر لیتر
            fuelCost = Math.round((totalKm / 100) * fuelReg.consumptionPercentage * fuelReg.fuelPrice) || 0;
        } else {
            // اگر بخشنامه مصرف سوخت برای این نوع خودرو وجود نداشت، از مقدار موجود در inputDialogData استفاده کن
            fuelCost = Math.round(Number(inputDialogData.fuelCost) || 0) || 0;
        }
        
        // دریافت token و headers برای API calls
        const token = localStorage.getItem('token');
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        };
        
        // محاسبه اجرت بر اساس صف (از state انتخاب شده در دیالوگ جزئیات)
        let tourCost = 0;
        const activeQueueType = selectedDriverQueueType || calc.queueType || 'porsant';
        if (activeQueueType === 'porsant') {
            // اجرت بر اساس بخشنامه (بازه‌ای)
            try {
                const vehicleType = tour.vehicleType || '';
                const isTrailer = vehicleType.includes('تریلی');
                const isTenWheeler = vehicleType.includes('ده چرخ');
                
                if (isTrailer || isTenWheeler) {
                    const vehicleTypeForApi = isTrailer ? 'تریلی' : 'ده چرخ';
                    const totalKm = inputDialogData.approvedKilometers + inputDialogData.excessKilometers;
                    
                    // اضافه کردن تاریخ بارنامه برای انتخاب بخشنامه صحیح
                    const billOfLadingDateParam = inputDialogData.billOfLadingDate 
                        ? `&billOfLadingDate=${encodeURIComponent(inputDialogData.billOfLadingDate)}`
                        : '';
                    
                    const allowanceRes = await fetch(
                        getApiUrl(`allowance-regulations/calculate?vehicleType=${encodeURIComponent(vehicleTypeForApi)}&kilometers=${totalKm}${billOfLadingDateParam}`),
                        { headers }
                    );
                    
                    if (allowanceRes.ok) {
                        const allowanceData = await allowanceRes.json();
                        tourCost = Math.round(allowanceData.allowance || 0) || 0;
                        console.log('✅ [handleSaveInputData] اجرت از بخشنامه:', {
                            vehicleType: vehicleTypeForApi,
                            totalKm,
                            tourCost
                        });
                    } else {
                        console.warn('⚠️ [handleSaveInputData] خطا در دریافت اجرت از بخشنامه:', allowanceRes.status);
                    }
                }
            } catch (allowanceErr) {
                console.warn('⚠️ [handleSaveInputData] خطا در محاسبه اجرت:', allowanceErr);
            }
        } else if (activeQueueType === 'fixed_allowance') {
            // اجرت ثابت - از فیلد اجرت ثابت در دیالوگ استفاده می‌کنیم (محاسبه شده از بخشنامه)
            tourCost = Math.round(Number(inputDialogData.fixedAllowance) || 0) || 0;
        }
        
        const tollCostNum = Math.round(Number(inputDialogData.tollCost) || 0) || 0;
        const billOfLadingCostNum = Math.round(Number(inputDialogData.billOfLadingCost) || 0) || 0;
        const loadingCostNum = Math.round(Number(inputDialogData.loadingCost) || 0) || 0;
        const returnCargoCostNum = Math.round(Number(inputDialogData.returnCargoCost) || 0) || 0;
        const returnBillOfLadingCostNum = Math.round(Number(inputDialogData.returnBillOfLadingCost) || 0) || 0;
        
        // استفاده از مقادیر محاسبه شده خودکار
        const multiUnloadCostNum = calculatedMultiUnloadCost;
        const excessMissionCostNum = calculatedExcessMissionCost;
        
        // اجرت ثابت (برای رانندگان اجرت ثابت)
        const fixedAllowanceNum = activeQueueType === 'fixed_allowance' ? tourCost : 0;
        
        // هزینه راننده کمکی = اجرت راننده کمکی + هزینه غذا راننده کمکی + هزینه ماموریت مازاد راننده کمکی
        // فقط در صورتی که اطلاعات راننده کمکی ثبت شده باشد
        const hasHelperDriver = inputDialogData.helperDriverId && inputDialogData.helperDriverId.trim() !== '';
        const helperDriverTotalCost = hasHelperDriver 
            ? (calculatedHelperDriverAllowance + calculatedHelperDriverFoodCost + calculatedHelperDriverExcessMissionCost)
            : 0;
        
        // هزینه بارگیری کل = هزینه بارگیری اصلی + هزینه بار برگشتی + هزینه بارنامه برگشتی + هزینه چندجا تخلیه + هزینه ماموریت مازاد + اجرت ثابت + هزینه راننده کمکی
        const totalLoadingCost = loadingCostNum + returnCargoCostNum + returnBillOfLadingCostNum + multiUnloadCostNum + excessMissionCostNum + fixedAllowanceNum + helperDriverTotalCost;
        
        // هزینه سفر = مجموع همه هزینه‌ها
        const totalCost = Math.round(foodCost + fuelCost + tollCostNum + billOfLadingCostNum + totalLoadingCost + tourCost) || 0;
        
        // ذخیره در دیتابیس
        try {
            
            // دریافت userId از currentUser
            const userId = currentUser?.id || currentUser?.userId || '';
            
            const saveRes = await fetch(getApiUrl('driver-calculations'), {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    driverId: inputDialogData.driverId,
                    announcementId: inputDialogData.tourId,
                    billOfLadingNumber: inputDialogData.billOfLadingNumber,
                    billOfLadingCost: billOfLadingCostNum,
                    approvedKilometers: Number(inputDialogData.approvedKilometers) || 0,
                    excessKilometers: Number(inputDialogData.excessKilometers) || 0,
                    approvedMissionDays: Number(inputDialogData.approvedMissionDays) || 0,
                    excessMissionDays: Number(inputDialogData.excessMissionDays) || 0,
                    tollCost: tollCostNum,
                    loadingCost: totalLoadingCost, // هزینه بارگیری کل
                    returnCargoCost: returnCargoCostNum,
                    returnBillOfLadingCost: returnBillOfLadingCostNum,
                    multiUnloadCost: multiUnloadCostNum,
                    excessMissionCost: excessMissionCostNum,
                    fixedAllowance: activeQueueType === 'fixed_allowance' ? tourCost : 0,
                    foodCost: foodCost,
                    fuelCost: fuelCost,
                    tourCost: tourCost,
                    totalCost: totalCost,
                    notes: inputDialogData.notes,
                    queueType: activeQueueType,
                    billOfLadingDate: inputDialogData.billOfLadingDate,
                    calculationDate: inputDialogData.calculationDate,
                    depotTotalMileage: Number(inputDialogData.depotTotalMileage) || 0,
                    depotShipmentCount: Number(inputDialogData.depotShipmentCount) || 0,
                    depotCargoHandlingCost: Number(inputDialogData.depotCargoHandlingCost) || 0,
                    depotMissionDays: Number(inputDialogData.depotMissionDays) || 0,
                    depotKilometerRate: Number(inputDialogData.depotKilometerRate) || 0,
                    depotFoodCost: Number(inputDialogData.depotFoodCost) || 0,
                    depotMissionCost: Number(inputDialogData.depotMissionCost) || 0,
                    depotRows: inputDialogData.depotRows || [],
                    userId, // اضافه کردن userId
                    // فیلدهای راننده کمکی
                    helperDriverId: inputDialogData.helperDriverId || null,
                    helperDriverEmployeeId: inputDialogData.helperDriverEmployeeId || null,
                    helperDriverName: inputDialogData.helperDriverName || null,
                    helperDriverAllowance: calculatedHelperDriverAllowance,
                    helperDriverFoodCost: calculatedHelperDriverFoodCost,
                    helperDriverExcessMissionDays: helperExcessMissionDays, // استفاده از ماموریت مازاد راننده کمکی
                    helperDriverExcessMissionCost: calculatedHelperDriverExcessMissionCost,
                    helperDriverExcessKilometers: helperExcessKilometers,
                    // فیلدهای جدید
                    vehicleCode: inputDialogData.vehicleCode || null,
                    vehiclePlate: inputDialogData.vehiclePlate || null,
                    destinations: inputDialogData.destinations || null,
                    multiUnloadCount: inputDialogData.multiUnloadCount || 0,
                    advancePayment: Math.round(Number(inputDialogData.advancePayment) || 0) || 0,
                }),
            });
            
            if (!saveRes.ok) {
                const errorText = await saveRes.text();
                console.error('❌ [handleSaveInputData] خطا در ذخیره:', saveRes.status, errorText);
                throw new Error(`خطا در ذخیره اطلاعات: ${saveRes.status} - ${errorText}`);
            }
            
            const saveResult = await saveRes.json();
            console.log('✅ [handleSaveInputData] اطلاعات با موفقیت ذخیره شد:', saveResult);
        } catch (err: any) {
            console.error('❌ [handleSaveInputData] خطا در ذخیره اطلاعات:', err);
            alert(`خطا در ذخیره اطلاعات: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
            return;
        }
        
        // به‌روزرسانی اطلاعات این تور خاص
        setCalculations(prev => {
            const updated = prev.map(c => {
                if (c.driverId === inputDialogData.driverId) {
                    const updatedTours = c.tours.map(t => 
                        t.announcementId === inputDialogData.tourId
                            ? {
                                ...t,
                                billOfLadingNumber: inputDialogData.billOfLadingNumber,
                                approvedKilometers: inputDialogData.approvedKilometers,
                                excessKilometers: inputDialogData.excessKilometers,
                                approvedMissionDays: inputDialogData.approvedMissionDays,
                                excessMissionDays: inputDialogData.excessMissionDays,
                                tollCost: inputDialogData.tollCost,
                                loadingCost: totalLoadingCost, // هزینه بارگیری کل
                                billOfLadingDate: inputDialogData.billOfLadingDate ? parseJalaliDateString(inputDialogData.billOfLadingDate) : tour.billOfLadingDate,
                                calculationDate: inputDialogData.calculationDate,
                                notes: inputDialogData.notes,
                                foodCost,
                                fuelCost,
                                tourCost,
                                totalCost,
                                isDataRecorded: true,
                                billOfLadingCost: billOfLadingCostNum,
                                returnCargoCost: returnCargoCostNum,
                                returnBillOfLadingCost: returnBillOfLadingCostNum,
                                multiUnloadCost: multiUnloadCostNum,
                                excessMissionCost: excessMissionCostNum,
                                fixedAllowance: calc.queueType === 'fixed_allowance' || calc.queueType === 'helper' ? tourCost : 0,
                            } as any
                            : t
                    );
                    
                    // محاسبه مجموع هزینه کل و پیمایش کل برای این راننده
                    const driverTotalCost = updatedTours.reduce((sum, tour) => sum + (Number(tour.totalCost) || 0), 0);
                    const driverTotalKm = updatedTours.reduce((sum, tour) => {
                        const tourTotalKm = (Number(tour.approvedKilometers) || 0) + (Number(tour.excessKilometers) || 0);
                        return sum + tourTotalKm;
                    }, 0);
                    
                    return {
                        ...c,
                        tours: updatedTours,
                        tourCost: driverTotalCost,
                        totalKilometers: driverTotalKm,
                    };
                }
                return c;
            });
            
            // به‌روزرسانی دیالوگ جزئیات اگر باز است
            if (showTourDetailsDialog && selectedDriverName) {
                const updatedCalc = updated.find(c => c.driverName === selectedDriverName);
                if (updatedCalc) {
                    setSelectedTourDetails(updatedCalc.tours);
                }
            }
            
            return updated;
        });
        
        setShowInputDialog(false);
        setInputDialogData(null);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-slate-500">در حال بارگذاری...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-red-500">{error}</div>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col bg-white">
            {/* هدر ثابت */}
            <div className="flex-shrink-0 bg-white border-b border-slate-200 shadow-sm p-4">
                    <h1 className="text-2xl font-bold text-slate-800 mb-4">
                        محاسبه هزینه تور
                    </h1>

                    {/* فیلتر و جستجو - در یک ردیف */}
                    <div className="flex gap-3 items-end flex-wrap">
                        {/* بخش جستجو بر اساس کد پرسنلی و نام */}
                        <div className="flex-1 min-w-[200px] bg-blue-50 p-3 rounded-lg border border-blue-200">
                            <label className="block text-xs font-semibold text-blue-800 mb-1">
                                جستجو (کد پرسنلی / نام)
                            </label>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    setCurrentPage(1);
                                }}
                                placeholder="جستجو بر اساس کد پرسنلی یا نام..."
                                className="block w-full px-3 py-2 border border-blue-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                            />
                        </div>
                        
                        {/* بخش فیلتر تاریخ صدور بارنامه */}
                        <div className="flex gap-2 items-end bg-green-50 p-3 rounded-lg border border-green-200">
                            <div>
                                <label className="block text-xs font-semibold text-green-800 mb-1">
                                    از تاریخ (صدور بارنامه)
                                </label>
                                <input
                                    type="text"
                                    value={startDate}
                                    onChange={(e) => {
                                        setStartDate(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                    placeholder="1403/01/01"
                                    className="block w-full px-2 py-1.5 border border-green-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-green-800 mb-1">
                                    تا تاریخ (صدور بارنامه)
                                </label>
                                <input
                                    type="text"
                                    value={endDate}
                                    onChange={(e) => {
                                        setEndDate(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                    placeholder="1403/12/29"
                                    className="block w-full px-2 py-1.5 border border-green-300 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 text-sm"
                                />
                            </div>
                        </div>
                        
                        {/* بخش بازه زمانی خروجی اکسل */}
                        <div className="flex gap-2 items-end bg-purple-50 p-3 rounded-lg border border-purple-200">
                            <div>
                                <label className="block text-xs font-semibold text-purple-800 mb-1">
                                    از تاریخ (تاریخ محاسبه)
                                </label>
                                <input
                                    type="text"
                                    value={excelStartDate}
                                    onChange={(e) => setExcelStartDate(e.target.value)}
                                    placeholder="1403/01/26"
                                    className="block w-full px-2 py-1.5 border border-purple-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-purple-800 mb-1">
                                    تا تاریخ (تاریخ محاسبه)
                                </label>
                                <input
                                    type="text"
                                    value={excelEndDate}
                                    onChange={(e) => setExcelEndDate(e.target.value)}
                                    placeholder="1403/02/25"
                                    className="block w-full px-2 py-1.5 border border-purple-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 text-sm"
                                />
                            </div>
                        </div>
                        
                        {/* دکمه‌های خروجی اکسل */}
                        <div className="flex gap-2 items-end">
                            <button
                                onClick={exportToExcelMainRows}
                                className="px-3 py-2 bg-green-600 text-white rounded-md text-xs hover:bg-green-700 font-medium"
                            >
                                خروجی اکسل (ردیف‌های اصلی)
                            </button>
                            <button
                                onClick={exportToExcelDetailRows}
                                className="px-3 py-2 bg-blue-600 text-white rounded-md text-xs hover:bg-blue-700 font-medium"
                            >
                                خروجی اکسل (جزئیات)
                            </button>
                        </div>
                    </div>

                    {/* کارت خلاصه تورها بر اساس تاریخ صدور بارنامه */}
                    <div className="mt-3 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-xs font-semibold text-sky-900">
                                خلاصه تورها در بازه فیلتر شده
                            </h2>
                            <span className="text-xs text-sky-700">
                                مبنا: تاریخ صدور بارنامه و فیلترهای بالا
                            </span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
                            <div className="bg-white rounded-md border border-sky-100 px-2 py-1.5">
                                <div className="text-xs text-slate-500 mb-1">تعداد کل تورها</div>
                                <div className="text-base font-bold text-sky-700">
                                    {tourSummary.totalTours.toLocaleString('fa-IR')}
                                </div>
                            </div>
                            <div className="bg-white rounded-md border border-orange-100 px-2 py-1.5">
                                <div className="text-xs text-slate-500 mb-1">تورهای محاسبه نشده</div>
                                <div className="text-base font-bold text-orange-600">
                                    {tourSummary.unrecordedTours.toLocaleString('fa-IR')}
                                </div>
                            </div>
                            <div className="bg-white rounded-md border border-emerald-100 px-2 py-1.5">
                                <div className="text-xs text-slate-500 mb-1">تورهای محاسبه شده (پرداخت شده)</div>
                                <div className="text-sm font-bold text-emerald-600 mb-0.5">
                                    {tourSummary.recordedPaidTours.toLocaleString('fa-IR')}
                                </div>
                                <div className="text-xs font-semibold text-emerald-700">
                                    {tourSummary.recordedPaidCost.toLocaleString('fa-IR')} ریال
                                </div>
                            </div>
                            <div className="bg-white rounded-md border border-amber-100 px-2 py-1.5">
                                <div className="text-xs text-slate-500 mb-1">تورهای محاسبه شده (پرداخت نشده)</div>
                                <div className="text-sm font-bold text-amber-600 mb-0.5">
                                    {tourSummary.recordedUnpaidTours.toLocaleString('fa-IR')}
                                </div>
                                <div className="text-xs font-semibold text-amber-700">
                                    {tourSummary.recordedUnpaidCost.toLocaleString('fa-IR')} ریال
                                </div>
                            </div>
                        </div>
                    </div>
            </div>

            {/* محتوای اصلی با اسکرول */}
            <div className="flex-1 overflow-hidden flex flex-col">
                {/* صفحه‌بندی */}
                <div className="flex-shrink-0 bg-white border-b border-slate-200 px-4 py-2 flex justify-between items-center shadow-sm">
                    <div className="flex items-center gap-2">
                        <label className="text-sm text-slate-700">تعداد ردیف در هر صفحه:</label>
                        <select
                            value={itemsPerPage}
                            onChange={(e) => {
                                setItemsPerPage(Number(e.target.value));
                                setCurrentPage(1);
                            }}
                            className="px-3 py-1 border border-slate-300 rounded-md text-sm"
                        >
                            <option value={10}>10</option>
                            <option value={30}>30</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                    </div>
                    <div className="text-sm text-slate-600">
                        نمایش {((currentPage - 1) * itemsPerPage) + 1} تا {Math.min(currentPage * itemsPerPage, filteredAndSortedCalculations.length)} از {filteredAndSortedCalculations.length} ردیف
                    </div>
                </div>

                {/* جدول اصلی */}
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-sm text-right border-collapse">
                        <thead className="sticky top-0 z-10">
                            <tr className="bg-slate-700 text-white border-b">
                                <th className="p-3 text-right border-l border-slate-600">ردیف</th>
                                <th 
                                    className="p-3 text-right border-l border-slate-600 cursor-pointer hover:bg-slate-600"
                                    onClick={() => handleSort('employeeId')}
                                >
                                    کد پرسنلی {sortField === 'employeeId' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="p-3 text-right border-l border-slate-600 cursor-pointer hover:bg-slate-600"
                                    onClick={() => handleSort('driverName')}
                                >
                                    نام و نام خانوادگی {sortField === 'driverName' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                {/* ستون صف حذف شد - صف در صفحه جزئیات تورها تنظیم می‌شود */}
                                <th 
                                    className="p-3 text-right border-l border-slate-600 cursor-pointer hover:bg-slate-600"
                                    onClick={() => handleSort('tourCount')}
                                >
                                    تعداد تور {sortField === 'tourCount' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="p-3 text-right border-l border-slate-600 cursor-pointer hover:bg-slate-600"
                                    onClick={() => handleSort('unrecordedTours')}
                                >
                                    تور محاسبه نشده {sortField === 'unrecordedTours' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="p-3 text-right border-l border-slate-600 cursor-pointer hover:bg-slate-600"
                                    onClick={() => handleSort('recordedTours')}
                                >
                                    تور محاسبه شده {sortField === 'recordedTours' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="p-3 text-right border-l border-slate-600 cursor-pointer hover:bg-slate-600"
                                    onClick={() => handleSort('totalKilometers')}
                                >
                                    پیمایش کل (کیلومتر) {sortField === 'totalKilometers' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="p-3 text-right border-l border-slate-600 cursor-pointer hover:bg-slate-600"
                                    onClick={() => handleSort('tourCost')}
                                >
                                    هزینه کل تور (ریال) {sortField === 'tourCost' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="p-3 text-right border-l border-slate-600 cursor-pointer hover:bg-slate-600"
                                    onClick={() => handleSort('billOfLadingDate')}
                                >
                                    تاریخ صدور بارنامه {sortField === 'billOfLadingDate' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="p-3 text-right border-l border-slate-600 cursor-pointer hover:bg-slate-600"
                                    onClick={() => handleSort('trailerCount')}
                                >
                                    تعداد بار تریلی {sortField === 'trailerCount' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="p-3 text-right border-l border-slate-600 cursor-pointer hover:bg-slate-600"
                                    onClick={() => handleSort('miniTrailerCount')}
                                >
                                    تعداد بار مینی تریلی {sortField === 'miniTrailerCount' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="p-3 text-right border-l border-slate-600 cursor-pointer hover:bg-slate-600"
                                    onClick={() => handleSort('tenWheelerCount')}
                                >
                                    تعداد بار ده چرخ {sortField === 'tenWheelerCount' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="p-3 text-right border-l border-slate-600 cursor-pointer hover:bg-slate-600"
                                    onClick={() => handleSort('commissionBase')}
                                >
                                    مبنای محاسبه پورسانت {sortField === 'commissionBase' && (sortDirection === 'asc' ? '↑' : '↓')}
                                </th>
                                <th className="p-3 text-right">عملیات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedCalculations.map((calc, index) => {
                                const recordedTours = calc.tours.filter(t => t.isDataRecorded).length;
                                const unrecordedTours = calc.tours.length - recordedTours;
                                
                                // پیدا کردن اولین تاریخ صدور بارنامه
                                const firstBillDate = calc.tours
                                    .map(t => t.billOfLadingDate)
                                    .filter(Boolean)[0];
                                const billDateStr = firstBillDate 
                                    ? (typeof firstBillDate === 'string' ? firstBillDate : formatJalali(firstBillDate))
                                    : '-';

                                // محاسبه تعداد بارها بر اساس نوع خودرو
                                // ابتدا مینی تریلی را چک می‌کنیم تا با تریلی اشتباه نشود
                                const miniTrailerCount = calc.tours.filter(t => {
                                    const vehicleType = t.vehicleType || '';
                                    return vehicleType.includes('مینی تریلی') || vehicleType.includes('مینیتریلی');
                                }).length;
                                
                                const trailerCount = calc.tours.filter(t => {
                                    const vehicleType = t.vehicleType || '';
                                    return vehicleType.includes('تریلی') && !vehicleType.includes('مینی');
                                }).length;
                                
                                const tenWheelerCount = calc.tours.filter(t => {
                                    const vehicleType = t.vehicleType || '';
                                    return vehicleType.includes('ده چرخ') || vehicleType.includes('دهچرخ');
                                }).length;
                                
                                const totalTours = calc.tours.length;
                                
                                // محاسبه درصدها
                                const trailerPercent = totalTours > 0 ? Math.round((trailerCount / totalTours) * 100) : 0;
                                const miniTrailerPercent = totalTours > 0 ? Math.round((miniTrailerCount / totalTours) * 100) : 0;
                                const tenWheelerPercent = totalTours > 0 ? Math.round((tenWheelerCount / totalTours) * 100) : 0;
                                
                                // تعیین مبنای محاسبه پورسانت
                                // تریلی + مینی تریلی = یک دسته
                                const trailerAndMiniTrailerCount = trailerCount + miniTrailerCount;
                                const trailerAndMiniTrailerPercent = totalTours > 0 ? Math.round((trailerAndMiniTrailerCount / totalTours) * 100) : 0;
                                
                                let commissionBase = '';
                                if (trailerAndMiniTrailerPercent > 50) {
                                    commissionBase = 'تریلی';
                                } else if (trailerAndMiniTrailerPercent < 50) {
                                    commissionBase = 'ده چرخ';
                                } else {
                                    // اگر برابر 50% باشد، تریلی حساب کن
                                    commissionBase = 'تریلی';
                                }

                                return (
                                    <React.Fragment key={calc.id}>
                                        <tr className={`border-b border-slate-200 hover:bg-slate-50 ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                                            <td className="p-3 border-l border-slate-200 text-center font-medium">
                                                {((currentPage - 1) * itemsPerPage) + index + 1}
                                            </td>
                                            <td className="p-3 border-l border-slate-200 font-medium">{calc.employeeId}</td>
                                            <td className="p-3 border-l border-slate-200 font-semibold text-slate-800">{calc.driverName}</td>
                                            {/* ستون صف حذف شد - صف در صفحه جزئیات تورها تنظیم می‌شود */}
                                            <td className="p-3 border-l border-slate-200 text-center font-medium">{calc.tourCount}</td>
                                            <td className="p-3 border-l border-slate-200 text-center">
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
                                                    {unrecordedTours}
                                                </span>
                                            </td>
                                            <td className="p-3 border-l border-slate-200 text-center">
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                                                    {recordedTours}
                                                </span>
                                            </td>
                                            <td className="p-3 border-l border-slate-200 text-left font-medium">
                                                {calc.tours.reduce((sum, tour) => {
                                                    const totalKm = (Number(tour.approvedKilometers) || 0) + (Number(tour.excessKilometers) || 0);
                                                    return sum + totalKm;
                                                }, 0).toLocaleString('fa-IR')}
                                            </td>
                                            <td className="p-3 border-l border-slate-200 text-left font-semibold text-green-700">
                                                {calc.tours.reduce((sum, tour) => sum + (Number(tour.totalCost) || 0), 0).toLocaleString('fa-IR')}
                                            </td>
                                            <td className="p-3 border-l border-slate-200 text-xs">
                                                {billDateStr}
                                            </td>
                                            <td className="p-3 border-l border-slate-200 text-center">
                                                {trailerCount > 0 ? (
                                                    <span className="text-xs font-medium">
                                                        {trailerCount} ({trailerPercent}٪)
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className="p-3 border-l border-slate-200 text-center">
                                                {miniTrailerCount > 0 ? (
                                                    <span className="text-xs font-medium">
                                                        {miniTrailerCount} ({miniTrailerPercent}٪)
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className="p-3 border-l border-slate-200 text-center">
                                                {tenWheelerCount > 0 ? (
                                                    <span className="text-xs font-medium">
                                                        {tenWheelerCount} ({tenWheelerPercent}٪)
                                                    </span>
                                                ) : '-'}
                                            </td>
                                            <td className="p-3 border-l border-slate-200 text-center font-semibold">
                                                {commissionBase || '-'}
                                            </td>
                                            <td className="p-3">
                                                <button
                                                    onClick={() => handleExpandRow(calc.driverId)}
                                                    className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs hover:bg-blue-700 transition-colors"
                                                >
                                                    جزئیات
                                                </button>
                                            </td>
                                        </tr>
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* کنترل‌های صفحه‌بندی */}
                {totalPages > 1 && (
                    <div className="mt-4 flex justify-center items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="px-3 py-1 bg-slate-200 text-slate-800 rounded-md text-sm hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            قبلی
                        </button>
                        <span className="text-sm text-slate-700">
                            صفحه {currentPage} از {totalPages}
                        </span>
                        <button
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            className="px-3 py-1 bg-slate-200 text-slate-800 rounded-md text-sm hover:bg-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            بعدی
                        </button>
                    </div>
                )}
            </div>

            {/* دیالوگ ثبت اطلاعات */}
            {showInputDialog && inputDialogData && (
                <div className="fixed inset-0 bg-black bg-opacity-30 z-[60] flex items-center justify-center">
                    <div 
                        className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col transition-transform duration-200"
                        style={{ transform: `scale(${dialogZoom / 100})`, transformOrigin: 'center' }}
                    >
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-bold text-slate-800">
                                    {inputDialogData && calculations.find(c => c.driverId === inputDialogData.driverId)?.tours.find(t => t.announcementId === inputDialogData.tourId)?.isDataRecorded ? 'ویرایش اطلاعات محاسباتی' : 'ثبت اطلاعات محاسباتی'}
                                </h2>
                                <button
                                    onClick={() => setShowCalculationRulesDialog(true)}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm font-medium transition-colors border border-blue-300"
                                    title="قوانین محاسبات"
                                >
                                    <span>📋</span>
                                    <span>قوانین محاسبات</span>
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setDialogZoom(prev => Math.max(50, prev - 10))}
                                    className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-sm hover:bg-slate-300"
                                    title="کوچک کردن"
                                >
                                    −
                                </button>
                                <span className="text-sm text-slate-600 min-w-[50px] text-center">{dialogZoom}%</span>
                                <button
                                    onClick={() => setDialogZoom(prev => Math.min(150, prev + 10))}
                                    className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-sm hover:bg-slate-300"
                                    title="بزرگ کردن"
                                >
                                    +
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto" style={{ minHeight: '400px' }}>
                        {/* بخش اول: اطلاعات اصلی */}
                        <div className="space-y-4 mb-6">
                            {/* Separator: اطلاعات اصلی */}
                            <div className="flex items-center gap-3 mb-4">
                                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent"></div>
                                <h3 className="text-base font-bold text-slate-800 px-4 py-2 bg-sky-50 border border-sky-200 rounded-lg">
                                    📋 اطلاعات اصلی
                                </h3>
                                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent"></div>
                            </div>
                            <div className="space-y-4">
                            {/* نمایش نوع محاسبه اجرت */}
                            <div className={`p-3 rounded-lg border ${
                                selectedDriverQueueType === 'porsant' 
                                    ? 'bg-blue-50 border-blue-200' 
                                    : 'bg-orange-50 border-orange-200'
                            }`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${
                                            selectedDriverQueueType === 'porsant' 
                                                ? 'bg-blue-100 text-blue-800' 
                                                : 'bg-orange-100 text-orange-800'
                                        }`}>
                                            {selectedDriverQueueType === 'porsant' 
                                                ? '📊 محاسبه طبق بخشنامه پلکانی' 
                                                : '💰 اجرت ثابت'}
                                        </span>
                                    </div>
                                    {selectedDriverQueueType !== 'porsant' && (
                                        <div className="flex items-center gap-2">
                                            <label className="text-sm font-medium text-slate-700">اجرت (ریال):</label>
                                            <span className="px-3 py-2 bg-orange-100 border border-orange-300 rounded-md text-left font-bold text-orange-800 min-w-[140px]">
                                                {(() => {
                                                    // محاسبه اتوماتیک: پیمایش × نرخ بخشنامه
                                                    const depotMileage = Number(inputDialogData.depotTotalMileage) || 0;
                                                    const totalKm = (Number(inputDialogData.approvedKilometers) || 0) + (Number(inputDialogData.excessKilometers) || 0) + depotMileage;
                                                    const calculatedAllowance = inputDialogData.fixedAllowance || 0;
                                                    return calculatedAllowance ? calculatedAllowance.toLocaleString('fa-IR') : 'در حال محاسبه...';
                                                })()}
                                            </span>
                                            <span className="text-xs text-slate-500">
                                                (پیمایش: {((Number(inputDialogData.approvedKilometers) || 0) + (Number(inputDialogData.excessKilometers) || 0) + (Number(inputDialogData.depotTotalMileage) || 0)).toLocaleString('fa-IR')} کیلومتر)
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {/* جدول اطلاعات اصلی */}
                            <div className="border border-slate-300 rounded-md">
                                <table className="w-full text-sm text-right border-collapse table-fixed">
                                    <colgroup>
                                        <col style={{ width: '25%' }} />
                                        <col style={{ width: '25%' }} />
                                        <col style={{ width: '25%' }} />
                                        <col style={{ width: '25%' }} />
                                    </colgroup>
                                    <thead>
                                        <tr className="bg-slate-100 border-b border-slate-300">
                                            <th className="p-2 border-l border-slate-300">فیلد</th>
                                            <th className="p-2 border-l border-slate-300">مقدار</th>
                                            <th className="p-2 border-l border-slate-300">فیلد</th>
                                            <th className="p-2">مقدار</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* ردیف 1: کد پرسنلی راننده، نام راننده */}
                                        <tr className="border-b border-slate-200 hover:bg-slate-50">
                                            <td className="p-2 border-l border-slate-200 font-medium">کد پرسنلی راننده</td>
                                            <td className="p-2 border-l border-slate-200">
                                                <input
                                                    type="text"
                                                    value={inputDialogData.driverEmployeeId || ''}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-slate-300 rounded bg-slate-100 text-slate-600 cursor-not-allowed"
                                                />
                                            </td>
                                            <td className="p-2 border-l border-slate-200 font-medium">نام راننده</td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={inputDialogData.driverName || ''}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-slate-300 rounded bg-slate-100 text-slate-600 cursor-not-allowed"
                                                />
                                            </td>
                                        </tr>
                                        {/* ردیف 2: تاریخ محاسبه، شماره بارنامه */}
                                        <tr className="border-b border-slate-200 hover:bg-slate-50">
                                            <td className="p-2 border-l border-slate-200 font-medium">تاریخ محاسبه *</td>
                                            <td className="p-2 border-l border-slate-200">
                                                <input
                                                    type="text"
                                                    value={inputDialogData.calculationDate || ''}
                                                    onChange={(e) => setInputDialogData({
                                                        ...inputDialogData,
                                                        calculationDate: e.target.value
                                                    })}
                                                    className="w-full px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                                    placeholder="1403/01/01"
                                                />
                                            </td>
                                            <td className="p-2 border-l border-slate-200 font-medium">شماره بارنامه</td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={inputDialogData.billOfLadingNumber}
                                                    onChange={(e) => setInputDialogData({
                                                        ...inputDialogData,
                                                        billOfLadingNumber: e.target.value
                                                    })}
                                                    className="w-full px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                                    placeholder="شماره بارنامه"
                                                />
                                            </td>
                                        </tr>
                                        {/* ردیف 3: تاریخ صدور بارنامه، کد خودرو */}
                                        <tr className="border-b border-slate-200 hover:bg-slate-50">
                                            <td className="p-2 border-l border-slate-200 font-medium">تاریخ صدور بارنامه</td>
                                            <td className="p-2 border-l border-slate-200">
                                                <input
                                                    type="text"
                                                    value={inputDialogData.billOfLadingDate || ''}
                                                    onChange={(e) => setInputDialogData({
                                                        ...inputDialogData,
                                                        billOfLadingDate: e.target.value
                                                    })}
                                                    className="w-full px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                                    placeholder="1403/01/01"
                                                />
                                            </td>
                                            <td className="p-2 border-l border-slate-200 font-medium">کد خودرو</td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={inputDialogData.vehicleCode || ''}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-slate-300 rounded bg-slate-100 text-slate-600 cursor-not-allowed"
                                                />
                                            </td>
                                        </tr>
                                        {/* ردیف 4: پلاک خودرو، نوع خودرو */}
                                        <tr className="border-b border-slate-200 hover:bg-slate-50">
                                            <td className="p-2 border-l border-slate-200 font-medium">پلاک خودرو</td>
                                            <td className="p-2 border-l border-slate-200">
                                                <input
                                                    type="text"
                                                    value={inputDialogData.vehiclePlate || ''}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-slate-300 rounded bg-slate-100 text-slate-600 cursor-not-allowed"
                                                />
                                            </td>
                                            <td className="p-2 border-l border-slate-200 font-medium">نوع خودرو</td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    value={inputDialogData.vehicleType || ''}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-slate-300 rounded bg-slate-100 text-slate-600 cursor-not-allowed"
                                                />
                                            </td>
                                        </tr>
                                        {/* ردیف 5: مقاصد، پیمایش مصوب */}
                                        <tr className="border-b border-slate-200 hover:bg-slate-50">
                                            <td className="p-2 border-l border-slate-200 font-medium">مقاصد</td>
                                            <td className="p-2 border-l border-slate-200">
                                                <input
                                                    type="text"
                                                    value={inputDialogData.destinations || ''}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-slate-300 rounded bg-slate-100 text-slate-600 cursor-not-allowed"
                                                />
                                            </td>
                                            <td className="p-2 border-l border-slate-200 font-medium">پیمایش مصوب (کیلومتر)</td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={inputDialogData.approvedKilometers ? String(inputDialogData.approvedKilometers).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-slate-300 rounded bg-slate-100 text-slate-600 cursor-not-allowed text-left"
                                                />
                                            </td>
                                        </tr>
                                        {/* ردیف 6: پیمایش مازاد، ماموریت مصوب */}
                                        <tr className="border-b border-slate-200 hover:bg-slate-50">
                                            <td className="p-2 border-l border-slate-200 font-medium">پیمایش مازاد (کیلومتر) *</td>
                                            <td className="p-2 border-l border-slate-200">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={inputDialogData.excessKilometers ? String(inputDialogData.excessKilometers).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                                                    onChange={(e) => {
                                                        const inputValue = e.target.value.replace(/,/g, '');
                                                        const cleaned = inputValue.replace(/[^\d]/g, '');
                                                        const numValue = cleaned ? Number(cleaned) : 0;
                                                        setInputDialogData({
                                                            ...inputDialogData,
                                                            excessKilometers: numValue
                                                        });
                                                    }}
                                                    className="w-full px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-left"
                                                />
                                            </td>
                                            <td className="p-2 border-l border-slate-200 font-medium">ماموریت مصوب (روز)</td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={inputDialogData.approvedMissionDays ? String(inputDialogData.approvedMissionDays) : ''}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-slate-300 rounded bg-slate-100 text-slate-600 cursor-not-allowed text-left"
                                                />
                                            </td>
                                        </tr>
                                        {/* ردیف 7: تعداد چندجا تخلیه، هزینه چند جا تخلیه */}
                                        <tr className="border-b border-slate-200 hover:bg-slate-50">
                                            <td className="p-2 border-l border-slate-200 font-medium">
                                                تعداد چندجا تخلیه
                                                <p className="text-xs text-slate-500 mt-1 font-normal">محاسبه خودکار: تعداد</p>
                                            </td>
                                            <td className="p-2 border-l border-slate-200">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={inputDialogData.multiUnloadCount ? String(inputDialogData.multiUnloadCount) : ''}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-slate-300 rounded bg-slate-100 text-slate-600 cursor-not-allowed text-left"
                                                />
                                            </td>
                                            <td className="p-2 border-l border-slate-200 font-medium">
                                                هزینه چند جا تخلیه (ریال)
                                                <p className="text-xs text-slate-500 mt-1 font-normal">محاسبه خودکار</p>
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={(() => {
                                                        const calc = calculations.find(c => c.driverId === inputDialogData.driverId);
                                                        if (!calc) return '0';
                                                        const tour = calc.tours.find(t => t.announcementId === inputDialogData.tourId);
                                                        if (!tour) return '0';
                                                        const destinationsCount = tour.destinations?.length || 0;
                                                        const multiUnloadUnits = Math.max(0, destinationsCount - 1);
                                                        const cost = Math.round(multiUnloadUnits * (Number(multiUnloadCostPerUnit) || 0)) || 0;
                                                        return cost.toLocaleString('fa-IR');
                                                    })()}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-slate-300 rounded bg-slate-100 text-left"
                                                />
                                            </td>
                                        </tr>
                                        {/* ردیف 8: هزینه غذا، هزینه سوخت */}
                                        <tr className="border-b border-slate-200 hover:bg-slate-50">
                                            <td className="p-2 border-l border-slate-200 font-medium">
                                                هزینه غذا (ریال)
                                                <p className="text-xs text-slate-500 mt-1 font-normal">محاسبه خودکار: ماموریت مصوب × بخشنامه غذا</p>
                                            </td>
                                            <td className="p-2 border-l border-slate-200">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={(() => {
                                                        const approvedDays = Number(inputDialogData.approvedMissionDays) || 0;
                                                        const cost = Math.round(approvedDays * (Number(foodCostPerDay) || 0)) || 0;
                                                        return cost.toLocaleString('fa-IR');
                                                    })()}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-slate-300 rounded bg-slate-100 text-left"
                                                />
                                            </td>
                                            <td className="p-2 border-l border-slate-200 font-medium">
                                                هزینه سوخت (ریال)
                                                <p className="text-xs text-slate-500 mt-1 font-normal">محاسبه خودکار: (کل پیمایش / 100) × درصد × قیمت</p>
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={(() => {
                                                        const totalKm = (Number(inputDialogData.approvedKilometers) || 0) + (Number(inputDialogData.excessKilometers) || 0);
                                                        const vehicleType = inputDialogData.vehicleType || '';
                                                        const fuelReg = fuelConsumptionRegulations[vehicleType] || { consumptionPercentage: 0, fuelPrice: 0 };
                                                        const consumption = (totalKm / 100) * (fuelReg.consumptionPercentage || 0);
                                                        const cost = Math.round(consumption * (fuelReg.fuelPrice || 0)) || 0;
                                                        return cost.toLocaleString('fa-IR');
                                                    })()}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-slate-300 rounded bg-slate-100 text-left"
                                                />
                                            </td>
                                        </tr>
                                        {/* ردیف 9: ماموریت مازاد، حق ماموریت (ماموریت مازاد) */}
                                        <tr className="border-b border-slate-200 hover:bg-slate-50">
                                            <td className="p-2 border-l border-slate-200 font-medium">ماموریت مازاد (روز) *</td>
                                            <td className="p-2 border-l border-slate-200">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={inputDialogData.excessMissionDays ? String(inputDialogData.excessMissionDays) : ''}
                                                    onChange={(e) => {
                                                        const inputValue = e.target.value;
                                                        const cleaned = inputValue.replace(/[^\d]/g, '');
                                                        const numValue = cleaned ? Number(cleaned) : 0;
                                                        setInputDialogData({
                                                            ...inputDialogData,
                                                            excessMissionDays: numValue
                                                        });
                                                    }}
                                                    className="w-full px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-left"
                                                />
                                            </td>
                                            <td className="p-2 border-l border-slate-200 font-medium">
                                                حق ماموریت (ماموریت مازاد) (ریال)
                                                <p className="text-xs text-slate-500 mt-1 font-normal">محاسبه خودکار: ماموریت مازاد × بخشنامه</p>
                                            </td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={(() => {
                                                        const excessDays = Number(inputDialogData.excessMissionDays) || 0;
                                                        const cost = Math.round(excessDays * (Number(excessMissionCostPerDay) || 0)) || 0;
                                                        return cost.toLocaleString('fa-IR');
                                                    })()}
                                                    readOnly
                                                    className="w-full px-2 py-1 border border-slate-300 rounded bg-slate-100 text-left"
                                                />
                                            </td>
                                        </tr>
                                        {/* ردیف 10: هزینه عوارض آزاد راهی، هزینه بار برگشتی */}
                                        <tr className="border-b border-slate-200 hover:bg-slate-50">
                                            <td className="p-2 border-l border-slate-200 font-medium">هزینه عوارض آزاد راهی (ریال) *</td>
                                            <td className="p-2 border-l border-slate-200">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={inputDialogData.tollCost ? String(inputDialogData.tollCost).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                                                    onChange={(e) => {
                                                        const inputValue = e.target.value.replace(/,/g, '');
                                                        const cleaned = inputValue.replace(/[^\d]/g, '');
                                                        const numValue = cleaned ? Number(cleaned) : 0;
                                                        setInputDialogData({
                                                            ...inputDialogData,
                                                            tollCost: numValue
                                                        });
                                                    }}
                                                    className="w-full px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-left"
                                                />
                                            </td>
                                            <td className="p-2 border-l border-slate-200 font-medium">هزینه بار برگشتی (ریال)</td>
                                            <td className="p-2">
                                                <select
                                                    value={(() => {
                                                        // پیدا کردن regulation انتخاب شده بر اساس vehicleType و cargoType
                                                        const vehicleType = inputDialogData.vehicleType || '';
                                                        const isTrailer = vehicleType.includes('تریلی');
                                                        const vehicleTypeForApi = isTrailer ? 'تریلی' : 'ده چرخ';
                                                        
                                                        const selectedReg = returnCargoRegulations.find(reg => 
                                                            reg.vehicleType === vehicleTypeForApi &&
                                                            reg.cost === inputDialogData.returnCargoCost &&
                                                            reg.isActive !== false
                                                        );
                                                        
                                                        return selectedReg ? `${vehicleTypeForApi}-${selectedReg.cargoType}-${selectedReg.cost}` : '';
                                                    })()}
                                                    onChange={(e) => {
                                                        const selectedValue = e.target.value;
                                                        if (selectedValue) {
                                                            const [vehicleType, cargoType, cost] = selectedValue.split('-');
                                                            const numValue = Number(cost) || 0;
                                                            setInputDialogData({
                                                                ...inputDialogData,
                                                                returnCargoCost: numValue
                                                            });
                                                        } else {
                                                            setInputDialogData({
                                                                ...inputDialogData,
                                                                returnCargoCost: 0
                                                            });
                                                        }
                                                    }}
                                                    className="w-full px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-left"
                                                >
                                                    <option value="">انتخاب کنید</option>
                                                    {(() => {
                                                        const vehicleType = inputDialogData.vehicleType || '';
                                                        const isTrailer = vehicleType.includes('تریلی');
                                                        const vehicleTypeForApi = isTrailer ? 'تریلی' : 'ده چرخ';
                                                        
                                                        // فیلتر کردن بر اساس نوع خودرو
                                                        const filteredRegs = returnCargoRegulations.filter(reg => 
                                                            reg.vehicleType === vehicleTypeForApi && reg.isActive !== false
                                                        );
                                                        
                                                        // گروه‌بندی بر اساس cargoType
                                                        const cargoTypeLabels: { [key: string]: string } = {
                                                            'full_product': 'بار کامل محصول',
                                                            'full_box_pallet_basket': 'بار کامل جعبه/پالت/سبد',
                                                            'half': 'نیم بار'
                                                        };
                                                        
                                                        return filteredRegs.map((reg, idx) => (
                                                            <option key={idx} value={`${reg.vehicleType}-${reg.cargoType}-${reg.cost}`}>
                                                                {cargoTypeLabels[reg.cargoType] || reg.cargoType}: {reg.cost.toLocaleString('fa-IR')} ریال
                                                            </option>
                                                        ));
                                                    })()}
                                                </select>
                                            </td>
                                        </tr>
                                        {/* ردیف 11: هزینه بارنامه، پیش پرداخت */}
                                        <tr className="border-b border-slate-200 hover:bg-slate-50">
                                            <td className="p-2 border-l border-slate-200 font-medium">هزینه بارنامه (لندی گراف و ..) (ریال)</td>
                                            <td className="p-2 border-l border-slate-200">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={inputDialogData.billOfLadingCost ? String(inputDialogData.billOfLadingCost).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                                                    onChange={(e) => {
                                                        const inputValue = e.target.value.replace(/,/g, '');
                                                        const cleaned = inputValue.replace(/[^\d]/g, '');
                                                        const numValue = cleaned ? Number(cleaned) : 0;
                                                        setInputDialogData({
                                                            ...inputDialogData,
                                                            billOfLadingCost: numValue
                                                        });
                                                    }}
                                                    className="w-full px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-left"
                                                />
                                            </td>
                                            <td className="p-2 border-l border-slate-200 font-medium">پیش پرداخت (ریال)</td>
                                            <td className="p-2">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={inputDialogData.advancePayment ? String(inputDialogData.advancePayment).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                                                    onChange={(e) => {
                                                        const inputValue = e.target.value.replace(/,/g, '');
                                                        const cleaned = inputValue.replace(/[^\d]/g, '');
                                                        const numValue = cleaned ? Number(cleaned) : 0;
                                                        setInputDialogData({
                                                            ...inputDialogData,
                                                            advancePayment: numValue
                                                        });
                                                    }}
                                                    className="w-full px-2 py-1 border border-slate-300 rounded focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-left"
                                                />
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            </div>
                            
                            {/* بخش سوم: راننده کمکی */}
                            <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-300">
                                <h3 className="text-sm font-semibold text-slate-700 mb-3">راننده کمکی</h3>
                                <div className="grid grid-cols-2 gap-4 items-start">
                                    <div className="flex flex-col">
                                        <label className="block text-sm font-medium text-slate-700 mb-1 min-h-[20px]">
                                            کد پرسنلی راننده کمکی
                                        </label>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={inputDialogData.helperDriverEmployeeId || ''}
                                            onChange={(e) => {
                                                const searchTerm = e.target.value.replace(/[^\d]/g, ''); // فقط عدد
                                                setInputDialogData({
                                                    ...inputDialogData,
                                                    helperDriverEmployeeId: searchTerm
                                                });
                                                
                                                // جستجوی راننده بر اساس کد پرسنلی
                                                if (searchTerm.trim()) {
                                                    const foundDriver = drivers.find(d => 
                                                        d.employeeId?.toLowerCase() === searchTerm.toLowerCase()
                                                    );
                                                    if (foundDriver) {
                                                        setInputDialogData(prev => ({
                                                            ...prev!,
                                                            helperDriverId: foundDriver.id,
                                                            helperDriverEmployeeId: foundDriver.employeeId || '',
                                                            helperDriverName: foundDriver.name || ''
                                                        }));
                                                    } else {
                                                        // اگر راننده پیدا نشد، فقط نام را پاک کن
                                                        setInputDialogData(prev => ({
                                                            ...prev!,
                                                            helperDriverId: '',
                                                            helperDriverName: ''
                                                        }));
                                                    }
                                                } else {
                                                    // اگر فیلد خالی شد، همه اطلاعات را پاک کن
                                                    setInputDialogData(prev => ({
                                                        ...prev!,
                                                        helperDriverId: '',
                                                        helperDriverEmployeeId: '',
                                                        helperDriverName: ''
                                                    }));
                                                }
                                            }}
                                            className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-left"
                                            placeholder="کد پرسنلی"
                                        />
                                    </div>
                                    <div className="relative flex flex-col">
                                        <label className="block text-sm font-medium text-slate-700 mb-1 min-h-[20px]">
                                            نام و نام خانوادگی (جستجو)
                                        </label>
                                        <input
                                            type="text"
                                            value={inputDialogData.helperDriverName || ''}
                                            onChange={(e) => {
                                                const searchTerm = e.target.value;
                                                setInputDialogData({
                                                    ...inputDialogData,
                                                    helperDriverName: searchTerm
                                                });
                                                
                                                // نمایش نتایج جستجو
                                                if (searchTerm.trim()) {
                                                    const results = drivers.filter(d => 
                                                        d.name?.toLowerCase().includes(searchTerm.toLowerCase())
                                                    ).slice(0, 5);
                                                    setHelperDriverSearchResults(results);
                                                } else {
                                                    setHelperDriverSearchResults([]);
                                                }
                                            }}
                                            onFocus={() => {
                                                // وقتی فیلد focus می‌شود، لیست را نمایش بده
                                                const searchTerm = inputDialogData?.helperDriverName || '';
                                                if (searchTerm.trim()) {
                                                    const results = drivers.filter(d => 
                                                        d.name?.toLowerCase().includes(searchTerm.toLowerCase())
                                                    ).slice(0, 5);
                                                    setHelperDriverSearchResults(results);
                                                }
                                            }}
                                            onBlur={() => {
                                                // با تاخیر بستن لیست تا کلیک روی آیتم کار کند
                                                setTimeout(() => {
                                                    setHelperDriverSearchResults([]);
                                                }, 200);
                                            }}
                                            className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                            placeholder="جستجو با نام"
                                        />
                                        {helperDriverSearchResults.length > 0 && (
                                            <div className="absolute z-50 w-full mt-1 bg-white border border-slate-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                                {helperDriverSearchResults.map((driver) => (
                                                    <div
                                                        key={driver.id}
                                                        onClick={() => {
                                                            setInputDialogData(prev => ({
                                                                ...prev!,
                                                                helperDriverId: driver.id,
                                                                helperDriverEmployeeId: driver.employeeId || '',
                                                                helperDriverName: driver.name || ''
                                                            }));
                                                            setHelperDriverSearchResults([]);
                                                        }}
                                                        className="px-3 py-2 hover:bg-slate-100 cursor-pointer border-b border-slate-200 last:border-b-0"
                                                    >
                                                        <div className="font-medium text-slate-800">{driver.name}</div>
                                                        <div className="text-xs text-slate-500">کد پرسنلی: {driver.employeeId}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col">
                                        <label className="block text-sm font-medium text-slate-700 mb-1 min-h-[20px]">
                                            اجرت راننده کمکی (ریال)
                                        </label>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={(() => {
                                                const helperExcessKm = Number(inputDialogData.helperDriverExcessKilometers) || 0;
                                                const totalKm = (Number(inputDialogData.approvedKilometers) || 0) + helperExcessKm;
                                                const cost = Math.round(totalKm * (Number(helperAllowancePerKm) || 0)) || 0;
                                                return cost.toLocaleString('fa-IR');
                                            })()}
                                            readOnly
                                            className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-slate-100 text-left"
                                            placeholder="0"
                                        />
                                        <p className="text-xs text-slate-500 mt-1">محاسبه خودکار: (کیلومتر مصوب + مازاد راننده کمکی) × بخشنامه</p>
                                    </div>
                                    <div className="flex flex-col">
                                        <label className="block text-sm font-medium text-slate-700 mb-1 min-h-[20px]">
                                            هزینه غذا راننده کمکی (ریال)
                                        </label>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={(() => {
                                                const approvedDays = Number(inputDialogData.approvedMissionDays) || 0;
                                                const cost = Math.round(approvedDays * (Number(foodCostPerDay) || 0)) || 0;
                                                return cost.toLocaleString('fa-IR');
                                            })()}
                                            readOnly
                                            className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-slate-100 text-left"
                                            placeholder="0"
                                        />
                                        <p className="text-xs text-slate-500 mt-1">محاسبه خودکار: ماموریت مصوب × بخشنامه غذا</p>
                                    </div>
                                    <div className="flex flex-col">
                                        <label className="block text-sm font-medium text-slate-700 mb-1 min-h-[20px]">
                                            پیمایش مازاد راننده کمکی (کیلومتر)
                                        </label>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={inputDialogData.helperDriverExcessKilometers ? String(inputDialogData.helperDriverExcessKilometers).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                                            onChange={(e) => {
                                                const inputValue = e.target.value.replace(/,/g, '');
                                                const cleaned = inputValue.replace(/[^\d]/g, '');
                                                const numValue = cleaned ? Number(cleaned) : 0;
                                                setInputDialogData({
                                                    ...inputDialogData,
                                                    helperDriverExcessKilometers: numValue
                                                });
                                            }}
                                            className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-left"
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <label className="block text-sm font-medium text-slate-700 mb-1 min-h-[20px]">
                                            ماموریت مازاد راننده کمکی (روز)
                                        </label>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={inputDialogData.helperDriverExcessMissionDays ? String(inputDialogData.helperDriverExcessMissionDays) : ''}
                                            onChange={(e) => {
                                                const inputValue = e.target.value;
                                                const cleaned = inputValue.replace(/[^\d]/g, '');
                                                const numValue = cleaned ? Number(cleaned) : 0;
                                                setInputDialogData({
                                                    ...inputDialogData,
                                                    helperDriverExcessMissionDays: numValue
                                                });
                                            }}
                                            className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-left"
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="flex flex-col">
                                        <label className="block text-sm font-medium text-slate-700 mb-1 min-h-[20px]">
                                            هزینه ماموریت مازاد راننده کمکی (ریال)
                                        </label>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            value={(() => {
                                                const excessDays = Number(inputDialogData.helperDriverExcessMissionDays) || 0;
                                                const cost = Math.round(excessDays * (Number(excessMissionCostPerDay) || 0)) || 0;
                                                return cost.toLocaleString('fa-IR');
                                            })()}
                                            readOnly
                                            className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-slate-100 text-left"
                                            placeholder="0"
                                        />
                                        <p className="text-xs text-slate-500 mt-1">محاسبه خودکار: ماموریت مازاد راننده کمکی × بخشنامه</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* بخش سوم: محاسبات دپو */}
                        <div className="space-y-4 mt-6">
                            {/* Separator: محاسبات دپو */}
                            <div className="flex items-center gap-3 mb-4">
                                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent"></div>
                                <button
                                    type="button"
                                    onClick={() => setIsDepotSectionOpen(!isDepotSectionOpen)}
                                    className="flex items-center gap-2 text-base font-bold text-slate-800 px-4 py-2 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                                >
                                    <span className="text-lg">{isDepotSectionOpen ? '▼' : '▶'}</span>
                                    <span>🏢 محاسبات دپو</span>
                                </button>
                                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent"></div>
                            </div>
                            
                            {/* فیلدهای محاسبات دپو */}
                            {isDepotSectionOpen && (
                            <div className="grid grid-cols-4 gap-4 items-start">
                                {/* 1. تعداد بار ارسالی */}
                                <div className="flex flex-col">
                                    <label className="block text-sm font-medium text-slate-700 mb-1 min-h-[20px]">
                                        تعداد بار ارسالی
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        readOnly
                                        value={inputDialogData.depotShipmentCount ? String(inputDialogData.depotShipmentCount) : '0'}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-slate-100 text-left cursor-not-allowed"
                                        placeholder="0"
                                    />
                                    <p className="text-xs text-slate-500 mt-1 min-h-[16px]">محاسبه خودکار از تعداد ردیف‌های ثبت شده</p>
                                </div>
                                
                                {/* 2. هزینه جابجایی بار در دپو */}
                                <div className="flex flex-col">
                                    <label className="block text-sm font-medium text-slate-700 mb-1 min-h-[20px]">
                                        هزینه جابجایی بار در دپو (ریال)
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        readOnly
                                        value={inputDialogData.depotCargoHandlingCost ? String(inputDialogData.depotCargoHandlingCost).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '0'}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-slate-100 text-left cursor-not-allowed"
                                        placeholder="0"
                                    />
                                    <p className="text-xs text-slate-500 mt-1 min-h-[16px]">محاسبه خودکار: تعداد ردیف × هزینه بار کامل محصول</p>
                                </div>
                                
                                {/* 3. پیمایش کل دپو */}
                                <div className="flex flex-col">
                                    <label className="block text-sm font-medium text-slate-700 mb-1 min-h-[20px]">
                                        پیمایش کل دپو (کیلومتر)
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        readOnly
                                        value={inputDialogData.depotTotalMileage ? String(inputDialogData.depotTotalMileage).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '0'}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-slate-100 text-left cursor-not-allowed"
                                        placeholder="0"
                                    />
                                    <p className="text-xs text-slate-500 mt-1 min-h-[16px]">محاسبه خودکار از مجموع پیمایش ردیف‌ها</p>
                                </div>
                                
                                {/* 4. اجرت دپو */}
                                <div className="flex flex-col">
                                    <label className="block text-sm font-medium text-slate-700 mb-1 min-h-[20px]">
                                        اجرت دپو (ریال)
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        readOnly={selectedDriverQueueType === 'fixed_allowance'}
                                        value={inputDialogData.depotKilometerRate ? String(inputDialogData.depotKilometerRate).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '0'}
                                        onChange={(e) => {
                                            if (selectedDriverQueueType !== 'fixed_allowance') {
                                                const inputValue = e.target.value.replace(/,/g, '');
                                                const cleaned = inputValue.replace(/[^\d]/g, '');
                                                const numValue = cleaned ? Number(cleaned) : 0;
                                                setInputDialogData({
                                                    ...inputDialogData,
                                                    depotKilometerRate: numValue
                                                });
                                            }
                                        }}
                                        className={`block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm text-left ${
                                            selectedDriverQueueType === 'fixed_allowance' 
                                                ? 'bg-slate-100 cursor-not-allowed' 
                                                : 'focus:outline-none focus:ring-sky-500 focus:border-sky-500'
                                        }`}
                                        placeholder="0"
                                    />
                                    <p className="text-xs text-slate-500 mt-1 min-h-[16px]">
                                        {selectedDriverQueueType === 'fixed_allowance' 
                                            ? 'محاسبه خودکار: پیمایش دپو × اجرت ثابت بخشنامه' 
                                            : 'برای اجرت پورسانتی وارد کنید'}
                                    </p>
                                </div>
                                
                                {/* 5. تعداد روز ماموریت دپو */}
                                <div className="flex flex-col">
                                    <label className="block text-sm font-medium text-slate-700 mb-1 min-h-[20px]">
                                        تعداد روز ماموریت دپو
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={inputDialogData.depotMissionDays ? String(inputDialogData.depotMissionDays) : ''}
                                        onChange={(e) => {
                                            const inputValue = e.target.value;
                                            const cleaned = inputValue.replace(/[^\d]/g, '');
                                            const numValue = cleaned ? Number(cleaned) : 0;
                                            setInputDialogData({
                                                ...inputDialogData,
                                                depotMissionDays: numValue
                                            });
                                        }}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-left"
                                        placeholder="0"
                                    />
                                    <p className="text-xs text-slate-500 mt-1 min-h-[16px]"></p>
                                </div>
                                
                                {/* 7. حق ماموریت دپو */}
                                <div className="flex flex-col">
                                    <label className="block text-sm font-medium text-slate-700 mb-1 min-h-[20px]">
                                        حق ماموریت دپو (ریال)
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        readOnly
                                        value={inputDialogData.depotMissionCost ? String(inputDialogData.depotMissionCost).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : '0'}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm bg-slate-100 text-left cursor-not-allowed"
                                        placeholder="0"
                                    />
                                    <p className="text-xs text-slate-500 mt-1 min-h-[16px]">محاسبه خودکار: تعداد روز × هزینه ماموریت مازاد</p>
                                </div>
                            </div>
                            )}
                            
                            {/* جدول محاسبات دپو */}
                            {isDepotSectionOpen && (
                            <div className="mt-4">
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="text-sm font-semibold text-slate-700">جدول محاسبات دپو</h4>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            // اگر ردیف‌های پیش‌فرض وجود دارند، ابتدا آن‌ها را به depotRows تبدیل کن
                                            let currentRows = inputDialogData.depotRows || [];
                                            if (currentRows.length === 0) {
                                                // اگر هیچ ردیفی وجود ندارد، ابتدا 4 ردیف پیش‌فرض را ایجاد کن
                                                currentRows = Array.from({ length: 4 }, (_, i) => ({
                                                    id: `depot-default-${i}`,
                                                    destination: '',
                                                    mileage: 0,
                                                    billOfLadingNumber: ''
                                                }));
                                            }
                                            
                                            // حالا ردیف جدید را اضافه کن
                                            const newRow = {
                                                id: `depot-${Date.now()}-${Math.random()}`,
                                                destination: '',
                                                mileage: 0,
                                                billOfLadingNumber: ''
                                            };
                                            setInputDialogData({
                                                ...inputDialogData,
                                                depotRows: [...currentRows, newRow]
                                            });
                                        }}
                                        className="px-3 py-1.5 bg-sky-600 text-white rounded-md text-xs hover:bg-sky-700 transition-colors"
                                    >
                                        + افزودن ردیف
                                    </button>
                                </div>
                                <div className="overflow-x-auto border border-slate-300 rounded-md">
                                    <table className="w-full text-sm text-right border-collapse">
                                        <thead>
                                            <tr className="bg-slate-100 border-b border-slate-300">
                                                <th className="p-2 border-l border-slate-300 text-center min-w-[60px]">شماره ردیف</th>
                                                <th className="p-2 border-l border-slate-300 min-w-[200px]">مقاصد اعزامی دپو</th>
                                                <th className="p-2 border-l border-slate-300 min-w-[150px]">پیمایش حمل دپو (کیلومتر)</th>
                                                <th className="p-2 min-w-[200px]">شماره بارنامه</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(inputDialogData.depotRows && inputDialogData.depotRows.length > 0 ? inputDialogData.depotRows : Array.from({ length: 4 }, (_, i) => ({
                                                id: `depot-default-${i}`,
                                                destination: '',
                                                mileage: 0,
                                                billOfLadingNumber: ''
                                            }))).map((row, index) => (
                                                <tr key={row.id} className="border-b border-slate-200 hover:bg-slate-50">
                                                    <td className="p-2 border-l border-slate-200 text-center">
                                                        {index + 1}
                                                    </td>
                                                    <td className="p-2 border-l border-slate-200">
                                                        <input
                                                            type="text"
                                                            value={row.destination}
                                                            onChange={(e) => {
                                                                const updatedRows = (inputDialogData.depotRows || []).map(r => 
                                                                    r.id === row.id ? { ...r, destination: e.target.value } : r
                                                                );
                                                                // اگر ردیف پیش‌فرض است، آن را به لیست اضافه کن
                                                                if (!inputDialogData.depotRows || inputDialogData.depotRows.length === 0) {
                                                                    const defaultRows = Array.from({ length: 4 }, (_, i) => ({
                                                                        id: `depot-default-${i}`,
                                                                        destination: '',
                                                                        mileage: 0,
                                                                        billOfLadingNumber: ''
                                                                    }));
                                                                    defaultRows[index].destination = e.target.value;
                                                                    setInputDialogData({
                                                                        ...inputDialogData,
                                                                        depotRows: defaultRows
                                                                    });
                                                                } else {
                                                                    setInputDialogData({
                                                                        ...inputDialogData,
                                                                        depotRows: updatedRows
                                                                    });
                                                                }
                                                            }}
                                                            className="w-full px-2 py-1 border border-slate-300 rounded text-left focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                                            placeholder="مقصد"
                                                        />
                                                    </td>
                                                    <td className="p-2 border-l border-slate-200">
                                                        <input
                                                            type="text"
                                                            inputMode="numeric"
                                                            value={row.mileage ? String(row.mileage).replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                                                            onChange={(e) => {
                                                                const inputValue = e.target.value.replace(/,/g, '');
                                                                const cleaned = inputValue.replace(/[^\d]/g, '');
                                                                const numValue = cleaned ? Number(cleaned) : 0;
                                                                const updatedRows = (inputDialogData.depotRows || []).map(r => 
                                                                    r.id === row.id ? { ...r, mileage: numValue } : r
                                                                );
                                                                // اگر ردیف پیش‌فرض است، آن را به لیست اضافه کن
                                                                if (!inputDialogData.depotRows || inputDialogData.depotRows.length === 0) {
                                                                    const defaultRows = Array.from({ length: 4 }, (_, i) => ({
                                                                        id: `depot-default-${i}`,
                                                                        destination: '',
                                                                        mileage: 0,
                                                                        billOfLadingNumber: ''
                                                                    }));
                                                                    defaultRows[index].mileage = numValue;
                                                                    setInputDialogData({
                                                                        ...inputDialogData,
                                                                        depotRows: defaultRows
                                                                    });
                                                                } else {
                                                                    setInputDialogData({
                                                                        ...inputDialogData,
                                                                        depotRows: updatedRows
                                                                    });
                                                                }
                                                            }}
                                                            className="w-full px-2 py-1 border border-slate-300 rounded text-left focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                                            placeholder="0"
                                                        />
                                                    </td>
                                                    <td className="p-2">
                                                        <input
                                                            type="text"
                                                    value={row.billOfLadingNumber || ''}
                                                    onChange={(e) => {
                                                        const updatedRows = (inputDialogData.depotRows || []).map(r => 
                                                            r.id === row.id ? { ...r, billOfLadingNumber: e.target.value } : r
                                                        );
                                                        // اگر ردیف پیش‌فرض است، آن را به لیست اضافه کن
                                                        if (!inputDialogData.depotRows || inputDialogData.depotRows.length === 0) {
                                                            const defaultRows = Array.from({ length: 4 }, (_, i) => ({
                                                                id: `depot-default-${i}`,
                                                                destination: '',
                                                                mileage: 0,
                                                                billOfLadingNumber: ''
                                                            }));
                                                            defaultRows[index].billOfLadingNumber = e.target.value;
                                                                    setInputDialogData({
                                                                        ...inputDialogData,
                                                                        depotRows: defaultRows
                                                                    });
                                                                } else {
                                                                    setInputDialogData({
                                                                        ...inputDialogData,
                                                                        depotRows: updatedRows
                                                                    });
                                                                }
                                                            }}
                                                            className="w-full px-2 py-1 border border-slate-300 rounded text-left focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                                            placeholder="توضیحات"
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            )}
                        </div>
                        
                        {/* بخش چهارم: توضیحات */}
                        <div className="space-y-4 mt-6">
                            {/* Separator: توضیحات */}
                            <div className="flex items-center gap-3 mb-4">
                                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent"></div>
                                <h3 className="text-base font-bold text-slate-800 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
                                    📝 توضیحات
                                </h3>
                                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent"></div>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    توضیحات
                                </label>
                                <textarea
                                    value={inputDialogData.notes}
                                    onChange={(e) => setInputDialogData({
                                        ...inputDialogData,
                                        notes: e.target.value
                                    })}
                                    className="input-style w-full resize-y"
                                    rows={4}
                                    placeholder="توضیحات اختیاری..."
                                />
                            </div>
                        </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setShowInputDialog(false);
                                    setInputDialogData(null);
                                }}
                                className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md text-sm hover:bg-slate-300"
                            >
                                انصراف
                            </button>
                            <button
                                onClick={handleSaveInputData}
                                className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm hover:bg-sky-700"
                            >
                                ثبت و محاسبه
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* دیالوگ قوانین محاسبات */}
            {showCalculationRulesDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-30 z-[70] flex items-center justify-center">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                                <span>📋</span>
                                <span>قوانین محاسبات</span>
                            </h2>
                            <button
                                onClick={() => setShowCalculationRulesDialog(false)}
                                className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md text-sm hover:bg-slate-300"
                            >
                                بستن
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <div className="space-y-4 text-sm">
                                {/* راننده اصلی */}
                                <div className="bg-white p-4 rounded-lg border-2 border-blue-200 shadow-sm">
                                    <h4 className="font-bold text-slate-700 mb-3 text-base flex items-center gap-2">
                                        <span>🚗</span>
                                        <span>راننده اصلی</span>
                                    </h4>
                                    <ul className="space-y-2 text-slate-600 list-disc list-inside">
                                        <li><strong>هزینه غذا:</strong> ماموریت مصوب (روز) × هزینه غذا طبق بخشنامه</li>
                                        <li><strong>هزینه سوخت:</strong> (پیمایش مصوب + پیمایش مازاد) ÷ 100 × درصد مصرف × قیمت سوخت</li>
                                        <li><strong>اجرت (پورسانتی):</strong> بر اساس بخشنامه اجرت و پیمایش کل</li>
                                        <li><strong>اجرت (ثابت):</strong> پیمایش کل × اجرت ثابت بخشنامه</li>
                                        <li><strong>حق ماموریت:</strong> ماموریت مازاد (روز) × هزینه ماموریت مازاد طبق بخشنامه</li>
                                        <li><strong>هزینه چندجا تخلیه:</strong> (تعداد مقاصد - 1) × هزینه واحد چندجا تخلیه</li>
                                    </ul>
                                </div>
                                
                                {/* راننده کمکی */}
                                <div className="bg-white p-4 rounded-lg border-2 border-green-200 shadow-sm">
                                    <h4 className="font-bold text-slate-700 mb-3 text-base flex items-center gap-2">
                                        <span>👥</span>
                                        <span>راننده کمکی</span>
                                    </h4>
                                    <ul className="space-y-2 text-slate-600 list-disc list-inside">
                                        <li><strong>اجرت راننده کمکی:</strong> پیمایش کل × اجرت کیلومتر راننده کمکی طبق بخشنامه</li>
                                        <li><strong>هزینه غذا:</strong> ماموریت مصوب (روز) × هزینه غذا طبق بخشنامه</li>
                                        <li><strong>ماموریت مازاد:</strong> به صورت پیش‌فرض برابر با راننده اصلی (قابل ویرایش)</li>
                                        <li><strong>هزینه ماموریت مازاد:</strong> ماموریت مازاد (روز) × هزینه ماموریت مازاد طبق بخشنامه</li>
                                    </ul>
                                </div>
                                
                                {/* محاسبات دپو */}
                                <div className="bg-white p-4 rounded-lg border-2 border-purple-200 shadow-sm">
                                    <h4 className="font-bold text-slate-700 mb-3 text-base flex items-center gap-2">
                                        <span>🏢</span>
                                        <span>محاسبات دپو</span>
                                    </h4>
                                    <ul className="space-y-2 text-slate-600 list-disc list-inside">
                                        <li><strong>تعداد بار ارسالی:</strong> تعداد ردیف‌های ثبت شده در جدول دپو</li>
                                        <li><strong>هزینه جابجایی بار:</strong> تعداد بار ارسالی × هزینه بار کامل محصول طبق بخشنامه</li>
                                        <li><strong>پیمایش کل دپو:</strong> مجموع پیمایش همه ردیف‌های جدول دپو</li>
                                        <li><strong>اجرت دپو (اجرت ثابت):</strong> پیمایش کل دپو × اجرت ثابت بخشنامه</li>
                                        <li><strong>هزینه غذا دپو:</strong> تعداد روز ماموریت دپو × هزینه غذا طبق بخشنامه</li>
                                        <li><strong>هزینه ماموریت دپو:</strong> تعداد روز ماموریت دپو × هزینه ماموریت مازاد طبق بخشنامه</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            {/* صفحه نمایش جزئیات تور - تمام صفحه */}
            {showTourDetailsDialog && selectedTourDetails && (
                <div className="fixed inset-0 bg-white z-50 overflow-hidden flex flex-col">
                    <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex justify-between items-center shadow-sm z-10">
                        <h2 className="text-xl font-bold text-slate-800">
                            جزئیات تورهای {selectedDriverName}
                        </h2>
                        <button
                            onClick={() => {
                                setShowTourDetailsDialog(false);
                                setSelectedTourDetails(null);
                                setSelectedDriverName('');
                                setSelectedDriverId('');
                            }}
                            className="px-4 py-2 bg-red-600 text-white rounded-md text-sm hover:bg-red-700"
                        >
                            بستن
                        </button>
                    </div>
                    
                    {/* تنظیم صف برای تورهای جدید */}
                    <div className="bg-slate-50 border-b border-slate-200 p-4">
                        <div className="flex items-center gap-4">
                            <label className="text-sm font-medium text-slate-700">
                                نوع محاسبه اجرت برای تورهای جدید:
                            </label>
                            <select
                                value={selectedDriverQueueType}
                                onChange={(e) => {
                                    const newQueueType = e.target.value as any;
                                    setSelectedDriverQueueType(newQueueType);
                                    // به‌روزرسانی در state اصلی
                                    setCalculations(prev => prev.map(c => 
                                        c.driverId === selectedDriverId 
                                            ? { ...c, queueType: newQueueType }
                                            : c
                                    ));
                                }}
                                className="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="porsant">پورسانت (محاسبه از بخشنامه پلکانی)</option>
                                <option value="fixed_allowance">اجرت ثابت</option>
                            </select>
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${
                                selectedDriverQueueType === 'porsant' 
                                    ? 'bg-blue-100 text-blue-800' 
                                    : 'bg-orange-100 text-orange-800'
                            }`}>
                                {selectedDriverQueueType === 'porsant' 
                                    ? '📊 اجرت طبق بخشنامه' 
                                    : '💰 اجرت ثابت'}
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                            ⚠️ این تنظیم فقط برای تورهای جدید اعمال می‌شود. تورهای قبلاً ثبت شده تغییر نمی‌کنند.
                        </p>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-6">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-right border-collapse">
                                    <thead>
                                        <tr className="bg-slate-700 text-white border-b">
                                            <th className="p-3 text-right border-l border-slate-600">شماره تور</th>
                                            <th className="p-3 text-right border-l border-slate-600">نوع خودرو</th>
                                            <th className="p-3 text-right border-l border-slate-600">کد * پلاک</th>
                                            <th className="p-3 text-right border-l border-slate-600">لاین</th>
                                            <th className="p-3 text-right border-l border-slate-600">مقاصد</th>
                                            <th className="p-3 text-right border-l border-slate-600">شماره بارنامه</th>
                                            <th className="p-3 text-right border-l border-slate-600">تاریخ صدور بارنامه</th>
                                            <th className="p-3 text-right border-l border-slate-600">تاریخ محاسبه</th>
                                            <th className="p-3 text-right border-l border-slate-600">پیمایش (کیلومتر)</th>
                                            <th className="p-3 text-right border-l border-slate-600">هزینه تور (ریال)</th>
                                            <th className="p-3 text-right border-l border-slate-600">تاریخ اعلام بار</th>
                                            <th className="p-3 text-right border-l border-slate-600">وضعیت</th>
                                            <th className="p-3 text-right">عملیات</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedTourDetails.map((tour, tourIdx) => (
                                            <React.Fragment key={tour.announcementId}>
                                                <tr className={`border-b border-slate-200 ${
                                                    (tour as any).isPaid 
                                                        ? 'bg-purple-50' 
                                                        : tour.isDataRecorded 
                                                            ? 'bg-green-50' 
                                                            : 'bg-orange-50'
                                                }`}>
                                                    <td className="p-3 border-l border-slate-200 text-center">
                                                        <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-semibold text-sm ${
                                                            (tour as any).isPaid
                                                                ? 'bg-purple-600 text-white'
                                                                : tour.isDataRecorded 
                                                                    ? 'bg-green-600 text-white' 
                                                                    : 'bg-orange-500 text-white'
                                                        }`}>
                                                            {tourIdx + 1}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 border-l border-slate-200">{tour.vehicleType}</td>
                                                    <td className="p-3 border-l border-slate-200">{tour.vehicleCode || '-'} * {tour.plateNumber || '-'}</td>
                                                    <td className="p-3 border-l border-slate-200">{tour.lineType}</td>
                                                    <td className="p-3 border-l border-slate-200">{tour.destinations.join('، ')}</td>
                                                    <td className="p-3 border-l border-slate-200">
                                                        {tour.billOfLadingNumber || '-'}
                                                    </td>
                                                    <td className="p-3 border-l border-slate-200 text-xs">
                                                        {tour.billOfLadingDate ? (typeof tour.billOfLadingDate === 'string' ? tour.billOfLadingDate : formatJalali(tour.billOfLadingDate)) : '-'}
                                                    </td>
                                                    <td className="p-3 border-l border-slate-200 text-xs">
                                                        {tour.calculationDate || '-'}
                                                    </td>
                                            <td className="p-3 border-l border-slate-200 text-left">
                                                {(() => {
                                                    const totalKm = (Number(tour.approvedKilometers) || 0) + (Number(tour.excessKilometers) || 0);
                                                    const value = totalKm || tour.roundTripKm || 0;
                                                    return value ? value.toLocaleString('fa-IR') : '-';
                                                })()}
                                            </td>
                                                    <td className="p-3 border-l border-slate-200 text-left font-semibold text-green-700">
                                                        {tour.tourCost?.toLocaleString('fa-IR') || 0}
                                                    </td>
                                                    <td className="p-3 border-l border-slate-200 text-xs">
                                                        {tour.announcementDate ? formatJalali(tour.announcementDate) : '-'}
                                                    </td>
                                                    <td className="p-3 border-l border-slate-200">
                                                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                                                            (tour as any).isPaid
                                                                ? 'bg-purple-600 text-white'
                                                                : tour.isDataRecorded 
                                                                    ? 'bg-green-600 text-white' 
                                                                    : 'bg-orange-500 text-white'
                                                        }`}>
                                                            {(tour as any).isPaid ? 'پرداخت شد' : (tour.isDataRecorded ? 'ثبت شده' : 'ثبت نشده')}
                                                        </span>
                                                    </td>
                                                    <td className="p-3">
                                                        {(tour as any).isPaid ? (
                                                            <div className="flex gap-2">
                                                                <span className="text-xs text-purple-600 font-semibold">✓ پرداخت شد</span>
                                                            </div>
                                                        ) : !tour.isDataRecorded ? (
                                                            <button
                                                                onClick={() => {
                                                                    // دیالوگ را باز نگه داریم و فقط دیالوگ ثبت اطلاعات را باز کنیم
                                                                    const calc = calculations.find(c => c.driverName === selectedDriverName);
                                                                    if (calc) {
                                                                        handleRecordData(calc.driverId, tour.announcementId);
                                                                    }
                                                                }}
                                                                className="px-3 py-1.5 bg-green-600 text-white rounded-md text-xs hover:bg-green-700 transition-colors"
                                                            >
                                                                ثبت اطلاعات
                                                            </button>
                                                        ) : (
                                                            <div className="flex gap-2">
                                                                <span className="text-xs text-green-600 font-semibold">✓ ثبت شده</span>
                                                                <button
                                                                    onClick={() => {
                                                                        const calc = calculations.find(c => c.driverName === selectedDriverName);
                                                                        if (calc) {
                                                                            handleEditData(calc.driverId, tour.announcementId);
                                                                        }
                                                                    }}
                                                                    className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs hover:bg-blue-700 transition-colors"
                                                                >
                                                                    ویرایش
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                                {/* ردیف اطلاعات محاسباتی */}
                                                {/* ردیف اطلاعات محاسباتی - با پس‌زمینه و مرز پررنگ‌تر برای تفکیک بهتر */}
                                                <tr className="border-t-2 border-b-4 border-slate-300 bg-slate-50">
                                                    <td className="p-2 border-l border-slate-200"></td>
                                                    <td className="p-2 border-l border-slate-200">
                                                        <div className="text-xs text-slate-600 mb-1">پیمایش مصوب (کیلومتر)</div>
                                                        <div className={`font-semibold ${tour.isDataRecorded ? 'text-blue-700' : 'text-slate-400'}`}>
                                                            {tour.approvedKilometers?.toLocaleString('fa-IR') || '-'}
                                                        </div>
                                                    </td>
                                                    <td className="p-2 border-l border-slate-200">
                                                        <div className="text-xs text-slate-600 mb-1">پیمایش مازاد (کیلومتر)</div>
                                                        <div className={`font-semibold ${tour.isDataRecorded ? 'text-orange-700' : 'text-slate-400'}`}>
                                                            {tour.excessKilometers?.toLocaleString('fa-IR') || '-'}
                                                        </div>
                                                    </td>
                                                    <td className="p-2 border-l border-slate-200">
                                                        <div className="text-xs text-slate-600 mb-1">ماموریت مصوب (روز)</div>
                                                        <div className={`font-semibold ${tour.isDataRecorded ? 'text-blue-700' : 'text-slate-400'}`}>
                                                            {tour.approvedMissionDays || '-'}
                                                        </div>
                                                    </td>
                                                    <td className="p-2 border-l border-slate-200">
                                                        <div className="text-xs text-slate-600 mb-1">ماموریت مازاد (روز)</div>
                                                        <div className={`font-semibold ${tour.isDataRecorded ? 'text-orange-700' : 'text-slate-400'}`}>
                                                            {tour.excessMissionDays || '-'}
                                                        </div>
                                                    </td>
                                                    <td className="p-2 border-l border-slate-200">
                                                        <div className="text-xs text-slate-600 mb-1">هزینه عوارض (ریال)</div>
                                                        <div className={`font-semibold ${tour.isDataRecorded ? 'text-slate-800' : 'text-slate-400'}`}>
                                                            {tour.tollCost?.toLocaleString('fa-IR') || '-'}
                                                        </div>
                                                    </td>
                                                    <td className="p-2 border-l border-slate-200">
                                                        <div className="text-xs text-slate-600 mb-1">هزینه غذا (ریال)</div>
                                                        <div className={`font-semibold ${tour.isDataRecorded ? 'text-slate-800' : 'text-slate-400'}`}>
                                                            {tour.foodCost?.toLocaleString('fa-IR') || '-'}
                                                        </div>
                                                    </td>
                                                    <td className="p-2 border-l border-slate-200">
                                                        <div className="text-xs text-slate-600 mb-1">هزینه سوخت (ریال)</div>
                                                        <div className={`font-semibold ${tour.isDataRecorded ? 'text-slate-800' : 'text-slate-400'}`}>
                                                            {tour.fuelCost?.toLocaleString('fa-IR') || '-'}
                                                        </div>
                                                    </td>
                                                    <td className="p-2 border-l border-slate-200">
                                                        <div className="text-xs text-slate-600 mb-1">هزینه بار برگشتی (ریال)</div>
                                                        <div className={`font-semibold ${tour.isDataRecorded ? 'text-slate-800' : 'text-slate-400'}`}>
                                                            {(tour as any).returnCargoCost
                                                                ? (tour as any).returnCargoCost.toLocaleString('fa-IR')
                                                                : '-'}
                                                        </div>
                                                    </td>
                                                    <td className="p-2 border-l border-slate-200">
                                                        <div className="text-xs text-slate-600 mb-1">هزینه بارنامه برگشتی (ریال)</div>
                                                        <div className={`font-semibold ${tour.isDataRecorded ? 'text-slate-800' : 'text-slate-400'}`}>
                                                            {(tour as any).returnBillOfLadingCost
                                                                ? (tour as any).returnBillOfLadingCost.toLocaleString('fa-IR')
                                                                : '-'}
                                                        </div>
                                                    </td>
                                                    <td className="p-2 border-l border-slate-200">
                                                        <div className="text-xs text-slate-600 mb-1">هزینه چندجا تخلیه (ریال)</div>
                                                        <div className={`font-semibold ${tour.isDataRecorded ? 'text-slate-800' : 'text-slate-400'}`}>
                                                            {(tour as any).multiUnloadCost
                                                                ? (tour as any).multiUnloadCost.toLocaleString('fa-IR')
                                                                : '-'}
                                                        </div>
                                                    </td>
                                                    <td className="p-2 border-l border-slate-200">
                                                        <div className="text-xs text-slate-600 mb-1">هزینه ماموریت مازاد (ریال)</div>
                                                        <div className={`font-semibold ${tour.isDataRecorded ? 'text-slate-800' : 'text-slate-400'}`}>
                                                            {(tour as any).excessMissionCost
                                                                ? (tour as any).excessMissionCost.toLocaleString('fa-IR')
                                                                : '-'}
                                                        </div>
                                                    </td>
                                                    <td className="p-2 border-l border-slate-200">
                                                        <div className="text-xs text-slate-600 mb-1">اجرت ثابت (ریال)</div>
                                                        <div className={`font-semibold ${tour.isDataRecorded ? 'text-amber-700' : 'text-slate-400'}`}>
                                                            {(tour as any).fixedAllowance
                                                                ? (tour as any).fixedAllowance.toLocaleString('fa-IR')
                                                                : '-'}
                                                        </div>
                                                    </td>
                                                    <td className="p-2 border-l border-slate-200">
                                                        {tour.notes && (
                                                            <div>
                                                                <div className="text-xs text-slate-600 mb-1">توضیحات</div>
                                                                <div className="text-xs text-slate-800">{tour.notes}</div>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
            
            <style>{`
                .input-style {
                    display: block;
                    width: 100%;
                    padding: 0.5rem 0.75rem;
                    background-color: white;
                    border: 1px solid #cbd5e1;
                    border-radius: 0.375rem;
                    font-size: 0.875rem;
                    box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
                }
                .input-style:focus {
                    outline: none;
                    border-color: #0ea5e9;
                    box-shadow: 0 0 0 1px #0ea5e9;
                }
            `}</style>
        </div>
    );
};

export default TransportFinanceCalculation;


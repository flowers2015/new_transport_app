import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { getApiUrl } from '../utils/apiConfig';
import { formatJalali, parseJalaliDateString, gregorianToJalali } from '../utils/jalali';

interface MileageRegulation {
    id?: string;
    vehicleType: 'تریلی' | 'ده چرخ';
    minKilometers: number;
    maxKilometers: number;
    allowancePerKm: number;
    approvalDate?: string;
    documentPath?: string;
    startDate?: string;
    endDate?: string;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
    createdByName?: string;
    updatedBy?: string;
    updatedByName?: string;
}

interface FoodRegulation {
    id?: string;
    foodCost: number;
    approvalDate: string;
    documentPath?: string;
    startDate: string;
    endDate: string;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
    createdByName?: string;
    updatedBy?: string;
    updatedByName?: string;
}

interface HelperRegulation {
    id?: string;
    helperAllowance: number;
    approvalDate: string;
    documentPath?: string;
    startDate: string;
    endDate: string;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
    createdByName?: string;
    updatedBy?: string;
    updatedByName?: string;
}

interface ExcessMissionRegulation {
    id?: string;
    excessMissionCost: number;
    approvalDate: string;
    documentPath?: string;
    startDate: string;
    endDate: string;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
    createdByName?: string;
    updatedBy?: string;
    updatedByName?: string;
}

interface MultiUnloadRegulation {
    id?: string;
    multiUnloadCost: number;
    approvalDate: string;
    documentPath?: string;
    startDate: string;
    endDate: string;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
    createdByName?: string;
    updatedBy?: string;
    updatedByName?: string;
}

interface FuelConsumptionRegulation {
    id?: string;
    vehicleType: string; // نوع خودرو (تریلی، ده چرخ، و غیره)
    consumptionPercentage: number; // درصد مصرف در هر 100 کیلومتر
    fuelPrice: number; // قیمت هر لیتر سوخت (ریال)
    approvalDate: string;
    documentPath?: string;
    startDate: string;
    endDate: string;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
    createdByName?: string;
    updatedBy?: string;
    updatedByName?: string;
}

interface FixedAllowanceRegulation {
    id?: string;
    vehicleType: 'تریلی' | 'ده چرخ';
    fixedAllowancePerKm: number; // اجرت ثابت به ازای هر کیلومتر (ریال)
    approvalDate: string;
    documentPath?: string;
    startDate: string;
    endDate: string;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
    createdByName?: string;
    updatedBy?: string;
    updatedByName?: string;
}

interface AllowanceRegulationManagementProps {
    currentUser: User;
}

// تابع برای تبدیل تاریخ میلادی به شمسی (رشته YYYY/MM/DD)
const getTodayJalali = (): string => {
    const today = new Date();
    const [jy, jm, jd] = gregorianToJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
    return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
};

// تابع برای تبدیل input type="date" (میلادی) به شمسی
const gregorianDateToJalali = (dateStr: string): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
    return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
};

// تابع برای تبدیل تاریخ شمسی به input type="date" (میلادی)
const jalaliToGregorianDateInput = (jalaliStr: string): string => {
    if (!jalaliStr) return '';
    const date = parseJalaliDateString(jalaliStr);
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const AllowanceRegulationManagement: React.FC<AllowanceRegulationManagementProps> = ({ currentUser }) => {
    const [activeTab, setActiveTab] = useState<'food' | 'helper' | 'fixed-allowance' | 'mileage' | 'excess-mission' | 'multi-unload' | 'fuel-consumption'>('food');
    
    // Food Regulations
    const [foodRegulations, setFoodRegulations] = useState<FoodRegulation[]>([]);
    const [showFoodDialog, setShowFoodDialog] = useState(false);
    const [editingFood, setEditingFood] = useState<FoodRegulation | null>(null);
    const [foodFormData, setFoodFormData] = useState<FoodRegulation>({
        foodCost: 0,
        approvalDate: getTodayJalali(),
        documentPath: '',
        startDate: getTodayJalali(),
        endDate: getTodayJalali(),
        isActive: true,
    });
    
    // Helper Regulations
    const [helperRegulations, setHelperRegulations] = useState<HelperRegulation[]>([]);
    const [showHelperDialog, setShowHelperDialog] = useState(false);
    const [editingHelper, setEditingHelper] = useState<HelperRegulation | null>(null);
    const [helperFormData, setHelperFormData] = useState<HelperRegulation>({
        helperAllowance: 0,
        approvalDate: getTodayJalali(),
        documentPath: '',
        startDate: getTodayJalali(),
        endDate: getTodayJalali(),
        isActive: true,
    });

    // Fixed Allowance Regulations (اجرت ثابت)
    const [fixedAllowanceRegulations, setFixedAllowanceRegulations] = useState<FixedAllowanceRegulation[]>([]);
    const [showFixedAllowanceDialog, setShowFixedAllowanceDialog] = useState(false);
    const [editingFixedAllowance, setEditingFixedAllowance] = useState<FixedAllowanceRegulation | null>(null);
    const [fixedAllowanceFormData, setFixedAllowanceFormData] = useState<FixedAllowanceRegulation>({
        vehicleType: 'تریلی',
        fixedAllowancePerKm: 0,
        approvalDate: getTodayJalali(),
        documentPath: '',
        startDate: getTodayJalali(),
        endDate: getTodayJalali(),
        isActive: true,
    });
    
    // Mileage Regulations
    const [mileageRegulations, setMileageRegulations] = useState<MileageRegulation[]>([]);
    const [showMileageDialog, setShowMileageDialog] = useState(false);
    const [editingMileage, setEditingMileage] = useState<MileageRegulation | null>(null);
    const [mileageFormData, setMileageFormData] = useState<MileageRegulation>({
        vehicleType: 'تریلی',
        minKilometers: 0,
        maxKilometers: 0,
        allowancePerKm: 0,
        approvalDate: getTodayJalali(),
        documentPath: '',
        startDate: getTodayJalali(),
        endDate: getTodayJalali(),
        isActive: true,
    });
    // نمایش بازه‌های پلکانی برای یک دسته خودرو
    const [selectedVehicleTypeForRanges, setSelectedVehicleTypeForRanges] = useState<'تریلی' | 'ده چرخ' | null>(null);
    
    // Excess Mission Regulations
    const [excessMissionRegulations, setExcessMissionRegulations] = useState<ExcessMissionRegulation[]>([]);
    const [showExcessMissionDialog, setShowExcessMissionDialog] = useState(false);
    const [editingExcessMission, setEditingExcessMission] = useState<ExcessMissionRegulation | null>(null);
    const [excessMissionFormData, setExcessMissionFormData] = useState<ExcessMissionRegulation>({
        excessMissionCost: 0,
        approvalDate: getTodayJalali(),
        documentPath: '',
        startDate: getTodayJalali(),
        endDate: getTodayJalali(),
        isActive: true,
    });
    
    // Multi Unload Regulations
    const [multiUnloadRegulations, setMultiUnloadRegulations] = useState<MultiUnloadRegulation[]>([]);
    const [showMultiUnloadDialog, setShowMultiUnloadDialog] = useState(false);
    const [editingMultiUnload, setEditingMultiUnload] = useState<MultiUnloadRegulation | null>(null);
    const [multiUnloadFormData, setMultiUnloadFormData] = useState<MultiUnloadRegulation>({
        multiUnloadCost: 0,
        approvalDate: getTodayJalali(),
        documentPath: '',
        startDate: getTodayJalali(),
        endDate: getTodayJalali(),
        isActive: true,
    });
    
    // Fuel Consumption Regulations
    const [fuelConsumptionRegulations, setFuelConsumptionRegulations] = useState<FuelConsumptionRegulation[]>([]);
    const [showFuelConsumptionDialog, setShowFuelConsumptionDialog] = useState(false);
    const [editingFuelConsumption, setEditingFuelConsumption] = useState<FuelConsumptionRegulation | null>(null);
    const [fuelConsumptionFormData, setFuelConsumptionFormData] = useState<FuelConsumptionRegulation>({
        vehicleType: 'تریلی',
        consumptionPercentage: 0,
        fuelPrice: 0,
        approvalDate: getTodayJalali(),
        documentPath: '',
        startDate: getTodayJalali(),
        endDate: getTodayJalali(),
        isActive: true,
    });
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [uploadingFile, setUploadingFile] = useState(false);

    useEffect(() => {
        fetchAllRegulations();
    }, []);

    const fetchAllRegulations = async () => {
        try {
            setLoading(true);
            setError(null);
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };
            
            const [foodRes, helperRes, fixedAllowanceRes, mileageRes, excessMissionRes, multiUnloadRes, fuelConsumptionRes] = await Promise.all([
                fetch(getApiUrl('allowance-regulations/food'), { headers }),
                fetch(getApiUrl('allowance-regulations/helper'), { headers }),
                fetch(getApiUrl('allowance-regulations/fixed-allowance'), { headers }),
                fetch(getApiUrl('allowance-regulations/mileage'), { headers }),
                fetch(getApiUrl('allowance-regulations/excess-mission'), { headers }),
                fetch(getApiUrl('allowance-regulations/multi-unload'), { headers }),
                fetch(getApiUrl('allowance-regulations/fuel-consumption'), { headers }),
            ]);
            
            if (foodRes.ok && helperRes.ok && fixedAllowanceRes.ok && mileageRes.ok && excessMissionRes.ok && multiUnloadRes.ok && fuelConsumptionRes.ok) {
                const foodData = await foodRes.json();
                const helperData = await helperRes.json();
                const fixedAllowanceData = await fixedAllowanceRes.json();
                const mileageData = await mileageRes.json();
                const excessMissionData = await excessMissionRes.json();
                const multiUnloadData = await multiUnloadRes.json();
                const fuelConsumptionData = await fuelConsumptionRes.json();
                
                setFoodRegulations(foodData);
                setHelperRegulations(helperData);
                setFixedAllowanceRegulations(fixedAllowanceData);
                setMileageRegulations(mileageData);
                setExcessMissionRegulations(excessMissionData);
                setMultiUnloadRegulations(multiUnloadData);
                setFuelConsumptionRegulations(fuelConsumptionData);
            } else {
                throw new Error('خطا در دریافت بخشنامه‌ها');
            }
        } catch (err: any) {
            console.error('❌ [fetchAllRegulations] Error:', err);
            setError(err.message || 'خطا در دریافت بخشنامه‌ها');
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (file: File) => {
        try {
            setUploadingFile(true);
            const token = localStorage.getItem('token');
            const formData = new FormData();
            formData.append('document', file);

            const response = await fetch(getApiUrl('allowance-regulations/upload'), {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
                body: formData,
            });

            if (!response.ok) {
                throw new Error('خطا در آپلود فایل');
            }

            const result = await response.json();
            return result.filePath;
        } catch (err: any) {
            console.error('❌ [handleFileUpload] Error:', err);
            alert(`خطا در آپلود فایل: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
            return null;
        } finally {
            setUploadingFile(false);
        }
    };

    // Food Regulation Handlers
    const handleAddFood = () => {
        setEditingFood(null);
        setFoodFormData({
            foodCost: 0,
            approvalDate: getTodayJalali(),
            documentPath: '',
            startDate: getTodayJalali(),
            endDate: getTodayJalali(),
            isActive: true,
        });
        setShowFoodDialog(true);
    };

    const handleEditFood = (regulation: FoodRegulation) => {
        setEditingFood(regulation);
        setFoodFormData(regulation);
        setShowFoodDialog(true);
    };

    const handleDeleteFood = async (id: string) => {
        if (!confirm('آیا از حذف این بخشنامه اطمینان دارید؟')) return;
        
        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            const response = await fetch(getApiUrl(`allowance-regulations/food/${id}`), {
                method: 'DELETE',
                headers,
            });

            if (!response.ok) throw new Error('خطا در حذف بخشنامه');
            
            await fetchAllRegulations();
            alert('بخشنامه با موفقیت حذف شد.');
        } catch (err: any) {
            alert(`خطا در حذف بخشنامه: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    };

    const handleSaveFood = async () => {
        if (!foodFormData.foodCost || !foodFormData.approvalDate || !foodFormData.startDate || !foodFormData.endDate) {
            alert('لطفاً تمام فیلدهای الزامی را پر کنید.');
            return;
        }

        if (foodFormData.startDate > foodFormData.endDate) {
            alert('تاریخ شروع باید قبل از تاریخ پایان باشد.');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            const userId = currentUser?.id || currentUser?.userId || '';
            const payload = {
                ...(editingFood?.id && { id: editingFood.id }),
                foodCost: Number(foodFormData.foodCost),
                approvalDate: foodFormData.approvalDate,
                documentPath: foodFormData.documentPath || null,
                startDate: foodFormData.startDate,
                endDate: foodFormData.endDate,
                isActive: foodFormData.isActive !== false,
                userId,
            };

            const response = await fetch(getApiUrl('allowance-regulations/food'), {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'خطا در ذخیره بخشنامه');
            }

            await fetchAllRegulations();
            setShowFoodDialog(false);
            setEditingFood(null);
            alert(editingFood ? 'بخشنامه با موفقیت به‌روزرسانی شد.' : 'بخشنامه با موفقیت ثبت شد.');
        } catch (err: any) {
            console.error('❌ [handleSaveFood] Error:', err);
            alert(`خطا در ذخیره بخشنامه: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    };

    // Helper Regulation Handlers
    const handleAddHelper = () => {
        setEditingHelper(null);
        setHelperFormData({
            helperAllowance: 0,
            approvalDate: getTodayJalali(),
            documentPath: '',
            startDate: getTodayJalali(),
            endDate: getTodayJalali(),
            isActive: true,
        });
        setShowHelperDialog(true);
    };

    const handleEditHelper = (regulation: HelperRegulation) => {
        setEditingHelper(regulation);
        setHelperFormData(regulation);
        setShowHelperDialog(true);
    };

    const handleDeleteHelper = async (id: string) => {
        if (!confirm('آیا از حذف این بخشنامه اطمینان دارید؟')) return;
        
        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            const response = await fetch(getApiUrl(`allowance-regulations/helper/${id}`), {
                method: 'DELETE',
                headers,
            });

            if (!response.ok) throw new Error('خطا در حذف بخشنامه');
            
            await fetchAllRegulations();
            alert('بخشنامه با موفقیت حذف شد.');
        } catch (err: any) {
            alert(`خطا در حذف بخشنامه: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    };

    const handleSaveHelper = async () => {
        if (!helperFormData.helperAllowance || !helperFormData.approvalDate || !helperFormData.startDate || !helperFormData.endDate) {
            alert('لطفاً تمام فیلدهای الزامی را پر کنید.');
            return;
        }

        if (helperFormData.startDate > helperFormData.endDate) {
            alert('تاریخ شروع باید قبل از تاریخ پایان باشد.');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            const userId = currentUser?.id || currentUser?.userId || '';
            const payload = {
                ...(editingHelper?.id && { id: editingHelper.id }),
                helperAllowance: Number(helperFormData.helperAllowance),
                approvalDate: helperFormData.approvalDate,
                documentPath: helperFormData.documentPath || null,
                startDate: helperFormData.startDate,
                endDate: helperFormData.endDate,
                isActive: helperFormData.isActive !== false,
                userId,
            };

            const response = await fetch(getApiUrl('allowance-regulations/helper'), {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'خطا در ذخیره بخشنامه');
            }

            await fetchAllRegulations();
            setShowHelperDialog(false);
            setEditingHelper(null);
            alert(editingHelper ? 'بخشنامه با موفقیت به‌روزرسانی شد.' : 'بخشنامه با موفقیت ثبت شد.');
        } catch (err: any) {
            console.error('❌ [handleSaveHelper] Error:', err);
            alert(`خطا در ذخیره بخشنامه: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    };

    // Fixed Allowance Regulation Handlers (اجرت ثابت)
    const handleAddFixedAllowance = () => {
        setEditingFixedAllowance(null);
        setFixedAllowanceFormData({
            vehicleType: 'تریلی',
            fixedAllowancePerKm: 0,
            approvalDate: getTodayJalali(),
            documentPath: '',
            startDate: getTodayJalali(),
            endDate: getTodayJalali(),
            isActive: true,
        });
        setShowFixedAllowanceDialog(true);
    };

    const handleEditFixedAllowance = (regulation: FixedAllowanceRegulation) => {
        setEditingFixedAllowance(regulation);
        setFixedAllowanceFormData(regulation);
        setShowFixedAllowanceDialog(true);
    };

    const handleDeleteFixedAllowance = async (id: string) => {
        if (!confirm('آیا از حذف این بخشنامه اطمینان دارید؟')) return;
        
        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            const response = await fetch(getApiUrl(`allowance-regulations/fixed-allowance/${id}`), {
                method: 'DELETE',
                headers,
            });

            if (!response.ok) throw new Error('خطا در حذف بخشنامه');
            
            await fetchAllRegulations();
            alert('بخشنامه با موفقیت حذف شد.');
        } catch (err: any) {
            console.error('❌ [handleDeleteFixedAllowance] Error:', err);
            alert(`خطا در حذف بخشنامه: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    };

    const handleSaveFixedAllowance = async () => {
        if (!fixedAllowanceFormData.fixedAllowancePerKm || !fixedAllowanceFormData.approvalDate || !fixedAllowanceFormData.startDate || !fixedAllowanceFormData.endDate) {
            alert('لطفاً تمام فیلدهای الزامی را پر کنید.');
            return;
        }

        if (fixedAllowanceFormData.startDate > fixedAllowanceFormData.endDate) {
            alert('تاریخ شروع باید قبل از تاریخ پایان باشد.');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            const userId = currentUser?.id;

            const payload = {
                id: editingFixedAllowance?.id || undefined,
                vehicleType: fixedAllowanceFormData.vehicleType,
                fixedAllowancePerKm: Number(fixedAllowanceFormData.fixedAllowancePerKm),
                approvalDate: fixedAllowanceFormData.approvalDate,
                documentPath: fixedAllowanceFormData.documentPath || null,
                startDate: fixedAllowanceFormData.startDate,
                endDate: fixedAllowanceFormData.endDate,
                isActive: fixedAllowanceFormData.isActive !== false,
                userId,
            };

            const response = await fetch(getApiUrl('allowance-regulations/fixed-allowance'), {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'خطا در ذخیره بخشنامه');
            }

            await fetchAllRegulations();
            setShowFixedAllowanceDialog(false);
            setEditingFixedAllowance(null);
            alert(editingFixedAllowance ? 'بخشنامه با موفقیت به‌روزرسانی شد.' : 'بخشنامه با موفقیت ثبت شد.');
        } catch (err: any) {
            console.error('❌ [handleSaveFixedAllowance] Error:', err);
            alert(`خطا در ذخیره بخشنامه: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    };

    // Mileage Regulation Handlers
    const handleAddMileage = () => {
        setEditingMileage(null);
        setMileageFormData({
            vehicleType: 'تریلی',
            minKilometers: 0,
            maxKilometers: 0,
            allowancePerKm: 0,
            approvalDate: getTodayJalali(),
            documentPath: '',
            startDate: getTodayJalali(),
            endDate: getTodayJalali(),
            isActive: true,
        });
        setShowMileageDialog(true);
    };

    const handleEditMileage = (regulation: MileageRegulation) => {
        setEditingMileage(regulation);
        setMileageFormData(regulation);
        setShowMileageDialog(true);
    };

    const handleDeleteMileage = async (id: string) => {
        if (!confirm('آیا از حذف این بخشنامه اطمینان دارید؟')) return;
        
        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            const response = await fetch(getApiUrl(`allowance-regulations/mileage/${id}`), {
                method: 'DELETE',
                headers,
            });

            if (!response.ok) throw new Error('خطا در حذف بخشنامه');
            
            await fetchAllRegulations();
            alert('بخشنامه با موفقیت حذف شد.');
        } catch (err: any) {
            alert(`خطا در حذف بخشنامه: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    };

    const handleSaveMileage = async () => {
        if (!mileageFormData.vehicleType || mileageFormData.minKilometers < 0 || mileageFormData.maxKilometers < 0 || !mileageFormData.allowancePerKm) {
            alert('لطفاً تمام فیلدهای الزامی را پر کنید.');
            return;
        }

        if (mileageFormData.minKilometers >= mileageFormData.maxKilometers) {
            alert('حداقل کیلومتر باید کمتر از حداکثر کیلومتر باشد.');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            const userId = currentUser?.id || currentUser?.userId || '';
            
            // اگر دسته خودرو انتخاب شده، از regulation_id موجود استفاده کن
            // یا یک regulation_id جدید بساز
            let regulationId = (mileageFormData as any).regulationId;
            if (!regulationId && selectedVehicleTypeForRanges) {
                // پیدا کردن regulation_id موجود برای این دسته خودرو
                const existingRegulations = mileageRegulations.filter(
                    r => r.vehicleType === selectedVehicleTypeForRanges
                );
                if (existingRegulations.length > 0 && (existingRegulations[0] as any).regulationId) {
                    regulationId = (existingRegulations[0] as any).regulationId;
                }
            }
            
            const payload = {
                ...(editingMileage?.id && { id: editingMileage.id }),
                regulationId: regulationId || null, // اگر نبود، سرور یکی می‌سازه
                vehicleType: mileageFormData.vehicleType,
                minKilometers: Number(mileageFormData.minKilometers),
                maxKilometers: Number(mileageFormData.maxKilometers),
                allowancePerKm: Number(mileageFormData.allowancePerKm),
                approvalDate: mileageFormData.approvalDate || null,
                documentPath: mileageFormData.documentPath || null,
                startDate: mileageFormData.startDate || null,
                endDate: mileageFormData.endDate || null,
                isActive: mileageFormData.isActive !== false,
                userId,
            };

            console.log('📤 [handleSaveMileage] Sending:', payload);

            const response = await fetch(getApiUrl('allowance-regulations/mileage'), {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'خطا در ذخیره بخشنامه');
            }

            await fetchAllRegulations();
            setShowMileageDialog(false);
            setEditingMileage(null);
            alert(editingMileage ? 'بخشنامه با موفقیت به‌روزرسانی شد.' : 'بخشنامه با موفقیت ثبت شد.');
        } catch (err: any) {
            console.error('❌ [handleSaveMileage] Error:', err);
            alert(`خطا در ذخیره بخشنامه: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    };

    // Excess Mission Regulation Handlers
    const handleAddExcessMission = () => {
        setEditingExcessMission(null);
        setExcessMissionFormData({
            excessMissionCost: 0,
            approvalDate: getTodayJalali(),
            documentPath: '',
            startDate: getTodayJalali(),
            endDate: getTodayJalali(),
            isActive: true,
        });
        setShowExcessMissionDialog(true);
    };

    const handleEditExcessMission = (regulation: ExcessMissionRegulation) => {
        setEditingExcessMission(regulation);
        setExcessMissionFormData(regulation);
        setShowExcessMissionDialog(true);
    };

    const handleDeleteExcessMission = async (id: string) => {
        if (!confirm('آیا از حذف این بخشنامه اطمینان دارید؟')) return;
        
        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            const response = await fetch(getApiUrl(`allowance-regulations/excess-mission/${id}`), {
                method: 'DELETE',
                headers,
            });

            if (!response.ok) throw new Error('خطا در حذف بخشنامه');
            
            await fetchAllRegulations();
            alert('بخشنامه با موفقیت حذف شد.');
        } catch (err: any) {
            alert(`خطا در حذف بخشنامه: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    };

    const handleSaveExcessMission = async () => {
        if (!excessMissionFormData.excessMissionCost || !excessMissionFormData.approvalDate || !excessMissionFormData.startDate || !excessMissionFormData.endDate) {
            alert('لطفاً تمام فیلدهای الزامی را پر کنید.');
            return;
        }

        if (excessMissionFormData.startDate > excessMissionFormData.endDate) {
            alert('تاریخ شروع باید قبل از تاریخ پایان باشد.');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            const userId = currentUser?.id || currentUser?.userId || '';
            const payload = {
                ...(editingExcessMission?.id && { id: editingExcessMission.id }),
                excessMissionCost: Number(excessMissionFormData.excessMissionCost),
                approvalDate: excessMissionFormData.approvalDate,
                documentPath: excessMissionFormData.documentPath || null,
                startDate: excessMissionFormData.startDate,
                endDate: excessMissionFormData.endDate,
                isActive: excessMissionFormData.isActive !== false,
                userId,
            };

            const response = await fetch(getApiUrl('allowance-regulations/excess-mission'), {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'خطا در ذخیره بخشنامه');
            }

            await fetchAllRegulations();
            setShowExcessMissionDialog(false);
            setEditingExcessMission(null);
            alert(editingExcessMission ? 'بخشنامه با موفقیت به‌روزرسانی شد.' : 'بخشنامه با موفقیت ثبت شد.');
        } catch (err: any) {
            console.error('❌ [handleSaveExcessMission] Error:', err);
            alert(`خطا در ذخیره بخشنامه: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    };

    // Multi Unload Regulation Handlers
    const handleAddMultiUnload = () => {
        setEditingMultiUnload(null);
        setMultiUnloadFormData({
            multiUnloadCost: 0,
            approvalDate: getTodayJalali(),
            documentPath: '',
            startDate: getTodayJalali(),
            endDate: getTodayJalali(),
            isActive: true,
        });
        setShowMultiUnloadDialog(true);
    };

    const handleEditMultiUnload = (regulation: MultiUnloadRegulation) => {
        setEditingMultiUnload(regulation);
        setMultiUnloadFormData(regulation);
        setShowMultiUnloadDialog(true);
    };

    const handleDeleteMultiUnload = async (id: string) => {
        if (!confirm('آیا از حذف این بخشنامه اطمینان دارید؟')) return;
        
        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            const response = await fetch(getApiUrl(`allowance-regulations/multi-unload/${id}`), {
                method: 'DELETE',
                headers,
            });

            if (!response.ok) throw new Error('خطا در حذف بخشنامه');
            
            await fetchAllRegulations();
            alert('بخشنامه با موفقیت حذف شد.');
        } catch (err: any) {
            alert(`خطا در حذف بخشنامه: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    };

    const handleSaveMultiUnload = async () => {
        if (!multiUnloadFormData.multiUnloadCost || !multiUnloadFormData.approvalDate || !multiUnloadFormData.startDate || !multiUnloadFormData.endDate) {
            alert('لطفاً تمام فیلدهای الزامی را پر کنید.');
            return;
        }

        if (multiUnloadFormData.startDate > multiUnloadFormData.endDate) {
            alert('تاریخ شروع باید قبل از تاریخ پایان باشد.');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            const userId = currentUser?.id || currentUser?.userId || '';
            const payload = {
                ...(editingMultiUnload?.id && { id: editingMultiUnload.id }),
                multiUnloadCost: Number(multiUnloadFormData.multiUnloadCost),
                approvalDate: multiUnloadFormData.approvalDate,
                documentPath: multiUnloadFormData.documentPath || null,
                startDate: multiUnloadFormData.startDate,
                endDate: multiUnloadFormData.endDate,
                isActive: multiUnloadFormData.isActive !== false,
                userId,
            };

            const response = await fetch(getApiUrl('allowance-regulations/multi-unload'), {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'خطا در ذخیره بخشنامه');
            }

            await fetchAllRegulations();
            setShowMultiUnloadDialog(false);
            setEditingMultiUnload(null);
            alert(editingMultiUnload ? 'بخشنامه با موفقیت به‌روزرسانی شد.' : 'بخشنامه با موفقیت ثبت شد.');
        } catch (err: any) {
            console.error('❌ [handleSaveMultiUnload] Error:', err);
            alert(`خطا در ذخیره بخشنامه: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    };

    // Fuel Consumption Regulation Handlers
    const handleAddFuelConsumption = () => {
        setEditingFuelConsumption(null);
        setFuelConsumptionFormData({
            vehicleType: 'تریلی',
            consumptionPercentage: 0,
            fuelPrice: 0,
            approvalDate: getTodayJalali(),
            documentPath: '',
            startDate: getTodayJalali(),
            endDate: getTodayJalali(),
            isActive: true,
        });
        setShowFuelConsumptionDialog(true);
    };

    const handleEditFuelConsumption = (regulation: FuelConsumptionRegulation) => {
        setEditingFuelConsumption(regulation);
        setFuelConsumptionFormData(regulation);
        setShowFuelConsumptionDialog(true);
    };

    const handleDeleteFuelConsumption = async (id: string) => {
        if (!confirm('آیا از حذف این بخشنامه اطمینان دارید؟')) return;
        
        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            const response = await fetch(getApiUrl(`allowance-regulations/fuel-consumption/${id}`), {
                method: 'DELETE',
                headers,
            });

            if (!response.ok) throw new Error('خطا در حذف بخشنامه');
            
            await fetchAllRegulations();
            alert('بخشنامه با موفقیت حذف شد.');
        } catch (err: any) {
            alert(`خطا در حذف بخشنامه: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
    };

    const handleSaveFuelConsumption = async () => {
        if (!fuelConsumptionFormData.vehicleType || !fuelConsumptionFormData.consumptionPercentage || !fuelConsumptionFormData.fuelPrice || !fuelConsumptionFormData.approvalDate || !fuelConsumptionFormData.startDate || !fuelConsumptionFormData.endDate) {
            alert('لطفاً تمام فیلدهای الزامی را پر کنید.');
            return;
        }

        if (fuelConsumptionFormData.startDate > fuelConsumptionFormData.endDate) {
            alert('تاریخ شروع باید قبل از تاریخ پایان باشد.');
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };

            const userId = currentUser?.id || currentUser?.userId || '';
            const payload = {
                ...(editingFuelConsumption?.id && { id: editingFuelConsumption.id }),
                vehicleType: fuelConsumptionFormData.vehicleType,
                consumptionPercentage: Number(fuelConsumptionFormData.consumptionPercentage),
                fuelPrice: Number(fuelConsumptionFormData.fuelPrice),
                approvalDate: fuelConsumptionFormData.approvalDate,
                documentPath: fuelConsumptionFormData.documentPath || null,
                startDate: fuelConsumptionFormData.startDate,
                endDate: fuelConsumptionFormData.endDate,
                isActive: fuelConsumptionFormData.isActive !== false,
                userId,
            };

            const response = await fetch(getApiUrl('allowance-regulations/fuel-consumption'), {
                method: 'POST',
                headers,
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || 'خطا در ذخیره بخشنامه');
            }

            await fetchAllRegulations();
            setShowFuelConsumptionDialog(false);
            setEditingFuelConsumption(null);
            alert(editingFuelConsumption ? 'بخشنامه با موفقیت به‌روزرسانی شد.' : 'بخشنامه با موفقیت ثبت شد.');
        } catch (err: any) {
            console.error('❌ [handleSaveFuelConsumption] Error:', err);
            alert(`خطا در ذخیره بخشنامه: ${err.message || 'لطفاً دوباره تلاش کنید.'}`);
        }
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
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-slate-800">
                        مدیریت بخشنامه
                    </h1>
                </div>

                {/* تب‌ها */}
                <div className="border-b border-slate-200 mb-6">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setActiveTab('food')}
                            className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                                activeTab === 'food'
                                    ? 'bg-sky-600 text-white'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                        >
                            بخشنامه هزینه غذا
                        </button>
                        <button
                            onClick={() => setActiveTab('helper')}
                            className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                                activeTab === 'helper'
                                    ? 'bg-sky-600 text-white'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                        >
                            بخشنامه اجرت راننده کمکی
                        </button>
                        <button
                            onClick={() => setActiveTab('fixed-allowance')}
                            className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                                activeTab === 'fixed-allowance'
                                    ? 'bg-amber-600 text-white'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                        >
                            بخشنامه اجرت ثابت
                        </button>
                        <button
                            onClick={() => setActiveTab('mileage')}
                            className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                                activeTab === 'mileage'
                                    ? 'bg-sky-600 text-white'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                        >
                            بخشنامه اجرت پیمایش
                        </button>
                        <button
                            onClick={() => setActiveTab('excess-mission')}
                            className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                                activeTab === 'excess-mission'
                                    ? 'bg-sky-600 text-white'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                        >
                            بخشنامه هزینه ماموریت مازاد
                        </button>
                        <button
                            onClick={() => setActiveTab('multi-unload')}
                            className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                                activeTab === 'multi-unload'
                                    ? 'bg-sky-600 text-white'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                        >
                            بخشنامه هزینه چندجا تخلیه
                        </button>
                        <button
                            onClick={() => setActiveTab('fuel-consumption')}
                            className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                                activeTab === 'fuel-consumption'
                                    ? 'bg-sky-600 text-white'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                            }`}
                        >
                            بخشنامه مصرف سوخت
                        </button>
                    </div>
                </div>

                {/* محتوای تب‌ها */}
                {activeTab === 'food' && (
                    <div>
                        <div className="flex justify-end mb-4">
                            <button
                                onClick={handleAddFood}
                                className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm hover:bg-sky-700 transition-colors"
                            >
                                + افزودن بخشنامه هزینه غذا
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-right border-collapse">
                                <thead>
                                    <tr className="bg-slate-700 text-white border-b">
                                        <th className="p-3 text-right border-l border-slate-600">ردیف</th>
                                        <th className="p-3 text-right border-l border-slate-600">هزینه غذا (ریال)</th>
                                        <th className="p-3 text-right border-l border-slate-600">تاریخ مصوبه</th>
                                        <th className="p-3 text-right border-l border-slate-600">تاریخ شروع</th>
                                        <th className="p-3 text-right border-l border-slate-600">تاریخ پایان</th>
                                        <th className="p-3 text-right border-l border-slate-600">وضعیت</th>
                                        <th className="p-3 text-right border-l border-slate-600">ایجاد شده توسط</th>
                                        <th className="p-3 text-right border-l border-slate-600">تاریخ ایجاد</th>
                                        <th className="p-3 text-right">عملیات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {foodRegulations.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} className="p-6 text-center text-slate-500">
                                                هیچ بخشنامه‌ای ثبت نشده است.
                                            </td>
                                        </tr>
                                    ) : (
                                        foodRegulations.map((regulation, index) => (
                                            <tr key={regulation.id || index} className="border-b border-slate-200 bg-white hover:bg-slate-50">
                                                <td className="p-3 border-l border-slate-200 text-center">{index + 1}</td>
                                                <td className="p-3 border-l border-slate-200 text-left font-semibold text-green-700">
                                                    {regulation.foodCost.toLocaleString('fa-IR')}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.approvalDate || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.startDate || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.endDate || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200">
                                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                                                        regulation.isActive !== false 
                                                            ? 'bg-green-100 text-green-800' 
                                                            : 'bg-red-100 text-red-800'
                                                    }`}>
                                                        {regulation.isActive !== false ? 'فعال' : 'غیرفعال'}
                                                    </span>
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.createdByName || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.createdAt ? formatJalali(new Date(regulation.createdAt)) : '-'}
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleEditFood(regulation)}
                                                            className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs hover:bg-blue-700 transition-colors"
                                                        >
                                                            ویرایش
                                                        </button>
                                                        <button
                                                            onClick={() => regulation.id && handleDeleteFood(regulation.id)}
                                                            className="px-3 py-1.5 bg-red-600 text-white rounded-md text-xs hover:bg-red-700 transition-colors"
                                                        >
                                                            حذف
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'helper' && (
                    <div>
                        <div className="flex justify-end mb-4">
                            <button
                                onClick={handleAddHelper}
                                className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm hover:bg-sky-700 transition-colors"
                            >
                                + افزودن بخشنامه اجرت راننده کمکی
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-right border-collapse">
                                <thead>
                                    <tr className="bg-slate-700 text-white border-b">
                                        <th className="p-3 text-right border-l border-slate-600">ردیف</th>
                                        <th className="p-3 text-right border-l border-slate-600">اجرت راننده کمکی (ریال)</th>
                                        <th className="p-3 text-right border-l border-slate-600">تاریخ مصوبه</th>
                                        <th className="p-3 text-right border-l border-slate-600">تاریخ شروع</th>
                                        <th className="p-3 text-right border-l border-slate-600">تاریخ پایان</th>
                                        <th className="p-3 text-right border-l border-slate-600">وضعیت</th>
                                        <th className="p-3 text-right border-l border-slate-600">ایجاد شده توسط</th>
                                        <th className="p-3 text-right border-l border-slate-600">تاریخ ایجاد</th>
                                        <th className="p-3 text-right">عملیات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {helperRegulations.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} className="p-6 text-center text-slate-500">
                                                هیچ بخشنامه‌ای ثبت نشده است.
                                            </td>
                                        </tr>
                                    ) : (
                                        helperRegulations.map((regulation, index) => (
                                            <tr key={regulation.id || index} className="border-b border-slate-200 bg-white hover:bg-slate-50">
                                                <td className="p-3 border-l border-slate-200 text-center">{index + 1}</td>
                                                <td className="p-3 border-l border-slate-200 text-left font-semibold text-green-700">
                                                    {regulation.helperAllowance.toLocaleString('fa-IR')}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.approvalDate || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.startDate || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.endDate || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200">
                                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                                                        regulation.isActive !== false 
                                                            ? 'bg-green-100 text-green-800' 
                                                            : 'bg-red-100 text-red-800'
                                                    }`}>
                                                        {regulation.isActive !== false ? 'فعال' : 'غیرفعال'}
                                                    </span>
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.createdByName || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.createdAt ? formatJalali(new Date(regulation.createdAt)) : '-'}
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleEditHelper(regulation)}
                                                            className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs hover:bg-blue-700 transition-colors"
                                                        >
                                                            ویرایش
                                                        </button>
                                                        <button
                                                            onClick={() => regulation.id && handleDeleteHelper(regulation.id)}
                                                            className="px-3 py-1.5 bg-red-600 text-white rounded-md text-xs hover:bg-red-700 transition-colors"
                                                        >
                                                            حذف
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'fixed-allowance' && (
                    <div>
                        <div className="flex justify-end mb-4">
                            <button
                                onClick={handleAddFixedAllowance}
                                className="px-4 py-2 bg-amber-600 text-white rounded-md text-sm hover:bg-amber-700 transition-colors"
                            >
                                + افزودن بخشنامه اجرت ثابت
                            </button>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                            <p className="text-sm text-amber-800">
                                💡 <strong>اجرت ثابت:</strong> برای رانندگانی که در صف "اجرت ثابت" قرار دارند، اجرت بر اساس پیمایش × نرخ ثابت به ازای هر کیلومتر محاسبه می‌شود.
                            </p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-right border-collapse">
                                <thead>
                                    <tr className="bg-amber-700 text-white border-b">
                                        <th className="p-3 text-right border-l border-amber-600">ردیف</th>
                                        <th className="p-3 text-right border-l border-amber-600">نوع خودرو</th>
                                        <th className="p-3 text-right border-l border-amber-600">اجرت ثابت به ازای هر کیلومتر (ریال)</th>
                                        <th className="p-3 text-right border-l border-amber-600">تاریخ مصوبه</th>
                                        <th className="p-3 text-right border-l border-amber-600">تاریخ شروع</th>
                                        <th className="p-3 text-right border-l border-amber-600">تاریخ پایان</th>
                                        <th className="p-3 text-right border-l border-amber-600">وضعیت</th>
                                        <th className="p-3 text-right border-l border-amber-600">ایجاد شده توسط</th>
                                        <th className="p-3 text-right border-l border-amber-600">تاریخ ایجاد</th>
                                        <th className="p-3 text-right">عملیات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {fixedAllowanceRegulations.length === 0 ? (
                                        <tr>
                                            <td colSpan={10} className="p-6 text-center text-slate-500">
                                                هیچ بخشنامه‌ای ثبت نشده است.
                                            </td>
                                        </tr>
                                    ) : (
                                        fixedAllowanceRegulations.map((regulation, index) => (
                                            <tr key={regulation.id || index} className="border-b border-slate-200 bg-white hover:bg-amber-50">
                                                <td className="p-3 border-l border-slate-200 text-center">{index + 1}</td>
                                                <td className="p-3 border-l border-slate-200 font-semibold">
                                                    {regulation.vehicleType === 'تریلی' ? '🚛 تریلی / مینی تریلی' : '🚚 ده چرخ'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-left font-semibold text-amber-700">
                                                    {regulation.fixedAllowancePerKm.toLocaleString('fa-IR')}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.approvalDate || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.startDate || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.endDate || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200">
                                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                                                        regulation.isActive !== false 
                                                            ? 'bg-green-100 text-green-800' 
                                                            : 'bg-red-100 text-red-800'
                                                    }`}>
                                                        {regulation.isActive !== false ? 'فعال' : 'غیرفعال'}
                                                    </span>
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.createdByName || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.createdAt ? formatJalali(new Date(regulation.createdAt)) : '-'}
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleEditFixedAllowance(regulation)}
                                                            className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs hover:bg-blue-700 transition-colors"
                                                        >
                                                            ویرایش
                                                        </button>
                                                        <button
                                                            onClick={() => regulation.id && handleDeleteFixedAllowance(regulation.id)}
                                                            className="px-3 py-1.5 bg-red-600 text-white rounded-md text-xs hover:bg-red-700 transition-colors"
                                                        >
                                                            حذف
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'mileage' && (
                    <div>
                        {/* کارت‌های دسته‌بندی خودرو */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            {/* کارت تریلی / مینی تریلی */}
                            <div 
                                className={`bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-6 border-2 cursor-pointer transition-all hover:shadow-lg ${
                                    selectedVehicleTypeForRanges === 'تریلی' ? 'border-purple-500 ring-2 ring-purple-300' : 'border-purple-200'
                                }`}
                                onClick={() => setSelectedVehicleTypeForRanges(selectedVehicleTypeForRanges === 'تریلی' ? null : 'تریلی')}
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="text-lg font-bold text-purple-800">🚛 تریلی / مینی تریلی</h3>
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-purple-200 text-purple-800">
                                        {mileageRegulations.filter(r => r.vehicleType === 'تریلی').length} بازه
                                    </span>
                                </div>
                                <p className="text-sm text-slate-600 mb-2">
                                    نرخ تریلی و مینی تریلی یکسان است
                                </p>
                                <div className="text-xs text-slate-500">
                                    برای مشاهده/ویرایش بازه‌های پلکانی کلیک کنید
                                </div>
                            </div>
                            
                            {/* کارت ده چرخ */}
                            <div 
                                className={`bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-6 border-2 cursor-pointer transition-all hover:shadow-lg ${
                                    selectedVehicleTypeForRanges === 'ده چرخ' ? 'border-orange-500 ring-2 ring-orange-300' : 'border-orange-200'
                                }`}
                                onClick={() => setSelectedVehicleTypeForRanges(selectedVehicleTypeForRanges === 'ده چرخ' ? null : 'ده چرخ')}
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="text-lg font-bold text-orange-800">🚚 ده چرخ</h3>
                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-orange-200 text-orange-800">
                                        {mileageRegulations.filter(r => r.vehicleType === 'ده چرخ').length} بازه
                                    </span>
                                </div>
                                <p className="text-sm text-slate-600 mb-2">
                                    نرخ ده چرخ
                                </p>
                                <div className="text-xs text-slate-500">
                                    برای مشاهده/ویرایش بازه‌های پلکانی کلیک کنید
                                </div>
                            </div>
                        </div>
                        
                        {/* جدول بازه‌های پلکانی برای دسته انتخاب شده */}
                        {selectedVehicleTypeForRanges && (
                            <div className="bg-white rounded-lg border border-slate-200 p-4">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="text-lg font-bold text-slate-800">
                                        بازه‌های پلکانی اجرت پیمایش - {selectedVehicleTypeForRanges}
                                    </h4>
                                    <div className="flex gap-2">
                                        {/* دکمه تنظیم دسته‌ای فقط وقتی بازه وجود داره نمایش داده بشه */}
                                        {mileageRegulations.filter(r => r.vehicleType === selectedVehicleTypeForRanges).length > 0 && (
                                        <button
                                            onClick={async () => {
                                                // تنظیم دسته‌ای تاریخ‌ها
                                                const startDate = prompt('تاریخ شروع بخشنامه (فرمت: YYYY/MM/DD):', getTodayJalali());
                                                if (!startDate) return;
                                                const endDate = prompt('تاریخ پایان بخشنامه (فرمت: YYYY/MM/DD):', '1404/12/29');
                                                if (!endDate) return;
                                                const approvalDate = prompt('تاریخ مصوبه (فرمت: YYYY/MM/DD):', getTodayJalali());
                                                if (!approvalDate) return;
                                                
                                                const regsToUpdate = mileageRegulations.filter(r => r.vehicleType === selectedVehicleTypeForRanges);
                                                if (regsToUpdate.length === 0) {
                                                    alert('هیچ بازه‌ای برای به‌روزرسانی وجود ندارد.');
                                                    return;
                                                }
                                                
                                                if (!confirm(`آیا می‌خواهید تاریخ‌های ${regsToUpdate.length} بازه را به‌روزرسانی کنید؟`)) return;
                                                
                                                const token = localStorage.getItem('token');
                                                const headers = {
                                                    'Authorization': `Bearer ${token}`,
                                                    'Content-Type': 'application/json',
                                                };
                                                const userId = currentUser?.id || currentUser?.userId || '';
                                                
                                                let successCount = 0;
                                                let lastError = '';
                                                for (const reg of regsToUpdate) {
                                                    try {
                                                        const payload = {
                                                            id: reg.id,
                                                            regulationId: (reg as any).regulationId || null,
                                                            vehicleType: reg.vehicleType,
                                                            minKilometers: Number(reg.minKilometers),
                                                            maxKilometers: Number(reg.maxKilometers),
                                                            allowancePerKm: Number(reg.allowancePerKm),
                                                            approvalDate,
                                                            startDate,
                                                            endDate,
                                                            isActive: true,
                                                            userId,
                                                        };
                                                        
                                                        console.log('📤 [تنظیم دسته‌ای] Sending:', payload);
                                                        
                                                        const response = await fetch(getApiUrl('allowance-regulations/mileage'), {
                                                            method: 'POST',
                                                            headers,
                                                            body: JSON.stringify(payload),
                                                        });
                                                        
                                                        if (response.ok) {
                                                            successCount++;
                                                        } else {
                                                            const errText = await response.text();
                                                            lastError = errText;
                                                            console.error('❌ خطا:', errText);
                                                        }
                                                    } catch (err: any) {
                                                        console.error('❌ خطا در به‌روزرسانی:', err);
                                                        lastError = err.message;
                                                    }
                                                }
                                                
                                                await fetchAllRegulations();
                                                if (successCount === regsToUpdate.length) {
                                                    alert(`✅ همه ${successCount} بازه با موفقیت به‌روزرسانی شد.`);
                                                } else {
                                                    alert(`${successCount} بازه از ${regsToUpdate.length} به‌روزرسانی شد.\n\nخطا: ${lastError}`);
                                                }
                                            }}
                                            className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700 transition-colors"
                                        >
                                            📅 تنظیم دسته‌ای تاریخ‌ها
                                        </button>
                                        )}
                                        <button
                                            onClick={() => {
                                                // دریافت تاریخ‌های موجود از اولین بازه
                                                const existingRegs = mileageRegulations.filter(r => r.vehicleType === selectedVehicleTypeForRanges);
                                                const firstReg = existingRegs[0];
                                                
                                                setMileageFormData({
                                                    vehicleType: selectedVehicleTypeForRanges,
                                                    minKilometers: 0,
                                                    maxKilometers: 0,
                                                    allowancePerKm: 0,
                                                    approvalDate: firstReg?.approvalDate || getTodayJalali(),
                                                    documentPath: '',
                                                    startDate: firstReg?.startDate || getTodayJalali(),
                                                    endDate: firstReg?.endDate || getTodayJalali(),
                                                    isActive: true,
                                                });
                                                setEditingMileage(null);
                                                setShowMileageDialog(true);
                                            }}
                                            className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm hover:bg-sky-700 transition-colors"
                                        >
                                            + افزودن بازه جدید
                                        </button>
                                    </div>
                                </div>
                                
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-right border-collapse">
                                        <thead>
                                            <tr className="bg-slate-700 text-white border-b">
                                                <th className="p-3 text-right border-l border-slate-600">ردیف</th>
                                                <th className="p-3 text-right border-l border-slate-600">از (کیلومتر)</th>
                                                <th className="p-3 text-right border-l border-slate-600">تا (کیلومتر)</th>
                                                <th className="p-3 text-right border-l border-slate-600">اجرت هر کیلومتر (ریال)</th>
                                                <th className="p-3 text-right border-l border-slate-600">تاریخ شروع</th>
                                                <th className="p-3 text-right border-l border-slate-600">تاریخ پایان</th>
                                                <th className="p-3 text-right border-l border-slate-600">وضعیت</th>
                                                <th className="p-3 text-right">عملیات</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {mileageRegulations
                                                .filter(r => r.vehicleType === selectedVehicleTypeForRanges)
                                                .sort((a, b) => a.minKilometers - b.minKilometers)
                                                .map((regulation, index) => (
                                                    <tr key={regulation.id || index} className="border-b border-slate-200 bg-white hover:bg-slate-50">
                                                        <td className="p-3 border-l border-slate-200 text-center">{index + 1}</td>
                                                        <td className="p-3 border-l border-slate-200 text-left font-medium">
                                                            {regulation.minKilometers.toLocaleString('fa-IR')}
                                                        </td>
                                                        <td className="p-3 border-l border-slate-200 text-left font-medium">
                                                            {regulation.maxKilometers.toLocaleString('fa-IR')}
                                                        </td>
                                                        <td className="p-3 border-l border-slate-200 text-left font-bold text-green-700">
                                                            {regulation.allowancePerKm.toLocaleString('fa-IR')}
                                                        </td>
                                                        <td className="p-3 border-l border-slate-200 text-xs">
                                                            {regulation.startDate || '-'}
                                                        </td>
                                                        <td className="p-3 border-l border-slate-200 text-xs">
                                                            {regulation.endDate || '-'}
                                                        </td>
                                                        <td className="p-3 border-l border-slate-200">
                                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                                                                regulation.isActive !== false 
                                                                    ? 'bg-green-100 text-green-800' 
                                                                    : 'bg-red-100 text-red-800'
                                                            }`}>
                                                                {regulation.isActive !== false ? 'فعال' : 'غیرفعال'}
                                                            </span>
                                                        </td>
                                                        <td className="p-3">
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={() => handleEditMileage(regulation)}
                                                                    className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs hover:bg-blue-700 transition-colors"
                                                                >
                                                                    ویرایش
                                                                </button>
                                                                <button
                                                                    onClick={() => regulation.id && handleDeleteMileage(regulation.id)}
                                                                    className="px-3 py-1.5 bg-red-600 text-white rounded-md text-xs hover:bg-red-700 transition-colors"
                                                                >
                                                                    حذف
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            {mileageRegulations.filter(r => r.vehicleType === selectedVehicleTypeForRanges).length === 0 && (
                                                <tr>
                                                    <td colSpan={8} className="p-6 text-center text-slate-500">
                                                        هیچ بازه‌ای برای {selectedVehicleTypeForRanges} ثبت نشده است.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                        
                        {/* راهنما */}
                        {!selectedVehicleTypeForRanges && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                                <strong>💡 راهنما:</strong> روی هر کارت کلیک کنید تا بازه‌های پلکانی آن دسته خودرو را مشاهده و ویرایش کنید.
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'excess-mission' && (
                    <div>
                        <div className="flex justify-end mb-4">
                            <button
                                onClick={handleAddExcessMission}
                                className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm hover:bg-sky-700 transition-colors"
                            >
                                + افزودن بخشنامه هزینه ماموریت مازاد
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-right border-collapse">
                                <thead>
                                    <tr className="bg-slate-700 text-white border-b">
                                        <th className="p-3 text-right border-l border-slate-600">ردیف</th>
                                        <th className="p-3 text-right border-l border-slate-600">هزینه ماموریت مازاد (ریال)</th>
                                        <th className="p-3 text-right border-l border-slate-600">تاریخ مصوبه</th>
                                        <th className="p-3 text-right border-l border-slate-600">تاریخ شروع</th>
                                        <th className="p-3 text-right border-l border-slate-600">تاریخ پایان</th>
                                        <th className="p-3 text-right border-l border-slate-600">وضعیت</th>
                                        <th className="p-3 text-right border-l border-slate-600">ایجاد شده توسط</th>
                                        <th className="p-3 text-right border-l border-slate-600">تاریخ ایجاد</th>
                                        <th className="p-3 text-right">عملیات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {excessMissionRegulations.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} className="p-6 text-center text-slate-500">
                                                هیچ بخشنامه‌ای ثبت نشده است.
                                            </td>
                                        </tr>
                                    ) : (
                                        excessMissionRegulations.map((regulation, index) => (
                                            <tr key={regulation.id || index} className="border-b border-slate-200 bg-white hover:bg-slate-50">
                                                <td className="p-3 border-l border-slate-200 text-center">{index + 1}</td>
                                                <td className="p-3 border-l border-slate-200 text-left font-semibold text-green-700">
                                                    {regulation.excessMissionCost.toLocaleString('fa-IR')}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.approvalDate || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.startDate || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.endDate || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200">
                                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                                                        regulation.isActive !== false 
                                                            ? 'bg-green-100 text-green-800' 
                                                            : 'bg-red-100 text-red-800'
                                                    }`}>
                                                        {regulation.isActive !== false ? 'فعال' : 'غیرفعال'}
                                                    </span>
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.createdByName || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.createdAt ? formatJalali(new Date(regulation.createdAt)) : '-'}
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleEditExcessMission(regulation)}
                                                            className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs hover:bg-blue-700 transition-colors"
                                                        >
                                                            ویرایش
                                                        </button>
                                                        <button
                                                            onClick={() => regulation.id && handleDeleteExcessMission(regulation.id)}
                                                            className="px-3 py-1.5 bg-red-600 text-white rounded-md text-xs hover:bg-red-700 transition-colors"
                                                        >
                                                            حذف
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'multi-unload' && (
                    <div>
                        <div className="flex justify-end mb-4">
                            <button
                                onClick={handleAddMultiUnload}
                                className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm hover:bg-sky-700 transition-colors"
                            >
                                + افزودن بخشنامه هزینه چندجا تخلیه
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-right border-collapse">
                                <thead>
                                    <tr className="bg-slate-700 text-white border-b">
                                        <th className="p-3 text-right border-l border-slate-600">ردیف</th>
                                        <th className="p-3 text-right border-l border-slate-600">هزینه چندجا تخلیه (ریال)</th>
                                        <th className="p-3 text-right border-l border-slate-600">تاریخ مصوبه</th>
                                        <th className="p-3 text-right border-l border-slate-600">تاریخ شروع</th>
                                        <th className="p-3 text-right border-l border-slate-600">تاریخ پایان</th>
                                        <th className="p-3 text-right border-l border-slate-600">وضعیت</th>
                                        <th className="p-3 text-right border-l border-slate-600">ایجاد شده توسط</th>
                                        <th className="p-3 text-right border-l border-slate-600">تاریخ ایجاد</th>
                                        <th className="p-3 text-right">عملیات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {multiUnloadRegulations.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} className="p-6 text-center text-slate-500">
                                                هیچ بخشنامه‌ای ثبت نشده است.
                                            </td>
                                        </tr>
                                    ) : (
                                        multiUnloadRegulations.map((regulation, index) => (
                                            <tr key={regulation.id || index} className="border-b border-slate-200 bg-white hover:bg-slate-50">
                                                <td className="p-3 border-l border-slate-200 text-center">{index + 1}</td>
                                                <td className="p-3 border-l border-slate-200 text-left font-semibold text-green-700">
                                                    {regulation.multiUnloadCost.toLocaleString('fa-IR')}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.approvalDate || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.startDate || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.endDate || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200">
                                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                                                        regulation.isActive !== false 
                                                            ? 'bg-green-100 text-green-800' 
                                                            : 'bg-red-100 text-red-800'
                                                    }`}>
                                                        {regulation.isActive !== false ? 'فعال' : 'غیرفعال'}
                                                    </span>
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.createdByName || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.createdAt ? formatJalali(new Date(regulation.createdAt)) : '-'}
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleEditMultiUnload(regulation)}
                                                            className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs hover:bg-blue-700 transition-colors"
                                                        >
                                                            ویرایش
                                                        </button>
                                                        <button
                                                            onClick={() => regulation.id && handleDeleteMultiUnload(regulation.id)}
                                                            className="px-3 py-1.5 bg-red-600 text-white rounded-md text-xs hover:bg-red-700 transition-colors"
                                                        >
                                                            حذف
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'fuel-consumption' && (
                    <div>
                        <div className="flex justify-end mb-4">
                            <button
                                onClick={handleAddFuelConsumption}
                                className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm hover:bg-sky-700 transition-colors"
                            >
                                + افزودن بخشنامه مصرف سوخت
                            </button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-right border-collapse">
                                <thead>
                                    <tr className="bg-slate-700 text-white border-b">
                                        <th className="p-3 text-right border-l border-slate-600">ردیف</th>
                                        <th className="p-3 text-right border-l border-slate-600">نوع خودرو</th>
                                        <th className="p-3 text-right border-l border-slate-600">درصد مصرف (در هر 100 کیلومتر)</th>
                                        <th className="p-3 text-right border-l border-slate-600">قیمت هر لیتر (ریال)</th>
                                        <th className="p-3 text-right border-l border-slate-600">تاریخ مصوبه</th>
                                        <th className="p-3 text-right border-l border-slate-600">تاریخ شروع</th>
                                        <th className="p-3 text-right border-l border-slate-600">تاریخ پایان</th>
                                        <th className="p-3 text-right border-l border-slate-600">وضعیت</th>
                                        <th className="p-3 text-right border-l border-slate-600">ایجاد شده توسط</th>
                                        <th className="p-3 text-right border-l border-slate-600">تاریخ ایجاد</th>
                                        <th className="p-3 text-right">عملیات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {fuelConsumptionRegulations.length === 0 ? (
                                        <tr>
                                            <td colSpan={11} className="p-6 text-center text-slate-500">
                                                هیچ بخشنامه‌ای ثبت نشده است.
                                            </td>
                                        </tr>
                                    ) : (
                                        fuelConsumptionRegulations.map((regulation, index) => (
                                            <tr key={regulation.id || index} className="border-b border-slate-200 bg-white hover:bg-slate-50">
                                                <td className="p-3 border-l border-slate-200 text-center">{index + 1}</td>
                                                <td className="p-3 border-l border-slate-200 font-medium">
                                                    {regulation.vehicleType}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-left">
                                                    {regulation.consumptionPercentage.toLocaleString('fa-IR')}%
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-left font-semibold text-green-700">
                                                    {regulation.fuelPrice.toLocaleString('fa-IR')}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.approvalDate || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.startDate || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.endDate || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200">
                                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                                                        regulation.isActive !== false 
                                                            ? 'bg-green-100 text-green-800' 
                                                            : 'bg-red-100 text-red-800'
                                                    }`}>
                                                        {regulation.isActive !== false ? 'فعال' : 'غیرفعال'}
                                                    </span>
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.createdByName || '-'}
                                                </td>
                                                <td className="p-3 border-l border-slate-200 text-xs">
                                                    {regulation.createdAt ? formatJalali(new Date(regulation.createdAt)) : '-'}
                                                </td>
                                                <td className="p-3">
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleEditFuelConsumption(regulation)}
                                                            className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs hover:bg-blue-700 transition-colors"
                                                        >
                                                            ویرایش
                                                        </button>
                                                        <button
                                                            onClick={() => regulation.id && handleDeleteFuelConsumption(regulation.id)}
                                                            className="px-3 py-1.5 bg-red-600 text-white rounded-md text-xs hover:bg-red-700 transition-colors"
                                                        >
                                                            حذف
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* دیالوگ بخشنامه هزینه غذا */}
            {showFoodDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold text-slate-800 mb-4">
                            {editingFood ? 'ویرایش بخشنامه هزینه غذا' : 'افزودن بخشنامه هزینه غذا'}
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    هزینه غذا (ریال) *
                                </label>
                                <input
                                    type="number"
                                    value={foodFormData.foodCost}
                                    onChange={(e) => setFoodFormData({ ...foodFormData, foodCost: Number(e.target.value) })}
                                    className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-left"
                                    placeholder="0"
                                    min="0"
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        تاریخ مصوبه (شمسی) *
                                    </label>
                                    <input
                                        type="text"
                                        value={foodFormData.approvalDate}
                                        onChange={(e) => setFoodFormData({ ...foodFormData, approvalDate: e.target.value })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                        placeholder="1403/01/01"
                                        pattern="\d{4}/\d{2}/\d{2}"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">فرمت: YYYY/MM/DD</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        تاریخ شروع (شمسی) *
                                    </label>
                                    <input
                                        type="text"
                                        value={foodFormData.startDate}
                                        onChange={(e) => setFoodFormData({ ...foodFormData, startDate: e.target.value })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                        placeholder="1403/01/01"
                                        pattern="\d{4}/\d{2}/\d{2}"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">فرمت: YYYY/MM/DD</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        تاریخ پایان (شمسی) *
                                    </label>
                                    <input
                                        type="text"
                                        value={foodFormData.endDate}
                                        onChange={(e) => setFoodFormData({ ...foodFormData, endDate: e.target.value })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                        placeholder="1403/12/29"
                                        pattern="\d{4}/\d{2}/\d{2}"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">فرمت: YYYY/MM/DD</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    آپلود بخشنامه
                                </label>
                                <input
                                    type="file"
                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const filePath = await handleFileUpload(file);
                                            if (filePath) {
                                                setFoodFormData(prev => ({ ...prev, documentPath: filePath }));
                                            }
                                        }
                                    }}
                                    disabled={uploadingFile}
                                    className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                />
                                {uploadingFile && (
                                    <p className="text-xs text-slate-500 mt-1">در حال آپلود...</p>
                                )}
                                {foodFormData.documentPath && (
                                    <p className="text-xs text-green-600 mt-1">✓ فایل آپلود شد</p>
                                )}
                            </div>

                            <div>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={foodFormData.isActive !== false}
                                        onChange={(e) => setFoodFormData({ ...foodFormData, isActive: e.target.checked })}
                                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                    />
                                    <span className="text-sm font-medium text-slate-700">فعال</span>
                                </label>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setShowFoodDialog(false);
                                    setEditingFood(null);
                                }}
                                className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md text-sm hover:bg-slate-300"
                            >
                                انصراف
                            </button>
                            <button
                                onClick={handleSaveFood}
                                className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm hover:bg-sky-700"
                            >
                                {editingFood ? 'به‌روزرسانی' : 'ثبت'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* دیالوگ بخشنامه اجرت راننده کمکی */}
            {showHelperDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold text-slate-800 mb-4">
                            {editingHelper ? 'ویرایش بخشنامه اجرت راننده کمکی' : 'افزودن بخشنامه اجرت راننده کمکی'}
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    اجرت راننده کمکی (ریال) *
                                </label>
                                <input
                                    type="number"
                                    value={helperFormData.helperAllowance}
                                    onChange={(e) => setHelperFormData({ ...helperFormData, helperAllowance: Number(e.target.value) })}
                                    className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-left"
                                    placeholder="0"
                                    min="0"
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        تاریخ مصوبه (شمسی) *
                                    </label>
                                    <input
                                        type="text"
                                        value={helperFormData.approvalDate}
                                        onChange={(e) => setHelperFormData({ ...helperFormData, approvalDate: e.target.value })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                        placeholder="1403/01/01"
                                        pattern="\d{4}/\d{2}/\d{2}"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">فرمت: YYYY/MM/DD</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        تاریخ شروع (شمسی) *
                                    </label>
                                    <input
                                        type="text"
                                        value={helperFormData.startDate}
                                        onChange={(e) => setHelperFormData({ ...helperFormData, startDate: e.target.value })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                        placeholder="1403/01/01"
                                        pattern="\d{4}/\d{2}/\d{2}"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">فرمت: YYYY/MM/DD</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        تاریخ پایان (شمسی) *
                                    </label>
                                    <input
                                        type="text"
                                        value={helperFormData.endDate}
                                        onChange={(e) => setHelperFormData({ ...helperFormData, endDate: e.target.value })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                        placeholder="1403/12/29"
                                        pattern="\d{4}/\d{2}/\d{2}"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">فرمت: YYYY/MM/DD</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    آپلود بخشنامه
                                </label>
                                <input
                                    type="file"
                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const filePath = await handleFileUpload(file);
                                            if (filePath) {
                                                setHelperFormData(prev => ({ ...prev, documentPath: filePath }));
                                            }
                                        }
                                    }}
                                    disabled={uploadingFile}
                                    className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                />
                                {uploadingFile && (
                                    <p className="text-xs text-slate-500 mt-1">در حال آپلود...</p>
                                )}
                                {helperFormData.documentPath && (
                                    <p className="text-xs text-green-600 mt-1">✓ فایل آپلود شد</p>
                                )}
                            </div>

                            <div>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={helperFormData.isActive !== false}
                                        onChange={(e) => setHelperFormData({ ...helperFormData, isActive: e.target.checked })}
                                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                    />
                                    <span className="text-sm font-medium text-slate-700">فعال</span>
                                </label>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setShowHelperDialog(false);
                                    setEditingHelper(null);
                                }}
                                className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md text-sm hover:bg-slate-300"
                            >
                                انصراف
                            </button>
                            <button
                                onClick={handleSaveHelper}
                                className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm hover:bg-sky-700"
                            >
                                {editingHelper ? 'به‌روزرسانی' : 'ثبت'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* دیالوگ بخشنامه اجرت ثابت */}
            {showFixedAllowanceDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold text-amber-800 mb-4">
                            {editingFixedAllowance ? 'ویرایش بخشنامه اجرت ثابت' : 'افزودن بخشنامه اجرت ثابت'}
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    نوع خودرو *
                                </label>
                                <select
                                    value={fixedAllowanceFormData.vehicleType}
                                    onChange={(e) => setFixedAllowanceFormData({ ...fixedAllowanceFormData, vehicleType: e.target.value as 'تریلی' | 'ده چرخ' })}
                                    className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-amber-500 focus:border-amber-500"
                                >
                                    <option value="تریلی">🚛 تریلی / مینی تریلی</option>
                                    <option value="ده چرخ">🚚 ده چرخ</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    اجرت ثابت به ازای هر کیلومتر (ریال) *
                                </label>
                                <input
                                    type="number"
                                    value={fixedAllowanceFormData.fixedAllowancePerKm}
                                    onChange={(e) => setFixedAllowanceFormData({ ...fixedAllowanceFormData, fixedAllowancePerKm: Number(e.target.value) })}
                                    className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-amber-500 focus:border-amber-500 text-left"
                                    placeholder="0"
                                    min="0"
                                />
                                <p className="text-xs text-slate-500 mt-1">مثال: اگر 10,000 ریال وارد کنید، برای پیمایش 1000 کیلومتر = 10,000,000 ریال</p>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        تاریخ مصوبه (شمسی) *
                                    </label>
                                    <input
                                        type="text"
                                        value={fixedAllowanceFormData.approvalDate}
                                        onChange={(e) => setFixedAllowanceFormData({ ...fixedAllowanceFormData, approvalDate: e.target.value })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-amber-500 focus:border-amber-500"
                                        placeholder="1403/01/01"
                                        pattern="\d{4}/\d{2}/\d{2}"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">فرمت: YYYY/MM/DD</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        تاریخ شروع (شمسی) *
                                    </label>
                                    <input
                                        type="text"
                                        value={fixedAllowanceFormData.startDate}
                                        onChange={(e) => setFixedAllowanceFormData({ ...fixedAllowanceFormData, startDate: e.target.value })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-amber-500 focus:border-amber-500"
                                        placeholder="1403/01/01"
                                        pattern="\d{4}/\d{2}/\d{2}"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">فرمت: YYYY/MM/DD</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        تاریخ پایان (شمسی) *
                                    </label>
                                    <input
                                        type="text"
                                        value={fixedAllowanceFormData.endDate}
                                        onChange={(e) => setFixedAllowanceFormData({ ...fixedAllowanceFormData, endDate: e.target.value })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-amber-500 focus:border-amber-500"
                                        placeholder="1403/12/29"
                                        pattern="\d{4}/\d{2}/\d{2}"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">فرمت: YYYY/MM/DD</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    آپلود بخشنامه
                                </label>
                                <input
                                    type="file"
                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const filePath = await handleFileUpload(file);
                                            if (filePath) {
                                                setFixedAllowanceFormData(prev => ({ ...prev, documentPath: filePath }));
                                            }
                                        }
                                    }}
                                    disabled={uploadingFile}
                                    className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-amber-500 focus:border-amber-500"
                                />
                                {uploadingFile && (
                                    <p className="text-xs text-slate-500 mt-1">در حال آپلود...</p>
                                )}
                                {fixedAllowanceFormData.documentPath && (
                                    <p className="text-xs text-green-600 mt-1">✓ فایل آپلود شد</p>
                                )}
                            </div>

                            <div>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={fixedAllowanceFormData.isActive !== false}
                                        onChange={(e) => setFixedAllowanceFormData({ ...fixedAllowanceFormData, isActive: e.target.checked })}
                                        className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                    />
                                    <span className="text-sm font-medium text-slate-700">فعال</span>
                                </label>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setShowFixedAllowanceDialog(false);
                                    setEditingFixedAllowance(null);
                                }}
                                className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md text-sm hover:bg-slate-300"
                            >
                                انصراف
                            </button>
                            <button
                                onClick={handleSaveFixedAllowance}
                                className="px-4 py-2 bg-amber-600 text-white rounded-md text-sm hover:bg-amber-700"
                            >
                                {editingFixedAllowance ? 'به‌روزرسانی' : 'ثبت'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* دیالوگ بخشنامه اجرت پیمایش */}
            {showMileageDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold text-slate-800 mb-4">
                            {editingMileage ? 'ویرایش بخشنامه اجرت پیمایش' : 'افزودن بخشنامه اجرت پیمایش'}
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    نوع خودرو *
                                </label>
                                <select
                                    value={mileageFormData.vehicleType}
                                    onChange={(e) => setMileageFormData({ ...mileageFormData, vehicleType: e.target.value as any })}
                                    className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                >
                                    <option value="تریلی">تریلی</option>
                                    <option value="ده چرخ">ده چرخ</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        حداقل کیلومتر *
                                    </label>
                                    <input
                                        type="number"
                                        value={mileageFormData.minKilometers}
                                        onChange={(e) => setMileageFormData({ ...mileageFormData, minKilometers: Number(e.target.value) })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-left"
                                        placeholder="0"
                                        min="0"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        حداکثر کیلومتر *
                                    </label>
                                    <input
                                        type="number"
                                        value={mileageFormData.maxKilometers}
                                        onChange={(e) => setMileageFormData({ ...mileageFormData, maxKilometers: Number(e.target.value) })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-left"
                                        placeholder="0"
                                        min="0"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        اجرت به ازای هر کیلومتر (ریال) *
                                    </label>
                                    <input
                                        type="number"
                                        value={mileageFormData.allowancePerKm}
                                        onChange={(e) => setMileageFormData({ ...mileageFormData, allowancePerKm: Number(e.target.value) })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-left"
                                        placeholder="0"
                                        min="0"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        تاریخ مصوبه (شمسی)
                                    </label>
                                    <input
                                        type="text"
                                        value={mileageFormData.approvalDate || ''}
                                        onChange={(e) => setMileageFormData({ ...mileageFormData, approvalDate: e.target.value })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                        placeholder="1403/01/01"
                                        pattern="\d{4}/\d{2}/\d{2}"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">فرمت: YYYY/MM/DD</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        تاریخ شروع (شمسی)
                                    </label>
                                    <input
                                        type="text"
                                        value={mileageFormData.startDate || ''}
                                        onChange={(e) => setMileageFormData({ ...mileageFormData, startDate: e.target.value })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                        placeholder="1403/01/01"
                                        pattern="\d{4}/\d{2}/\d{2}"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">فرمت: YYYY/MM/DD</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        تاریخ پایان (شمسی)
                                    </label>
                                    <input
                                        type="text"
                                        value={mileageFormData.endDate || ''}
                                        onChange={(e) => setMileageFormData({ ...mileageFormData, endDate: e.target.value })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                        placeholder="1403/12/29"
                                        pattern="\d{4}/\d{2}/\d{2}"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">فرمت: YYYY/MM/DD</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    آپلود بخشنامه
                                </label>
                                <input
                                    type="file"
                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const filePath = await handleFileUpload(file);
                                            if (filePath) {
                                                setMileageFormData(prev => ({ ...prev, documentPath: filePath }));
                                            }
                                        }
                                    }}
                                    disabled={uploadingFile}
                                    className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                />
                                {uploadingFile && (
                                    <p className="text-xs text-slate-500 mt-1">در حال آپلود...</p>
                                )}
                                {mileageFormData.documentPath && (
                                    <p className="text-xs text-green-600 mt-1">✓ فایل آپلود شد</p>
                                )}
                            </div>

                            <div>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={mileageFormData.isActive !== false}
                                        onChange={(e) => setMileageFormData({ ...mileageFormData, isActive: e.target.checked })}
                                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                    />
                                    <span className="text-sm font-medium text-slate-700">فعال</span>
                                </label>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setShowMileageDialog(false);
                                    setEditingMileage(null);
                                }}
                                className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md text-sm hover:bg-slate-300"
                            >
                                انصراف
                            </button>
                            <button
                                onClick={handleSaveMileage}
                                className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm hover:bg-sky-700"
                            >
                                {editingMileage ? 'به‌روزرسانی' : 'ثبت'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* دیالوگ بخشنامه هزینه ماموریت مازاد */}
            {showExcessMissionDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold text-slate-800 mb-4">
                            {editingExcessMission ? 'ویرایش بخشنامه هزینه ماموریت مازاد' : 'افزودن بخشنامه هزینه ماموریت مازاد'}
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    هزینه ماموریت مازاد (ریال) *
                                </label>
                                <input
                                    type="number"
                                    value={excessMissionFormData.excessMissionCost}
                                    onChange={(e) => setExcessMissionFormData({ ...excessMissionFormData, excessMissionCost: Number(e.target.value) })}
                                    className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-left"
                                    placeholder="0"
                                    min="0"
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        تاریخ مصوبه (شمسی) *
                                    </label>
                                    <input
                                        type="text"
                                        value={excessMissionFormData.approvalDate}
                                        onChange={(e) => setExcessMissionFormData({ ...excessMissionFormData, approvalDate: e.target.value })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                        placeholder="1403/01/01"
                                        pattern="\d{4}/\d{2}/\d{2}"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">فرمت: YYYY/MM/DD</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        تاریخ شروع (شمسی) *
                                    </label>
                                    <input
                                        type="text"
                                        value={excessMissionFormData.startDate}
                                        onChange={(e) => setExcessMissionFormData({ ...excessMissionFormData, startDate: e.target.value })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                        placeholder="1403/01/01"
                                        pattern="\d{4}/\d{2}/\d{2}"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">فرمت: YYYY/MM/DD</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        تاریخ پایان (شمسی) *
                                    </label>
                                    <input
                                        type="text"
                                        value={excessMissionFormData.endDate}
                                        onChange={(e) => setExcessMissionFormData({ ...excessMissionFormData, endDate: e.target.value })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                        placeholder="1403/12/29"
                                        pattern="\d{4}/\d{2}/\d{2}"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">فرمت: YYYY/MM/DD</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    آپلود بخشنامه
                                </label>
                                <input
                                    type="file"
                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const filePath = await handleFileUpload(file);
                                            if (filePath) {
                                                setExcessMissionFormData(prev => ({ ...prev, documentPath: filePath }));
                                            }
                                        }
                                    }}
                                    disabled={uploadingFile}
                                    className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                />
                                {uploadingFile && (
                                    <p className="text-xs text-slate-500 mt-1">در حال آپلود...</p>
                                )}
                                {excessMissionFormData.documentPath && (
                                    <p className="text-xs text-green-600 mt-1">✓ فایل آپلود شد</p>
                                )}
                            </div>

                            <div>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={excessMissionFormData.isActive !== false}
                                        onChange={(e) => setExcessMissionFormData({ ...excessMissionFormData, isActive: e.target.checked })}
                                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                    />
                                    <span className="text-sm font-medium text-slate-700">فعال</span>
                                </label>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setShowExcessMissionDialog(false);
                                    setEditingExcessMission(null);
                                }}
                                className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md text-sm hover:bg-slate-300"
                            >
                                انصراف
                            </button>
                            <button
                                onClick={handleSaveExcessMission}
                                className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm hover:bg-sky-700"
                            >
                                {editingExcessMission ? 'به‌روزرسانی' : 'ثبت'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* دیالوگ بخشنامه هزینه چندجا تخلیه */}
            {showMultiUnloadDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold text-slate-800 mb-4">
                            {editingMultiUnload ? 'ویرایش بخشنامه هزینه چندجا تخلیه' : 'افزودن بخشنامه هزینه چندجا تخلیه'}
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    هزینه چندجا تخلیه (ریال) *
                                </label>
                                <input
                                    type="number"
                                    value={multiUnloadFormData.multiUnloadCost}
                                    onChange={(e) => setMultiUnloadFormData({ ...multiUnloadFormData, multiUnloadCost: Number(e.target.value) })}
                                    className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-left"
                                    placeholder="0"
                                    min="0"
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        تاریخ مصوبه (شمسی) *
                                    </label>
                                    <input
                                        type="text"
                                        value={multiUnloadFormData.approvalDate}
                                        onChange={(e) => setMultiUnloadFormData({ ...multiUnloadFormData, approvalDate: e.target.value })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                        placeholder="1403/01/01"
                                        pattern="\d{4}/\d{2}/\d{2}"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">فرمت: YYYY/MM/DD</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        تاریخ شروع (شمسی) *
                                    </label>
                                    <input
                                        type="text"
                                        value={multiUnloadFormData.startDate}
                                        onChange={(e) => setMultiUnloadFormData({ ...multiUnloadFormData, startDate: e.target.value })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                        placeholder="1403/01/01"
                                        pattern="\d{4}/\d{2}/\d{2}"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">فرمت: YYYY/MM/DD</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        تاریخ پایان (شمسی) *
                                    </label>
                                    <input
                                        type="text"
                                        value={multiUnloadFormData.endDate}
                                        onChange={(e) => setMultiUnloadFormData({ ...multiUnloadFormData, endDate: e.target.value })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                        placeholder="1403/12/29"
                                        pattern="\d{4}/\d{2}/\d{2}"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">فرمت: YYYY/MM/DD</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    آپلود بخشنامه
                                </label>
                                <input
                                    type="file"
                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const filePath = await handleFileUpload(file);
                                            if (filePath) {
                                                setMultiUnloadFormData(prev => ({ ...prev, documentPath: filePath }));
                                            }
                                        }
                                    }}
                                    disabled={uploadingFile}
                                    className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                />
                                {uploadingFile && (
                                    <p className="text-xs text-slate-500 mt-1">در حال آپلود...</p>
                                )}
                                {multiUnloadFormData.documentPath && (
                                    <p className="text-xs text-green-600 mt-1">✓ فایل آپلود شد</p>
                                )}
                            </div>

                            <div>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={multiUnloadFormData.isActive !== false}
                                        onChange={(e) => setMultiUnloadFormData({ ...multiUnloadFormData, isActive: e.target.checked })}
                                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                    />
                                    <span className="text-sm font-medium text-slate-700">فعال</span>
                                </label>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setShowMultiUnloadDialog(false);
                                    setEditingMultiUnload(null);
                                }}
                                className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md text-sm hover:bg-slate-300"
                            >
                                انصراف
                            </button>
                            <button
                                onClick={handleSaveMultiUnload}
                                className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm hover:bg-sky-700"
                            >
                                {editingMultiUnload ? 'به‌روزرسانی' : 'ثبت'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* دیالوگ بخشنامه مصرف سوخت */}
            {showFuelConsumptionDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold text-slate-800 mb-4">
                            {editingFuelConsumption ? 'ویرایش بخشنامه مصرف سوخت' : 'افزودن بخشنامه مصرف سوخت'}
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    نوع خودرو *
                                </label>
                                <select
                                    value={fuelConsumptionFormData.vehicleType}
                                    onChange={(e) => setFuelConsumptionFormData({ ...fuelConsumptionFormData, vehicleType: e.target.value })}
                                    className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                >
                                    <option value="تریلی">تریلی</option>
                                    <option value="ده چرخ">ده چرخ</option>
                                    <option value="کامیون">کامیون</option>
                                    <option value="وانت">وانت</option>
                                    <option value="سایر">سایر</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        درصد مصرف (در هر 100 کیلومتر) *
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={fuelConsumptionFormData.consumptionPercentage}
                                        onChange={(e) => setFuelConsumptionFormData({ ...fuelConsumptionFormData, consumptionPercentage: Number(e.target.value) })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-left"
                                        placeholder="0"
                                        min="0"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">مثال: 35 به معنای 35 لیتر در هر 100 کیلومتر</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        قیمت هر لیتر سوخت (ریال) *
                                    </label>
                                    <input
                                        type="number"
                                        value={fuelConsumptionFormData.fuelPrice}
                                        onChange={(e) => setFuelConsumptionFormData({ ...fuelConsumptionFormData, fuelPrice: Number(e.target.value) })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500 text-left"
                                        placeholder="0"
                                        min="0"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        تاریخ مصوبه (شمسی) *
                                    </label>
                                    <input
                                        type="text"
                                        value={fuelConsumptionFormData.approvalDate}
                                        onChange={(e) => setFuelConsumptionFormData({ ...fuelConsumptionFormData, approvalDate: e.target.value })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                        placeholder="1403/01/01"
                                        pattern="\d{4}/\d{2}/\d{2}"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">فرمت: YYYY/MM/DD</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        تاریخ شروع (شمسی) *
                                    </label>
                                    <input
                                        type="text"
                                        value={fuelConsumptionFormData.startDate}
                                        onChange={(e) => setFuelConsumptionFormData({ ...fuelConsumptionFormData, startDate: e.target.value })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                        placeholder="1403/01/01"
                                        pattern="\d{4}/\d{2}/\d{2}"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">فرمت: YYYY/MM/DD</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">
                                        تاریخ پایان (شمسی) *
                                    </label>
                                    <input
                                        type="text"
                                        value={fuelConsumptionFormData.endDate}
                                        onChange={(e) => setFuelConsumptionFormData({ ...fuelConsumptionFormData, endDate: e.target.value })}
                                        className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                        placeholder="1403/12/29"
                                        pattern="\d{4}/\d{2}/\d{2}"
                                    />
                                    <p className="text-xs text-slate-500 mt-1">فرمت: YYYY/MM/DD</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    آپلود بخشنامه
                                </label>
                                <input
                                    type="file"
                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const filePath = await handleFileUpload(file);
                                            if (filePath) {
                                                setFuelConsumptionFormData(prev => ({ ...prev, documentPath: filePath }));
                                            }
                                        }
                                    }}
                                    disabled={uploadingFile}
                                    className="block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                />
                                {uploadingFile && (
                                    <p className="text-xs text-slate-500 mt-1">در حال آپلود...</p>
                                )}
                                {fuelConsumptionFormData.documentPath && (
                                    <p className="text-xs text-green-600 mt-1">✓ فایل آپلود شد</p>
                                )}
                            </div>

                            <div>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={fuelConsumptionFormData.isActive !== false}
                                        onChange={(e) => setFuelConsumptionFormData({ ...fuelConsumptionFormData, isActive: e.target.checked })}
                                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                    />
                                    <span className="text-sm font-medium text-slate-700">فعال</span>
                                </label>
                            </div>
                        </div>

                        <div className="mt-6 flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setShowFuelConsumptionDialog(false);
                                    setEditingFuelConsumption(null);
                                }}
                                className="px-4 py-2 bg-slate-200 text-slate-800 rounded-md text-sm hover:bg-slate-300"
                            >
                                انصراف
                            </button>
                            <button
                                onClick={handleSaveFuelConsumption}
                                className="px-4 py-2 bg-sky-600 text-white rounded-md text-sm hover:bg-sky-700"
                            >
                                {editingFuelConsumption ? 'به‌روزرسانی' : 'ثبت'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AllowanceRegulationManagement;

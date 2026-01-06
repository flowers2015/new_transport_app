/**
 * دیالوگ مشترک برای افزودن/ویرایش خودرو
 * این دیالوگ در VehicleDashboard و AdminResourceManagement استفاده می‌شود
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Vehicle, Branch, PlateNumber, VehicleStatus, VehicleCategory } from '../types';
import { getApiUrl } from '../utils/apiConfig';
import VehicleSpecsDialog from './VehicleSpecsDialog';

interface VehicleFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (vehicle: Omit<Vehicle, 'id'>) => Promise<void>;
  initialData?: Vehicle | null;
  branches: Branch[];
  showSpecsButton?: boolean; // نمایش دکمه مدیریت مشخصات
  externalSpec?: any; // مشخصات خارجی که از VehicleSpecsDialog در VehicleDashboard می‌آید
}

const persianAlphabet = ['الف', 'ب', 'پ', 'ت', 'ث', 'ج', 'چ', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'ژ', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ک', 'گ', 'ل', 'م', 'ن', 'و', 'ه', 'ی'];
const mihanCompanies = ['پخش سراسری میهن', 'شهرنوشیدنی', 'پاندا', 'کارخانه میهن'];
const vehicleCategories = Object.values(VehicleCategory);
const fuelTypes = ['بنزینی', 'گازوییلی', 'برقی', 'هیبریدی', 'گازی'];
const vehicleColors = ["سفید", "نقره ای", "خاکستری-متالیک", "مشکی", "قرمز", "بژ روشن", "نوک مدادی", "قهوه ای-متالیک", "آبی", "سبز", "نقره آبی"];

const VehicleFormDialog: React.FC<VehicleFormDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  branches,
  showSpecsButton = false,
  externalSpec
}) => {
  const [plate, setPlate] = useState<PlateNumber>({ part1: '', letter: 'الف', part2: '', cityCode: '' });
  const [serialNumber, setSerialNumber] = useState('');
  const [vehicleCode, setVehicleCode] = useState('');
  const [isPlate, setIsPlate] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showSpecsDialog, setShowSpecsDialog] = useState(false);
  
  // States برای داده‌های API
  const [apiVehicleTypes, setApiVehicleTypes] = useState<string[]>([]);
  const [apiBrands, setApiBrands] = useState<string[]>([]);
  const [apiModels, setApiModels] = useState<string[]>([]);
  const [apiTips, setApiTips] = useState<any[]>([]);
  
  const initialFormState = {
    holdingCompany: 'mihan' as 'mihan' | 'other' | '', // Default to mihan
    mihanCompany: 'پخش سراسری میهن', // Default to پخش سراسری میهن
    vehicleCategory: '' as VehicleCategory | '',
    vehicleType: '',
    brand: '',
    model: '',
    vehicleTip: '',
    type: '',
    branchId: '',
    color: '',
    ownerName: '',
    cardId: '',
    vin: '',
    usageType: '',
    engineNumber: '',
    chassisNumber: '',
    capacity: '',
    year: '',
    wheelCount: '',
    axleCount: '',
    cylinderCount: '',
    domainName: '',
    fuelType: '',
    status: VehicleStatus.Active,
  };
  
  const [formState, setFormState] = useState(initialFormState);

  // Sync form with initialData when it changes (for edit mode)
  useEffect(() => {
    if (initialData) {
      // Use vehicleTip directly from initialData, don't try to extract it from model
      const vehicleTip = (initialData as any).vehicleTip || '';
      
      // If model contains vehicleTip, try to separate them
      const baseModel = (initialData.model || '').trim();
      let modelName = baseModel;
      
      // Only try to separate if vehicleTip is empty and model seems to contain a tip
      if (!vehicleTip && baseModel) {
        // Check if model contains common tip patterns (like "سری G G410" -> "سری G" and "G410")
        // This is a fallback for old data where tip might be in model
        const tipPatterns = [
          /(.+?)\s+([A-Z]\d+[A-Z]?)$/, // Pattern like "سری G G410"
          /(.+?)\s+(G\d+|R\d+|S\d+|P\d+)$/, // Scania patterns
        ];
        
        for (const pattern of tipPatterns) {
          const match = baseModel.match(pattern);
          if (match) {
            modelName = match[1].trim();
            // Don't set tip here, let it come from initialData.vehicleTip
            break;
          }
        }
      }
      
      setFormState({
        holdingCompany: (initialData.holdingCompany as any) || '',
        mihanCompany: (initialData.mihanCompany as any) || '',
        vehicleCategory: (initialData.vehicleCategory as any) || '',
        vehicleType: (initialData as any).vehicleType || '',
        brand: initialData.brand || '',
        model: modelName,
        vehicleTip: vehicleTip,
        type: initialData.type || '',
        branchId: initialData.branchId || '',
        color: (initialData as any).color || '',
        ownerName: initialData.ownerName || '',
        cardId: (initialData as any).cardId || '',
        vin: initialData.vin || '',
        usageType: (initialData as any).usageType || '',
        engineNumber: (initialData as any).engineNumber || '',
        chassisNumber: (initialData as any).chassisNumber || '',
        capacity: (initialData as any).capacity || '',
        year: initialData.year ? String(initialData.year) : '',
        wheelCount: (initialData as any).wheelCount ? String((initialData as any).wheelCount) : '',
        axleCount: (initialData as any).axleCount ? String((initialData as any).axleCount) : '',
        cylinderCount: (initialData as any).cylinderCount ? String((initialData as any).cylinderCount) : '',
        domainName: (initialData as any).domainName || '',
        fuelType: (initialData as any).fuelType || '',
        status: initialData.status || VehicleStatus.Active,
      } as any);
      
      if (initialData.plateNumber) {
        setIsPlate(true);
        setPlate(initialData.plateNumber);
        setSerialNumber('');
      } else {
        setIsPlate(false);
        setSerialNumber(initialData.serialNumber || '');
        setPlate({ part1: '', letter: 'الف', part2: '', cityCode: '' });
      }
      setVehicleCode(initialData.vehicleCode || '');
    } else {
      // Reset form for new vehicle
      setFormState(initialFormState);
      setPlate({ part1: '', letter: 'الف', part2: '', cityCode: '' });
      setSerialNumber('');
      setVehicleCode('');
      setIsPlate(true);
    }
  }, [initialData]);

  // Handle external spec from VehicleDashboard
  useEffect(() => {
    if (externalSpec && isOpen) {
      handleSpecSelect(externalSpec);
    }
  }, [externalSpec, isOpen]);

  // Handle spec selection from VehicleSpecsDialog
  const handleSpecSelect = (spec: any) => {
    // Map vehicle category from Persian to enum
    const categoryMap: Record<string, VehicleCategory> = {
      'خودرو سنگین': VehicleCategory.Heavy,
      'خودرو نیمه سنگین': VehicleCategory.Medium,
      'سواری': VehicleCategory.Car,
      'وانت': VehicleCategory.Pickup,
      'نیمه یدک (تریلر)': VehicleCategory.SemiTrailer,
    };
    
    const mappedCategory = categoryMap[spec.vehicleCategory] || spec.vehicleCategory;
    
    setFormState(prev => ({
      ...prev,
      vehicleCategory: mappedCategory,
      vehicleType: spec.vehicleType || '',
      brand: spec.brand || '',
      model: spec.model || '',
      vehicleTip: spec.tip || '',
      fuelType: spec.fuelType || prev.fuelType,
      cylinderCount: spec.cylinderCount ? String(spec.cylinderCount) : prev.cylinderCount,
      axleCount: spec.axleCount ? String(spec.axleCount) : prev.axleCount,
      wheelCount: spec.wheelCount ? String(spec.wheelCount) : prev.wheelCount,
      capacity: spec.capacity || prev.capacity,
    }));
  };

  // Fetch vehicle types from API
  useEffect(() => {
    const fetchVehicleTypes = async () => {
      if (!formState.vehicleCategory) {
        setApiVehicleTypes([]);
        return;
      }
      try {
        const token = localStorage.getItem('token');
        const categoryMap: Record<string, string> = {
          [VehicleCategory.Heavy]: 'خودرو سنگین',
          [VehicleCategory.Medium]: 'خودرو نیمه سنگین',
          [VehicleCategory.Car]: 'سواری',
          [VehicleCategory.Pickup]: 'وانت',
          [VehicleCategory.Trailer]: 'نیمه یدک (تریلر)',
        };
        const categoryName = categoryMap[formState.vehicleCategory] || formState.vehicleCategory;
        const res = await fetch(getApiUrl(`vehicle-specs/vehicle-types?category=${encodeURIComponent(categoryName)}`), {
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
  }, [formState.vehicleCategory]);

  // Fetch brands from API
  useEffect(() => {
    const fetchBrands = async () => {
      if (!formState.vehicleCategory) {
        setApiBrands([]);
        return;
      }
      try {
        const token = localStorage.getItem('token');
        const categoryMap: Record<string, string> = {
          [VehicleCategory.Heavy]: 'خودرو سنگین',
          [VehicleCategory.Medium]: 'خودرو نیمه سنگین',
          [VehicleCategory.Car]: 'سواری',
          [VehicleCategory.Pickup]: 'وانت',
          [VehicleCategory.Trailer]: 'نیمه یدک (تریلر)',
        };
        const categoryName = categoryMap[formState.vehicleCategory] || formState.vehicleCategory;
        let url = `vehicle-specs/brands?category=${encodeURIComponent(categoryName)}`;
        if (formState.vehicleType) {
          url += `&vehicleType=${encodeURIComponent(formState.vehicleType)}`;
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
  }, [formState.vehicleCategory, formState.vehicleType]);

  // Fetch models from API
  useEffect(() => {
    const fetchModels = async () => {
      if (!formState.vehicleCategory || !formState.brand) {
        setApiModels([]);
        return;
      }
      try {
        const token = localStorage.getItem('token');
        const categoryMap: Record<string, string> = {
          [VehicleCategory.Heavy]: 'خودرو سنگین',
          [VehicleCategory.Medium]: 'خودرو نیمه سنگین',
          [VehicleCategory.Car]: 'سواری',
          [VehicleCategory.Pickup]: 'وانت',
          [VehicleCategory.Trailer]: 'نیمه یدک (تریلر)',
        };
        const categoryName = categoryMap[formState.vehicleCategory] || formState.vehicleCategory;
        let url = `vehicle-specs/models?category=${encodeURIComponent(categoryName)}&brand=${encodeURIComponent(formState.brand)}`;
        if (formState.vehicleType) {
          url += `&vehicleType=${encodeURIComponent(formState.vehicleType)}`;
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
  }, [formState.vehicleCategory, formState.brand, formState.vehicleType]);

  // Fetch tips from API
  useEffect(() => {
    const fetchTips = async () => {
      if (!formState.vehicleCategory || !formState.brand || !formState.model) {
        setApiTips([]);
        return;
      }
      try {
        const token = localStorage.getItem('token');
        const categoryMap: Record<string, string> = {
          [VehicleCategory.Heavy]: 'خودرو سنگین',
          [VehicleCategory.Medium]: 'خودرو نیمه سنگین',
          [VehicleCategory.Car]: 'سواری',
          [VehicleCategory.Pickup]: 'وانت',
          [VehicleCategory.Trailer]: 'نیمه یدک (تریلر)',
        };
        const categoryName = categoryMap[formState.vehicleCategory] || formState.vehicleCategory;
        let url = `vehicle-specs/tips?category=${encodeURIComponent(categoryName)}&brand=${encodeURIComponent(formState.brand)}&model=${encodeURIComponent(formState.model)}`;
        if (formState.vehicleType) {
          url += `&vehicleType=${encodeURIComponent(formState.vehicleType)}`;
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
  }, [formState.vehicleCategory, formState.brand, formState.model, formState.vehicleType]);

  // Auto-fill specs when tip is selected
  useEffect(() => {
    if (formState.vehicleTip && apiTips.length > 0) {
      const selectedTip = apiTips.find(t => t.tip === formState.vehicleTip);
      if (selectedTip) {
        setFormState(prev => ({
          ...prev,
          fuelType: selectedTip.fuelType || prev.fuelType,
          cylinderCount: selectedTip.cylinderCount?.toString() || prev.cylinderCount,
          axleCount: selectedTip.axleCount?.toString() || prev.axleCount,
          wheelCount: selectedTip.wheelCount?.toString() || prev.wheelCount,
          capacity: selectedTip.capacity || prev.capacity,
        }));
      }
    }
  }, [formState.vehicleTip, apiTips]);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as VehicleCategory;
    setFormState(prev => ({
      ...prev,
      vehicleCategory: value,
      vehicleType: '', // Reset vehicle type
      brand: '', // Reset brand
      model: '', // Reset model
      vehicleTip: '', // Reset tip
    }));
  };

  const handleVehicleTypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormState(prev => ({
      ...prev,
      vehicleType: value,
      vehicleTip: '', // Only reset tip
    }));
  };

  const handleBrandChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormState(prev => ({
      ...prev,
      brand: value,
      model: '', // Reset model
      vehicleTip: '', // Reset tip
    }));
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFormState(prev => ({
      ...prev,
      model: value,
      vehicleTip: '', // Only reset tip
    }));
  };

  const handlePlateChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setPlate(prev => ({ ...prev, [name]: value }));
  };

  // Cascading dropdown logic (for fallback to local database)
  const brands = useMemo(() => {
    // This would use local vehicleDatabase if API fails - simplified for now
    return apiBrands;
  }, [apiBrands]);

  const models = useMemo(() => {
    return apiModels;
  }, [apiModels]);

  const subModels = useMemo(() => {
    return apiTips.map(t => t.tip).filter(Boolean);
  }, [apiTips]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const { branchId, model, holdingCompany, vehicleCategory, mihanCompany, year, wheelCount, axleCount, cylinderCount } = formState;

      if (!holdingCompany || !vehicleCategory || !branchId || !model) {
        alert('لطفا تمام فیلدهای ستاره دار را تکمیل کنید.');
        setLoading(false);
        return;
      }
      if (holdingCompany === 'mihan' && !mihanCompany) {
        alert('لطفا شرکت زیرمجموعه هلدینگ میهن را انتخاب کنید.');
        setLoading(false);
        return;
      }

      // Ensure model is not empty (required field) - keep model and vehicleTip separate
      // Don't combine them - model should be just the base model name
      const finalModel = formState.model || 'نامشخص';
      
      const vehicleData: Omit<Vehicle, 'id'> = {
        ...formState,
        holdingCompany: holdingCompany,
        vehicleCategory: vehicleCategory,
        model: finalModel, // Keep model separate from vehicleTip
        vehicleTip: formState.vehicleTip || undefined, // Keep vehicleTip separate
        year: year ? parseInt(String(year)) : undefined,
        wheelCount: wheelCount ? parseInt(String(wheelCount)) : undefined,
        axleCount: axleCount ? parseInt(String(axleCount)) : undefined,
        cylinderCount: cylinderCount ? parseInt(String(cylinderCount)) : undefined,
        plateNumber: isPlate ? plate : undefined,
        serialNumber: !isPlate ? serialNumber : undefined,
        vehicleCode: vehicleCode || undefined,
        ownerName: holdingCompany === 'mihan' ? (formState.mihanCompany || '') : (formState.ownerName || '')
      };
      
      await onSave(vehicleData);
      onClose();
    } catch (error: any) {
      alert(error.message || 'خطا در ذخیره خودرو');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-slate-800">
            {initialData ? 'ویرایش خودرو' : 'افزودن خودرو جدید'}
          </h2>
          <div className="flex items-center gap-3">
            {showSpecsButton && (
              <button
                type="button"
                onClick={() => setShowSpecsDialog(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 text-sm"
              >
                <span>⚙️</span>
                <span>مدیریت مشخصات خودرو</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">۱. انتخاب هلدینگ <span className="text-red-500">*</span></label>
              <select name="holdingCompany" value={formState.holdingCompany} onChange={handleFormChange} className="mt-1 input-style" required>
                <option value="">-- انتخاب کنید --</option>
                <option value="mihan">هلدینگ میهن</option>
                <option value="other">متفرقه</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">۲. نوع وسیله نقلیه <span className="text-red-500">*</span></label>
              <select name="vehicleCategory" value={formState.vehicleCategory} onChange={handleCategoryChange} className="mt-1 input-style" required>
                <option value="">-- انتخاب کنید --</option>
                {vehicleCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {formState.holdingCompany === 'mihan' && (
            <div>
              <label className="block text-sm font-medium text-slate-700">شرکت <span className="text-red-500">*</span></label>
              <select name="mihanCompany" value={formState.mihanCompany} onChange={handleFormChange} className="mt-1 input-style" required>
                <option value="">-- انتخاب کنید --</option>
                {mihanCompanies.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}

          <fieldset className="p-4 border border-slate-200 rounded-lg">
                <legend className="px-2 font-semibold text-slate-700">۳. شناسه و مدل خودرو</legend>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">نوع خودرو</label>
                    <input list="vehicle-type-list" name="vehicleType" value={formState.vehicleType} onChange={handleVehicleTypeChange} className="mt-1 input-style" placeholder="انتخاب یا تایپ کنید..." />
                    <datalist id="vehicle-type-list">
                      {apiVehicleTypes.map(vt => <option key={vt} value={vt} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">برند <span className="text-red-500">*</span></label>
                    <input list="brand-list" name="brand" value={formState.brand} onChange={handleBrandChange} className="mt-1 input-style" placeholder="انتخاب یا تایپ کنید..." required />
                    <datalist id="brand-list">
                      {(apiBrands.length > 0 ? apiBrands : brands).map(b => <option key={b} value={b} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">مدل اصلی <span className="text-red-500">*</span></label>
                    <input list="model-list" name="model" value={formState.model} onChange={handleModelChange} className="mt-1 input-style" placeholder="انتخاب یا تایپ کنید..." required />
                    <datalist id="model-list">
                      {(apiModels.length > 0 ? apiModels : models).map(m => <option key={m} value={m} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">تیپ خودرو</label>
                    <input list="submodel-list" name="vehicleTip" value={formState.vehicleTip} onChange={handleFormChange} className="mt-1 input-style" placeholder="انتخاب یا تایپ کنید..." />
                    <datalist id="submodel-list">
                      {(apiTips.length > 0 ? apiTips.map(t => t.tip).filter(Boolean) : subModels).map(sm => <option key={sm} value={sm} />)}
                    </datalist>
                  </div>
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-slate-700">شناسه اصلی</label>
                  <div className="flex items-center gap-4 mt-1">
                    <label><input type="radio" name="idType" checked={isPlate} onChange={() => setIsPlate(true)} /> پلاک</label>
                    <label><input type="radio" name="idType" checked={!isPlate} onChange={() => setIsPlate(false)} /> شماره بدنه/سریال</label>
                  </div>
                  {isPlate ? (
                    <div className="flex items-center gap-1 p-2 border rounded-lg bg-slate-50 mt-2">
                      <span className="font-mono text-slate-500 text-xs">ایران</span>
                      <input name="cityCode" value={plate.cityCode} onChange={handlePlateChange} placeholder="78" className="input-style w-10 text-center text-xs" maxLength={2} required={isPlate} />
                      <span className="font-bold text-xs">-</span>
                      <input name="part2" value={plate.part2} onChange={handlePlateChange} placeholder="956" className="input-style w-12 text-center text-xs" maxLength={3} required={isPlate} />
                      <select name="letter" value={plate.letter} onChange={handlePlateChange} className="input-style w-12 text-center text-xs">
                        {persianAlphabet.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                      <input name="part1" value={plate.part1} onChange={handlePlateChange} placeholder="24" className="input-style w-10 text-center text-xs" maxLength={2} required={isPlate} />
                    </div>
                  ) : (
                    <input name="serialNumber" value={serialNumber} onChange={e => setSerialNumber(e.target.value)} placeholder="شماره بدنه یا سریال دستگاه" className="input-style w-full mt-2" required={!isPlate} />
                  )}
                </div>
                
                {(formState.vehicleCategory === VehicleCategory.Heavy || formState.vehicleCategory === VehicleCategory.SemiTrailer) && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-slate-700">کد خودرو (سنگین/نیمه یدک)</label>
                    <input 
                      name="vehicleCode" 
                      value={vehicleCode} 
                      onChange={e => setVehicleCode(e.target.value)} 
                      placeholder="مثال: TRK-001, SEMI-002" 
                      className="input-style w-full mt-1" 
                    />
                    <div className="text-xs text-slate-500 mt-1">کد منحصر به فرد برای جستجو و تخصیص خودرو</div>
                  </div>
                )}
              </fieldset>
              
              <fieldset className="p-4 border border-slate-200 rounded-lg">
                <legend className="px-2 font-semibold text-slate-700">۴. مشخصات عمومی</legend>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">انتخاب شعبه <span className="text-red-500">*</span></label>
                    <select name="branchId" value={formState.branchId} onChange={handleFormChange} className="mt-1 input-style" required>
                      <option value="">-- انتخاب کنید --</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">رنگ</label>
                    <input name="color" value={formState.color} onChange={handleFormChange} list="color-list" className="mt-1 input-style" />
                    <datalist id="color-list">
                      {vehicleColors.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">وضعیت خودرو</label>
                    <select name="status" value={formState.status} onChange={handleFormChange} className="mt-1 input-style">
                      {Object.values(VehicleStatus).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </fieldset>
              
              <fieldset className="p-4 border border-slate-200 rounded-lg">
                <legend className="px-2 font-semibold text-slate-700">۵. مشخصات فنی و تکمیلی</legend>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">شماره VIN</label>
                    <input name="vin" value={formState.vin} onChange={handleFormChange} className="input-style" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">شماره شاسی</label>
                    <input name="chassisNumber" value={formState.chassisNumber} onChange={handleFormChange} className="input-style" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">شماره موتور</label>
                    <input name="engineNumber" value={formState.engineNumber} onChange={handleFormChange} className="input-style" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">سال ساخت</label>
                    <input name="year" type="number" value={formState.year} onChange={handleFormChange} className="input-style" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">نوع سوخت</label>
                    <select name="fuelType" value={formState.fuelType} onChange={handleFormChange} className="input-style">
                      <option value="">-- انتخاب کنید --</option>
                      {fuelTypes.map(ft => <option key={ft} value={ft}>{ft}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">تعداد سیلندر</label>
                    <input name="cylinderCount" type="number" value={formState.cylinderCount} onChange={handleFormChange} className="input-style" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">تعداد محور</label>
                    <input name="axleCount" type="number" value={formState.axleCount} onChange={handleFormChange} className="input-style" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">تعداد چرخ</label>
                    <input name="wheelCount" type="number" value={formState.wheelCount} onChange={handleFormChange} className="input-style" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">ظرفیت</label>
                    <input name="capacity" value={formState.capacity} onChange={handleFormChange} className="input-style" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">نوع کاربری</label>
                    <input name="usageType" value={formState.usageType} onChange={handleFormChange} className="input-style" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">نام حوزه</label>
                    <input name="domainName" value={formState.domainName} onChange={handleFormChange} className="input-style" />
                  </div>
                </div>
              </fieldset>
              
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  disabled={loading}
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  disabled={loading}
                >
                  {loading ? 'در حال ذخیره...' : (initialData ? 'ذخیره تغییرات' : 'ثبت خودرو')}
                </button>
              </div>
        </form>
        <style>{`.input-style { direction: ltr; text-align: right; display: block; width:100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; } .input-style:disabled { background-color: #f1f5f9; color: #64748b; }`}</style>
      </div>
      
      {/* دیالوگ مدیریت مشخصات خودرو */}
      {showSpecsButton && (
        <VehicleSpecsDialog 
          isOpen={showSpecsDialog} 
          onClose={() => setShowSpecsDialog(false)}
          onSelectSpec={handleSpecSelect}
        />
      )}
    </div>
  );
};

export default VehicleFormDialog;


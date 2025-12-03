/**
 * دیالوگ مدیریت مشخصات خودرو
 * برای تعریف برندها، مدل‌ها و مشخصات فنی خودروها
 */

import React, { useState, useEffect } from 'react';
import { getApiUrl } from '../utils/apiConfig';

// Types
interface VehicleSpec {
  id: string;
  vehicleCategory: string;
  brand: string;
  model: string;
  tip: string | null;
  fuelType: string | null;
  cylinderCount: number | null;
  axleCount: number | null;
  wheelCount: number | null;
  capacity: string | null;
  engineType: string | null;
  description: string | null;
  isActive: boolean;
}

interface VehicleSpecsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

// دسته‌بندی‌های پیش‌فرض
const vehicleCategories = [
  'خودرو سنگین',
  'خودرو نیمه سنگین',
  'سواری',
  'وانت',
  'نیمه یدک (تریلر)',
  'نیمه یدک (کفی و چادری)',
  'نیمه یدک (تانکر)'
];

const fuelTypes = ['بنزینی', 'گازوییلی', 'برقی', 'هیبریدی', 'گازی', 'دوگانه‌سوز'];

const VehicleSpecsDialog: React.FC<VehicleSpecsDialogProps> = ({ isOpen, onClose }) => {
  // States
  const [specs, setSpecs] = useState<VehicleSpec[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingSpec, setEditingSpec] = useState<VehicleSpec | null>(null);
  
  // Filter states
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterBrand, setFilterBrand] = useState<string>('');
  
  // Form states
  const [form, setForm] = useState({
    vehicleCategory: 'خودرو سنگین',
    brand: '',
    model: '',
    tip: '',
    fuelType: '',
    cylinderCount: '',
    axleCount: '',
    wheelCount: '',
    capacity: '',
    engineType: '',
    description: ''
  });
  
  // Fetch specs
  const fetchSpecs = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      let url = getApiUrl('vehicle-specs');
      const params = new URLSearchParams();
      if (filterCategory) params.append('category', filterCategory);
      if (filterBrand) params.append('brand', filterBrand);
      if (params.toString()) url += '?' + params.toString();
      
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) throw new Error('خطا در دریافت اطلاعات');
      const data = await res.json();
      setSpecs(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    if (isOpen) {
      fetchSpecs();
    }
  }, [isOpen, filterCategory, filterBrand]);
  
  // Reset form
  const resetForm = () => {
    setForm({
      vehicleCategory: 'خودرو سنگین',
      brand: '',
      model: '',
      tip: '',
      fuelType: '',
      cylinderCount: '',
      axleCount: '',
      wheelCount: '',
      capacity: '',
      engineType: '',
      description: ''
    });
    setEditingSpec(null);
    setShowForm(false);
  };
  
  // Handle edit
  const handleEdit = (spec: VehicleSpec) => {
    setEditingSpec(spec);
    setForm({
      vehicleCategory: spec.vehicleCategory,
      brand: spec.brand,
      model: spec.model,
      tip: spec.tip || '',
      fuelType: spec.fuelType || '',
      cylinderCount: spec.cylinderCount?.toString() || '',
      axleCount: spec.axleCount?.toString() || '',
      wheelCount: spec.wheelCount?.toString() || '',
      capacity: spec.capacity || '',
      engineType: spec.engineType || '',
      description: spec.description || ''
    });
    setShowForm(true);
  };
  
  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.brand || !form.model) {
      alert('برند و مدل الزامی است');
      return;
    }
    
    try {
      const token = localStorage.getItem('token');
      const method = editingSpec ? 'PUT' : 'POST';
      const url = editingSpec 
        ? getApiUrl(`vehicle-specs/${editingSpec.id}`)
        : getApiUrl('vehicle-specs');
      
      const body = {
        vehicleCategory: form.vehicleCategory,
        brand: form.brand.trim(),
        model: form.model.trim(),
        tip: form.tip.trim() || null,
        fuelType: form.fuelType || null,
        cylinderCount: form.cylinderCount ? parseInt(form.cylinderCount) : null,
        axleCount: form.axleCount ? parseInt(form.axleCount) : null,
        wheelCount: form.wheelCount ? parseInt(form.wheelCount) : null,
        capacity: form.capacity.trim() || null,
        engineType: form.engineType.trim() || null,
        description: form.description.trim() || null
      };
      
      const res = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'خطا در ذخیره');
      }
      
      alert(editingSpec ? 'مشخصات با موفقیت ویرایش شد' : 'مشخصات جدید با موفقیت ثبت شد');
      resetForm();
      fetchSpecs();
    } catch (err: any) {
      alert(err.message);
    }
  };
  
  // Handle delete
  const handleDelete = async (id: string) => {
    if (!confirm('آیا از حذف این مشخصات اطمینان دارید؟')) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(getApiUrl(`vehicle-specs/${id}`), {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) throw new Error('خطا در حذف');
      
      fetchSpecs();
    } catch (err: any) {
      alert(err.message);
    }
  };
  
  // Get unique brands from current specs
  const uniqueBrands = [...new Set(specs.map(s => s.brand))].sort();
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚛</span>
            <div>
              <h2 className="text-xl font-bold">مدیریت مشخصات خودرو</h2>
              <p className="text-sm text-blue-100">تعریف برندها، مدل‌ها و مشخصات فنی</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <span>➕</span>
              <span>افزودن مشخصات جدید</span>
            </button>
            
            <div className="flex-1" />
            
            {/* Filters */}
            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">همه دسته‌بندی‌ها</option>
              {vehicleCategories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            
            <select
              value={filterBrand}
              onChange={e => setFilterBrand(e.target.value)}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              <option value="">همه برندها</option>
              {uniqueBrands.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          
          {/* Form */}
          {showForm && (
            <div className="bg-gray-50 rounded-xl p-6 mb-6 border-2 border-blue-200">
              <h3 className="text-lg font-bold text-gray-700 mb-4 flex items-center gap-2">
                {editingSpec ? '✏️ ویرایش مشخصات' : '➕ افزودن مشخصات جدید'}
              </h3>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Row 1 */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">دسته‌بندی *</label>
                    <select
                      value={form.vehicleCategory}
                      onChange={e => setForm({...form, vehicleCategory: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    >
                      {vehicleCategories.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">برند *</label>
                    <input
                      type="text"
                      value={form.brand}
                      onChange={e => setForm({...form, brand: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="مثلاً: اسکانیا"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">مدل *</label>
                    <input
                      type="text"
                      value={form.model}
                      onChange={e => setForm({...form, model: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="مثلاً: سری G"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">تیپ</label>
                    <input
                      type="text"
                      value={form.tip}
                      onChange={e => setForm({...form, tip: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="مثلاً: G410"
                    />
                  </div>
                </div>
                
                {/* Row 2 - Technical specs */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">نوع سوخت</label>
                    <select
                      value={form.fuelType}
                      onChange={e => setForm({...form, fuelType: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-</option>
                      {fuelTypes.map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">تعداد سیلندر</label>
                    <select
                      value={form.cylinderCount}
                      onChange={e => setForm({...form, cylinderCount: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-</option>
                      {[3, 4, 6, 8, 10, 12].map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">تعداد محور</label>
                    <select
                      value={form.axleCount}
                      onChange={e => setForm({...form, axleCount: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-</option>
                      {[2, 3, 4, 5, 6].map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">تعداد چرخ</label>
                    <select
                      value={form.wheelCount}
                      onChange={e => setForm({...form, wheelCount: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-</option>
                      {[4, 6, 8, 10, 12, 14, 18, 22].map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ظرفیت</label>
                    <input
                      type="text"
                      value={form.capacity}
                      onChange={e => setForm({...form, capacity: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="مثلاً: 42 تن"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">نوع موتور</label>
                    <input
                      type="text"
                      value={form.engineType}
                      onChange={e => setForm({...form, engineType: e.target.value})}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="مثلاً: دیزل توربو"
                    />
                  </div>
                </div>
                
                {/* Row 3 - Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">توضیحات</label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={e => setForm({...form, description: e.target.value})}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="توضیحات تکمیلی..."
                  />
                </div>
                
                {/* Buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    {editingSpec ? 'ذخیره تغییرات' : 'ثبت مشخصات'}
                  </button>
                </div>
              </form>
            </div>
          )}
          
          {/* Table */}
          {loading ? (
            <div className="text-center py-10 text-gray-500">در حال بارگذاری...</div>
          ) : error ? (
            <div className="text-center py-10 text-red-500">{error}</div>
          ) : specs.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <p className="text-lg">هیچ مشخصاتی یافت نشد</p>
              <p className="text-sm mt-2">برای شروع، روی "افزودن مشخصات جدید" کلیک کنید</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-3 text-right font-medium text-gray-700">دسته‌بندی</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-700">برند</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-700">مدل</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-700">تیپ</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-700">سوخت</th>
                    <th className="px-3 py-3 text-center font-medium text-gray-700">سیلندر</th>
                    <th className="px-3 py-3 text-center font-medium text-gray-700">محور</th>
                    <th className="px-3 py-3 text-center font-medium text-gray-700">چرخ</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-700">ظرفیت</th>
                    <th className="px-3 py-3 text-center font-medium text-gray-700">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {specs.map(spec => (
                    <tr key={spec.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                          {spec.vehicleCategory}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-medium">{spec.brand}</td>
                      <td className="px-3 py-2">{spec.model}</td>
                      <td className="px-3 py-2">{spec.tip || '-'}</td>
                      <td className="px-3 py-2">{spec.fuelType || '-'}</td>
                      <td className="px-3 py-2 text-center">{spec.cylinderCount || '-'}</td>
                      <td className="px-3 py-2 text-center">{spec.axleCount || '-'}</td>
                      <td className="px-3 py-2 text-center">{spec.wheelCount || '-'}</td>
                      <td className="px-3 py-2">{spec.capacity || '-'}</td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => handleEdit(spec)}
                            className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                            title="ویرایش"
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => handleDelete(spec.id)}
                            className="p-1 text-red-600 hover:bg-red-100 rounded"
                            title="حذف"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Stats */}
          <div className="mt-4 text-sm text-gray-500 text-left">
            تعداد: {specs.length} مورد
          </div>
        </div>
      </div>
    </div>
  );
};

export default VehicleSpecsDialog;


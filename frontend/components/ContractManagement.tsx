import React, { useState, useMemo } from 'react';
import { Branch } from '../types';
import { UserGroupIcon } from './icons/UserGroupIcon'; // Re-using icon
import LocationAutocomplete from './LocationAutocomplete';
import CityAutocomplete from './CityAutocomplete';

interface BranchManagementProps {
    branches: Branch[];
    onAddBranch: (branch: Omit<Branch, 'id'>) => void;
    onUpdateBranch: (id: string, branch: Omit<Branch, 'id'>) => void;
    onDeleteBranch: (id: string) => void;
}

const BranchManagement: React.FC<BranchManagementProps> = ({ branches, onAddBranch, onUpdateBranch, onDeleteBranch }) => {
    const [formData, setFormData] = useState({ name: '', location: '' });
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingBranch) {
            onUpdateBranch(editingBranch.id, formData);
            setEditingBranch(null);
        } else {
            onAddBranch(formData);
        }
        setFormData({ name: '', location: '' });
    };

    const handleEdit = (branch: Branch) => {
        setEditingBranch(branch);
        setFormData({ name: branch.name, location: branch.location });
    };

    const handleCancel = () => {
        setEditingBranch(null);
        setFormData({ name: '', location: '' });
    };

    const handleDelete = async (id: string) => {
        if (window.confirm('آیا از حذف این شعبه اطمینان دارید؟')) {
            try {
                await onDeleteBranch(id);
            } catch (error: any) {
                console.error('Error deleting branch:', error);
                const errorMessage = error?.message || 'خطا در حذف شعبه';
                alert(errorMessage);
            }
        }
    };
    
    const filteredBranches = useMemo(() => {
        if (!searchTerm) return branches;
        return branches.filter(branch =>
            branch.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            branch.location.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [searchTerm, branches]);

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-xl font-bold text-slate-800 mb-4">
                    {editingBranch ? `ویرایش شعبه: ${editingBranch.name}` : 'افزودن شعبه جدید'}
                </h2>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <CityAutocomplete 
                        value={formData.name}
                        onChange={(value) => setFormData({...formData, name: value})}
                        placeholder="نام شعبه (شهر)"
                        className="input-style"
                        required
                    />
                    <LocationAutocomplete 
                        value={formData.location}
                        onChange={(value) => setFormData({...formData, location: value})}
                        placeholder="موقعیت مکانی"
                        className="input-style"
                        required
                    />
                    <div className="flex gap-2">
                        <button type="submit" className="px-4 py-2 rounded-md text-sm font-medium bg-sky-600 text-white hover:bg-sky-700 transition">
                            {editingBranch ? 'ذخیره تغییرات' : 'افزودن'}
                        </button>
                        {editingBranch && (
                            <button type="button" onClick={handleCancel} className="px-4 py-2 rounded-md text-sm font-medium bg-gray-500 text-white hover:bg-gray-600 transition">
                                انصراف
                            </button>
                        )}
                    </div>
                </form>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center">
                        <UserGroupIcon className="w-6 h-6 mr-2 text-slate-600" />
                        لیست شعبات
                    </h2>
                     <input
                        type="text"
                        placeholder="جستجو..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-right text-gray-500">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th className="px-6 py-3">نام شعبه</th>
                                <th className="px-6 py-3">موقعیت</th>
                                <th className="px-6 py-3">عملیات</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredBranches.map(branch => (
                                <tr key={branch.id} className="bg-white border-b hover:bg-gray-50">
                                    <th className="px-6 py-4 font-medium text-gray-900">{branch.name}</th>
                                    <td className="px-6 py-4">{branch.location}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex gap-2">
                                            <button 
                                                onClick={() => handleEdit(branch)}
                                                className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 transition"
                                            >
                                                ویرایش
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(branch.id)}
                                                className="px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 transition"
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
            </div>
            <style>{`.input-style { display: block; width:100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; }`}</style>
        </div>
    );
};

export default BranchManagement;

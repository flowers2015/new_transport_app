import React, { useState, useMemo } from 'react';
import { Branch } from '../types';
import { UserGroupIcon } from './icons/UserGroupIcon'; // Re-using icon

interface BranchManagementProps {
    branches: Branch[];
    onAddBranch: (branch: Omit<Branch, 'id'>) => void;
}

const BranchManagement: React.FC<BranchManagementProps> = ({ branches, onAddBranch }) => {
    const [formData, setFormData] = useState({ name: '', location: '' });
    const [searchTerm, setSearchTerm] = useState('');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onAddBranch(formData);
        setFormData({ name: '', location: '' });
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
                <h2 className="text-xl font-bold text-slate-800 mb-4">افزودن شعبه جدید</h2>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <input name="name" value={formData.name} onChange={handleChange} placeholder="نام شعبه" className="input-style md:col-span-1" required />
                    <input name="location" value={formData.location} onChange={handleChange} placeholder="موقعیت مکانی" className="input-style" required />
                    <button type="submit" className="px-5 py-2 rounded-md text-sm font-medium bg-sky-600 text-white hover:bg-sky-700 transition">افزودن</button>
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
                            </tr>
                        </thead>
                        <tbody>
                            {filteredBranches.map(branch => (
                                <tr key={branch.id} className="bg-white border-b hover:bg-gray-50">
                                    <th className="px-6 py-4 font-medium text-gray-900">{branch.name}</th>
                                    <td className="px-6 py-4">{branch.location}</td>
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

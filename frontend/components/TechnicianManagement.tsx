import React, { useState, useMemo } from 'react';
import { Technician } from '../types';
import { UserPlusIcon } from './icons/UserPlusIcon';
import { UserCircleIcon } from './icons/UserCircleIcon';

interface TechnicianManagementProps {
    technicians: Technician[];
    onAddTechnician: (technician: Omit<Technician, 'id' | 'skills'> & { skills: string }) => void;
}

const TechnicianManagement: React.FC<TechnicianManagementProps> = ({ technicians, onAddTechnician }) => {
    const [name, setName] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [skills, setSkills] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim() && skills.trim() && employeeId.trim()) {
            onAddTechnician({ name: name.trim(), employeeId: employeeId.trim(), skills: skills.trim() });
            setName('');
            setSkills('');
            setEmployeeId('');
        }
    };

    const filteredTechnicians = useMemo(() => {
        if (!searchTerm) return technicians;
        return technicians.filter(tech =>
            tech.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            tech.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
            tech.skills.some(skill => skill.toLowerCase().includes(searchTerm.toLowerCase()))
        );
    }, [searchTerm, technicians]);


    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
                    <UserPlusIcon className="w-6 h-6 mr-2 text-sky-600" />
                    افزودن تکنسین جدید
                </h2>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                         <label htmlFor="name" className="block text-sm font-medium text-slate-700">نام و نام خانوادگی</label>
                         <input type="text" id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: کامران صالحی" className="mt-1 block w-full input-style" required />
                    </div>
                    <div>
                         <label htmlFor="employeeId" className="block text-sm font-medium text-slate-700">کد پرسنلی</label>
                         <input type="text" id="employeeId" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="مثال: T-503" className="mt-1 block w-full input-style" required />
                    </div>
                     <div className="md:col-span-1">
                         <label htmlFor="skills" className="block text-sm font-medium text-slate-700">مهارت‌ها (جدا با کاما)</label>
                         <input type="text" id="skills" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="مثال: Engine, Electronics" className="mt-1 block w-full input-style" required />
                    </div>
                    <button type="submit" className="px-5 py-2 rounded-md text-sm font-medium bg-sky-600 text-white hover:bg-sky-700 transition whitespace-nowrap">
                        افزودن
                    </button>
                </form>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-800">لیست تکنسین‌ها</h2>
                    <input
                        type="text"
                        placeholder="جستجو..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-64 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                </div>
                <div className="space-y-3">
                    {filteredTechnicians.length > 0 ? filteredTechnicians.map(tech => (
                        <div key={tech.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                            <div className="flex items-center">
                                <UserCircleIcon className="w-8 h-8 text-slate-500"/>
                                <div className="mr-3">
                                    <span className="font-medium text-slate-700">{tech.name}</span>
                                    <span className="block text-xs text-slate-500 font-mono">{tech.employeeId}</span>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {tech.skills.map(skill => (
                                     <span key={skill} className="text-xs font-mono bg-slate-200 text-slate-600 px-2 py-1 rounded">
                                        {skill}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )) : <p className="text-slate-500 text-center py-4">هیچ تکنسینی یافت نشد.</p>}
                </div>
            </div>
            <style>{`.input-style { display: block; width:100%; padding: 0.5rem 0.75rem; background-color: white; border: 1px solid #cbd5e1; border-radius: 0.375rem; font-size: 0.875rem; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); } .input-style:focus { outline: none; border-color: #0ea5e9; box-shadow: 0 0 0 1px #0ea5e9; }`}</style>
        </div>
    );
};

export default TechnicianManagement;

import React, { useState, useMemo } from 'react';
import { AuditLog } from '../types';
import { formatJalaliDateTime } from '../utils/jalali';
// Fallback inline icon (since file not found)
const DocumentMagnifyingGlassIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75A2.25 2.25 0 0014.25 4.5h-6A2.25 2.25 0 006 6.75v10.5A2.25 2.25 0 008.25 19.5h6A2.25 2.25 0 0016.5 17.25V13.5m0 0l3 3m-3-3a2.25 2.25 0 110-4.5 2.25 2.25 0 010 4.5z" />
    </svg>
);

interface AuditTrailViewProps {
    auditLog?: AuditLog[];
}

const AuditTrailView: React.FC<AuditTrailViewProps> = ({ auditLog = [] }) => {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredLog = useMemo(() => {
        if (!auditLog || auditLog.length === 0) return [];
        if (!searchTerm) return auditLog;
        const lowercasedFilter = searchTerm.toLowerCase();
        return auditLog.filter(log =>
            (log.userName?.toLowerCase() || '').includes(lowercasedFilter) ||
            (log.action?.toLowerCase() || '').includes(lowercasedFilter) ||
            (log.details?.toLowerCase() || '').includes(lowercasedFilter)
        );
    }, [searchTerm, auditLog]);

    return (
        <div className="max-w-7xl mx-auto bg-white p-6 rounded-xl shadow-lg">
            <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                <h2 className="text-xl font-bold text-slate-800 flex items-center">
                    <DocumentMagnifyingGlassIcon className="w-6 h-6 mr-2 text-sky-600" />
                    تاریخچه کامل تراکنش‌ها (Audit Log)
                </h2>
                <input
                    type="text"
                    placeholder="جستجو در تاریخچه..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full md:w-72 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-right text-gray-500">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                        <tr>
                            <th className="px-6 py-3">زمان</th>
                            <th className="px-6 py-3">کاربر</th>
                            <th className="px-6 py-3">عملیات</th>
                            <th className="px-6 py-3">جزئیات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredLog.length > 0 ? filteredLog.map(log => (
                            <tr key={log.id} className="bg-white border-b hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-slate-600">{formatJalaliDateTime(log.timestamp)}</td>
                                <td className="px-6 py-4 font-medium text-gray-900">{log.userName}</td>
                                <td className="px-6 py-4 font-mono text-blue-600">{log.action}</td>
                                <td className="px-6 py-4">{log.details}</td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={4} className="text-center py-8 text-slate-500">هیچ تراکنشی یافت نشد.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// Removed duplicate inline icon to avoid duplicate declaration; using the imported icon component.

export default AuditTrailView;

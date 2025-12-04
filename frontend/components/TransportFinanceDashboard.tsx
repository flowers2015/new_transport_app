import React, { useState } from 'react';
import { User, View } from '../types';
import WorkflowRules from './WorkflowRules';
import { BookOpenIcon } from './icons/BookOpenIcon';

interface TransportFinanceDashboardProps {
    currentUser: User;
    data?: any;
    onNavigate?: (view: View) => void;
}

const TransportFinanceDashboard: React.FC<TransportFinanceDashboardProps> = ({ currentUser, data, onNavigate }) => {
    const [isRulesOpen, setIsRulesOpen] = useState(false);
    
    const handleNavigate = (view: View) => {
        if (onNavigate) {
            onNavigate(view);
        } else {
            // Fallback: استفاده از window.location یا state management
            window.location.hash = `#${view}`;
        }
    };

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-2xl font-bold text-slate-800">
                        داشبورد مالی ترابری
                    </h1>
                    <button onClick={() => setIsRulesOpen(true)} className="p-2 rounded-md hover:bg-slate-100" title="قوانین کارتابل">
                        <BookOpenIcon className="w-5 h-5 text-slate-600"/>
                    </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* کارت محاسبات اجرت پیمایش */}
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 border border-blue-200 hover:shadow-lg transition-shadow cursor-pointer"
                         onClick={() => handleNavigate(View.TransportFinanceCalculation)}>
                        <h2 className="text-xl font-bold text-blue-800 mb-4">
                            محاسبه هزینه تور
                        </h2>
                        <p className="text-slate-600 mb-4">
                            محاسبه و مدیریت اجرت پیمایش رانندگان بر اساس مسیر و مسافت
                        </p>
                        <button className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 transition-colors">
                            مشاهده و مدیریت
                        </button>
                    </div>

                    {/* کارت بخشنامه */}
                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-6 border border-purple-200 hover:shadow-lg transition-shadow cursor-pointer"
                         onClick={() => handleNavigate(View.AllowanceRegulation)}>
                        <h2 className="text-xl font-bold text-purple-800 mb-4">
                            بخشنامه
                        </h2>
                        <p className="text-slate-600 mb-4">
                            مدیریت بخشنامه‌های اجرت، هزینه غذا و اجرت راننده کمکی
                        </p>
                        <button className="px-4 py-2 bg-purple-600 text-white rounded-md text-sm hover:bg-purple-700 transition-colors">
                            مشاهده و مدیریت
                        </button>
                    </div>

                    {/* کارت محاسبه پورسانت ماهانه */}
                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-6 border border-orange-200 hover:shadow-lg transition-shadow cursor-pointer"
                         onClick={() => handleNavigate(View.MonthlyCommissionCalculation)}>
                        <h2 className="text-xl font-bold text-orange-800 mb-4">
                            محاسبه پورسانت ماهانه
                        </h2>
                        <p className="text-slate-600 mb-4">
                            جمع‌بندی پورسانت رانندگان بر اساس بازه زمانی (تاریخ صدور بارنامه)
                        </p>
                        <button className="px-4 py-2 bg-orange-600 text-white rounded-md text-sm hover:bg-orange-700 transition-colors">
                            مشاهده و محاسبه
                        </button>
                    </div>

                    {/* کارت لیست پرداخت */}
                    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6 border border-green-200">
                        <h2 className="text-xl font-bold text-green-800 mb-4">
                            لیست پرداخت
                        </h2>
                        <p className="text-slate-600 mb-4">
                            مدیریت و پیگیری لیست پرداخت‌های انجام شده و در انتظار پرداخت
                        </p>
                        <div className="text-sm text-slate-500">
                            در حال توسعه...
                        </div>
                    </div>
                </div>

                {/* اطلاعات کاربر */}
                <div className="mt-6 pt-6 border-t border-slate-200">
                    <p className="text-sm text-slate-500">
                        کاربر: <span className="font-semibold text-slate-700">{currentUser.name}</span>
                    </p>
                    <p className="text-sm text-slate-500">
                        نقش: <span className="font-semibold text-slate-700">{currentUser.role}</span>
                    </p>
                </div>
            </div>
            
            {/* Dialog برای قوانین */}
            {isRulesOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setIsRulesOpen(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-4" onClick={e => e.stopPropagation()}>
                        <WorkflowRules view={View.TransportFinance} userRole={currentUser.role} />
                        <button onClick={() => setIsRulesOpen(false)} className="mt-4 px-4 py-2 bg-slate-200 rounded-md text-sm">بستن</button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TransportFinanceDashboard;


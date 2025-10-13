import React from 'react';
import { View, UserRole } from '../types';
import { BookOpenIcon } from './icons/BookOpenIcon';

interface WorkflowRulesProps {
    view: View;
    userRole: UserRole;
}

const rules: Partial<Record<View, Partial<Record<UserRole, string[]>>>> = {
    [View.FreightPlanning]: {
        [UserRole.PlanningEmployee]: [
            "یک فیلد 'تاریخ بارگیری' برای هر اعلام بار مشخص کنید (برای بستنی پیش‌فرض فردا و برای سایرین امروز است).",
            "اعلام بارهای جدید را در وضعیت 'پیش‌نویس' ذخیره کنید.",
            "پس از تکمیل اطلاعات، اعلام بار را برای تایید مدیر ارسال کنید.",
            "اعلام بارهای تخصیص نیافته از روزهای قبل در تب 'بارهای مانده' قابل مشاهده است.",
            "از دکمه 'اعلام مجدد' برای وارد کردن بارهای مانده به چرخه کاری امروز استفاده کنید."
        ],
        [UserRole.PlanningManager]: [
            "اعلام بارهای 'در انتظار تایید' را بر اساس تاریخ بارگیری بررسی کرده و 'تایید' یا 'رد' کنید.",
            "در صورت رد کردن، حتما دلیل آن را در کادر مربوطه ذکر نمایید."
        ]
    },
    [View.TransportLive]: {
        [UserRole.Transportation_Personal_Vehicle_User]: [
            "کارتابل به طور پیش‌فرض بارهای با 'تاریخ بارگیری' امروز را نمایش می‌دهد.",
            "اعلام بارهای 'پاستوریزه' و 'لبنیات-فروتلند' را در این کارتابل تخصیص دهید.",
            "در صورت عدم امکان پوشش، بار را به 'ترابری شرکت' ارجاع دهید.",
            "بارهای بستنی ارجاعی از ترابری شرکت در این کارتابل قابل تخصیص است."
        ],
        [UserRole.TransportationUser]: [
            "کارتابل به طور پیش‌فرض بارهای با 'تاریخ بارگیری' امروز را نمایش می‌دهد.",
            "اعلام بارهای 'بستنی' را به رانندگان شرکت تخصیص دهید.",
            "در صورت عدم پوشش بار بستنی، آن را به 'ترابری شخصی' ارجاع دهید.",
            "بارهای پاستوریزه و لبنیات ارجاعی در این کارتابل قابل تخصیص است."
        ],
    },
    [View.FreightFinance]: {
        [UserRole.BranchFinance]: [
             "کارتابل به طور پیش‌فرض بارهای با 'تاریخ بارگیری' امروز را نمایش می‌دهد.",
             "پس از دریافت اسناد، تراکنش مالی مربوط به هر اعلام بار را ثبت کنید.",
             "در صورت پرداخت کامل، وضعیت را به 'پرداخت شده' تغییر دهید."
        ],
         [UserRole.CentralFinance]: [
             "تراکنش های ثبت شده توسط شعب را بر اساس تاریخ بارگیری بررسی و تایید نهایی کنید."
        ],
    }
};

const WorkflowRules: React.FC<WorkflowRulesProps> = ({ view, userRole }) => {
    const relevantRules = rules[view]?.[userRole];

    return (
        <div className="bg-amber-50 border-r-4 border-amber-400 p-4 rounded-lg my-4 print:hidden">
            <h4 className="font-bold text-amber-800 flex items-center gap-2">
                <BookOpenIcon className="w-5 h-5" />
                قوانین کارتابل
            </h4>
            {relevantRules && relevantRules.length > 0 ? (
                <ul className="list-disc list-inside text-sm text-amber-700 mt-2 space-y-1 pr-1">
                    {relevantRules.map((rule, index) => (
                        <li key={index}>{rule}</li>
                    ))}
                </ul>
            ) : (
                <p className="text-sm text-amber-700 mt-2">هیچ قانون مشخصی برای نقش شما در این صفحه تعریف نشده است.</p>
            )}
        </div>
    );
};

export default WorkflowRules;
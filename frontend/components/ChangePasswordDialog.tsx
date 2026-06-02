import React, { useState } from 'react';
import { getApiUrl } from '../utils/apiConfig';

export type ForcePasswordReason = 'must_change' | 'expired';

interface ChangePasswordDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    /** اجبار تغییر رمز — بدون انصراف و بستن با کلیک بیرون */
    forced?: boolean;
    forceReason?: ForcePasswordReason;
}

const FORCE_MESSAGES: Record<ForcePasswordReason, { title: string; hint: string }> = {
    must_change: {
        title: 'تغییر رمز عبور الزامی است',
        hint: 'رمز عبور شما توسط مدیر سیستم تنظیم شده است. لطفاً یک رمز شخصی جدید انتخاب کنید.',
    },
    expired: {
        title: 'رمز عبور منقضی شده است',
        hint: 'رمز عبور شما بیش از ۹۰ روز تغییر نکرده است. برای ادامه، رمز جدید انتخاب کنید.',
    },
};

const ChangePasswordDialog: React.FC<ChangePasswordDialogProps> = ({
    isOpen,
    onClose,
    onSuccess,
    forced = false,
    forceReason = 'must_change',
}) => {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // اعتبارسنجی
        if (!currentPassword || !newPassword || !confirmPassword) {
            setError('لطفاً تمام فیلدها را پر کنید');
            return;
        }

        if (newPassword.length < 6) {
            setError('رمز عبور جدید باید حداقل 6 کاراکتر باشد');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('رمز عبور جدید و تأیید آن مطابقت ندارند');
            return;
        }

        if (currentPassword === newPassword) {
            setError('رمز عبور جدید باید با رمز عبور فعلی متفاوت باشد');
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(getApiUrl('auth/change-password'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    currentPassword,
                    newPassword,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'خطا در تغییر رمز عبور');
            }

            alert('رمز عبور با موفقیت تغییر یافت');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setError('');
            if (!forced) {
                onClose();
            }
            if (onSuccess) {
                onSuccess();
            } else if (forced) {
                onClose();
            }
        } catch (err: any) {
            setError(err.message || 'خطا در تغییر رمز عبور');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const forceCopy = forced ? FORCE_MESSAGES[forceReason] : null;

    return (
        <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]"
            onClick={forced ? undefined : onClose}
            role="presentation"
        >
            <div
                className="bg-white rounded-lg p-6 w-full max-w-md"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-xl font-bold mb-2">
                    {forceCopy?.title ?? 'تغییر رمز عبور'}
                </h2>
                {forceCopy && (
                    <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-3 mb-4">
                        {forceCopy.hint}
                    </p>
                )}
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">رمز عبور فعلی</label>
                        <div className="relative">
                            <input
                                type={showCurrentPassword ? 'text' : 'password'}
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                className="w-full px-3 py-2 border rounded pr-10"
                                required
                                autoComplete="current-password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                            >
                                {showCurrentPassword ? (
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                    </svg>
                                ) : (
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">رمز عبور جدید</label>
                        <div className="relative">
                            <input
                                type={showNewPassword ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full px-3 py-2 border rounded pr-10"
                                required
                                minLength={6}
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowNewPassword(!showNewPassword)}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                            >
                                {showNewPassword ? (
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                    </svg>
                                ) : (
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                )}
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">حداقل 6 کاراکتر</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">تأیید رمز عبور جدید</label>
                        <div className="relative">
                            <input
                                type={showConfirmPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full px-3 py-2 border rounded pr-10"
                                required
                                minLength={6}
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                            >
                                {showConfirmPassword ? (
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                    </svg>
                                ) : (
                                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <div className={`flex gap-2 mt-6 ${forced ? 'justify-stretch' : 'justify-end'}`}>
                        {!forced && (
                        <button
                            type="button"
                            onClick={() => {
                                setCurrentPassword('');
                                setNewPassword('');
                                setConfirmPassword('');
                                setError('');
                                onClose();
                            }}
                            className="px-4 py-2 border rounded"
                            disabled={loading}
                        >
                            انصراف
                        </button>
                        )}
                        <button
                            type="submit"
                            className={`px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 ${forced ? 'flex-1' : ''}`}
                            disabled={loading}
                        >
                            {loading ? 'در حال تغییر...' : forced ? 'ذخیره و ادامه' : 'تغییر رمز عبور'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ChangePasswordDialog;


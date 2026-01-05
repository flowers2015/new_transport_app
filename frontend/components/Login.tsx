import React, { useState } from 'react';
import { User } from '../types';
import { WrenchScrewdriverIcon } from './icons/WrenchScrewdriverIcon';
import { getApiUrl } from '../utils/apiConfig';

interface LoginProps {
    onLogin: (user: User, token: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
    const [accountLocked, setAccountLocked] = useState(false);
    const [lockedUntil, setLockedUntil] = useState<Date | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const response = await fetch(getApiUrl('auth/login'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                // بررسی قفل بودن حساب
                if (response.status === 423) {
                    setAccountLocked(true);
                    if (data.lockedUntil) {
                        setLockedUntil(new Date(data.lockedUntil));
                    }
                    setError(data.message || 'حساب کاربری شما قفل شده است.');
                } else if (data.remainingAttempts !== undefined) {
                    setRemainingAttempts(data.remainingAttempts);
                    setError(data.message || 'نام کاربری یا رمز عبور اشتباه است.');
                } else {
                    setError(data.message || 'نام کاربری یا رمز عبور اشتباه است.');
                }
                return;
            }

            // ریست کردن state های خطا
            setRemainingAttempts(null);
            setAccountLocked(false);
            setLockedUntil(null);

            // Assuming the backend returns a token and user info
            // You might need to adjust this based on the actual API response
            if (data.token && data.user) {
                // بررسی انقضای رمز عبور
                if (data.passwordExpired) {
                    // نمایش هشدار اما اجازه ورود
                    alert('⚠️ رمز عبور شما منقضی شده است. لطفاً در اسرع وقت رمز خود را تغییر دهید.');
                } else if (data.passwordExpiresIn !== null && data.passwordExpiresIn <= 7) {
                    // هشدار 7 روز قبل از انقضا
                    alert(`⚠️ رمز عبور شما در ${Math.ceil(data.passwordExpiresIn)} روز دیگر منقضی می‌شود. لطفاً رمز خود را تغییر دهید.`);
                }
                onLogin(data.user, data.token);
            } else {
                 // If the backend only returns a token, you might need to decode it
                 // or make another request to get user data.
                 // For now, we'll assume the backend is updated to send both.
                 setError('پاسخ ورود نامعتبر از سرور.');
            }
        } catch (err: any) {
            setError(err.message);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen" style={{ 
            fontFamily: 'Vazirmatn, sans-serif',
            background: 'linear-gradient(to bottom right, #f8fafc, #e2e8f0)'
        }}>
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl" style={{
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                border: '1px solid #e2e8f0'
            }}>
                <div className="flex flex-col items-center">
                    <div className="mb-4 p-3 bg-sky-50 rounded-full flex items-center justify-center" style={{ width: '80px', height: '80px' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '48px', height: '48px', color: '#0284c7' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.474-4.474c-.048-.58-.087-1.193-.14-1.743A4.5 4.5 0 0012.45 3.75c-.58.052-1.163.09-1.743.14a4.5 4.5 0 00-4.474 4.474c.048.58.087 1.193.14 1.743" />
                        </svg>
                    </div>
                    <h2 className="mt-2 text-2xl font-bold text-center text-slate-800">ورود به سامانه مدیریت ناوگان</h2>
                </div>
                <form className="space-y-6" onSubmit={handleSubmit}>
                    <div>
                        <label htmlFor="username" className="block text-sm font-medium text-slate-700">نام کاربری</label>
                        <input
                            id="username"
                            name="username"
                            type="text"
                            required
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                            placeholder="مثال: workshop"
                            autoComplete="username"
                        />
                    </div>
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-slate-700">رمز عبور</label>
                        <div className="mt-1 relative">
                            <input
                                id="password"
                                name="password"
                                type={showPassword ? 'text' : 'password'}
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="block w-full px-3 py-2 pr-10 bg-white border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                                placeholder="●●●●●●●●"
                                autoComplete="current-password"
                                disabled={accountLocked}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                                disabled={accountLocked}
                            >
                                {showPassword ? (
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
                    {error && (
                        <div className="text-sm text-red-600 text-center">
                            <p>{error}</p>
                            {remainingAttempts !== null && remainingAttempts > 0 && (
                                <p className="mt-1 text-orange-600">تعداد تلاش‌های باقی‌مانده: {remainingAttempts}</p>
                            )}
                            {accountLocked && lockedUntil && (
                                <p className="mt-1 text-orange-600">
                                    حساب کاربری تا {new Date(lockedUntil).toLocaleTimeString('fa-IR')} قفل است.
                                </p>
                            )}
                        </div>
                    )}
                    <div>
                        <button
                            type="submit"
                            disabled={accountLocked}
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 disabled:bg-slate-400 disabled:cursor-not-allowed"
                        >
                            {accountLocked ? 'حساب کاربری قفل است' : 'ورود'}
                        </button>
                    </div>
                </form>
                <div className="text-center text-xs text-slate-400">
                    <p>Enter your credentials to log in.</p>
                </div>
                <div className="text-center mt-4">
                    <button
                        type="button"
                        onClick={() => {
                            // TODO: پیاده‌سازی فراموشی رمز عبور
                            alert('قابلیت فراموشی رمز عبور به زودی اضافه خواهد شد.');
                        }}
                        className="text-sm text-sky-600 hover:text-sky-800 hover:underline"
                    >
                        رمز عبور را فراموش کرده‌ام
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Login;
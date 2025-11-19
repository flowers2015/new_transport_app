import React, { useState } from 'react';
import { User } from '../types';
import { WrenchScrewdriverIcon } from './icons/WrenchScrewdriverIcon';

interface LoginProps {
    onLogin: (user: User, token: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            const response = await fetch('http://localhost:3000/api/v1/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'نام کاربری یا رمز عبور اشتباه است.');
            }

            // Assuming the backend returns a token and user info
            // You might need to adjust this based on the actual API response
            if (data.token && data.user) {
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
                        <input
                            id="password"
                            name="password"
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                            placeholder="●●●●●●●●"
                            autoComplete="current-password"
                        />
                    </div>
                    {error && <p className="text-sm text-red-600 text-center">{error}</p>}
                    <div>
                        <button
                            type="submit"
                            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-sky-600 hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500"
                        >
                            ورود
                        </button>
                    </div>
                </form>
                <div className="text-center text-xs text-slate-400">
                    <p>Enter your credentials to log in.</p>
                </div>
            </div>
        </div>
    );
};

export default Login;
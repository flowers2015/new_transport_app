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
        <div className="flex items-center justify-center min-h-screen bg-slate-100">
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-lg">
                <div className="flex flex-col items-center">
                    <WrenchScrewdriverIcon className="h-12 w-12 text-sky-600" />
                    <h2 className="mt-4 text-2xl font-bold text-center text-slate-800">ورود به سامانه مدیریت ناوگان</h2>
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
                        />
                    </div>
                    <div>
                        <label htmlFor="password"className="block text-sm font-medium text-slate-700">رمز عبور</label>
                        <input
                            id="password"
                            name="password"
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-sky-500 focus:border-sky-500"
                            placeholder="●●●●●●●●"
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
import React, { useState } from 'react';
import { User } from '../types';
import ViewerTransportLiveShell from './ViewerTransportLiveShell';
import ViewerFreightHistoryShell from './ViewerFreightHistoryShell';

type ViewerTab = 'live' | 'archive';

interface Props {
    currentUser: User;
    onLogout: () => void;
}

const ViewerPortal: React.FC<Props> = ({ currentUser, onLogout }) => {
    const [tab, setTab] = useState<ViewerTab>('live');

    return (
        <div className="min-h-screen flex flex-col">
            <header className="bg-slate-800 text-white shadow-md">
                <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span className="font-bold text-lg">مشاهده اعلام بار</span>
                        <span className="text-xs bg-amber-500/90 text-amber-950 px-2 py-0.5 rounded-full">
                            فقط مشاهده
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setTab('live')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                                tab === 'live'
                                    ? 'bg-sky-500 text-white'
                                    : 'bg-slate-700 hover:bg-slate-600'
                            }`}
                        >
                            پیگیری زنده
                        </button>
                        <button
                            type="button"
                            onClick={() => setTab('archive')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                                tab === 'archive'
                                    ? 'bg-violet-500 text-white'
                                    : 'bg-slate-700 hover:bg-slate-600'
                            }`}
                        >
                            آرشیو
                        </button>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                        <span className="text-slate-300">
                            {currentUser.name || currentUser.username}
                            <span className="text-slate-400 mr-1">(بیننده)</span>
                        </span>
                        <button
                            type="button"
                            onClick={onLogout}
                            className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-sm"
                        >
                            خروج
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 w-full max-w-[100%] mx-auto p-2 sm:p-4 md:p-6 overflow-x-auto">
                {tab === 'live' ? (
                    <ViewerTransportLiveShell currentUser={currentUser} />
                ) : (
                    <ViewerFreightHistoryShell currentUser={currentUser} />
                )}
            </main>
        </div>
    );
};

export default ViewerPortal;

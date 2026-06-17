import React from 'react';
import { User } from '../types';
import TransportLiveContainer from '../components/TransportLiveContainer';

/** پوسته بیننده — همان ویوی پیگیری زنده؛ نقش Viewer عملیات را غیرفعال می‌کند */
const ViewerTransportLiveShell: React.FC<{ currentUser: User }> = ({ currentUser }) => (
    <div className="viewer-freight-live">
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            حالت بیننده — فقط مشاهده (همان صفحه پیگیری اعلام بار زنده)
        </p>
        <TransportLiveContainer currentUser={currentUser} />
    </div>
);

export default ViewerTransportLiveShell;

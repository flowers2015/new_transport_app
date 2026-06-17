import React from 'react';
import { User } from '../types';
import FreightHistoryContainer from '../components/FreightHistoryContainer';

/** پوسته بیننده — همان جدول آرشیو ترابری، بدون تغییر کامپوننت اصلی */
const ViewerFreightHistoryShell: React.FC<{ currentUser: User }> = ({ currentUser }) => (
    <div className="viewer-freight-archive">
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            حالت بیننده — فقط مشاهده (همان جدول آرشیو اعلام بار ترابری)
        </p>
        <FreightHistoryContainer currentUser={currentUser} />
    </div>
);

export default ViewerFreightHistoryShell;

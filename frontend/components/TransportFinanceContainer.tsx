import React, { useState } from 'react';
import { User, View } from '../types';
import TransportFinanceDashboard from './TransportFinanceDashboard';
import TransportFinanceCalculation from './TransportFinanceCalculation';
import MonthlyCommissionCalculation from './MonthlyCommissionCalculation';
import AllowanceRegulationManagement from './AllowanceRegulationManagement';
import TransportFinancePaymentList from './TransportFinancePaymentList';
import TransportFinancePaidInvoices from './TransportFinancePaidInvoices';
import DebugDriverCalculations from './DebugDriverCalculations';

interface TransportFinanceContainerProps {
    currentUser: User;
    currentView?: View;
    onNavigate?: (view: View) => void;
}

const TransportFinanceContainer: React.FC<TransportFinanceContainerProps> = ({ currentUser, currentView, onNavigate }) => {
    // اگر view مشخص شده، آن را نمایش بده
    if (currentView === View.TransportFinanceCalculation) {
        return <TransportFinanceCalculation currentUser={currentUser} />;
    }

    if (currentView === View.MonthlyCommissionCalculation) {
        return <MonthlyCommissionCalculation currentUser={currentUser} />;
    }

    if (currentView === View.AllowanceRegulation) {
        return <AllowanceRegulationManagement currentUser={currentUser} />;
    }

    if (currentView === View.TransportFinancePaymentList) {
        return <TransportFinancePaymentList currentUser={currentUser} />;
    }

    if (currentView === View.TransportFinancePaidInvoices) {
        return <TransportFinancePaidInvoices currentUser={currentUser} />;
    }

    if (currentView === View.DebugDriverCalculations) {
        return <DebugDriverCalculations />;
    }

    // در غیر این صورت داشبورد اصلی را نمایش بده
    return (
        <TransportFinanceDashboard
            currentUser={currentUser}
            data={{}}
            onNavigate={onNavigate || ((view) => {
                // Fallback: استفاده از window.location
                window.location.hash = `#${view}`;
            })}
        />
    );
};

export default TransportFinanceContainer;


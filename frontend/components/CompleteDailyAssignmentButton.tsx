import React, { useState } from 'react';
import { FreightLineType } from '../types';
import { CheckCircleIcon } from './icons/CheckCircleIcon';

interface CompleteDailyAssignmentButtonProps {
  lineType: FreightLineType;
  onComplete: (lineType: FreightLineType) => Promise<void>;
  disabled?: boolean;
  className?: string;
}

const CompleteDailyAssignmentButton: React.FC<CompleteDailyAssignmentButtonProps> = ({
  lineType,
  onComplete,
  disabled = false,
  className = ''
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    if (isLoading || disabled) return;

    const confirmed = window.confirm(
      `آیا از اتمام تخصیص روزانه برای ${lineType} اطمینان دارید؟\n\n` +
      `این عمل باعث می‌شود:\n` +
      `• بارهای تخصیص یافته به تاریخچه منتقل شوند\n` +
      `• بارهای بدون تخصیص به کاربر اصلی برگردانده شوند`
    );

    if (!confirmed) return;

    setIsLoading(true);
    try {
      await onComplete(lineType);
    } catch (error) {
      console.error('Failed to complete daily assignment:', error);
      alert('خطا در اتمام تخصیص روزانه. لطفاً دوباره تلاش کنید.');
    } finally {
      setIsLoading(false);
    }
  };

  const getLineTypeLabel = (lineType: FreightLineType): string => {
    switch (lineType) {
      case FreightLineType.IceCream:
        return 'بستنی';
      case FreightLineType.Pasteurized:
        return 'پاستوریزه';
      case FreightLineType.Dairy:
        return 'لبنیات';
      default:
        return lineType;
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isLoading}
      className={`
        flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm
        transition-all duration-200
        ${disabled || isLoading
          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
          : 'bg-green-600 hover:bg-green-700 text-white hover:shadow-md'
        }
        ${className}
      `}
    >
      <CheckCircleIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
      {isLoading ? 'در حال پردازش...' : `اتمام تخصیص ${getLineTypeLabel(lineType)}`}
    </button>
  );
};

export default CompleteDailyAssignmentButton;

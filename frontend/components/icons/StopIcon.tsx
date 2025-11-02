import React from 'react';

interface StopIconProps {
  className?: string;
}

export const StopIcon: React.FC<StopIconProps> = ({ className = "w-6 h-6" }) => {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 10h6v4H9z"
      />
    </svg>
  );
};

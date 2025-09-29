
import React from 'react';
import { InformationCircleIcon, CheckCircleIcon, ExclamationTriangleIcon } from './Icons';

interface AlertProps {
  type: 'success' | 'error' | 'info';
  title: string;
  children: React.ReactNode;
}

const Alert: React.FC<AlertProps> = ({ type, title, children }) => {
  const baseClasses = "border-l-4 p-4 rounded-md";
  const typeClasses = {
    success: {
      container: "bg-green-900/50 border-green-500 text-green-200",
      icon: <CheckCircleIcon className="h-6 w-6 text-green-400" />,
    },
    error: {
      container: "bg-red-900/50 border-red-500 text-red-200",
      icon: <ExclamationTriangleIcon className="h-6 w-6 text-red-400" />,
    },
    info: {
      container: "bg-blue-900/50 border-blue-500 text-blue-200",
      icon: <InformationCircleIcon className="h-6 w-6 text-blue-400" />,
    },
  };

  const selectedType = typeClasses[type];

  return (
    <div className={`${baseClasses} ${selectedType.container}`} role="alert">
      <div className="flex">
        <div className="flex-shrink-0">
          {selectedType.icon}
        </div>
        <div className="ml-3">
          <h3 className="text-lg font-bold">{title}</h3>
          <div className="mt-2 text-sm">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Alert;

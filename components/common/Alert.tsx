
import React from 'react';
import { InformationCircleIcon, CheckCircleIcon, ExclamationTriangleIcon } from './Icons';

interface AlertProps {
  type: 'success' | 'error' | 'info';
  title: string;
  children: React.ReactNode;
}

const Alert: React.FC<AlertProps> = ({ type, title, children }) => {
  const baseClasses = "p-4 rounded-lg border";
  const typeClasses = {
    success: {
      container: "bg-emerald-50 border-emerald-300 text-emerald-800",
      icon: <CheckCircleIcon className="h-6 w-6 text-emerald-600" />,
    },
    error: {
      container: "bg-rose-50 border-rose-300 text-rose-800",
      icon: <ExclamationTriangleIcon className="h-6 w-6 text-rose-600" />,
    },
    info: {
      container: "bg-sky-50 border-sky-300 text-sky-800",
      icon: <InformationCircleIcon className="h-6 w-6 text-sky-600" />,
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
          <h3 className="text-base font-semibold">{title}</h3>
          <div className="mt-1 text-sm">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Alert;

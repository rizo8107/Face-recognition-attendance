
import React from 'react';
import { InformationCircleIcon, CheckCircleIcon, ExclamationTriangleIcon } from './Icons';

interface AlertProps {
  type: 'success' | 'error' | 'info';
  title: string;
  children: React.ReactNode;
}

const Alert: React.FC<AlertProps> = ({ type, title, children }) => {
  const typeClasses = {
    success: {
      container: "bg-white border-l-4 border-l-emerald-500 rounded-xl shadow-md",
      header: "text-emerald-700",
      content: "text-slate-600",
      iconContainer: "bg-emerald-100 rounded-full p-2",
      icon: <CheckCircleIcon className="h-5 w-5 text-emerald-600" />,
    },
    error: {
      container: "bg-white border-l-4 border-l-rose-500 rounded-xl shadow-md",
      header: "text-rose-700",
      content: "text-slate-600",
      iconContainer: "bg-rose-100 rounded-full p-2",
      icon: <ExclamationTriangleIcon className="h-5 w-5 text-rose-600" />,
    },
    info: {
      container: "bg-white border-l-4 border-l-[#0A3172] rounded-xl shadow-md",
      header: "text-[#0A3172]",
      content: "text-slate-600",
      iconContainer: "bg-blue-100 rounded-full p-2",
      icon: <InformationCircleIcon className="h-5 w-5 text-[#0A3172]" />,
    },
  };

  const selectedType = typeClasses[type];

  return (
    <div className={`${selectedType.container} overflow-hidden`} role="alert">
      <div className="p-5">
        <div className="flex items-center mb-3">
          <div className={`${selectedType.iconContainer} mr-3`}>
            {selectedType.icon}
          </div>
          <h3 className={`text-lg font-semibold ${selectedType.header}`}>{title}</h3>
        </div>
        
        <div className={`text-sm pl-12 ${selectedType.content}`}>
          {children}
        </div>
      </div>
    </div>
  );
};

export default Alert;

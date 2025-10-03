
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
}

const Button: React.FC<ButtonProps> = ({ children, className, variant = 'primary', ...props }) => {
  const baseClasses = "inline-flex items-center justify-center px-5 py-2.5 text-base font-medium rounded-xl shadow-sm focus:outline-none transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";

  const variantClasses = {
    primary: "bg-[#0A3172] hover:bg-[#072658] text-white border-0 hover:shadow-md",
    secondary: "bg-gray-100 hover:bg-gray-200 text-gray-700 border-0",
    danger: "bg-red-500 hover:bg-red-600 text-white border-0 hover:shadow-md",
  };

  return (
    <button
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;

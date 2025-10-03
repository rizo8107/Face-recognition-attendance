
import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
}

const Spinner: React.FC<SpinnerProps> = ({ size = 'md' }) => {
  const sizeClasses = {
    sm: 'h-8 w-8',
    md: 'h-12 w-12',
    lg: 'h-16 w-16',
  };
  
  return (
    <div className="relative">
      {/* Circular spinner with navy blue color */}
      <div className={`${sizeClasses[size]} border-4 rounded-full border-blue-100`}></div>
      <div className={`${sizeClasses[size]} border-4 border-t-[#0A3172] border-r-[#0A3172] border-b-[#0A3172]/30 border-l-[#0A3172]/30 rounded-full animate-spin absolute top-0 left-0`}></div>
    </div>
  );
};

export default Spinner;

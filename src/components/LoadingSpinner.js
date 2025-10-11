import React from 'react';
import { Loader2 } from 'lucide-react';

const LoadingSpinner = ({ message = "Loading...", size = "default" }) => {
  const sizeClasses = {
    small: "w-4 h-4",
    default: "w-6 h-6", 
    large: "w-8 h-8"
  };

  return (
    <div className="flex flex-col items-center justify-center p-8">
      <Loader2 className={`${sizeClasses[size]} animate-spin text-blue-600`} />
      <p className="mt-2 text-sm text-gray-600">{message}</p>
    </div>
  );
};

export default LoadingSpinner;

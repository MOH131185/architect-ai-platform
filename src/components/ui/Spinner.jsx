import React from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { Loader2 } from 'lucide-react';

const Spinner = ({
  size = 'md',
  color = 'primary',
  className = '',
  ...props
}) => {
  const sizeClasses = {
    xs: 'w-3 h-3',
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  };
  
  const colorClasses = {
    primary: 'text-royal-500',
    white: 'text-white',
    gray: 'text-gray-400',
    success: 'text-green-500',
    error: 'text-red-500',
  };
  
  return (
    <motion.div
      className={`inline-block ${className}`}
      animate={{ rotate: 360 }}
      transition={{
        duration: 1,
        repeat: Infinity,
        ease: 'linear',
      }}
      {...props}
    >
      <Loader2 className={`${sizeClasses[size]} ${colorClasses[color]}`} />
    </motion.div>
  );
};

Spinner.propTypes = {
  size: PropTypes.oneOf(['xs', 'sm', 'md', 'lg', 'xl']),
  color: PropTypes.oneOf(['primary', 'white', 'gray', 'success', 'error']),
  className: PropTypes.string,
};

export default Spinner;


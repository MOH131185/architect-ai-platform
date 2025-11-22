import React from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { scaleOnHover } from '../../styles/animations.js';

const IconWrapper = ({
  children,
  size = 'md',
  variant = 'default',
  glow = false,
  className = '',
  ...props
}) => {
  const sizeClasses = {
    sm: 'w-10 h-10 text-base',
    md: 'w-14 h-14 text-xl',
    lg: 'w-20 h-20 text-3xl',
    xl: 'w-28 h-28 text-5xl',
  };
  
  const variantClasses = {
    default: 'bg-royal-600/10 text-royal-400',
    primary: 'bg-royal-600 text-white',
    secondary: 'bg-navy-800 text-royal-400 border border-navy-700',
    glass: 'bg-white/5 backdrop-blur-md text-royal-400 border border-white/10',
    gradient: 'bg-gradient-to-br from-royal-600 to-royal-400 text-white',
  };
  
  const glowClass = glow ? 'shadow-glow' : '';
  
  const combinedClasses = `rounded-xl flex items-center justify-center ${sizeClasses[size]} ${variantClasses[variant]} ${glowClass} ${className}`;
  
  return (
    <motion.div
      className={combinedClasses}
      variants={scaleOnHover}
      initial="initial"
      whileHover="hover"
      whileTap="tap"
      {...props}
    >
      {children}
    </motion.div>
  );
};

IconWrapper.propTypes = {
  children: PropTypes.node.isRequired,
  size: PropTypes.oneOf(['sm', 'md', 'lg', 'xl']),
  variant: PropTypes.oneOf(['default', 'primary', 'secondary', 'glass', 'gradient']),
  glow: PropTypes.bool,
  className: PropTypes.string,
};

export default IconWrapper;


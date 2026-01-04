import React, { forwardRef } from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { scaleOnHover, glowOnHover } from '../../styles/animations.js';

const Button = forwardRef(({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  loading = false,
  icon = null,
  iconPosition = 'left',
  className = '',
  onClick,
  type = 'button',
  ...props
}, ref) => {
  const baseClasses = 'inline-flex items-center justify-center font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-navy-950 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variantClasses = {
    primary: 'bg-gradient-to-r from-royal-600 to-royal-500 text-white hover:from-royal-500 hover:to-royal-400 focus:ring-royal-500 shadow-lg hover:shadow-glow',
    secondary: 'bg-navy-800 text-white hover:bg-navy-700 focus:ring-navy-600 border border-navy-700 hover:border-royal-600',
    outline: 'bg-transparent text-royal-400 border-2 border-royal-600 hover:bg-royal-600 hover:text-white focus:ring-royal-500',
    ghost: 'bg-transparent text-white hover:bg-navy-800 focus:ring-navy-600',
    gradient: 'relative bg-navy-950 text-white hover:shadow-glow-large focus:ring-royal-500',
    glass: 'bg-white/5 backdrop-blur-md text-white border border-white/10 hover:bg-white/10 focus:ring-royal-500',
  };
  
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm rounded-lg',
    md: 'px-6 py-3 text-base rounded-xl',
    lg: 'px-8 py-4 text-lg rounded-2xl',
    xl: 'px-10 py-5 text-xl rounded-2xl',
  };
  
  const widthClass = fullWidth ? 'w-full' : '';
  
  const combinedClasses = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${widthClass} ${className}`;
  
  const iconElement = icon && (
    <span className={iconPosition === 'right' ? 'ml-2' : 'mr-2'}>
      {icon}
    </span>
  );
  
  const content = (
    <>
      {variant === 'gradient' && (
        <span className="absolute inset-0 rounded-inherit bg-gradient-to-r from-royal-600 via-royal-500 to-royal-400 opacity-0 hover:opacity-100 transition-opacity duration-300" />
      )}
      {variant === 'gradient' && (
        <span className="absolute inset-0 rounded-inherit p-[2px] bg-gradient-to-r from-royal-600 via-royal-500 to-royal-400">
          <span className="flex h-full w-full items-center justify-center rounded-inherit bg-navy-950" />
        </span>
      )}
      <span className="relative z-10 flex items-center justify-center">
        {loading ? (
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        ) : (
          <>
            {iconPosition === 'left' && iconElement}
            {children}
            {iconPosition === 'right' && iconElement}
          </>
        )}
      </span>
    </>
  );
  
  return (
    <motion.button
      ref={ref}
      type={type}
      className={combinedClasses}
      disabled={disabled || loading}
      onClick={onClick}
      variants={variant === 'primary' || variant === 'gradient' ? glowOnHover : scaleOnHover}
      initial="initial"
      whileHover={!disabled && !loading ? "hover" : undefined}
      whileTap={!disabled && !loading ? "tap" : undefined}
      {...props}
    >
      {content}
    </motion.button>
  );
});

Button.displayName = 'Button';

Button.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['primary', 'secondary', 'outline', 'ghost', 'gradient', 'glass']),
  size: PropTypes.oneOf(['sm', 'md', 'lg', 'xl']),
  fullWidth: PropTypes.bool,
  disabled: PropTypes.bool,
  loading: PropTypes.bool,
  icon: PropTypes.node,
  iconPosition: PropTypes.oneOf(['left', 'right']),
  className: PropTypes.string,
  onClick: PropTypes.func,
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
};

export default Button;


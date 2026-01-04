import React, { forwardRef, useState } from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';

const Input = forwardRef(({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  onBlur,
  onFocus,
  error,
  helperText,
  disabled = false,
  required = false,
  icon = null,
  iconPosition = 'left',
  fullWidth = false,
  className = '',
  inputClassName = '',
  style,
  ...props
}, ref) => {
  const [isFocused, setIsFocused] = useState(false);
  const [hasValue, setHasValue] = useState(!!value);
  
  const handleFocus = (e) => {
    setIsFocused(true);
    if (onFocus) onFocus(e);
  };
  
  const handleBlur = (e) => {
    setIsFocused(false);
    if (onBlur) onBlur(e);
  };
  
  const handleChange = (e) => {
    setHasValue(!!e.target.value);
    if (onChange) onChange(e);
  };
  
  const containerClasses = `relative ${fullWidth ? 'w-full' : ''}`;
  
  const inputBaseClasses = 'w-full px-4 py-3 bg-slate-900 border rounded-xl text-white placeholder-gray-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-navy-950 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const inputBorderClasses = error
    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
    : isFocused
    ? 'border-royal-500 focus:border-royal-500 focus:ring-royal-500'
    : 'border-navy-700 hover:border-navy-600';
  
  const inputPaddingClasses = icon
    ? iconPosition === 'left'
      ? 'pl-12'
      : 'pr-12'
    : '';
  
  const labelClasses = `absolute left-4 transition-all duration-200 pointer-events-none ${
    isFocused || hasValue
      ? 'top-1 text-xs text-royal-400'
      : 'top-1/2 -translate-y-1/2 text-base text-gray-500'
  }`;
  
  return (
    <div className={`${containerClasses} ${className}`}>
      <div className="relative">
        {icon && (
          <div className={`absolute ${iconPosition === 'left' ? 'left-4' : 'right-4'} top-1/2 -translate-y-1/2 text-gray-500`}>
            {icon}
          </div>
        )}
        
        <motion.input
          ref={ref}
          type={type}
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          required={required}
          placeholder={!label ? placeholder : ''}
          className={`${inputBaseClasses} ${inputBorderClasses} ${inputPaddingClasses} ${inputClassName} ${label ? 'pt-6 pb-2' : ''}`}
          style={{ color: '#FFFFFF', ...(style || {}) }}
          initial={false}
          animate={{
            boxShadow: isFocused
              ? '0 0 0 3px rgba(37, 99, 235, 0.1)'
              : '0 0 0 0px rgba(37, 99, 235, 0)',
          }}
          transition={{ duration: 0.2 }}
          {...props}
        />
        
        {label && (
          <label className={labelClasses}>
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}
      </div>
      
      {(error || helperText) && (
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`mt-2 text-sm ${error ? 'text-red-400' : 'text-gray-400'}`}
        >
          {error || helperText}
        </motion.p>
      )}
    </div>
  );
});

Input.displayName = 'Input';

Input.propTypes = {
  label: PropTypes.string,
  type: PropTypes.string,
  placeholder: PropTypes.string,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onChange: PropTypes.func,
  onBlur: PropTypes.func,
  onFocus: PropTypes.func,
  error: PropTypes.string,
  helperText: PropTypes.string,
  disabled: PropTypes.bool,
  required: PropTypes.bool,
  icon: PropTypes.node,
  iconPosition: PropTypes.oneOf(['left', 'right']),
  fullWidth: PropTypes.bool,
  className: PropTypes.string,
  inputClassName: PropTypes.string,
};

export default Input;


import React from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { gradientBorder } from '../../styles/animations.js';

const GradientBorderBox = ({
  children,
  animated = true,
  borderWidth = 2,
  rounded = 'xl',
  className = '',
  contentClassName = '',
  ...props
}) => {
  const roundedClasses = {
    none: 'rounded-none',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    '2xl': 'rounded-2xl',
    '3xl': 'rounded-3xl',
    full: 'rounded-full',
  };
  
  const borderPadding = `p-[${borderWidth}px]`;
  
  return (
    <motion.div
      className={`relative ${roundedClasses[rounded]} bg-gradient-to-r from-royal-600 via-royal-500 to-royal-400 ${borderPadding} ${className}`}
      style={{
        backgroundSize: animated ? '300% 300%' : '100% 100%',
      }}
      variants={animated ? gradientBorder : undefined}
      animate={animated ? "animate" : undefined}
      {...props}
    >
      <div className={`w-full h-full bg-navy-950 ${roundedClasses[rounded]} ${contentClassName}`}>
        {children}
      </div>
    </motion.div>
  );
};

GradientBorderBox.propTypes = {
  children: PropTypes.node.isRequired,
  animated: PropTypes.bool,
  borderWidth: PropTypes.number,
  rounded: PropTypes.oneOf(['none', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'full']),
  className: PropTypes.string,
  contentClassName: PropTypes.string,
};

export default GradientBorderBox;


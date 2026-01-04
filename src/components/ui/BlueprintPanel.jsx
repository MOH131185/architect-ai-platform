import React from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { fadeInUp } from '../../styles/animations.js';

const BlueprintPanel = ({
  children,
  title,
  subtitle,
  padding = 'md',
  showGrid = true,
  className = '',
  contentClassName = '',
  ...props
}) => {
  const paddingClasses = {
    none: 'p-0',
    sm: 'p-4',
    md: 'p-6',
    lg: 'p-8',
    xl: 'p-12',
  };
  
  return (
    <motion.div
      className={`relative rounded-2xl overflow-hidden ${className}`}
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      {...props}
    >
      {/* Blueprint Grid Background */}
      {showGrid && (
        <div className="absolute inset-0 blueprint-grid opacity-50" />
      )}
      
      {/* Content Container */}
      <div className={`relative z-10 ${paddingClasses[padding]}`}>
        {(title || subtitle) && (
          <div className="mb-6">
            {title && (
              <h3 className="text-2xl font-bold text-white mb-2 font-heading">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-gray-400">
                {subtitle}
              </p>
            )}
          </div>
        )}
        
        <div className={contentClassName}>
          {children}
        </div>
      </div>
      
      {/* Corner Accents (architectural style) */}
      <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-royal-600 opacity-50" />
      <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-royal-600 opacity-50" />
      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-royal-600 opacity-50" />
      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-royal-600 opacity-50" />
    </motion.div>
  );
};

BlueprintPanel.propTypes = {
  children: PropTypes.node.isRequired,
  title: PropTypes.string,
  subtitle: PropTypes.string,
  padding: PropTypes.oneOf(['none', 'sm', 'md', 'lg', 'xl']),
  showGrid: PropTypes.bool,
  className: PropTypes.string,
  contentClassName: PropTypes.string,
};

export default BlueprintPanel;


import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PropTypes from 'prop-types';
import { pageTransition } from '../../styles/animations.js';

const PageTransition = ({
  children,
  pageKey,
  background = 'default',
  className = '',
}) => {
  const backgroundClasses = {
    default: 'bg-navy-950',
    gradient: 'bg-gradient-to-br from-navy-950 via-navy-900 to-navy-950',
    blueprint: 'blueprint-grid',
    architectural: 'architectural-lines',
  };
  
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pageKey}
        className={`min-h-screen ${backgroundClasses[background]} ${className}`}
        variants={pageTransition}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};

PageTransition.propTypes = {
  children: PropTypes.node.isRequired,
  pageKey: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  background: PropTypes.oneOf(['default', 'gradient', 'blueprint', 'architectural']),
  className: PropTypes.string,
};

export default PageTransition;


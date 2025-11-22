/**
 * Step Container Component
 * 
 * Wraps wizard steps with consistent layout, animations, and background
 */

import React from 'react';
import { motion } from 'framer-motion';
import { pageTransition, fadeInUp } from '../../styles/animations.js';
import AnimatedBackground from './AnimatedBackground.jsx';

const StepContainer = ({
  children,
  backgroundVariant = 'default',
  enableParallax = true,
  parallaxIntensity = 0.5,
  maxWidth = '6xl',
  padding = 'default',
  showBackground = true,
}) => {
  const maxWidthClasses = {
    '4xl': 'max-w-4xl',
    '5xl': 'max-w-5xl',
    '6xl': 'max-w-6xl',
    '7xl': 'max-w-7xl',
    'full': 'max-w-full',
  };
  
  const paddingClasses = {
    none: '',
    sm: 'px-4 py-4',
    default: 'px-4 py-8',
    lg: 'px-6 py-12',
  };
  
  return (
    <div className="relative min-h-screen">
      {/* Animated Background */}
      {showBackground && (
        <AnimatedBackground
          variant={backgroundVariant}
          enableParallax={enableParallax}
          intensity={parallaxIntensity}
        />
      )}
      
      {/* Content Container */}
      <motion.div
        className={`relative z-10 ${maxWidthClasses[maxWidth] || maxWidthClasses['6xl']} mx-auto ${paddingClasses[padding] || paddingClasses.default}`}
        variants={pageTransition}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        <motion.div
          variants={fadeInUp}
          initial="initial"
          animate="animate"
        >
          {children}
        </motion.div>
      </motion.div>
    </div>
  );
};

export default StepContainer;


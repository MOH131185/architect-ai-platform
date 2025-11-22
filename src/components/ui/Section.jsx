import React from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { fadeInUp } from '../../styles/animations.js';

const Section = ({
  children,
  background = 'default',
  pattern = null,
  noise = false,
  padding = 'lg',
  fullHeight = false,
  className = '',
  containerClassName = '',
  id,
  ...props
}) => {
  const baseClasses = 'relative w-full';
  
  const backgroundClasses = {
    default: 'bg-navy-950',
    dark: 'bg-navy-900',
    darker: 'bg-black',
    gradient: 'bg-gradient-to-b from-navy-950 via-navy-900 to-navy-950',
    gradientHorizontal: 'bg-gradient-to-r from-navy-950 via-navy-900 to-navy-950',
    royal: 'bg-gradient-to-br from-navy-950 to-royal-600',
    blueprint: 'blueprint-grid',
    architectural: 'architectural-lines',
    transparent: 'bg-transparent',
  };
  
  const paddingClasses = {
    none: 'py-0',
    sm: 'py-8',
    md: 'py-16',
    lg: 'py-24',
    xl: 'py-32',
    '2xl': 'py-48',
  };
  
  const heightClass = fullHeight ? 'min-h-screen' : '';
  
  const noiseClass = noise ? 'noise-layer' : '';
  
  const patternClass = pattern ? pattern : '';
  
  const combinedClasses = `${baseClasses} ${backgroundClasses[background]} ${paddingClasses[padding]} ${heightClass} ${noiseClass} ${patternClass} ${className}`;
  
  return (
    <motion.section
      id={id}
      className={combinedClasses}
      variants={fadeInUp}
      initial="initial"
      whileInView="animate"
      viewport={{ once: true, margin: "-100px" }}
      {...props}
    >
      <div className={`container mx-auto px-4 ${containerClassName}`}>
        {children}
      </div>
    </motion.section>
  );
};

Section.propTypes = {
  children: PropTypes.node.isRequired,
  background: PropTypes.oneOf([
    'default',
    'dark',
    'darker',
    'gradient',
    'gradientHorizontal',
    'royal',
    'blueprint',
    'architectural',
    'transparent',
  ]),
  pattern: PropTypes.string,
  noise: PropTypes.bool,
  padding: PropTypes.oneOf(['none', 'sm', 'md', 'lg', 'xl', '2xl']),
  fullHeight: PropTypes.bool,
  className: PropTypes.string,
  containerClassName: PropTypes.string,
  id: PropTypes.string,
};

export default Section;


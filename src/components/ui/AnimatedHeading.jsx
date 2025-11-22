import React from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { staggerChildren, fadeInUp } from '../../styles/animations.js';

const AnimatedHeading = ({
  children,
  level = 'h2',
  gradient = false,
  glow = false,
  stagger = false,
  className = '',
  ...props
}) => {
  const Tag = level;
  
  const baseClasses = 'font-heading font-bold';
  const gradientClass = gradient ? 'text-gradient' : 'text-white';
  const glowClass = glow ? 'text-glow' : '';
  
  const combinedClasses = `${baseClasses} ${gradientClass} ${glowClass} ${className}`;
  
  if (stagger && typeof children === 'string') {
    const words = children.split(' ');
    
    return (
      <Tag className={combinedClasses} {...props}>
        <motion.span
          variants={staggerChildren}
          initial="initial"
          animate="animate"
          className="inline-block"
        >
          {words.map((word, i) => (
            <motion.span
              key={i}
              variants={fadeInUp}
              className="inline-block mr-2"
            >
              {word}
            </motion.span>
          ))}
        </motion.span>
      </Tag>
    );
  }
  
  return (
    <motion.div
      variants={fadeInUp}
      initial="initial"
      animate="animate"
    >
      <Tag className={combinedClasses} {...props}>
        {children}
      </Tag>
    </motion.div>
  );
};

AnimatedHeading.propTypes = {
  children: PropTypes.node.isRequired,
  level: PropTypes.oneOf(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']),
  gradient: PropTypes.bool,
  glow: PropTypes.bool,
  stagger: PropTypes.bool,
  className: PropTypes.string,
};

export default AnimatedHeading;


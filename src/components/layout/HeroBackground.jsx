import React from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import AnimatedBackground from '../ui/AnimatedBackground.jsx';
import NoiseLayer from '../ui/NoiseLayer.jsx';

const HeroBackground = ({
  children,
  images = [],
  animation = 'zoomIn',
  showParallax = true,
  className = '',
}) => {
  return (
    <div className={`relative min-h-screen overflow-hidden ${className}`}>
      {/* Main Animated Background */}
      <AnimatedBackground
        images={images}
        animation={animation}
        overlay="gradient"
        className="absolute inset-0"
      >
        {/* Parallax Layers */}
        {showParallax && (
          <>
            <motion.div
              className="absolute inset-0 opacity-20"
              animate={{
                y: [0, -30, 0],
              }}
              transition={{
                duration: 20,
                ease: 'linear',
                repeat: Infinity,
              }}
            >
              <div className="absolute inset-0 blueprint-grid" />
            </motion.div>
            
            <motion.div
              className="absolute inset-0 opacity-10"
              animate={{
                y: [0, 20, 0],
              }}
              transition={{
                duration: 15,
                ease: 'linear',
                repeat: Infinity,
              }}
            >
              <div className="absolute inset-0 architectural-lines" />
            </motion.div>
          </>
        )}
      </AnimatedBackground>
      
      {/* Noise Layer */}
      <NoiseLayer variant="subtle" animated />
      
      {/* Radial Fade Overlay */}
      <div className="absolute inset-0 bg-radial-gradient from-transparent via-navy-950/50 to-navy-950" />
      
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
      
      {/* Bottom Fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-navy-950 to-transparent pointer-events-none" />
    </div>
  );
};

HeroBackground.propTypes = {
  children: PropTypes.node.isRequired,
  images: PropTypes.arrayOf(PropTypes.string),
  animation: PropTypes.oneOf(['zoomIn', 'zoomOut', 'none']),
  showParallax: PropTypes.bool,
  className: PropTypes.string,
};

export default HeroBackground;


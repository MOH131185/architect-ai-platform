import React from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { zoomInBackground, zoomOutBackground } from '../../styles/animations.js';

const AnimatedBackground = ({
  children,
  image,
  images = [],
  animation = 'zoomIn',
  overlay = 'gradient',
  className = '',
  ...props
}) => {
  const overlayClasses = {
    none: '',
    gradient: 'bg-gradient-to-br from-navy-950/95 via-navy-900/80 to-royal-600/30',
    dark: 'bg-navy-950/90',
    darker: 'bg-black/80',
    light: 'bg-navy-950/50',
    radial: 'bg-radial-gradient from-transparent via-navy-950/80 to-navy-950',
  };
  
  const animationVariants = {
    zoomIn: zoomInBackground,
    zoomOut: zoomOutBackground,
    none: {},
  };
  
  // Handle single image or multiple images
  const backgroundImages = image ? [image] : images;
  const hasImages = backgroundImages.length > 0;
  
  return (
    <div className={`relative overflow-hidden ${className}`} {...props}>
      {/* Background Layer */}
      {hasImages ? (
        <div className="absolute inset-0">
          {backgroundImages.map((img, index) => (
            <motion.div
              key={index}
              className="absolute inset-0 bg-cover bg-center bg-no-repeat"
              style={{
                backgroundImage: `url(${img})`,
                zIndex: backgroundImages.length - index,
              }}
              variants={animationVariants[animation]}
              initial="initial"
              animate="animate"
            />
          ))}
        </div>
      ) : (
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-navy-950 via-navy-900 to-royal-600"
          variants={animationVariants[animation]}
          initial="initial"
          animate="animate"
        />
      )}
      
      {/* Overlay */}
      {overlay !== 'none' && (
        <div className={`absolute inset-0 ${overlayClasses[overlay]}`} />
      )}
      
      {/* Noise Texture */}
      <div className="absolute inset-0 noise-layer opacity-30" />
      
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};

AnimatedBackground.propTypes = {
  children: PropTypes.node.isRequired,
  image: PropTypes.string,
  images: PropTypes.arrayOf(PropTypes.string),
  animation: PropTypes.oneOf(['zoomIn', 'zoomOut', 'none']),
  overlay: PropTypes.oneOf(['none', 'gradient', 'dark', 'darker', 'light', 'radial']),
  className: PropTypes.string,
};

export default AnimatedBackground;


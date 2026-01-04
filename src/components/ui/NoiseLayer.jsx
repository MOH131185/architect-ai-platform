import React from 'react';
import PropTypes from 'prop-types';

const NoiseLayer = ({
  variant = 'default',
  opacity = 0.03,
  animated = false,
  className = '',
  ...props
}) => {
  const variantClasses = {
    default: 'noise-layer',
    light: 'noise-light',
    dark: 'noise-dark',
    subtle: 'noise-subtle',
    strong: 'noise-strong',
    film: 'film-grain',
  };
  
  const animatedClass = animated ? 'noise-animated' : '';
  
  return (
    <div
      className={`absolute inset-0 pointer-events-none ${variantClasses[variant]} ${animatedClass} ${className}`}
      style={{ opacity }}
      {...props}
    />
  );
};

NoiseLayer.propTypes = {
  variant: PropTypes.oneOf(['default', 'light', 'dark', 'subtle', 'strong', 'film']),
  opacity: PropTypes.number,
  animated: PropTypes.bool,
  className: PropTypes.string,
};

export default NoiseLayer;


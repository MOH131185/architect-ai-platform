import React from 'react';

/**
 * GlassCard - Liquid glass morphism card component
 * @param {Object} props
 * @param {React.ReactNode} props.children - Card content
 * @param {string} props.className - Additional CSS classes
 * @param {string} props.variant - 'base' | 'strong'
 * @param {boolean} props.hoverable - Enable hover effects
 * @param {Function} props.onClick - Click handler
 */
export const GlassCard = ({ 
  children, 
  className = '', 
  variant = 'base',
  hoverable = true,
  onClick,
  ...props 
}) => {
  const baseClasses = variant === 'strong' 
    ? 'liquid-glass-strong' 
    : 'liquid-glass-card';
  
  const hoverClass = hoverable ? 'cursor-pointer' : '';
  
  return (
    <div
      className={`${baseClasses} ${hoverClass} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
};

export default GlassCard;


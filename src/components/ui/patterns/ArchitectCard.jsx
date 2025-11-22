import React from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility to merge Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Feature card with architectural styling
 * Used for landing page features and step highlights
 */
const ArchitectCard = ({
  className,
  icon,
  title,
  description,
  onClick,
  active = false,
  disabled = false,
  badge,
  ...props
}) => {
  return (
    <motion.div
      className={cn(
        'relative p-6 bg-white border rounded-xl transition-all duration-300 cursor-pointer group',
        active
          ? 'border-brand-500 shadow-brand-sm ring-2 ring-brand-500/20'
          : 'border-gray-200 shadow-soft hover:shadow-soft-lg hover:border-gray-300',
        disabled && 'opacity-50 cursor-not-allowed pointer-events-none',
        className
      )}
      onClick={disabled ? undefined : onClick}
      whileHover={disabled ? undefined : { y: -4 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      {...props}
    >
      {/* Badge */}
      {badge && (
        <div className="absolute -top-2 -right-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-500 text-white">
            {badge}
          </span>
        </div>
      )}

      {/* Icon */}
      {icon && (
        <div
          className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors',
            active
              ? 'bg-brand-500 text-white'
              : 'bg-brand-50 text-brand-500 group-hover:bg-brand-100'
          )}
        >
          {icon}
        </div>
      )}

      {/* Content */}
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 leading-relaxed">{description}</p>

      {/* Active indicator */}
      {active && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2">
          <div className="w-2 h-2 rounded-full bg-brand-500" />
        </div>
      )}
    </motion.div>
  );
};

/**
 * Compact feature item for lists
 */
const FeatureItem = ({
  className,
  icon,
  title,
  description,
  ...props
}) => {
  return (
    <div
      className={cn('flex items-start gap-4', className)}
      {...props}
    >
      {icon && (
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-brand-50 text-brand-500 flex items-center justify-center">
          {icon}
        </div>
      )}
      <div>
        <h4 className="font-medium text-gray-900">{title}</h4>
        {description && (
          <p className="text-sm text-gray-500 mt-1">{description}</p>
        )}
      </div>
    </div>
  );
};

/**
 * Stats card for metrics display
 */
const StatsCard = ({
  className,
  value,
  label,
  icon,
  trend,
  ...props
}) => {
  return (
    <div
      className={cn(
        'p-6 bg-white border border-gray-200 rounded-xl shadow-soft',
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between mb-2">
        {icon && (
          <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-500 flex items-center justify-center">
            {icon}
          </div>
        )}
        {trend && (
          <span
            className={cn(
              'text-xs font-medium px-2 py-0.5 rounded-full',
              trend > 0
                ? 'bg-success-50 text-success-700'
                : trend < 0
                ? 'bg-error-50 text-error-700'
                : 'bg-gray-100 text-gray-600'
            )}
          >
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  );
};

export { ArchitectCard, FeatureItem, StatsCard };
export default ArchitectCard;

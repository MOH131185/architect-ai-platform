import React from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility to merge Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Step indicator for wizard progress
 */
const StepIndicator = ({
  className,
  steps,
  currentStep,
  onStepClick,
  orientation = 'horizontal',
  showLabels = true,
  size = 'md',
  ...props
}) => {
  const sizes = {
    sm: {
      circle: 'w-6 h-6 text-xs',
      line: orientation === 'horizontal' ? 'h-0.5' : 'w-0.5',
      gap: orientation === 'horizontal' ? 'gap-2' : 'gap-3',
    },
    md: {
      circle: 'w-8 h-8 text-sm',
      line: orientation === 'horizontal' ? 'h-0.5' : 'w-0.5',
      gap: orientation === 'horizontal' ? 'gap-3' : 'gap-4',
    },
    lg: {
      circle: 'w-10 h-10 text-base',
      line: orientation === 'horizontal' ? 'h-1' : 'w-1',
      gap: orientation === 'horizontal' ? 'gap-4' : 'gap-5',
    },
  };

  const sizeConfig = sizes[size];

  return (
    <div
      className={cn(
        'flex',
        orientation === 'horizontal'
          ? 'flex-row items-center justify-center'
          : 'flex-col items-start',
        sizeConfig.gap,
        className
      )}
      {...props}
    >
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isActive = index === currentStep;
        const isClickable = onStepClick && (isCompleted || isActive);

        return (
          <React.Fragment key={index}>
            {/* Step */}
            <div
              className={cn(
                'flex items-center',
                orientation === 'horizontal' ? 'flex-col' : 'flex-row',
                sizeConfig.gap
              )}
            >
              {/* Circle */}
              <motion.button
                className={cn(
                  'relative flex items-center justify-center rounded-full font-medium transition-all duration-300',
                  sizeConfig.circle,
                  isCompleted
                    ? 'bg-brand-500 text-white'
                    : isActive
                    ? 'bg-brand-500 text-white ring-4 ring-brand-100'
                    : 'bg-gray-100 text-gray-400',
                  isClickable && 'cursor-pointer hover:ring-4 hover:ring-brand-100'
                )}
                onClick={() => isClickable && onStepClick(index)}
                whileHover={isClickable ? { scale: 1.1 } : undefined}
                whileTap={isClickable ? { scale: 0.95 } : undefined}
                disabled={!isClickable}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </motion.button>

              {/* Label */}
              {showLabels && step.label && (
                <span
                  className={cn(
                    'text-xs font-medium whitespace-nowrap',
                    isActive || isCompleted
                      ? 'text-gray-900'
                      : 'text-gray-400'
                  )}
                >
                  {step.label}
                </span>
              )}
            </div>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'relative flex-1',
                  orientation === 'horizontal'
                    ? `${sizeConfig.line} min-w-[2rem]`
                    : `${sizeConfig.line} min-h-[1rem] ml-4`
                )}
              >
                <div
                  className={cn(
                    'absolute bg-gray-200 rounded-full',
                    orientation === 'horizontal'
                      ? 'inset-x-0 top-1/2 -translate-y-1/2 h-full'
                      : 'inset-y-0 left-1/2 -translate-x-1/2 w-full'
                  )}
                />
                <motion.div
                  className={cn(
                    'absolute bg-brand-500 rounded-full',
                    orientation === 'horizontal'
                      ? 'top-1/2 -translate-y-1/2 h-full left-0'
                      : 'left-1/2 -translate-x-1/2 w-full top-0'
                  )}
                  initial={false}
                  animate={{
                    [orientation === 'horizontal' ? 'width' : 'height']:
                      index < currentStep ? '100%' : '0%',
                  }}
                  transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

/**
 * Simple progress dots for minimal step indication
 */
const ProgressDots = ({
  className,
  total,
  current,
  onDotClick,
  ...props
}) => {
  return (
    <div
      className={cn('flex items-center gap-2', className)}
      {...props}
    >
      {Array.from({ length: total }).map((_, index) => (
        <motion.button
          key={index}
          className={cn(
            'w-2 h-2 rounded-full transition-all duration-300',
            index === current
              ? 'bg-brand-500 w-6'
              : index < current
              ? 'bg-brand-300'
              : 'bg-gray-300',
            onDotClick && 'cursor-pointer hover:bg-brand-400'
          )}
          onClick={() => onDotClick?.(index)}
          whileHover={onDotClick ? { scale: 1.2 } : undefined}
          disabled={!onDotClick}
        />
      ))}
    </div>
  );
};

/**
 * Percentage progress bar
 */
const ProgressBar = ({
  className,
  value,
  max = 100,
  showLabel = false,
  size = 'md',
  ...props
}) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const heights = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  return (
    <div className={cn('w-full', className)} {...props}>
      <div
        className={cn(
          'w-full bg-gray-100 rounded-full overflow-hidden',
          heights[size]
        )}
      >
        <motion.div
          className="h-full bg-brand-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        />
      </div>
      {showLabel && (
        <div className="mt-1 text-xs text-gray-500 text-right">
          {Math.round(percentage)}%
        </div>
      )}
    </div>
  );
};

export { StepIndicator, ProgressDots, ProgressBar };
export default StepIndicator;

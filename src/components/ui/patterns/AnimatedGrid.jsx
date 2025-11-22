import React from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility to merge Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Animated topography/grid background pattern
 * Adds architectural identity with subtle animated lines
 */
const AnimatedGrid = ({
  className,
  variant = 'topography',
  opacity = 0.5,
  animate = true,
  ...props
}) => {
  // SVG patterns for different variants
  const patterns = {
    topography: (
      <svg
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="topography-pattern"
            x="0"
            y="0"
            width="100"
            height="100"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M0 50 Q25 25, 50 50 T100 50"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              opacity="0.3"
            />
            <path
              d="M0 70 Q25 45, 50 70 T100 70"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              opacity="0.2"
            />
            <path
              d="M0 30 Q25 55, 50 30 T100 30"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              opacity="0.2"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#topography-pattern)" />
      </svg>
    ),
    grid: (
      <svg
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="grid-pattern"
            x="0"
            y="0"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              opacity="0.2"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-pattern)" />
      </svg>
    ),
    dots: (
      <svg
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="dots-pattern"
            x="0"
            y="0"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <circle
              cx="10"
              cy="10"
              r="1"
              fill="currentColor"
              opacity="0.3"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dots-pattern)" />
      </svg>
    ),
    blueprint: (
      <svg
        className="absolute inset-0 w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern
            id="blueprint-pattern"
            x="0"
            y="0"
            width="80"
            height="80"
            patternUnits="userSpaceOnUse"
          >
            {/* Main grid */}
            <path
              d="M 80 0 L 0 0 0 80"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              opacity="0.15"
            />
            {/* Sub grid */}
            <path
              d="M 20 0 L 20 80 M 40 0 L 40 80 M 60 0 L 60 80"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.25"
              opacity="0.1"
            />
            <path
              d="M 0 20 L 80 20 M 0 40 L 80 40 M 0 60 L 80 60"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.25"
              opacity="0.1"
            />
            {/* Center marks */}
            <circle
              cx="40"
              cy="40"
              r="1"
              fill="currentColor"
              opacity="0.2"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#blueprint-pattern)" />
      </svg>
    ),
  };

  const content = (
    <div
      className={cn(
        'absolute inset-0 pointer-events-none text-gray-400',
        className
      )}
      style={{ opacity }}
      {...props}
    >
      {patterns[variant] || patterns.topography}
    </div>
  );

  if (animate) {
    return (
      <motion.div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
      >
        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{
            x: [0, -20, 0],
            y: [0, -10, 0],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: 'linear',
          }}
        >
          {content}
        </motion.div>
      </motion.div>
    );
  }

  return content;
};

/**
 * Blueprint accent line decoration
 */
const BlueprintAccent = ({
  className,
  orientation = 'horizontal',
  ...props
}) => {
  return (
    <div
      className={cn(
        'relative',
        orientation === 'horizontal' ? 'w-full h-px' : 'h-full w-px',
        className
      )}
      {...props}
    >
      <div
        className={cn(
          'absolute bg-brand-200',
          orientation === 'horizontal'
            ? 'inset-x-0 h-px'
            : 'inset-y-0 w-px'
        )}
        style={{
          backgroundImage:
            orientation === 'horizontal'
              ? 'repeating-linear-gradient(90deg, currentColor 0px, currentColor 4px, transparent 4px, transparent 8px)'
              : 'repeating-linear-gradient(180deg, currentColor 0px, currentColor 4px, transparent 4px, transparent 8px)',
        }}
      />
    </div>
  );
};

export { AnimatedGrid, BlueprintAccent };
export default AnimatedGrid;

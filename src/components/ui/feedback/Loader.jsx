import React from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility to merge Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Spinner loader component
 */
const Spinner = ({
  className,
  size = 'md',
  ...props
}) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12',
  };

  return (
    <Loader2
      className={cn('animate-spin text-brand-500', sizes[size], className)}
      {...props}
    />
  );
};

/**
 * Full page loader with optional message
 */
const PageLoader = ({
  className,
  message,
  ...props
}) => {
  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm',
        className
      )}
      {...props}
    >
      <motion.div
        className="flex flex-col items-center gap-4"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <Spinner size="xl" />
        {message && (
          <p className="text-sm text-gray-600 font-medium">{message}</p>
        )}
      </motion.div>
    </div>
  );
};

/**
 * Inline loader for buttons or small areas
 */
const InlineLoader = ({
  className,
  message,
  size = 'md',
  ...props
}) => {
  return (
    <div
      className={cn('flex items-center gap-2', className)}
      {...props}
    >
      <Spinner size={size} />
      {message && (
        <span className="text-sm text-gray-600">{message}</span>
      )}
    </div>
  );
};

/**
 * Skeleton loader for content placeholders
 */
const Skeleton = ({
  className,
  variant = 'text',
  ...props
}) => {
  const variants = {
    text: 'h-4 w-full rounded',
    title: 'h-6 w-3/4 rounded',
    avatar: 'h-10 w-10 rounded-full',
    thumbnail: 'h-20 w-20 rounded-lg',
    card: 'h-40 w-full rounded-xl',
    button: 'h-10 w-24 rounded-lg',
  };

  return (
    <div
      className={cn(
        'bg-gray-200 animate-pulse',
        variants[variant],
        className
      )}
      {...props}
    />
  );
};

/**
 * Skeleton group for loading states
 */
const SkeletonGroup = ({
  className,
  rows = 3,
  ...props
}) => {
  return (
    <div className={cn('space-y-3', className)} {...props}>
      <Skeleton variant="title" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} variant="text" style={{ width: `${100 - i * 10}%` }} />
      ))}
    </div>
  );
};

/**
 * Card skeleton loader
 */
const CardSkeleton = ({
  className,
  ...props
}) => {
  return (
    <div
      className={cn(
        'p-6 bg-white border border-gray-200 rounded-xl space-y-4',
        className
      )}
      {...props}
    >
      <Skeleton variant="avatar" />
      <div className="space-y-2">
        <Skeleton variant="title" />
        <Skeleton variant="text" />
        <Skeleton variant="text" style={{ width: '60%' }} />
      </div>
    </div>
  );
};

/**
 * Dots loading animation
 */
const DotsLoader = ({
  className,
  ...props
}) => {
  return (
    <div className={cn('flex items-center gap-1', className)} {...props}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 bg-brand-500 rounded-full"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.2,
          }}
        />
      ))}
    </div>
  );
};

export {
  Spinner,
  PageLoader,
  InlineLoader,
  Skeleton,
  SkeletonGroup,
  CardSkeleton,
  DotsLoader,
};

export default Spinner;

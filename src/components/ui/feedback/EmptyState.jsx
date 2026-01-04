import React from 'react';
import { motion } from 'framer-motion';
import { FileX, Search, Inbox, FolderOpen, Image } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility to merge Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Preset icons for common empty states
const presetIcons = {
  default: Inbox,
  search: Search,
  files: FileX,
  folder: FolderOpen,
  images: Image,
};

/**
 * Empty state component for when there's no content to display
 */
const EmptyState = ({
  className,
  icon,
  preset = 'default',
  title,
  description,
  action,
  size = 'md',
  ...props
}) => {
  const Icon = icon || presetIcons[preset] || presetIcons.default;

  const sizes = {
    sm: {
      icon: 'w-8 h-8',
      iconContainer: 'w-12 h-12',
      title: 'text-sm',
      description: 'text-xs',
      padding: 'p-4',
    },
    md: {
      icon: 'w-10 h-10',
      iconContainer: 'w-16 h-16',
      title: 'text-base',
      description: 'text-sm',
      padding: 'p-6',
    },
    lg: {
      icon: 'w-12 h-12',
      iconContainer: 'w-20 h-20',
      title: 'text-lg',
      description: 'text-base',
      padding: 'p-8',
    },
  };

  const sizeConfig = sizes[size];

  return (
    <motion.div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        sizeConfig.padding,
        className
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      {...props}
    >
      {/* Icon container */}
      <div
        className={cn(
          'flex items-center justify-center rounded-full bg-gray-100 mb-4',
          sizeConfig.iconContainer
        )}
      >
        <Icon className={cn('text-gray-400', sizeConfig.icon)} />
      </div>

      {/* Title */}
      {title && (
        <h3
          className={cn(
            'font-semibold text-gray-900 mb-1',
            sizeConfig.title
          )}
        >
          {title}
        </h3>
      )}

      {/* Description */}
      {description && (
        <p
          className={cn(
            'text-gray-500 max-w-sm mb-4',
            sizeConfig.description
          )}
        >
          {description}
        </p>
      )}

      {/* Action */}
      {action && <div className="mt-2">{action}</div>}
    </motion.div>
  );
};

/**
 * Error state for displaying errors
 */
const ErrorState = ({
  className,
  title = 'Something went wrong',
  message,
  onRetry,
  ...props
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center p-6',
        className
      )}
      {...props}
    >
      <div className="w-16 h-16 flex items-center justify-center rounded-full bg-error-100 mb-4">
        <svg
          className="w-8 h-8 text-error-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>

      <h3 className="font-semibold text-gray-900 mb-1">{title}</h3>

      {message && (
        <p className="text-sm text-gray-500 max-w-sm mb-4">{message}</p>
      )}

      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  );
};

/**
 * No results state for search
 */
const NoResults = ({
  className,
  query,
  onClear,
  ...props
}) => {
  return (
    <EmptyState
      className={className}
      preset="search"
      title="No results found"
      description={
        query
          ? `We couldn't find anything matching "${query}"`
          : "We couldn't find anything matching your search"
      }
      action={
        onClear && (
          <button
            onClick={onClear}
            className="text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
          >
            Clear search
          </button>
        )
      }
      {...props}
    />
  );
};

export { EmptyState, ErrorState, NoResults };
export default EmptyState;

import React from "react";
import { motion } from "framer-motion";
import {
  FileX,
  Search,
  Inbox,
  FolderOpen,
  Image,
  AlertCircle,
} from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
 * Empty state component for when there's no content to display.
 * Variant controls visual weight (compact for in-panel, hero for full-page).
 */
const EmptyState = ({
  className,
  icon,
  preset = "default",
  title,
  description,
  action,
  size = "md",
  variant = "default",
  ...props
}) => {
  const Icon = icon || presetIcons[preset] || presetIcons.default;

  const sizes = {
    sm: {
      icon: "w-7 h-7",
      iconContainer: "w-12 h-12",
      title: "text-sm",
      description: "text-xs",
      padding: "p-4",
    },
    md: {
      icon: "w-9 h-9",
      iconContainer: "w-16 h-16",
      title: "text-base",
      description: "text-sm",
      padding: "p-6",
    },
    lg: {
      icon: "w-12 h-12",
      iconContainer: "w-20 h-20",
      title: "text-lg",
      description: "text-base",
      padding: "p-8",
    },
  };

  // Variant overrides — compact suppresses the rounded icon container,
  // hero scales up icon + title for landing/page-level empty states.
  const variants = {
    default: { showIconContainer: true },
    compact: {
      showIconContainer: false,
      padding: "py-6 px-4",
    },
    hero: {
      showIconContainer: true,
      padding: "p-12",
      iconScale: "w-24 h-24",
      iconInnerScale: "w-12 h-12",
      titleScale: "text-xl",
    },
  };

  const sizeConfig = sizes[size] || sizes.md;
  const variantConfig = variants[variant] || variants.default;
  const padding = variantConfig.padding || sizeConfig.padding;

  return (
    <motion.div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        padding,
        className,
      )}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      {...props}
    >
      {/* Icon container (suppressed in compact variant) */}
      {variantConfig.showIconContainer ? (
        <div
          className={cn(
            "flex items-center justify-center rounded-full bg-white/5 border border-white/10 mb-4",
            variantConfig.iconScale || sizeConfig.iconContainer,
          )}
        >
          <Icon
            className={cn(
              "text-white/40",
              variantConfig.iconInnerScale || sizeConfig.icon,
            )}
            strokeWidth={1.75}
          />
        </div>
      ) : (
        <Icon
          className={cn("text-white/40 mb-3", sizeConfig.icon)}
          strokeWidth={1.75}
        />
      )}

      {/* Title */}
      {title && (
        <h3
          className={cn(
            "font-semibold text-white/85 mb-1",
            variantConfig.titleScale || sizeConfig.title,
          )}
        >
          {title}
        </h3>
      )}

      {/* Description */}
      {description && (
        <p
          className={cn("text-white/55 max-w-sm mb-4", sizeConfig.description)}
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
 * Error state for displaying errors (dark blueprint surface)
 */
const ErrorState = ({
  className,
  title = "Something went wrong",
  message,
  onRetry,
  ...props
}) => {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center p-6",
        className,
      )}
      {...props}
    >
      <div className="w-16 h-16 flex items-center justify-center rounded-full bg-red-500/10 border border-red-500/30 mb-4">
        <AlertCircle className="w-8 h-8 text-red-300" strokeWidth={1.75} />
      </div>

      <h3 className="font-semibold text-white/90 mb-1">{title}</h3>

      {message && (
        <p className="text-sm text-white/60 max-w-sm mb-4">{message}</p>
      )}

      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 text-sm font-medium text-royal-300 hover:text-royal-200 transition-colors"
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
const NoResults = ({ className, query, onClear, ...props }) => {
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
            className="text-sm font-medium text-royal-300 hover:text-royal-200 transition-colors"
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

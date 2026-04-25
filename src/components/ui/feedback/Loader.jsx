import React from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Utility to merge Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Spinner loader component
 */
const Spinner = ({ className, size = "md", ...props }) => {
  const sizes = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
    xl: "w-12 h-12",
  };

  return (
    <Loader2
      className={cn("animate-spin text-royal-400", sizes[size], className)}
      strokeWidth={1.75}
      {...props}
    />
  );
};

/**
 * Full page loader with optional message (dark blueprint surface)
 */
const PageLoader = ({ className, message, ...props }) => {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-navy-950/80 backdrop-blur-sm",
        className,
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
          <p className="text-sm text-white/70 font-medium">{message}</p>
        )}
      </motion.div>
    </div>
  );
};

/**
 * Inline loader for buttons or small areas
 */
const InlineLoader = ({ className, message, size = "md", ...props }) => {
  return (
    <div className={cn("flex items-center gap-2", className)} {...props}>
      <Spinner size={size} />
      {message && <span className="text-sm text-white/70">{message}</span>}
    </div>
  );
};

/**
 * Skeleton loader for content placeholders.
 * Uses the project's existing `animate-shimmer` keyframe (tailwind.config.js)
 * with a translucent gradient that reads on dark backgrounds.
 */
const SKELETON_BASE =
  "bg-[length:200%_100%] bg-gradient-to-r from-white/[0.04] via-white/[0.10] to-white/[0.04] animate-shimmer";

const Skeleton = ({ className, variant = "text", ...props }) => {
  const variants = {
    text: "h-4 w-full rounded",
    title: "h-6 w-3/4 rounded-md",
    avatar: "h-10 w-10 rounded-full",
    circle: "h-10 w-10 rounded-full",
    thumbnail: "h-20 w-20 rounded-lg",
    card: "h-40 w-full rounded-xl",
    button: "h-10 w-24 rounded-lg",
    image: "aspect-video w-full rounded-lg",
  };

  return (
    <div
      className={cn(
        SKELETON_BASE,
        variants[variant] || variants.text,
        className,
      )}
      aria-hidden="true"
      {...props}
    />
  );
};

/**
 * Skeleton group for loading states (stacked text lines)
 */
const SkeletonGroup = ({ className, rows = 3, ...props }) => {
  return (
    <div className={cn("space-y-3", className)} {...props}>
      <Skeleton variant="title" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          style={{ width: `${100 - i * 10}%` }}
        />
      ))}
    </div>
  );
};

/**
 * Card skeleton loader (dark blueprint surface)
 */
const CardSkeleton = ({ className, ...props }) => {
  return (
    <div
      className={cn(
        "p-6 bg-white/[0.03] border border-white/10 rounded-xl space-y-4",
        className,
      )}
      {...props}
    >
      <Skeleton variant="circle" />
      <div className="space-y-2">
        <Skeleton variant="title" />
        <Skeleton variant="text" />
        <Skeleton variant="text" style={{ width: "60%" }} />
      </div>
    </div>
  );
};

/**
 * Dots loading animation
 */
const DotsLoader = ({ className, ...props }) => {
  return (
    <div className={cn("flex items-center gap-1", className)} {...props}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-2 h-2 bg-royal-400 rounded-full"
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

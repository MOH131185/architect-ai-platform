import React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility to merge Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Tooltip provider - wrap your app with this
 */
const TooltipProvider = TooltipPrimitive.Provider;

/**
 * Tooltip component with Radix primitives
 */
const Tooltip = ({
  children,
  content,
  side = 'top',
  align = 'center',
  delayDuration = 300,
  className,
  ...props
}) => {
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration} {...props}>
      <TooltipPrimitive.Trigger asChild>
        {children}
      </TooltipPrimitive.Trigger>
      <AnimatePresence>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={4}
            asChild
          >
            <motion.div
              className={cn(
                'z-tooltip px-3 py-1.5 text-xs font-medium text-white bg-gray-900 rounded-md shadow-lg',
                'max-w-xs',
                className
              )}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
            >
              {content}
              <TooltipPrimitive.Arrow className="fill-gray-900" />
            </motion.div>
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </AnimatePresence>
    </TooltipPrimitive.Root>
  );
};

/**
 * Simple hover tooltip wrapper
 */
const TooltipWrapper = ({
  children,
  tooltip,
  ...props
}) => {
  if (!tooltip) return children;

  return (
    <Tooltip content={tooltip} {...props}>
      {children}
    </Tooltip>
  );
};

export {
  Tooltip,
  TooltipProvider,
  TooltipWrapper,
};

export default Tooltip;

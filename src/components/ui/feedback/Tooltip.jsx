import React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

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
  side = "top",
  align = "center",
  delayDuration = 300,
  className,
  ...props
}) => {
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration} {...props}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
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
                "z-tooltip px-3 py-1.5 text-xs font-medium text-white/90 bg-navy-900/95 backdrop-blur-md border border-white/10 rounded-md shadow-soft-lg",
                "max-w-xs",
                className,
              )}
              initial={{ opacity: 0, scale: 0.95, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 4 }}
              transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              {content}
              <TooltipPrimitive.Arrow className="fill-navy-900" />
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
const TooltipWrapper = ({ children, tooltip, ...props }) => {
  if (!tooltip) return children;

  return (
    <Tooltip content={tooltip} {...props}>
      {children}
    </Tooltip>
  );
};

export { Tooltip, TooltipProvider, TooltipWrapper };

export default Tooltip;

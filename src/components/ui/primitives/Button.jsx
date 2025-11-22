import React from 'react';
import { motion } from 'framer-motion';
import { cva } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader2 } from 'lucide-react';

// Utility to merge Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Button variants using CVA
const buttonVariants = cva(
  // Base styles
  'inline-flex items-center justify-center font-medium transition-all duration-200 ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-brand-500 text-white shadow-brand-sm hover:bg-brand-600 hover:shadow-brand active:bg-brand-700',
        secondary:
          'bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300',
        outline:
          'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100',
        ghost:
          'text-gray-700 hover:bg-gray-100 active:bg-gray-200',
        destructive:
          'bg-error-500 text-white shadow-sm hover:bg-error-600 active:bg-error-700',
        link:
          'text-brand-500 underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs rounded-md gap-1.5',
        md: 'h-10 px-4 text-sm rounded-lg gap-2',
        lg: 'h-12 px-6 text-base rounded-lg gap-2.5',
        xl: 'h-14 px-8 text-lg rounded-xl gap-3',
        icon: 'h-10 w-10 rounded-lg',
        'icon-sm': 'h-8 w-8 rounded-md',
        'icon-lg': 'h-12 w-12 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

// Animation variants
const buttonAnimation = {
  tap: { scale: 0.98 },
  hover: { scale: 1.02 },
};

/**
 * Button component with multiple variants and Framer Motion animations
 */
const Button = React.forwardRef(
  (
    {
      className,
      variant,
      size,
      children,
      loading = false,
      disabled = false,
      icon,
      iconPosition = 'left',
      asChild = false,
      animate = true,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    const content = (
      <>
        {loading && (
          <Loader2 className="h-4 w-4 animate-spin" />
        )}
        {!loading && icon && iconPosition === 'left' && (
          <span className="shrink-0">{icon}</span>
        )}
        {children && <span>{children}</span>}
        {!loading && icon && iconPosition === 'right' && (
          <span className="shrink-0">{icon}</span>
        )}
      </>
    );

    if (animate && !isDisabled) {
      return (
        <motion.button
          ref={ref}
          className={cn(buttonVariants({ variant, size, className }))}
          disabled={isDisabled}
          whileHover={buttonAnimation.hover}
          whileTap={buttonAnimation.tap}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          {...props}
        >
          {content}
        </motion.button>
      );
    }

    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        disabled={isDisabled}
        {...props}
      >
        {content}
      </button>
    );
  }
);

Button.displayName = 'Button';

// Export both the component and variants for custom usage
export { Button, buttonVariants };
export default Button;

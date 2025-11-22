import React from 'react';
import { motion } from 'framer-motion';
import { cva } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility to merge Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Card variants using CVA
const cardVariants = cva(
  // Base styles
  'bg-white border border-gray-200 transition-all duration-300 ease-smooth',
  {
    variants: {
      variant: {
        default: 'shadow-soft hover:shadow-soft-lg',
        elevated: 'shadow-soft-md hover:shadow-soft-lg',
        outline: 'shadow-none hover:border-gray-300',
        ghost: 'border-transparent shadow-none hover:bg-gray-50',
        glass: 'bg-white/80 backdrop-blur-xl border-white/20',
      },
      padding: {
        none: 'p-0',
        sm: 'p-4',
        md: 'p-6',
        lg: 'p-8',
        xl: 'p-10',
      },
      radius: {
        none: 'rounded-none',
        sm: 'rounded-lg',
        md: 'rounded-xl',
        lg: 'rounded-2xl',
        full: 'rounded-3xl',
      },
      interactive: {
        true: 'cursor-pointer',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'md',
      radius: 'md',
      interactive: false,
    },
  }
);

// Animation variants for hover
const cardAnimation = {
  rest: { y: 0 },
  hover: { y: -4 },
};

/**
 * Card component with variants and optional hover animation
 */
const Card = React.forwardRef(
  (
    {
      className,
      variant,
      padding,
      radius,
      interactive,
      children,
      animate = true,
      onClick,
      ...props
    },
    ref
  ) => {
    const isInteractive = interactive || !!onClick;

    if (animate && isInteractive) {
      return (
        <motion.div
          ref={ref}
          className={cn(
            cardVariants({ variant, padding, radius, interactive: isInteractive }),
            className
          )}
          initial="rest"
          whileHover="hover"
          variants={cardAnimation}
          transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          onClick={onClick}
          {...props}
        >
          {children}
        </motion.div>
      );
    }

    return (
      <div
        ref={ref}
        className={cn(
          cardVariants({ variant, padding, radius, interactive: isInteractive }),
          className
        )}
        onClick={onClick}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

/**
 * Card Header subcomponent
 */
const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5', className)}
    {...props}
  />
));

CardHeader.displayName = 'CardHeader';

/**
 * Card Title subcomponent
 */
const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight text-gray-900', className)}
    {...props}
  />
));

CardTitle.displayName = 'CardTitle';

/**
 * Card Description subcomponent
 */
const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-gray-500', className)}
    {...props}
  />
));

CardDescription.displayName = 'CardDescription';

/**
 * Card Content subcomponent
 */
const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('', className)} {...props} />
));

CardContent.displayName = 'CardContent';

/**
 * Card Footer subcomponent
 */
const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center pt-4', className)}
    {...props}
  />
));

CardFooter.displayName = 'CardFooter';

// Export all components
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  cardVariants,
};

export default Card;

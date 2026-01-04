import React from 'react';
import { cva } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility to merge Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Input variants using CVA
const inputVariants = cva(
  // Base styles
  'flex w-full bg-white text-gray-900 transition-all duration-200 ease-smooth placeholder:text-gray-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'border border-gray-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20',
        filled:
          'border-0 bg-gray-100 focus:bg-gray-50 focus:ring-2 focus:ring-brand-500/20',
        ghost:
          'border-0 bg-transparent focus:bg-gray-50',
        error:
          'border border-error-500 focus:border-error-500 focus:ring-2 focus:ring-error-500/20',
      },
      inputSize: {
        sm: 'h-8 px-3 text-xs rounded-md',
        md: 'h-10 px-3 text-sm rounded-lg',
        lg: 'h-12 px-4 text-base rounded-lg',
        xl: 'h-14 px-4 text-lg rounded-xl',
      },
    },
    defaultVariants: {
      variant: 'default',
      inputSize: 'md',
    },
  }
);

/**
 * Input component with multiple variants
 */
const Input = React.forwardRef(
  (
    {
      className,
      variant,
      inputSize,
      type = 'text',
      error,
      icon,
      iconPosition = 'left',
      ...props
    },
    ref
  ) => {
    const hasIcon = !!icon;
    const effectiveVariant = error ? 'error' : variant;

    if (hasIcon) {
      return (
        <div className="relative">
          {iconPosition === 'left' && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              {icon}
            </div>
          )}
          <input
            type={type}
            className={cn(
              inputVariants({ variant: effectiveVariant, inputSize }),
              iconPosition === 'left' && 'pl-10',
              iconPosition === 'right' && 'pr-10',
              className
            )}
            ref={ref}
            {...props}
          />
          {iconPosition === 'right' && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              {icon}
            </div>
          )}
        </div>
      );
    }

    return (
      <input
        type={type}
        className={cn(
          inputVariants({ variant: effectiveVariant, inputSize }),
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

/**
 * Textarea component
 */
const Textarea = React.forwardRef(
  ({ className, variant = 'default', error, ...props }, ref) => {
    const effectiveVariant = error ? 'error' : variant;

    return (
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 transition-all duration-200 ease-smooth placeholder:text-gray-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          effectiveVariant === 'error'
            ? 'border-error-500 focus:border-error-500 focus:ring-2 focus:ring-error-500/20'
            : 'border-gray-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';

/**
 * Label component
 */
const Label = React.forwardRef(({ className, required, children, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      'text-sm font-medium text-gray-700 leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      className
    )}
    {...props}
  >
    {children}
    {required && <span className="text-error-500 ml-1">*</span>}
  </label>
));

Label.displayName = 'Label';

/**
 * Form field wrapper with label and error
 */
const FormField = React.forwardRef(
  ({ className, label, error, required, children, ...props }, ref) => (
    <div ref={ref} className={cn('space-y-2', className)} {...props}>
      {label && (
        <Label required={required}>{label}</Label>
      )}
      {children}
      {error && (
        <p className="text-xs text-error-500">{error}</p>
      )}
    </div>
  )
);

FormField.displayName = 'FormField';

export { Input, Textarea, Label, FormField, inputVariants };
export default Input;

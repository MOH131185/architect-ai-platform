import React from 'react';
import { ChevronDown } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility to merge Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Native Select component with custom styling
 */
const Select = React.forwardRef(
  (
    {
      className,
      children,
      placeholder,
      error,
      ...props
    },
    ref
  ) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            'flex h-10 w-full appearance-none rounded-lg border bg-white px-3 pr-10 text-sm text-gray-900 transition-all duration-200 ease-smooth focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
            error
              ? 'border-error-500 focus:border-error-500 focus:ring-2 focus:ring-error-500/20'
              : 'border-gray-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20',
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {children}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>
    );
  }
);

Select.displayName = 'Select';

/**
 * Select Option component
 */
const SelectOption = React.forwardRef(({ className, ...props }, ref) => (
  <option ref={ref} className={cn('', className)} {...props} />
));

SelectOption.displayName = 'SelectOption';

export { Select, SelectOption };
export default Select;

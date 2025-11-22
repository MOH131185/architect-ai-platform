import React from 'react';
import { motion } from 'framer-motion';
import { cva } from 'class-variance-authority';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { fadeInUp, viewportSettings } from '../../../styles/designSystem/animations.js';

// Utility to merge Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Section variants
const sectionVariants = cva(
  'w-full',
  {
    variants: {
      padding: {
        none: 'py-0',
        sm: 'py-8 md:py-12',
        md: 'py-12 md:py-16',
        lg: 'py-16 md:py-24',
        xl: 'py-24 md:py-32',
      },
      background: {
        transparent: 'bg-transparent',
        white: 'bg-white',
        gray: 'bg-gray-50',
        gradient: 'bg-gradient-to-b from-white to-gray-50',
        brand: 'bg-brand-50',
        dark: 'bg-gray-900 text-white',
      },
    },
    defaultVariants: {
      padding: 'md',
      background: 'transparent',
    },
  }
);

/**
 * Section component for page sections with optional animation
 */
const Section = React.forwardRef(
  (
    {
      className,
      padding,
      background,
      children,
      animate = false,
      id,
      ...props
    },
    ref
  ) => {
    if (animate) {
      return (
        <motion.section
          ref={ref}
          id={id}
          className={cn(sectionVariants({ padding, background }), className)}
          initial={fadeInUp.initial}
          whileInView={fadeInUp.animate}
          viewport={viewportSettings}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          {...props}
        >
          {children}
        </motion.section>
      );
    }

    return (
      <section
        ref={ref}
        id={id}
        className={cn(sectionVariants({ padding, background }), className)}
        {...props}
      >
        {children}
      </section>
    );
  }
);

Section.displayName = 'Section';

/**
 * Section Header for titles and descriptions
 */
const SectionHeader = React.forwardRef(
  ({ className, align = 'center', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'mb-8 md:mb-12',
          align === 'center' && 'text-center',
          align === 'left' && 'text-left',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

SectionHeader.displayName = 'SectionHeader';

/**
 * Section Title
 */
const SectionTitle = React.forwardRef(
  ({ className, children, ...props }, ref) => {
    return (
      <h2
        ref={ref}
        className={cn(
          'text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl',
          className
        )}
        {...props}
      >
        {children}
      </h2>
    );
  }
);

SectionTitle.displayName = 'SectionTitle';

/**
 * Section Description
 */
const SectionDescription = React.forwardRef(
  ({ className, children, ...props }, ref) => {
    return (
      <p
        ref={ref}
        className={cn(
          'mt-4 text-lg text-gray-600 max-w-3xl',
          className
        )}
        {...props}
      >
        {children}
      </p>
    );
  }
);

SectionDescription.displayName = 'SectionDescription';

export {
  Section,
  SectionHeader,
  SectionTitle,
  SectionDescription,
  sectionVariants,
};

export default Section;

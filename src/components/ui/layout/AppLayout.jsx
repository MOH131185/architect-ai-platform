import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Navbar } from './Navbar.jsx';
import { Footer } from './Footer.jsx';

// Utility to merge Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Main application layout wrapper
 */
const AppLayout = ({
  className,
  children,
  showNavbar = true,
  showFooter = true,
  navbarProps = {},
  footerProps = {},
  background = 'default',
  ...props
}) => {
  const backgroundClasses = {
    default: 'bg-white',
    gray: 'bg-gray-50',
    gradient: 'bg-gradient-to-b from-white to-gray-50',
    topography: 'bg-topography',
    grid: 'bg-grid',
    dots: 'bg-dots',
  };

  return (
    <div
      className={cn(
        'min-h-screen flex flex-col',
        backgroundClasses[background] || backgroundClasses.default,
        className
      )}
      {...props}
    >
      {showNavbar && <Navbar {...navbarProps} />}

      <main className="flex-1">
        {children}
      </main>

      {showFooter && <Footer {...footerProps} />}
    </div>
  );
};

/**
 * Page wrapper with fade animation
 */
const Page = React.forwardRef(
  ({ className, children, animate = true, ...props }, ref) => {
    if (animate) {
      return (
        <motion.div
          ref={ref}
          className={cn('w-full', className)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          {...props}
        >
          {children}
        </motion.div>
      );
    }

    return (
      <div ref={ref} className={cn('w-full', className)} {...props}>
        {children}
      </div>
    );
  }
);

Page.displayName = 'Page';

/**
 * Step wrapper for wizard steps with slide animation
 */
const StepWrapper = ({
  className,
  children,
  direction = 'forward',
  ...props
}) => {
  const variants = {
    initial: {
      opacity: 0,
      x: direction === 'forward' ? 50 : -50,
    },
    animate: {
      opacity: 1,
      x: 0,
    },
    exit: {
      opacity: 0,
      x: direction === 'forward' ? -50 : 50,
    },
  };

  return (
    <motion.div
      className={cn('w-full', className)}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      {...props}
    >
      {children}
    </motion.div>
  );
};

/**
 * Full-height centered content wrapper
 */
const CenteredLayout = React.forwardRef(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'min-h-[calc(100vh-4rem)] flex items-center justify-center p-4',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

CenteredLayout.displayName = 'CenteredLayout';

/**
 * Two-column layout for wizard steps
 */
const SplitLayout = React.forwardRef(
  ({ className, left, right, ratio = '1:1', ...props }, ref) => {
    const ratioClasses = {
      '1:1': 'md:grid-cols-2',
      '1:2': 'md:grid-cols-3',
      '2:1': 'md:grid-cols-3',
      '1:3': 'md:grid-cols-4',
      '3:1': 'md:grid-cols-4',
    };

    const leftSpanClasses = {
      '1:1': '',
      '1:2': '',
      '2:1': 'md:col-span-2',
      '1:3': '',
      '3:1': 'md:col-span-3',
    };

    const rightSpanClasses = {
      '1:1': '',
      '1:2': 'md:col-span-2',
      '2:1': '',
      '1:3': 'md:col-span-3',
      '3:1': '',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'grid grid-cols-1 gap-8',
          ratioClasses[ratio],
          className
        )}
        {...props}
      >
        <div className={leftSpanClasses[ratio]}>{left}</div>
        <div className={rightSpanClasses[ratio]}>{right}</div>
      </div>
    );
  }
);

SplitLayout.displayName = 'SplitLayout';

export {
  AppLayout,
  Page,
  StepWrapper,
  CenteredLayout,
  SplitLayout,
};

export default AppLayout;

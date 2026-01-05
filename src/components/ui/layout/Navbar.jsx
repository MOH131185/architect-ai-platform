import React from 'react';
import { motion } from 'framer-motion';
import { Menu, X, Settings } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility to merge Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Modern Navbar component with glass effect
 */
const Navbar = ({
  className,
  logo,
  children,
  sticky = true,
  transparent = false,
  onSettingsClick,
  ...props
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  return (
    <header
      className={cn(
        'w-full z-sticky transition-all duration-300',
        sticky && 'sticky top-0',
        transparent
          ? 'bg-transparent'
          : 'bg-white/80 backdrop-blur-xl border-b border-gray-200/50',
        className
      )}
      {...props}
    >
      <nav className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <div className="flex-shrink-0">
            {logo || (
              <a href="/" className="flex items-center gap-2">
                <img 
                  src={`${process.env.PUBLIC_URL || ''}/logo/logo.png`}
                  alt="ArchiAI Solution Ltd." 
                  className="h-8 w-8"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
                <div className="flex flex-col">
                  <span className="text-lg font-bold text-gray-900">
                    ArchiAI Solution
                  </span>
                  <span className="text-xs text-green-600 -mt-1">
                    AI for Architecture & Design
                  </span>
                </div>
              </a>
            )}
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex md:items-center md:gap-6">
            {children}
            {onSettingsClick && (
              <button
                onClick={onSettingsClick}
                className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                aria-label="Settings"
              >
                <Settings className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex md:hidden">
            <button
              type="button"
              className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <motion.div
            className="md:hidden py-4 border-t border-gray-200/50"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex flex-col gap-2">
              {children}
              {onSettingsClick && (
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onSettingsClick();
                  }}
                  className="flex items-center gap-2 p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <Settings className="h-5 w-5" />
                  <span>Settings</span>
                </button>
              )}
            </div>
          </motion.div>
        )}
      </nav>
    </header>
  );
};

/**
 * NavLink component for navigation items
 */
const NavLink = React.forwardRef(
  ({ className, active, children, ...props }, ref) => {
    return (
      <a
        ref={ref}
        className={cn(
          'text-sm font-medium transition-colors',
          active
            ? 'text-brand-600'
            : 'text-gray-600 hover:text-gray-900',
          className
        )}
        {...props}
      >
        {children}
      </a>
    );
  }
);

NavLink.displayName = 'NavLink';

/**
 * NavButton component for action buttons in navbar
 */
const NavButton = React.forwardRef(
  ({ className, variant = 'primary', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200',
          variant === 'primary' &&
            'bg-brand-500 text-white hover:bg-brand-600 shadow-brand-sm hover:shadow-brand',
          variant === 'secondary' &&
            'bg-gray-100 text-gray-700 hover:bg-gray-200',
          variant === 'ghost' &&
            'text-gray-600 hover:text-gray-900 hover:bg-gray-100',
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

NavButton.displayName = 'NavButton';

export { Navbar, NavLink, NavButton };
export default Navbar;

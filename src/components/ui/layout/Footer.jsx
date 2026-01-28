import React from 'react';
import { clsx } from 'clsx';
import CompanyLogo from '../CompanyLogo.jsx';
import { twMerge } from 'tailwind-merge';

// Utility to merge Tailwind classes
function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Footer component
 */
const Footer = ({ className, ...props }) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className={cn(
        'w-full border-t border-gray-200 bg-white',
        className
      )}
      {...props}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Logo & Copyright */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <CompanyLogo
                size={40}
                className="mr-2"
              />
              <div className="flex flex-col">
                <span className="text-sm font-bold text-gray-900">
                  ArchiAI Solution Ltd.
                </span>
                <span className="text-xs text-green-600">
                  AI for Architecture & Design
                </span>
              </div>
            </div>
            <span className="text-sm text-gray-500">
              &copy; {currentYear} All rights reserved.
            </span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6">
            <a
              href="#"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Privacy
            </a>
            <a
              href="#"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Terms
            </a>
            <a
              href="#"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Contact
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export { Footer };
export default Footer;

import React from 'react';
import CompanyLogo from './CompanyLogo.jsx';

/**
 * GlassNavbar - Premium liquid glass navigation bar
 */
export const GlassNavbar = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 liquid-glass-strong border-b border-white/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <CompanyLogo
              size={48}
              className="logo-float"
              alt="ArchiAI Solution logo"
            />
            <div>
              <span className="text-lg font-bold text-white">ARCHIAI</span>
              <span className="text-sm text-white/70 ml-1">SOLUTION</span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center space-x-6">
            <a href="#features" className="text-white/80 hover:text-white transition-colors">
              Features
            </a>
            <a href="#pricing" className="text-white/80 hover:text-white transition-colors">
              Pricing
            </a>
            <a href="#about" className="text-white/80 hover:text-white transition-colors">
              About
            </a>
          </div>

          {/* CTA Button */}
          <div className="hidden md:block">
            <button className="btn-premium-secondary text-sm px-4 py-2">
              Get Started
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default GlassNavbar;


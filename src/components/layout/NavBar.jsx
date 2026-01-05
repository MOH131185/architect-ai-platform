import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PropTypes from 'prop-types';
import { fadeInDown } from '../../styles/animations.js';
import Button from '../ui/Button.jsx';
import { Layers } from 'lucide-react';
import logger from '../../utils/logger.js';


const NavBar = ({
  onNewDesign,
  showNewDesign = true,
  transparent = false,
  className = '',
}) => {
  const [scrolled, setScrolled] = useState(false);
  
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  const navClasses = `fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
    scrolled && !transparent
      ? 'bg-navy-950/90 backdrop-blur-lg border-b border-navy-800 shadow-xl'
      : transparent
      ? 'bg-transparent'
      : 'bg-navy-950/50 backdrop-blur-sm'
  } ${className}`;
  
  return (
    <motion.nav
      className={navClasses}
      variants={fadeInDown}
      initial="initial"
      animate="animate"
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <motion.div
            className="flex items-center gap-3 cursor-pointer"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <img
              src={`${process.env.PUBLIC_URL || ''}/logo/logo.png`}
              alt="ArchiAI Solution Ltd."
              className="w-10 h-10"
              onError={(e) => {
                logger.error('Logo failed to load:', e.target.src);
                e.target.style.display = 'none';
              }}
            />
            <div>
              <h1 className="text-xl font-bold text-white font-heading">
                ArchiAI Solution
              </h1>
              <p className="text-xs text-gray-400">
                AI for Architecture & Design
              </p>
            </div>
          </motion.div>
          
          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-8">
            <NavLink href="#features">Features</NavLink>
            <NavLink href="#how-it-works">How It Works</NavLink>
            <NavLink href="#about">About</NavLink>
          </div>
          
          {/* CTA Button */}
          {showNewDesign && (
            <div className="flex items-center gap-4">
              <Button
                variant="gradient"
                size="md"
                onClick={onNewDesign}
                icon={<Layers className="w-5 h-5" />}
              >
                New Design
              </Button>
            </div>
          )}
        </div>
      </div>
    </motion.nav>
  );
};

const NavLink = ({ href, children }) => {
  return (
    <motion.a
      href={href}
      className="text-gray-300 hover:text-white transition-colors duration-200 font-medium"
      whileHover={{ y: -2 }}
      whileTap={{ y: 0 }}
    >
      {children}
    </motion.a>
  );
};

NavBar.propTypes = {
  onNewDesign: PropTypes.func,
  showNewDesign: PropTypes.bool,
  transparent: PropTypes.bool,
  className: PropTypes.string,
};

export default NavBar;


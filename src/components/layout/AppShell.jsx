import React from 'react';
import PropTypes from 'prop-types';
import NavBar from './NavBar.jsx';
import Footer from './Footer.jsx';
import NoiseLayer from '../ui/NoiseLayer.jsx';

const AppShell = ({
  children,
  showNav = true,
  showFooter = true,
  navProps = {},
  background = 'default',
  noise = true,
  className = '',
}) => {
  const backgroundClasses = {
    default: 'bg-navy-950',
    gradient: 'bg-gradient-to-br from-navy-950 via-navy-900 to-navy-950',
    blueprint: 'blueprint-grid',
    architectural: 'architectural-lines',
    dark: 'bg-black',
  };
  
  return (
    <div className={`min-h-screen ${backgroundClasses[background]} ${className}`}>
      {/* Global Noise Layer */}
      {noise && <NoiseLayer variant="subtle" className="fixed inset-0 z-0" />}
      
      {/* Navigation */}
      {showNav && <NavBar {...navProps} />}
      
      {/* Main Content */}
      <main className={`relative z-10 ${showNav ? 'pt-20' : ''}`}>
        {children}
      </main>
      
      {/* Footer */}
      {showFooter && <Footer />}
    </div>
  );
};

AppShell.propTypes = {
  children: PropTypes.node.isRequired,
  showNav: PropTypes.bool,
  showFooter: PropTypes.bool,
  navProps: PropTypes.object,
  background: PropTypes.oneOf(['default', 'gradient', 'blueprint', 'architectural', 'dark']),
  noise: PropTypes.bool,
  className: PropTypes.string,
};

export default AppShell;


/**
 * Entrance Compass Overlay Component
 * 
 * Visual compass overlay on Google Maps showing entrance direction
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Navigation } from 'lucide-react';
import { mapOverlayFade, compassRotation } from '../../styles/animations.js';
import { getAllDirections } from '../../utils/entranceOrientation.js';

const EntranceCompassOverlay = ({
  entranceDirection,
  show = true,
  position = 'top-right', // 'top-right', 'top-left', 'bottom-right', 'bottom-left'
  size = 'md', // 'sm', 'md', 'lg'
}) => {
  const directions = getAllDirections();
  const currentDirection = directions.find(d => d.code === entranceDirection);
  
  const positionClasses = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  };
  
  const sizeClasses = {
    sm: 'w-20 h-20',
    md: 'w-24 h-24',
    lg: 'w-32 h-32',
  };
  
  if (!show || !entranceDirection) return null;
  
  return (
    <AnimatePresence>
      <motion.div
        className={`absolute ${positionClasses[position]} z-[1000] pointer-events-none`}
        variants={mapOverlayFade}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {/* Compass Container */}
        <div className={`relative ${sizeClasses[size]} rounded-full bg-navy-900/90 backdrop-blur-md border-2 border-royal-500/50 shadow-2xl flex items-center justify-center`}>
          {/* Center dot */}
          <div className="absolute w-2 h-2 rounded-full bg-royal-400" />
          
          {/* Rotating arrow */}
          <motion.div
            animate={compassRotation(currentDirection?.bearing || 0)}
            className="absolute"
          >
            <Navigation className="w-8 h-8 text-royal-400" fill="currentColor" />
          </motion.div>
          
          {/* Cardinal markers */}
          <div className="absolute -top-6 left-1/2 transform -translate-x-1/2">
            <span className="text-xs font-bold text-white drop-shadow-lg">N</span>
          </div>
          <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2">
            <span className="text-xs font-bold text-white drop-shadow-lg">S</span>
          </div>
          <div className="absolute -right-6 top-1/2 transform -translate-y-1/2">
            <span className="text-xs font-bold text-white drop-shadow-lg">E</span>
          </div>
          <div className="absolute -left-6 top-1/2 transform -translate-y-1/2">
            <span className="text-xs font-bold text-white drop-shadow-lg">W</span>
          </div>
        </div>
        
        {/* Label */}
        <motion.div
          className="mt-2 text-center bg-navy-900/90 backdrop-blur-md rounded-lg px-3 py-1.5 border border-royal-500/30"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <p className="text-xs text-gray-400">Main Entrance</p>
          <p className="text-sm font-semibold text-white">
            {currentDirection?.label || 'North'}
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default EntranceCompassOverlay;


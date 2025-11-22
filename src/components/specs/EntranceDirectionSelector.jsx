/**
 * Entrance Direction Selector Component
 * 
 * Compass-based selector for main entrance direction with auto-detection
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Navigation, Loader2 } from 'lucide-react';
import { getAllDirections } from '../../utils/entranceOrientation.js';
import Button from '../ui/Button.jsx';

const EntranceDirectionSelector = ({
  selectedDirection,
  onDirectionChange,
  onAutoDetect,
  isDetecting = false,
  autoDetectResult = null,
  showAutoDetect = true
}) => {
  const directions = getAllDirections();

  const handleDirectionClick = (code) => {
    onDirectionChange(code);
  };

  return (
    <div className="space-y-4">
      {/* Compass Visualization */}
      <div className="flex flex-col items-center">
        <div className="relative w-64 h-64">
          {/* Compass Circle */}
          <div className="absolute inset-0 rounded-full border-2 border-royal-500 bg-gradient-to-b from-navy-800 to-navy-900 flex items-center justify-center">
            {/* Center indicator */}
            <div className="w-4 h-4 rounded-full bg-royal-500"></div>

            {/* Direction markers */}
            {directions.map((dir) => {
              const isSelected = selectedDirection === dir.code;
              const angle = dir.bearing;
              const radius = 100; // pixels from center
              
              // Calculate position
              const x = Math.sin((angle * Math.PI) / 180) * radius;
              const y = -Math.cos((angle * Math.PI) / 180) * radius;

              return (
                <motion.button
                  key={dir.code}
                  onClick={() => handleDirectionClick(dir.code)}
                  className={`absolute flex items-center justify-center w-12 h-12 rounded-full transition-all duration-200 ${
                    isSelected
                      ? 'bg-royal-500 text-white scale-110 shadow-glow'
                      : 'bg-navy-700 text-gray-300 hover:bg-navy-600'
                  }`}
                  style={{
                    left: `calc(50% + ${x}px - 24px)`,
                    top: `calc(50% + ${y}px - 24px)`
                  }}
                  whileHover={{ scale: isSelected ? 1.1 : 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <span className="text-xs font-bold">{dir.code}</span>
                </motion.button>
              );
            })}

            {/* Selected direction arrow */}
            {selectedDirection && (
              <motion.div
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <div
                  style={{
                    transform: `rotate(${
                      directions.find(d => d.code === selectedDirection)?.bearing || 0
                    }deg)`
                  }}
                  className="transition-transform duration-500"
                >
                  <Navigation className="w-8 h-8 text-royal-400" fill="currentColor" />
                </div>
              </motion.div>
            )}
          </div>

          {/* Cardinal labels */}
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-6">
            <span className="text-xs font-semibold text-gray-400">N</span>
          </div>
          <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-6">
            <span className="text-xs font-semibold text-gray-400">S</span>
          </div>
          <div className="absolute right-0 top-1/2 transform translate-x-6 -translate-y-1/2">
            <span className="text-xs font-semibold text-gray-400">E</span>
          </div>
          <div className="absolute left-0 top-1/2 transform -translate-x-6 -translate-y-1/2">
            <span className="text-xs font-semibold text-gray-400">W</span>
          </div>
        </div>

        {/* Selected direction label */}
        {selectedDirection && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-center"
          >
            <p className="text-sm text-gray-400">Main Entrance</p>
            <p className="text-lg font-semibold text-white">
              {directions.find(d => d.code === selectedDirection)?.label}
            </p>
          </motion.div>
        )}
      </div>

      {/* Auto-detect button */}
      {showAutoDetect && onAutoDetect && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="md"
            onClick={onAutoDetect}
            disabled={isDetecting}
            icon={isDetecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
          >
            {isDetecting ? 'Detecting...' : 'Auto-Detect Entrance'}
          </Button>
        </div>
      )}

      {/* Auto-detect result */}
      {autoDetectResult && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 rounded-lg bg-navy-800/60 border border-navy-700"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-white">Auto-Detected:</span>
            <span className="text-xs uppercase tracking-wide px-2 py-1 rounded bg-royal-500/20 text-royal-300">
              {Math.round(autoDetectResult.confidence * 100)}% confidence
            </span>
          </div>
          <p className="text-sm text-gray-300">
            {autoDetectResult.rationale?.[0]?.message || 'Based on site analysis'}
          </p>
        </motion.div>
      )}
    </div>
  );
};

export default EntranceDirectionSelector;


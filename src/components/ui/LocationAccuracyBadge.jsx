/**
 * Location Accuracy Badge
 *
 * Displays location accuracy with visual quality indicator
 */

import React from 'react';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { motion } from 'framer-motion';

const LocationAccuracyBadge = ({ accuracy, qualityScore, address }) => {
  // Determine quality level
  const getQualityInfo = (score) => {
    if (score >= 90) {
      return {
        level: 'excellent',
        label: 'Excellent',
        icon: CheckCircle,
        colorClass: 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30',
        iconColor: 'text-emerald-400'
      };
    } else if (score >= 70) {
      return {
        level: 'good',
        label: 'Good',
        icon: CheckCircle,
        colorClass: 'text-blue-400 bg-blue-500/20 border-blue-500/30',
        iconColor: 'text-blue-400'
      };
    } else if (score >= 50) {
      return {
        level: 'fair',
        label: 'Fair',
        icon: Info,
        colorClass: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30',
        iconColor: 'text-yellow-400'
      };
    } else {
      return {
        level: 'poor',
        label: 'Poor',
        icon: AlertTriangle,
        colorClass: 'text-red-400 bg-red-500/20 border-red-500/30',
        iconColor: 'text-red-400'
      };
    }
  };

  const qualityInfo = getQualityInfo(qualityScore);
  const Icon = qualityInfo.icon;

  const formatAccuracy = (acc) => {
    if (acc < 10) {
      return `±${acc.toFixed(1)}m`;
    } else {
      return `±${acc.toFixed(0)}m`;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border ${qualityInfo.colorClass}`}
    >
      <Icon className={`w-4 h-4 ${qualityInfo.iconColor}`} />
      <div className="flex items-center gap-3">
        <div>
          <div className="text-xs text-gray-400">Location Accuracy</div>
          <div className="text-sm font-semibold text-white">
            {qualityInfo.label} ({formatAccuracy(accuracy)})
          </div>
        </div>

        {qualityScore < 70 && (
          <div className="text-xs text-gray-400 border-l border-gray-700 pl-3">
            Please verify address
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default LocationAccuracyBadge;

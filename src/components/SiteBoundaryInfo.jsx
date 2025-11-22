/**
 * Site Boundary Information Component
 * Displays detected site boundary shape, confidence, and source
 */

import React from 'react';

const SiteBoundaryInfo = ({
  shapeType,
  confidence,
  source,
  area,
  vertexCount,
  onRefine
}) => {
  // Determine confidence color
  const getConfidenceColor = (conf) => {
    if (conf >= 0.8) return 'text-green-600 bg-green-50 border-green-200';
    if (conf >= 0.6) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-orange-600 bg-orange-50 border-orange-200';
  };

  // Get shape icon
  const getShapeIcon = (shape) => {
    const icons = {
      'triangle': '🔺',
      'triangular': '🔺',
      'rectangle': '▭',
      'rectangular': '▭',
      'pentagon': '⬟',
      'L-shaped': '⌐',
      'hexagon': '⬡',
      'irregular': '⬢',
      'polygon': '⬢',
      'complex polygon': '⬢',
      'irregular quadrilateral': '⬢'
    };

    return icons[shape] || '⬢';
  };

  // Get confidence label
  const getConfidenceLabel = (conf) => {
    if (conf >= 0.9) return 'Excellent';
    if (conf >= 0.75) return 'High';
    if (conf >= 0.6) return 'Good';
    if (conf >= 0.4) return 'Moderate';
    return 'Low';
  };

  // Get source badge color
  const getSourceBadgeColor = (src) => {
    if (src?.includes('OpenStreetMap') || src?.includes('OSM')) {
      return 'bg-blue-100 text-blue-800';
    }
    if (src?.includes('Google')) {
      return 'bg-purple-100 text-purple-800';
    }
    if (src?.includes('estimated') || src?.includes('Fallback')) {
      return 'bg-gray-100 text-gray-800';
    }
    return 'bg-indigo-100 text-indigo-800';
  };

  const confidencePercent = Math.round((confidence || 0) * 100);
  const confidenceClass = getConfidenceColor(confidence || 0);

  return (
    <div className="liquid-glass-card rounded-lg border border-white/30 p-4 shadow-lg bg-white/10 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white">
          Detected Site Boundary
        </h3>
        <span className={`text-xs px-2 py-1 rounded-full liquid-glass border border-white/20 text-white/90`}>
          {source || 'Unknown'}
        </span>
      </div>

      <div className="space-y-3">
        {/* Shape Type */}
        <div className="flex items-center justify-between liquid-glass rounded px-2 py-1.5 border border-white/20 bg-white/5">
          <span className="text-sm text-white/90 flex items-center gap-2 font-medium">
            <span className="text-2xl">{getShapeIcon(shapeType)}</span>
            <span>Shape:</span>
          </span>
          <span className="text-sm font-semibold text-white capitalize">
            {shapeType || 'Unknown'}
          </span>
        </div>

        {/* Confidence Score */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/90 font-medium">Confidence:</span>
            <span className={`text-sm font-semibold px-2 py-0.5 rounded border ${
              confidence >= 0.8
                ? 'bg-green-500/30 border-green-400/50 text-green-200'
                : confidence >= 0.6
                ? 'bg-yellow-500/30 border-yellow-400/50 text-yellow-200'
                : 'bg-orange-500/30 border-orange-400/50 text-orange-200'
            }`}>
              {confidencePercent}% · {getConfidenceLabel(confidence)}
            </span>
          </div>

          {/* Confidence Bar */}
          <div className="w-full bg-white/10 rounded-full h-2 border border-white/20">
            <div
              className={`h-2 rounded-full transition-all ${
                confidence >= 0.8
                  ? 'bg-green-400'
                  : confidence >= 0.6
                  ? 'bg-yellow-400'
                  : 'bg-orange-400'
              }`}
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
        </div>

        {/* Area */}
        {area && (
          <div className="flex items-center justify-between liquid-glass rounded px-2 py-1.5 border border-white/20 bg-white/5">
            <span className="text-sm text-white/90 font-medium">Area:</span>
            <span className="text-sm font-semibold text-blue-200">
              {Math.round(area)} m²
            </span>
          </div>
        )}

        {/* Vertices */}
        {vertexCount && (
          <div className="flex items-center justify-between liquid-glass rounded px-2 py-1.5 border border-white/20 bg-white/5">
            <span className="text-sm text-white/90 font-medium">Vertices:</span>
            <span className="text-sm font-semibold text-white">
              {vertexCount} points
            </span>
          </div>
        )}

        {/* Confidence Warning */}
        {confidence < 0.6 && (
          <div className="mt-3 p-2 liquid-glass border border-yellow-400/50 rounded text-xs text-yellow-200 bg-yellow-500/10">
            <strong>⚠️ Low Confidence:</strong> The detected boundary may not be accurate.
            Consider manually adjusting the site boundary for better results.
          </div>
        )}

        {/* Refinement Button */}
        {onRefine && (
          <button
            onClick={onRefine}
            className="btn-premium w-full mt-3 px-4 py-2 text-sm font-semibold rounded-lg flex items-center justify-center gap-2"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            Manually Adjust Boundary
          </button>
        )}
      </div>
    </div>
  );
};

export default SiteBoundaryInfo;

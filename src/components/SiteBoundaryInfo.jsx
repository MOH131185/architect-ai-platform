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
    <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900">
          Detected Site Boundary
        </h3>
        <span className={`text-xs px-2 py-1 rounded-full ${getSourceBadgeColor(source)}`}>
          {source || 'Unknown'}
        </span>
      </div>

      <div className="space-y-3">
        {/* Shape Type */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600 flex items-center gap-2">
            <span className="text-2xl">{getShapeIcon(shapeType)}</span>
            <span>Shape:</span>
          </span>
          <span className="text-sm font-medium text-gray-900 capitalize">
            {shapeType || 'Unknown'}
          </span>
        </div>

        {/* Confidence Score */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Confidence:</span>
            <span className={`text-sm font-medium px-2 py-0.5 rounded border ${confidenceClass}`}>
              {confidencePercent}% · {getConfidenceLabel(confidence)}
            </span>
          </div>

          {/* Confidence Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                confidence >= 0.8
                  ? 'bg-green-500'
                  : confidence >= 0.6
                  ? 'bg-yellow-500'
                  : 'bg-orange-500'
              }`}
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
        </div>

        {/* Area */}
        {area && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Area:</span>
            <span className="text-sm font-medium text-gray-900">
              {Math.round(area)} m²
            </span>
          </div>
        )}

        {/* Vertices */}
        {vertexCount && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Vertices:</span>
            <span className="text-sm font-medium text-gray-900">
              {vertexCount} points
            </span>
          </div>
        )}

        {/* Confidence Warning */}
        {confidence < 0.6 && (
          <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
            <strong>⚠️ Low Confidence:</strong> The detected boundary may not be accurate.
            Consider manually adjusting the site boundary for better results.
          </div>
        )}

        {/* Refinement Button */}
        {onRefine && (
          <button
            onClick={onRefine}
            className="w-full mt-3 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
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

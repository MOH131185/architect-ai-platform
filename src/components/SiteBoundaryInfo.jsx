/**
 * Site Boundary Information Component
 * Displays detected site boundary shape, confidence, and source
 */

import React from "react";
import { readBoundaryAreaM2 } from "../utils/boundaryFields.js";

const SiteBoundaryInfo = ({
  shapeType,
  confidence,
  source,
  area,
  areaM2,
  surfaceAreaM2,
  vertexCount,
  estimateReason,
  boundaryAuthoritative,
  onRefine,
}) => {
  // PR-C Phase 9: read area from any of the supported field names so the
  // legacy `area` UI prop and the modern proxy `areaM2` field both work.
  const resolvedAreaM2 = readBoundaryAreaM2({ area, areaM2, surfaceAreaM2 });
  const isEstimated =
    boundaryAuthoritative === false || Boolean(estimateReason);
  // Get shape icon
  const getShapeIcon = (shape) => {
    const icons = {
      triangle: "🔺",
      triangular: "🔺",
      rectangle: "▭",
      rectangular: "▭",
      pentagon: "⬟",
      "L-shaped": "⌐",
      hexagon: "⬡",
      irregular: "⬢",
      polygon: "⬢",
      "complex polygon": "⬢",
      "irregular quadrilateral": "⬢",
    };

    return icons[shape] || "⬢";
  };

  // Get confidence label
  const getConfidenceLabel = (conf) => {
    if (conf >= 0.9) return "Excellent";
    if (conf >= 0.75) return "High";
    if (conf >= 0.6) return "Good";
    if (conf >= 0.4) return "Moderate";
    return "Low";
  };

  const confidencePercent = Math.round((confidence || 0) * 100);

  return (
    <div className="liquid-glass-card rounded-lg border border-white/30 p-4 shadow-lg bg-white/10 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white">Detected Site Boundary</h3>
        <span
          className={`text-xs px-2 py-1 rounded-full liquid-glass border border-white/20 text-white/90`}
        >
          {source || "Unknown"}
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
            {shapeType || "Unknown"}
          </span>
        </div>

        {/* Confidence Score */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/90 font-medium">
              Confidence:
            </span>
            <span
              className={`text-sm font-semibold px-2 py-0.5 rounded border ${
                confidence >= 0.8
                  ? "bg-green-500/30 border-green-400/50 text-green-200"
                  : confidence >= 0.6
                    ? "bg-yellow-500/30 border-yellow-400/50 text-yellow-200"
                    : "bg-orange-500/30 border-orange-400/50 text-orange-200"
              }`}
            >
              {confidencePercent}% · {getConfidenceLabel(confidence)}
            </span>
          </div>

          {/* Confidence Bar */}
          <div className="w-full bg-white/10 rounded-full h-2 border border-white/20">
            <div
              className={`h-2 rounded-full transition-all ${
                confidence >= 0.8
                  ? "bg-green-400"
                  : confidence >= 0.6
                    ? "bg-yellow-400"
                    : "bg-orange-400"
              }`}
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
        </div>

        {/* Area */}
        {resolvedAreaM2 > 0 && (
          <div className="flex items-center justify-between liquid-glass rounded px-2 py-1.5 border border-white/20 bg-white/5">
            <span className="text-sm text-white/90 font-medium">Area:</span>
            <span className="text-sm font-semibold text-blue-200">
              {Math.round(resolvedAreaM2)} m²
              {isEstimated && (
                <span className="ml-1 text-xs text-orange-200">
                  (estimated)
                </span>
              )}
            </span>
          </div>
        )}

        {/* Estimate reason banner — surfaces the specific demotion cause
            (e.g. parcel_oversized, parcel_landuse_district) so the user can
            verify the boundary manually rather than trusting the contextual
            estimate. */}
        {isEstimated && estimateReason && (
          <div className="flex items-center justify-between liquid-glass rounded px-2 py-1.5 border border-orange-400/40 bg-orange-500/10">
            <span className="text-xs text-orange-100 font-medium">
              Estimate reason:
            </span>
            <span className="text-xs font-semibold text-orange-100">
              {String(estimateReason).replace(/_/g, " ")}
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
            <strong>⚠️ Low Confidence:</strong> The detected boundary may not be
            accurate. Consider manually adjusting the site boundary for better
            results.
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

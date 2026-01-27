/**
 * BoundaryDiagnostics.jsx
 *
 * Real-time validation and metrics overlay for boundary editing.
 *
 * Features:
 * - Area and perimeter display
 * - Segment lengths with live updates
 * - Validation errors and warnings
 * - Self-intersection detection with visual indicator
 *
 * @module BoundaryDiagnostics
 */

import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { validatePolygon, closeRing } from "./boundaryGeometry.js";

/**
 * Format area with appropriate units
 * @param {number} areaM2 - Area in square meters
 * @returns {string}
 */
function formatArea(areaM2) {
  if (areaM2 < 1000) {
    return `${areaM2.toFixed(1)} m²`;
  } else if (areaM2 < 10000) {
    return `${(areaM2 / 1000).toFixed(2)} × 10³ m²`;
  } else {
    return `${(areaM2 / 10000).toFixed(3)} ha`;
  }
}

/**
 * Format length with appropriate units
 * @param {number} lengthM - Length in meters
 * @returns {string}
 */
function formatLength(lengthM) {
  if (lengthM < 1) {
    return `${(lengthM * 100).toFixed(1)} cm`;
  } else if (lengthM < 1000) {
    return `${lengthM.toFixed(2)} m`;
  } else {
    return `${(lengthM / 1000).toFixed(3)} km`;
  }
}

/**
 * Status badge component
 */
function StatusBadge({ valid, label }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
        valid ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
      }`}
    >
      {valid ? "✓" : "✗"} {label}
    </span>
  );
}

/**
 * Metric card component
 */
function MetricCard({ label, value, subValue, icon, color = "blue" }) {
  const colorClasses = {
    blue: "from-blue-500 to-blue-600",
    green: "from-green-500 to-green-600",
    purple: "from-purple-500 to-purple-600",
    amber: "from-amber-500 to-amber-600",
    red: "from-red-500 to-red-600",
  };

  return (
    <div
      className={`bg-gradient-to-br ${colorClasses[color]} rounded-lg p-3 text-white`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium opacity-90">{label}</span>
        {icon && <span className="text-lg opacity-75">{icon}</span>}
      </div>
      <div className="text-xl font-bold mt-1">{value}</div>
      {subValue && <div className="text-xs opacity-75 mt-0.5">{subValue}</div>}
    </div>
  );
}

/**
 * BoundaryDiagnostics Component
 * @param {Object} props
 * @param {Array<[number, number]>} props.vertices - Open ring vertices [lng, lat]
 * @param {boolean} props.showSegments - Show segment details
 * @param {boolean} props.showAngles - Show angle details
 * @param {boolean} props.compact - Compact layout
 */
export function BoundaryDiagnostics({
  vertices = [],
  showSegments = true,
  showAngles = false,
  compact = false,
}) {
  // Compute validation
  const validation = useMemo(() => {
    if (vertices.length < 3) {
      return {
        valid: false,
        errors: ["Need at least 3 vertices"],
        warnings: [],
        metrics: {
          area: 0,
          perimeter: 0,
          vertices: vertices.length,
          segments: [],
          angles: [],
          selfIntersects: false,
        },
      };
    }
    return validatePolygon(closeRing(vertices));
  }, [vertices]);

  const { metrics, errors, warnings, valid } = validation;

  if (vertices.length === 0) {
    return (
      <div className="bg-slate-100 rounded-lg p-4 text-center text-slate-500">
        <p>No boundary defined yet</p>
        <p className="text-sm mt-1">
          Draw or import a boundary to see diagnostics
        </p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-wrap gap-3 items-center">
        <StatusBadge valid={valid} label={valid ? "Valid" : "Invalid"} />

        <span className="text-sm text-slate-600">
          <span className="font-medium">{metrics.vertices}</span> vertices
        </span>

        <span className="text-sm text-slate-600">
          <span className="font-medium">{formatArea(metrics.area)}</span>
        </span>

        <span className="text-sm text-slate-600">
          <span className="font-medium">{formatLength(metrics.perimeter)}</span>{" "}
          perimeter
        </span>

        {metrics.selfIntersects && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            ⚠ Self-intersecting
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Area"
          value={formatArea(metrics.area)}
          subValue={`${(metrics.area * 0.000247105).toFixed(4)} acres`}
          icon="📐"
          color="blue"
        />

        <MetricCard
          label="Perimeter"
          value={formatLength(metrics.perimeter)}
          subValue={`${(metrics.perimeter * 3.28084).toFixed(1)} ft`}
          icon="📏"
          color="green"
        />

        <MetricCard
          label="Vertices"
          value={metrics.vertices}
          subValue="corners"
          icon="📍"
          color="purple"
        />

        <MetricCard
          label="Status"
          value={valid ? "Valid" : "Invalid"}
          subValue={metrics.selfIntersects ? "Self-intersecting" : "OK"}
          icon={valid ? "✓" : "✗"}
          color={valid ? "green" : "red"}
        />
      </div>

      {/* Errors */}
      <AnimatePresence>
        {errors.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-red-50 border border-red-200 rounded-lg p-3"
          >
            <h4 className="font-semibold text-red-900 mb-1 flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              Errors
            </h4>
            <ul className="list-disc list-inside space-y-0.5">
              {errors.map((error, i) => (
                <li key={i} className="text-sm text-red-700">
                  {error}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Warnings */}
      <AnimatePresence>
        {warnings.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-amber-50 border border-amber-200 rounded-lg p-3"
          >
            <h4 className="font-semibold text-amber-900 mb-1 flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              Warnings
            </h4>
            <ul className="list-disc list-inside space-y-0.5">
              {warnings.map((warning, i) => (
                <li key={i} className="text-sm text-amber-700">
                  {warning}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Segment Details */}
      {showSegments && metrics.segments.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-100 px-3 py-2 border-b border-slate-200">
            <h4 className="font-semibold text-slate-800 text-sm">
              Segment Details
            </h4>
          </div>
          <div className="max-h-40 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-600">
                    Seg
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-600">
                    Length
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-600">
                    Bearing
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics.segments.map((seg) => (
                  <tr key={seg.index} className="hover:bg-slate-50">
                    <td className="px-3 py-1.5 text-slate-500">
                      {seg.index + 1}
                    </td>
                    <td className="px-3 py-1.5 font-medium text-slate-700">
                      {formatLength(seg.length)}
                    </td>
                    <td className="px-3 py-1.5 text-slate-600">
                      {seg.bearing.toFixed(1)}°
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Angle Details */}
      {showAngles && metrics.angles.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-100 px-3 py-2 border-b border-slate-200">
            <h4 className="font-semibold text-slate-800 text-sm">
              Interior Angles
            </h4>
          </div>
          <div className="max-h-40 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-600">
                    Vertex
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-600">
                    Angle
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-600">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {metrics.angles.map((ang) => {
                  const isAcute = ang.angle < 30 || ang.angle > 330;
                  return (
                    <tr
                      key={ang.index}
                      className={`hover:bg-slate-50 ${isAcute ? "bg-amber-50" : ""}`}
                    >
                      <td className="px-3 py-1.5 text-slate-500">
                        {ang.index + 1}
                      </td>
                      <td className="px-3 py-1.5 font-medium text-slate-700">
                        {ang.angle.toFixed(1)}°
                      </td>
                      <td className="px-3 py-1.5">
                        {isAcute ? (
                          <span className="text-amber-600 text-xs">Acute</span>
                        ) : (
                          <span className="text-green-600 text-xs">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default BoundaryDiagnostics;

/**
 * BoundaryNumericEditor.jsx
 *
 * Two-tab manual boundary editor:
 * - Coordinates: existing lat/lng table and import/export tools.
 * - Dimensions: segment length/bearing edits for simple numeric refinement.
 *
 * @module BoundaryNumericEditor
 */

import React, { useEffect, useState, useCallback } from "react";
import { VertexTableEditor } from "./VertexTableEditor.jsx";
import {
  calculateAngles,
  calculateSegments,
  closeRing,
  destinationFromBearing,
  normalizeBearing,
  validatePolygon,
} from "./boundaryGeometry.js";

function buildDimensionRows(vertices = []) {
  if (!Array.isArray(vertices) || vertices.length < 3) return [];
  const ring = closeRing(vertices);
  const segments = calculateSegments(ring);
  const angles = calculateAngles(ring);
  return segments.map((segment) => ({
    index: segment.index,
    lengthM: String(Number(segment.length || 0).toFixed(2)),
    bearingDeg: String(Number(segment.bearing || 0).toFixed(1)),
    interiorAngle: Number(angles[segment.index]?.angle || 0),
  }));
}

export function BoundaryNumericEditor({
  vertices = [],
  onVerticesChange,
  onVertexSelect,
  selectedIndex = null,
  disabled = false,
}) {
  const [activeTab, setActiveTab] = useState("coordinates");
  const [dimensionRows, setDimensionRows] = useState(() =>
    buildDimensionRows(vertices),
  );
  const [dimensionError, setDimensionError] = useState("");

  useEffect(() => {
    setDimensionRows(buildDimensionRows(vertices));
    setDimensionError("");
  }, [vertices]);

  const handleDimensionChange = useCallback((index, field, value) => {
    setDimensionRows((rows) =>
      rows.map((row) =>
        row.index === index
          ? {
              ...row,
              [field]: value,
            }
          : row,
      ),
    );
  }, []);

  const handleApplySegment = useCallback(
    (index) => {
      if (disabled) return;
      if (!Array.isArray(vertices) || vertices.length < 3) {
        setDimensionError("A numeric edit needs at least 3 boundary corners.");
        return;
      }

      const row = dimensionRows.find((entry) => entry.index === index);
      const lengthM = Number(row?.lengthM);
      const bearingDeg = normalizeBearing(row?.bearingDeg);
      if (!Number.isFinite(lengthM) || lengthM <= 0 || bearingDeg === null) {
        setDimensionError(
          `Segment ${index + 1} needs a positive length and a valid bearing.`,
        );
        return;
      }

      const nextIndex = (index + 1) % vertices.length;
      const updated = vertices.map((vertex) => [...vertex]);
      const nextVertex = destinationFromBearing(
        updated[index],
        lengthM,
        bearingDeg,
      );
      if (!nextVertex) {
        setDimensionError(`Segment ${index + 1} could not be recalculated.`);
        return;
      }

      updated[nextIndex] = nextVertex;
      const validation = validatePolygon(closeRing(updated));
      if (!validation.valid) {
        setDimensionError(
          validation.errors?.[0] ||
            "Numeric edit creates an invalid boundary polygon.",
        );
        return;
      }

      setDimensionError("");
      onVerticesChange?.(updated);
      onVertexSelect?.(nextIndex);
    },
    [dimensionRows, disabled, onVertexSelect, onVerticesChange, vertices],
  );

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-900 px-4 py-3">
        <h3 className="text-lg font-bold text-white">Manual Boundary Input</h3>
        <p className="text-xs text-slate-300">
          Edit coordinates, paste CSV/GeoJSON/WKT, or refine segment dimensions.
        </p>
        <div className="mt-3 inline-flex rounded-lg border border-slate-600 overflow-hidden">
          <button
            type="button"
            onClick={() => setActiveTab("coordinates")}
            className={`px-3 py-1.5 text-sm font-medium ${
              activeTab === "coordinates"
                ? "bg-white text-slate-900"
                : "bg-slate-800 text-slate-200 hover:bg-slate-700"
            }`}
          >
            Coordinates
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("dimensions")}
            className={`border-l border-slate-600 px-3 py-1.5 text-sm font-medium ${
              activeTab === "dimensions"
                ? "bg-white text-slate-900"
                : "bg-slate-800 text-slate-200 hover:bg-slate-700"
            }`}
          >
            Dimensions
          </button>
        </div>
      </div>

      {activeTab === "coordinates" ? (
        <VertexTableEditor
          vertices={vertices}
          onVerticesChange={onVerticesChange}
          onVertexSelect={onVertexSelect}
          selectedIndex={selectedIndex}
          disabled={disabled}
          embedded
        />
      ) : (
        <div className="p-4 space-y-3" data-testid="boundary-dimensions-editor">
          <div className="text-sm text-slate-600">
            Update a segment length or bearing, then apply it to move the next
            corner from the previous corner.
          </div>

          {dimensionError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {dimensionError}
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-600">
                    Segment
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-600">
                    Length (m)
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-600">
                    Bearing (deg)
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-600">
                    Interior angle
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium uppercase tracking-wider text-slate-600">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dimensionRows.map((row) => (
                  <tr key={row.index}>
                    <td className="px-3 py-2 font-medium text-slate-700">
                      {row.index + 1}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={row.lengthM}
                        aria-label={`Segment ${row.index + 1} length metres`}
                        disabled={disabled}
                        onChange={(event) =>
                          handleDimensionChange(
                            row.index,
                            "lengthM",
                            event.target.value,
                          )
                        }
                        className="w-28 rounded border border-slate-300 px-2 py-1 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="0.1"
                        value={row.bearingDeg}
                        aria-label={`Segment ${row.index + 1} bearing degrees`}
                        disabled={disabled}
                        onChange={(event) =>
                          handleDimensionChange(
                            row.index,
                            "bearingDeg",
                            event.target.value,
                          )
                        }
                        className="w-28 rounded border border-slate-300 px-2 py-1 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-slate-100"
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-600">
                      {row.interiorAngle.toFixed(1)}°
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => handleApplySegment(row.index)}
                        aria-label={`Apply segment ${row.index + 1} dimensions`}
                        className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        Apply
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dimensionRows.length === 0 && (
              <div className="p-6 text-center text-sm text-slate-500">
                Add at least 3 corners before editing dimensions.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default BoundaryNumericEditor;

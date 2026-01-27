/**
 * VertexTableEditor.jsx
 *
 * Table-based vertex editor for precise coordinate input.
 *
 * Features:
 * - Editable lat/lng cells with live preview
 * - Add/Remove rows
 * - Reverse vertex order
 * - CSV paste support (lng,lat format)
 * - GeoJSON/WKT import/export
 * - Computed area/perimeter display
 *
 * @module VertexTableEditor
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  fromCSV,
  toCSV,
  toGeoJSON,
  fromGeoJSON,
  toWKT,
  fromWKT,
  openRing,
  closeRing,
  roundCoord,
  calculateArea,
  calculatePerimeter,
} from "./boundaryGeometry.js";

/**
 * VertexTableEditor Component
 * @param {Object} props
 * @param {Array<[number, number]>} props.vertices - Open ring vertices [lng, lat]
 * @param {Function} props.onVerticesChange - (vertices) => void
 * @param {Function} props.onVertexSelect - (index) => void
 * @param {number} props.selectedIndex - Currently selected vertex
 * @param {boolean} props.disabled - Disable editing
 */
export function VertexTableEditor({
  vertices = [],
  onVerticesChange,
  onVertexSelect,
  selectedIndex = null,
  disabled = false,
}) {
  const [editingCell, setEditingCell] = useState(null); // { row, col }
  const [editValue, setEditValue] = useState("");
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [importFormat, setImportFormat] = useState("csv");

  const inputRef = useRef(null);
  const tableRef = useRef(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  // ============================================================
  // CELL EDITING
  // ============================================================

  const handleCellClick = useCallback(
    (row, col) => {
      if (disabled) return;

      const value = col === 0 ? vertices[row][0] : vertices[row][1];
      setEditingCell({ row, col });
      setEditValue(value.toFixed(7));

      // Also select the vertex
      if (onVertexSelect) {
        onVertexSelect(row);
      }
    },
    [vertices, disabled, onVertexSelect],
  );

  const handleCellChange = useCallback((e) => {
    setEditValue(e.target.value);
  }, []);

  const handleCellBlur = useCallback(() => {
    if (!editingCell) return;

    const { row, col } = editingCell;
    const newValue = parseFloat(editValue);

    if (!isNaN(newValue)) {
      const newVertices = [...vertices];
      const coord = [...newVertices[row]];
      coord[col] = roundCoord(newValue);
      newVertices[row] = coord;

      if (onVerticesChange) {
        onVerticesChange(newVertices);
      }
    }

    setEditingCell(null);
    setEditValue("");
  }, [editingCell, editValue, vertices, onVerticesChange]);

  const handleCellKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter") {
        handleCellBlur();
      } else if (e.key === "Escape") {
        setEditingCell(null);
        setEditValue("");
      } else if (e.key === "Tab") {
        e.preventDefault();
        handleCellBlur();

        // Move to next cell
        if (editingCell) {
          const { row, col } = editingCell;
          if (col === 0) {
            setEditingCell({ row, col: 1 });
            setEditValue(vertices[row][1].toFixed(7));
          } else if (row < vertices.length - 1) {
            setEditingCell({ row: row + 1, col: 0 });
            setEditValue(vertices[row + 1][0].toFixed(7));
          }
        }
      }
    },
    [editingCell, handleCellBlur, vertices],
  );

  // ============================================================
  // ROW OPERATIONS
  // ============================================================

  const handleAddRow = useCallback(() => {
    if (disabled) return;

    // Add new vertex at the end (or after selected)
    const insertIndex =
      selectedIndex !== null ? selectedIndex + 1 : vertices.length;

    // Calculate position (midpoint or offset from last)
    let newCoord;
    if (vertices.length === 0) {
      newCoord = [0, 0];
    } else if (vertices.length === 1) {
      newCoord = [vertices[0][0] + 0.0001, vertices[0][1]];
    } else {
      const prevIndex = insertIndex > 0 ? insertIndex - 1 : vertices.length - 1;
      const nextIndex = insertIndex < vertices.length ? insertIndex : 0;
      newCoord = [
        (vertices[prevIndex][0] + vertices[nextIndex][0]) / 2,
        (vertices[prevIndex][1] + vertices[nextIndex][1]) / 2,
      ];
    }

    const newVertices = [...vertices];
    newVertices.splice(insertIndex, 0, newCoord);

    if (onVerticesChange) {
      onVerticesChange(newVertices);
    }
  }, [vertices, selectedIndex, disabled, onVerticesChange]);

  const handleRemoveRow = useCallback(
    (index) => {
      if (disabled || vertices.length <= 3) return;

      const newVertices = vertices.filter((_, i) => i !== index);

      if (onVerticesChange) {
        onVerticesChange(newVertices);
      }
    },
    [vertices, disabled, onVerticesChange],
  );

  const handleReverseOrder = useCallback(() => {
    if (disabled) return;

    const reversed = [...vertices].reverse();
    if (onVerticesChange) {
      onVerticesChange(reversed);
    }
  }, [vertices, disabled, onVerticesChange]);

  const handleRowClick = useCallback(
    (index) => {
      if (onVertexSelect) {
        onVertexSelect(index);
      }
    },
    [onVertexSelect],
  );

  // ============================================================
  // CLIPBOARD & IMPORT/EXPORT
  // ============================================================

  const handlePaste = useCallback(
    (e) => {
      if (disabled) return;

      const text = e.clipboardData?.getData("text");
      if (!text) return;

      // Try to parse as CSV
      const parsed = fromCSV(text);
      if (parsed.length >= 3) {
        e.preventDefault();
        if (onVerticesChange) {
          onVerticesChange(parsed);
        }
      }
    },
    [disabled, onVerticesChange],
  );

  const handleCopyCSV = useCallback(() => {
    const csv = toCSV(closeRing(vertices));
    navigator.clipboard.writeText(csv).catch(console.error);
  }, [vertices]);

  const handleExportGeoJSON = useCallback(() => {
    const geojson = toGeoJSON(closeRing(vertices));
    const blob = new Blob([JSON.stringify(geojson, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `boundary-${Date.now()}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  }, [vertices]);

  const handleExportWKT = useCallback(() => {
    const wkt = toWKT(closeRing(vertices));
    navigator.clipboard.writeText(wkt).catch(console.error);
  }, [vertices]);

  const handleImport = useCallback(() => {
    if (!importText.trim()) return;

    let parsed = [];

    if (importFormat === "csv") {
      parsed = fromCSV(importText);
    } else if (importFormat === "geojson") {
      try {
        const geojson = JSON.parse(importText);
        parsed = openRing(fromGeoJSON(geojson));
      } catch {
        alert("Invalid GeoJSON format");
        return;
      }
    } else if (importFormat === "wkt") {
      parsed = openRing(fromWKT(importText));
    }

    if (parsed.length >= 3) {
      if (onVerticesChange) {
        onVerticesChange(parsed);
      }
      setShowImportModal(false);
      setImportText("");
    } else {
      alert("Could not parse valid polygon (need at least 3 vertices)");
    }
  }, [importText, importFormat, onVerticesChange]);

  // ============================================================
  // COMPUTED VALUES
  // ============================================================

  const area = vertices.length >= 3 ? calculateArea(closeRing(vertices)) : 0;
  const perimeter =
    vertices.length >= 3 ? calculatePerimeter(closeRing(vertices)) : 0;

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div
      className="bg-white rounded-lg shadow-lg overflow-hidden"
      onPaste={handlePaste}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-4 py-3 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-white">Vertex Table</h3>
          <p className="text-slate-300 text-xs">
            Edit coordinates directly • Paste CSV (lng,lat)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImportModal(true)}
            disabled={disabled}
            className="px-3 py-1.5 bg-slate-600 text-white text-sm rounded hover:bg-slate-500 disabled:opacity-50 transition-colors"
          >
            Import
          </button>
          <button
            onClick={handleCopyCSV}
            disabled={vertices.length === 0}
            className="px-3 py-1.5 bg-slate-600 text-white text-sm rounded hover:bg-slate-500 disabled:opacity-50 transition-colors"
          >
            Copy CSV
          </button>
          <button
            onClick={handleExportGeoJSON}
            disabled={vertices.length < 3}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            Export GeoJSON
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="px-4 py-2 bg-slate-100 flex items-center gap-6 text-sm border-b border-slate-200">
        <span className="text-slate-600">
          <span className="font-medium">{vertices.length}</span> vertices
        </span>
        <span className="text-slate-600">
          Area: <span className="font-medium">{area.toFixed(2)} m²</span>
          <span className="text-slate-400 ml-1">
            ({(area * 0.000247105).toFixed(4)} acres)
          </span>
        </span>
        <span className="text-slate-600">
          Perimeter:{" "}
          <span className="font-medium">{perimeter.toFixed(2)} m</span>
        </span>
      </div>

      {/* Table */}
      <div className="max-h-[400px] overflow-y-auto" ref={tableRef}>
        <table className="w-full">
          <thead className="bg-slate-50 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 uppercase tracking-wider w-16">
                #
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                Longitude (X)
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">
                Latitude (Y)
              </th>
              <th className="px-3 py-2 text-center text-xs font-medium text-slate-600 uppercase tracking-wider w-20">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {vertices.map((vertex, index) => (
              <tr
                key={index}
                onClick={() => handleRowClick(index)}
                className={`cursor-pointer transition-colors ${
                  selectedIndex === index
                    ? "bg-blue-50 border-l-4 border-l-blue-500"
                    : "hover:bg-slate-50"
                }`}
              >
                <td className="px-3 py-2 text-sm font-medium text-slate-500">
                  {index + 1}
                </td>
                <td className="px-3 py-2">
                  {editingCell?.row === index && editingCell?.col === 0 ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={editValue}
                      onChange={handleCellChange}
                      onBlur={handleCellBlur}
                      onKeyDown={handleCellKeyDown}
                      className="w-full px-2 py-1 border border-blue-400 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCellClick(index, 0);
                      }}
                      className="text-sm font-mono text-slate-700 hover:text-blue-600 hover:underline"
                    >
                      {vertex[0].toFixed(7)}
                    </button>
                  )}
                </td>
                <td className="px-3 py-2">
                  {editingCell?.row === index && editingCell?.col === 1 ? (
                    <input
                      ref={inputRef}
                      type="text"
                      value={editValue}
                      onChange={handleCellChange}
                      onBlur={handleCellBlur}
                      onKeyDown={handleCellKeyDown}
                      className="w-full px-2 py-1 border border-blue-400 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCellClick(index, 1);
                      }}
                      className="text-sm font-mono text-slate-700 hover:text-blue-600 hover:underline"
                    >
                      {vertex[1].toFixed(7)}
                    </button>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveRow(index);
                    }}
                    disabled={disabled || vertices.length <= 3}
                    className="text-red-500 hover:text-red-700 disabled:text-slate-300 disabled:cursor-not-allowed"
                    title={
                      vertices.length <= 3
                        ? "Minimum 3 vertices required"
                        : "Remove vertex"
                    }
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {vertices.length === 0 && (
          <div className="p-8 text-center text-slate-500">
            No vertices. Click &quot;Add Vertex&quot; or paste CSV data.
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center gap-2">
        <button
          onClick={handleAddRow}
          disabled={disabled}
          className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-1"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add Vertex
        </button>
        <button
          onClick={handleReverseOrder}
          disabled={disabled || vertices.length < 2}
          className="px-3 py-1.5 bg-slate-200 text-slate-700 text-sm rounded hover:bg-slate-300 disabled:opacity-50 transition-colors"
        >
          Reverse Order
        </button>
        <button
          onClick={handleExportWKT}
          disabled={vertices.length < 3}
          className="px-3 py-1.5 bg-slate-200 text-slate-700 text-sm rounded hover:bg-slate-300 disabled:opacity-50 transition-colors"
          title="Copy as WKT (Well-Known Text)"
        >
          Copy WKT
        </button>
      </div>

      {/* Import Modal */}
      <AnimatePresence>
        {showImportModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowImportModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-lg shadow-xl w-full max-w-lg m-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-slate-200">
                <h4 className="text-lg font-bold text-slate-900">
                  Import Boundary
                </h4>
              </div>

              <div className="p-4 space-y-4">
                {/* Format selector */}
                <div className="flex gap-2">
                  {["csv", "geojson", "wkt"].map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => setImportFormat(fmt)}
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                        importFormat === fmt
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                      }`}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>

                {/* Format hints */}
                <p className="text-xs text-slate-500">
                  {importFormat === "csv" &&
                    "Enter one coordinate pair per line: lng,lat (e.g., -122.4194,37.7749)"}
                  {importFormat === "geojson" &&
                    'Paste a GeoJSON Feature or Geometry object with type "Polygon"'}
                  {importFormat === "wkt" &&
                    "Paste WKT format: POLYGON ((lng1 lat1, lng2 lat2, ...))"}
                </p>

                {/* Input */}
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder={
                    importFormat === "csv"
                      ? "-122.4194,37.7749\n-122.4195,37.7750\n-122.4193,37.7750"
                      : importFormat === "geojson"
                        ? '{"type": "Polygon", "coordinates": [[[lng1, lat1], ...]]}'
                        : "POLYGON ((lng1 lat1, lng2 lat2, ...))"
                  }
                  className="w-full h-40 px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="px-4 py-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={!importText.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  Import
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default VertexTableEditor;

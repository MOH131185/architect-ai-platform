/**
 * Export Panel Component
 * Provides export functionality for generated designs including
 * standard formats (PDF, PNG, DXF) and Blender 3D outputs.
 */

import React from "react";
import {
  Download,
  Box,
  FileSpreadsheet,
  FileText,
  Image,
  Layers,
} from "lucide-react";

/**
 * Download a base64 data URL as a file.
 */
function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Download multiple Blender renders as individual files.
 */
function downloadBlenderRenders(panels) {
  if (!panels || typeof panels !== "object") return;

  Object.entries(panels).forEach(([panelType, panel]) => {
    const dataUrl =
      panel.dataUrl ||
      (panel.base64 ? `data:image/png;base64,${panel.base64}` : null);
    if (dataUrl) {
      downloadDataUrl(dataUrl, `blender_${panelType}.png`);
    }
  });
}

const ExportPanel = ({
  designData,
  blenderOutputs,
  onExport,
  onExportStart,
  onExportComplete,
  onExportError,
}) => {
  const handleExport = (format) => {
    if (onExportStart) onExportStart(format);
    try {
      if (onExport) {
        onExport(format, designData);
      }
      if (onExportComplete) onExportComplete(format, `export.${format}`);
    } catch (err) {
      if (onExportError) onExportError(format, err);
    }
  };

  const hasBlenderRenders =
    blenderOutputs?.panels && Object.keys(blenderOutputs.panels).length > 0;
  const blenderPanelCount = hasBlenderRenders
    ? Object.keys(blenderOutputs.panels).length
    : 0;
  const hasBlendFile = !!blenderOutputs?.manifest?.blendFile;
  const geometryHash = designData?.compiledProject?.geometryHash || null;

  return (
    <div className="export-panel p-4 bg-white rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">Export Options</h3>
      {geometryHash && (
        <p className="mb-4 text-xs text-gray-500 break-all">
          Compiled project authority:{" "}
          <span className="font-mono">{geometryHash}</span>
        </p>
      )}

      {/* Standard exports */}
      <div className="flex flex-col gap-2 mb-4">
        <button
          onClick={() => handleExport("pdf")}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          <FileText className="w-4 h-4" />
          Export as PDF
        </button>
        <button
          onClick={() => handleExport("png")}
          className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
        >
          <Image className="w-4 h-4" />
          Export as PNG
        </button>
        <button
          onClick={() => handleExport("dxf")}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          <Download className="w-4 h-4" />
          Export as DXF (CAD)
        </button>
        <button
          onClick={() => handleExport("ifc")}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
        >
          <Box className="w-4 h-4" />
          Export as IFC (BIM)
        </button>
        <button
          onClick={() => handleExport("xlsx")}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-700 text-white rounded hover:bg-emerald-800"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Export Excel Estimate
        </button>
      </div>

      {/* Blender 3D exports */}
      {hasBlenderRenders && (
        <>
          <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-4">
            3D Renders
          </h4>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => downloadBlenderRenders(blenderOutputs.panels)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
            >
              <Layers className="w-4 h-4" />
              Download All Renders ({blenderPanelCount} views)
            </button>

            {hasBlendFile && (
              <button
                onClick={() => handleExport("blend")}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
              >
                <Box className="w-4 h-4" />
                Download .blend File
              </button>
            )}

            <button
              onClick={() => handleExport("glb")}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded hover:bg-teal-700"
            >
              <Box className="w-4 h-4" />
              Export GLB Model
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default ExportPanel;

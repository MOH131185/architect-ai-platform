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
  Braces,
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
  const handleExport = async (format) => {
    if (onExportStart) onExportStart(format);
    try {
      if (onExport) {
        await onExport(format, designData);
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
  const exportManifest =
    designData?.exportManifest ||
    designData?.sheetArtifactManifest?.exportManifest ||
    designData?.metadata?.exportManifest ||
    null;
  const exportsMap = exportManifest?.exports || {};
  const availableExportCount = Object.values(exportsMap).filter(
    (entry) => entry?.available,
  ).length;
  const totalExportCount = Object.keys(exportsMap).length;

  const exportButtons = [
    {
      key: "pdf",
      label: "Export as PDF",
      format: "pdf",
      icon: <FileText className="w-4 h-4" />,
      className: "bg-blue-600 hover:bg-blue-700",
      available: exportsMap?.pdf?.available !== false,
    },
    {
      key: "png",
      label: "Export as PNG",
      format: "png",
      icon: <Image className="w-4 h-4" />,
      className: "bg-gray-600 hover:bg-gray-700",
      available: exportsMap?.png?.available !== false,
    },
    {
      key: "json",
      label: "Export Authority JSON",
      format: "json",
      icon: <Braces className="w-4 h-4" />,
      className: "bg-slate-700 hover:bg-slate-800",
      available: exportsMap?.json?.available === true,
    },
    {
      key: "dxf",
      label: "Export as DXF (CAD)",
      format: "dxf",
      icon: <Download className="w-4 h-4" />,
      className: "bg-green-600 hover:bg-green-700",
      available: exportsMap?.dxf?.available === true || Boolean(geometryHash),
    },
    {
      key: "ifc",
      label: "Export as IFC (BIM)",
      format: "ifc",
      icon: <Box className="w-4 h-4" />,
      className: "bg-indigo-600 hover:bg-indigo-700",
      available: exportsMap?.ifc?.available === true || Boolean(geometryHash),
    },
    {
      key: "xlsx",
      label: "Export Excel Estimate",
      format: "xlsx",
      icon: <FileSpreadsheet className="w-4 h-4" />,
      className: "bg-emerald-700 hover:bg-emerald-800",
      available: exportsMap?.xlsx?.available === true,
    },
  ];

  return (
    <div className="export-panel p-4 bg-white rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">Export Options</h3>
      {geometryHash && (
        <p className="mb-4 text-xs text-gray-500 break-all">
          Compiled project authority:{" "}
          <span className="font-mono">{geometryHash}</span>
        </p>
      )}
      {exportManifest && (
        <div className="mb-4 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          <div className="font-semibold text-slate-800">Delivery manifest</div>
          <div className="mt-1">
            {availableExportCount}/{totalExportCount} architect-grade exports
            are ready from the compiled bundle.
          </div>
        </div>
      )}

      {/* Standard exports */}
      <div className="flex flex-col gap-2 mb-4">
        {exportButtons.map((button) => (
          <button
            key={button.key}
            onClick={() => void handleExport(button.format)}
            disabled={!button.available}
            className={`flex items-center justify-between gap-2 rounded px-4 py-2 text-white ${
              button.available
                ? button.className
                : "cursor-not-allowed bg-slate-300 text-slate-600"
            }`}
          >
            <span className="flex items-center gap-2">
              {button.icon}
              {button.label}
            </span>
            <span className="text-[11px] uppercase tracking-wide">
              {button.available ? "Ready" : "Blocked"}
            </span>
          </button>
        ))}
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

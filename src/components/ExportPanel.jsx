/**
 * Export Panel Component
 * Provides export functionality for generated designs
 */

import React from "react";
import { Download } from "lucide-react";

const ExportPanel = ({ designData, onExport }) => {
  const handleExport = (format) => {
    if (onExport) {
      onExport(format, designData);
    }
  };

  return (
    <div className="export-panel p-4 bg-white rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">Export Options</h3>
      <div className="flex flex-col gap-2">
        <button
          onClick={() => handleExport("pdf")}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          <Download className="w-4 h-4" />
          Export as PDF
        </button>
        <button
          onClick={() => handleExport("png")}
          className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
        >
          <Download className="w-4 h-4" />
          Export as PNG
        </button>
      </div>
    </div>
  );
};

export default ExportPanel;

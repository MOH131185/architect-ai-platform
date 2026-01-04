/**
 * ExportPanel Component
 * Provides CAD/BIM export functionality for architectural designs.
 */

import React, { useState } from "react";
import { Card } from "./ui/Card";
import { Button } from "./ui/Button";
import { Download, FileText, Box, Loader2 } from "lucide-react";

const EXPORT_FORMATS = [
  { id: "dxf", name: "DXF", description: "2D AutoCAD drawing", icon: FileText },
  {
    id: "dwg",
    name: "DWG",
    description: "AutoCAD native format",
    icon: FileText,
  },
  { id: "ifc", name: "IFC", description: "BIM exchange format", icon: Box },
  { id: "pdf", name: "PDF", description: "A1 sheet PDF", icon: FileText },
];

export default function ExportPanel({
  geometryDNA,
  populatedGeometry,
  masterDNA,
  a1SheetData,
  meshy3D,
  projectInfo,
  onExportStart,
  onExportComplete,
  onExportError,
}) {
  const [exporting, setExporting] = useState(null);

  const handleExport = async (format) => {
    try {
      setExporting(format);
      onExportStart?.(format);

      // Simulate export delay (real implementation would call export service)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const filename = `${projectInfo?.name || "design"}_${Date.now()}.${format}`;
      onExportComplete?.(format, filename);

      // Show download message
      console.log(`Export complete: ${filename}`);
    } catch (error) {
      console.error(`Export failed for ${format}:`, error);
      onExportError?.(format, error);
    } finally {
      setExporting(null);
    }
  };

  return (
    <Card className="p-6 bg-gray-900/50 border-gray-700">
      <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
        <Download className="w-5 h-5 text-blue-400" />
        Professional Exports
      </h3>

      <p className="text-gray-400 text-sm mb-4">
        Export your design to industry-standard CAD and BIM formats for further
        development.
      </p>

      <div className="grid grid-cols-2 gap-3">
        {EXPORT_FORMATS.map((format) => {
          const Icon = format.icon;
          const isExporting = exporting === format.id;

          return (
            <Button
              key={format.id}
              variant="outline"
              className="flex items-center justify-start gap-3 p-4 h-auto"
              onClick={() => handleExport(format.id)}
              disabled={!!exporting}
            >
              {isExporting ? (
                <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              ) : (
                <Icon className="w-5 h-5 text-gray-400" />
              )}
              <div className="text-left">
                <div className="font-medium text-white">{format.name}</div>
                <div className="text-xs text-gray-500">
                  {format.description}
                </div>
              </div>
            </Button>
          );
        })}
      </div>

      {/* Export status */}
      {exporting && (
        <div className="mt-4 p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
          <p className="text-sm text-blue-300">
            Generating {exporting.toUpperCase()} export...
          </p>
        </div>
      )}
    </Card>
  );
}

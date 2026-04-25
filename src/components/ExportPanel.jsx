/**
 * Export Panel — On-brand dark blueprint surface.
 *
 * Provides export options for generated designs grouped into:
 *   • Documents  (PDF, PNG)
 *   • Engineering (DXF, IFC, JSON, Excel)
 *   • 3D Models  (Renders, .blend, GLB)
 *
 * Each row shows: icon · label · format chip · status chip · tooltip.
 * Emits success/error toasts via ToastProvider.
 */

import React from "react";
import {
  Download,
  Box,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Braces,
  Layers,
} from "lucide-react";
import Card from "./ui/Card.jsx";
import Button from "./ui/Button.jsx";
import StatusChip from "./ui/StatusChip.jsx";
import { Tooltip } from "./ui/feedback/Tooltip.jsx";
import { useToastContext } from "./ui/ToastProvider.jsx";

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
  if (!panels || typeof panels !== "object") return 0;
  let count = 0;
  Object.entries(panels).forEach(([panelType, panel]) => {
    const dataUrl =
      panel.dataUrl ||
      (panel.base64 ? `data:image/png;base64,${panel.base64}` : null);
    if (dataUrl) {
      downloadDataUrl(dataUrl, `blender_${panelType}.png`);
      count += 1;
    }
  });
  return count;
}

/**
 * Single export row — consistent layout regardless of format.
 */
const ExportRow = ({
  icon: Icon,
  label,
  formatChip,
  available,
  blockedReason,
  tooltip,
  onClick,
}) => {
  const status = available ? "ready" : "blocked";
  const statusTooltip = available
    ? "Generated and ready to download"
    : blockedReason || "Not yet generated";

  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={!available}
      className="group flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition-all duration-200 hover:border-white/20 hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-royal-500/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white/[0.03]"
    >
      <span
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border ${
          available
            ? "bg-royal-600/10 border-royal-600/20 text-royal-300"
            : "bg-white/5 border-white/10 text-white/30"
        }`}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>

      <span className="flex-1 truncate text-sm font-medium text-white/85">
        {label}
      </span>

      {formatChip && (
        <span className="hidden rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/55 sm:inline-flex">
          {formatChip}
        </span>
      )}

      <StatusChip status={status} size="sm" tooltip={statusTooltip} />
    </button>
  );

  if (tooltip) {
    return (
      <Tooltip content={tooltip} side="left">
        {button}
      </Tooltip>
    );
  }

  return button;
};

/**
 * Section grouping (Documents / Engineering / 3D Models).
 */
const ExportSection = ({ title, children }) => (
  <div className="mb-5 last:mb-0">
    <h4 className="text-eyebrow mb-2.5">{title}</h4>
    <div className="flex flex-col gap-2">{children}</div>
  </div>
);

const ExportPanel = ({
  designData,
  blenderOutputs,
  onExport,
  onExportStart,
  onExportComplete,
  onExportError,
}) => {
  const { toast } = useToastContext();

  const handleExport = async (format, label) => {
    if (onExportStart) onExportStart(format);
    try {
      if (onExport) {
        await onExport(format, designData);
      }
      if (onExportComplete) onExportComplete(format, `export.${format}`);
      toast.success(
        "Export complete",
        `${label || format.toUpperCase()} downloaded.`,
      );
    } catch (err) {
      if (onExportError) onExportError(format, err);
      toast.error(
        "Export failed",
        err?.message || `Could not export ${format.toUpperCase()}.`,
      );
    }
  };

  const handleBlenderBundle = () => {
    const count = downloadBlenderRenders(blenderOutputs?.panels);
    if (count > 0) {
      toast.success("Renders downloaded", `${count} 3D views saved.`);
    } else {
      toast.warning("Nothing to download", "No Blender renders found.");
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

  // Per-format availability + blocked-reason logic.
  const isAvailable = (key, fallback = true) =>
    exportsMap?.[key]?.available !== undefined
      ? exportsMap[key].available === true
      : fallback;

  const blockedReason = (key) =>
    exportsMap?.[key]?.blockedReason ||
    "Not part of the current compiled bundle.";

  return (
    <Card variant="glass" padding="md" className="export-panel">
      {/* Header */}
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white/95">
            Export Options
          </h3>
          {exportManifest && (
            <p className="mt-1 text-xs text-white/55 tabular-nums">
              {availableExportCount}/{totalExportCount} exports ready from the
              compiled bundle.
            </p>
          )}
        </div>
      </div>

      {geometryHash && (
        <div className="mb-5 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-[11px] text-white/55">
          <span className="text-eyebrow mr-2">Authority</span>
          <span className="font-mono break-all text-white/70">
            {geometryHash}
          </span>
        </div>
      )}

      {/* Documents */}
      <ExportSection title="Documents">
        <ExportRow
          icon={FileText}
          label="Export as PDF"
          formatChip="PDF"
          available={isAvailable("pdf", true)}
          blockedReason={blockedReason("pdf")}
          tooltip="Print-ready A1 sheet, vector text where possible."
          onClick={() => void handleExport("pdf", "PDF sheet")}
        />
        <ExportRow
          icon={ImageIcon}
          label="Export as PNG"
          formatChip="PNG"
          available={isAvailable("png", true)}
          blockedReason={blockedReason("png")}
          tooltip="Raster image of the A1 sheet at full resolution."
          onClick={() => void handleExport("png", "PNG image")}
        />
      </ExportSection>

      {/* Engineering */}
      <ExportSection title="Engineering">
        <ExportRow
          icon={Download}
          label="Export as DXF (CAD)"
          formatChip="CAD"
          available={isAvailable("dxf", false) || Boolean(geometryHash)}
          blockedReason="Requires compiled geometry."
          tooltip="Industry-standard CAD format for AutoCAD / Revit / ArchiCAD."
          onClick={() => void handleExport("dxf", "DXF file")}
        />
        <ExportRow
          icon={Box}
          label="Export as IFC (BIM)"
          formatChip="BIM"
          available={isAvailable("ifc", false) || Boolean(geometryHash)}
          blockedReason="Requires compiled geometry."
          tooltip="OpenBIM format for Revit / ArchiCAD / Tekla / Solibri."
          onClick={() => void handleExport("ifc", "IFC file")}
        />
        <ExportRow
          icon={Braces}
          label="Export Authority JSON"
          formatChip="JSON"
          available={isAvailable("json", false)}
          blockedReason="JSON authority bundle not in this manifest."
          tooltip="Structured authority bundle of the design (DNA + manifest)."
          onClick={() => void handleExport("json", "Authority JSON")}
        />
        <ExportRow
          icon={FileSpreadsheet}
          label="Export Excel Estimate"
          formatChip="XLSX"
          available={isAvailable("xlsx", false)}
          blockedReason="Excel cost workbook not in this manifest."
          tooltip="Cost estimate workbook with quantities and rates."
          onClick={() => void handleExport("xlsx", "Excel estimate")}
        />
      </ExportSection>

      {/* 3D Models */}
      {hasBlenderRenders && (
        <ExportSection title="3D Models">
          <ExportRow
            icon={Layers}
            label={`Download All Renders (${blenderPanelCount} views)`}
            formatChip="3D"
            available={true}
            tooltip="Bundle download of all Blender-rendered viewpoints."
            onClick={handleBlenderBundle}
          />
          {hasBlendFile && (
            <ExportRow
              icon={Box}
              label="Download .blend File"
              formatChip="BLEND"
              available={true}
              tooltip="Native Blender source file for further editing."
              onClick={() => void handleExport("blend", "Blender file")}
            />
          )}
          <ExportRow
            icon={Box}
            label="Export GLB Model"
            formatChip="GLB"
            available={true}
            tooltip="glTF binary — opens in three.js / Unreal / Unity / Sketchfab."
            onClick={() => void handleExport("glb", "GLB model")}
          />
        </ExportSection>
      )}

      {/* Footer hint when no manifest exists yet */}
      {!exportManifest && !hasBlenderRenders && (
        <Button
          variant="subtle"
          size="sm"
          fullWidth
          disabled
          className="!py-2 mt-2"
        >
          Generate a design to unlock exports
        </Button>
      )}
    </Card>
  );
};

export default ExportPanel;

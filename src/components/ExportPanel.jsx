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

import React, { useMemo, useState } from "react";
import {
  Download,
  Archive,
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
import exportService from "../services/exportService.js";
import buildClientExportManifest, {
  applyHistoryRestoreGate,
} from "../services/export/buildClientExportManifest.js";
import ArtifactHistoryPanel from "./export/ArtifactHistoryPanel.jsx";

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

function hasDeliverablePackageArtifacts(designData = {}) {
  const artifacts = designData?.artifacts || {};
  const compiledProject =
    designData?.compiledProject ||
    designData?.a1Sheet?.compiledProject ||
    designData?.metadata?.compiledProject ||
    null;
  const designUrlIsData =
    typeof designData?.url === "string" && designData.url.startsWith("data:");
  const designPdfUrlIsData =
    typeof designData?.pdfUrl === "string" &&
    designData.pdfUrl.startsWith("data:");

  return Boolean(
    compiledProject?.geometryHash ||
    artifacts?.a1Sheet?.svgString ||
    artifacts?.a1Sheet?.svg ||
    artifacts?.a1Pdf?.dataUrl ||
    artifacts?.a1Pdf?.pdfDataUrl ||
    artifacts?.a1Png?.dataUrl ||
    artifacts?.renderedProof?.dataUrl ||
    artifacts?.dxf ||
    artifacts?.drawings ||
    artifacts?.qaReport ||
    designData?.a1Sheet?.svgString ||
    designData?.a1Sheet?.svg ||
    designData?.a1Pdf?.dataUrl ||
    designData?.a1Pdf?.pdfDataUrl ||
    designUrlIsData ||
    designPdfUrlIsData,
  );
}

/**
 * Single export row — consistent layout regardless of format.
 *
 * Phase 2 export-fix: when `available === false` and the manifest carries a
 * blockedReason, render the reason as inline secondary text under the row
 * label. Previously the reason was only surfaced via a hover tooltip on the
 * StatusChip, which was effectively invisible to users on touch devices and
 * to anyone scanning the panel without hovering. The chip + tooltip remain
 * for screen-reader compatibility; the inline text is the primary signal.
 */
const ExportRow = ({
  icon: Icon,
  label,
  formatChip,
  available,
  blockedReason,
  statusLabel,
  tooltip,
  onClick,
}) => {
  const status = available ? "ready" : "blocked";
  const statusTooltip = available
    ? "Generated and ready to download"
    : blockedReason || "Not yet generated";
  const showInlineReason = !available && Boolean(blockedReason);

  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={!available}
      className="group flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition-all duration-200 hover:border-white/20 hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-royal-500/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white/[0.03]"
      data-export-status={status}
      data-export-blocked-reason={showInlineReason ? blockedReason : undefined}
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

      <span className="flex flex-1 min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-white/85">
          {label}
        </span>
        {showInlineReason && (
          <span
            className="mt-0.5 truncate text-[11px] leading-snug text-amber-300/80"
            data-testid="export-blocked-reason"
          >
            {blockedReason}
          </span>
        )}
      </span>

      {formatChip && (
        <span className="hidden rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/55 sm:inline-flex">
          {formatChip}
        </span>
      )}

      <StatusChip
        status={status}
        size="sm"
        label={statusLabel}
        tooltip={statusTooltip}
      />
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
  const initialPackageHistory = useMemo(() => {
    const history =
      designData?.artifactPackageHistory ||
      designData?.metadata?.artifactPackageHistory ||
      [];
    return Array.isArray(history) ? history : [];
  }, [designData]);
  const [packageAction, setPackageAction] = useState(null);
  const [historyRefreshTick, setHistoryRefreshTick] = useState(0);

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

  const handleSavePackage = async () => {
    if (!deliverablesReady) return;
    setPackageAction("storing");
    try {
      await exportService.storeDeliverablesPackage({
        sheet: designData,
      });
      setHistoryRefreshTick((tick) => tick + 1);
      toast.success(
        "Package saved",
        "Deliverables ZIP stored for this project.",
      );
    } catch (err) {
      toast.error(
        "Save failed",
        err?.message || "Could not store deliverables ZIP.",
      );
    } finally {
      setPackageAction(null);
    }
  };

  const hasBlenderRenders =
    blenderOutputs?.panels && Object.keys(blenderOutputs.panels).length > 0;
  const blenderPanelCount = hasBlenderRenders
    ? Object.keys(blenderOutputs.panels).length
    : 0;
  const hasBlendFile = !!blenderOutputs?.manifest?.blendFile;

  // Phase 2: prefer the top-level `geometryHash` the workflow now attaches.
  // It survives design-history hydration even when `compiledProject` does not
  // (the compactor strips compiledProject on save — see designHistoryRepository
  // compactA1SheetForHistory). Falling back to `compiledProject?.geometryHash`
  // keeps the existing freshly-generated path intact.
  const geometryHash =
    designData?.geometryHash ||
    designData?.compiledProject?.geometryHash ||
    designData?.compiledProjectExportSummary?.geometryHash ||
    null;
  // Manifest resolution priority: server-attached > sheet-artifact >
  // metadata > in-component synthesis. The synthesis kicks in only when
  // (a) no upstream manifest is present and (b) compiledProject exists —
  // it reuses the same buildClientExportManifest the hook uses, so the
  // authority gates (IFC_GEOMETRY_INSUFFICIENT etc.) are identical.
  // Without this fallback a single dropped result.exportManifest would
  // silently render every engineering row BLOCKED with no reason text.
  const exportManifest = useMemo(() => {
    const fromResult =
      designData?.exportManifest ||
      designData?.sheetArtifactManifest?.exportManifest ||
      designData?.metadata?.exportManifest ||
      null;
    const baseManifest =
      fromResult ||
      (designData?.compiledProject
        ? buildClientExportManifest({
            compiledProject: designData.compiledProject,
            projectQuantityTakeoff:
              designData?.projectQuantityTakeoff ||
              designData?.artifacts?.projectQuantityTakeoff ||
              null,
            geometryHash:
              designData?.geometryHash ||
              designData?.compiledProject?.geometryHash ||
              null,
            projectName: designData?.projectGraph?.brief?.project_name,
            pipelineVersion: designData?.pipelineVersion,
          })
        : null);

    // Phase 2 amendment — restored-history gate. A design reloaded from
    // history carries `restoredFromHistory: true` and (per design) NO
    // `compiledProject`: the compactor strips it on save to stay under the
    // localStorage budget. The hydrator's restored manifest still claims
    // DXF/IFC/JSON/XLSX were ready at generation time, but those exporters
    // cannot execute now without the in-scope compiledProject body — so
    // ExportPanel must NOT show those rows as clickable READY. The gate
    // preserves the rest of the manifest (geometryHash, schema_version,
    // PNG/PDF rows, etc.) so the Authority chip and sheet exports still
    // work normally.
    return applyHistoryRestoreGate({
      manifest: baseManifest,
      restoredFromHistory: designData?.restoredFromHistory === true,
      hasCompiledProject: Boolean(designData?.compiledProject),
    });
  }, [designData]);
  const exportsMap = exportManifest?.exports || {};
  const availableExportCount = Object.values(exportsMap).filter(
    (entry) => entry?.available,
  ).length;
  const totalExportCount = Object.keys(exportsMap).length;
  const deliverablesReady = hasDeliverablePackageArtifacts(designData);

  // Per-format availability + blocked-reason logic. Readiness is driven
  // entirely by the manifest the pipeline (or the client-side fallback in
  // useArchitectAIWorkflow) attached to the result; we do NOT shortcut
  // engineering rows on geometryHash alone, because that historically
  // mislabelled IFC as READY when no real IFC artifact had been produced.
  const isAvailable = (key, fallback = true) =>
    exportsMap?.[key]?.available !== undefined
      ? exportsMap[key].available === true
      : fallback;

  // Map structured codes from buildClientExportManifest to readable
  // strings. Unknown codes fall through verbatim — better than swallowing
  // a useful diagnostic.
  const BLOCKED_REASON_LABELS = {
    COMPILED_PROJECT_MISSING: "Compiled project not generated yet.",
    GEOMETRY_HASH_MISSING: "Compiled geometry unavailable.",
    IFC_EXPORT_UNAVAILABLE:
      "IFC export disabled — no real exporter configured.",
    IFC_GEOMETRY_INSUFFICIENT:
      "Not enough compiled geometry for a meaningful IFC export.",
    QUANTITY_TAKEOFF_UNAVAILABLE:
      "Quantity takeoff not produced for this project type.",
    DWG_CONVERSION_UNAVAILABLE: "DWG conversion provider not configured.",
    AUTHORITY_JSON_UNAVAILABLE: "Authority JSON not available.",
    REGENERATE_REQUIRED_FOR_ENGINEERING_EXPORT:
      "Regenerate required — compiled project was not persisted in history.",
    A1_QA_BLOCKED:
      "A1 export blocked — sheet failed final layout/readability QA.",
  };

  const blockedReason = (key) => {
    const raw = exportsMap?.[key]?.blockedReason;
    if (!raw) return "Not part of the current compiled bundle.";
    return BLOCKED_REASON_LABELS[raw] || raw;
  };

  // Phase 3 export-fix: when the final-A1 export QA gate flags status
  // "blocked", PNG / PDF / SVG sheet exports must be disabled — the
  // print master failed layout / readability validation and shipping it
  // would produce an unprintable artifact. Engineering rows (DXF / IFC /
  // JSON / XLSX) keep their Phase 2 readiness logic; QA blocking targets
  // the SHEET artifact, not the compiled-project bundle. Status "warning"
  // keeps export available but a banner above the rows surfaces the
  // warning count.
  const a1ExportQa = designData?.a1ExportQa || null;
  const sheetQaBlocked = a1ExportQa?.status === "blocked";
  const sheetQaWarning = a1ExportQa?.status === "warning";
  const sheetQaBlockerSummary =
    Array.isArray(a1ExportQa?.blockers) && a1ExportQa.blockers.length > 0
      ? `${a1ExportQa.blockers.length} blocker${a1ExportQa.blockers.length === 1 ? "" : "s"}`
      : null;
  const SHEET_EXPORT_KEYS = ["png", "pdf", "svg"];
  const isSheetKey = (key) =>
    SHEET_EXPORT_KEYS.includes(String(key || "").toLowerCase());

  const sheetExportAvailable = (key, manifestFallback = true) => {
    if (sheetQaBlocked && isSheetKey(key)) return false;
    return isAvailable(key, manifestFallback);
  };

  const sheetExportBlockedReason = (key) => {
    if (sheetQaBlocked && isSheetKey(key)) {
      return BLOCKED_REASON_LABELS.A1_QA_BLOCKED;
    }
    return blockedReason(key);
  };

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

      {/* Phase 3 export-fix: surface final-A1 QA status so the user knows
          WHY sheet exports are disabled (or downgraded). The banner sits
          ABOVE the export rows so it's visible before the user attempts
          to download a print master. */}
      {sheetQaBlocked && (
        <div
          className="mb-5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200"
          data-testid="a1-qa-blocked-banner"
          data-a1-qa-status="blocked"
        >
          <span className="text-eyebrow mr-2 text-rose-200">A1 QA</span>
          <span className="font-medium">
            A1 export blocked — sheet failed final layout/readability QA.
          </span>
          {sheetQaBlockerSummary && (
            <span className="ml-1 text-rose-300/80">
              ({sheetQaBlockerSummary})
            </span>
          )}
        </div>
      )}
      {sheetQaWarning && !sheetQaBlocked && (
        <div
          className="mb-5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200"
          data-testid="a1-qa-warning-banner"
          data-a1-qa-status="warning"
        >
          <span className="text-eyebrow mr-2 text-amber-200">A1 QA</span>
          <span className="font-medium">
            A1 export passed with warnings — review before final print.
          </span>
        </div>
      )}

      {/* Documents */}
      <ExportSection title="Documents">
        <ExportRow
          icon={Archive}
          label="Download Deliverables ZIP"
          formatChip="ZIP"
          available={deliverablesReady}
          blockedReason="Generate first"
          statusLabel={deliverablesReady ? undefined : "Generate first"}
          tooltip="Deterministic package with manifest, QA report, drawings, CAD, and source gaps."
          onClick={() => void handleExport("zip", "Deliverables ZIP")}
        />
        <ExportRow
          icon={Archive}
          label="Save Package"
          formatChip="ZIP"
          available={deliverablesReady && packageAction !== "storing"}
          blockedReason="Generate first"
          statusLabel={packageAction === "storing" ? "Saving" : "Store"}
          tooltip="Persist the deterministic deliverables package and record package history."
          onClick={() => void handleSavePackage()}
        />
        <ArtifactHistoryPanel
          sheet={designData}
          initialHistory={initialPackageHistory}
          refreshSignal={historyRefreshTick}
        />
        <ExportRow
          icon={FileText}
          label="Export as PDF"
          formatChip="PDF"
          available={sheetExportAvailable("pdf", true)}
          blockedReason={sheetExportBlockedReason("pdf")}
          tooltip="Print-ready A1 sheet, vector text where possible."
          onClick={() => void handleExport("pdf", "PDF sheet")}
        />
        <ExportRow
          icon={ImageIcon}
          label="Export as PNG"
          formatChip="PNG"
          available={sheetExportAvailable("png", true)}
          blockedReason={sheetExportBlockedReason("png")}
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
          available={isAvailable("dxf", false)}
          blockedReason={blockedReason("dxf")}
          tooltip="Industry-standard CAD format for AutoCAD / Revit / ArchiCAD."
          onClick={() => void handleExport("dxf", "DXF file")}
        />
        <ExportRow
          icon={Box}
          label="Export as IFC (BIM)"
          formatChip="BIM"
          available={isAvailable("ifc", false)}
          blockedReason={blockedReason("ifc")}
          tooltip="OpenBIM format for Revit / ArchiCAD / Tekla / Solibri."
          onClick={() => void handleExport("ifc", "IFC file")}
        />
        <ExportRow
          icon={Braces}
          label="Export Authority JSON"
          formatChip="JSON"
          available={isAvailable("json", false)}
          blockedReason={blockedReason("json")}
          tooltip="Structured authority bundle of the design (DNA + manifest)."
          onClick={() => void handleExport("json", "Authority JSON")}
        />
        <ExportRow
          icon={FileSpreadsheet}
          label="Export Excel Estimate"
          formatChip="XLSX"
          available={isAvailable("xlsx", false)}
          blockedReason={blockedReason("xlsx")}
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

      {/* Footer hint when there is genuinely nothing to export yet.
          Hidden once any deliverable surface exists: manifest, renders,
          deliverables bundle, or a compiled geometry hash. */}
      {!exportManifest &&
        !hasBlenderRenders &&
        !deliverablesReady &&
        !geometryHash && (
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

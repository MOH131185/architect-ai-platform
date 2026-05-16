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
  Copy,
  Check,
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
import CostSummaryPanel from "./CostSummaryPanel.jsx";

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
  status: statusOverride,
  subtitle,
  tooltip,
  onClick,
}) => {
  // Track 1 (Phase 1) + Codex audit response: explicit `status` override
  // lets the parent mark a row as "degraded" — visually amber, button
  // stays enabled (the PDF was emitted with a PRELIMINARY watermark) but
  // it must NEVER render as plain green READY. `subtitle` carries the
  // always-visible warning line ("NOT FINAL — not for issue or
  // construction"). Without the override we fall back to the historical
  // available → ready / blocked derivation.
  const derivedStatus = available ? "ready" : "blocked";
  const status = statusOverride || derivedStatus;
  const isDegraded = status === "degraded";
  const isBlocked = status === "blocked";
  const isReady = status === "ready";

  // Disable the button only for hard-blocked rows. Degraded rows stay
  // clickable so the user can still download the stamped PDF.
  const isDisabled = isBlocked || (!available && !isDegraded);

  const statusTooltip = isBlocked
    ? blockedReason || "Not yet generated"
    : isDegraded
      ? subtitle ||
        "Degraded export — PRELIMINARY, not for issue or construction"
      : "Generated and ready to download";

  // Chip mapping: "degraded" routes through StatusChip's amber "warning"
  // variant with a PRELIMINARY label so the row visually departs from
  // ready/blocked. Chip label override wins if `statusLabel` is supplied.
  const chipStatus = isDegraded ? "warning" : isReady ? "ready" : "blocked";
  const chipLabel = statusLabel || (isDegraded ? "PRELIMINARY" : undefined);

  const showBlockedReason = isBlocked && Boolean(blockedReason);
  const showSubtitle = !showBlockedReason && Boolean(subtitle);

  const iconContainerClass = isDegraded
    ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
    : isReady
      ? "bg-royal-600/10 border-royal-600/20 text-royal-300"
      : "bg-white/5 border-white/10 text-white/30";

  const buttonClass = isDegraded
    ? "group flex w-full items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.04] px-4 py-3 text-left transition-all duration-200 hover:border-amber-500/50 hover:bg-amber-500/[0.08] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
    : "group flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition-all duration-200 hover:border-white/20 hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-royal-500/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white/[0.03]";

  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className={buttonClass}
      data-export-status={status}
      data-export-degraded={isDegraded ? "true" : undefined}
      data-export-blocked-reason={showBlockedReason ? blockedReason : undefined}
    >
      <span
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border ${iconContainerClass}`}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>

      <span className="flex flex-1 min-w-0 flex-col">
        <span
          className={`truncate text-sm font-medium ${
            isDegraded ? "text-amber-100" : "text-white/85"
          }`}
        >
          {label}
        </span>
        {showBlockedReason && (
          <span
            className="mt-0.5 truncate text-[11px] leading-snug text-amber-300/80"
            data-testid="export-blocked-reason"
          >
            {blockedReason}
          </span>
        )}
        {showSubtitle && (
          <span
            className={`mt-0.5 truncate text-[11px] leading-snug ${
              isDegraded ? "text-amber-300/90" : "text-white/55"
            }`}
            data-testid={
              isDegraded ? "export-degraded-subtitle" : "export-subtitle"
            }
          >
            {subtitle}
          </span>
        )}
      </span>

      {formatChip && (
        <span className="hidden rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white/55 sm:inline-flex">
          {formatChip}
        </span>
      )}

      <StatusChip
        status={chipStatus}
        size="sm"
        label={chipLabel}
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
  // Track 1 (Phase 1): "Copied!" affordance on the Copy QA report button.
  // Cleared after a short delay so repeated copies feel responsive.
  const [qaReportCopied, setQaReportCopied] = useState(false);

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

  // Track 1 (Phase 1): copy the full A1 QA report to the clipboard so the
  // user can paste it into a bug report / Slack thread instead of squinting
  // at the banner. Pretty-printed JSON keeps blocker codes + categories +
  // messages legible.
  const handleCopyQaReport = async () => {
    const a1ExportQa = designData?.a1ExportQa || null;
    if (!a1ExportQa) {
      toast.warning(
        "No QA report",
        "There is no A1 export QA report on this sheet yet.",
      );
      return;
    }
    const payload = JSON.stringify(a1ExportQa, null, 2);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(payload);
      } else if (typeof document !== "undefined") {
        const ta = document.createElement("textarea");
        ta.value = payload;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setQaReportCopied(true);
      setTimeout(() => setQaReportCopied(false), 1800);
      toast.success("QA report copied", "Pasted to clipboard.");
    } catch (err) {
      toast.error(
        "Copy failed",
        err?.message || "Could not copy QA report to clipboard.",
      );
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

  // Phase 3 audit response: requiresReview is a non-blocking degrade
  // signal — the export row stays available but renders amber with the
  // "Requires review" chip. Currently driven by the XLSX cost coverage
  // signals (missing rates / fallback rate card) so reviewers don't
  // ship a workbook that looks clean but is missing rate data.
  const requiresReview = (key) => Boolean(exportsMap?.[key]?.requiresReview);
  const requiresReviewReason = (key) =>
    exportsMap?.[key]?.requiresReviewReason || null;

  // Phase 3 export-fix: when the final-A1 export QA gate flags status
  // "blocked", PNG / PDF / SVG sheet exports must be disabled — the
  // print master failed layout / readability validation and shipping it
  // would produce an unprintable artifact. Engineering rows (DXF / IFC /
  // JSON / XLSX) keep their Phase 2 readiness logic; QA blocking targets
  // the SHEET artifact, not the compiled-project bundle. Status "warning"
  // keeps export available but a banner above the rows surfaces the
  // warning count.
  const a1ExportQa = designData?.a1ExportQa || null;
  // Track 1 (Phase 1): three QA states drive sheet-export availability.
  //   blocked  → geometry/authority/unknown blockers, status "blocked",
  //              allowed:false. Sheet PNG/PDF/SVG exports stay disabled.
  //   degraded → only readability/graphic blockers, status "degraded",
  //              allowed:true, degradedExport:true. Sheet exports stay
  //              ENABLED — the PDF was emitted with a PRELIMINARY stamp.
  //   warning  → no blockers but the gate reported warnings.
  // Legacy a1ExportQa records (status:"blocked" without degradedExport)
  // continue to be treated as blocked.
  const sheetQaBlocked =
    a1ExportQa?.allowed === false ||
    (a1ExportQa?.status === "blocked" && a1ExportQa?.degradedExport !== true);
  const sheetQaDegraded =
    !sheetQaBlocked &&
    (a1ExportQa?.degradedExport === true || a1ExportQa?.status === "degraded");
  const sheetQaWarning =
    !sheetQaBlocked && !sheetQaDegraded && a1ExportQa?.status === "warning";
  const sheetQaBlockers = Array.isArray(a1ExportQa?.blockers)
    ? a1ExportQa.blockers
    : [];
  const sheetQaWarningEntries = Array.isArray(a1ExportQa?.warnings)
    ? a1ExportQa.warnings
    : [];
  const sheetQaBlockerSummary =
    sheetQaBlockers.length > 0
      ? `${sheetQaBlockers.length} blocker${sheetQaBlockers.length === 1 ? "" : "s"}`
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

  // Track 1 (Phase 1) + Codex audit response: a degraded sheet export row
  // must NEVER render as plain green READY. `sheetExportStatus` forces the
  // ExportRow into the amber PRELIMINARY visual when the gate softened to
  // degradedExport. `sheetExportSubtitle` adds the not-for-issue legal
  // language directly under the row label so the warning is visible at
  // a glance, not buried in a tooltip.
  const sheetExportStatus = (key) => {
    if (!isSheetKey(key)) return undefined;
    if (sheetQaBlocked) return "blocked";
    if (sheetQaDegraded) return "degraded";
    return undefined;
  };

  const sheetExportSubtitle = (key) =>
    isSheetKey(key) && sheetQaDegraded
      ? "NOT FINAL — not for issue or construction"
      : undefined;

  // Track 1 (Phase 1): structured renderer for the blocker / warning list.
  // Each entry shows `{category} · {code}: {message}` so the user sees the
  // exact diagnostic the gate produced — replaces the prior single generic
  // "Sheet failed final layout/readability QA" line.
  const renderQaEntry = (entry, idx, tone) => {
    if (!entry) return null;
    const category =
      (typeof entry === "object" && entry?.category) || "unknown";
    const code = typeof entry === "string" ? entry : entry?.code || "UNKNOWN";
    const message =
      typeof entry === "string" ? "" : entry?.message || entry?.reason || "";
    return (
      <li
        key={`${code}-${idx}`}
        className="leading-snug"
        data-testid={`a1-qa-${tone}-entry`}
        data-a1-qa-code={code}
        data-a1-qa-category={category}
      >
        <span className="font-mono uppercase tracking-wider opacity-75">
          {category}
        </span>
        <span className="mx-1 opacity-40">·</span>
        <span className="font-mono font-medium">{code}</span>
        {message ? <span className="opacity-90">: {message}</span> : null}
      </li>
    );
  };

  const CopyQaReportButton = ({ tone }) => (
    <button
      type="button"
      onClick={handleCopyQaReport}
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition ${
        tone === "rose"
          ? "border-rose-400/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
          : "border-amber-400/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
      }`}
      data-testid="a1-qa-copy-report"
    >
      {qaReportCopied ? (
        <>
          <Check className="h-3 w-3" strokeWidth={2} />
          Copied
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" strokeWidth={2} />
          Copy QA report
        </>
      )}
    </button>
  );

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

      {/* Phase 3 (Track 5): preliminary cost summary — total £ + low/high
          confidence range + £/m² + top 5 cost drivers. Renders when the
          pipeline output carries a `costSummary` (cost-summary-v1).
          Empty state for legacy / pre-Phase-3 history records. The
          download button triggers the existing XLSX export route. */}
      <div className="mb-5">
        <CostSummaryPanel
          costSummary={designData?.costSummary || null}
          onDownloadWorkbook={() => void handleExport("xlsx", "Cost workbook")}
        />
      </div>

      {/* Track 1 (Phase 1): surface every blocker the gate produced as a
          structured `{category} · {code}: {message}` line. Three banner
          variants — blocked (rose, sheet exports disabled), degraded
          (amber, sheet exports STILL ENABLED, PDF carries a PRELIMINARY
          stamp), warning (amber, no blockers). Each banner offers a Copy
          QA report button that dumps the full QA JSON to clipboard. */}
      {sheetQaBlocked && (
        <div
          className="mb-5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200"
          data-testid="a1-qa-blocked-banner"
          data-a1-qa-status="blocked"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-eyebrow mr-2 text-rose-200">A1 QA</span>
              <span className="font-medium">
                A1 export blocked — sheet failed final QA.
              </span>
              {sheetQaBlockerSummary && (
                <span className="ml-1 text-rose-300/80">
                  ({sheetQaBlockerSummary})
                </span>
              )}
            </div>
            <CopyQaReportButton tone="rose" />
          </div>
          {sheetQaBlockers.length > 0 && (
            <ul
              className="mt-2 list-disc space-y-1 pl-5 text-rose-100/90"
              data-testid="a1-qa-blocked-entries"
            >
              {sheetQaBlockers.map((b, i) => renderQaEntry(b, i, "blocker"))}
            </ul>
          )}
        </div>
      )}
      {sheetQaDegraded && (
        <div
          className="mb-5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200"
          data-testid="a1-qa-degraded-banner"
          data-a1-qa-status="degraded"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-eyebrow mr-2 text-amber-200">A1 QA</span>
              <span className="font-medium">
                Export degraded — PDF emitted with PRELIMINARY stamp.
              </span>
              {sheetQaBlockerSummary && (
                <span className="ml-1 text-amber-300/80">
                  ({sheetQaBlockerSummary})
                </span>
              )}
            </div>
            <CopyQaReportButton tone="amber" />
          </div>
          {sheetQaBlockers.length > 0 && (
            <ul
              className="mt-2 list-disc space-y-1 pl-5 text-amber-100/90"
              data-testid="a1-qa-degraded-entries"
            >
              {sheetQaBlockers.map((b, i) => renderQaEntry(b, i, "degraded"))}
            </ul>
          )}
        </div>
      )}
      {sheetQaWarning && (
        <div
          className="mb-5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200"
          data-testid="a1-qa-warning-banner"
          data-a1-qa-status="warning"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-eyebrow mr-2 text-amber-200">A1 QA</span>
              <span className="font-medium">
                A1 export passed with warnings — review before final print.
              </span>
            </div>
            <CopyQaReportButton tone="amber" />
          </div>
          {sheetQaWarningEntries.length > 0 && (
            <ul
              className="mt-2 list-disc space-y-1 pl-5 text-amber-100/90"
              data-testid="a1-qa-warning-entries"
            >
              {sheetQaWarningEntries.map((w, i) =>
                renderQaEntry(w, i, "warning"),
              )}
            </ul>
          )}
        </div>
      )}

      {/* Documents */}
      <ExportSection title="Documents">
        {/* Phase 6 — Track 6. The top-level "Download Handoff Package
            (ZIP)" button is the architect/engineer-facing deliverable.
            It is gated on the QA category of each blocker on a1ExportQa,
            NOT on the generic PDF blocked-reason text. Authority,
            geometry, and unknown categories hard-disable the button.
            Readability/graphic categories DO NOT block — degraded
            exports are allowed (handoff.json + README.md both surface
            qa.status:"degraded" and the PDF carries the PRELIMINARY
            stamp). Codex Phase 6 audit blocker #4. */}
        {(() => {
          // Codex Phase 6 audit blocker #2 response. The handoff row is
          // hard-blocked when ANY of the following hold:
          //   1. A blocker's category is in HARD_BLOCK_CATEGORIES
          //      (authority / geometry / unknown). Unknown is included
          //      because uncategorised blockers default to that bucket
          //      in the Phase 1 categoriser and must be treated as hard.
          //   2. a1ExportQa.allowed === false, regardless of blocker
          //      list. Some QA records arrive with allowed:false and an
          //      empty blockers[] (legacy unsoftenable veto) — those
          //      must still hard-block.
          // Hard-block always wins over `degraded` styling, so a
          // hard-blocked-but-marked-degraded record cannot render as a
          // clickable amber row.
          const HANDOFF_HARD_BLOCK_CATEGORIES = [
            "authority",
            "geometry",
            "unknown",
          ];
          const qaBlockers = Array.isArray(a1ExportQa?.blockers)
            ? a1ExportQa.blockers
            : [];
          const hardBlockers = qaBlockers.filter((blocker) =>
            HANDOFF_HARD_BLOCK_CATEGORIES.includes(
              String(blocker?.category || "unknown").toLowerCase(),
            ),
          );
          const allowedFalse = a1ExportQa?.allowed === false;
          const handoffBlockedByHardCategory =
            hardBlockers.length > 0 || allowedFalse;
          const handoffAvailable =
            deliverablesReady && !handoffBlockedByHardCategory;
          const isDegradedFlag =
            a1ExportQa?.degradedExport === true ||
            a1ExportQa?.status === "degraded";
          // Hard-block always wins. A record that's both `allowed:false`
          // AND `degradedExport:true` renders as BLOCKED, never as
          // DEGRADED OK (clickable).
          const isDegradedDisplay =
            isDegradedFlag && !handoffBlockedByHardCategory;
          const hardBlockReason = hardBlockers.length
            ? `${hardBlockers[0].category}/${hardBlockers[0].code || "blocker"} — fix QA first`
            : allowedFalse
              ? "QA reports allowed:false — fix QA first"
              : "Authority/geometry blocker — fix QA first";
          return (
            <ExportRow
              icon={Archive}
              label="Download Handoff Package (ZIP)"
              formatChip="HANDOFF"
              available={handoffAvailable}
              blockedReason={
                handoffBlockedByHardCategory
                  ? hardBlockReason
                  : "Generate first"
              }
              status={isDegradedDisplay ? "degraded" : undefined}
              statusLabel={
                isDegradedDisplay
                  ? "DEGRADED OK"
                  : handoffAvailable
                    ? undefined
                    : "Generate first"
              }
              subtitle={
                isDegradedDisplay
                  ? 'Handoff ships with qa.status:"degraded" + PRELIMINARY stamp.'
                  : undefined
              }
              tooltip="Full architect/engineer handoff: A1 sheets, DXF, DWG (or DWG_UNAVAILABLE.txt), IFC, GLB, cost workbook, takeoff CSV, project graph, QA report, README, manifest. geometryHash cross-verifiable across every file."
              onClick={() => void handleExport("handoff", "Handoff package")}
            />
          );
        })()}
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
          status={sheetExportStatus("pdf")}
          subtitle={sheetExportSubtitle("pdf")}
          tooltip="Print-ready A1 sheet, vector text where possible."
          onClick={() => void handleExport("pdf", "PDF sheet")}
        />
        <ExportRow
          icon={ImageIcon}
          label="Export as PNG"
          formatChip="PNG"
          available={sheetExportAvailable("png", true)}
          blockedReason={sheetExportBlockedReason("png")}
          status={sheetExportStatus("png")}
          subtitle={sheetExportSubtitle("png")}
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
          // Phase 3 audit response: when the manifest flags `requiresReview`
          // (missing rates / fallback rate card), render the XLSX row with
          // the amber degraded chip + "Requires review" subtitle so the
          // reviewer can't ship a workbook with silent cost gaps.
          status={
            isAvailable("xlsx", false) && requiresReview("xlsx")
              ? "degraded"
              : undefined
          }
          statusLabel={
            isAvailable("xlsx", false) && requiresReview("xlsx")
              ? "REQUIRES REVIEW"
              : undefined
          }
          subtitle={
            isAvailable("xlsx", false) && requiresReview("xlsx")
              ? requiresReviewReason("xlsx") ||
                "Cost workbook needs reviewer attention before issuing."
              : undefined
          }
          tooltip="Cost estimate workbook with quantities and rates."
          onClick={() => void handleExport("xlsx", "Excel estimate")}
        />
        {/* Phase 5 — Codex audit blocker #4. The DWG row is now manifest-
            gated so the UI surfaces "Install ODA File Converter" when the
            server-side adapter is unconfigured, and a ready row when the
            converter is wired. */}
        <ExportRow
          icon={Download}
          label="Export as DWG (AutoCAD)"
          formatChip="CAD"
          available={isAvailable("dwg", false)}
          blockedReason={blockedReason("dwg")}
          tooltip="DWG output via ODA File Converter — install on the server to enable."
          onClick={() => void handleExport("dwg", "DWG file")}
        />
      </ExportSection>

      {/* 3D Models — Phase 5 — Codex audit blocker #4. The GLB row is now
          rendered from manifest readiness, not from hasBlenderRenders. A
          fresh ProjectGraph design with a compiledProject + geometryHash
          can build GLB on demand via /api/project/export/glb even when no
          Blender renders are available. */}
      {(hasBlenderRenders || isAvailable("glb", false)) && (
        <ExportSection title="3D Models">
          {hasBlenderRenders && (
            <ExportRow
              icon={Layers}
              label={`Download All Renders (${blenderPanelCount} views)`}
              formatChip="3D"
              available={true}
              tooltip="Bundle download of all Blender-rendered viewpoints."
              onClick={handleBlenderBundle}
            />
          )}
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
            available={isAvailable("glb", false)}
            blockedReason={blockedReason("glb")}
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

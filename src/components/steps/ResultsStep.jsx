/**
 * Results Step - Deepgram-Inspired Design
 *
 * Step 6: Display A1 sheet with modify panel
 * Phase 5: Added ExportPanel for professional CAD/BIM exports
 */

import React, { useState } from "react";

import { motion } from "framer-motion";
import { Download, Home, FileCode, Bug, Eye } from "lucide-react";

import { isDemoMode } from "../../data/demoProjects.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";
import debugRecorder from "../../services/debug/DebugRunRecorder.js";
import { fadeInUp, staggerChildren } from "../../styles/animations.js";
import A1PanelGallery from "../A1PanelGallery.jsx";
import A1SheetViewer from "../A1SheetViewer.jsx";
import AIModifyPanel from "../AIModifyPanel.jsx";
import ExportPanel from "../ExportPanel.jsx";
import GeometryDebugViewer from "../GeometryDebugViewer.jsx";
import StepContainer from "../layout/StepContainer.jsx";
import Button from "../ui/Button.jsx";
import Card from "../ui/Card.jsx";

const STAGE_STATUS_TONE = {
  pass: {
    chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    border: "border-emerald-500/20",
  },
  ready: {
    chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    border: "border-emerald-500/20",
  },
  warning: {
    chip: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    border: "border-amber-500/20",
  },
  block: {
    chip: "border-rose-500/30 bg-rose-500/10 text-rose-200",
    border: "border-rose-500/20",
  },
  pending: {
    chip: "border-slate-500/30 bg-slate-500/10 text-slate-200",
    border: "border-white/10",
  },
};

function getStageTone(status) {
  return STAGE_STATUS_TONE[status] || STAGE_STATUS_TONE.pending;
}

function formatStageStatus(status) {
  return String(status || "pending").replace(/_/g, " ");
}

const ResultsStep = ({
  result,
  designId,
  generationElapsedSeconds = 0,
  onModify,
  onExport,
  onExportCAD: _onExportCAD,
  onExportBIM: _onExportBIM,
  onBack: _onBack,
  onStartNew,
}) => {
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [genarchJob, setGenarchJob] = useState(null);
  const [genarchBusy, setGenarchBusy] = useState(false);
  const [genarchReviewError, setGenarchReviewError] = useState(null);

  const qualityEvaluation =
    result?.qualityEvaluation ||
    result?.metadata?.qualityEvaluation ||
    result?.masterDNA?.qualityEvaluation ||
    null;

  const qualityTone =
    (qualityEvaluation?.total || 0) >= 80
      ? {
          border: "border-emerald-500/30",
          bg: "bg-emerald-900/10",
          accent: "text-emerald-300",
          bar: "bg-emerald-400",
        }
      : (qualityEvaluation?.total || 0) >= 60
        ? {
            border: "border-amber-500/30",
            bg: "bg-amber-900/10",
            accent: "text-amber-300",
            bar: "bg-amber-400",
          }
        : {
            border: "border-rose-500/30",
            bg: "bg-rose-900/10",
            accent: "text-rose-300",
            bar: "bg-rose-400",
          };

  const formatElapsedTime = (seconds) => {
    const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const mins = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  // Handle debug report download
  const handleDownloadDebugReport = () => {
    const report = debugRecorder.getCurrentReport();
    if (!report) {
      console.warn("No debug report available");
      return;
    }
    const downloadUrl = debugRecorder.getReportDownloadUrl();
    if (!downloadUrl) {
      console.warn("Failed to create download URL");
      return;
    }
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `DEBUG_REPORT_${report.runId || designId || "unknown"}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  };

  const showGeometryDebug = isFeatureEnabled("showGeometryDebugViewer");

  // Extract data for ExportPanel
  const geometryDNA = result?.geometryDNA || result?.masterDNA?.geometryDNA;
  const populatedGeometry =
    result?.populatedGeometry || result?.masterDNA?.populatedGeometry;
  const masterDNA = result?.masterDNA;
  const meshy3D = result?.masterDNA?.meshy3D || result?.meshy3D;
  const blenderOutputs = result?.blenderOutputs || null;
  const projectInfo = {
    name: result?.projectName || "Building Design",
    address: result?.locationData?.address || "",
    client: result?.client || "",
  };
  const authorityReadiness =
    result?.authorityReadiness ||
    result?.sheetArtifactManifest?.authorityReadiness ||
    result?.metadata?.authorityReadiness ||
    null;
  const deliveryStages =
    result?.deliveryStages ||
    result?.sheetArtifactManifest?.deliveryStages ||
    result?.metadata?.deliveryStages ||
    null;
  const exportManifest =
    result?.exportManifest ||
    result?.sheetArtifactManifest?.exportManifest ||
    result?.metadata?.exportManifest ||
    null;
  const reviewSurface =
    result?.reviewSurface ||
    result?.sheetArtifactManifest?.reviewSurface ||
    result?.metadata?.reviewSurface ||
    null;
  const publishability =
    result?.metadata?.publishability ||
    result?.sheetArtifactManifest?.publishability ||
    null;

  const handleStartGenarchReview = async () => {
    if (!reviewSurface?.supported || !reviewSurface?.createJob) {
      return;
    }

    setGenarchBusy(true);
    setGenarchReviewError(null);

    try {
      const serviceModule =
        await import("../../services/genarch/genarchPipelineService.js");
      const response = await serviceModule.createJob({
        ...(reviewSurface.createJob.defaults || {}),
        prompt:
          reviewSurface.createJob.promptSeed ||
          authorityReadiness?.requested?.residentialSubtype ||
          "residential project",
      });

      if (!response?.success || !response?.job) {
        throw new Error(
          response?.error || "Genarch review job could not be created",
        );
      }

      setGenarchJob(response.job);
    } catch (error) {
      setGenarchReviewError(error.message || "Genarch review failed");
    } finally {
      setGenarchBusy(false);
    }
  };

  const handleRefreshGenarchReview = async () => {
    if (!genarchJob?.id) {
      return;
    }

    setGenarchBusy(true);
    setGenarchReviewError(null);

    try {
      const serviceModule =
        await import("../../services/genarch/genarchPipelineService.js");
      const response = await serviceModule.getJob(genarchJob.id);

      if (!response?.success || !response?.job) {
        throw new Error(response?.error || "Genarch review refresh failed");
      }

      setGenarchJob(response.job);
    } catch (error) {
      setGenarchReviewError(error.message || "Genarch review refresh failed");
    } finally {
      setGenarchBusy(false);
    }
  };

  // TASK 4: Construct a1SheetData from result.panels for print export
  // The workflow returns panels/panelMap/panelsByKey, not a1Sheet directly
  // NOTE: useMemo must be called before any early return to satisfy React hooks rules
  const a1SheetData = React.useMemo(() => {
    // Handle null result case
    if (!result) {
      return { panels: [], metadata: { source: "no_result" } };
    }
    // Priority 1: Direct a1Sheet from result
    if (result?.a1Sheet?.panels) {
      return result.a1Sheet;
    }

    // Priority 2: Construct from result.panels array
    if (
      result?.panels &&
      Array.isArray(result.panels) &&
      result.panels.length > 0
    ) {
      return {
        panels: result.panels.map((p) => ({
          type: p.type,
          label: p.type
            ?.replace(/_/g, " ")
            .replace(/\b\w/g, (l) => l.toUpperCase()),
          url: p.imageUrl || p.url || p.dataUrl,
          dataUrl: p.imageUrl || p.url || p.dataUrl,
          svg: p.svg || null,
          // TASK 4: Include coordinates from panelsByKey if available
          coordinates:
            result.panelsByKey?.[p.type]?.coordinates ||
            result.coordinates?.[p.type] ||
            null,
        })),
        metadata: {
          designId: result.designId,
          composedSheetUrl: result.composedSheetUrl,
          panelCount: result.panels.length,
          source: "panels_array",
        },
      };
    }

    // Priority 3: Construct from result.panelsByKey (includes coordinates from compose API)
    if (
      result?.panelsByKey &&
      typeof result.panelsByKey === "object" &&
      Object.keys(result.panelsByKey).length > 0
    ) {
      const panels = Object.entries(result.panelsByKey).map(([type, data]) => ({
        type,
        label: type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        url: data.imageUrl || data.url || data.dataUrl,
        dataUrl: data.imageUrl || data.url || data.dataUrl,
        svg: data.svg || null,
        coordinates: data.coordinates || null,
      }));
      return {
        panels,
        metadata: {
          designId: result.designId,
          composedSheetUrl: result.composedSheetUrl,
          panelCount: panels.length,
          source: "panelsByKey",
        },
      };
    }

    // Priority 4: Construct from result.panelMap object
    if (
      result?.panelMap &&
      typeof result.panelMap === "object" &&
      Object.keys(result.panelMap).length > 0
    ) {
      const panels = Object.entries(result.panelMap).map(([type, data]) => ({
        type,
        label: type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
        url: data.imageUrl || data.url || data.dataUrl,
        dataUrl: data.imageUrl || data.url || data.dataUrl,
        svg: data.svg || null,
        coordinates: data.coordinates || null,
      }));
      return {
        panels,
        metadata: {
          designId: result.designId,
          composedSheetUrl: result.composedSheetUrl,
          panelCount: panels.length,
          source: "panelMap",
        },
      };
    }

    // Fallback: Empty structure with clear warning metadata
    console.warn(
      "[ResultsStep] No panels found in result. Available keys:",
      Object.keys(result || {}),
    );
    return {
      panels: [],
      metadata: {
        designId: result?.designId,
        source: "fallback_empty",
        warning:
          "No panels found - check result.panels, result.panelsByKey, or result.panelMap",
      },
    };
  }, [result]);

  // Early return after all hooks are called
  if (!result) {
    return null;
  }

  return (
    <StepContainer
      backgroundVariant="results"
      enableParallax={true}
      maxWidth="7xl"
    >
      <motion.div
        className="space-y-8"
        variants={staggerChildren}
        initial="initial"
        animate="animate"
      >
        {/* Demo Mode Banner */}
        {isDemoMode() && (
          <motion.div variants={fadeInUp}>
            <Card
              variant="glass"
              padding="sm"
              className="border-blue-500/30 bg-blue-900/20"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-blue-300 flex items-center">
                  <Eye className="w-4 h-4 mr-2 flex-shrink-0" />
                  Viewing pre-generated demo — real AI output from a 150 m&#178;
                  London home.
                </p>
                <Button variant="outline" size="sm" onClick={onStartNew}>
                  Try Live Generation
                </Button>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Header */}
        <motion.div variants={fadeInUp} className="text-center">
          <h2 className="text-4xl font-bold text-white mb-4 font-heading">
            Your Design is Ready
          </h2>
          <p className="text-xl text-gray-400">
            Professional A1 sheet with 98%+ consistency
          </p>
          {generationElapsedSeconds > 0 && (
            <p className="text-sm text-gray-500 mt-2">
              Generation time: {formatElapsedTime(generationElapsedSeconds)}
            </p>
          )}
        </motion.div>

        {/* Action Bar */}
        <motion.div variants={fadeInUp}>
          <Card variant="glass" padding="md">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => onExport("PNG")}
                  icon={<Download className="w-5 h-5" />}
                >
                  Download A1 Sheet
                </Button>
                <Button
                  variant="outline"
                  size="md"
                  onClick={() => setShowExportPanel(!showExportPanel)}
                  icon={<FileCode className="w-5 h-5" />}
                >
                  {showExportPanel
                    ? "Hide Export Panel"
                    : "DXF / BIM / Cost Export"}
                </Button>
                {/* Debug Report Download - shows when report is available */}
                {debugRecorder.getCurrentReport() && (
                  <Button
                    variant="ghost"
                    size="md"
                    onClick={handleDownloadDebugReport}
                    icon={<Bug className="w-5 h-5" />}
                    title="Download debug report with all generation data"
                  >
                    Debug Report
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="md"
                  onClick={onStartNew}
                  icon={<Home className="w-5 h-5" />}
                >
                  New Design
                </Button>
              </div>
            </div>
          </Card>
        </motion.div>

        {qualityEvaluation && (
          <motion.div variants={fadeInUp}>
            <Card
              variant="glass"
              padding="md"
              className={`${qualityTone.border} ${qualityTone.bg}`}
            >
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
                <div className="flex flex-col justify-center rounded-2xl border border-white/10 bg-black/20 p-5 text-center">
                  <div
                    className={`text-sm uppercase tracking-[0.2em] ${qualityTone.accent}`}
                  >
                    Plan Quality
                  </div>
                  <div className="mt-3 text-5xl font-bold text-white">
                    {qualityEvaluation.total}
                  </div>
                  <div
                    className={`mt-2 text-lg font-semibold ${qualityTone.accent}`}
                  >
                    Grade {qualityEvaluation.grade}
                  </div>
                </div>

                <div className="space-y-4">
                  {[
                    ["Adjacency Satisfaction", qualityEvaluation.adjacency, 25],
                    ["Room Proportions", qualityEvaluation.proportions, 20],
                    ["Circulation Flow", qualityEvaluation.circulation, 20],
                    ["Area Compliance", qualityEvaluation.area, 20],
                    ["Natural Light Access", qualityEvaluation.light, 15],
                  ].map(([label, score, max]) => (
                    <div key={label}>
                      <div className="mb-1 flex items-center justify-between text-sm text-gray-300">
                        <span>{label}</span>
                        <span>
                          {score}/{max}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-white/10">
                        <div
                          className={`h-2 rounded-full ${qualityTone.bar}`}
                          style={{
                            width: `${Math.max(
                              6,
                              (Number(score || 0) / Number(max || 1)) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}

                  {Array.isArray(qualityEvaluation.explanations) &&
                    qualityEvaluation.explanations.length > 0 && (
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="mb-2 text-sm font-semibold text-white">
                          Review Notes
                        </div>
                        <div className="space-y-2">
                          {qualityEvaluation.explanations.map((note) => (
                            <p key={note} className="text-sm text-gray-300">
                              {note}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {(authorityReadiness || deliveryStages || reviewSurface) && (
          <motion.div variants={fadeInUp}>
            <Card variant="glass" padding="md" className="border-white/10">
              <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-semibold text-white">
                      Residential Authority Status
                    </h3>
                    {authorityReadiness?.ready !== undefined && (
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                          getStageTone(
                            authorityReadiness.ready ? "pass" : "block",
                          ).chip
                        }`}
                      >
                        {authorityReadiness.ready ? "Ready" : "Blocked"}
                      </span>
                    )}
                  </div>

                  {authorityReadiness?.geometryHash && (
                    <p className="text-xs text-gray-400 break-all">
                      Geometry authority:{" "}
                      <span className="font-mono">
                        {authorityReadiness.geometryHash}
                      </span>
                    </p>
                  )}

                  {deliveryStages?.stages?.length > 0 && (
                    <div className="grid gap-3">
                      {deliveryStages.stages.map((stage) => {
                        const tone = getStageTone(stage.status);
                        return (
                          <div
                            key={stage.id}
                            className={`rounded-2xl border bg-black/20 p-4 ${tone.border}`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold text-white">
                                {stage.label}
                              </div>
                              <span
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${tone.chip}`}
                              >
                                {formatStageStatus(stage.status)}
                              </span>
                            </div>
                            {stage.detail && (
                              <p className="mt-2 text-sm text-gray-300">
                                {stage.detail}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-sm font-semibold text-white">
                      Publishability
                    </div>
                    <p className="mt-2 text-sm text-gray-300">
                      {publishability?.summary ||
                        publishability?.blockers?.[0] ||
                        publishability?.warnings?.[0] ||
                        "Post-compose publishability details will appear here once verification runs."}
                    </p>
                  </div>

                  {authorityReadiness?.blockers?.length > 0 && (
                    <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4">
                      <div className="text-sm font-semibold text-rose-200">
                        Current blocker
                      </div>
                      <p className="mt-2 text-sm text-rose-100">
                        {authorityReadiness.blockers[0]}
                      </p>
                    </div>
                  )}

                  {reviewSurface?.supported && (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">
                            Genarch Review Surface
                          </div>
                          <p className="mt-1 text-sm text-gray-300">
                            Run backend CAD/BIM review jobs from the compiled
                            residential brief.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleStartGenarchReview}
                            disabled={genarchBusy}
                          >
                            {genarchBusy ? "Working..." : "Start Review"}
                          </Button>
                          {genarchJob?.id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={handleRefreshGenarchReview}
                              disabled={genarchBusy}
                            >
                              Refresh
                            </Button>
                          )}
                        </div>
                      </div>

                      {genarchReviewError && (
                        <p className="mt-3 text-sm text-rose-300">
                          {genarchReviewError}
                        </p>
                      )}

                      {genarchJob?.id && (
                        <div className="mt-4 space-y-3">
                          <div className="text-xs uppercase tracking-wide text-gray-500">
                            Job {genarchJob.id}
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                                getStageTone(
                                  genarchJob.status === "completed"
                                    ? "pass"
                                    : genarchJob.status === "failed" ||
                                        genarchJob.status === "cancelled"
                                      ? "block"
                                      : "warning",
                                ).chip
                              }`}
                            >
                              {formatStageStatus(genarchJob.status)}
                            </span>
                            {typeof genarchJob.progress === "number" && (
                              <span className="text-xs text-gray-400">
                                {Math.round(genarchJob.progress)}%
                              </span>
                            )}
                          </div>

                          {genarchJob.status === "completed" &&
                            Array.isArray(reviewSurface.artifacts) && (
                              <div className="grid gap-2">
                                {reviewSurface.artifacts.map((artifact) => (
                                  <a
                                    key={artifact.key}
                                    href={`/api/genarch/runs/${genarchJob.id}/${artifact.relativePath}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-lg border border-white/10 px-3 py-2 text-sm text-blue-300 transition hover:border-blue-400/40 hover:bg-white/5"
                                  >
                                    {artifact.key}
                                  </a>
                                ))}
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  )}

                  {exportManifest?.exports && (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="text-sm font-semibold text-white">
                        Deliverables
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        {Object.entries(exportManifest.exports).map(
                          ([key, entry]) => (
                            <div
                              key={key}
                              className="flex items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-gray-300"
                            >
                              <span className="uppercase tracking-wide text-xs">
                                {key}
                              </span>
                              <span
                                className={
                                  entry?.available
                                    ? "text-emerald-300"
                                    : "text-amber-300"
                                }
                              >
                                {entry?.available ? "Ready" : "Pending"}
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Phase 5: Professional Export Panel */}
        {showExportPanel && (
          <motion.div variants={fadeInUp}>
            <ExportPanel
              designData={result}
              geometryDNA={geometryDNA}
              populatedGeometry={populatedGeometry}
              masterDNA={masterDNA}
              a1SheetData={a1SheetData}
              meshy3D={meshy3D}
              blenderOutputs={blenderOutputs}
              projectInfo={projectInfo}
              onExport={onExport}
              onExportStart={(format) =>
                console.log(`Starting ${format} export...`)
              }
              onExportComplete={(format, filename) =>
                console.log(`Completed ${format} export: ${filename}`)
              }
              onExportError={(format, error) =>
                console.error(`${format} export failed:`, error)
              }
            />
          </motion.div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* A1 Sheet Viewer */}
          <motion.div variants={fadeInUp} className="lg:col-span-2">
            <A1SheetViewer result={result} designId={designId} />
          </motion.div>

          {/* AI Modify Panel */}
          <motion.div variants={fadeInUp}>
            {isDemoMode() ? (
              <Card variant="glass" padding="md">
                <h3 className="text-lg font-semibold text-white mb-2">
                  AI Modify
                </h3>
                <p className="text-sm text-gray-400">
                  AI-powered modification is available in live generation mode.
                  Click "Try Live Generation" above to create your own design
                  and modify it.
                </p>
              </Card>
            ) : (
              <AIModifyPanel designId={designId} onModify={onModify} />
            )}
          </motion.div>
        </div>

        {/* Panel Gallery */}
        <motion.div variants={fadeInUp} className="lg:col-span-3">
          <A1PanelGallery result={result} />
        </motion.div>

        {/* Geometry Debug Viewer */}
        <motion.div variants={fadeInUp} className="lg:col-span-3">
          {showGeometryDebug && (
            <GeometryDebugViewer
              designId={designId}
              geometryRenders={
                result?.geometryRenders || result?.a1Sheet?.geometryRenders
              }
              geometryDNA={result?.geometryDNA || result?.masterDNA?.geometry}
              panelMap={result?.panelMap || result?.a1Sheet?.panelMap}
              loadFromHistory={!result?.geometryRenders}
            />
          )}
        </motion.div>
      </motion.div>
    </StepContainer>
  );
};

export default ResultsStep;

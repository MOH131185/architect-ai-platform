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

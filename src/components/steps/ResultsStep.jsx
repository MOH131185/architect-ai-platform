/**
 * Results Step - Deepgram-Inspired Design
 *
 * Step 6: Display A1 sheet with modify panel
 * Phase 5: Added ExportPanel for professional CAD/BIM exports
 */

import React, { useState } from 'react';

import { motion } from 'framer-motion';
import { Download, Home, FileCode, Bug } from 'lucide-react';

import { isFeatureEnabled } from '../../config/featureFlags.js';
import debugRecorder from '../../services/debug/DebugRunRecorder.js';
import { fadeInUp, staggerChildren } from '../../styles/animations.js';
import A1PanelGallery from '../A1PanelGallery.jsx';
import A1SheetViewer from '../A1SheetViewer.jsx';
import AIModifyPanel from '../AIModifyPanel.jsx';
import ExportPanel from '../ExportPanel.jsx';
import GeometryDebugViewer from '../GeometryDebugViewer.jsx';
import StepContainer from '../layout/StepContainer.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';

const ResultsStep = ({
  result,
  designId,
  onModify,
  onExport,
  onExportCAD: _onExportCAD,
  onExportBIM: _onExportBIM,
  onBack: _onBack,
  onStartNew,
}) => {
  const [showExportPanel, setShowExportPanel] = useState(false);

  // Handle debug report download
  const handleDownloadDebugReport = () => {
    const report = debugRecorder.getCurrentReport();
    if (!report) {
      console.warn('No debug report available');
      return;
    }
    const downloadUrl = debugRecorder.getReportDownloadUrl();
    if (!downloadUrl) {
      console.warn('Failed to create download URL');
      return;
    }
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `DEBUG_REPORT_${report.runId || designId || 'unknown'}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  };

  const showGeometryDebug = isFeatureEnabled('showGeometryDebugViewer');

  // Extract data for ExportPanel
  const geometryDNA = result?.geometryDNA || result?.masterDNA?.geometryDNA;
  const populatedGeometry = result?.populatedGeometry || result?.masterDNA?.populatedGeometry;
  const masterDNA = result?.masterDNA;
  const meshy3D = result?.masterDNA?.meshy3D || result?.meshy3D;
  const projectInfo = {
    name: result?.projectName || 'Building Design',
    address: result?.locationData?.address || '',
    client: result?.client || '',
  };

  // TASK 4: Construct a1SheetData from result.panels for print export
  // The workflow returns panels/panelMap/panelsByKey, not a1Sheet directly
  // NOTE: useMemo must be called before any early return to satisfy React hooks rules
  const a1SheetData = React.useMemo(() => {
    // Handle null result case
    if (!result) {
      return { panels: [], metadata: { source: 'no_result' } };
    }
    // Priority 1: Direct a1Sheet from result
    if (result?.a1Sheet?.panels) {
      return result.a1Sheet;
    }

    // Priority 2: Construct from result.panels array
    if (result?.panels && Array.isArray(result.panels) && result.panels.length > 0) {
      return {
        panels: result.panels.map((p) => ({
          type: p.type,
          label: p.type?.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
          url: p.imageUrl || p.url || p.dataUrl,
          dataUrl: p.imageUrl || p.url || p.dataUrl,
          svg: p.svg || null,
          // TASK 4: Include coordinates from panelsByKey if available
          coordinates:
            result.panelsByKey?.[p.type]?.coordinates || result.coordinates?.[p.type] || null,
        })),
        metadata: {
          designId: result.designId,
          composedSheetUrl: result.composedSheetUrl,
          panelCount: result.panels.length,
          source: 'panels_array',
        },
      };
    }

    // Priority 3: Construct from result.panelsByKey (includes coordinates from compose API)
    if (
      result?.panelsByKey &&
      typeof result.panelsByKey === 'object' &&
      Object.keys(result.panelsByKey).length > 0
    ) {
      const panels = Object.entries(result.panelsByKey).map(([type, data]) => ({
        type,
        label: type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
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
          source: 'panelsByKey',
        },
      };
    }

    // Priority 4: Construct from result.panelMap object
    if (
      result?.panelMap &&
      typeof result.panelMap === 'object' &&
      Object.keys(result.panelMap).length > 0
    ) {
      const panels = Object.entries(result.panelMap).map(([type, data]) => ({
        type,
        label: type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
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
          source: 'panelMap',
        },
      };
    }

    // Fallback: Empty structure with clear warning metadata
    console.warn(
      '[ResultsStep] No panels found in result. Available keys:',
      Object.keys(result || {})
    );
    return {
      panels: [],
      metadata: {
        designId: result?.designId,
        source: 'fallback_empty',
        warning: 'No panels found - check result.panels, result.panelsByKey, or result.panelMap',
      },
    };
  }, [result]);

  // Early return after all hooks are called
  if (!result) {
    return null;
  }

  return (
    <StepContainer backgroundVariant="results" enableParallax={true} maxWidth="7xl">
      <motion.div
        className="space-y-8"
        variants={staggerChildren}
        initial="initial"
        animate="animate"
      >
        {/* Header */}
        <motion.div variants={fadeInUp} className="text-center">
          <h2 className="text-4xl font-bold text-white mb-4 font-heading">Your Design is Ready</h2>
          <p className="text-xl text-gray-400">Professional A1 sheet with 98%+ consistency</p>
        </motion.div>

        {/* Action Bar */}
        <motion.div variants={fadeInUp}>
          <Card variant="glass" padding="md">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => onExport('PNG')}
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
                  {showExportPanel ? 'Hide Export Panel' : 'CAD/BIM Export'}
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

        {/* Phase 5: Professional Export Panel */}
        {showExportPanel && (
          <motion.div variants={fadeInUp}>
            <ExportPanel
              geometryDNA={geometryDNA}
              populatedGeometry={populatedGeometry}
              masterDNA={masterDNA}
              a1SheetData={a1SheetData}
              meshy3D={meshy3D}
              projectInfo={projectInfo}
              onExportStart={(format) => console.log(`Starting ${format} export...`)}
              onExportComplete={(format, filename) =>
                console.log(`Completed ${format} export: ${filename}`)
              }
              onExportError={(format, error) => console.error(`${format} export failed:`, error)}
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
            <AIModifyPanel designId={designId} onModify={onModify} />
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
              geometryRenders={result?.geometryRenders || result?.a1Sheet?.geometryRenders}
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

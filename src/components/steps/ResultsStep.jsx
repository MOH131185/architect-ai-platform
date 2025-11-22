/**
 * Results Step - Deepgram-Inspired Design
 * 
 * Step 6: Display A1 sheet with modify panel
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Download, Edit3, RefreshCw, Home } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import A1SheetViewer from '../A1SheetViewer.jsx';
import AIModifyPanel from '../AIModifyPanel.jsx';
import A1PanelGallery from '../A1PanelGallery.jsx';
import GeometryDebugViewer from '../GeometryDebugViewer.jsx';
import StepContainer from '../layout/StepContainer.jsx';
import { fadeInUp, staggerChildren } from '../../styles/animations.js';

const ResultsStep = ({
  result,
  designId,
  onModify,
  onExport,
  onExportCAD,
  onExportBIM,
  onBack,
  onStartNew,
}) => {
  if (!result) return null;
  
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
        <h2 className="text-4xl font-bold text-white mb-4 font-heading">
          Your Design is Ready
        </h2>
        <p className="text-xl text-gray-400">
          Professional A1 sheet with 98%+ consistency
        </p>
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
                onClick={() => onExportCAD('DWG')}
                icon={<Download className="w-5 h-5" />}
              >
                Export CAD
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={() => onExportBIM('IFC')}
                icon={<Download className="w-5 h-5" />}
              >
                Export BIM
              </Button>
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

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* A1 Sheet Viewer */}
        <motion.div variants={fadeInUp} className="lg:col-span-2">
          <A1SheetViewer
            result={result}
            designId={designId}
          />
        </motion.div>

        {/* AI Modify Panel */}
        <motion.div variants={fadeInUp}>
          <AIModifyPanel
            designId={designId}
            onModify={onModify}
          />
        </motion.div>
      </div>

      {/* Panel Gallery */}
      <motion.div variants={fadeInUp} className="lg:col-span-3">
        <A1PanelGallery result={result} />
      </motion.div>

      {/* Geometry Debug Viewer */}
      <motion.div variants={fadeInUp} className="lg:col-span-3">
        <GeometryDebugViewer geometryRenders={result?.geometryRenders || result?.a1Sheet?.geometryRenders} />
      </motion.div>
      </motion.div>
    </StepContainer>
  );
};

export default ResultsStep;

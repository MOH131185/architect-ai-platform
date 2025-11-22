/**
 * A1 Sheet Viewer - Deepgram-Inspired Design
 * 
 * Displays A1 architectural sheet with blueprint background and spotlight effects
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Check,
  Loader2,
} from 'lucide-react';
// Removed html-to-image - using direct fetch download instead
import { normalizeSheetMetadata } from '../types/schemas.js';
import Button from './ui/Button.jsx';
import Card from './ui/Card.jsx';
import { fadeInUp, spotlight } from '../styles/animations.js';
import logger from '../utils/logger.js';


const A1SheetViewer = ({
  result,
  sheetData,
  sitePlanAttachment,
  designId,
  onModify,
  onExport,
}) => {
  const sheet = sheetData || result?.a1Sheet || result;
  const metadata = normalizeSheetMetadata(sheet?.metadata);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isDownloading, setIsDownloading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 50, y: 50 });

  const containerRef = useRef(null);
  const imageRef = useRef(null);

  const sheetUrl = sheet?.composedSheetUrl || sheet?.url || result?.composedSheetUrl || result?.url || result?.a1Sheet?.composedSheetUrl || result?.a1Sheet?.url;

  useEffect(() => {
    if (sheetUrl) {
      setIsLoading(true);
      setLoadError(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => setIsLoading(false);
      img.onerror = () => {
        setLoadError('Failed to load A1 sheet');
        setIsLoading(false);
      };
      img.src = sheetUrl;
    } else {
      setIsLoading(false);
      setLoadError('No A1 sheet available');
    }
  }, [sheetUrl]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 4));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleFit = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((prev) => Math.max(0.5, Math.min(4, prev + delta)));
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, []);

  const handleMouseDown = (e) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }

    // Update mouse position for spotlight effect
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setMousePosition({ x, y });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      // Direct download of the image URL (simpler, avoids CORS issues)
      const response = await fetch(sheetUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `a1-sheet-${designId || Date.now()}.png`;
      link.href = url;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      logger.error('Download failed:', error);
      // Fallback: open in new tab
      window.open(sheetUrl, '_blank');
    } finally {
      setIsDownloading(false);
    }
  };

  if (!sheetUrl) {
    return (
      <Card variant="glass" padding="xl" className="text-center">
        <p className="text-gray-400">No A1 sheet available</p>
      </Card>
    );
  }

  return (
    <motion.div
      variants={fadeInUp}
      initial="initial"
      animate="animate"
      className="space-y-4"
    >
      {/* Controls */}
      <Card variant="glass" padding="sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomIn}
              disabled={zoom >= 4}
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomOut}
              disabled={zoom <= 0.5}
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleFit}
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
            <span className="text-sm text-gray-400 ml-2">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Quality Badge */}
            {metadata?.consistencyScore && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-royal-600/10 border border-royal-600/20">
                <Check className="w-4 h-4 text-royal-400" />
                <span className="text-sm text-royal-300 font-medium">
                  {Math.round(metadata.consistencyScore * 100)}% Consistency
                </span>
              </div>
            )}

            <Button
              variant="primary"
              size="sm"
              onClick={handleDownload}
              loading={isDownloading}
              icon={<Download className="w-4 h-4" />}
            >
              Download
            </Button>
          </div>
        </div>
      </Card>

      {/* Viewer */}
      <div className="relative">
        {/* Blueprint Background */}
        <div className="absolute inset-0 blueprint-grid opacity-20 rounded-2xl" />

        {/* Sheet Container */}
        <Card
          variant="elevated"
          padding="none"
          className="relative overflow-hidden spotlight-effect"
          style={{
            '--mouse-x': `${mousePosition.x}%`,
            '--mouse-y': `${mousePosition.y}%`,
          }}
        >
          <div
            ref={containerRef}
            className="relative bg-navy-900 rounded-2xl overflow-hidden"
            style={{
              minHeight: '600px',
              cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <AnimatePresence>
              {isLoading && (
                <motion.div
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center bg-navy-900"
                >
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 text-royal-400 animate-spin mx-auto mb-4" />
                    <p className="text-gray-400">Loading A1 sheet...</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {loadError && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="text-red-400">{loadError}</p>
              </div>
            )}

            {!isLoading && !loadError && (
              <motion.div
                ref={imageRef}
                className="relative"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: isDragging ? 'none' : 'transform 0.2s ease-out',
                }}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
              >
                <img
                  src={sheetUrl}
                  alt="A1 Architectural Sheet"
                  className="w-full h-auto"
                  draggable={false}
                />

                {/* Site Map Overlay - Client-side composition */}
                {(!metadata?.sitePlanComposited && sitePlanAttachment?.dataUrl) && (
                  <div
                    className="absolute border border-gray-900/10 bg-gray-50"
                    style={{
                      top: '4%',
                      left: '2.5%',
                      width: '34%',
                      height: '16%',
                      zIndex: 10,
                      overflow: 'hidden'
                    }}
                    title="Site Plan (Real Context Overlay)"
                  >
                    <img
                      src={sitePlanAttachment.dataUrl}
                      alt="Site Plan Context"
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                    {/* Scale Bar Overlay */}
                    <div className="absolute bottom-2 right-2 bg-white/80 px-1 py-0.5 text-[8px] font-mono text-black border border-black/20">
                      1:1250 @ A1
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </Card>
      </div>

      {/* Metadata */}
      {metadata && (
        <Card variant="glass" padding="md">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {metadata.designId && (
              <div>
                <p className="text-gray-500 mb-1">Design ID</p>
                <p className="text-white font-mono">{metadata.designId.slice(0, 8)}...</p>
              </div>
            )}
            {metadata.seed && (
              <div>
                <p className="text-gray-500 mb-1">Seed</p>
                <p className="text-white font-mono">{metadata.seed}</p>
              </div>
            )}
            {metadata.version && (
              <div>
                <p className="text-gray-500 mb-1">Version</p>
                <p className="text-white font-semibold">v{metadata.version}</p>
              </div>
            )}
            {metadata.timestamp && (
              <div>
                <p className="text-gray-500 mb-1">Generated</p>
                <p className="text-white">{new Date(metadata.timestamp).toLocaleDateString()}</p>
              </div>
            )}
          </div>
        </Card>
      )}
    </motion.div>
  );
};

export default A1SheetViewer;

import React from 'react';
import { Download, Wand2, Eye, X, ZoomIn, ZoomOut, Maximize2, ChevronLeft } from 'lucide-react';
import { useDesignContext } from '../context/DesignContext.jsx';
import { useArchitectWorkflow } from '../hooks/useArchitectWorkflow.js';
import A1SheetViewer from '../components/A1SheetViewer.jsx';
import A1PanelGallery from '../components/A1PanelGallery.jsx';
import GeometryDebugViewer from '../components/GeometryDebugViewer.jsx';
import AIModifyPanel from '../components/AIModifyPanel.jsx';
import ModifyDesignDrawer from '../components/ModifyDesignDrawer.js';
import logger from '../utils/logger.js';


/**
 * ResultsAndModify - Step 6: Display results and enable modifications
 *
 * Features:
 * - A1 sheet display with viewer
 * - Design metadata (DNA, seed, consistency)
 * - Download/export buttons (PDF, DWG, RVT, IFC)
 * - AI Modify panel integration
 * - Version history sidebar
 * - Image zoom modal
 * - Design statistics (cost, timeline)
 *
 * @component
 */
const ResultsAndModify = () => {
  const {
    generatedDesigns,
    currentDesignId,
    showModifyDrawer,
    setShowModifyDrawer,
    modalImage,
    modalImageTitle,
    imageZoom,
    setImageZoom,
    imagePan,
    setImagePan,
    isDragging,
    setIsDragging,
    dragStart,
    setDragStart,
    closeImageModal
  } = useDesignContext();

  const { prevStep } = useArchitectWorkflow();

  if (!generatedDesigns || !generatedDesigns.a1Sheet) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
        <Eye className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-gray-800 mb-2">No Design Generated Yet</h3>
        <p className="text-gray-600 mb-6">
          Please complete the generation step to see results.
        </p>
        <button
          onClick={prevStep}
          className="flex items-center mx-auto px-6 py-3 text-blue-600 hover:text-blue-700 font-medium transition-colors"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Back to Generation
        </button>
      </div>
    );
  }

  const { a1Sheet, masterDNA, cost } = generatedDesigns;
  const composedSheetUrl = a1Sheet.composedSheetUrl || a1Sheet.url;

  // Enhanced download handler with proper blob conversion and proxy support
  const handleDownloadA1Sheet = async () => {
    try {
      logger.info('📥 Download triggered from Results page');

      // Create filename with timestamp and design ID
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const filename = `A1-Sheet-${currentDesignId || 'design'}-${timestamp}.png`;

      let imageUrl = composedSheetUrl;

      // Helper to get proxied URL if needed
      const getProxiedUrl = (url) => {
        if (!url) return null;

        // If already a proxy URL, return as-is
        if (url.includes('/api/proxy') || url.includes('/api/proxy-image')) {
          return url;
        }

        // Check if it's a cross-origin URL that needs proxying
        const needsProxy = url.startsWith('http') &&
          !url.startsWith(window.location.origin) &&
          !url.startsWith('http://localhost') &&
          !url.startsWith('data:');

        if (needsProxy) {
          const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
          const proxyBase = isDev ? 'http://localhost:3001/api/proxy/image' : '/api/proxy-image';
          return `${proxyBase}?url=${encodeURIComponent(url)}`;
        }

        return url;
      };

      // Method 1: If it's a data URL, convert to blob
      if (imageUrl && imageUrl.startsWith('data:')) {
        logger.success(' Data URL detected, converting to blob...');
        const arr = imageUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime || 'image/png' });
        const url = window.URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up
        setTimeout(() => window.URL.revokeObjectURL(url), 100);

        logger.success('A1 sheet downloaded successfully');
        return;
      }

      // Method 2: Use proxy URL for cross-origin images
      const proxiedUrl = getProxiedUrl(imageUrl);
      logger.info('🌐 Fetching image via proxy...', proxiedUrl?.substring(0, 100));

      const response = await fetch(proxiedUrl, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      let blob = await response.blob();

      // Validate blob is actually an image
      if (!blob.type.startsWith('image/')) {
        logger.warn('Blob type is not image, forcing PNG type');
        const arrayBuffer = await blob.arrayBuffer();
        blob = new Blob([arrayBuffer], { type: 'image/png' });
      }

      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up
      setTimeout(() => window.URL.revokeObjectURL(url), 100);

      logger.success('A1 sheet downloaded successfully');

    } catch (error) {
      logger.error('❌ Download failed:', error);
      alert(`Download failed: ${error.message}\n\nPlease try using the download button in the A1 sheet viewer above, or right-click the image and select "Save image as..."`);
    }
  };

  // Image zoom modal handlers
  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setImageZoom(prev => Math.max(0.5, Math.min(prev + delta, 3)));
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - imagePan.x, y: e.clientY - imagePan.y });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    setImagePan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Header with Actions */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl shadow-2xl p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Design Complete!</h2>
            <p className="text-green-100">
              Your comprehensive A1 architectural sheet is ready
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleDownloadA1Sheet}
              className="flex items-center px-6 py-3 bg-white text-green-600 rounded-xl hover:bg-green-50 transition-all font-medium"
            >
              <Download className="w-5 h-5 mr-2" />
              Download A1 Sheet
            </button>
            <button
              onClick={() => setShowModifyDrawer(true)}
              className="flex items-center px-6 py-3 bg-white/10 backdrop-blur text-white border-2 border-white/30 rounded-xl hover:bg-white/20 transition-all font-medium"
            >
              <Wand2 className="w-5 h-5 mr-2" />
              AI Modify
            </button>
          </div>
        </div>

        {/* Quick Stats */}
        {cost && (
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div className="bg-white/10 backdrop-blur rounded-xl p-4">
              <p className="text-sm text-green-100">Estimated Cost</p>
              <p className="text-xl font-bold">{cost.construction}</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-4">
              <p className="text-sm text-green-100">Timeline</p>
              <p className="text-xl font-bold">{cost.timeline}</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-4">
              <p className="text-sm text-green-100">Energy Savings</p>
              <p className="text-xl font-bold">{cost.energySavings}</p>
            </div>
          </div>
        )}
      </div>

      {/* A1 Sheet Display - FIXED: Pass correct prop name */}
      <div className="bg-white rounded-2xl shadow-xl p-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4">A1 Comprehensive Sheet</h3>
        <A1SheetViewer
          sheetData={a1Sheet}
          sitePlanAttachment={generatedDesigns.sitePlanAttachment}
          onDownload={handleDownloadA1Sheet}
          showToast={(msg) => logger.info(msg)}
        />
        <p className="text-sm text-gray-500 mt-4">
          <strong>Use the controls above to zoom and download.</strong> All views embedded in UK RIBA standard format.
          The A1 sheet is displayed at high resolution and includes all architectural views.
        </p>
      </div>

      {/* Panel Gallery */}
      <div className="bg-white rounded-2xl shadow-xl p-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Panel Gallery</h3>
        <A1PanelGallery result={generatedDesigns} />
      </div>

      {/* Geometry Debug Viewer */}
      <div className="bg-white rounded-2xl shadow-xl p-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Geometry Renders (Debug)</h3>
        <GeometryDebugViewer geometryRenders={generatedDesigns.geometryRenders || generatedDesigns.a1Sheet?.geometryRenders} />
      </div>

      {/* Design DNA Information */}
      {masterDNA && (
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Design DNA</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {masterDNA.dimensions && (
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-600 mb-1">Dimensions</p>
                <p className="text-lg font-semibold text-gray-800">
                  {masterDNA.dimensions.length}m × {masterDNA.dimensions.width}m
                </p>
                <p className="text-sm text-gray-500">
                  Height: {masterDNA.dimensions.totalHeight || masterDNA.dimensions.height}m
                </p>
              </div>
            )}

            {masterDNA.materials && (
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-600 mb-1">Primary Material</p>
                <p className="text-lg font-semibold text-gray-800">
                  {masterDNA.materials.exterior?.primary || masterDNA.materials[0]?.name || 'N/A'}
                </p>
              </div>
            )}

            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm text-gray-600 mb-1">Design ID</p>
              <p className="text-sm font-mono text-gray-800">
                {currentDesignId || 'N/A'}
              </p>
            </div>

            {masterDNA.seed && (
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-600 mb-1">Seed (for consistency)</p>
                <p className="text-sm font-mono text-gray-800">{masterDNA.seed}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Export Options */}
      <div className="bg-white rounded-2xl shadow-xl p-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4">Export Options</h3>
        <div className="grid md:grid-cols-4 gap-4">
          {[
            { format: 'PDF', description: 'Portable Document', icon: Download },
            { format: 'DWG', description: 'AutoCAD Drawing', icon: Download },
            { format: 'RVT', description: 'Revit BIM Model', icon: Download },
            { format: 'IFC', description: 'Industry Foundation', icon: Download }
          ].map((option) => (
            <button
              key={option.format}
              onClick={() => logger.info(`Export as ${option.format}`)}
              className="flex flex-col items-center p-4 border-2 border-gray-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all"
            >
              <option.icon className="w-8 h-8 text-gray-600 mb-2" />
              <p className="font-semibold text-gray-800">{option.format}</p>
              <p className="text-xs text-gray-500">{option.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* AI Modify Drawer */}
      <ModifyDesignDrawer
        isOpen={showModifyDrawer}
        onClose={() => setShowModifyDrawer(false)}
      >
        <AIModifyPanel
          designId={currentDesignId}
          currentDesign={generatedDesigns}
          onModificationComplete={(modifiedDesign) => {
            logger.info('✅ Modification complete:', modifiedDesign);
            setShowModifyDrawer(false);
          }}
          onClose={() => setShowModifyDrawer(false)}
        />
      </ModifyDesignDrawer>

      {/* Image Zoom Modal */}
      {modalImage && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
          onClick={closeImageModal}
        >
          <button
            onClick={closeImageModal}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          <div className="absolute top-4 left-4 flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setImageZoom(prev => Math.min(prev + 0.2, 3));
              }}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            >
              <ZoomIn className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setImageZoom(prev => Math.max(prev - 0.2, 0.5));
              }}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            >
              <ZoomOut className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setImageZoom(1);
                setImagePan({ x: 0, y: 0 });
              }}
              className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            >
              <Maximize2 className="w-5 h-5 text-white" />
            </button>
          </div>

          {modalImageTitle && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-white/10 backdrop-blur rounded-full">
              <p className="text-white font-medium">{modalImageTitle}</p>
            </div>
          )}

          <div
            className="relative overflow-hidden"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={(e) => e.stopPropagation()}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
          >
            <img
              src={modalImage}
              alt={modalImageTitle}
              style={{
                transform: `scale(${imageZoom}) translate(${imagePan.x / imageZoom}px, ${imagePan.y / imageZoom}px)`,
                transition: isDragging ? 'none' : 'transform 0.1s',
                maxWidth: '90vw',
                maxHeight: '90vh',
                objectFit: 'contain'
              }}
              draggable={false}
            />
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => window.location.reload()}
          className="flex items-center px-6 py-3 text-gray-600 hover:text-gray-800 font-medium transition-colors"
        >
          <ChevronLeft className="w-5 h-5 mr-1" />
          Start New Project
        </button>
      </div>
    </div>
  );
};

export default ResultsAndModify;

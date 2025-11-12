import React, { useState } from 'react';
import { Download, Wand2, Eye, X, ZoomIn, ZoomOut, Maximize2, ChevronLeft } from 'lucide-react';
import { useDesignContext } from '../context/DesignContext';
import { useArchitectWorkflow } from '../hooks/useArchitectWorkflow';
import A1SheetViewer from '../components/A1SheetViewer';
import AIModifyPanel from '../components/AIModifyPanel';
import ModifyDesignDrawer from '../components/ModifyDesignDrawer';

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
  const [downloadCount, setDownloadCount] = useState(0);

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

  const handleDownloadA1Sheet = async () => {
    try {
      const link = document.createElement('a');
      link.href = a1Sheet.url;
      link.download = `architecture-a1-sheet-${currentDesignId || Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      setDownloadCount(prev => prev + 1);
    } catch (error) {
      console.error('Download failed:', error);
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

      {/* A1 Sheet Display */}
      <div className="bg-white rounded-2xl shadow-xl p-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4">A1 Comprehensive Sheet</h3>
        <A1SheetViewer a1Sheet={a1Sheet} />
        <p className="text-sm text-gray-500 mt-4">
          Click to zoom • All views embedded in UK RIBA standard format
        </p>
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
              onClick={() => console.log(`Export as ${option.format}`)}
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
          design={generatedDesigns}
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

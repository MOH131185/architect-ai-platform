import React, { useState, useEffect, useCallback, useRef } from "react";
import Card from "./ui/Card.jsx";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

function extractPanels(result) {
  if (!result) return [];

  const rawPanels =
    result.panels ||
    result.panelMap ||
    result.a1Sheet?.panels ||
    result.a1Sheet?.panelMap ||
    result.metadata?.panelMap ||
    result.metadata?.panels ||
    result.a1Sheet?.metadata?.panels ||
    {};

  if (Array.isArray(rawPanels)) {
    return rawPanels
      .map((panel, idx) => ({
        key: panel?.id || panel?.type || `panel_${idx}`,
        label: panel?.label || panel?.name || panel?.type || `Panel ${idx + 1}`,
        imageUrl: panel?.imageUrl || panel?.url,
        seed: panel?.seed,
        prompt: panel?.prompt,
        width: panel?.width,
        height: panel?.height,
      }))
      .filter((p) => p.imageUrl);
  }

  if (rawPanels && typeof rawPanels === "object") {
    return Object.entries(rawPanels)
      .map(([key, panel]) => ({
        key,
        label: panel?.name || panel?.label || key,
        imageUrl: panel?.imageUrl || panel?.url,
        seed: panel?.seed,
        prompt: panel?.prompt,
        width: panel?.width,
        height: panel?.height,
      }))
      .filter((p) => p.imageUrl);
  }

  return [];
}

const A1PanelGallery = ({ result }) => {
  const panels = extractPanels(result);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isDownloading, setIsDownloading] = useState(false);
  const imageContainerRef = useRef(null);

  const selectedPanel = selectedIndex !== null ? panels[selectedIndex] : null;

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const openPanel = useCallback(
    (index) => {
      setSelectedIndex(index);
      resetView();
    },
    [resetView],
  );

  const closePanel = useCallback(() => {
    setSelectedIndex(null);
    resetView();
  }, [resetView]);

  const goToPrev = useCallback(() => {
    if (selectedIndex === null || panels.length === 0) return;
    const prev = selectedIndex === 0 ? panels.length - 1 : selectedIndex - 1;
    setSelectedIndex(prev);
    resetView();
  }, [selectedIndex, panels.length, resetView]);

  const goToNext = useCallback(() => {
    if (selectedIndex === null || panels.length === 0) return;
    const next = selectedIndex === panels.length - 1 ? 0 : selectedIndex + 1;
    setSelectedIndex(next);
    resetView();
  }, [selectedIndex, panels.length, resetView]);

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(z + 0.5, 4));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => {
      const next = Math.max(z - 0.5, 1);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.25 : 0.25;
    setZoom((z) => {
      const next = Math.min(Math.max(z + delta, 1), 4);
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const handleMouseDown = useCallback(
    (e) => {
      if (zoom <= 1) return;
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    },
    [zoom, pan],
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDragging) return;
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    },
    [isDragging, dragStart],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDownload = useCallback(
    async (panel) => {
      if (!panel?.imageUrl || isDownloading) return;
      setIsDownloading(true);
      try {
        const response = await fetch(panel.imageUrl);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${panel.label.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        // Fallback: open in new tab
        window.open(panel.imageUrl, "_blank");
      } finally {
        setIsDownloading(false);
      }
    },
    [isDownloading],
  );

  // Keyboard navigation
  useEffect(() => {
    if (selectedIndex === null) return;
    const handleKeyDown = (e) => {
      switch (e.key) {
        case "Escape":
          closePanel();
          break;
        case "ArrowLeft":
          goToPrev();
          break;
        case "ArrowRight":
          goToNext();
          break;
        case "+":
        case "=":
          handleZoomIn();
          break;
        case "-":
          handleZoomOut();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedIndex,
    closePanel,
    goToPrev,
    goToNext,
    handleZoomIn,
    handleZoomOut,
  ]);

  // Lock body scroll when lightbox is open
  useEffect(() => {
    if (selectedIndex !== null) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedIndex]);

  if (!panels.length) {
    return (
      <Card variant="glass" padding="lg" className="text-center">
        <p className="text-gray-400">No individual panels available.</p>
      </Card>
    );
  }

  return (
    <>
      <Card variant="glass" padding="lg" className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">
              A1 Panel Gallery
            </h3>
            <p className="text-sm text-gray-400">
              {panels.length} panels — click to zoom
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {panels.map((panel, index) => (
            <div
              key={panel.key}
              onClick={() => openPanel(index)}
              className="bg-navy-900/60 border border-navy-700 rounded-xl overflow-hidden shadow-md cursor-pointer group transition-all duration-200 hover:scale-[1.03] hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10"
            >
              <div className="aspect-video bg-navy-800 relative overflow-hidden">
                <img
                  src={panel.imageUrl}
                  alt={panel.label}
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-full">
                    <ZoomIn className="w-4 h-4 text-white" />
                    <span className="text-xs text-white font-medium">View</span>
                  </div>
                </div>
              </div>
              <div className="p-3 space-y-1">
                <p className="text-sm font-semibold text-white truncate">
                  {panel.label}
                </p>
                {panel.seed !== undefined && (
                  <p className="text-xs text-gray-400">Seed: {panel.seed}</p>
                )}
                {panel.width && panel.height && (
                  <p className="text-xs text-gray-500">
                    {panel.width} x {panel.height}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Lightbox overlay */}
      {selectedPanel && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: "rgba(0,0,0,0.85)" }}
        >
          {/* Top controls bar */}
          <div
            className="flex items-center justify-between px-4 py-3 bg-black/60 backdrop-blur-sm border-b border-white/10"
            style={{ flexShrink: 0 }}
          >
            {/* Left: panel info */}
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-white font-semibold truncate">
                {selectedPanel.label}
              </span>
              <span className="text-gray-400 text-sm whitespace-nowrap">
                {selectedIndex + 1} / {panels.length}
              </span>
            </div>

            {/* Center: zoom controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleZoomOut}
                disabled={zoom <= 1}
                className="p-2 rounded-lg text-white/80 hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Zoom out (-)"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              <span className="text-white text-sm font-mono w-14 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                disabled={zoom >= 4}
                className="p-2 rounded-lg text-white/80 hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Zoom in (+)"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
              <button
                onClick={resetView}
                className="p-2 rounded-lg text-white/80 hover:bg-white/10 transition-colors"
                title="Fit to screen"
              >
                <Maximize2 className="w-5 h-5" />
              </button>
            </div>

            {/* Right: download + close */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDownload(selectedPanel)}
                disabled={isDownloading}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {isDownloading ? "Saving..." : "Download"}
              </button>
              <button
                onClick={closePanel}
                className="p-2 rounded-lg text-white/80 hover:bg-white/10 transition-colors"
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Image area */}
          <div
            className="flex-1 relative overflow-hidden flex items-center justify-center"
            onClick={(e) => {
              if (e.target === e.currentTarget) closePanel();
            }}
          >
            {/* Prev button */}
            {panels.length > 1 && (
              <button
                onClick={goToPrev}
                className="absolute left-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-colors"
                title="Previous panel"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {/* Next button */}
            {panels.length > 1 && (
              <button
                onClick={goToNext}
                className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 hover:bg-black/70 text-white/80 hover:text-white transition-colors"
                title="Next panel"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}

            {/* Zoomable/pannable image */}
            <div
              ref={imageContainerRef}
              className="w-full h-full flex items-center justify-center"
              style={{
                cursor:
                  zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default",
              }}
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <img
                src={selectedPanel.imageUrl}
                alt={selectedPanel.label}
                draggable={false}
                className="max-w-full max-h-full object-contain select-none"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transition: isDragging ? "none" : "transform 0.2s ease-out",
                }}
              />
            </div>
          </div>

          {/* Bottom info bar */}
          {(selectedPanel.seed !== undefined ||
            (selectedPanel.width && selectedPanel.height)) && (
            <div
              className="px-4 py-2 bg-black/60 backdrop-blur-sm border-t border-white/10 flex items-center gap-4 text-xs text-gray-400"
              style={{ flexShrink: 0 }}
            >
              {selectedPanel.seed !== undefined && (
                <span>Seed: {selectedPanel.seed}</span>
              )}
              {selectedPanel.width && selectedPanel.height && (
                <span>
                  {selectedPanel.width} x {selectedPanel.height}
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default A1PanelGallery;

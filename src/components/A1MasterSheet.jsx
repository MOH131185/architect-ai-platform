/**
 * A1 Master Sheet Viewer Component
 *
 * Displays the composed A1 sheet with:
 * - Zoom/pan controls
 * - Fit to window
 * - Download as PNG (300 DPI)
 */

import React, { useState, useRef, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { composeA1Sheet } from '../services/a1SheetComposer.js';

export default function A1MasterSheet({ projectData }) {
  const [zoom, setZoom] = useState(0.15); // Start at 15% to fit in viewport
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isExporting, setIsExporting] = useState(false);

  const sheetRef = useRef(null);
  const containerRef = useRef(null);

  // Compose A1 sheet HTML
  // eslint-disable-next-line no-unused-vars
  const { html, exportHelpers } = composeA1Sheet(projectData);

  /**
   * Handle zoom in
   */
  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.1, 2.0)); // Max 200%
  };

  /**
   * Handle zoom out
   */
  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.1, 0.1)); // Min 10%
  };

  /**
   * Fit to window
   */
  const handleFitToWindow = () => {
    if (!containerRef.current || !sheetRef.current) return;

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    const sheetWidth = 7016;
    const sheetHeight = 9933;

    const scaleX = containerWidth / sheetWidth;
    const scaleY = containerHeight / sheetHeight;
    const scale = Math.min(scaleX, scaleY) * 0.95; // 95% to add padding

    setZoom(scale);
    setPan({ x: 0, y: 0 });
  };

  /**
   * Handle mouse down (start drag)
   */
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  /**
   * Handle mouse move (pan)
   */
  const handleMouseMove = (e) => {
    if (!isDragging) return;

    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  /**
   * Handle mouse up (end drag)
   */
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  /**
   * Download as PNG
   */
  const handleDownloadPNG = async () => {
    setIsExporting(true);

    try {
      // Create a temporary iframe to render the HTML at full resolution
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.left = '-10000px';
      iframe.style.width = '7016px';
      iframe.style.height = '9933px';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();

      // Wait for images to load
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Use html2canvas to capture
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(iframeDoc.body, {
        scale: 1,
        width: 7016,
        height: 9933,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#FFFFFF'
      });

      // Convert to blob and download
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `A1-Master-Sheet-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Cleanup
        document.body.removeChild(iframe);
        setIsExporting(false);
      }, 'image/png');
    } catch (error) {
      console.error('[A1_SHEET] Export error:', error);
      alert('Failed to export PNG. See console for details.');
      setIsExporting(false);
    }
  };

  /**
   * Download as PDF
   */
  const handleDownloadPDF = () => {
    // Open print dialog with the sheet
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  };

  // Fit to window on mount
  useEffect(() => {
    handleFitToWindow();
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', background: '#2C3E50' }}>
      {/* Toolbar */}
      <div style={{
        background: '#34495E',
        padding: '15px 30px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
      }}>
        <h2 style={{ color: '#FFFFFF', margin: 0, fontSize: '24px', fontWeight: 'bold' }}>
          A1 Master Sheet
        </h2>

        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          {/* Zoom Controls */}
          <button
            onClick={handleZoomOut}
            style={buttonStyle}
            title="Zoom Out"
          >
            −
          </button>

          <span style={{ color: '#FFFFFF', fontSize: '16px', minWidth: '60px', textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </span>

          <button
            onClick={handleZoomIn}
            style={buttonStyle}
            title="Zoom In"
          >
            +
          </button>

          <button
            onClick={handleFitToWindow}
            style={buttonStyle}
            title="Fit to Window"
          >
            Fit
          </button>

          {/* Export Controls */}
          <div style={{ borderLeft: '2px solid #7F8C8D', height: '30px', margin: '0 10px' }} />

          <button
            onClick={handleDownloadPNG}
            disabled={isExporting}
            style={{
              ...buttonStyle,
              background: isExporting ? '#95A5A6' : '#27AE60',
              cursor: isExporting ? 'wait' : 'pointer'
            }}
            title="Download as PNG (300 DPI)"
          >
            {isExporting ? 'Exporting...' : 'Download PNG'}
          </button>

          <button
            onClick={handleDownloadPDF}
            style={{
              ...buttonStyle,
              background: '#E74C3C'
            }}
            title="Print / Save as PDF"
          >
            PDF
          </button>
        </div>
      </div>

      {/* Sheet Container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          background: '#1A252F',
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Sheet */}
        <div
          ref={sheetRef}
          style={{
            width: '7016px',
            height: '9933px',
            transformOrigin: 'top left',
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transition: isDragging ? 'none' : 'transform 0.2s ease',
            boxShadow: '0 10px 50px rgba(0,0,0,0.5)',
            pointerEvents: 'none'
          }}
          dangerouslySetInnerHTML={{
            __html: DOMPurify.sanitize(html, {
              ALLOWED_TAGS: ['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'svg', 'path', 'rect', 'circle', 'line', 'text', 'g', 'defs', 'use', 'polygon', 'polyline', 'ellipse', 'tspan', 'clipPath', 'mask', 'pattern', 'linearGradient', 'radialGradient', 'stop', 'title', 'desc', 'img', 'table', 'tr', 'td', 'th', 'tbody', 'thead'],
              ALLOWED_ATTR: ['class', 'style', 'id', 'data-*', 'viewBox', 'xmlns', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'd', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points', 'transform', 'font-size', 'font-family', 'text-anchor', 'opacity', 'clip-path', 'mask', 'offset', 'stop-color', 'stop-opacity', 'src', 'alt']
            })
          }}
        />
      </div>

      {/* Instructions */}
      <div style={{
        background: '#34495E',
        color: '#BDC3C7',
        padding: '10px 30px',
        fontSize: '14px',
        textAlign: 'center'
      }}>
        <strong>Instructions:</strong> Drag to pan • Mouse wheel to zoom • Use toolbar for controls
      </div>
    </div>
  );
}

// Button style
const buttonStyle = {
  background: '#3498DB',
  color: '#FFFFFF',
  border: 'none',
  borderRadius: '5px',
  padding: '10px 20px',
  fontSize: '16px',
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
};

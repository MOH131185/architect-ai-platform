/**
 * A1 Sheet Viewer Component
 *
 * Displays a single A1 architectural presentation sheet with:
 * - Proper aspect ratio preservation (1.414:1 landscape)
 * - Pan and zoom functionality
 * - Download capabilities
 * - Responsive layout
 */

import React, { useState, useRef, useEffect } from 'react';

const A1SheetViewer = ({ sheetData, onDownload, showToast }) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isDownloading, setIsDownloading] = useState(false);
  const [siteSnapshot, setSiteSnapshot] = useState(null);
  const containerRef = useRef(null);
  const imageRef = useRef(null);

  const A1_ASPECT_RATIO = 1.414; // Width / Height for A1 landscape (841×594mm)

  // Helper function to convert URLs to proxy URLs if needed (to avoid CORS)
  const getProxiedUrl = (url) => {
    if (!url) return null;

    // Check if it's a cross-origin URL that needs proxying
    const needsProxy = url.startsWith('http') &&
                      !url.startsWith(window.location.origin) &&
                      !url.startsWith('http://localhost') &&
                      !url.startsWith('data:');

    if (needsProxy) {
      // Use proxy endpoint to avoid CORS
      return `/api/proxy-image?url=${encodeURIComponent(url)}`;
    }

    // Use URL directly (data URLs, same-origin URLs)
    return url;
  };

  // Reset view to fit
  const handleFit = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Load site snapshot from sessionStorage if available (for visual overlay)
  useEffect(() => {
    try {
      const snap = sessionStorage.getItem('a1SiteSnapshot');
      if (snap) setSiteSnapshot(snap);
    } catch {}
  }, []);

  // Zoom in
  const handleZoomIn = () => {
    setZoom(prevZoom => Math.min(prevZoom + 0.25, 4));
  };

  // Zoom out
  const handleZoomOut = () => {
    setZoom(prevZoom => Math.max(prevZoom - 0.25, 0.5));
  };

  // Mouse wheel zoom
  const handleWheel = (e) => {
    // Note: Cannot use e.preventDefault() in passive wheel listeners
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom(prevZoom => Math.max(0.5, Math.min(4, prevZoom + delta)));
  };

  // Start dragging
  const handleMouseDown = (e) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - pan.x,
        y: e.clientY - pan.y
      });
    }
  };

  // Dragging
  const handleMouseMove = (e) => {
    if (isDragging && zoom > 1) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  // Stop dragging
  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Helper function to download blob as file with proper MIME type
  const downloadBlob = (blob, filename) => {
    // Ensure blob has correct MIME type
    if (!blob.type || blob.type === 'application/octet-stream') {
      blob = new Blob([blob], { type: 'image/png' });
    }
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Small delay before revoking to ensure download starts
    setTimeout(() => window.URL.revokeObjectURL(url), 100);
  };

  // Convert data URL to blob
  const dataURLToBlob = (dataURL) => {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime || 'image/png' });
  };

  // Handle download with 300 DPI upscaling
  const handleDownloadClick = async () => {
    if (onDownload) {
      onDownload();
      return;
    }

    setIsDownloading(true);
    const filename = `A1_Sheet_${sheetData.designId || sheetData.seed || Date.now()}.png`;

    try {
      const imageUrl = sheetData.url;
      const metadata = sheetData.metadata || {};
      const isLandscape = metadata.orientation === 'landscape' || (metadata.width && metadata.height && metadata.width > metadata.height);
      const currentWidth = metadata.width || 1792;
      const currentHeight = metadata.height || 1264;
      
      console.log('📥 Starting download with 300 DPI upscaling...');
      console.log(`   Current: ${currentWidth}×${currentHeight}px (${isLandscape ? 'landscape' : 'portrait'})`);
      console.log(`   Target: ${isLandscape ? '9933×7016px' : '7016×9933px'} @ 300 DPI`);
      
      // Try server-side upscaling first (sharp)
      try {
        const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const upscaleUrl = isDev ? 'http://localhost:3001/api/upscale' : '/api/upscale';
        
        console.log('🔄 Upscaling via server endpoint...');
        const upscaleResponse = await fetch(upscaleUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: getProxiedUrl(imageUrl),
            targetWidth: isLandscape ? 9933 : 7016,
            targetHeight: isLandscape ? 7016 : 9933
          })
        });
        
        if (upscaleResponse.ok) {
          const upscaleResult = await upscaleResponse.json();
          if (upscaleResult.success && upscaleResult.dataUrl) {
            console.log(`✅ Server upscaling successful: ${upscaleResult.width}×${upscaleResult.height}px`);
            const blob = dataURLToBlob(upscaleResult.dataUrl);
            downloadBlob(blob, filename);
            if (showToast) {
              showToast(`PNG downloaded at 300 DPI (${upscaleResult.width}×${upscaleResult.height}px)`, 'success');
            }
            setIsDownloading(false);
            return;
          }
        }
      } catch (upscaleError) {
        console.warn('Server upscaling failed, using client-side fallback:', upscaleError.message);
      }
      
      // Fallback: Client-side upscaling
      try {
        console.log('🔄 Using client-side upscaling...');
        const { upscaleA1SheetForPrint } = await import('../services/imageUpscalingService');
        const upscaledResult = await upscaleA1SheetForPrint(
          getProxiedUrl(imageUrl),
          currentWidth,
          currentHeight,
          isLandscape ? 'landscape' : 'portrait'
        );
        
        if (upscaledResult && upscaledResult.url) {
          console.log(`✅ Client-side upscaling complete: ${upscaledResult.width}×${upscaledResult.height}px`);
          const blob = dataURLToBlob(upscaledResult.url);
          downloadBlob(blob, filename);
          if (showToast) {
            showToast(`PNG downloaded at ${upscaledResult.dpi || 300} DPI (${upscaledResult.width}×${upscaledResult.height}px)`, 'success');
          }
          setIsDownloading(false);
          return;
        }
      } catch (clientError) {
        console.warn('Client-side upscaling failed:', clientError.message);
      }
      
      // Final fallback: Download original
      console.log('⚠️ Upscaling failed, downloading original resolution...');
      // imageUrl already declared above

      // Method 1: Canvas capture from already-loaded image (best for CORS issues)
      // This works because the image is already displayed and loaded in the browser
      if (imageRef.current && imageRef.current.complete && imageRef.current.naturalWidth > 0) {
        console.log('✅ Image already loaded, using canvas capture...');
        try {
          const img = imageRef.current;
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          
          // Draw the image to canvas
          ctx.drawImage(img, 0, 0);

          // If we have a site snapshot, draw it as an inset (visual matches sheet overlay)
          if (siteSnapshot) {
            await new Promise((res) => {
              const insetImg = new Image();
              insetImg.onload = () => {
                const isPortrait = (sheetData?.metadata?.orientation || 'portrait') === 'portrait';
                const insetW = Math.round((isPortrait ? 0.34 : 0.28) * canvas.width);
                const insetH = Math.round((isPortrait ? 0.16 : 0.22) * canvas.height);
                const insetX = Math.round(0.025 * canvas.width);
                const insetY = Math.round(0.04 * canvas.height);

                // Frame
                ctx.fillStyle = '#ffffff';
                ctx.strokeStyle = '#333';
                ctx.lineWidth = Math.max(2, Math.floor(canvas.width / 800));
                ctx.fillRect(insetX, insetY, insetW, insetH);
                ctx.strokeRect(insetX, insetY, insetW, insetH);

                const pad = Math.max(4, Math.floor(insetW * 0.015));
                ctx.drawImage(insetImg, insetX + pad, insetY + pad + 12, insetW - pad * 2, insetH - pad * 2 - 16);
                ctx.fillStyle = '#000';
                ctx.font = `${Math.max(10, Math.floor(insetW / 22))}px Arial`;
                ctx.fillText('SITE PLAN', insetX + pad, insetY + pad + 10);
                res();
              };
              insetImg.onerror = () => res();
              insetImg.src = siteSnapshot;
            });
          }
          
          // Convert to blob and download (promise-based for proper async handling)
          await new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
              if (blob) {
                downloadBlob(blob, filename);
                if (showToast) {
                  showToast('PNG downloaded successfully', 'success');
                } else {
                  console.log('✅ PNG downloaded successfully via canvas capture');
                }
                resolve();
              } else {
                reject(new Error('Canvas toBlob returned null'));
              }
            }, 'image/png', 0.95);
          });
          
          return;
        } catch (canvasError) {
          console.warn('Canvas capture failed, trying other methods...', canvasError);
        }
      }

      // Method 2: Handle data URLs directly (base64)
      if (imageUrl && imageUrl.startsWith('data:image/')) {
        console.log('📦 Detected data URL, converting to blob...');
        try {
          const blob = dataURLToBlob(imageUrl);
          downloadBlob(blob, filename);
          
          if (showToast) {
            showToast('PNG downloaded successfully', 'success');
          } else {
            console.log('✅ PNG downloaded successfully from data URL');
          }
          return;
        } catch (dataUrlError) {
          console.warn('Data URL conversion failed:', dataUrlError);
        }
      }

      // Method 3: Load image and use canvas (URL is already proxied, so CORS should work)
      console.log('🖼️  Loading image for canvas conversion...');
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous'; // Required for canvas operations
        
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Image load timeout'));
          }, 10000); // 10 second timeout
          
          img.onload = () => {
            clearTimeout(timeout);
            resolve();
          };
          img.onerror = (err) => {
            clearTimeout(timeout);
            reject(err);
          };
          // Use proxied URL to avoid CORS issues
          img.src = getProxiedUrl(imageUrl);
        });
        
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        await new Promise((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (blob) {
              downloadBlob(blob, filename);
              if (showToast) {
                showToast('PNG downloaded successfully', 'success');
              } else {
                console.log('✅ PNG downloaded successfully via canvas conversion');
              }
              resolve();
            } else {
              reject(new Error('Canvas toBlob returned null'));
            }
          }, 'image/png', 0.95);
        });
        
        return;
      } catch (canvasError) {
        console.warn('Canvas conversion failed, trying fetch methods...', canvasError);
      }

      // Method 4: Direct fetch with CORS handling (using proxy)
      try {
        console.log('🌐 Attempting direct fetch...');
        const response = await fetch(getProxiedUrl(imageUrl), {
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
          console.warn('Blob type is not image, forcing PNG type');
          const arrayBuffer = await blob.arrayBuffer();
          blob = new Blob([arrayBuffer], { type: 'image/png' });
        }
        
        downloadBlob(blob, filename);

        if (showToast) {
          showToast('PNG downloaded successfully', 'success');
        } else {
          console.log('✅ PNG downloaded successfully via direct fetch');
        }
        return;
      } catch (directError) {
        console.warn('Direct fetch failed:', directError.message);
      }

      // Method 5: Proxy fallback (use correct endpoint for dev/prod)
      try {
        const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        const proxyUrl = isDev 
          ? `http://localhost:3001/api/proxy/image?url=${encodeURIComponent(imageUrl)}`
          : `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
        console.log('🔄 Attempting proxy download via:', proxyUrl);

        const response = await fetch(proxyUrl);
        if (!response.ok) {
          throw new Error(`Proxy returned ${response.status}: ${response.statusText}`);
        }
        
        let blob = await response.blob();
        
        // Validate blob is actually an image
        if (!blob.type.startsWith('image/')) {
          console.warn('Proxy blob type is not image, forcing PNG type');
          const arrayBuffer = await blob.arrayBuffer();
          blob = new Blob([arrayBuffer], { type: 'image/png' });
        }
        
        downloadBlob(blob, filename);

        if (showToast) {
          showToast('PNG downloaded via proxy', 'success');
        } else {
          console.log('✅ PNG downloaded successfully via proxy');
        }
        return;
      } catch (proxyError) {
        console.warn('Proxy download failed:', proxyError.message);
      }

      // If all methods fail, show error
      throw new Error('All download methods failed. The image may be blocked by CORS or network restrictions.');

    } catch (error) {
      console.error('❌ Download failed:', error);
      
      const errorMessage = `Download failed: ${error.message}. Try right-clicking the image and selecting "Save image as..."`;
      
      if (showToast) {
        showToast(errorMessage, 'error', 8000);
      } else {
        alert(errorMessage);
      }
    } finally {
      setIsDownloading(false);
    }
  };

  // Cleanup event listeners
  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  if (!sheetData || !sheetData.url) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-100 rounded-lg">
        <p className="text-gray-500">No A1 sheet available</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Control Bar */}
      <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow-md">
        <div className="flex items-center space-x-2">
          <button
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
            className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            title="Zoom Out"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
          </button>

          <button
            onClick={handleFit}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            title="Fit to Screen"
          >
            Fit
          </button>

          <button
            onClick={handleZoomIn}
            disabled={zoom >= 4}
            className="px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            title="Zoom In"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </button>

          <span className="px-3 py-2 bg-gray-100 text-gray-700 rounded font-mono text-sm">
            {(zoom * 100).toFixed(0)}%
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-sm text-gray-600 hidden sm:inline">
            A1 Landscape (841×594mm)
          </span>

          <button
            onClick={handleDownloadClick}
            disabled={isDownloading}
            className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
            title={isDownloading ? "Downloading..." : "Download PNG"}
          >
            {isDownloading ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Downloading...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download PNG</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Viewer Container */}
      <div
        ref={containerRef}
        className="relative w-full bg-gray-200 rounded-lg overflow-hidden shadow-lg"
        style={{
          height: '70vh',
          cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Image with proper A1 aspect ratio */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
            transition: isDragging ? 'none' : 'transform 0.2s ease-out'
          }}
        >
          <img
            ref={imageRef}
            src={getProxiedUrl(sheetData.url)}
            alt="A1 Architectural Presentation Sheet"
            className="max-w-full max-h-full object-contain"
            style={{
              aspectRatio: A1_ASPECT_RATIO.toString(),
              maxWidth: '95%',
              maxHeight: '95%'
            }}
            draggable={false}
            onError={(e) => {
              console.error('Failed to load A1 sheet image');
              e.target.style.display = 'none';
            }}
          />
          {siteSnapshot && (
            <div
              className="absolute"
              style={{
                top: '4%',
                left: '2.5%',
                width: '34%',
                height: '16%',
                border: '1px solid #333',
                boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                background: '#fff',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div style={{ fontSize: 12, padding: '2px 6px' }}>SITE PLAN</div>
              <img src={siteSnapshot} alt="Site plan" style={{ flex: 1, objectFit: 'cover', width: '100%', height: '100%' }} />
            </div>
          )}
        </div>

        {/* Loading overlay */}
        {!imageRef.current?.complete && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading A1 sheet...</p>
            </div>
          </div>
        )}
      </div>

      {/* Sheet Info */}
      <div className="bg-white p-4 rounded-lg shadow-md">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Format:</span>
            <p className="font-semibold">{sheetData.metadata?.format || 'A1 landscape'}</p>
          </div>
          <div>
            <span className="text-gray-500">Resolution:</span>
            <p className="font-semibold">
              {sheetData.metadata?.width || 1536} × {sheetData.metadata?.height || 1088}px
            </p>
          </div>
          <div>
            <span className="text-gray-500">Aspect Ratio:</span>
            <p className="font-semibold">{sheetData.metadata?.aspectRatio || '1.414'}</p>
          </div>
          <div>
            <span className="text-gray-500">Seed:</span>
            <p className="font-semibold font-mono">{sheetData.seed || 'N/A'}</p>
          </div>
        </div>

        {/* Site Map Indicator */}
        {sheetData.metadata?.insetSources?.hasRealSiteMap && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center space-x-2 text-sm">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <span className="text-gray-700 font-semibold">Real Site Map Included</span>
              <span className="text-gray-500 text-xs">
                ({sheetData.metadata?.insetSources?.siteMapAttribution || 'Map data © Google'})
              </span>
            </div>
            <p className="text-xs text-gray-600 mt-1 ml-7">
              Site context panel uses actual Google Maps satellite imagery with site boundary overlay
            </p>
          </div>
        )}

        {sheetData.prompt && (
          <details className="mt-4">
            <summary className="cursor-pointer text-blue-600 hover:text-blue-800 font-semibold">
              View Generation Prompt
            </summary>
            <pre className="mt-2 p-3 bg-gray-50 rounded text-xs overflow-x-auto whitespace-pre-wrap">
              {sheetData.prompt.substring(0, 500)}
              {sheetData.prompt.length > 500 && '...'}
            </pre>
          </details>
        )}
      </div>

    </div>
  );
};

export default A1SheetViewer;

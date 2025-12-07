/**
 * A1 Sheet Viewer - Deepgram-Inspired Design
 *
 * Displays A1 architectural sheet with blueprint background and spotlight effects
 */

import React, { useState, useRef, useEffect } from 'react';

import { motion, AnimatePresence } from 'framer-motion';
import { ZoomIn, ZoomOut, Maximize2, Download, Check, Loader2 } from 'lucide-react';

// Removed html-to-image - using direct fetch download instead
import logger from '../services/core/logger.js';
import { fadeInUp } from '../styles/animations.js';
import { normalizeSheetMetadata } from '../types/schemas.js';

import Button from './ui/Button.jsx';
import Card from './ui/Card.jsx';

/**
 * Validates that a blob contains valid PNG data by checking magic bytes
 * PNG files start with: 89 50 4E 47 0D 0A 1A 0A
 */
const isValidImageBlob = async (blob) => {
  if (!blob || blob.size < 8) {
    return false;
  }
  try {
    const header = await blob.slice(0, 8).arrayBuffer();
    const bytes = new Uint8Array(header);
    // PNG magic bytes: 89 50 4E 47
    const isPNG = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    // JPEG magic bytes: FF D8 FF
    const isJPEG = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    return isPNG || isJPEG;
  } catch {
    return false;
  }
};

// eslint-disable-next-line no-unused-vars -- onModify, onExport reserved for future toolbar actions
const A1SheetViewer = ({
  result,
  sheetData,
  sitePlanAttachment,
  designId,
  onModify: _onModify,
  onExport: _onExport,
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
  const [resolvedSheetUrl, setResolvedSheetUrl] = useState(null);
  const [mousePosition, setMousePosition] = useState({ x: 50, y: 50 });

  const containerRef = useRef(null);
  const imageRef = useRef(null);

  const rawSheetUrl =
    sheet?.composedSheetUrl ||
    sheet?.url ||
    result?.composedSheetUrl ||
    result?.url ||
    result?.a1Sheet?.composedSheetUrl ||
    result?.a1Sheet?.url;

  // Determine proxy base (dev uses localhost:3001, prod uses same origin)
  const proxyBase = React.useMemo(() => {
    const explicitBase = (process.env.REACT_APP_API_PROXY_URL || '').trim().replace(/\/$/, '');
    if (explicitBase) {
      return `${explicitBase}/api/proxy-image`;
    }

    if (typeof window !== 'undefined') {
      const isLocalhost =
        window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      return isLocalhost ? 'http://localhost:3001/api/proxy-image' : '/api/proxy-image';
    }

    return '/api/proxy-image';
  }, []);

  // Proxy Together AI URLs through our backend to avoid CORS, but fall back to raw URL if needed
  const sheetUrlCandidates = React.useMemo(() => {
    if (!rawSheetUrl) {
      return [];
    }

    const cleanedUrl = rawSheetUrl.trim();
    if (!cleanedUrl) {
      return [];
    }

    const candidates = [];

    // Check if URL is already proxied
    const isAlreadyProxied =
      cleanedUrl.includes('/api/proxy/image') || cleanedUrl.includes('/api/proxy-image');

    // Check if a data URL was incorrectly proxied (extract it from proxy URL)
    let extractedDataUrl = null;
    let isDataUrl = cleanedUrl.startsWith('data:') || cleanedUrl.startsWith('blob:');

    // If URL is proxied, try to extract the actual URL
    if (isAlreadyProxied && cleanedUrl.includes('url=')) {
      try {
        const urlMatch = cleanedUrl.match(/[?&]url=([^&]+)/);
        if (urlMatch) {
          const decoded = decodeURIComponent(urlMatch[1]);
          // Check if the decoded URL is a data URL
          if (
            decoded.startsWith('data:image/') ||
            decoded.startsWith('data:') ||
            decoded.startsWith('blob:')
          ) {
            extractedDataUrl = decoded;
            isDataUrl = true; // Treat as data URL
            console.warn(
              '⚠️  Detected proxied data URL - extracting for direct use:',
              decoded.substring(0, 50) + '...'
            );
          }
        }
      } catch (e) {
        // Ignore extraction errors
      }
    }

    // Also check if cleanedUrl itself is a URL-encoded data URL (without proxy wrapper)
    if (!isDataUrl && !extractedDataUrl) {
      try {
        // Try decoding the entire URL to see if it's a data URL
        if (cleanedUrl.includes('%3A') || cleanedUrl.includes('%2F')) {
          const decoded = decodeURIComponent(cleanedUrl);
          if (
            decoded.startsWith('data:image/') ||
            decoded.startsWith('data:') ||
            decoded.startsWith('blob:')
          ) {
            isDataUrl = true;
            extractedDataUrl = decoded;
            console.warn('⚠️  Detected URL-encoded data URL - using decoded version');
          }
        }
      } catch (e) {
        // Ignore decoding errors
      }
    }

    const shouldProxy =
      !isDataUrl &&
      !extractedDataUrl &&
      (cleanedUrl.includes('api.together.ai') ||
        cleanedUrl.includes('api.together.xyz') ||
        cleanedUrl.includes('cdn.together.xyz') ||
        cleanedUrl.includes('together-cdn.com'));

    const proxied = `${proxyBase}?url=${encodeURIComponent(cleanedUrl)}`;

    if (isDataUrl || extractedDataUrl) {
      // Use data URL directly (never proxy)
      candidates.push(extractedDataUrl || cleanedUrl);
    } else if (isAlreadyProxied) {
      candidates.push(cleanedUrl);
    } else if (shouldProxy) {
      candidates.push(proxied, cleanedUrl);
    } else {
      candidates.push(cleanedUrl, proxied);
    }

    return Array.from(new Set(candidates));
  }, [proxyBase, rawSheetUrl]);

  useEffect(() => {
    let isCancelled = false;

    if (!sheetUrlCandidates.length) {
      console.error('❌ A1SheetViewer: No URL candidates available', {
        rawSheetUrl,
        sheet,
        result,
      });
      setIsLoading(false);
      setLoadError('No A1 sheet available');
      setResolvedSheetUrl(null);
      return;
    }

    console.log('🔍 A1SheetViewer: Attempting to load sheet', {
      candidateCount: sheetUrlCandidates.length,
      candidates: sheetUrlCandidates,
      rawSheetUrl,
    });

    setIsLoading(true);
    setLoadError(null);
    setResolvedSheetUrl(null);

    const tryLoad = (index = 0) => {
      const candidate = sheetUrlCandidates[index];
      if (!candidate) {
        if (!isCancelled) {
          console.error('❌ A1SheetViewer: All URL candidates failed', {
            triedCount: index,
            candidates: sheetUrlCandidates,
          });
          setLoadError('Failed to load A1 sheet');
          setIsLoading(false);
        }
        return;
      }

      console.log(`🔄 A1SheetViewer: Trying candidate ${index + 1}/${sheetUrlCandidates.length}`, {
        url: candidate.substring(0, 100) + (candidate.length > 100 ? '...' : ''),
      });

      const img = new Image();
      img.onload = () => {
        if (isCancelled) {
          return;
        }
        console.log(`✅ A1SheetViewer: Successfully loaded candidate ${index + 1}`, {
          url: candidate.substring(0, 100) + (candidate.length > 100 ? '...' : ''),
        });
        setResolvedSheetUrl(candidate);
        setIsLoading(false);
        setLoadError(null);
      };
      img.onerror = (error) => {
        if (isCancelled) {
          return;
        }
        console.warn(`⚠️ A1SheetViewer: Failed to load candidate ${index + 1}`, {
          url: candidate.substring(0, 100) + (candidate.length > 100 ? '...' : ''),
          error,
        });
        const nextIndex = index + 1;
        if (nextIndex < sheetUrlCandidates.length) {
          tryLoad(nextIndex);
        } else {
          console.error('❌ A1SheetViewer: All candidates exhausted');
          setLoadError('Failed to load A1 sheet');
          setIsLoading(false);
        }
      };
      img.src = candidate;
    };

    tryLoad();

    return () => {
      isCancelled = true;
    };
  }, [sheetUrlCandidates]);

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 4));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleFit = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

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
    const downloadSources = resolvedSheetUrl
      ? [resolvedSheetUrl, ...sheetUrlCandidates.filter((url) => url !== resolvedSheetUrl)]
      : sheetUrlCandidates;

    try {
      if (!downloadSources.length) {
        throw new Error('No A1 sheet URL available');
      }

      // If any candidate is a data URL, download it directly without fetch
      const dataSource = downloadSources.find(
        (url) => url && url.startsWith('data:') && url.includes(',')
      );
      if (dataSource) {
        try {
          const [meta, data] = dataSource.split(',');
          if (!data) {
            throw new Error('Invalid data URL: missing base64 data');
          }
          const mime = meta.match(/:(.*?);/)?.[1] || 'image/png';
          // Clean the base64 string - remove any URL-encoding or whitespace
          const cleanData = data.replace(/\s/g, '').replace(/%[0-9A-Fa-f]{2}/g, '');
          const byteString = atob(cleanData);
          const buffer = new Uint8Array(byteString.length);
          for (let i = 0; i < byteString.length; i += 1) {
            buffer[i] = byteString.charCodeAt(i);
          }
          const blob = new Blob([buffer], { type: mime });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.download = `a1-sheet-${designId || Date.now()}.png`;
          link.href = url;
          link.click();
          window.URL.revokeObjectURL(url);
          setIsDownloading(false);
          return;
        } catch (base64Error) {
          // If base64 decoding fails, fall through to fetch-based download
          logger.warn('Base64 decoding failed, trying fetch instead:', {
            error: base64Error.message,
          });
        }
      }

      let blob = null;
      let lastError = null;
      for (const source of downloadSources) {
        if (!source) {
          continue;
        }
        try {
          const response = await fetch(source, { method: 'GET', mode: 'cors', cache: 'no-cache' });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const candidateBlob = await response.blob();

          // Validate blob is not empty
          if (candidateBlob.size === 0) {
            throw new Error('Empty response received from server');
          }

          // Validate blob is actually an image (PNG/JPEG magic bytes)
          if (!(await isValidImageBlob(candidateBlob))) {
            // Try to read error message if it's text/HTML
            const textContent = await candidateBlob.text().catch(() => '');
            if (textContent.toLowerCase().includes('error') || textContent.includes('<html')) {
              logger.warn(
                'Server returned error response instead of image:',
                textContent.substring(0, 200)
              );
              throw new Error('Server returned an error instead of an image');
            }
            throw new Error('Response is not a valid PNG/JPEG image');
          }

          blob = candidateBlob;
          break;
        } catch (err) {
          lastError = err;
          logger.warn('Download attempt failed:', {
            source: source?.substring(0, 50),
            error: err.message,
          });
        }
      }

      if (!blob) {
        throw lastError || new Error('Unable to download A1 sheet - all sources failed');
      }

      // Blob is already validated as a real image - use as-is
      // If content-type header was wrong but magic bytes are valid, browser will still open it

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `a1-sheet-${designId || Date.now()}.png`;
      link.href = url;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      logger.error('Download failed:', error);
      // Fallback: open in new tab
      window.open(resolvedSheetUrl || (downloadSources.length ? downloadSources[0] : ''), '_blank');
    } finally {
      setIsDownloading(false);
    }
  };

  if (!sheetUrlCandidates.length) {
    return (
      <Card variant="glass" padding="xl" className="text-center">
        <p className="text-gray-400">No A1 sheet available</p>
      </Card>
    );
  }

  return (
    <motion.div variants={fadeInUp} initial="initial" animate="animate" className="space-y-4">
      {/* Controls */}
      <Card variant="glass" padding="sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleZoomIn} disabled={zoom >= 4}>
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleZoomOut} disabled={zoom <= 0.5}>
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleFit}>
              <Maximize2 className="w-4 h-4" />
            </Button>
            <span className="text-sm text-gray-400 ml-2">{Math.round(zoom * 100)}%</span>
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
                  src={resolvedSheetUrl || sheetUrlCandidates[0]}
                  alt="A1 Architectural Sheet"
                  className="w-full h-auto"
                  draggable={false}
                />

                {/* Site Map Overlay - Client-side composition */}
                {!metadata?.sitePlanComposited && sitePlanAttachment?.dataUrl && (
                  <div
                    className="absolute border border-gray-900/10 bg-gray-50"
                    style={{
                      top: '4%',
                      left: '2.5%',
                      width: '34%',
                      height: '16%',
                      zIndex: 10,
                      overflow: 'hidden',
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

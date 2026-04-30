/**
 * A1 Sheet Viewer - Deepgram-Inspired Design
 *
 * Displays A1 architectural sheet with blueprint background and spotlight effects
 */

import React, { useState, useRef, useEffect } from "react";

import { motion, AnimatePresence } from "framer-motion";
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  Check,
  Loader2,
} from "lucide-react";

// Removed html-to-image - using direct fetch download instead
import logger from "../services/core/logger.js";
import { fadeInUp } from "../styles/animations.js";
import { normalizeSheetMetadata } from "../types/schemas.js";
import { sanitizeSvgDataUrl } from "../utils/svgPathSanitizer.js";

import Button from "./ui/Button.jsx";
import Card from "./ui/Card.jsx";

/**
 * Validates that a blob contains a recognised A1 deliverable by checking
 * magic bytes for PNG / JPEG / PDF, or a leading <svg / <?xml prologue for
 * SVG. Plan §6.11: the canonical deliverable is a PDF; PNG and SVG are also
 * accepted.
 */
const isValidImageBlob = async (blob) => {
  if (!blob || blob.size < 4) {
    return false;
  }
  try {
    const header = await blob.slice(0, 8).arrayBuffer();
    const bytes = new Uint8Array(header);
    const isPNG =
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47;
    const isJPEG = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    // PDF magic: %PDF
    const isPDF =
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46;
    if (isPNG || isJPEG || isPDF) return true;
    // SVG: leading "<svg" or "<?xml" — read first 32 chars as text
    const head = await blob.slice(0, 32).text();
    if (/^\s*<\?xml/i.test(head) || /^\s*<svg/i.test(head)) return true;
    return false;
  } catch {
    return false;
  }
};

/**
 * Decode a data: URL into a Blob with the correct mime type. Handles both
 * base64-encoded payloads (PNG / PDF / JPEG) and URL-encoded payloads
 * (image/svg+xml is emitted by useArchitectAIWorkflow.svgToDataUrl).
 */
const decodeDataUrlToBlob = (dataUrl) => {
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) {
    throw new Error("Invalid data URL: missing payload separator");
  }
  const meta = dataUrl.slice(5, commaIndex); // strip "data:"
  const data = dataUrl.slice(commaIndex + 1);
  const mime = (meta.split(";")[0] || "application/octet-stream").trim();
  const isBase64 = /;base64\b/i.test(meta);
  if (isBase64) {
    const cleanData = data.replace(/\s/g, "");
    if (!cleanData) {
      throw new Error("Invalid data URL: empty base64 payload");
    }
    const byteString = atob(cleanData);
    const buffer = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i += 1) {
      buffer[i] = byteString.charCodeAt(i);
    }
    return new Blob([buffer], { type: mime });
  }
  // URL-encoded payload (e.g., data:image/svg+xml;charset=utf-8,<encoded>)
  const decoded = decodeURIComponent(data);
  return new Blob([decoded], { type: mime });
};

const extensionForMime = (mime = "") => {
  switch (mime) {
    case "application/pdf":
      return "pdf";
    case "image/svg+xml":
      return "svg";
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
};

const sanitizeSheetUrl = (value = "") => {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return sanitizeSvgDataUrl(trimmed);
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

  // PDF is the canonical RIBA A1 deliverable per plan §6.11; if present,
  // prefer it for download even though the SVG drives the on-screen viewer.
  const pdfDownloadUrl =
    sheet?.pdfUrl ||
    result?.pdfUrl ||
    result?.a1Sheet?.pdfUrl ||
    result?.artifacts?.a1Pdf?.dataUrl ||
    null;
  const sheetSeries = React.useMemo(() => {
    const rawSeries =
      result?.sheetSeries ||
      result?.artifacts?.sheetSeries ||
      result?.metadata?.sheetSeries ||
      [];
    return (Array.isArray(rawSeries) ? rawSeries : [])
      .map((entry) => ({
        sheetNumber: entry.sheet_number || entry.sheetNumber || "A1",
        label: entry.sheet_label || entry.label || "A1 sheet",
        pdfUrl: entry.pdf_data_url || entry.pdfUrl || null,
      }))
      .filter((entry) => entry.pdfUrl);
  }, [result]);

  // Determine proxy base (dev uses localhost:3001, prod uses same origin)
  const proxyBase = React.useMemo(() => {
    const explicitBase = (process.env.REACT_APP_API_PROXY_URL || "")
      .trim()
      .replace(/\/$/, "");
    if (explicitBase) {
      return `${explicitBase}/api/proxy-image`;
    }

    if (typeof window !== "undefined") {
      const isLocalhost =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
      return isLocalhost
        ? "http://localhost:3001/api/proxy-image"
        : "/api/proxy-image";
    }

    return "/api/proxy-image";
  }, []);

  // Proxy Together AI URLs through our backend to avoid CORS, but fall back to raw URL if needed
  const sheetUrlCandidates = React.useMemo(() => {
    if (!rawSheetUrl) {
      return [];
    }

    const cleanedUrl = sanitizeSheetUrl(rawSheetUrl);
    if (!cleanedUrl) {
      return [];
    }

    const candidates = [];

    // Check if URL is already proxied
    const isAlreadyProxied =
      cleanedUrl.includes("/api/proxy/image") ||
      cleanedUrl.includes("/api/proxy-image");

    // Check if a data URL was incorrectly proxied (extract it from proxy URL)
    let extractedDataUrl = null;
    let isDataUrl =
      cleanedUrl.startsWith("data:") || cleanedUrl.startsWith("blob:");

    // If URL is proxied, try to extract the actual URL
    if (isAlreadyProxied && cleanedUrl.includes("url=")) {
      try {
        const urlMatch = cleanedUrl.match(/[?&]url=([^&]+)/);
        if (urlMatch) {
          const decoded = sanitizeSheetUrl(decodeURIComponent(urlMatch[1]));
          // Check if the decoded URL is a data URL
          if (
            decoded.startsWith("data:image/") ||
            decoded.startsWith("data:") ||
            decoded.startsWith("blob:")
          ) {
            extractedDataUrl = decoded;
            isDataUrl = true; // Treat as data URL
            console.warn(
              "⚠️  Detected proxied data URL - extracting for direct use:",
              decoded.substring(0, 50) + "...",
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
        if (cleanedUrl.includes("%3A") || cleanedUrl.includes("%2F")) {
          const decoded = sanitizeSheetUrl(decodeURIComponent(cleanedUrl));
          if (
            decoded.startsWith("data:image/") ||
            decoded.startsWith("data:") ||
            decoded.startsWith("blob:")
          ) {
            isDataUrl = true;
            extractedDataUrl = decoded;
            console.warn(
              "⚠️  Detected URL-encoded data URL - using decoded version",
            );
          }
        }
      } catch (e) {
        // Ignore decoding errors
      }
    }

    const shouldProxy =
      !isDataUrl &&
      !extractedDataUrl &&
      (cleanedUrl.includes("api.together.ai") ||
        cleanedUrl.includes("api.together.xyz") ||
        cleanedUrl.includes("cdn.together.xyz") ||
        cleanedUrl.includes("together-cdn.com"));

    const proxied = `${proxyBase}?url=${encodeURIComponent(cleanedUrl)}`;

    if (isDataUrl || extractedDataUrl) {
      // Use data URL directly (never proxy)
      candidates.push(sanitizeSheetUrl(extractedDataUrl || cleanedUrl));
    } else if (isAlreadyProxied) {
      candidates.push(sanitizeSheetUrl(cleanedUrl));
    } else if (shouldProxy) {
      candidates.push(proxied, sanitizeSheetUrl(cleanedUrl));
    } else {
      candidates.push(sanitizeSheetUrl(cleanedUrl), proxied);
    }

    return Array.from(new Set(candidates));
  }, [proxyBase, rawSheetUrl]);

  useEffect(() => {
    let isCancelled = false;

    if (!sheetUrlCandidates.length) {
      console.error("❌ A1SheetViewer: No URL candidates available", {
        rawSheetUrl,
        candidateCount: sheetUrlCandidates.length,
      });
      setIsLoading(false);
      setLoadError("No A1 sheet available");
      setResolvedSheetUrl(null);
      return;
    }

    console.log("🔍 A1SheetViewer: Attempting to load sheet", {
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
          console.error("❌ A1SheetViewer: All URL candidates failed", {
            triedCount: index,
            candidates: sheetUrlCandidates,
          });
          setLoadError("Failed to load A1 sheet");
          setIsLoading(false);
        }
        return;
      }

      console.log(
        `🔄 A1SheetViewer: Trying candidate ${index + 1}/${sheetUrlCandidates.length}`,
        {
          url:
            candidate.substring(0, 100) + (candidate.length > 100 ? "..." : ""),
        },
      );

      const img = new Image();
      img.onload = () => {
        if (isCancelled) {
          return;
        }
        console.log(
          `✅ A1SheetViewer: Successfully loaded candidate ${index + 1}`,
          {
            url:
              candidate.substring(0, 100) +
              (candidate.length > 100 ? "..." : ""),
          },
        );
        setResolvedSheetUrl(candidate);
        setIsLoading(false);
        setLoadError(null);
      };
      img.onerror = (error) => {
        if (isCancelled) {
          return;
        }
        console.warn(
          `⚠️ A1SheetViewer: Failed to load candidate ${index + 1}`,
          {
            url:
              candidate.substring(0, 100) +
              (candidate.length > 100 ? "..." : ""),
            error,
          },
        );
        const nextIndex = index + 1;
        if (nextIndex < sheetUrlCandidates.length) {
          tryLoad(nextIndex);
        } else {
          console.error("❌ A1SheetViewer: All candidates exhausted");
          setLoadError("Failed to load A1 sheet");
          setIsLoading(false);
        }
      };
      img.src = candidate;
    };

    tryLoad();

    return () => {
      isCancelled = true;
    };
  }, [rawSheetUrl, sheetUrlCandidates]);

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

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
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
    // Plan §6.11 / §9: the canonical RIBA A1 deliverable is the vector PDF.
    // Try it first when present, then fall back to the SVG/PNG candidates.
    const downloadSources = [
      pdfDownloadUrl,
      resolvedSheetUrl,
      ...sheetUrlCandidates,
    ].filter((url, index, arr) => Boolean(url) && arr.indexOf(url) === index);

    try {
      if (!downloadSources.length) {
        throw new Error("No A1 sheet URL available");
      }

      // If any candidate is a data URL, download it directly without fetch
      const dataSource = downloadSources.find(
        (url) => url && url.startsWith("data:") && url.includes(","),
      );
      if (dataSource) {
        try {
          const blob = decodeDataUrlToBlob(dataSource);
          const ext = extensionForMime(blob.type);
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.download = `a1-sheet-${designId || Date.now()}.${ext}`;
          link.href = url;
          link.rel = "noopener";
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          setIsDownloading(false);
          return;
        } catch (decodeError) {
          // If decoding fails, fall through to fetch-based download
          logger.warn("Data URL decode failed, trying fetch instead:", {
            error: decodeError.message,
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
          const response = await fetch(source, {
            method: "GET",
            mode: "cors",
            cache: "no-cache",
          });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          const candidateBlob = await response.blob();

          // Validate blob is not empty
          if (candidateBlob.size === 0) {
            throw new Error("Empty response received from server");
          }

          // Validate blob is actually an image (PNG/JPEG magic bytes)
          if (!(await isValidImageBlob(candidateBlob))) {
            // Try to read error message if it's text/HTML
            const textContent = await candidateBlob.text().catch(() => "");
            if (
              textContent.toLowerCase().includes("error") ||
              textContent.includes("<html")
            ) {
              logger.warn(
                "Server returned error response instead of image:",
                textContent.substring(0, 200),
              );
              throw new Error("Server returned an error instead of an image");
            }
            throw new Error(
              "Response is not a recognised PDF / SVG / PNG / JPEG payload",
            );
          }

          blob = candidateBlob;
          break;
        } catch (err) {
          lastError = err;
          logger.warn("Download attempt failed:", {
            source: source?.substring(0, 50),
            error: err.message,
          });
        }
      }

      if (!blob) {
        throw (
          lastError ||
          new Error("Unable to download A1 sheet - all sources failed")
        );
      }

      // Pick the right file extension from the actual blob mime so SVG and PDF
      // deliverables don't end up with a misleading .png suffix.
      const ext = extensionForMime(blob.type) || "bin";
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `a1-sheet-${designId || Date.now()}.${ext}`;
      link.href = url;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      logger.error("Download failed:", error);
      // Fallback: open in new tab
      window.open(
        resolvedSheetUrl || (downloadSources.length ? downloadSources[0] : ""),
        "_blank",
      );
    } finally {
      setIsDownloading(false);
    }
  };

  if (!sheetUrlCandidates.length) {
    return (
      <Card variant="glass" padding="xl" className="text-center">
        <p className="text-white/65">No A1 sheet available</p>
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
            <Button variant="ghost" size="sm" onClick={handleFit}>
              <Maximize2 className="w-4 h-4" />
            </Button>
            <span className="text-sm text-white/65 ml-2">
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
        {sheetSeries.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
            <span className="text-xs font-semibold uppercase text-white/45">
              PDF set
            </span>
            {sheetSeries.map((entry) => (
              <a
                key={`${entry.sheetNumber}-${entry.label}`}
                href={entry.pdfUrl}
                download={
                  `${entry.sheetNumber}-${entry.label}`
                    .replace(/[^a-zA-Z0-9_-]+/g, "-")
                    .replace(/^-|-$/g, "")
                    .toLowerCase() + ".pdf"
                }
                className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-white/75 transition-colors hover:border-royal-400/60 hover:text-white"
              >
                {entry.sheetNumber}
              </a>
            ))}
          </div>
        )}
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
            "--mouse-x": `${mousePosition.x}%`,
            "--mouse-y": `${mousePosition.y}%`,
          }}
        >
          <div
            ref={containerRef}
            className="relative bg-navy-900 rounded-2xl overflow-hidden"
            style={{
              minHeight: "600px",
              cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default",
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
                  className="absolute inset-0 bg-navy-900"
                >
                  {/* A1-aspect-ratio skeleton: shimmer placeholder matching the
                      sheet's aspect ratio so layout doesn't jump on load. */}
                  <div
                    className="absolute inset-0 bg-[length:200%_100%] bg-gradient-to-r from-white/[0.04] via-white/[0.10] to-white/[0.04] animate-shimmer"
                    style={{ aspectRatio: "1792 / 1269" }}
                    aria-hidden="true"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <Loader2
                        className="w-12 h-12 text-royal-400 animate-spin mx-auto mb-4"
                        strokeWidth={1.75}
                      />
                      <p className="text-white/65">Composing A1 sheet…</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {loadError && (
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <div
                  role="alert"
                  className="rounded-xl border border-error-500/30 bg-error-500/10 px-4 py-3 text-sm text-error-200"
                >
                  {loadError}
                </div>
              </div>
            )}

            {!isLoading && !loadError && (
              <motion.div
                ref={imageRef}
                className="relative"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "center center",
                  transition: isDragging ? "none" : "transform 0.2s ease-out",
                }}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
              >
                <img
                  src={resolvedSheetUrl || sheetUrlCandidates[0]}
                  alt={
                    metadata?.projectName
                      ? `Generated A1 architectural sheet for ${metadata.projectName}${metadata.buildingType ? `, ${metadata.buildingType}` : ""}${metadata.location ? ` in ${metadata.location}` : ""}`
                      : "Generated A1 architectural sheet — floor plans, elevations, sections, and 3D views"
                  }
                  className="h-auto w-full"
                  draggable={false}
                />

                {/* Site Map Overlay - Client-side composition */}
                {!metadata?.sitePlanComposited &&
                  sitePlanAttachment?.dataUrl && (
                    <div
                      className="absolute border border-gray-900/10 bg-gray-50"
                      style={{
                        top: "4%",
                        left: "2.5%",
                        width: "34%",
                        height: "16%",
                        zIndex: 10,
                        overflow: "hidden",
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
                <p className="text-white/55 mb-1">Design ID</p>
                <p className="text-white font-mono">
                  {metadata.designId.slice(0, 8)}...
                </p>
              </div>
            )}
            {metadata.seed && (
              <div>
                <p className="text-white/55 mb-1">Seed</p>
                <p className="text-white font-mono">{metadata.seed}</p>
              </div>
            )}
            {metadata.version && (
              <div>
                <p className="text-white/55 mb-1">Version</p>
                <p className="text-white font-semibold">v{metadata.version}</p>
              </div>
            )}
            {metadata.timestamp && (
              <div>
                <p className="text-white/55 mb-1">Generated</p>
                <p className="text-white">
                  {new Date(metadata.timestamp).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}
    </motion.div>
  );
};

export default A1SheetViewer;

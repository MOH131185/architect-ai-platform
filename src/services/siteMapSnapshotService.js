/**
 * Site Map Snapshot Service
 *
 * Captures Google Maps snapshot with polygon overlay for pixel-exact parity across A1 modifications.
 * Ensures the site map in the A1 sheet doesn't drift when modifications are made.
 *
 * Features:
 * - Google Static Maps API integration with polygon overlay
 * - SHA256 hash for deduplication and validation
 * - Metadata tracking (center, zoom, mapType, size, polygon coords)
 * - Persistent snapshot storage for exact reuse in modifications
 */

import CryptoJS from "crypto-js";
import logger from "../utils/logger.js";

async function blobToDataUrl(blob) {
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () =>
        reject(new Error("Failed to convert map image to base64"));
      reader.readAsDataURL(blob);
    });
  }

  const arrayBuffer = await blob.arrayBuffer();
  const mimeType = blob.type || "image/png";
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

const STATIC_MAP_COLOR_NAMES = {
  red: "0xff0000ff",
  orange: "0xf59e0bff",
  yellow: "0xffcc00ff",
  paleGreen: "0xb7d7a833",
  paleBlue: "0xb7d8f033",
};

function opacityToAlpha(opacity, fallback = "ff") {
  const numeric = Number(opacity);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.round(Math.max(0, Math.min(1, numeric)) * 255)
    .toString(16)
    .padStart(2, "0");
}

function normalizeStaticMapColor(value, fallback, alpha = "ff") {
  if (!value) return fallback;
  const raw = String(value).trim();
  const named = STATIC_MAP_COLOR_NAMES[raw];
  if (named) return named;

  const googleHex = raw.match(/^0x([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (googleHex) {
    return `0x${googleHex[1]}${googleHex[2] || alpha}`;
  }

  const cssHex = raw.match(/^#?([0-9a-f]{6})([0-9a-f]{2})?$/i);
  if (cssHex) {
    return `0x${cssHex[1]}${cssHex[2] || alpha}`;
  }

  return fallback;
}

/**
 * Get site snapshot from Google Static Maps API
 * @param {Object} params - Snapshot parameters
 * @param {Object} params.coordinates - { lat, lng } coordinates
 * @param {Array} params.polygon - Optional array of { lat, lng } points for site boundary overlay
 * @param {Object} params.polygonStyle - Optional Google Static Maps path style
 * @param {boolean} params.drawPolygonOverlay - Whether to draw the polygon into the static map image
 * @param {number} params.zoom - Zoom level (default 19, used if polygon not provided)
 * @param {Array} params.size - [width, height] in pixels (default [640, 400])
 * @param {string} params.mapType - Map type: 'roadmap' (default), 'satellite', 'hybrid', 'terrain'
 * @returns {Promise<string>} Base64 data URL of the map image
 */
export async function getSiteSnapshot({
  coordinates,
  polygon = null,
  polygonStyle = null,
  drawPolygonOverlay = true,
  zoom = 19,
  size = [640, 400],
  mapType = "roadmap",
}) {
  if (!coordinates || !coordinates.lat || !coordinates.lng) {
    throw new Error("Coordinates are required (lat, lng)");
  }

  const apiKey =
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.REACT_APP_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    logger.warn(
      "⚠️  Google Maps API key not found. Site map snapshot will be skipped.",
    );
    return null;
  }

  const sizeParam = `${size[0]}x${size[1]}`;

  // Build polygon path if provided
  let pathParam = "";
  if (
    drawPolygonOverlay &&
    polygon &&
    Array.isArray(polygon) &&
    polygon.length > 0
  ) {
    const pathPoints = polygon.map(({ lat, lng }) => `${lat},${lng}`).join("|");
    const fillAlpha = opacityToAlpha(polygonStyle?.fillOpacity, "33");
    const fillColor = normalizeStaticMapColor(
      polygonStyle?.fillColor,
      "0x1976d233",
      fillAlpha,
    );
    const strokeColor = normalizeStaticMapColor(
      polygonStyle?.strokeColor || polygonStyle?.color,
      "0x1976d2ff",
    );
    const strokeWeight = Math.max(
      1,
      Math.round(
        Number(polygonStyle?.strokeWeight ?? polygonStyle?.weight) || 3,
      ),
    );

    pathParam = `&path=fillcolor:${fillColor}|color:${strokeColor}|weight:${strokeWeight}|${pathPoints}`;
  }

  // Build visible parameter if polygon provided (auto-fit view to polygon)
  let visibleParam = "";
  if (polygon && Array.isArray(polygon) && polygon.length > 0) {
    // Use visible parameter to auto-fit map to polygon bounds
    const visiblePoints = polygon
      .map(({ lat, lng }) => `${lat},${lng}`)
      .join("|");
    visibleParam = `&visible=${visiblePoints}`;
  }

  // Build Google Static Maps URL
  const url =
    `https://maps.googleapis.com/maps/api/staticmap?center=${coordinates.lat},${coordinates.lng}` +
    (visibleParam ? visibleParam : `&zoom=${zoom}`) +
    `&size=${sizeParam}` +
    `&scale=2` + // High-resolution (2x scale)
    `&format=png` + // PNG format for better quality
    `&maptype=${mapType}` + // Map type (roadmap for plan mode)
    pathParam +
    `&key=${apiKey}`;

  try {
    logger.info(`🗺️  Fetching site snapshot from Google Static Maps...`);
    logger.info(`   Center: ${coordinates.lat}, ${coordinates.lng}`);
    logger.info(`   Map Type: ${mapType}`);
    logger.info(
      `   ${visibleParam ? "Visible bounds (auto-fit)" : `Zoom: ${zoom}`}`,
    );
    logger.info(`   Size: ${size[0]}×${size[1]}px`);
    logger.info(
      `   Polygon: ${
        polygon
          ? `${polygon.length} points (${drawPolygonOverlay ? "drawn" : "bounds only"})`
          : "none"
      }`,
    );

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        `❌ Google Static Maps API error: ${response.status} ${response.statusText}`,
      );
      logger.error(`   Response: ${errorText.substring(0, 200)}`);
      throw new Error(`Google Static Maps API error: ${response.status}`);
    }

    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    logger.success(` Site snapshot fetched successfully`);
    logger.info(`   Data URL length: ${dataUrl.length} chars`);
    return dataUrl;
  } catch (error) {
    logger.error("❌ Site snapshot fetch failed:", error.message);
    // Return null instead of throwing - allows workflow to continue without site map
    return null;
  }
}

/**
 * Get site snapshot with attribution metadata
 * @param {Object} params - Same as getSiteSnapshot, plus optional mapType (defaults to 'roadmap')
 * @returns {Promise<Object>} { dataUrl, attribution, sourceUrl, hasPolygon }
 */
export async function getSiteSnapshotWithMetadata(params) {
  // Ensure mapType defaults to 'roadmap' for plan mode
  const dataUrl = await getSiteSnapshot({
    ...params,
    mapType: params.mapType || "roadmap",
  });

  if (!dataUrl) {
    return null;
  }

  return {
    dataUrl,
    attribution: "Map data © Google",
    sourceUrl: "google-static-maps",
    hasPolygon: params.polygon && params.polygon.length > 0,
    mapType: params.mapType || "roadmap",
    polygonStyle: params.polygonStyle || null,
    drawPolygonOverlay: params.drawPolygonOverlay !== false,
  };
}

/**
 * Capture site snapshot with full metadata for persistence (ENHANCED for A1 parity)
 * @param {Object} params - Snapshot parameters
 * @param {Object} params.center - Map center { lat, lng }
 * @param {number} params.zoom - Zoom level (default: 17)
 * @param {string} params.mapType - Map type: 'roadmap' | 'satellite' | 'hybrid' | 'terrain'
 * @param {Object} params.size - Image size { width, height } (default: { width: 400, height: 300 })
 * @param {Array} params.polygon - Polygon coordinates [{ lat, lng }, ...]
 * @param {Object} params.polygonStyle - Polygon style { strokeColor, strokeWeight, fillColor, fillOpacity }
 * @param {boolean} params.drawPolygonOverlay - Whether to draw the polygon into the static map image
 * @returns {Promise<Object>} Snapshot with { dataUrl, sha256, center, zoom, mapType, size, polygon, polygonStyle, capturedAt }
 */
export async function captureSnapshotForPersistence({
  center = null,
  coordinates = null, // Alias for center
  zoom = 17,
  mapType = "hybrid",
  size = { width: 400, height: 300 },
  polygon = null,
  polygonStyle = {
    strokeColor: "#1976D2",
    strokeWeight: 3,
    fillColor: "#1976D2",
    fillOpacity: 0.18,
  },
  drawPolygonOverlay = true,
}) {
  // Accept both 'center' and 'coordinates' for backward compatibility
  const resolvedCenter = center || coordinates;

  if (!resolvedCenter || !resolvedCenter.lat || !resolvedCenter.lng) {
    logger.warn("⚠️ No valid center/coordinates provided for site snapshot");
    return null;
  }

  logger.info("📸 Capturing site snapshot for persistence...");
  logger.info(
    `   Center: ${resolvedCenter.lat.toFixed(6)}, ${resolvedCenter.lng.toFixed(6)}`,
  );
  logger.info(`   Zoom: ${zoom}, Map type: ${mapType}`);
  logger.info(`   Size: ${size.width}×${size.height}px`);
  logger.info(`   Polygon: ${polygon ? polygon.length + " points" : "none"}`);

  try {
    // Convert size to array format for getSiteSnapshot
    const sizeArray = [size.width || 400, size.height || 300];

    // Capture snapshot using existing function
    const dataUrl = await getSiteSnapshot({
      coordinates: resolvedCenter,
      polygon,
      polygonStyle,
      drawPolygonOverlay,
      zoom,
      size: sizeArray,
      mapType,
    });

    if (!dataUrl) {
      logger.warn("⚠️ Site snapshot capture returned null");
      return null;
    }

    // Compute SHA256 hash for deduplication
    const sha256 = CryptoJS.SHA256(dataUrl).toString();

    logger.success(" Site snapshot captured with metadata");
    logger.info(`   Hash: ${sha256.substring(0, 16)}...`);
    logger.info(`   Data URL length: ${dataUrl.length} chars`);

    return {
      dataUrl,
      sha256,
      center: resolvedCenter,
      zoom,
      mapType,
      size: { width: sizeArray[0], height: sizeArray[1] },
      polygon,
      polygonStyle,
      drawPolygonOverlay,
      capturedAt: new Date().toISOString(),
      source: "google-static-maps-api",
    };
  } catch (error) {
    logger.error("❌ Failed to capture site snapshot for persistence:", error);
    return null;
  }
}

export default {
  getSiteSnapshot,
  getSiteSnapshotWithMetadata,
  captureSnapshotForPersistence,
};

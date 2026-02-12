/**
 * A1 Layout Composer Service
 *
 * Composes individual panel images into a complete A1 architectural sheet.
 * Uses sharp for server-side image processing.
 *
 * @module services/a1LayoutComposer
 */

import {
  A1_WIDTH,
  A1_HEIGHT,
  WORKING_WIDTH,
  WORKING_HEIGHT,
  LABEL_HEIGHT,
  LABEL_PADDING,
  FRAME_STROKE_WIDTH,
  FRAME_STROKE_COLOR,
  FRAME_RADIUS,
  GRID_SPEC,
  REQUIRED_PANELS,
  PANEL_LABELS,
  toPixelRect,
  validatePanelLayout,
  getPanelFitMode,
} from "./a1/a1LayoutConstants.js";
import {
  renderSchedulesSVG,
  renderMaterialPaletteSVG,
  renderClimateCardSVG,
} from "./dataPanelRenderer.js";
import { embedFontInSVG } from "../utils/svgFontEmbedder.js";

/**
 * Embed fonts in SVG string before passing to sharp for rasterization.
 * Ensures text renders correctly on Vercel/librsvg where system fonts
 * may not be available.
 */
async function embedFontsForSharp(svgString) {
  try {
    return await embedFontInSVG(svgString);
  } catch {
    // Graceful degradation — return original SVG
    return svgString;
  }
}

// Re-export for backward compatibility
export {
  A1_WIDTH,
  A1_HEIGHT,
  WORKING_WIDTH,
  WORKING_HEIGHT,
  GRID_SPEC,
  validatePanelLayout,
};

/**
 * Compose A1 sheet from panel images
 *
 * @param {Object} options - Composition options
 * @param {Array} options.panels - Array of panel objects { id, type, buffer, label }
 * @param {Buffer} options.siteOverlay - Optional site plan overlay buffer
 * @param {Object} options.layoutConfig - Optional custom layout configuration
 * @param {Object} options.titleBlock - Optional title block metadata
 * @returns {Promise<{buffer: Buffer, coordinates: Object}>}
 */
export async function composeA1Sheet({
  panels = [],
  siteOverlay = null,
  layoutConfig = null,
  titleBlock = null,
  masterDNA = null,
  projectContext = null,
  locationData = null,
}) {
  // Use dynamic import for sharp (server-side only)
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch (e) {
    throw new Error(
      "sharp module not available - server-side composition requires sharp",
    );
  }

  const layout = layoutConfig || GRID_SPEC;
  const width = WORKING_WIDTH;
  const height = WORKING_HEIGHT;

  // Create white background
  const background = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  }).png();

  // Prepare composite operations
  const composites = [];
  const coordinates = {};

  // Index panels by type for fast lookup
  const panelMap = new Map(panels.map((p) => [p.type, p]));

  // Place panels according to grid
  for (const [type, slot] of Object.entries(layout)) {
    const slotRect = toPixelRect(slot, width, height);
    coordinates[type] = { ...slotRect, labelHeight: LABEL_HEIGHT };

    // Title block handled separately
    if (type === "title_block") {
      const titleBuffer = await buildTitleBlockBuffer(
        sharp,
        slotRect.width,
        slotRect.height - LABEL_HEIGHT - LABEL_PADDING,
        titleBlock,
      );
      composites.push({
        input: titleBuffer,
        left: slotRect.x,
        top: slotRect.y,
      });
      continue;
    }

    const panel = panelMap.get(type);
    const mode = getPanelFitMode(type);

    // DATA PANELS: Render deterministic SVG for text-heavy data panels
    // Uses dataPanelRenderer.js for improved SVG templates with proper
    // Unicode encoding, font fallbacks, and richer data display.
    const svgPanelHeight = slotRect.height - LABEL_HEIGHT - LABEL_PADDING;
    if (
      type === "schedules_notes" &&
      ((!panel?.buffer && !panel?.imageUrl) || panel?.svgPanel)
    ) {
      const svgStr = await embedFontsForSharp(
        renderSchedulesSVG(
          slotRect.width,
          svgPanelHeight,
          masterDNA,
          projectContext,
        ),
      );
      const schedulesBuffer = await sharp(Buffer.from(svgStr))
        .png()
        .resize(slotRect.width, svgPanelHeight, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255 },
        })
        .toBuffer();
      composites.push({
        input: schedulesBuffer,
        left: slotRect.x,
        top: slotRect.y,
      });
      continue;
    }
    if (
      type === "material_palette" &&
      ((!panel?.buffer && !panel?.imageUrl) || panel?.svgPanel)
    ) {
      const svgStr = await embedFontsForSharp(
        renderMaterialPaletteSVG(slotRect.width, svgPanelHeight, masterDNA),
      );
      const materialBuffer = await sharp(Buffer.from(svgStr))
        .png()
        .resize(slotRect.width, svgPanelHeight, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255 },
        })
        .toBuffer();
      composites.push({
        input: materialBuffer,
        left: slotRect.x,
        top: slotRect.y,
      });
      continue;
    }
    if (
      type === "climate_card" &&
      ((!panel?.buffer && !panel?.imageUrl) || panel?.svgPanel)
    ) {
      const svgStr = await embedFontsForSharp(
        renderClimateCardSVG(
          slotRect.width,
          svgPanelHeight,
          locationData,
          masterDNA,
        ),
      );
      const climateBuffer = await sharp(Buffer.from(svgStr))
        .png()
        .resize(slotRect.width, svgPanelHeight, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255 },
        })
        .toBuffer();
      composites.push({
        input: climateBuffer,
        left: slotRect.x,
        top: slotRect.y,
      });
      continue;
    }

    if (panel?.buffer) {
      const resizedBuffer = await placePanelImage({
        sharp,
        imageBuffer: panel.buffer,
        slotRect,
        mode,
      });

      composites.push({
        input: resizedBuffer,
        left: slotRect.x,
        top: slotRect.y,
      });
    } else if (panel?.imageUrl) {
      try {
        const fetched = await fetchPanelBuffer(sharp, panel.imageUrl);
        const resizedBuffer = await placePanelImage({
          sharp,
          imageBuffer: fetched,
          slotRect,
          mode,
        });

        composites.push({
          input: resizedBuffer,
          left: slotRect.x,
          top: slotRect.y,
        });
      } catch (err) {
        console.error(
          `[A1Composer] Failed to fetch panel ${type}:`,
          err.message,
        );
        const placeholder = await buildPlaceholder(
          sharp,
          slotRect.width,
          slotRect.height - LABEL_HEIGHT - LABEL_PADDING,
          type,
        );
        composites.push({
          input: placeholder,
          left: slotRect.x,
          top: slotRect.y,
        });
      }
    } else {
      const placeholder = await buildPlaceholder(
        sharp,
        slotRect.width,
        slotRect.height - LABEL_HEIGHT - LABEL_PADDING,
        type,
      );
      composites.push({
        input: placeholder,
        left: slotRect.x,
        top: slotRect.y,
      });
    }
  }

  // Add site overlay if provided (used as direct image for site_diagram)
  if (siteOverlay) {
    const siteLayout = layout.site_diagram || GRID_SPEC.site_diagram;
    const slotRect = toPixelRect(siteLayout, width, height);

    try {
      const resizedOverlay = await sharp(siteOverlay)
        .resize(
          slotRect.width,
          slotRect.height - LABEL_HEIGHT - LABEL_PADDING,
          { fit: "cover", position: "centre" },
        )
        .png()
        .toBuffer();

      composites.push({
        input: resizedOverlay,
        left: slotRect.x,
        top: slotRect.y,
      });

      coordinates.site_overlay = { ...slotRect, labelHeight: LABEL_HEIGHT };
      console.log(
        `[A1Composer] Added site overlay at (${slotRect.x}, ${slotRect.y})`,
      );
    } catch (err) {
      console.error("[A1Composer] Failed to add site overlay:", err.message);
    }
  }

  // Draw panel frames and labels (with embedded fonts for Vercel/librsvg)
  const overlaySvg = await embedFontsForSharp(
    generateOverlaySvg(coordinates, width, height),
  );
  composites.push({
    input: Buffer.from(overlaySvg),
    left: 0,
    top: 0,
  });

  // Compose all panels onto background
  const composedBuffer = await background
    .composite(composites)
    .png()
    .toBuffer();

  console.log(
    `[A1Composer] Sheet composed: ${composites.length} elements, ${width}x${height}px`,
  );

  return {
    buffer: composedBuffer,
    coordinates,
    metadata: {
      width,
      height,
      panelCount: panels.length,
      hasOverlay: !!siteOverlay,
    },
  };
}

/**
 * Escape XML special characters to prevent SVG corruption
 * @param {string} text - Raw text to escape
 * @returns {string} XML-safe text
 */
function escapeXml(text) {
  if (!text) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Sanitize Unicode characters for safe SVG/Sharp rasterization.
 * Converts common Unicode literals to XML numeric character references
 * that librsvg can render reliably even without full font support.
 */
function sanitizeSvgText(text) {
  if (!text) return "";
  return escapeXml(text)
    .replace(/\u00B2/g, "&#178;") // ² superscript 2
    .replace(/\u00B0/g, "&#176;") // ° degree
    .replace(/\u00B1/g, "&#177;") // ± plus-minus
    .replace(/\u00D7/g, "&#215;") // × multiplication
    .replace(/\u2014/g, "&#8212;") // — em-dash
    .replace(/\u2018/g, "&#8216;") // ' left single quote
    .replace(/\u2019/g, "&#8217;") // ' right single quote
    .replace(/\u201C/g, "&#8220;") // " left double quote
    .replace(/\u201D/g, "&#8221;"); // " right double quote
}

/**
 * Generate SVG with panel borders and labels
 */
function generateOverlaySvg(coordinates, width, height) {
  let frames = "";
  let labels = "";

  for (const [id, coord] of Object.entries(coordinates)) {
    const labelText = sanitizeSvgText(
      PANEL_LABELS[id] || (id || "").toUpperCase(),
    );
    const labelY = coord.y + coord.height - Math.round(LABEL_HEIGHT / 2) + 4;
    const labelTop = coord.y + coord.height - LABEL_HEIGHT;

    frames += `<rect x="${coord.x}" y="${coord.y}" width="${coord.width}" height="${coord.height}"
      fill="none" stroke="${FRAME_STROKE_COLOR}" stroke-width="${FRAME_STROKE_WIDTH}" rx="${FRAME_RADIUS}" ry="${FRAME_RADIUS}" />`;

    labels += `<rect x="${coord.x}" y="${labelTop}" width="${coord.width}" height="${LABEL_HEIGHT}"
      fill="#ffffff" fill-opacity="0.9" />`;
    labels += `<text x="${coord.x + coord.width / 2}" y="${labelY}"
      font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#111"
      dominant-baseline="middle" text-anchor="middle">${labelText}</text>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${frames}
    ${labels}
  </svg>`;
}

/**
 * Upscale composed sheet to print resolution
 *
 * @param {Buffer} buffer - Input buffer at working resolution
 * @param {Object} options - Upscale options
 * @returns {Promise<Buffer>}
 */
export async function upscaleToA1(buffer, options = {}) {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch (e) {
    throw new Error("sharp module not available");
  }

  const { width = A1_WIDTH, height = A1_HEIGHT } = options;

  return sharp(buffer)
    .resize(width, height, { fit: "fill", kernel: "lanczos3" })
    .png({ quality: 100 })
    .toBuffer();
}

/**
 * Place panel image into slot with proper fit mode
 * @private
 */
async function placePanelImage({ sharp, imageBuffer, slotRect, mode }) {
  const targetHeight = Math.max(
    10,
    slotRect.height - LABEL_HEIGHT - LABEL_PADDING,
  );

  // Get image metadata to check aspect ratio
  try {
    const metadata = await sharp(imageBuffer).metadata();
    const imageAspect = metadata.width / metadata.height;
    const slotAspect = slotRect.width / targetHeight;

    // Warn if aspect ratio mismatch is significant (>20% difference)
    if (Math.abs(imageAspect - slotAspect) / slotAspect > 0.2) {
      console.warn(
        `[A1Composer] Aspect ratio mismatch for panel: image ${imageAspect.toFixed(2)} vs slot ${slotAspect.toFixed(2)}`,
      );
    }
  } catch (metaError) {
    console.warn(
      "[A1Composer] Could not read image metadata:",
      metaError.message,
    );
  }

  // Create white canvas for the slot
  const canvas = sharp({
    create: {
      width: slotRect.width,
      height: targetHeight,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  });

  // Resize image with proper fit mode (contain preserves aspect ratio with white margins)
  const resizedImage = await sharp(imageBuffer)
    .resize(slotRect.width, targetHeight, {
      fit: mode === "cover" ? "cover" : "contain",
      position: "centre",
      background: { r: 255, g: 255, b: 255 },
    })
    .png()
    .toBuffer();

  // Composite image onto white canvas
  return canvas
    .composite([{ input: resizedImage, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

/**
 * Fetch panel buffer from URL
 * @private
 */
async function fetchPanelBuffer(sharp, imageUrl) {
  // Handle data URLs
  if (imageUrl.startsWith("data:")) {
    const base64Data = imageUrl.split(",")[1];
    return Buffer.from(base64Data, "base64");
  }

  const { default: fetch } = await import("node-fetch");
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Build placeholder image for missing panel
 * @private
 */
async function buildPlaceholder(sharp, width, height, type) {
  const text = "PANEL MISSING – REGENERATE";
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#f5f5f5" stroke="${FRAME_STROKE_COLOR}" stroke-width="2" rx="${FRAME_RADIUS}" ry="${FRAME_RADIUS}" />
      <text x="${width / 2}" y="${height / 2 - 4}" font-size="18" font-family="Arial, sans-serif" font-weight="700"
        text-anchor="middle" fill="#9ca3af">${text}</text>
      <text x="${width / 2}" y="${height / 2 + 18}" font-size="14" font-family="Arial, sans-serif"
        text-anchor="middle" fill="#b91c1c">${(type || "").toUpperCase()}</text>
    </svg>
  `;

  const embeddedSvg = await embedFontsForSharp(svg);
  return sharp(Buffer.from(embeddedSvg))
    .png()
    .resize(width, height, {
      fit: "contain",
      background: { r: 245, g: 245, b: 245 },
    })
    .toBuffer();
}

/**
 * Build title block buffer
 * @private
 */
async function buildTitleBlockBuffer(sharp, width, height, titleBlock = {}) {
  const {
    projectName = "Architect AI",
    buildingTypeLabel = "A1 PRESENTATION BOARD",
    locationDesc = "Location TBD",
    scale = "Scale 1:100 @ A1",
    date = new Date().toISOString().split("T")[0],
  } = titleBlock || {};

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" stroke="${FRAME_STROKE_COLOR}" stroke-width="2" rx="${FRAME_RADIUS}" ry="${FRAME_RADIUS}" />
      <text x="16" y="36" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#0f172a">${sanitizeSvgText(projectName)}</text>
      <text x="16" y="66" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="600" fill="#1f2937">${sanitizeSvgText(buildingTypeLabel)}</text>
      <text x="16" y="96" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#374151">${sanitizeSvgText(locationDesc)}</text>
      <text x="16" y="126" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="#374151">${sanitizeSvgText(scale)}</text>
      <text x="16" y="${height - 16}" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#6b7280">Date: ${sanitizeSvgText(date)}</text>
    </svg>
  `;

  const embeddedSvg = await embedFontsForSharp(svg);
  return sharp(Buffer.from(embeddedSvg))
    .png()
    .resize(width, height, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255 },
    })
    .toBuffer();
}

/**
 * Build deterministic SVG for Schedules & Notes panel
 */
async function buildSchedulesBuffer(
  sharp,
  width,
  height,
  masterDNA,
  projectContext,
) {
  const rooms =
    masterDNA?.rooms ||
    masterDNA?.program?.rooms ||
    projectContext?.programSpaces ||
    [];
  const materials = masterDNA?.materials || [];
  const leftMargin = 12;
  const colArea = Math.round(width * 0.55);
  const colFloor = Math.round(width * 0.8);
  const rowHeight = 18;
  const headerY = 40;

  let roomRows = "";
  const displayRooms = (Array.isArray(rooms) ? rooms : []).slice(0, 12);
  displayRooms.forEach((room, idx) => {
    const y = headerY + 20 + idx * rowHeight;
    const name =
      typeof room === "string"
        ? room
        : room.name || room.type || `Room ${idx + 1}`;
    const area = room.dimensions || room.area || "";
    const floor =
      room.floor != null ? (room.floor === 0 ? "GF" : `L${room.floor}`) : "";
    roomRows += `
      <text x="${leftMargin}" y="${y}" font-family="Arial, sans-serif" font-size="9" fill="#1f2937">${idx + 1}.</text>
      <text x="${leftMargin + 20}" y="${y}" font-family="Arial, sans-serif" font-size="9" fill="#1f2937">${escapeXml(name)}</text>
      <text x="${colArea}" y="${y}" font-family="Arial, sans-serif" font-size="9" fill="#475569">${escapeXml(String(area))}</text>
      <text x="${colFloor}" y="${y}" font-family="Arial, sans-serif" font-size="9" fill="#475569">${escapeXml(floor)}</text>`;
  });

  const roomsEndY = headerY + 20 + displayRooms.length * rowHeight + 10;

  let matRows = "";
  const displayMats = (Array.isArray(materials) ? materials : []).slice(0, 6);
  displayMats.forEach((mat, idx) => {
    const y = roomsEndY + 36 + idx * rowHeight;
    const name =
      typeof mat === "string"
        ? mat
        : mat.name || mat.type || `Material ${idx + 1}`;
    const application = mat.application || "";
    matRows += `
      <text x="${leftMargin}" y="${y}" font-family="Arial, sans-serif" font-size="9" fill="#1f2937">${idx + 1}. ${escapeXml(name)}</text>
      <text x="${colArea}" y="${y}" font-family="Arial, sans-serif" font-size="9" fill="#475569">${escapeXml(application)}</text>`;
  });

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" stroke="${FRAME_STROKE_COLOR}" stroke-width="2" rx="${FRAME_RADIUS}" ry="${FRAME_RADIUS}" />
      <rect x="8" y="8" width="${width - 16}" height="24" fill="#f1f5f9" rx="2" />
      <text x="${width / 2}" y="24" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="700" fill="#0f172a" text-anchor="middle">ROOM SCHEDULE</text>
      <text x="${leftMargin}" y="${headerY}" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="#64748b">NO.</text>
      <text x="${leftMargin + 20}" y="${headerY}" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="#64748b">ROOM</text>
      <text x="${colArea}" y="${headerY}" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="#64748b">AREA</text>
      <text x="${colFloor}" y="${headerY}" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="#64748b">FLOOR</text>
      <line x1="8" y1="${headerY + 4}" x2="${width - 8}" y2="${headerY + 4}" stroke="#e2e8f0" stroke-width="1" />
      ${roomRows}
      <line x1="8" y1="${roomsEndY}" x2="${width - 8}" y2="${roomsEndY}" stroke="#e2e8f0" stroke-width="1" />
      <rect x="8" y="${roomsEndY + 4}" width="${width - 16}" height="24" fill="#f1f5f9" rx="2" />
      <text x="${width / 2}" y="${roomsEndY + 20}" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="#0f172a" text-anchor="middle">MATERIALS SCHEDULE</text>
      ${matRows}
    </svg>
  `;

  const embeddedSvg = await embedFontsForSharp(svg);
  return sharp(Buffer.from(embeddedSvg))
    .png()
    .resize(width, height, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255 },
    })
    .toBuffer();
}

/**
 * Build deterministic SVG for Material Palette panel
 */
async function buildMaterialPaletteBuffer(sharp, width, height, masterDNA) {
  const materials = masterDNA?.materials || [];
  const displayMats = (Array.isArray(materials) ? materials : []).slice(0, 8);

  const cols = 2;
  const margin = 12;
  const headerH = 36;
  const swatchW = Math.floor((width - margin * 3) / cols);
  const swatchH = 40;
  const gap = 8;

  let swatches = "";
  displayMats.forEach((mat, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = margin + col * (swatchW + margin);
    const y = headerH + 12 + row * (swatchH + gap + 20);

    const name =
      typeof mat === "string"
        ? mat
        : mat.name || mat.type || `Material ${idx + 1}`;
    const hexColor = mat.hexColor || "#cccccc";
    const application = mat.application || "";

    swatches += `
      <rect x="${x}" y="${y}" width="${swatchW}" height="${swatchH}" fill="${escapeXml(hexColor)}" stroke="#e2e8f0" stroke-width="1" rx="3" />
      <text x="${x}" y="${y + swatchH + 12}" font-family="Arial, sans-serif" font-size="9" font-weight="600" fill="#1f2937">${escapeXml(name)}</text>
      <text x="${x}" y="${y + swatchH + 24}" font-family="Arial, sans-serif" font-size="8" fill="#64748b">${escapeXml(hexColor)} — ${escapeXml(application)}</text>`;
  });

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" stroke="${FRAME_STROKE_COLOR}" stroke-width="2" rx="${FRAME_RADIUS}" ry="${FRAME_RADIUS}" />
      <rect x="8" y="8" width="${width - 16}" height="24" fill="#f1f5f9" rx="2" />
      <text x="${width / 2}" y="24" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="700" fill="#0f172a" text-anchor="middle">MATERIAL PALETTE</text>
      ${swatches}
    </svg>
  `;

  const embeddedSvg = await embedFontsForSharp(svg);
  return sharp(Buffer.from(embeddedSvg))
    .png()
    .resize(width, height, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255 },
    })
    .toBuffer();
}

/**
 * Build deterministic SVG for Climate Card panel
 */
async function buildClimateCardBuffer(sharp, width, height, locationData) {
  const climate = locationData?.climate || {};
  const sunPath = locationData?.sunPath || {};
  const address = locationData?.address || "Location TBD";
  const climateType = climate.type || climate.zone || "Temperate";
  const seasonal = climate.seasonal || {};
  const orientation = sunPath.optimalOrientation || "South-facing";

  const leftMargin = 12;
  const lineH = 20;
  let y = 46;

  const rows = [
    { label: "LOCATION", value: address },
    { label: "CLIMATE TYPE", value: climateType },
    { label: "OPTIMAL ORIENTATION", value: orientation },
  ];

  if (seasonal.summer) {
    rows.push({
      label: "SUMMER",
      value:
        typeof seasonal.summer === "string"
          ? seasonal.summer
          : `${seasonal.summer.tempHigh || seasonal.summer.avgTemp || "—"}°C`,
    });
  }
  if (seasonal.winter) {
    rows.push({
      label: "WINTER",
      value:
        typeof seasonal.winter === "string"
          ? seasonal.winter
          : `${seasonal.winter.tempLow || seasonal.winter.avgTemp || "—"}°C`,
    });
  }
  if (sunPath.summer) {
    rows.push({ label: "SUMMER SUN PATH", value: sunPath.summer });
  }
  if (sunPath.winter) {
    rows.push({ label: "WINTER SUN PATH", value: sunPath.winter });
  }

  let dataRows = "";
  rows.forEach((row) => {
    dataRows += `
      <text x="${leftMargin}" y="${y}" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="#64748b">${escapeXml(row.label)}</text>
      <text x="${leftMargin}" y="${y + 13}" font-family="Arial, sans-serif" font-size="10" fill="#1f2937">${escapeXml(String(row.value).substring(0, 60))}</text>
      <line x1="8" y1="${y + 18}" x2="${width - 8}" y2="${y + 18}" stroke="#f1f5f9" stroke-width="1" />`;
    y += lineH + 16;
  });

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" stroke="${FRAME_STROKE_COLOR}" stroke-width="2" rx="${FRAME_RADIUS}" ry="${FRAME_RADIUS}" />
      <rect x="8" y="8" width="${width - 16}" height="24" fill="#f1f5f9" rx="2" />
      <text x="${width / 2}" y="24" font-family="Arial, Helvetica, sans-serif" font-size="11" font-weight="700" fill="#0f172a" text-anchor="middle">CLIMATE &#38; ENVIRONMENT</text>
      ${dataRows}
    </svg>
  `;

  const embeddedSvg = await embedFontsForSharp(svg);
  return sharp(Buffer.from(embeddedSvg))
    .png()
    .resize(width, height, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255 },
    })
    .toBuffer();
}

export default {
  composeA1Sheet,
  upscaleToA1,
  validatePanelLayout,
  GRID_SPEC,
  A1_WIDTH,
  A1_HEIGHT,
  WORKING_WIDTH,
  WORKING_HEIGHT,
};

/**
 * Data Panel Renderer
 *
 * Generates deterministic SVG strings for data-only panels:
 * - Room schedule (schedules_notes)
 * - Material palette (material_palette)
 * - Climate card (climate_card)
 *
 * These panels contain text and tables — FLUX produces semi-legible text,
 * so they are rendered as SVGs and rasterized by Sharp at composition time.
 *
 * @module services/dataPanelRenderer
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeXml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const FRAME_COLOR = "#cbd5e1";
const HEADER_BG = "#f1f5f9";
const TEXT_PRIMARY = "#0f172a";
const TEXT_SECONDARY = "#1f2937";
const TEXT_MUTED = "#64748b";
const DIVIDER_COLOR = "#e2e8f0";
const FONT = "EmbeddedSans, Arial, Helvetica, sans-serif";

function svgHeader(width, height) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
}

function panelFrame(width, height) {
  return `<rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" stroke="${FRAME_COLOR}" stroke-width="2" rx="4" ry="4" />`;
}

function sectionHeader(text, width, y) {
  return `<rect x="8" y="${y}" width="${width - 16}" height="24" fill="${HEADER_BG}" rx="2" />
  <text x="${width / 2}" y="${y + 16}" font-family="${FONT}" font-size="11" font-weight="700" fill="${TEXT_PRIMARY}" text-anchor="middle">${escapeXml(text)}</text>`;
}

function divider(width, y) {
  return `<line x1="8" y1="${y}" x2="${width - 8}" y2="${y}" stroke="${DIVIDER_COLOR}" stroke-width="1" />`;
}

// ---------------------------------------------------------------------------
// Room Schedule (schedules_notes)
// ---------------------------------------------------------------------------

/**
 * Render Room Schedule + Materials Schedule SVG.
 *
 * @param {number} width  - Panel width in pixels
 * @param {number} height - Panel height in pixels
 * @param {Object} masterDNA - Design DNA with rooms and materials
 * @param {Object} [projectContext] - Project context with programSpaces
 * @returns {string} SVG string
 */
export function renderSchedulesSVG(width, height, masterDNA, projectContext) {
  const rooms =
    masterDNA?.rooms ||
    masterDNA?.program?.rooms ||
    projectContext?.programSpaces ||
    [];
  const materials = masterDNA?.materials || [];
  const margin = 12;
  const rowH = 18;

  // Column positions
  const colNo = margin;
  const colName = margin + 22;
  const colArea = Math.round(width * 0.5);
  const colFloor = Math.round(width * 0.7);
  const colFinish = Math.round(width * 0.82);

  let y = 8; // start
  let svg = svgHeader(width, height);
  svg += panelFrame(width, height);

  // Room Schedule header
  svg += sectionHeader("ROOM SCHEDULE", width, y);
  y += 32;

  // Column headers
  svg += `<text x="${colNo}" y="${y}" font-family="${FONT}" font-size="8" font-weight="700" fill="${TEXT_MUTED}">NO.</text>`;
  svg += `<text x="${colName}" y="${y}" font-family="${FONT}" font-size="8" font-weight="700" fill="${TEXT_MUTED}">ROOM</text>`;
  svg += `<text x="${colArea}" y="${y}" font-family="${FONT}" font-size="8" font-weight="700" fill="${TEXT_MUTED}">AREA</text>`;
  svg += `<text x="${colFloor}" y="${y}" font-family="${FONT}" font-size="8" font-weight="700" fill="${TEXT_MUTED}">FLOOR</text>`;
  svg += `<text x="${colFinish}" y="${y}" font-family="${FONT}" font-size="8" font-weight="700" fill="${TEXT_MUTED}">FINISH</text>`;
  y += 6;
  svg += divider(width, y);
  y += 6;

  // Room rows
  const displayRooms = (Array.isArray(rooms) ? rooms : []).slice(0, 14);
  displayRooms.forEach((room, idx) => {
    const name =
      typeof room === "string"
        ? room
        : room.name || room.type || `Room ${idx + 1}`;
    const area = room.dimensions || room.area || room.area_m2 || "";
    const areaStr =
      typeof area === "number" ? `${area.toFixed(1)} m\u00B2` : String(area);
    const floor =
      room.floor != null
        ? room.floor === 0 || room.floor === "ground"
          ? "GF"
          : room.floor === 1 || room.floor === "first"
            ? "FF"
            : room.floor === 2 || room.floor === "second"
              ? "SF"
              : `L${room.floor}`
        : "";
    const finish = room.finish || room.flooring || "";

    svg += `<text x="${colNo}" y="${y}" font-family="${FONT}" font-size="9" fill="${TEXT_SECONDARY}">${idx + 1}.</text>`;
    svg += `<text x="${colName}" y="${y}" font-family="${FONT}" font-size="9" fill="${TEXT_SECONDARY}">${escapeXml(name)}</text>`;
    svg += `<text x="${colArea}" y="${y}" font-family="${FONT}" font-size="9" fill="${TEXT_MUTED}">${escapeXml(areaStr)}</text>`;
    svg += `<text x="${colFloor}" y="${y}" font-family="${FONT}" font-size="9" fill="${TEXT_MUTED}">${escapeXml(floor)}</text>`;
    svg += `<text x="${colFinish}" y="${y}" font-family="${FONT}" font-size="9" fill="${TEXT_MUTED}">${escapeXml(finish)}</text>`;
    y += rowH;
  });

  y += 8;
  svg += divider(width, y);
  y += 8;

  // Materials Schedule header
  svg += sectionHeader("MATERIALS SCHEDULE", width, y);
  y += 32;

  const displayMats = (Array.isArray(materials) ? materials : []).slice(0, 6);
  displayMats.forEach((mat, idx) => {
    const name =
      typeof mat === "string"
        ? mat
        : mat.name || mat.type || `Material ${idx + 1}`;
    const application = mat.application || "";

    svg += `<text x="${margin}" y="${y}" font-family="${FONT}" font-size="9" fill="${TEXT_SECONDARY}">${idx + 1}. ${escapeXml(name)}</text>`;
    svg += `<text x="${colArea}" y="${y}" font-family="${FONT}" font-size="9" fill="${TEXT_MUTED}">${escapeXml(application)}</text>`;
    y += rowH;
  });

  svg += "</svg>";
  return svg;
}

// ---------------------------------------------------------------------------
// Material Palette (material_palette)
// ---------------------------------------------------------------------------

/**
 * Render Material Palette SVG with colored swatches.
 *
 * @param {number} width  - Panel width in pixels
 * @param {number} height - Panel height in pixels
 * @param {Object} masterDNA - Design DNA with materials array
 * @returns {string} SVG string
 */
export function renderMaterialPaletteSVG(width, height, masterDNA) {
  const materials = masterDNA?.materials || [];
  const displayMats = (Array.isArray(materials) ? materials : []).slice(0, 8);

  const cols = 2;
  const margin = 12;
  const headerH = 36;
  const swatchW = Math.floor((width - margin * 3) / cols);
  const swatchH = 44;
  const gap = 8;

  let svg = svgHeader(width, height);
  svg += panelFrame(width, height);
  svg += sectionHeader("MATERIAL PALETTE", width, 8);

  displayMats.forEach((mat, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = margin + col * (swatchW + margin);
    const y = headerH + 12 + row * (swatchH + gap + 24);

    const name =
      typeof mat === "string"
        ? mat
        : mat.name || mat.type || `Material ${idx + 1}`;
    const hexColor = mat.hexColor || "#cccccc";
    const application = mat.application || "";

    // Color swatch
    svg += `<rect x="${x}" y="${y}" width="${swatchW}" height="${swatchH}" fill="${escapeXml(hexColor)}" stroke="#e2e8f0" stroke-width="1" rx="3" />`;
    // Material name
    svg += `<text x="${x}" y="${y + swatchH + 14}" font-family="${FONT}" font-size="9" font-weight="600" fill="${TEXT_SECONDARY}">${escapeXml(name)}</text>`;
    // Application + hex
    svg += `<text x="${x}" y="${y + swatchH + 26}" font-family="${FONT}" font-size="8" fill="${TEXT_MUTED}">${escapeXml(hexColor)} \u2014 ${escapeXml(application)}</text>`;
  });

  svg += "</svg>";
  return svg;
}

// ---------------------------------------------------------------------------
// Climate Card (climate_card)
// ---------------------------------------------------------------------------

/**
 * Render Climate & Environment SVG.
 *
 * @param {number} width  - Panel width in pixels
 * @param {number} height - Panel height in pixels
 * @param {Object} locationData - Location data with climate and sunPath
 * @param {Object} [masterDNA] - Optional DNA for design response notes
 * @returns {string} SVG string
 */
export function renderClimateCardSVG(width, height, locationData, masterDNA) {
  const climate = locationData?.climate || {};
  const sunPath = locationData?.sunPath || {};
  const address = locationData?.address || "Location TBD";
  const climateType = climate.type || climate.zone || "Temperate";
  const seasonal = climate.seasonal || {};
  const orientation = sunPath.optimalOrientation || "South-facing";

  const margin = 12;
  const lineH = 32;
  let y = 8;

  let svg = svgHeader(width, height);
  svg += panelFrame(width, height);
  svg += sectionHeader("CLIMATE &amp; ENVIRONMENT", width, y);
  y += 38;

  // Build data rows
  const rows = [
    { label: "LOCATION", value: address },
    { label: "CLIMATE TYPE", value: climateType },
    { label: "OPTIMAL ORIENTATION", value: orientation },
  ];

  if (seasonal.summer) {
    const val =
      typeof seasonal.summer === "string"
        ? seasonal.summer
        : `${seasonal.summer.tempHigh || seasonal.summer.avgTemp || "\u2014"}\u00B0C high`;
    rows.push({ label: "SUMMER", value: val });
  }
  if (seasonal.winter) {
    const val =
      typeof seasonal.winter === "string"
        ? seasonal.winter
        : `${seasonal.winter.tempLow || seasonal.winter.avgTemp || "\u2014"}\u00B0C low`;
    rows.push({ label: "WINTER", value: val });
  }
  if (sunPath.summer) {
    rows.push({ label: "SUMMER SUN PATH", value: sunPath.summer });
  }
  if (sunPath.winter) {
    rows.push({ label: "WINTER SUN PATH", value: sunPath.winter });
  }

  // Design response from DNA
  const designResponse =
    masterDNA?.climateResponse || masterDNA?.sustainabilityStrategy || null;
  if (designResponse) {
    rows.push({ label: "DESIGN RESPONSE", value: designResponse });
  }

  rows.forEach((row) => {
    const displayValue = String(row.value || "").substring(0, 60);
    svg += `<text x="${margin}" y="${y}" font-family="${FONT}" font-size="8" font-weight="700" fill="${TEXT_MUTED}">${escapeXml(row.label)}</text>`;
    svg += `<text x="${margin}" y="${y + 14}" font-family="${FONT}" font-size="10" fill="${TEXT_SECONDARY}">${escapeXml(displayValue)}</text>`;
    svg += divider(width, y + 20);
    y += lineH;
  });

  svg += "</svg>";
  return svg;
}

export default {
  renderSchedulesSVG,
  renderMaterialPaletteSVG,
  renderClimateCardSVG,
};

import {
  FINAL_SHEET_MIN_FONT_SIZE_PX,
  EMBEDDED_FONT_STACK,
  prepareFinalSheetSvgForRasterization,
} from "../../utils/svgFontEmbedder.js";

const FONT_FAMILY = EMBEDDED_FONT_STACK;

export function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toAsciiLabel(value) {
  return String(value ?? "")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00D7/g, "x")
    .replace(/\u00B2/g, "2")
    .replace(/\u00B0C/g, " C")
    .replace(/\u00A0/g, " ");
}

function clampText(value, maxChars = 28) {
  const normalized = toAsciiLabel(value).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

/**
 * Normalize materials from DNA into a consistent array.
 * Handles: array at .materials, .style.materials, ._structured.style.materials,
 * and object-shaped materials ({exterior: {...}, roof: {...}}).
 */
export function normalizeMaterialsForCompose(dna) {
  if (!dna) return [];
  const candidates = [
    dna.materials,
    dna.style?.materials,
    dna._structured?.style?.materials,
  ];
  for (const mats of candidates) {
    if (Array.isArray(mats) && mats.length > 0) {
      return mats.map((m) => ({
        name: typeof m === "string" ? m : m.name || m.type || "material",
        hexColor: m.hexColor || m.color_hex || "#808080",
        application: m.application || m.use || "",
      }));
    }
  }
  if (
    dna.materials &&
    typeof dna.materials === "object" &&
    !Array.isArray(dna.materials)
  ) {
    return Object.entries(dna.materials)
      .filter(([, v]) => v && typeof v === "object")
      .map(([key, v]) => ({
        name: v.name || v.material || key,
        hexColor: v.hexColor || v.color_hex || "#808080",
        application: v.application || key,
      }));
  }
  return [];
}

/**
 * Deterministic SVG for Schedules & Notes panel.
 */
export async function buildSchedulesBuffer(
  sharp,
  width,
  height,
  masterDNA,
  projectContext,
  constants,
) {
  const { FRAME_STROKE_COLOR, FRAME_RADIUS } = constants || {};
  const compactMode = width < 340 || height < 360;

  const rooms =
    masterDNA?.rooms ||
    masterDNA?.program?.rooms ||
    projectContext?.programSpaces ||
    [];
  const materials = normalizeMaterialsForCompose(masterDNA);
  const leftMargin = 12;
  const colArea = Math.round(width * (compactMode ? 0.58 : 0.55));
  const colFloor = Math.round(width * (compactMode ? 0.83 : 0.8));
  const rowHeight = compactMode ? 20 : 18;
  const headerY = 40;
  const roomFontSize = compactMode ? 10 : 9;
  const sectionTitleSize = compactMode ? 12 : 11;

  let roomRows = "";
  const displayRooms = (Array.isArray(rooms) ? rooms : []).slice(
    0,
    compactMode ? 8 : 12,
  );
  displayRooms.forEach((room, idx) => {
    const y = headerY + 20 + idx * rowHeight;
    const name =
      typeof room === "string"
        ? room
        : room.name || room.type || `Room ${idx + 1}`;
    const areaRaw = room.dimensions || room.area || room.area_m2 || "";
    const area =
      typeof areaRaw === "number" ? `${areaRaw.toFixed(1)} sq m` : areaRaw;
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
    roomRows += `
      <text x="${leftMargin}" y="${y}" font-family="${FONT_FAMILY}" font-size="${roomFontSize}" fill="#1f2937">${idx + 1}.</text>
      <text x="${leftMargin + 20}" y="${y}" font-family="${FONT_FAMILY}" font-size="${roomFontSize}" fill="#1f2937">${escapeXml(clampText(name, compactMode ? 18 : 24))}</text>
      <text x="${colArea}" y="${y}" font-family="${FONT_FAMILY}" font-size="${roomFontSize}" fill="#475569">${escapeXml(clampText(String(area), compactMode ? 10 : 14))}</text>
      <text x="${colFloor}" y="${y}" font-family="${FONT_FAMILY}" font-size="${roomFontSize}" fill="#475569">${escapeXml(clampText(floor, 4))}</text>`;
  });

  const roomsEndY = headerY + 20 + displayRooms.length * rowHeight + 10;

  let matRows = "";
  const displayMats = (Array.isArray(materials) ? materials : []).slice(
    0,
    compactMode ? 4 : 6,
  );
  displayMats.forEach((mat, idx) => {
    const y = roomsEndY + 36 + idx * rowHeight;
    const name =
      typeof mat === "string"
        ? mat
        : mat.name || mat.type || `Material ${idx + 1}`;
    const application = mat.application || "";
    matRows += `
      <text x="${leftMargin}" y="${y}" font-family="${FONT_FAMILY}" font-size="${roomFontSize}" fill="#1f2937">${idx + 1}. ${escapeXml(clampText(name, compactMode ? 18 : 24))}</text>
      <text x="${colArea}" y="${y}" font-family="${FONT_FAMILY}" font-size="${roomFontSize}" fill="#475569">${escapeXml(clampText(application, compactMode ? 14 : 18))}</text>`;
  });

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" stroke="${FRAME_STROKE_COLOR || "#cbd5e1"}" stroke-width="2" rx="${FRAME_RADIUS || 4}" ry="${FRAME_RADIUS || 4}" />

      <rect x="8" y="8" width="${width - 16}" height="24" fill="#f1f5f9" rx="2" />
      <text x="${width / 2}" y="24" font-family="${FONT_FAMILY}" font-size="${sectionTitleSize}" font-weight="700" fill="#0f172a" text-anchor="middle" class="sheet-critical-label" data-text-role="critical">ROOM SCHEDULE</text>

      <text x="${leftMargin}" y="${headerY}" font-family="${FONT_FAMILY}" font-size="8" font-weight="700" fill="#64748b">NO.</text>
      <text x="${leftMargin + 20}" y="${headerY}" font-family="${FONT_FAMILY}" font-size="8" font-weight="700" fill="#64748b">ROOM</text>
      <text x="${colArea}" y="${headerY}" font-family="${FONT_FAMILY}" font-size="8" font-weight="700" fill="#64748b">AREA</text>
      <text x="${colFloor}" y="${headerY}" font-family="${FONT_FAMILY}" font-size="8" font-weight="700" fill="#64748b">FLOOR</text>
      <line x1="8" y1="${headerY + 4}" x2="${width - 8}" y2="${headerY + 4}" stroke="#e2e8f0" stroke-width="1" />

      ${
        roomRows ||
        `<text x="${width / 2}" y="${headerY + 20}" font-family="${FONT_FAMILY}" font-size="${roomFontSize}" fill="#9ca3af" text-anchor="middle">No room data available</text>`
      }

      <line x1="8" y1="${roomsEndY}" x2="${width - 8}" y2="${roomsEndY}" stroke="#e2e8f0" stroke-width="1" />
      <rect x="8" y="${roomsEndY + 4}" width="${width - 16}" height="24" fill="#f1f5f9" rx="2" />
      <text x="${width / 2}" y="${roomsEndY + 20}" font-family="${FONT_FAMILY}" font-size="${sectionTitleSize}" font-weight="700" fill="#0f172a" text-anchor="middle" class="sheet-critical-label" data-text-role="critical">MATERIALS SCHEDULE</text>

      ${
        matRows ||
        `<text x="${width / 2}" y="${roomsEndY + 40}" font-family="${FONT_FAMILY}" font-size="${roomFontSize}" fill="#9ca3af" text-anchor="middle">No material data available</text>`
      }
    </svg>
  `;

  const fontedSvg = await prepareFinalSheetSvgForRasterization(svg, {
    minimumFontSizePx: FINAL_SHEET_MIN_FONT_SIZE_PX,
  });
  return sharp(Buffer.from(fontedSvg))
    .png()
    .resize(width, height, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255 },
    })
    .toBuffer();
}

/**
 * Deterministic SVG for Material Palette panel.
 */
export async function buildMaterialPaletteBuffer(
  sharp,
  width,
  height,
  masterDNA,
  constants,
) {
  const { FRAME_STROKE_COLOR, FRAME_RADIUS } = constants || {};
  const materials = normalizeMaterialsForCompose(masterDNA);
  const compactMode = width < 260 || height < 260;
  const displayMats = materials.slice(0, compactMode ? 4 : 8);

  const cols = 2;
  const margin = 12;
  const headerH = 36;
  const swatchW = Math.floor((width - margin * 3) / cols);
  const swatchH = compactMode ? 34 : 40;
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
    const secondaryLabel = compactMode
      ? clampText(application || hexColor, 18)
      : `${hexColor} - ${clampText(application, 18)}`;

    swatches += `
      <rect x="${x}" y="${y}" width="${swatchW}" height="${swatchH}" fill="${escapeXml(hexColor)}" stroke="#e2e8f0" stroke-width="1" rx="3" />
      <text x="${x}" y="${y + swatchH + 12}" font-family="${FONT_FAMILY}" font-size="${compactMode ? 10 : 9}" font-weight="600" fill="#1f2937">${escapeXml(clampText(name, compactMode ? 14 : 20))}</text>
      <text x="${x}" y="${y + swatchH + 24}" font-family="${FONT_FAMILY}" font-size="8" fill="#64748b">${escapeXml(secondaryLabel)}</text>`;
  });

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" stroke="${FRAME_STROKE_COLOR || "#cbd5e1"}" stroke-width="2" rx="${FRAME_RADIUS || 4}" ry="${FRAME_RADIUS || 4}" />

      <rect x="8" y="8" width="${width - 16}" height="24" fill="#f1f5f9" rx="2" />
      <text x="${width / 2}" y="24" font-family="${FONT_FAMILY}" font-size="${compactMode ? 12 : 11}" font-weight="700" fill="#0f172a" text-anchor="middle" class="sheet-critical-label" data-text-role="critical">MATERIAL PALETTE</text>

      ${
        swatches ||
        `<text x="${width / 2}" y="${height / 2}" font-family="${FONT_FAMILY}" font-size="10" fill="#9ca3af" text-anchor="middle">No material palette data available</text>`
      }
    </svg>
  `;

  const fontedSvg = await prepareFinalSheetSvgForRasterization(svg, {
    minimumFontSizePx: FINAL_SHEET_MIN_FONT_SIZE_PX,
  });
  return sharp(Buffer.from(fontedSvg))
    .png()
    .resize(width, height, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255 },
    })
    .toBuffer();
}

/**
 * Deterministic SVG for Climate Card panel.
 */
export async function buildClimateCardBuffer(
  sharp,
  width,
  height,
  locationData,
  constants,
) {
  const { FRAME_STROKE_COLOR, FRAME_RADIUS } = constants || {};
  const compactMode = width < 260 || height < 260;

  const climate = locationData?.climate || {};
  const sunPath = locationData?.sunPath || {};
  const address = locationData?.address || "Location TBD";
  const climateType = climate.type || climate.zone || "Temperate";
  const seasonal = climate.seasonal || {};
  const orientation = sunPath.optimalOrientation || "South-facing";

  const leftMargin = 12;
  const lineH = compactMode ? 18 : 20;
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
          : `${seasonal.summer.tempHigh || seasonal.summer.avgTemp || "-"} C`,
    });
  }
  if (seasonal.winter) {
    rows.push({
      label: "WINTER",
      value:
        typeof seasonal.winter === "string"
          ? seasonal.winter
          : `${seasonal.winter.tempLow || seasonal.winter.avgTemp || "-"} C`,
    });
  }
  if (sunPath.summer) {
    rows.push({ label: "SUMMER SUN PATH", value: sunPath.summer });
  }
  if (sunPath.winter) {
    rows.push({ label: "WINTER SUN PATH", value: sunPath.winter });
  }

  let dataRows = "";
  rows.slice(0, compactMode ? 4 : 6).forEach((row) => {
    dataRows += `
      <text x="${leftMargin}" y="${y}" font-family="${FONT_FAMILY}" font-size="8" font-weight="700" fill="#64748b">${escapeXml(clampText(row.label, compactMode ? 18 : 26))}</text>
      <text x="${leftMargin}" y="${y + 13}" font-family="${FONT_FAMILY}" font-size="${compactMode ? 9 : 10}" fill="#1f2937">${escapeXml(clampText(String(row.value), compactMode ? 28 : 48))}</text>
      <line x1="8" y1="${y + 18}" x2="${width - 8}" y2="${y + 18}" stroke="#f1f5f9" stroke-width="1" />`;
    y += lineH + 16;
  });

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" stroke="${FRAME_STROKE_COLOR || "#cbd5e1"}" stroke-width="2" rx="${FRAME_RADIUS || 4}" ry="${FRAME_RADIUS || 4}" />

      <rect x="8" y="8" width="${width - 16}" height="24" fill="#f1f5f9" rx="2" />
      <text x="${width / 2}" y="24" font-family="${FONT_FAMILY}" font-size="${compactMode ? 12 : 11}" font-weight="700" fill="#0f172a" text-anchor="middle" class="sheet-critical-label" data-text-role="critical">CLIMATE &amp; ENVIRONMENT</text>

      ${
        dataRows ||
        `<text x="${width / 2}" y="${height / 2}" font-family="${FONT_FAMILY}" font-size="10" fill="#9ca3af" text-anchor="middle">No climate data available</text>`
      }
    </svg>
  `;

  const fontedSvg = await prepareFinalSheetSvgForRasterization(svg, {
    minimumFontSizePx: FINAL_SHEET_MIN_FONT_SIZE_PX,
  });
  return sharp(Buffer.from(fontedSvg))
    .png()
    .resize(width, height, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255 },
    })
    .toBuffer();
}

import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";
import { getCanonicalMaterialPalette } from "../design/canonicalMaterialPalette.js";

const SEC_FONT = "EmbeddedSans, 'Segoe UI', Arial, sans-serif";
const SLAB_DEPTH_M = 0.25; // 250mm concrete slab
const FOUNDATION_DEPTH_M = 0.8;
const TREAD_GOING_M = 0.24;
const TREAD_RISER_M = 0.2;

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function projectRoomForSection(room, sectionType) {
  const longitudinal =
    String(sectionType || "longitudinal").toLowerCase() !== "transverse";
  return longitudinal
    ? { start: room.bbox.min_x, end: room.bbox.max_x }
    : { start: room.bbox.min_y, end: room.bbox.max_y };
}

function buildPatternDefs() {
  return `
    <pattern id="sec-slab" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
      <rect width="8" height="8" fill="#d9d6d0"/>
      <path d="M0 8 L8 0" stroke="#777" stroke-width="0.5"/>
    </pattern>
    <pattern id="sec-insulation" x="0" y="0" width="14" height="8" patternUnits="userSpaceOnUse">
      <rect width="14" height="8" fill="#fff2c4"/>
      <path d="M0 4 Q3.5 0 7 4 T14 4" stroke="#b88300" stroke-width="0.6" fill="none"/>
    </pattern>
    <pattern id="sec-rafter" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
      <rect width="10" height="10" fill="#f2ede1"/>
      <line x1="0" y1="10" x2="10" y2="0" stroke="#8a6a3a" stroke-width="0.6"/>
    </pattern>
    <pattern id="sec-foundation" x="0" y="0" width="12" height="12" patternUnits="userSpaceOnUse">
      <rect width="12" height="12" fill="#c4bdb0"/>
      <path d="M0 0 L12 12 M0 12 L12 0" stroke="#555" stroke-width="0.6"/>
    </pattern>
    <pattern id="sec-ground-hatch" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
      <path d="M0 10 L10 0" stroke="#111" stroke-width="0.6"/>
    </pattern>`;
}

function renderStairCuts(geometry = {}, sectionType, baseX, baseY, scale) {
  return (geometry.stairs || [])
    .map((stair) => {
      const projection = projectRoomForSection(stair, sectionType);
      const totalRun = (projection.end - projection.start) * scale;
      const x0 = baseX + projection.start * scale;
      const flightHeight = Number(stair.flight_height_m || stair.rise_m || 3.0);
      const treadCount = Math.max(6, Math.floor(flightHeight / TREAD_RISER_M));
      const treadWidth = totalRun / treadCount;
      const riserPx = (flightHeight / treadCount) * scale;
      const steps = [];
      for (let i = 0; i < treadCount; i++) {
        const px = x0 + i * treadWidth;
        const py = baseY - (i + 1) * riserPx;
        steps.push(
          `<path d="M ${px} ${baseY - i * riserPx} L ${px} ${py} L ${px + treadWidth} ${py}" stroke="#111" stroke-width="0.9" fill="none"/>`,
        );
      }
      // Stringer line
      const stringer = `<line x1="${x0}" y1="${baseY}" x2="${x0 + totalRun}" y2="${baseY - flightHeight * scale}" stroke="#333" stroke-width="1.4"/>`;
      // Label
      const label = `<text x="${x0 + totalRun / 2}" y="${baseY + 14}" font-size="10" font-family="${SEC_FONT}" text-anchor="middle" fill="#555">STAIR UP · ${treadCount}R @ ${(TREAD_RISER_M * 1000).toFixed(0)}mm</text>`;
      return `<g class="stair-cut">${steps.join("")}${stringer}${label}</g>`;
    })
    .join("");
}

function renderGridMarkers(geometry = {}, baseX, baseY, scale) {
  const grid = geometry.metadata?.structural_grid;
  if (!grid) return "";
  return (grid.x_axes || [])
    .map((axis) => {
      const x = baseX + Number(axis.position_m || 0) * scale;
      return `
        <line x1="${x}" y1="${baseY}" x2="${x}" y2="${baseY - 260}" stroke="#d7c8aa" stroke-width="1" stroke-dasharray="5 3"/>
        <circle cx="${x}" cy="${baseY - 270}" r="10" fill="#fff" stroke="#111" stroke-width="1.1"/>
        <text x="${x}" y="${baseY - 266}" font-size="10" font-family="${SEC_FONT}" text-anchor="middle" font-weight="700">${escapeXml(axis.label)}</text>
      `;
    })
    .join("");
}

function renderFoundation(baseX, baseY, horizontalExtent, scale) {
  const depth = FOUNDATION_DEPTH_M * scale;
  return `
    <g class="foundation">
      <rect x="${baseX - 20}" y="${baseY}" width="${horizontalExtent * scale + 40}" height="${depth}" fill="url(#sec-foundation)" stroke="#111" stroke-width="1.6"/>
      <line x1="${baseX - 20}" y1="${baseY + depth}" x2="${baseX + horizontalExtent * scale + 20}" y2="${baseY + depth}" stroke="#111" stroke-width="1.4"/>
      <text x="${baseX + horizontalExtent * scale + 26}" y="${baseY + depth / 2 + 3}" font-size="10" font-family="${SEC_FONT}" fill="#333">Strip footing ${Math.round(FOUNDATION_DEPTH_M * 1000)}mm</text>
    </g>`;
}

function renderSlabs(geometry, baseX, baseY, horizontalExtent, scale) {
  const slabThickPx = SLAB_DEPTH_M * scale;
  let stacked = 0;
  const slabs = [];
  // Ground slab
  slabs.push(
    `<rect x="${baseX}" y="${baseY - slabThickPx}" width="${horizontalExtent * scale}" height="${slabThickPx}" fill="url(#sec-slab)" stroke="#111" stroke-width="1.4"/>`,
  );
  for (const level of geometry.levels || []) {
    stacked += Number(level.height_m || 3.2);
    if (level.level_number === 0) continue;
    const y = baseY - stacked * scale;
    slabs.push(
      `<rect x="${baseX}" y="${y - slabThickPx / 2}" width="${horizontalExtent * scale}" height="${slabThickPx}" fill="url(#sec-slab)" stroke="#111" stroke-width="1.2"/>`,
    );
  }
  return slabs.join("");
}

function renderRoofConstruction(
  baseX,
  topOfFacadeY,
  horizontalExtent,
  scale,
  styleDNA,
) {
  const roofLanguage = String(styleDNA?.roof_language || "").toLowerCase();
  const x1 = baseX;
  const x2 = baseX + horizontalExtent * scale;
  const mid = baseX + (horizontalExtent * scale) / 2;
  if (roofLanguage.includes("flat")) {
    const parapet = 14;
    const insulationThickness = 24;
    return `
      <rect x="${x1}" y="${topOfFacadeY - parapet}" width="${x2 - x1}" height="${parapet}" fill="url(#sec-rafter)" stroke="#111" stroke-width="1.2"/>
      <rect x="${x1 + 4}" y="${topOfFacadeY - parapet - insulationThickness}" width="${x2 - x1 - 8}" height="${insulationThickness}" fill="url(#sec-insulation)" stroke="#a88500" stroke-width="0.8"/>`;
  }
  const ridge = topOfFacadeY - Math.max(horizontalExtent * scale * 0.12, 40);
  return `
    <g class="roof-construction">
      <path d="M ${x1} ${topOfFacadeY} L ${mid} ${ridge} L ${x2} ${topOfFacadeY} Z" fill="url(#sec-rafter)" stroke="#111" stroke-width="1.6"/>
      <path d="M ${x1 + 6} ${topOfFacadeY - 3} L ${mid} ${ridge + 6} L ${x2 - 6} ${topOfFacadeY - 3}" stroke="#a88500" stroke-width="0.8" fill="none" stroke-dasharray="3 2"/>
      <text x="${mid + 6}" y="${(ridge + topOfFacadeY) / 2}" font-size="10" font-family="${SEC_FONT}" fill="#5a3b00">Rafter 50×200 @ 400 c/c + insulation</text>
    </g>`;
}

function renderLevelLabels(geometry, baseX, baseY, scale, horizontalExtent) {
  let stacked = 0;
  const parts = [
    `<g><line x1="${baseX - 40}" y1="${baseY}" x2="${baseX}" y2="${baseY}" stroke="#111" stroke-width="1"/>
      <circle cx="${baseX - 40}" cy="${baseY}" r="3" fill="#111"/>
      <text x="${baseX - 46}" y="${baseY + 4}" font-size="10" font-family="${SEC_FONT}" font-weight="700" text-anchor="end">GF ±0.000 SSL</text>
    </g>`,
  ];
  const rightX = baseX + horizontalExtent * scale;
  for (const level of geometry.levels || []) {
    stacked += Number(level.height_m || 3.2);
    const y = baseY - stacked * scale;
    const label = `${level.name || `L${level.level_number}`} +${stacked.toFixed(3)} SSL`;
    parts.push(
      `<g>
        <line x1="${baseX - 40}" y1="${y}" x2="${rightX + 40}" y2="${y}" stroke="#555" stroke-width="0.6" stroke-dasharray="6 3"/>
        <circle cx="${baseX - 40}" cy="${y}" r="3" fill="none" stroke="#111" stroke-width="0.9"/>
        <text x="${baseX - 46}" y="${y + 4}" font-size="10" font-family="${SEC_FONT}" font-weight="700" text-anchor="end">${escapeXml(label)}</text>
        <text x="${rightX + 46}" y="${y + 4}" font-size="10" font-family="${SEC_FONT}" fill="#555">CH ${Number(level.height_m || 3.2).toFixed(2)}m</text>
      </g>`,
    );
  }
  return parts.join("");
}

function renderOpeningCuts(geometry, sectionType, baseX, baseY, scale) {
  const longitudinal =
    String(sectionType || "longitudinal").toLowerCase() !== "transverse";
  const openings = [];
  // Windows: small gap indicators at levels
  (geometry.windows || []).forEach((win) => {
    const wall = (geometry.walls || []).find((w) => w.id === win.wall_id);
    const room = (geometry.rooms || []).find(
      (r) => r.id === wall?.room_ids?.[0],
    );
    if (!room) return;
    const level = (geometry.levels || []).find((l) => l.id === room.level_id);
    if (!level) return;
    const levelBase = (geometry.levels || [])
      .filter((l) => l.level_number < level.level_number)
      .reduce((sum, l) => sum + Number(l.height_m || 3.2), 0);
    const p = longitudinal
      ? { a: room.bbox.min_x, b: room.bbox.max_x }
      : { a: room.bbox.min_y, b: room.bbox.max_y };
    const cx = baseX + ((p.a + p.b) / 2) * scale;
    const sillY = baseY - (levelBase + win.sill_height_m) * scale;
    const headY = baseY - (levelBase + win.head_height_m) * scale;
    openings.push(
      `<line x1="${cx - 10}" y1="${sillY}" x2="${cx + 10}" y2="${sillY}" stroke="#245f9d" stroke-width="1.2"/>
       <line x1="${cx - 10}" y1="${headY}" x2="${cx + 10}" y2="${headY}" stroke="#245f9d" stroke-width="1.2"/>
       <line x1="${cx}" y1="${sillY}" x2="${cx}" y2="${headY}" stroke="#245f9d" stroke-width="0.8" stroke-dasharray="3 2"/>`,
    );
  });
  return openings.join("");
}

function renderRooms(geometry, sectionType, baseX, baseY, scale) {
  return (geometry.rooms || [])
    .map((room) => {
      const level = (geometry.levels || []).find((l) => l.id === room.level_id);
      if (!level) return "";
      const offsetHeight = (geometry.levels || [])
        .filter((l) => l.level_number < level.level_number)
        .reduce((sum, l) => sum + Number(l.height_m || 3.2), 0);
      const projection = projectRoomForSection(room, sectionType);
      const x = baseX + projection.start * scale;
      const y = baseY - (offsetHeight + Number(level.height_m || 3.2)) * scale;
      const rectWidth = Math.max(
        20,
        (projection.end - projection.start) * scale,
      );
      const rectHeight = Math.max(24, Number(level.height_m || 3.2) * scale);
      return `
        <g class="room-cut">
          <rect x="${x}" y="${y}" width="${rectWidth}" height="${rectHeight}" fill="none" stroke="#333" stroke-width="0.6" stroke-dasharray="3 3"/>
          <text x="${x + rectWidth / 2}" y="${y + rectHeight / 2 - 2}" font-size="10" font-weight="700" font-family="${SEC_FONT}" text-anchor="middle" fill="#333">${escapeXml(String(room.name || room.type || "ROOM").toUpperCase())}</text>
          <text x="${x + rectWidth / 2}" y="${y + rectHeight / 2 + 12}" font-size="9" font-family="${SEC_FONT}" text-anchor="middle" fill="#666">${Number(level.height_m || 3.2).toFixed(2)}m CH</text>
        </g>`;
    })
    .join("");
}

export function renderSectionSvg(
  geometryInput = {},
  styleDNA = {},
  options = {},
) {
  const geometry = coerceToCanonicalProjectGeometry(
    geometryInput?.projectGeometry || geometryInput?.geometry || geometryInput,
  );
  const sectionType = String(
    options.sectionType || "longitudinal",
  ).toLowerCase();
  const width = options.width || 1200;
  const height = options.height || 760;
  const padding = 110;
  const buildable = geometry.site?.buildable_bbox ||
    geometry.site?.boundary_bbox || {
      width: 12,
      height: 10,
    };
  const horizontalExtent =
    sectionType === "transverse"
      ? buildable.height || 10
      : buildable.width || 12;
  const totalHeight =
    (geometry.levels || []).reduce(
      (sum, level) => sum + Number(level.height_m || 3.2),
      0,
    ) || 3.2;
  const scale = Math.min(
    (width - padding * 2) / Math.max(horizontalExtent, 1),
    (height - padding * 2 - 80) /
      Math.max(totalHeight + FOUNDATION_DEPTH_M + 2, 1),
  );
  const baseX = (width - horizontalExtent * scale) / 2;
  const baseY = height - padding - FOUNDATION_DEPTH_M * scale;
  const topOfFacade = baseY - totalHeight * scale;
  const palette = getCanonicalMaterialPalette(styleDNA);

  const foundationMarkup = renderFoundation(
    baseX,
    baseY,
    horizontalExtent,
    scale,
  );
  const slabMarkup = renderSlabs(
    geometry,
    baseX,
    baseY,
    horizontalExtent,
    scale,
  );
  const roofMarkup = renderRoofConstruction(
    baseX,
    topOfFacade,
    horizontalExtent,
    scale,
    styleDNA,
  );
  const levelLabelMarkup = renderLevelLabels(
    geometry,
    baseX,
    baseY,
    scale,
    horizontalExtent,
  );
  const stairMarkup = renderStairCuts(
    geometry,
    sectionType,
    baseX,
    baseY,
    scale,
  );
  const roomMarkup = renderRooms(geometry, sectionType, baseX, baseY, scale);
  const openingMarkup = renderOpeningCuts(
    geometry,
    sectionType,
    baseX,
    baseY,
    scale,
  );
  const gridMarkup = renderGridMarkers(geometry, baseX, baseY, scale);

  // Ground line extends 40px beyond building
  const gx1 = baseX - 40;
  const gx2 = baseX + horizontalExtent * scale + 40;
  const groundLine = `
    <line x1="${gx1}" y1="${baseY}" x2="${gx2}" y2="${baseY}" stroke="#111" stroke-width="1.6"/>
    <rect x="${gx1}" y="${baseY}" width="${gx2 - gx1}" height="10" fill="url(#sec-ground-hatch)" opacity="0.5"/>`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>${buildPatternDefs()}</defs>
  <rect width="${width}" height="${height}" fill="#fdfdfb"/>
  <text x="${padding}" y="38" font-size="22" font-family="${SEC_FONT}" font-weight="700" fill="#111">${escapeXml(`SECTION — ${sectionType.toUpperCase()}`)}</text>
  <text x="${padding}" y="58" font-size="11" font-family="${SEC_FONT}" fill="#555">Cut through ${escapeXml(sectionType === "transverse" ? "short axis" : "long axis")} · construction call-out drawing</text>
  ${groundLine}
  ${foundationMarkup}
  ${roofMarkup}
  ${slabMarkup}
  ${gridMarkup}
  ${roomMarkup}
  ${openingMarkup}
  ${stairMarkup}
  ${levelLabelMarkup}
</svg>`;

  return {
    svg,
    section_type: sectionType,
    stair_count: (geometry.stairs || []).length,
    renderer: "deterministic-section-svg-v2",
    title: `Section - ${sectionType}`,
    palette_source: palette.source,
  };
}

export default {
  renderSectionSvg,
};

import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";

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

function renderStairCuts(geometry = {}, sectionType, baseX, baseY, scale) {
  return (geometry.stairs || [])
    .map((stair) => {
      const projection = projectRoomForSection(stair, sectionType);
      const x = baseX + projection.start * scale;
      const y =
        baseY - Number(stair.bbox?.height || stair.depth_m || 4) * scale;
      const width = Math.max(18, (projection.end - projection.start) * scale);
      return `
        <rect x="${x}" y="${y}" width="${width}" height="${Math.max(20, Number(stair.bbox?.height || stair.depth_m || 4) * scale)}" fill="#f2f2f2" stroke="#444" stroke-width="1.4"/>
        <line x1="${x + 4}" y1="${y + 6}" x2="${x + width - 4}" y2="${y + 6}" stroke="#444" stroke-width="1"/>
        <text x="${x + width / 2}" y="${y + 16}" font-size="10" font-family="Arial, sans-serif" text-anchor="middle">Stair Cut</text>
        <line x1="${x + width / 2}" y1="${y + 22}" x2="${x + width / 2}" y2="${y + Math.max(20, Number(stair.bbox?.height || stair.depth_m || 4) * scale) - 8}" stroke="#444" stroke-width="1.1"/>
        <path d="M ${x + width / 2} ${y + 20} L ${x + width / 2 - 4} ${y + 28} L ${x + width / 2 + 4} ${y + 28} Z" fill="#444"/>
      `;
    })
    .join("");
}

function renderGridMarkers(
  geometry = {},
  baseX,
  baseY,
  scale,
  horizontalExtent,
) {
  const grid = geometry.metadata?.structural_grid;
  if (!grid) {
    return "";
  }

  return (grid.x_axes || [])
    .map((axis) => {
      const x = baseX + Number(axis.position_m || 0) * scale;
      return `
        <line x1="${x}" y1="${baseY}" x2="${x}" y2="${baseY - 220}" stroke="#d7c8aa" stroke-width="1" stroke-dasharray="5 3"/>
        <text x="${x}" y="${baseY - 226}" font-size="9" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(axis.label)}</text>
      `;
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
  const padding = 80;
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
    (height - padding * 2) / Math.max(totalHeight + 1, 1),
  );
  const baseX = (width - horizontalExtent * scale) / 2;
  const baseY = height - padding;
  const levelLabels = (geometry.levels || [])
    .map((level) => {
      const offsetHeight = (geometry.levels || [])
        .filter((entry) => entry.level_number < level.level_number)
        .reduce((sum, entry) => sum + Number(entry.height_m || 3.2), 0);
      const y =
        baseY - (offsetHeight + Number(level.height_m || 3.2) / 2) * scale;
      return `<text x="${baseX - 12}" y="${y}" font-size="10" font-family="Arial, sans-serif" text-anchor="end">${escapeXml(level.name || `L${level.level_number}`)}</text>`;
    })
    .join("");

  const roomMarkup = (geometry.rooms || [])
    .map((room) => {
      const level = (geometry.levels || []).find(
        (entry) => entry.id === room.level_id,
      );
      const offsetHeight = (geometry.levels || [])
        .filter((entry) => entry.level_number < level.level_number)
        .reduce((sum, entry) => sum + Number(entry.height_m || 3.2), 0);
      const projection = projectRoomForSection(room, sectionType);
      const x = baseX + projection.start * scale;
      const y = baseY - (offsetHeight + Number(level.height_m || 3.2)) * scale;
      const rectWidth = Math.max(
        18,
        (projection.end - projection.start) * scale,
      );
      const rectHeight = Math.max(22, Number(level.height_m || 3.2) * scale);
      return `
        <rect x="${x}" y="${y}" width="${rectWidth}" height="${rectHeight}" fill="none" stroke="#111" stroke-width="1.8"/>
        <text x="${x + rectWidth / 2}" y="${y + rectHeight / 2}" font-size="11" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(room.name)}</text>
      `;
    })
    .join("");

  const slabLines = (geometry.levels || [])
    .map((level) => {
      const offsetHeight = (geometry.levels || [])
        .filter((entry) => entry.level_number <= level.level_number)
        .reduce((sum, entry) => sum + Number(entry.height_m || 3.2), 0);
      const y = baseY - offsetHeight * scale;
      return `<line x1="${baseX}" y1="${y}" x2="${baseX + horizontalExtent * scale}" y2="${y}" stroke="#555" stroke-width="1.6"/>`;
    })
    .join("");
  const stairMarkup = renderStairCuts(
    geometry,
    sectionType,
    baseX,
    baseY,
    scale,
  );
  const gridMarkup = renderGridMarkers(
    geometry,
    baseX,
    baseY,
    scale,
    horizontalExtent,
  );

  const roofType = String(styleDNA.roof_language || "").includes("flat")
    ? `<rect x="${baseX}" y="${baseY - totalHeight * scale - 12}" width="${horizontalExtent * scale}" height="12" fill="#e8e8e8" stroke="#111" stroke-width="1.5"/>`
    : `<path d="M ${baseX} ${baseY - totalHeight * scale} L ${baseX + (horizontalExtent * scale) / 2} ${baseY - totalHeight * scale - 46} L ${baseX + horizontalExtent * scale} ${baseY - totalHeight * scale}" fill="none" stroke="#111" stroke-width="1.8"/>`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#fff"/>
  <text x="${padding}" y="34" font-size="22" font-family="Arial, sans-serif" font-weight="bold">${escapeXml(`Section - ${sectionType}`)}</text>
  <line x1="${padding}" y1="${baseY}" x2="${width - padding}" y2="${baseY}" stroke="#333" stroke-width="2"/>
  ${roofType}
  ${gridMarkup}
  ${slabLines}
  ${levelLabels}
  ${stairMarkup}
  ${roomMarkup}
</svg>`;

  return {
    svg,
    section_type: sectionType,
    stair_count: (geometry.stairs || []).length,
    renderer: "deterministic-section-svg",
    title: `Section - ${sectionType}`,
  };
}

export default {
  renderSectionSvg,
};

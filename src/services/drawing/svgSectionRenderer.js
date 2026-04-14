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

  const roofType = String(styleDNA.roof_language || "").includes("flat")
    ? `<rect x="${baseX}" y="${baseY - totalHeight * scale - 12}" width="${horizontalExtent * scale}" height="12" fill="#e8e8e8" stroke="#111" stroke-width="1.5"/>`
    : `<path d="M ${baseX} ${baseY - totalHeight * scale} L ${baseX + (horizontalExtent * scale) / 2} ${baseY - totalHeight * scale - 46} L ${baseX + horizontalExtent * scale} ${baseY - totalHeight * scale}" fill="none" stroke="#111" stroke-width="1.8"/>`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#fff"/>
  <text x="${padding}" y="34" font-size="22" font-family="Arial, sans-serif" font-weight="bold">${escapeXml(`Section - ${sectionType}`)}</text>
  <line x1="${padding}" y1="${baseY}" x2="${width - padding}" y2="${baseY}" stroke="#333" stroke-width="2"/>
  ${roofType}
  ${slabLines}
  ${roomMarkup}
</svg>`;

  return {
    svg,
    section_type: sectionType,
    renderer: "deterministic-section-svg",
    title: `Section - ${sectionType}`,
  };
}

export default {
  renderSectionSvg,
};

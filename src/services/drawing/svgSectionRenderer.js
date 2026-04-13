import logger from "../../utils/logger.js";
import ArchitecturalSectionGenerator from "../svg/ArchitecturalSectionGenerator.js";
import { normalizeArchitecturalGeometry } from "../cad/archElementNormalizer.js";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function deriveMetrics(geometry) {
  const levelCount = Math.max(1, geometry.levels.length);
  const roomWidths = geometry.rooms.map(
    (room) => (room.bbox?.x || 0) + (room.bbox?.width || room.width_m || 0),
  );
  const roomDepths = geometry.rooms.map(
    (room) => (room.bbox?.y || 0) + (room.bbox?.height || room.depth_m || 0),
  );
  return {
    width_m: Math.max(12, ...roomWidths),
    depth_m: Math.max(10, ...roomDepths),
    total_height_m: levelCount * 3.2,
    level_count: levelCount,
  };
}

function buildSectionDNA(geometry, styleDNA = {}) {
  const metrics = deriveMetrics(geometry);
  return {
    dimensions: {
      length: metrics.width_m,
      width: metrics.depth_m,
      floors: metrics.level_count,
      floorCount: metrics.level_count,
      totalHeight: metrics.total_height_m,
    },
    materials: {
      exterior: {
        primary: styleDNA.local_materials?.[0] || "brick",
      },
    },
    roof: {
      type: String(styleDNA.roof_language || "").includes("flat")
        ? "flat"
        : "gable",
    },
  };
}

function buildFallbackSectionSvg(
  metrics,
  sectionType = "longitudinal",
  options = {},
) {
  const width = options.width || 1200;
  const height = options.height || 800;
  const padding = 80;
  const scale = Math.min(
    (width - padding * 2) / Math.max(metrics.width_m, 1),
    (height - padding * 2) / Math.max(metrics.total_height_m + 1.5, 1),
  );
  const buildingWidth = metrics.width_m * scale;
  const buildingHeight = metrics.total_height_m * scale;
  const x = (width - buildingWidth) / 2;
  const y = height - padding - buildingHeight;

  const slabLines = Array.from({ length: metrics.level_count }, (_, index) => {
    const slabY = y + buildingHeight - index * 3.2 * scale;
    return `<line x1="${x}" y1="${slabY}" x2="${x + buildingWidth}" y2="${slabY}" stroke="#111" stroke-width="3"/>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#fff"/>
  <text x="${padding}" y="36" font-size="22" font-family="Arial, sans-serif" font-weight="bold">${escapeXml(`Section - ${sectionType}`)}</text>
  <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#333" stroke-width="2"/>
  <rect x="${x}" y="${y}" width="${buildingWidth}" height="${buildingHeight}" fill="none" stroke="#111" stroke-width="3"/>
  ${slabLines}
</svg>`;
}

export function renderSectionSvg(
  geometryInput = {},
  styleDNA = {},
  options = {},
) {
  const geometry =
    geometryInput?.schema_version === "open-source-geometry-v1"
      ? geometryInput
      : normalizeArchitecturalGeometry(geometryInput, {
          source: "technical-drawing-section",
        });
  const sectionType = options.sectionType || "longitudinal";
  const dna = buildSectionDNA(geometry, styleDNA);

  if (options.tryLegacyGenerator) {
    try {
      const svg = ArchitecturalSectionGenerator.generateSection(
        dna,
        sectionType,
        options,
      );
      return {
        svg,
        section_type: sectionType,
        renderer: "architectural-section-generator",
      };
    } catch (error) {
      logger.warn(
        "[Drawing] Falling back to simple section SVG renderer",
        error.message,
      );
      return {
        svg: buildFallbackSectionSvg(
          deriveMetrics(geometry),
          sectionType,
          options,
        ),
        section_type: sectionType,
        renderer: "fallback-section-svg",
        warning: error.message,
      };
    }
  }

  return {
    svg: buildFallbackSectionSvg(deriveMetrics(geometry), sectionType, options),
    section_type: sectionType,
    renderer: "fallback-section-svg",
  };
}

export default {
  renderSectionSvg,
};

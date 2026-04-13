import logger from "../../utils/logger.js";
import ArchitecturalElevationGenerator from "../svg/ArchitecturalElevationGenerator.js";
import { normalizeArchitecturalGeometry } from "../cad/archElementNormalizer.js";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function deriveBuildingMetrics(geometry) {
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

function buildFallbackElevationSvg(
  metrics,
  styleDNA = {},
  orientation = "south",
  options = {},
) {
  const width = options.width || 1200;
  const height = options.height || 800;
  const padding = 80;
  const scale = Math.min(
    (width - padding * 2) / Math.max(metrics.width_m, 1),
    (height - padding * 2) / Math.max(metrics.total_height_m + 2, 1),
  );

  const buildingWidth = metrics.width_m * scale;
  const buildingHeight = metrics.total_height_m * scale;
  const x = (width - buildingWidth) / 2;
  const y = height - padding - buildingHeight;
  const roofFlat = String(styleDNA.roof_language || "").includes("flat");
  const roof = roofFlat
    ? `<rect x="${x}" y="${y - 18}" width="${buildingWidth}" height="18" fill="#ddd" stroke="#111" stroke-width="2"/>`
    : `<path d="M ${x} ${y} L ${x + buildingWidth / 2} ${y - 70} L ${x + buildingWidth} ${y}" fill="#f4f4f4" stroke="#111" stroke-width="3"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#fff"/>
  <text x="${padding}" y="36" font-size="22" font-family="Arial, sans-serif" font-weight="bold">${escapeXml(`Elevation - ${orientation}`)}</text>
  <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#444" stroke-width="2"/>
  ${roof}
  <rect x="${x}" y="${y}" width="${buildingWidth}" height="${buildingHeight}" fill="white" stroke="#111" stroke-width="3"/>
  <rect x="${x + buildingWidth * 0.18}" y="${y + buildingHeight * 0.25}" width="${buildingWidth * 0.12}" height="${buildingHeight * 0.18}" fill="none" stroke="#111" stroke-width="2"/>
  <rect x="${x + buildingWidth * 0.68}" y="${y + buildingHeight * 0.25}" width="${buildingWidth * 0.12}" height="${buildingHeight * 0.18}" fill="none" stroke="#111" stroke-width="2"/>
  <rect x="${x + buildingWidth * 0.44}" y="${y + buildingHeight * 0.62}" width="${buildingWidth * 0.12}" height="${buildingHeight * 0.26}" fill="none" stroke="#111" stroke-width="2"/>
</svg>`;
}

function buildElevationDNA(geometry, styleDNA = {}) {
  const metrics = deriveBuildingMetrics(geometry);
  return {
    dimensions: {
      width: metrics.width_m,
      depth: metrics.depth_m,
      floors: metrics.level_count,
      floorCount: metrics.level_count,
      totalHeight: metrics.total_height_m,
    },
    materials: {
      exterior: {
        primary: styleDNA.local_materials?.[0] || "brick",
      },
    },
    style: {
      windowStyle: String(styleDNA.window_language || "").includes("large")
        ? "picture"
        : "casement",
      roofType: String(styleDNA.roof_language || "").includes("flat")
        ? "flat"
        : "gable",
    },
  };
}

export function renderElevationSvg(
  geometryInput = {},
  styleDNA = {},
  options = {},
) {
  const geometry =
    geometryInput?.schema_version === "open-source-geometry-v1"
      ? geometryInput
      : normalizeArchitecturalGeometry(geometryInput, {
          source: "technical-drawing-elevation",
        });
  const orientation = options.orientation || "south";
  const dna = buildElevationDNA(geometry, styleDNA);

  if (options.tryLegacyGenerator) {
    try {
      const svg = ArchitecturalElevationGenerator.generateFromDNA(
        dna,
        orientation,
        options,
      );
      return {
        svg,
        orientation,
        renderer: "architectural-elevation-generator",
      };
    } catch (error) {
      logger.warn(
        "[Drawing] Falling back to simple elevation SVG renderer",
        error.message,
      );
      return {
        svg: buildFallbackElevationSvg(
          deriveBuildingMetrics(geometry),
          styleDNA,
          orientation,
          options,
        ),
        orientation,
        renderer: "fallback-elevation-svg",
        warning: error.message,
      };
    }
  }

  return {
    svg: buildFallbackElevationSvg(
      deriveBuildingMetrics(geometry),
      styleDNA,
      orientation,
      options,
    ),
    orientation,
    renderer: "fallback-elevation-svg",
  };
}

export default {
  renderElevationSvg,
};

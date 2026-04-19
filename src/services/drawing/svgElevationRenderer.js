import { isFeatureEnabled } from "../../config/featureFlags.js";
import { getCanonicalMaterialPalette } from "../design/canonicalMaterialPalette.js";
import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function orientationToSide(orientation = "south") {
  const normalized = String(orientation || "south").toLowerCase();
  if (["north", "south", "east", "west"].includes(normalized)) {
    return normalized;
  }
  return "south";
}

function roundMetric(value, precision = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

function getBuildableBounds(geometry = {}) {
  return (
    geometry.site?.buildable_bbox ||
    geometry.site?.boundary_bbox || {
      min_x: 0,
      min_y: 0,
      max_x: 12,
      max_y: 10,
      width: 12,
      height: 10,
    }
  );
}

function metricsFromGeometry(geometry = {}, orientation = "south") {
  const buildable = getBuildableBounds(geometry);
  const levels = geometry.levels || [];
  const totalHeight =
    levels.reduce((sum, level) => sum + Number(level.height_m || 3.2), 0) ||
    3.2;

  return {
    width_m:
      orientation === "east" || orientation === "west"
        ? Number(buildable.height || 10)
        : Number(buildable.width || 12),
    total_height_m: totalHeight,
    level_count: Math.max(1, levels.length),
  };
}

function projectAlongOrientation(
  point = {},
  bounds = {},
  orientation = "south",
) {
  const side = orientationToSide(orientation);
  const coordinate =
    side === "east" || side === "west"
      ? (point.y ?? point.min_y)
      : (point.x ?? point.min_x);
  const base =
    side === "east" || side === "west"
      ? Number(bounds.min_y || 0)
      : Number(bounds.min_x || 0);
  return Number(coordinate || 0) - base;
}

function getLevelProfiles(geometry = {}) {
  let offset = 0;
  return (geometry.levels || [])
    .slice()
    .sort(
      (left, right) =>
        Number(left.level_number || 0) - Number(right.level_number || 0),
    )
    .map((level) => {
      const height = Number(level.height_m || 3.2);
      const profile = {
        ...level,
        bottom_m: offset,
        top_m: offset + height,
      };
      offset += height;
      return profile;
    });
}

function findFacadeOrientation(geometry = {}, options = {}) {
  const facadeGrammar =
    options.facadeGrammar || geometry.metadata?.facade_grammar || {};
  const side = orientationToSide(options.orientation || "south");
  return (
    facadeGrammar?.orientations?.find((entry) => entry.side === side) || null
  );
}

function normalizeRoofLanguage(
  styleDNA = {},
  facadeOrientation = {},
  geometry = {},
) {
  return String(
    facadeOrientation?.roofline_language ||
      styleDNA?.roof_language ||
      geometry?.roof?.type ||
      "pitched gable",
  ).toLowerCase();
}

function buildMaterialPatternDefs(palette = {}) {
  const primary = palette.primary?.hexColor || "#f0ece4";
  const secondary = palette.secondary?.hexColor || "#d8c4ae";
  const roof = palette.roof?.hexColor || "#6a717c";
  const trim = palette.trim?.hexColor || "#838891";

  return `
    <defs>
      <pattern id="phase8-elev-brick" width="18" height="12" patternUnits="userSpaceOnUse">
        <rect width="18" height="12" fill="${primary}" />
        <path d="M 0 0 H 18 M 0 6 H 18 M 0 12 H 18 M 9 0 V 6 M 0 6 V 12 M 18 6 V 12" stroke="#9a6356" stroke-width="0.7" />
      </pattern>
      <pattern id="phase8-elev-clapboard" width="16" height="10" patternUnits="userSpaceOnUse">
        <rect width="16" height="10" fill="${secondary}" />
        <path d="M 0 0 H 16 M 0 5 H 16 M 0 10 H 16" stroke="#b89b7e" stroke-width="0.8" />
      </pattern>
      <pattern id="phase8-elev-render" width="10" height="10" patternUnits="userSpaceOnUse">
        <rect width="10" height="10" fill="${secondary}" />
        <circle cx="2.5" cy="2.5" r="0.8" fill="#c7baa9" />
        <circle cx="7.5" cy="5" r="0.8" fill="#c7baa9" />
        <circle cx="4" cy="8" r="0.8" fill="#c7baa9" />
      </pattern>
      <pattern id="phase8-elev-timber" width="12" height="16" patternUnits="userSpaceOnUse">
        <rect width="12" height="16" fill="${secondary}" />
        <path d="M 0 0 V 16 M 6 0 V 16 M 12 0 V 16" stroke="#815938" stroke-width="0.8" />
      </pattern>
      <pattern id="phase8-elev-roof" width="12" height="12" patternUnits="userSpaceOnUse">
        <rect width="12" height="12" fill="${roof}" />
        <path d="M 0 12 L 6 0 L 12 12" stroke="#4e545d" stroke-width="0.7" fill="none" />
      </pattern>
      <pattern id="phase8-elev-ground" width="16" height="8" patternUnits="userSpaceOnUse">
        <rect width="16" height="8" fill="#e3ddcf" />
        <path d="M 0 8 L 4 4 L 8 8 L 12 4 L 16 8" stroke="#b4aa95" stroke-width="0.8" fill="none" />
      </pattern>
      <style>
        .phase8-title { font-size: 22px; font-weight: 700; }
        .phase8-label { font-size: 10px; font-weight: 600; }
        .phase8-small { font-size: 9px; }
        .phase8-datum { font-size: 10px; font-weight: 700; fill: #374151; }
        .phase8-opening { fill: #fcfdff; stroke: #275b94; stroke-width: 1.8; }
        .phase8-lintel { stroke: ${trim}; stroke-width: 1.2; }
      </style>
    </defs>
  `;
}

function getPatternId(hatch = "") {
  const normalized = String(hatch || "").toLowerCase();
  if (normalized.includes("brick")) return "phase8-elev-brick";
  if (normalized.includes("clapboard")) return "phase8-elev-clapboard";
  if (normalized.includes("timber")) return "phase8-elev-timber";
  if (normalized.includes("render") || normalized.includes("stone")) {
    return "phase8-elev-render";
  }
  return "phase8-elev-render";
}

function collectSideFeatures(
  geometry = {},
  orientation = "south",
  facadeOrientation = {},
) {
  const sideWalls = (geometry.walls || []).filter(
    (wall) => wall.exterior && wall.metadata?.side === orientation,
  );
  const wallFeatures = sideWalls.flatMap(
    (wall) => wall.metadata?.features || [],
  );
  const geometryFeatures = [
    ...(geometry.metadata?.facade_features?.[orientation] || []),
    ...(geometry.metadata?.facadeFeatures?.[orientation] || []),
  ];
  const derivedFeatures = [];

  if (facadeOrientation?.components?.balconies?.length) {
    derivedFeatures.push("balcony");
  }
  if (facadeOrientation?.components?.feature_frames?.length) {
    derivedFeatures.push("feature-frame");
  }
  if (String(facadeOrientation?.parapet_mode || "").toLowerCase() !== "none") {
    derivedFeatures.push("parapet");
  }

  return [
    ...new Set([...wallFeatures, ...geometryFeatures, ...derivedFeatures]),
  ];
}

function renderRoof(baseX, topY, widthPx, roofLanguage, roofMaterialPattern) {
  const flatRoof =
    roofLanguage.includes("flat") || roofLanguage.includes("parapet");
  if (flatRoof) {
    return `
      <rect x="${baseX}" y="${topY - 14}" width="${widthPx}" height="14" fill="url(#${roofMaterialPattern})" stroke="#111" stroke-width="1.8" />
      <line x1="${baseX}" y1="${topY - 14}" x2="${baseX + widthPx}" y2="${topY - 14}" stroke="#111" stroke-width="2.2" />
    `;
  }

  const ridgeY = topY - 52;
  return `
    <path d="M ${baseX} ${topY} L ${baseX + widthPx / 2} ${ridgeY} L ${baseX + widthPx} ${topY}" fill="url(#${roofMaterialPattern})" stroke="#111" stroke-width="2.2" />
    <line x1="${baseX + 8}" y1="${topY - 6}" x2="${baseX + widthPx - 8}" y2="${topY - 6}" stroke="#444" stroke-width="0.8" stroke-dasharray="5 3" />
  `;
}

function renderLevelDatums(baseX, baseY, widthPx, levelProfiles, scale) {
  const lines = [];
  const labels = [];
  levelProfiles.forEach((level) => {
    const topY = baseY - level.top_m * scale;
    const midY =
      baseY - (level.bottom_m + Number(level.height_m || 3.2) / 2) * scale;
    lines.push(
      `<line x1="${baseX}" y1="${topY}" x2="${baseX + widthPx}" y2="${topY}" stroke="#6b7280" stroke-width="1.1" />`,
    );
    labels.push(`
      <line x1="${baseX - 54}" y1="${topY}" x2="${baseX - 6}" y2="${topY}" stroke="#374151" stroke-width="1" />
      <text x="${baseX - 60}" y="${topY + 4}" class="phase8-datum" text-anchor="end">${escapeXml(
        `${level.name || `L${level.level_number}`} +${level.top_m.toFixed(2)}m`,
      )}</text>
      <text x="${baseX - 12}" y="${midY}" class="phase8-small" text-anchor="end">${escapeXml(
        level.name || `L${level.level_number}`,
      )}</text>
    `);
  });

  labels.push(`
    <line x1="${baseX - 54}" y1="${baseY}" x2="${baseX - 6}" y2="${baseY}" stroke="#111" stroke-width="1.2" />
    <text x="${baseX - 60}" y="${baseY + 4}" class="phase8-datum" text-anchor="end">FFL +0.00m</text>
  `);

  return {
    markup: `<g id="phase8-elevation-datums">${lines.join("")}${labels.join("")}</g>`,
    count: levelProfiles.length + 1,
  };
}

function renderOpenings(
  geometry = {},
  orientation = "south",
  bounds = {},
  baseX = 0,
  baseY = 0,
  scale = 1,
  levelProfiles = [],
) {
  const sideWindows = (geometry.windows || []).filter((windowElement) => {
    const wall = (geometry.walls || []).find(
      (entry) => entry.id === windowElement.wall_id,
    );
    return wall?.metadata?.side === orientation;
  });
  const sideDoors = (geometry.doors || []).filter((door) => {
    const wall = (geometry.walls || []).find(
      (entry) => entry.id === door.wall_id,
    );
    return wall?.metadata?.side === orientation;
  });

  const windowMarkup = sideWindows
    .map((windowElement) => {
      const wall = (geometry.walls || []).find(
        (entry) => entry.id === windowElement.wall_id,
      );
      const level =
        levelProfiles.find(
          (entry) =>
            entry.id === windowElement.level_id || entry.id === wall?.level_id,
        ) || levelProfiles[0];
      if (!level) {
        return "";
      }

      const widthM = Math.max(0.9, Number(windowElement.width_m || 1.4));
      const centerM = projectAlongOrientation(
        windowElement.position_m || wall?.start || {},
        bounds,
        orientation,
      );
      const x = baseX + centerM * scale - (widthM * scale) / 2;
      const sillY =
        baseY -
        (level.bottom_m + Number(windowElement.sill_height_m || 0.9)) * scale;
      const headY =
        baseY -
        (level.bottom_m + Number(windowElement.head_height_m || 2.1)) * scale;
      const heightPx = Math.max(18, sillY - headY);
      const widthPx = Math.max(22, widthM * scale);

      return `
        <g class="phase8-window">
          <rect x="${x}" y="${headY}" width="${widthPx}" height="${heightPx}" class="phase8-opening" />
          <line x1="${x}" y1="${sillY}" x2="${x + widthPx}" y2="${sillY}" class="phase8-lintel" />
          <line x1="${x}" y1="${headY}" x2="${x + widthPx}" y2="${headY}" class="phase8-lintel" />
          <line x1="${x + widthPx / 2}" y1="${headY + 2}" x2="${x + widthPx / 2}" y2="${sillY - 2}" stroke="#7db5d8" stroke-width="1.2" />
        </g>
      `;
    })
    .join("");

  const doorMarkup = sideDoors
    .map((door) => {
      const wall = (geometry.walls || []).find(
        (entry) => entry.id === door.wall_id,
      );
      const level =
        levelProfiles.find(
          (entry) => entry.id === door.level_id || entry.id === wall?.level_id,
        ) || levelProfiles[0];
      if (!level) {
        return "";
      }

      const widthM = Math.max(0.95, Number(door.width_m || 1.1));
      const centerM = projectAlongOrientation(
        door.position_m || wall?.start || {},
        bounds,
        orientation,
      );
      const x = baseX + centerM * scale - (widthM * scale) / 2;
      const widthPx = Math.max(24, widthM * scale);
      const headY =
        baseY - (level.bottom_m + Number(door.head_height_m || 2.2)) * scale;
      const heightPx = Math.max(28, baseY - headY);
      return `
        <g class="phase8-door">
          <rect x="${x}" y="${headY}" width="${widthPx}" height="${heightPx}" fill="#f7f7f7" stroke="#222" stroke-width="1.7" />
          <line x1="${x}" y1="${headY}" x2="${x + widthPx}" y2="${headY}" class="phase8-lintel" />
        </g>
      `;
    })
    .join("");

  return {
    markup: `<g id="phase8-elevation-openings">${windowMarkup}${doorMarkup}</g>`,
    windowCount: sideWindows.length,
    doorCount: sideDoors.length,
  };
}

function renderRhythmGuides(
  facadeOrientation = {},
  baseX = 0,
  baseY = 0,
  widthPx = 0,
  heightPx = 0,
) {
  const bays = facadeOrientation?.components?.bays || [];
  const guides = bays
    .map((bay, index) => {
      const x = baseX + ((index + 1) * widthPx) / Math.max(bays.length + 1, 2);
      return `<line x1="${x}" y1="${baseY - heightPx}" x2="${x}" y2="${baseY}" stroke="#c9b797" stroke-width="0.8" stroke-dasharray="4 5" />`;
    })
    .join("");

  return {
    markup: `<g id="phase8-elevation-rhythm">${guides}</g>`,
    count: bays.length,
  };
}

function renderMaterialZones(
  facadeOrientation = {},
  palette = {},
  baseX = 0,
  baseY = 0,
  widthPx = 0,
  heightPx = 0,
) {
  const zones = facadeOrientation?.material_zones || [];
  if (!zones.length) {
    return {
      markup: `<rect x="${baseX}" y="${baseY - heightPx}" width="${widthPx}" height="${heightPx}" fill="url(#${getPatternId(
        palette.primary?.hatch,
      )})" stroke="#111" stroke-width="2.4" />`,
      count: 1,
    };
  }

  const bandHeight = heightPx / zones.length;
  const markup = zones
    .map((zone, index) => {
      const y = baseY - heightPx + bandHeight * index;
      const materialKey = String(zone.material || zone.type || zone.name || "")
        .toLowerCase()
        .includes("secondary")
        ? palette.secondary?.hatch
        : palette.primary?.hatch;
      return `<rect x="${baseX}" y="${y}" width="${widthPx}" height="${bandHeight}" fill="url(#${getPatternId(
        materialKey,
      )})" opacity="${index === 0 ? 0.96 : 0.82}" />`;
    })
    .join("");

  return {
    markup: `
      <g id="phase8-elevation-material-zones">
        ${markup}
        <rect x="${baseX}" y="${baseY - heightPx}" width="${widthPx}" height="${heightPx}" fill="none" stroke="#111" stroke-width="2.4" />
      </g>
    `,
    count: zones.length,
  };
}

function renderFacadeFeatures(
  features = [],
  levelProfiles = [],
  baseX = 0,
  baseY = 0,
  widthPx = 0,
  scale = 1,
) {
  const upperLevel = levelProfiles[levelProfiles.length - 1] || null;
  const firstUpperLevel =
    levelProfiles.find((entry) => Number(entry.level_number || 0) >= 1) ||
    upperLevel;
  const markup = [];

  if (
    features.some((entry) => String(entry).includes("balcony")) &&
    firstUpperLevel
  ) {
    const y = baseY - (firstUpperLevel.bottom_m + 1.1) * scale;
    markup.push(`
      <g id="phase8-feature-balcony">
        <line x1="${baseX + widthPx * 0.56}" y1="${y}" x2="${baseX + widthPx * 0.84}" y2="${y}" stroke="#444" stroke-width="2" />
        <line x1="${baseX + widthPx * 0.58}" y1="${y}" x2="${baseX + widthPx * 0.58}" y2="${y + 18}" stroke="#444" stroke-width="1.2" />
        <line x1="${baseX + widthPx * 0.7}" y1="${y}" x2="${baseX + widthPx * 0.7}" y2="${y + 18}" stroke="#444" stroke-width="1.2" />
        <line x1="${baseX + widthPx * 0.82}" y1="${y}" x2="${baseX + widthPx * 0.82}" y2="${y + 18}" stroke="#444" stroke-width="1.2" />
      </g>
    `);
  }

  if (features.some((entry) => String(entry).includes("porch"))) {
    markup.push(`
      <g id="phase8-feature-porch">
        <rect x="${baseX + widthPx * 0.12}" y="${baseY - 42}" width="${widthPx * 0.18}" height="42" fill="none" stroke="#444" stroke-width="1.5" />
        <line x1="${baseX + widthPx * 0.11}" y1="${baseY - 42}" x2="${baseX + widthPx * 0.31}" y2="${baseY - 42}" stroke="#444" stroke-width="1.8" />
      </g>
    `);
  }

  if (features.some((entry) => String(entry).includes("chimney"))) {
    markup.push(`
      <g id="phase8-feature-chimney">
        <rect x="${baseX + widthPx * 0.72}" y="${baseY - levelProfiles.reduce((sum, level) => sum + Number(level.height_m || 3.2), 0) * scale - 48}" width="18" height="48" fill="#c2b29b" stroke="#333" stroke-width="1.4" />
      </g>
    `);
  }

  if (features.some((entry) => String(entry).includes("dormer"))) {
    const roofY =
      baseY -
      levelProfiles.reduce(
        (sum, level) => sum + Number(level.height_m || 3.2),
        0,
      ) *
        scale;
    markup.push(`
      <g id="phase8-feature-dormer">
        <rect x="${baseX + widthPx * 0.42}" y="${roofY - 26}" width="44" height="24" fill="#f8fafc" stroke="#275b94" stroke-width="1.4" />
        <path d="M ${baseX + widthPx * 0.42} ${roofY - 26} L ${baseX + widthPx * 0.42 + 22} ${roofY - 42} L ${baseX + widthPx * 0.42 + 44} ${roofY - 26}" fill="none" stroke="#333" stroke-width="1.4" />
      </g>
    `);
  }

  return {
    markup: `<g id="phase8-elevation-features">${markup.join("")}</g>`,
    count: markup.length,
  };
}

function renderGroundLine(baseX, baseY, widthPx) {
  return `
    <g id="phase8-ground-line">
      <rect x="${baseX - 20}" y="${baseY}" width="${widthPx + 40}" height="26" fill="url(#phase8-elev-ground)" />
      <line x1="${baseX - 24}" y1="${baseY}" x2="${baseX + widthPx + 24}" y2="${baseY}" stroke="#1f2937" stroke-width="2.1" />
    </g>
  `;
}

export function renderElevationSvg(
  geometryInput = {},
  styleDNA = {},
  options = {},
) {
  const geometry = coerceToCanonicalProjectGeometry(
    geometryInput?.projectGeometry || geometryInput?.geometry || geometryInput,
  );
  const orientation = orientationToSide(options.orientation || "south");
  const facadeOrientation = findFacadeOrientation(geometry, {
    ...options,
    orientation,
  });
  const metrics = metricsFromGeometry(geometry, orientation);
  const width = options.width || 1200;
  const height = options.height || 760;
  const padding = 84;
  const scale = Math.min(
    (width - padding * 2) / Math.max(metrics.width_m, 1),
    (height - padding * 2) / Math.max(metrics.total_height_m + 1.2, 1),
  );
  const baseX = (width - metrics.width_m * scale) / 2;
  const baseY = height - padding;
  const heightPx = metrics.total_height_m * scale;
  const widthPx = metrics.width_m * scale;
  const bounds = getBuildableBounds(geometry);
  const levelProfiles = getLevelProfiles(geometry);
  const roofLanguage = normalizeRoofLanguage(
    styleDNA,
    facadeOrientation,
    geometry,
  );
  const palette = getCanonicalMaterialPalette({
    dna: styleDNA,
    projectGeometry: geometry,
    facadeGrammar:
      options.facadeGrammar || geometry.metadata?.facade_grammar || null,
  });
  const materialZones = renderMaterialZones(
    facadeOrientation || {},
    palette,
    baseX,
    baseY,
    widthPx,
    heightPx,
  );
  const datums = renderLevelDatums(baseX, baseY, widthPx, levelProfiles, scale);
  const openings = renderOpenings(
    geometry,
    orientation,
    bounds,
    baseX,
    baseY,
    scale,
    levelProfiles,
  );
  const rhythm = renderRhythmGuides(
    facadeOrientation || {},
    baseX,
    baseY,
    widthPx,
    heightPx,
  );
  const features = collectSideFeatures(
    geometry,
    orientation,
    facadeOrientation || {},
  );
  const featureMarkup = renderFacadeFeatures(
    features,
    levelProfiles,
    baseX,
    baseY,
    widthPx,
    scale,
  );
  const roof = renderRoof(
    baseX,
    baseY - heightPx,
    widthPx,
    roofLanguage,
    "phase8-elev-roof",
  );
  const sideWalls = (geometry.walls || []).filter(
    (wall) => wall.exterior && wall.metadata?.side === orientation,
  );
  const hasEnvelopeGeometry = metrics.width_m > 0 && levelProfiles.length > 0;
  const geometryComplete = hasEnvelopeGeometry;
  const geometrySource =
    sideWalls.length > 0 ? "explicit_side_walls" : "envelope_derived";
  const facadeMaterialSignalCount =
    facadeOrientation?.material_zones?.length || 0;
  const facadeRhythmSignalCount =
    facadeOrientation?.components?.bays?.length || 0;
  const elevationReadableInputs =
    openings.windowCount + openings.doorCount + featureMarkup.count > 0 ||
    facadeRhythmSignalCount > 0 ||
    facadeMaterialSignalCount > 0;
  const facadeRichnessScore = roundMetric(
    clamp(
      (openings.windowCount > 0 ? 0.28 : 0.12) +
        (materialZones.count > 0 ? 0.16 : 0.08) +
        (rhythm.count > 0 ? 0.12 : 0.04) +
        (datums.count > 1 ? 0.14 : 0.05) +
        (featureMarkup.count > 0 ? 0.14 : 0.05) +
        (String(roofLanguage).length > 0 ? 0.1 : 0.04) +
        (openings.doorCount > 0 ? 0.06 : 0),
      0,
      1,
    ),
  );

  if (
    isFeatureEnabled("useElevationRendererUpgradePhase8") &&
    (!geometryComplete || !elevationReadableInputs)
  ) {
    return {
      svg: null,
      orientation,
      window_count: openings.windowCount,
      renderer: "deterministic-elevation-svg",
      title: `Elevation - ${orientation}`,
      status: "blocked",
      blocking_reasons: [
        !geometryComplete
          ? `Elevation ${orientation} cannot be rendered credibly because canonical side envelope geometry is missing.`
          : `Elevation ${orientation} lacks enough canonical facade data to support a readable technical panel.`,
      ],
      technical_quality_metadata: {
        drawing_type: "elevation",
        geometry_complete: false,
        geometry_source: geometrySource,
        window_count: openings.windowCount,
        door_count: openings.doorCount,
        level_label_count: levelProfiles.length,
        material_zone_count: materialZones.count,
        bay_count: rhythm.count,
        feature_count: featureMarkup.count,
        facade_richness_score: facadeRichnessScore,
        uses_canonical_material_palette: true,
        roof_language: roofLanguage,
        facade_features: features,
      },
    };
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${buildMaterialPatternDefs(palette)}
  <rect width="${width}" height="${height}" fill="#fff" />
  <text x="${padding}" y="36" class="phase8-title">${escapeXml(`Elevation - ${orientation.toUpperCase()}`)}</text>
  <text x="${padding}" y="52" class="phase8-small">${escapeXml(
    `Primary ${palette.primary?.name || "Material"} / Roof ${palette.roof?.name || "Material"} / ${levelProfiles.length} storey`,
  )}</text>
  ${renderGroundLine(baseX, baseY, widthPx)}
  ${roof}
  ${materialZones.markup}
  ${rhythm.markup}
  ${datums.markup}
  ${openings.markup}
  ${featureMarkup.markup}
  <text x="${baseX}" y="${baseY + 20}" class="phase8-label">${escapeXml(
    palette.facadeLanguage || "Facade articulation",
  )}</text>
  <text x="${baseX}" y="${baseY + 34}" class="phase8-small">${escapeXml(
    `Openings ${openings.windowCount + openings.doorCount} / rhythm ${
      facadeOrientation?.opening_rhythm?.opening_count || openings.windowCount
    } / features ${featureMarkup.count}`,
  )}</text>
  ${options.overlayMarkup || ""}
</svg>`;

  return {
    svg,
    orientation,
    window_count: openings.windowCount,
    renderer: "deterministic-elevation-svg",
    title: `Elevation - ${orientation}`,
    technical_quality_metadata: {
      drawing_type: "elevation",
      has_title: true,
      geometry_complete: geometryComplete,
      geometry_source: geometrySource,
      window_count: openings.windowCount,
      door_count: openings.doorCount,
      floor_line_count: levelProfiles.length,
      level_label_count: levelProfiles.length,
      bay_count: rhythm.count,
      shading_count: facadeOrientation?.shading_elements?.length || 0,
      material_zone_count: materialZones.count,
      ffl_marker_count: datums.count,
      sill_lintel_count: openings.windowCount * 2 + openings.doorCount,
      feature_count: featureMarkup.count,
      facade_richness_score: facadeRichnessScore,
      uses_canonical_material_palette: true,
      roof_language: roofLanguage,
      facade_features: features,
      opening_rhythm_count:
        facadeOrientation?.opening_rhythm?.opening_count ||
        openings.windowCount,
    },
  };
}

export default {
  renderElevationSvg,
};

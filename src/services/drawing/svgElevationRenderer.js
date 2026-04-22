import { isFeatureEnabled } from "../../config/featureFlags.js";
import { getCanonicalMaterialPalette } from "../design/canonicalMaterialPalette.js";
import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";
import { extractSideFacade } from "../facade/sideFacadeExtractor.js";
import { assessElevationSemantics } from "./elevationSemanticService.js";
import {
  getBlueprintTheme,
  getEnvelopeDrawingBoundsWithSource,
  resolveCompiledProjectGeometryInput,
  resolveCompiledProjectStyleDNA,
} from "./drawingBounds.js";

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

function roundMetric(value, precision = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

function formatNumber(value, precision = 2) {
  return roundMetric(value, precision).toFixed(precision);
}

function formatMeters(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "0.0 m";
  }
  return `${numeric.toFixed(1)} m`;
}

function orientationToSide(orientation = "south") {
  const normalized = String(orientation || "south").toLowerCase();
  if (["north", "south", "east", "west"].includes(normalized)) {
    return normalized;
  }
  return "south";
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

function metricsFromBounds(
  bounds = {},
  orientation = "south",
  levelProfiles = [],
) {
  const widthM =
    orientation === "east" || orientation === "west"
      ? Number(bounds.height || 10)
      : Number(bounds.width || 12);
  const totalHeightM =
    levelProfiles.reduce(
      (sum, level) => sum + Number(level.height_m || 3.2),
      0,
    ) || 3.2;

  return {
    width_m: widthM,
    total_height_m: totalHeightM,
    level_count: Math.max(1, levelProfiles.length),
  };
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

function chooseScaleBarMeters(scalePxPerMeter = 1) {
  const candidates = [0.5, 1, 2, 5, 10];
  const eligible = candidates.filter(
    (entry) => entry * Math.max(scalePxPerMeter, 1) <= 160,
  );
  return eligible[eligible.length - 1] || 1;
}

function buildMaterialPatternDefs(theme) {
  return `
    <defs>
      <pattern id="phase8-elev-brick" width="18" height="12" patternUnits="userSpaceOnUse">
        <rect width="18" height="12" fill="${theme.fillSoft}" />
        <path d="M 0 0 H 18 M 0 6 H 18 M 0 12 H 18 M 9 0 V 6 M 0 6 V 12 M 18 6 V 12" stroke="${theme.lineMuted}" stroke-width="0.7" />
      </pattern>
      <pattern id="phase8-elev-clapboard" width="16" height="10" patternUnits="userSpaceOnUse">
        <rect width="16" height="10" fill="${theme.paper}" />
        <path d="M 0 0 H 16 M 0 5 H 16 M 0 10 H 16" stroke="${theme.lineLight}" stroke-width="0.8" />
      </pattern>
      <pattern id="phase8-elev-render" width="10" height="10" patternUnits="userSpaceOnUse">
        <rect width="10" height="10" fill="${theme.paper}" />
        <circle cx="2.5" cy="2.5" r="0.8" fill="${theme.hatch}" />
        <circle cx="7.5" cy="5" r="0.8" fill="${theme.hatch}" />
        <circle cx="4" cy="8" r="0.8" fill="${theme.hatch}" />
      </pattern>
      <pattern id="phase8-elev-timber" width="12" height="16" patternUnits="userSpaceOnUse">
        <rect width="12" height="16" fill="${theme.paper}" />
        <path d="M 0 0 V 16 M 6 0 V 16 M 12 0 V 16" stroke="${theme.lineMuted}" stroke-width="0.8" />
      </pattern>
      <pattern id="phase8-elev-roof" width="12" height="12" patternUnits="userSpaceOnUse">
        <rect width="12" height="12" fill="${theme.fillSoft}" />
        <path d="M 0 12 L 6 0 L 12 12" stroke="${theme.lineMuted}" stroke-width="0.7" fill="none" />
      </pattern>
      <pattern id="phase8-elev-ground" width="16" height="8" patternUnits="userSpaceOnUse">
        <rect width="16" height="8" fill="${theme.paper}" />
        <path d="M 0 8 L 4 4 L 8 8 L 12 4 L 16 8" stroke="${theme.guide}" stroke-width="0.8" fill="none" />
      </pattern>
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

function renderRoof(baseX, topY, widthPx, roofLanguage, theme) {
  const flatRoof =
    roofLanguage.includes("flat") || roofLanguage.includes("parapet");
  if (flatRoof) {
    return `
      <g id="phase14-section-roof">
        <rect x="${formatNumber(baseX)}" y="${formatNumber(
          topY - 14,
        )}" width="${formatNumber(widthPx)}" height="14" fill="url(#phase8-elev-roof)" stroke="${theme.line}" stroke-width="1.8" />
        <line x1="${formatNumber(baseX)}" y1="${formatNumber(
          topY - 14,
        )}" x2="${formatNumber(baseX + widthPx)}" y2="${formatNumber(
          topY - 14,
        )}" stroke="${theme.line}" stroke-width="2.3" />
      </g>
    `;
  }

  const ridgeY = topY - 48;
  return `
    <g id="phase14-section-roof">
      <path d="M ${formatNumber(baseX)} ${formatNumber(topY)} L ${formatNumber(
        baseX + widthPx / 2,
      )} ${formatNumber(ridgeY)} L ${formatNumber(
        baseX + widthPx,
      )} ${formatNumber(topY)}" fill="url(#phase8-elev-roof)" stroke="${theme.line}" stroke-width="2.3" />
      <line x1="${formatNumber(baseX + 8)}" y1="${formatNumber(
        topY - 6,
      )}" x2="${formatNumber(baseX + widthPx - 8)}" y2="${formatNumber(
        topY - 6,
      )}" stroke="${theme.lineLight}" stroke-width="1" stroke-dasharray="5 3" />
    </g>
  `;
}

function renderLevelDatums(baseX, baseY, widthPx, levelProfiles, scale, theme) {
  const lines = [];
  const labels = [];
  levelProfiles.forEach((level) => {
    const topY = baseY - level.top_m * scale;
    const midY =
      baseY - (level.bottom_m + Number(level.height_m || 3.2) / 2) * scale;
    lines.push(
      `<line x1="${formatNumber(baseX)}" y1="${formatNumber(
        topY,
      )}" x2="${formatNumber(baseX + widthPx)}" y2="${formatNumber(
        topY,
      )}" stroke="${theme.lineMuted}" stroke-width="1.1" />`,
    );
    labels.push(`
      <line x1="${formatNumber(baseX - 46)}" y1="${formatNumber(
        topY,
      )}" x2="${formatNumber(baseX - 6)}" y2="${formatNumber(
        topY,
      )}" stroke="${theme.lineMuted}" stroke-width="1" />
      <text x="${formatNumber(baseX - 52)}" y="${formatNumber(
        topY + 4,
      )}" font-size="9" font-family="Arial, sans-serif" font-weight="700" text-anchor="end">${escapeXml(
        `${level.name || `L${level.level_number}`} +${level.top_m.toFixed(2)}m`,
      )}</text>
      <text x="${formatNumber(baseX - 10)}" y="${formatNumber(
        midY,
      )}" font-size="8" font-family="Arial, sans-serif" text-anchor="end">${escapeXml(
        level.name || `L${level.level_number}`,
      )}</text>
    `);
  });

  labels.push(`
    <line x1="${formatNumber(baseX - 46)}" y1="${formatNumber(
      baseY,
    )}" x2="${formatNumber(baseX - 6)}" y2="${formatNumber(
      baseY,
    )}" stroke="${theme.line}" stroke-width="1.1" />
    <text x="${formatNumber(baseX - 52)}" y="${formatNumber(
      baseY + 4,
    )}" font-size="9" font-family="Arial, sans-serif" font-weight="700" text-anchor="end">FFL +0.00m</text>
  `);

  return {
    markup: `<g id="phase8-elevation-datums">${lines.join("")}${labels.join("")}</g>`,
    count: levelProfiles.length + 1,
  };
}

function renderProjectedOpenings(
  sideFacade = {},
  baseX = 0,
  baseY = 0,
  scale = 1,
  theme,
) {
  const levelProfiles = sideFacade.levelProfiles || [];
  const projectY = (level, heightM) =>
    baseY - (Number(level.bottom_m || 0) + Number(heightM || 0)) * scale;

  const windowMarkup = [...(sideFacade.projectedWindows || [])]
    .sort(
      (left, right) => Number(left.center_m || 0) - Number(right.center_m || 0),
    )
    .map((windowElement) => {
      const level = levelProfiles.find(
        (entry) => entry.id === windowElement.levelId,
      );
      if (!level) return "";
      const widthPx = Math.max(
        22,
        Number(windowElement.width_m || 1.4) * scale,
      );
      const x =
        baseX + Number(windowElement.center_m || 0) * scale - widthPx / 2;
      const sillY = projectY(level, windowElement.sill_height_m || 0.9);
      const headY = projectY(level, windowElement.head_height_m || 2.1);
      const heightPx = Math.max(18, sillY - headY);
      return `
        <g class="phase8-window">
          <rect x="${formatNumber(x)}" y="${formatNumber(headY)}" width="${formatNumber(
            widthPx,
          )}" height="${formatNumber(heightPx)}" fill="${theme.paper}" stroke="${theme.line}" stroke-width="1.45" />
          <line x1="${formatNumber(x)}" y1="${formatNumber(
            sillY,
          )}" x2="${formatNumber(x + widthPx)}" y2="${formatNumber(
            sillY,
          )}" stroke="${theme.lineMuted}" stroke-width="1.05" />
          <line x1="${formatNumber(x)}" y1="${formatNumber(
            headY,
          )}" x2="${formatNumber(x + widthPx)}" y2="${formatNumber(
            headY,
          )}" stroke="${theme.lineMuted}" stroke-width="1.05" />
          <line x1="${formatNumber(x + widthPx / 2)}" y1="${formatNumber(
            headY + 2,
          )}" x2="${formatNumber(x + widthPx / 2)}" y2="${formatNumber(
            sillY - 2,
          )}" stroke="${theme.lineLight}" stroke-width="1" />
        </g>
      `;
    })
    .join("");

  const doorMarkup = [...(sideFacade.projectedDoors || [])]
    .sort(
      (left, right) => Number(left.center_m || 0) - Number(right.center_m || 0),
    )
    .map((door) => {
      const level = levelProfiles.find((entry) => entry.id === door.levelId);
      if (!level) return "";
      const widthPx = Math.max(24, Number(door.width_m || 1.1) * scale);
      const x = baseX + Number(door.center_m || 0) * scale - widthPx / 2;
      const headY = projectY(level, door.head_height_m || 2.2);
      const heightPx = Math.max(26, baseY - headY);
      return `
        <g class="phase8-door">
          <rect x="${formatNumber(x)}" y="${formatNumber(headY)}" width="${formatNumber(
            widthPx,
          )}" height="${formatNumber(heightPx)}" fill="${theme.paper}" stroke="${theme.line}" stroke-width="1.6" />
          <line x1="${formatNumber(x)}" y1="${formatNumber(
            headY,
          )}" x2="${formatNumber(x + widthPx)}" y2="${formatNumber(
            headY,
          )}" stroke="${theme.lineMuted}" stroke-width="1.05" />
        </g>
      `;
    })
    .join("");

  return {
    markup: `<g id="phase9-elevation-openings">${windowMarkup}${doorMarkup}</g>`,
    windowCount: (sideFacade.projectedWindows || []).length,
    doorCount: (sideFacade.projectedDoors || []).length,
  };
}

function renderRhythmGuides(
  facadeOrientation = {},
  baseX = 0,
  baseY = 0,
  widthPx = 0,
  heightPx = 0,
  theme,
) {
  const bays = facadeOrientation?.components?.bays || [];
  const guides = bays
    .map((_, index) => {
      const x = baseX + ((index + 1) * widthPx) / Math.max(bays.length + 1, 2);
      return `<line x1="${formatNumber(x)}" y1="${formatNumber(
        baseY - heightPx,
      )}" x2="${formatNumber(x)}" y2="${formatNumber(
        baseY,
      )}" stroke="${theme.guide}" stroke-width="0.95" stroke-dasharray="4 5" />`;
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
  theme,
) {
  const zones = facadeOrientation?.material_zones || [];
  if (!zones.length) {
    return {
      markup: `<rect x="${formatNumber(baseX)}" y="${formatNumber(
        baseY - heightPx,
      )}" width="${formatNumber(widthPx)}" height="${formatNumber(
        heightPx,
      )}" fill="url(#${getPatternId(
        palette.primary?.hatch,
      )})" stroke="${theme.line}" stroke-width="2" />`,
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
      return `<rect x="${formatNumber(baseX)}" y="${formatNumber(
        y,
      )}" width="${formatNumber(widthPx)}" height="${formatNumber(
        bandHeight,
      )}" fill="url(#${getPatternId(materialKey)})" />`;
    })
    .join("");

  return {
    markup: `
      <g id="phase8-elevation-material-zones">
        ${markup}
        <rect x="${formatNumber(baseX)}" y="${formatNumber(
          baseY - heightPx,
        )}" width="${formatNumber(widthPx)}" height="${formatNumber(
          heightPx,
        )}" fill="none" stroke="${theme.line}" stroke-width="2" />
      </g>
    `,
    count: zones.length,
  };
}

function renderFacadeFeatures(
  featureTypes = [],
  levelProfiles = [],
  baseX = 0,
  baseY = 0,
  widthPx = 0,
  scale = 1,
  theme,
) {
  const features = [
    ...new Set(
      (featureTypes || []).map((entry) => String(entry || "").toLowerCase()),
    ),
  ];
  const upperLevel = levelProfiles[levelProfiles.length - 1] || null;
  const firstUpperLevel =
    levelProfiles.find((entry) => Number(entry.level_number || 0) >= 1) ||
    upperLevel;
  const markup = [];

  if (features.some((entry) => entry.includes("balcony")) && firstUpperLevel) {
    const y = baseY - (firstUpperLevel.bottom_m + 1.1) * scale;
    markup.push(`
      <g id="phase8-feature-balcony">
        <line x1="${formatNumber(baseX + widthPx * 0.56)}" y1="${formatNumber(
          y,
        )}" x2="${formatNumber(baseX + widthPx * 0.84)}" y2="${formatNumber(
          y,
        )}" stroke="${theme.line}" stroke-width="1.8" />
        <line x1="${formatNumber(baseX + widthPx * 0.58)}" y1="${formatNumber(
          y,
        )}" x2="${formatNumber(baseX + widthPx * 0.58)}" y2="${formatNumber(
          y + 16,
        )}" stroke="${theme.lineMuted}" stroke-width="1" />
        <line x1="${formatNumber(baseX + widthPx * 0.7)}" y1="${formatNumber(
          y,
        )}" x2="${formatNumber(baseX + widthPx * 0.7)}" y2="${formatNumber(
          y + 16,
        )}" stroke="${theme.lineMuted}" stroke-width="1" />
        <line x1="${formatNumber(baseX + widthPx * 0.82)}" y1="${formatNumber(
          y,
        )}" x2="${formatNumber(baseX + widthPx * 0.82)}" y2="${formatNumber(
          y + 16,
        )}" stroke="${theme.lineMuted}" stroke-width="1" />
      </g>
    `);
  }

  if (features.some((entry) => entry.includes("porch"))) {
    markup.push(`
      <g id="phase8-feature-porch">
        <rect x="${formatNumber(baseX + widthPx * 0.12)}" y="${formatNumber(
          baseY - 40,
        )}" width="${formatNumber(widthPx * 0.18)}" height="40" fill="none" stroke="${theme.lineMuted}" stroke-width="1.2" />
        <line x1="${formatNumber(baseX + widthPx * 0.11)}" y1="${formatNumber(
          baseY - 40,
        )}" x2="${formatNumber(baseX + widthPx * 0.31)}" y2="${formatNumber(
          baseY - 40,
        )}" stroke="${theme.line}" stroke-width="1.5" />
      </g>
    `);
  }

  if (features.some((entry) => entry.includes("chimney"))) {
    markup.push(`
      <g id="phase8-feature-chimney">
        <rect x="${formatNumber(baseX + widthPx * 0.72)}" y="${formatNumber(
          baseY -
            levelProfiles.reduce(
              (sum, level) => sum + Number(level.height_m || 3.2),
              0,
            ) *
              scale -
            42,
        )}" width="16" height="42" fill="${theme.fillSoft}" stroke="${theme.line}" stroke-width="1.2" />
      </g>
    `);
  }

  if (features.some((entry) => entry.includes("dormer"))) {
    const roofY =
      baseY -
      levelProfiles.reduce(
        (sum, level) => sum + Number(level.height_m || 3.2),
        0,
      ) *
        scale;
    markup.push(`
      <g id="phase8-feature-dormer">
        <rect x="${formatNumber(baseX + widthPx * 0.42)}" y="${formatNumber(
          roofY - 24,
        )}" width="42" height="22" fill="${theme.paper}" stroke="${theme.line}" stroke-width="1.2" />
        <path d="M ${formatNumber(baseX + widthPx * 0.42)} ${formatNumber(
          roofY - 24,
        )} L ${formatNumber(baseX + widthPx * 0.42 + 21)} ${formatNumber(
          roofY - 38,
        )} L ${formatNumber(baseX + widthPx * 0.42 + 42)} ${formatNumber(
          roofY - 24,
        )}" fill="none" stroke="${theme.line}" stroke-width="1.2" />
      </g>
    `);
  }

  return {
    markup: `<g id="phase8-elevation-features">${markup.join("")}</g>`,
    count: markup.length,
  };
}

function renderGroundLine(baseX, baseY, widthPx, theme) {
  return `
    <g id="phase8-ground-line">
      <rect x="${formatNumber(baseX - 18)}" y="${formatNumber(
        baseY,
      )}" width="${formatNumber(widthPx + 36)}" height="24" fill="url(#phase8-elev-ground)" />
      <line x1="${formatNumber(baseX - 22)}" y1="${formatNumber(
        baseY,
      )}" x2="${formatNumber(baseX + widthPx + 22)}" y2="${formatNumber(
        baseY,
      )}" stroke="${theme.line}" stroke-width="1.8" />
    </g>
  `;
}

function renderOverallDimensions(
  metrics = {},
  baseX = 0,
  baseY = 0,
  widthPx = 0,
  heightPx = 0,
  layout = {},
  width = 0,
  theme,
) {
  const topY = layout.top - 14;
  const rightX = width - layout.right + 24;
  return `
    <g id="phase8-elevation-dimensions">
      <line x1="${formatNumber(baseX)}" y1="${formatNumber(
        baseY - heightPx,
      )}" x2="${formatNumber(baseX)}" y2="${formatNumber(
        topY,
      )}" stroke="${theme.lineMuted}" stroke-width="0.9"/>
      <line x1="${formatNumber(baseX + widthPx)}" y1="${formatNumber(
        baseY - heightPx,
      )}" x2="${formatNumber(baseX + widthPx)}" y2="${formatNumber(
        topY,
      )}" stroke="${theme.lineMuted}" stroke-width="0.9"/>
      <line x1="${formatNumber(baseX)}" y1="${formatNumber(
        topY,
      )}" x2="${formatNumber(baseX + widthPx)}" y2="${formatNumber(
        topY,
      )}" stroke="${theme.line}" stroke-width="1"/>
      <line x1="${formatNumber(baseX)}" y1="${formatNumber(
        topY - 3,
      )}" x2="${formatNumber(baseX)}" y2="${formatNumber(
        topY + 3,
      )}" stroke="${theme.line}" stroke-width="1"/>
      <line x1="${formatNumber(baseX + widthPx)}" y1="${formatNumber(
        topY - 3,
      )}" x2="${formatNumber(baseX + widthPx)}" y2="${formatNumber(
        topY + 3,
      )}" stroke="${theme.line}" stroke-width="1"/>
      <text x="${formatNumber(baseX + widthPx / 2)}" y="${formatNumber(
        topY - 6,
      )}" font-size="10" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle">${escapeXml(
        formatMeters(metrics.width_m),
      )}</text>

      <line x1="${formatNumber(baseX + widthPx)}" y1="${formatNumber(
        baseY - heightPx,
      )}" x2="${formatNumber(rightX)}" y2="${formatNumber(
        baseY - heightPx,
      )}" stroke="${theme.lineMuted}" stroke-width="0.9"/>
      <line x1="${formatNumber(baseX + widthPx)}" y1="${formatNumber(
        baseY,
      )}" x2="${formatNumber(rightX)}" y2="${formatNumber(
        baseY,
      )}" stroke="${theme.lineMuted}" stroke-width="0.9"/>
      <line x1="${formatNumber(rightX)}" y1="${formatNumber(
        baseY - heightPx,
      )}" x2="${formatNumber(rightX)}" y2="${formatNumber(
        baseY,
      )}" stroke="${theme.line}" stroke-width="1"/>
      <line x1="${formatNumber(rightX - 3)}" y1="${formatNumber(
        baseY - heightPx,
      )}" x2="${formatNumber(rightX + 3)}" y2="${formatNumber(
        baseY - heightPx,
      )}" stroke="${theme.line}" stroke-width="1"/>
      <line x1="${formatNumber(rightX - 3)}" y1="${formatNumber(
        baseY,
      )}" x2="${formatNumber(rightX + 3)}" y2="${formatNumber(
        baseY,
      )}" stroke="${theme.line}" stroke-width="1"/>
      <text x="${formatNumber(rightX + 14)}" y="${formatNumber(
        baseY - heightPx / 2,
      )}" font-size="10" font-family="Arial, sans-serif" font-weight="700" transform="rotate(90 ${formatNumber(
        rightX + 14,
      )} ${formatNumber(baseY - heightPx / 2)})" text-anchor="middle">${escapeXml(
        formatMeters(metrics.total_height_m),
      )}</text>
    </g>
  `;
}

function renderScaleBar(scalePxPerMeter, width, height, layout, theme) {
  const barMeters = chooseScaleBarMeters(scalePxPerMeter);
  const barWidthPx = barMeters * scalePxPerMeter;
  const x = width - layout.right - barWidthPx - 8;
  const y = height - layout.bottom + 44;
  return {
    barMeters,
    markup: `
      <g id="blueprint-scale-bar">
        <line x1="${formatNumber(x)}" y1="${formatNumber(
          y,
        )}" x2="${formatNumber(x + barWidthPx)}" y2="${formatNumber(
          y,
        )}" stroke="${theme.line}" stroke-width="1.6"/>
        <line x1="${formatNumber(x)}" y1="${formatNumber(
          y - 4,
        )}" x2="${formatNumber(x)}" y2="${formatNumber(
          y + 4,
        )}" stroke="${theme.line}" stroke-width="1.6"/>
        <line x1="${formatNumber(x + barWidthPx / 2)}" y1="${formatNumber(
          y - 4,
        )}" x2="${formatNumber(x + barWidthPx / 2)}" y2="${formatNumber(
          y + 4,
        )}" stroke="${theme.line}" stroke-width="1.6"/>
        <line x1="${formatNumber(x + barWidthPx)}" y1="${formatNumber(
          y - 4,
        )}" x2="${formatNumber(x + barWidthPx)}" y2="${formatNumber(
          y + 4,
        )}" stroke="${theme.line}" stroke-width="1.6"/>
        <text x="${formatNumber(x + barWidthPx / 2)}" y="${formatNumber(
          y + 16,
        )}" font-size="10" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(
          `${barMeters} m`,
        )}</text>
      </g>
    `,
  };
}

function renderTitleBlock(
  orientation,
  width,
  height,
  layout,
  theme,
  metadata = {},
) {
  const x = layout.left;
  const y = height - layout.bottom + 16;
  return `
    <g id="phase7-elevation-title-block">
      <rect x="${formatNumber(x)}" y="${formatNumber(
        y,
      )}" width="328" height="46" fill="${theme.paper}" stroke="${theme.line}" stroke-width="1.1"/>
      <text x="${formatNumber(x + 12)}" y="${formatNumber(
        y + 17,
      )}" font-size="14" font-family="Arial, sans-serif" font-weight="700" class="sheet-critical-label" data-text-role="critical">${escapeXml(
        `ELEVATION - ${String(orientation || "south").toUpperCase()}`,
      )}</text>
      <text x="${formatNumber(x + 12)}" y="${formatNumber(
        y + 34,
      )}" font-size="10" font-family="Arial, sans-serif" class="sheet-critical-label" data-text-role="critical">${escapeXml(
        `Bounds ${metadata.boundsSource || "building_derived"} · ${Math.round(
          Number(metadata.slotOccupancyRatio || 0) * 100,
        )}% slot occupancy`,
      )}</text>
    </g>
  `;
}

export function renderElevationSvg(
  geometryInput = {},
  styleDNA = {},
  options = {},
) {
  const rawGeometry = resolveCompiledProjectGeometryInput(geometryInput);
  const geometry = coerceToCanonicalProjectGeometry(rawGeometry);
  const resolvedStyleDNA =
    styleDNA && Object.keys(styleDNA).length
      ? styleDNA
      : resolveCompiledProjectStyleDNA(geometryInput, styleDNA);
  const theme = getBlueprintTheme();
  const orientation = orientationToSide(options.orientation || "south");
  const sideFacade = extractSideFacade(geometry, resolvedStyleDNA, {
    ...options,
    orientation,
  });
  const facadeOrientation = sideFacade.facadeOrientation || {};
  const envelope = getEnvelopeDrawingBoundsWithSource(geometry);
  const levelProfiles = sideFacade.levelProfiles || getLevelProfiles(geometry);
  const metrics = metricsFromBounds(
    envelope.bounds,
    orientation,
    levelProfiles,
  );
  const width = options.width || 1200;
  const height = options.height || 760;
  const sheetMode = options.sheetMode === true;
  const layout = sheetMode
    ? { left: 34, top: 18, right: 38, bottom: 82 }
    : { left: 80, top: 62, right: 94, bottom: 118 };
  const availableWidth = Math.max(1, width - layout.left - layout.right);
  const availableHeight = Math.max(1, height - layout.top - layout.bottom);
  const scale = Math.min(
    availableWidth / Math.max(metrics.width_m, 1),
    availableHeight /
      Math.max(metrics.total_height_m + (sheetMode ? 0.72 : 1.2), 1),
  );
  const widthPx = metrics.width_m * scale;
  const heightPx = metrics.total_height_m * scale;
  const baseX = layout.left + (availableWidth - widthPx) / 2;
  const baseY = layout.top + heightPx;
  const roofLanguage = normalizeRoofLanguage(
    resolvedStyleDNA,
    facadeOrientation,
    geometry,
  );
  const palette = getCanonicalMaterialPalette({
    dna: resolvedStyleDNA,
    projectGeometry: geometry,
    facadeGrammar:
      options.facadeGrammar || geometry.metadata?.facade_grammar || null,
  });
  const materialZones = renderMaterialZones(
    facadeOrientation,
    palette,
    baseX,
    baseY,
    widthPx,
    heightPx,
    theme,
  );
  const datums = renderLevelDatums(
    baseX,
    baseY,
    widthPx,
    levelProfiles,
    scale,
    theme,
  );
  const openings = renderProjectedOpenings(
    sideFacade,
    baseX,
    baseY,
    scale,
    theme,
  );
  const rhythm = renderRhythmGuides(
    facadeOrientation,
    baseX,
    baseY,
    widthPx,
    heightPx,
    theme,
  );
  const features = [
    ...new Set(
      (sideFacade.features || []).map((entry) =>
        String(entry?.type || entry || "").toLowerCase(),
      ),
    ),
  ];
  const featureMarkup = renderFacadeFeatures(
    features,
    levelProfiles,
    baseX,
    baseY,
    widthPx,
    scale,
    theme,
  );
  const roof = renderRoof(
    baseX,
    baseY - heightPx,
    widthPx,
    roofLanguage,
    theme,
  );
  const hasEnvelopeGeometry = metrics.width_m > 0 && levelProfiles.length > 0;
  const explicitExteriorWallCount = (geometry.walls || []).filter(
    (wall) => wall.exterior,
  ).length;
  const openingSignalCount =
    (geometry.windows || []).length + (geometry.doors || []).length;
  const minimalEnvelopeFallback =
    hasEnvelopeGeometry &&
    levelProfiles.length <= 1 &&
    explicitExteriorWallCount === 0 &&
    openingSignalCount === 0;
  const geometryComplete =
    hasEnvelopeGeometry &&
    (sideFacade.blockingReasons.length === 0 || minimalEnvelopeFallback);
  const geometrySource = sideFacade.geometrySource || envelope.source;
  const facadeMaterialSignalCount =
    facadeOrientation?.material_zones?.length || 0;
  const facadeRhythmSignalCount =
    facadeOrientation?.components?.bays?.length || 0;
  const elevationReadableInputs =
    openings.windowCount + openings.doorCount + featureMarkup.count > 0 ||
    facadeRhythmSignalCount > 0 ||
    facadeMaterialSignalCount > 0 ||
    sideFacade.geometrySource === "explicit_side_walls" ||
    minimalEnvelopeFallback;
  const elevationSemantics = assessElevationSemantics(sideFacade, palette);
  const facadeRichnessScore = roundMetric(
    clamp(
      Math.max(
        Number(sideFacade.richnessScore || 0),
        (openings.windowCount > 0 ? 0.26 : 0.1) +
          (materialZones.count > 0 ? 0.14 : 0.04) +
          (rhythm.count > 0 ? 0.1 : 0.04) +
          (datums.count > 1 ? 0.14 : 0.06) +
          (featureMarkup.count > 0 ? 0.12 : 0.04) +
          (String(roofLanguage).length > 0 ? 0.1 : 0.04) +
          (openings.doorCount > 0 ? 0.05 : 0),
      ),
      0,
      1,
    ),
  );
  const allowWeakFacadeFallback = options.allowWeakFacadeFallback === true;
  const slotOccupancyRatio = Number(
    clamp(
      (widthPx * heightPx) / Math.max(availableWidth * availableHeight, 1),
      0,
      1,
    ).toFixed(3),
  );

  if (
    isFeatureEnabled("useElevationRendererUpgradePhase8") &&
    (!geometryComplete ||
      !elevationReadableInputs ||
      elevationSemantics.status === "block") &&
    !allowWeakFacadeFallback &&
    !minimalEnvelopeFallback
  ) {
    return {
      svg: null,
      orientation,
      window_count: openings.windowCount,
      renderer: "deterministic-elevation-svg",
      title: `Elevation - ${orientation}`,
      status: "blocked",
      blocking_reasons: [
        ...new Set([
          ...sideFacade.blockingReasons,
          ...(elevationSemantics.blockers || []),
          !geometryComplete
            ? `Elevation ${orientation} cannot be rendered credibly because canonical side envelope geometry is missing.`
            : `Elevation ${orientation} lacks enough canonical facade data to support a readable technical panel.`,
        ]),
      ],
      technical_quality_metadata: {
        drawing_type: "elevation",
        geometry_complete: false,
        geometry_source: geometrySource,
        bounds_source: envelope.source,
        window_count: openings.windowCount,
        door_count: openings.doorCount,
        level_label_count: levelProfiles.length,
        material_zone_count: materialZones.count,
        bay_count: rhythm.count,
        feature_count: featureMarkup.count,
        facade_richness_score: facadeRichnessScore,
        side_facade_score: sideFacade.richnessScore,
        side_facade_status: sideFacade.status,
        opening_group_count: sideFacade.openingGroups?.length || 0,
        wall_zone_count: sideFacade.wallZones?.length || 0,
        roof_edge_count: sideFacade.roofEdges?.length || 0,
        feature_family_count: sideFacade.featureFamilies?.length || 0,
        side_facade_summary: sideFacade.sideSummary || null,
        side_facade_schema_quality:
          sideFacade.sideFacadeSchema?.evidenceSummary
            ?.schemaCredibilityQuality || "provisional",
        elevation_semantic_status: elevationSemantics.status,
        explicit_side_coverage_ratio: sideFacade.explicitCoverageRatio,
        uses_canonical_material_palette: true,
        roof_language: roofLanguage,
        facade_features: features,
        blueprint_theme: theme.name,
      },
    };
  }

  const scaleBar = renderScaleBar(scale, width, height, layout, theme);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-theme="${theme.name}" data-bounds-source="${envelope.source}">
  ${buildMaterialPatternDefs(theme)}
  <rect width="${width}" height="${height}" fill="${theme.paper}" />
  ${
    sheetMode
      ? ""
      : `<text x="${layout.left}" y="32" font-size="19" font-family="Arial, sans-serif" font-weight="700">${escapeXml(
          `Elevation - ${orientation.toUpperCase()}`,
        )}</text>`
  }
  ${renderGroundLine(baseX, baseY, widthPx, theme)}
  ${roof}
  ${materialZones.markup}
  ${rhythm.markup}
  ${datums.markup}
  ${openings.markup}
  ${featureMarkup.markup}
  ${renderOverallDimensions(
    metrics,
    baseX,
    baseY,
    widthPx,
    heightPx,
    layout,
    width,
    theme,
  )}
  ${renderTitleBlock(orientation, width, height, layout, theme, {
    boundsSource: envelope.source,
    slotOccupancyRatio,
  })}
  ${scaleBar.markup}
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
      has_title_block: true,
      has_scale_bar: true,
      has_overall_dimensions: true,
      geometry_complete: allowWeakFacadeFallback
        ? hasEnvelopeGeometry
        : geometryComplete,
      geometry_source: geometrySource,
      bounds_source: envelope.source,
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
      side_facade_score: sideFacade.richnessScore,
      side_facade_status: sideFacade.status,
      opening_group_count: sideFacade.openingGroups?.length || 0,
      wall_zone_count: sideFacade.wallZones?.length || 0,
      roof_edge_count: sideFacade.roofEdges?.length || 0,
      feature_family_count: sideFacade.featureFamilies?.length || 0,
      side_facade_summary: sideFacade.sideSummary || null,
      side_facade_schema_quality:
        sideFacade.sideFacadeSchema?.evidenceSummary
          ?.schemaCredibilityQuality || "provisional",
      elevation_semantic_status: elevationSemantics.status,
      elevation_semantic_score: elevationSemantics.scores?.readability || null,
      explicit_side_coverage_ratio: sideFacade.explicitCoverageRatio,
      uses_canonical_material_palette: true,
      roof_language: roofLanguage,
      facade_features: features,
      opening_rhythm_count:
        facadeOrientation?.opening_rhythm?.opening_count ||
        openings.windowCount,
      blueprint_theme: theme.name,
      slot_occupancy_ratio: slotOccupancyRatio,
      scale_bar_meters: scaleBar.barMeters,
    },
  };
}

export default {
  renderElevationSvg,
};

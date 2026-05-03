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
import { buildCanonicalRoofPitchInfo } from "./roofPitchResolver.js";

const SHEET_ELEVATION_POLISH = Object.freeze({
  fontScale: 1.1,
  strokeScale: 1.12,
});

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

function resolveElevationPolish(sheetMode = false) {
  return sheetMode ? SHEET_ELEVATION_POLISH : { fontScale: 1, strokeScale: 1 };
}

function polishSize(value, scale = 1) {
  return formatNumber(Number(value || 0) * Number(scale || 1), 1);
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

function resolveElevationMetrics(
  bounds = {},
  orientation = "south",
  levelProfiles = [],
  sideFacade = {},
) {
  const fallback = metricsFromBounds(bounds, orientation, levelProfiles);
  const facadeWidth = Number(sideFacade?.metrics?.width_m || 0);
  const facadeHeight = Number(sideFacade?.metrics?.total_height_m || 0);
  return {
    width_m: facadeWidth > 0 ? facadeWidth : fallback.width_m,
    total_height_m: facadeHeight > 0 ? facadeHeight : fallback.total_height_m,
    level_count: Math.max(1, levelProfiles.length || fallback.level_count || 1),
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

function average(values = []) {
  const finiteValues = (values || [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!finiteValues.length) {
    return 0;
  }
  return (
    finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length
  );
}

function resolveFacadeZoneSpan(
  zone = {},
  index = 0,
  zoneCount = 1,
  widthM = 1,
) {
  const totalWidthM = Math.max(Number(widthM || 0), 1);
  const startM = Number(
    zone.start_m ?? zone.startM ?? zone.start ?? zone.offset_m,
  );
  const endM = Number(zone.end_m ?? zone.endM ?? zone.end ?? zone.span_end_m);
  if (Number.isFinite(startM) && Number.isFinite(endM) && endM > startM) {
    return {
      startM: clamp(startM, 0, totalWidthM),
      endM: clamp(endM, 0, totalWidthM),
    };
  }
  return {
    startM: (totalWidthM * index) / Math.max(zoneCount, 1),
    endM: (totalWidthM * (index + 1)) / Math.max(zoneCount, 1),
  };
}

function resolveFacadeZoneLabel(zone = {}, palette = {}, index = 0) {
  const fallback =
    index === 0
      ? palette.primary?.name || "Primary facade"
      : palette.secondary?.name || "Secondary facade";
  return String(zone.material || zone.name || zone.type || fallback);
}

function renderRoofPitchLabel(
  baseX,
  ridgeY,
  widthPx,
  roofPitchInfo,
  theme,
  polish = {},
) {
  const numericPitch = Number(roofPitchInfo?.pitchDeg);
  if (!Number.isFinite(numericPitch) || numericPitch <= 0) {
    return "";
  }
  const labelFont = polishSize(8, polish.fontScale || 1);
  const cx = baseX + widthPx / 2 + 28;
  const cy = ridgeY + 16;
  return `
    <g id="phase14-elevation-roof-pitch" data-roof-pitch-deg="${numericPitch.toFixed(1)}" data-roof-pitch-source="${escapeXml(roofPitchInfo.source || "unknown")}" data-roof-span-m="${formatNumber(roofPitchInfo.spanM, 2)}" data-roof-rise-m="${formatNumber(roofPitchInfo.riseM, 2)}">
      <text x="${formatNumber(cx)}" y="${formatNumber(cy)}" font-size="${labelFont}" font-family="Arial, sans-serif" font-weight="700" fill="${theme.line}" data-text-role="roof-pitch">PITCH ${numericPitch.toFixed(0)}°</text>
    </g>
  `;
}

function renderRoofPitchDataAttributes(roofPitchInfo = {}) {
  const attrs = [
    `data-roof-pitch-status="${escapeXml(roofPitchInfo.status || "missing")}"`,
  ];
  if (roofPitchInfo.source) {
    attrs.push(`data-roof-pitch-source="${escapeXml(roofPitchInfo.source)}"`);
  }
  if (
    roofPitchInfo.pitchDeg != null &&
    Number.isFinite(Number(roofPitchInfo.pitchDeg)) &&
    Number(roofPitchInfo.pitchDeg) > 0
  ) {
    attrs.push(
      `data-roof-pitch-deg="${Number(roofPitchInfo.pitchDeg).toFixed(1)}"`,
    );
  }
  if (Number.isFinite(Number(roofPitchInfo.spanM))) {
    attrs.push(`data-roof-span-m="${formatNumber(roofPitchInfo.spanM, 2)}"`);
  }
  if (Number.isFinite(Number(roofPitchInfo.riseM))) {
    attrs.push(`data-roof-rise-m="${formatNumber(roofPitchInfo.riseM, 2)}"`);
  }
  return attrs.join(" ");
}

function renderRoof(
  baseX,
  topY,
  widthPx,
  roofLanguage,
  theme,
  roofPitchInfo = {},
  polish = {},
) {
  const flatRoof =
    roofLanguage.includes("flat") || roofLanguage.includes("parapet");
  if (flatRoof) {
    return `
      <g id="phase14-section-roof" ${renderRoofPitchDataAttributes({
        ...roofPitchInfo,
        status: "flat",
        pitchDeg: null,
        riseM: null,
      })}>
        <rect x="${formatNumber(baseX)}" y="${formatNumber(
          topY - 18,
        )}" width="${formatNumber(widthPx)}" height="4" fill="${theme.paper}" stroke="${theme.line}" stroke-width="1.2" />
        <rect x="${formatNumber(baseX)}" y="${formatNumber(
          topY - 14,
        )}" width="${formatNumber(widthPx)}" height="14" fill="url(#phase8-elev-roof)" stroke="${theme.line}" stroke-width="1.8" />
        <line x1="${formatNumber(baseX)}" y1="${formatNumber(
          topY - 14,
        )}" x2="${formatNumber(baseX + widthPx)}" y2="${formatNumber(
          topY - 14,
        )}" stroke="${theme.line}" stroke-width="2.3" />
        <line x1="${formatNumber(baseX + 4)}" y1="${formatNumber(
          topY - 6,
        )}" x2="${formatNumber(baseX + widthPx - 4)}" y2="${formatNumber(
          topY - 6,
        )}" stroke="${theme.lineLight}" stroke-width="0.95" />
      </g>
    `;
  }

  const resolvedRisePx =
    Number.isFinite(Number(roofPitchInfo?.risePx)) &&
    Number(roofPitchInfo.risePx) > 0
      ? Number(roofPitchInfo.risePx)
      : Math.max(46, Math.min(58, widthPx * 0.14));
  const ridgeY = topY - resolvedRisePx;
  const undersideY = ridgeY + 12;
  const pitchLabel = renderRoofPitchLabel(
    baseX,
    ridgeY,
    widthPx,
    roofPitchInfo,
    theme,
    polish,
  );
  return `
    <g id="phase14-section-roof" ${renderRoofPitchDataAttributes(roofPitchInfo)}>
      <path d="M ${formatNumber(baseX - 6)} ${formatNumber(
        topY,
      )} L ${formatNumber(baseX + widthPx / 2)} ${formatNumber(
        ridgeY,
      )} L ${formatNumber(baseX + widthPx + 6)} ${formatNumber(
        topY,
      )} L ${formatNumber(baseX + widthPx - 10)} ${formatNumber(
        topY,
      )} L ${formatNumber(baseX + widthPx / 2)} ${formatNumber(
        undersideY,
      )} L ${formatNumber(baseX + 10)} ${formatNumber(
        topY,
      )} Z" fill="url(#phase8-elev-roof)" stroke="none" />
      <path d="M ${formatNumber(baseX)} ${formatNumber(topY)} L ${formatNumber(
        baseX + widthPx / 2,
      )} ${formatNumber(ridgeY)} L ${formatNumber(
        baseX + widthPx,
      )} ${formatNumber(topY)}" fill="url(#phase8-elev-roof)" stroke="${theme.line}" stroke-width="2.3" />
      <path d="M ${formatNumber(baseX + 10)} ${formatNumber(
        topY,
      )} L ${formatNumber(baseX + widthPx / 2)} ${formatNumber(
        undersideY,
      )} L ${formatNumber(baseX + widthPx - 10)} ${formatNumber(
        topY,
      )}" fill="none" stroke="${theme.lineMuted}" stroke-width="1.25" />
      <line x1="${formatNumber(baseX + widthPx / 2)}" y1="${formatNumber(
        ridgeY,
      )}" x2="${formatNumber(baseX + widthPx / 2)}" y2="${formatNumber(
        ridgeY + 10,
      )}" stroke="${theme.line}" stroke-width="1.05" />
      <line x1="${formatNumber(baseX + 8)}" y1="${formatNumber(
        topY - 6,
      )}" x2="${formatNumber(baseX + widthPx - 8)}" y2="${formatNumber(
        topY - 6,
      )}" stroke="${theme.lineLight}" stroke-width="1" stroke-dasharray="5 3" />
    </g>
    ${pitchLabel}
  `;
}

// Phase 3 — friendly RIBA-style stage names for elevation level datums.
// Maps level_number / level.name to a short uppercase suffix used in the
// "FFL <STAGE> +X.XXm" datum labels along the elevation's left edge.
const FLOOR_STAGE_NAMES = Object.freeze([
  "GROUND",
  "FIRST",
  "SECOND",
  "THIRD",
  "FOURTH",
  "FIFTH",
  "SIXTH",
  "SEVENTH",
  "EIGHTH",
]);

function resolveFloorStageLabel(level) {
  if (level && typeof level.name === "string" && level.name.trim()) {
    const cleaned = level.name.replace(/\b(floor|level|storey|story)\b/gi, "");
    const trimmed = cleaned.replace(/\s+/g, " ").trim();
    if (trimmed) return trimmed.toUpperCase();
  }
  const n = Number(level?.level_number);
  if (Number.isFinite(n) && n >= 0 && n < FLOOR_STAGE_NAMES.length) {
    return FLOOR_STAGE_NAMES[n];
  }
  return Number.isFinite(n) ? `L${n}` : "FFL";
}

function renderLevelDatums(
  baseX,
  baseY,
  widthPx,
  levelProfiles,
  scale,
  theme,
  polish = {},
  ridgeInfo = null,
) {
  const lines = [];
  const labels = [];
  const fontScale = polish.fontScale || 1;
  const strokeScale = polish.strokeScale || 1;
  const datumStroke = polishSize(1.1, strokeScale);
  const guideStroke = polishSize(1, strokeScale);
  const primaryLabelFont = polishSize(9, fontScale);
  const secondaryLabelFont = polishSize(8, fontScale);
  // Phase 3 — render datums starting from the ground (FFL GROUND +0.00m) and
  // labelled with a friendly RIBA-style stage name ("FFL FIRST +3.20m" etc.)
  // instead of the bare level identifier. The ground datum is emitted last so
  // it sits on top of the level lines visually.
  levelProfiles.forEach((level, index) => {
    const topY = baseY - level.top_m * scale;
    const midY =
      baseY - (level.bottom_m + Number(level.height_m || 3.2) / 2) * scale;
    const stage = resolveFloorStageLabel(level);
    lines.push(
      `<line x1="${formatNumber(baseX)}" y1="${formatNumber(
        topY,
      )}" x2="${formatNumber(baseX + widthPx)}" y2="${formatNumber(
        topY,
      )}" stroke="${theme.lineMuted}" stroke-width="${datumStroke}" />`,
    );
    // The "top of level N" line marks the FFL of level N+1. Use the next
    // level's stage label so the datum reads naturally (e.g. the top of the
    // ground floor is the FFL of the first floor).
    const datumStage =
      index + 1 < levelProfiles.length
        ? resolveFloorStageLabel(levelProfiles[index + 1])
        : "ROOF";
    labels.push(`
      <line x1="${formatNumber(baseX - 46)}" y1="${formatNumber(
        topY,
      )}" x2="${formatNumber(baseX - 6)}" y2="${formatNumber(
        topY,
      )}" stroke="${theme.lineMuted}" stroke-width="${guideStroke}" />
      <text x="${formatNumber(baseX - 52)}" y="${formatNumber(
        topY + 4,
      )}" font-size="${primaryLabelFont}" font-family="Arial, sans-serif" font-weight="700" text-anchor="end" data-datum-role="ffl">${escapeXml(
        `FFL ${datumStage} +${level.top_m.toFixed(2)}m`,
      )}</text>
      <text x="${formatNumber(baseX - 10)}" y="${formatNumber(
        midY,
      )}" font-size="${secondaryLabelFont}" font-family="Arial, sans-serif" text-anchor="end">${escapeXml(
        stage,
      )}</text>
    `);
  });

  // Ground line: explicitly labelled "FFL GROUND +0.00m" so reviewers can
  // read the datum without inferring the stage from the absence of a name.
  labels.push(`
    <line x1="${formatNumber(baseX - 46)}" y1="${formatNumber(
      baseY,
    )}" x2="${formatNumber(baseX - 6)}" y2="${formatNumber(
      baseY,
    )}" stroke="${theme.line}" stroke-width="${datumStroke}" />
    <text x="${formatNumber(baseX - 52)}" y="${formatNumber(
      baseY + 4,
    )}" font-size="${primaryLabelFont}" font-family="Arial, sans-serif" font-weight="700" text-anchor="end" data-datum-role="ffl-ground">FFL GROUND +0.00m</text>
  `);

  // Phase 3 — optional RIDGE datum. Caller passes `{ y, heightM }` when the
  // ridge height is known so the elevation matches the goal sheet's
  // "RIDGE +X.XXm" label band.
  let ridgeDatumCount = 0;
  if (
    ridgeInfo &&
    Number.isFinite(ridgeInfo.y) &&
    Number.isFinite(ridgeInfo.heightM)
  ) {
    const ridgeY = ridgeInfo.y;
    const ridgeFont = polishSize(9, fontScale);
    labels.push(`
      <line x1="${formatNumber(baseX - 46)}" y1="${formatNumber(
        ridgeY,
      )}" x2="${formatNumber(baseX - 6)}" y2="${formatNumber(
        ridgeY,
      )}" stroke="${theme.line}" stroke-width="${datumStroke}" />
      <text x="${formatNumber(baseX - 52)}" y="${formatNumber(
        ridgeY + 4,
      )}" font-size="${ridgeFont}" font-family="Arial, sans-serif" font-weight="700" text-anchor="end" data-datum-role="ridge">${escapeXml(
        `RIDGE +${ridgeInfo.heightM.toFixed(2)}m`,
      )}</text>
    `);
    ridgeDatumCount = 1;
  }

  return {
    markup: `<g id="phase8-elevation-datums">${lines.join("")}${labels.join("")}</g>`,
    count: levelProfiles.length + 1 + ridgeDatumCount,
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
      const jambInset = Math.min(6, widthPx * 0.16);
      const mullionMarkup =
        widthPx >= 44
          ? `<line x1="${formatNumber(x + widthPx / 2)}" y1="${formatNumber(
              headY + 2,
            )}" x2="${formatNumber(x + widthPx / 2)}" y2="${formatNumber(
              sillY - 2,
            )}" stroke="${theme.lineLight}" stroke-width="1" />`
          : "";
      return `
        <g class="phase8-window">
          <rect x="${formatNumber(x)}" y="${formatNumber(headY)}" width="${formatNumber(
            widthPx,
          )}" height="${formatNumber(heightPx)}" fill="${theme.paper}" stroke="${theme.line}" stroke-width="1.45" />
          <line x1="${formatNumber(x)}" y1="${formatNumber(
            headY,
          )}" x2="${formatNumber(x)}" y2="${formatNumber(
            sillY,
          )}" stroke="${theme.guide}" stroke-width="0.9" />
          <line x1="${formatNumber(x + widthPx)}" y1="${formatNumber(
            headY,
          )}" x2="${formatNumber(x + widthPx)}" y2="${formatNumber(
            sillY,
          )}" stroke="${theme.guide}" stroke-width="0.9" />
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
          <line x1="${formatNumber(x - 3)}" y1="${formatNumber(
            sillY + 1.5,
          )}" x2="${formatNumber(x + widthPx + 3)}" y2="${formatNumber(
            sillY + 1.5,
          )}" stroke="${theme.lineLight}" stroke-width="0.95" />
          <line x1="${formatNumber(x + jambInset)}" y1="${formatNumber(
            headY + 4,
          )}" x2="${formatNumber(x + widthPx - jambInset)}" y2="${formatNumber(
            headY + 4,
          )}" stroke="${theme.guide}" stroke-width="0.8" />
          ${mullionMarkup}
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
          )}" x2="${formatNumber(x)}" y2="${formatNumber(
            baseY,
          )}" stroke="${theme.guide}" stroke-width="0.9" />
          <line x1="${formatNumber(x + widthPx)}" y1="${formatNumber(
            headY,
          )}" x2="${formatNumber(x + widthPx)}" y2="${formatNumber(
            baseY,
          )}" stroke="${theme.guide}" stroke-width="0.9" />
          <line x1="${formatNumber(x)}" y1="${formatNumber(
            headY,
          )}" x2="${formatNumber(x + widthPx)}" y2="${formatNumber(
            headY,
          )}" stroke="${theme.lineMuted}" stroke-width="1.05" />
          <line x1="${formatNumber(x + 4)}" y1="${formatNumber(
            baseY - 2.5,
          )}" x2="${formatNumber(x + widthPx - 4)}" y2="${formatNumber(
            baseY - 2.5,
          )}" stroke="${theme.lineLight}" stroke-width="0.95" />
          <line x1="${formatNumber(x + widthPx / 2)}" y1="${formatNumber(
            headY + 3,
          )}" x2="${formatNumber(x + widthPx / 2)}" y2="${formatNumber(
            baseY - 3,
          )}" stroke="${theme.lineLight}" stroke-width="0.9" />
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
  sideFacade = {},
  baseX = 0,
  baseY = 0,
  widthPx = 0,
  heightPx = 0,
  scale = 1,
  theme,
) {
  const bays = facadeOrientation?.components?.bays || [];
  const guidePositions = bays.length
    ? Array.from(
        { length: bays.length },
        (_, index) =>
          baseX + ((index + 1) * widthPx) / Math.max(bays.length + 1, 2),
      )
    : [
        ...new Set(
          [
            ...(sideFacade.openingGroups || []).map((group) =>
              roundMetric(
                (Number(group.spanStartM || 0) + Number(group.spanEndM || 0)) /
                  2,
              ),
            ),
            ...(sideFacade.projectedOpenings || []).map((opening) =>
              roundMetric(opening.center_m || 0),
            ),
          ]
            .filter((entry) => Number.isFinite(entry))
            .sort((left, right) => left - right),
        ),
      ].map((centerM) => baseX + centerM * scale);
  const guides = guidePositions
    .map((x) => {
      return `<line x1="${formatNumber(x)}" y1="${formatNumber(
        baseY - heightPx,
      )}" x2="${formatNumber(x)}" y2="${formatNumber(
        baseY,
      )}" stroke="${theme.guide}" stroke-width="0.95" stroke-dasharray="4 5" />`;
    })
    .join("");

  return {
    markup: `<g id="phase8-elevation-rhythm">${guides}</g>`,
    count: guidePositions.length,
  };
}

function renderMaterialZones(
  sideFacade = {},
  facadeOrientation = {},
  palette = {},
  baseX = 0,
  baseY = 0,
  widthPx = 0,
  heightPx = 0,
  scale = 1,
  theme,
) {
  const facadeWidthM = Math.max(
    Number(sideFacade.metrics?.width_m || widthPx / Math.max(scale || 1, 1)),
    1,
  );
  const explicitZones =
    facadeOrientation?.material_zones?.length > 0
      ? facadeOrientation.material_zones
      : (sideFacade.wallZones || []).length > 0
        ? sideFacade.wallZones
        : [];
  const sourceZones = explicitZones.length
    ? explicitZones
    : [
        {
          material: palette.primary?.name || "Primary facade",
          start_m: 0,
          end_m: facadeWidthM,
        },
      ];
  const normalizedZones = sourceZones
    .map((zone, index) => ({
      raw: zone,
      ...resolveFacadeZoneSpan(zone, index, sourceZones.length, facadeWidthM),
      label: resolveFacadeZoneLabel(zone, palette, index),
    }))
    .filter((zone) => zone.endM > zone.startM)
    .sort((left, right) => left.startM - right.startM || left.endM - right.endM)
    .filter(
      (zone, index, zones) =>
        index === 0 ||
        Math.abs(zone.startM - zones[index - 1].startM) > 0.18 ||
        Math.abs(zone.endM - zones[index - 1].endM) > 0.18,
    );
  const markup = normalizedZones
    .map((zone, index) => {
      const x = baseX + zone.startM * scale;
      const zoneWidthPx = Math.max(16, (zone.endM - zone.startM) * scale);
      const materialKey = String(zone.label || "")
        .toLowerCase()
        .includes("secondary")
        ? palette.secondary?.hatch
        : String(zone.label || "")
              .toLowerCase()
              .includes("accent")
          ? palette.secondary?.hatch
          : palette.primary?.hatch;
      const labelText = escapeXml(String(zone.label || "").toUpperCase());
      const labelWidth = Math.min(
        zoneWidthPx - 12,
        Math.max(54, labelText.length * 5.2),
      );
      const labelX = x + zoneWidthPx / 2;
      return `
        <g class="phase8-elevation-material-zone" data-zone-index="${index}">
          <rect x="${formatNumber(x)}" y="${formatNumber(
            baseY - heightPx,
          )}" width="${formatNumber(zoneWidthPx)}" height="${formatNumber(
            heightPx,
          )}" fill="url(#${getPatternId(materialKey)})" fill-opacity="0.96" />
          <line x1="${formatNumber(x)}" y1="${formatNumber(
            baseY - heightPx,
          )}" x2="${formatNumber(x)}" y2="${formatNumber(
            baseY,
          )}" stroke="${theme.lineLight}" stroke-width="0.9" />
          ${
            zoneWidthPx >= 72
              ? `<rect x="${formatNumber(
                  labelX - labelWidth / 2,
                )}" y="${formatNumber(
                  baseY - 22,
                )}" width="${formatNumber(labelWidth)}" height="12" fill="${theme.paper}" fill-opacity="0.92" />
          <text x="${formatNumber(labelX)}" y="${formatNumber(
            baseY - 13,
          )}" font-size="8.5" font-family="Arial, sans-serif" text-anchor="middle">${labelText}</text>`
              : ""
          }
        </g>
      `;
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
    count: normalizedZones.length,
  };
}

function renderFacadeArticulation(
  sideFacade = {},
  baseX = 0,
  baseY = 0,
  widthPx = 0,
  heightPx = 0,
  scale = 1,
  theme,
) {
  const levelProfiles = sideFacade.levelProfiles || [];
  const openingGroups = sideFacade.openingGroups || [];
  const projectedOpenings = sideFacade.projectedOpenings || [];
  const wallZones = sideFacade.wallZones || [];
  const markup = [];
  let count = 0;
  const plinthY = baseY - Math.min(18, Math.max(12, heightPx * 0.12));
  markup.push(`
    <rect x="${formatNumber(baseX)}" y="${formatNumber(
      plinthY,
    )}" width="${formatNumber(widthPx)}" height="${formatNumber(
      Math.max(10, baseY - plinthY),
    )}" fill="${theme.fillSoft}" fill-opacity="0.2" />
    <line x1="${formatNumber(baseX)}" y1="${formatNumber(
      plinthY,
    )}" x2="${formatNumber(baseX + widthPx)}" y2="${formatNumber(
      plinthY,
    )}" stroke="${theme.line}" stroke-width="1.35" />
  `);
  count += 2;

  levelProfiles.slice(0, -1).forEach((level) => {
    const y = baseY - Number(level.top_m || 0) * scale;
    markup.push(
      `<line x1="${formatNumber(baseX)}" y1="${formatNumber(
        y,
      )}" x2="${formatNumber(baseX + widthPx)}" y2="${formatNumber(
        y,
      )}" stroke="${theme.lineLight}" stroke-width="0.95" />`,
    );
    count += 1;
  });

  const boundaryPositions = [
    ...wallZones.flatMap((zone) => [Number(zone.startM), Number(zone.endM)]),
    ...openingGroups.flatMap((group) => [
      Number(group.spanStartM),
      Number(group.spanEndM),
    ]),
  ]
    .filter((entry) => Number.isFinite(entry) && entry > 0)
    .sort((left, right) => left - right)
    .filter(
      (entry, index, values) =>
        index === 0 || Math.abs(entry - values[index - 1]) > 0.18,
    );

  boundaryPositions.forEach((positionM) => {
    const x = baseX + positionM * scale;
    markup.push(
      `<line x1="${formatNumber(x)}" y1="${formatNumber(
        baseY - heightPx + 10,
      )}" x2="${formatNumber(x)}" y2="${formatNumber(
        baseY - 2,
      )}" stroke="${theme.guide}" stroke-width="0.75" stroke-dasharray="4 6" />`,
    );
    count += 1;
  });

  openingGroups.forEach((group) => {
    const x1 = baseX + Number(group.spanStartM || 0) * scale;
    const x2 = baseX + Number(group.spanEndM || 0) * scale;
    if (!(x2 > x1)) {
      return;
    }
    const level = levelProfiles.find((entry) => entry.id === group.levelId);
    if (!level) {
      return;
    }
    const relatedOpenings = projectedOpenings.filter(
      (opening) =>
        opening.levelId === group.levelId &&
        String(opening.kind || "opening") === String(group.kind || "opening"),
    );
    const headHeight =
      average(relatedOpenings.map((opening) => opening.head_height_m)) ||
      (String(group.kind || "").toLowerCase() === "door" ? 2.2 : 2.1);
    const headY = baseY - (Number(level.bottom_m || 0) + headHeight) * scale;
    markup.push(
      `<line x1="${formatNumber(x1)}" y1="${formatNumber(
        headY,
      )}" x2="${formatNumber(x2)}" y2="${formatNumber(
        headY,
      )}" stroke="${theme.lineMuted}" stroke-width="1.05" />`,
    );
    count += 1;

    if (String(group.kind || "").toLowerCase() !== "door") {
      const sillHeight =
        average(relatedOpenings.map((opening) => opening.sill_height_m)) || 0.9;
      const sillY = baseY - (Number(level.bottom_m || 0) + sillHeight) * scale;
      markup.push(
        `<line x1="${formatNumber(x1)}" y1="${formatNumber(
          sillY,
        )}" x2="${formatNumber(x2)}" y2="${formatNumber(
          sillY,
        )}" stroke="${theme.lineLight}" stroke-width="0.9" />`,
      );
      count += 1;
    }
  });

  return {
    markup: `<g id="phase8-elevation-articulation">${markup.join("")}</g>`,
    count,
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

  if (features.some((entry) => entry.includes("frame"))) {
    markup.push(`
      <g id="phase8-feature-frame">
        <rect x="${formatNumber(baseX + widthPx * 0.16)}" y="${formatNumber(
          baseY -
            levelProfiles.reduce(
              (sum, level) => sum + Number(level.height_m || 3.2),
              0,
            ) *
              scale *
              0.78,
        )}" width="${formatNumber(widthPx * 0.68)}" height="${formatNumber(
          levelProfiles.reduce(
            (sum, level) => sum + Number(level.height_m || 3.2),
            0,
          ) *
            scale *
            0.62,
        )}" fill="none" stroke="${theme.line}" stroke-width="1.2" />
      </g>
    `);
  }

  if (features.some((entry) => entry.includes("projection"))) {
    markup.push(`
      <g id="phase8-feature-projection">
        <path d="M ${formatNumber(baseX + widthPx * 0.24)} ${formatNumber(
          baseY - 18,
        )} L ${formatNumber(baseX + widthPx * 0.24)} ${formatNumber(
          baseY - 74,
        )} L ${formatNumber(baseX + widthPx * 0.32)} ${formatNumber(
          baseY - 82,
        )} L ${formatNumber(baseX + widthPx * 0.68)} ${formatNumber(
          baseY - 82,
        )} L ${formatNumber(baseX + widthPx * 0.76)} ${formatNumber(
          baseY - 74,
        )} L ${formatNumber(baseX + widthPx * 0.76)} ${formatNumber(
          baseY - 18,
        )}" fill="none" stroke="${theme.lineMuted}" stroke-width="1.05" />
      </g>
    `);
  }

  if (features.some((entry) => entry.includes("recess"))) {
    markup.push(`
      <g id="phase8-feature-recess">
        <rect x="${formatNumber(baseX + widthPx * 0.28)}" y="${formatNumber(
          baseY - 86,
        )}" width="${formatNumber(widthPx * 0.44)}" height="52" fill="none" stroke="${theme.lineLight}" stroke-width="0.95" stroke-dasharray="5 4" />
      </g>
    `);
  }

  if (features.some((entry) => entry.includes("parapet"))) {
    const roofY =
      baseY -
      levelProfiles.reduce(
        (sum, level) => sum + Number(level.height_m || 3.2),
        0,
      ) *
        scale;
    markup.push(`
      <g id="phase8-feature-parapet">
        <line x1="${formatNumber(baseX)}" y1="${formatNumber(
          roofY + 6,
        )}" x2="${formatNumber(baseX + widthPx)}" y2="${formatNumber(
          roofY + 6,
        )}" stroke="${theme.line}" stroke-width="1.35" />
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
  polish = {},
) {
  const topY = layout.top - 14;
  const rightX = width - layout.right + 24;
  const fontSize = polishSize(10, polish.fontScale || 1);
  const guideStroke = polishSize(0.9, polish.strokeScale || 1);
  const primaryStroke = polishSize(1, polish.strokeScale || 1);
  return `
    <g id="phase8-elevation-dimensions">
      <line x1="${formatNumber(baseX)}" y1="${formatNumber(
        baseY - heightPx,
      )}" x2="${formatNumber(baseX)}" y2="${formatNumber(
        topY,
      )}" stroke="${theme.lineMuted}" stroke-width="${guideStroke}"/>
      <line x1="${formatNumber(baseX + widthPx)}" y1="${formatNumber(
        baseY - heightPx,
      )}" x2="${formatNumber(baseX + widthPx)}" y2="${formatNumber(
        topY,
      )}" stroke="${theme.lineMuted}" stroke-width="${guideStroke}"/>
      <line x1="${formatNumber(baseX)}" y1="${formatNumber(
        topY,
      )}" x2="${formatNumber(baseX + widthPx)}" y2="${formatNumber(
        topY,
      )}" stroke="${theme.line}" stroke-width="${primaryStroke}"/>
      <line x1="${formatNumber(baseX)}" y1="${formatNumber(
        topY - 3,
      )}" x2="${formatNumber(baseX)}" y2="${formatNumber(
        topY + 3,
      )}" stroke="${theme.line}" stroke-width="${primaryStroke}"/>
      <line x1="${formatNumber(baseX + widthPx)}" y1="${formatNumber(
        topY - 3,
      )}" x2="${formatNumber(baseX + widthPx)}" y2="${formatNumber(
        topY + 3,
      )}" stroke="${theme.line}" stroke-width="${primaryStroke}"/>
      <text x="${formatNumber(baseX + widthPx / 2)}" y="${formatNumber(
        topY - 6,
      )}" font-size="${fontSize}" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle">${escapeXml(
        formatMeters(metrics.width_m),
      )}</text>

      <line x1="${formatNumber(baseX + widthPx)}" y1="${formatNumber(
        baseY - heightPx,
      )}" x2="${formatNumber(rightX)}" y2="${formatNumber(
        baseY - heightPx,
      )}" stroke="${theme.lineMuted}" stroke-width="${guideStroke}"/>
      <line x1="${formatNumber(baseX + widthPx)}" y1="${formatNumber(
        baseY,
      )}" x2="${formatNumber(rightX)}" y2="${formatNumber(
        baseY,
      )}" stroke="${theme.lineMuted}" stroke-width="${guideStroke}"/>
      <line x1="${formatNumber(rightX)}" y1="${formatNumber(
        baseY - heightPx,
      )}" x2="${formatNumber(rightX)}" y2="${formatNumber(
        baseY,
      )}" stroke="${theme.line}" stroke-width="${primaryStroke}"/>
      <line x1="${formatNumber(rightX - 3)}" y1="${formatNumber(
        baseY - heightPx,
      )}" x2="${formatNumber(rightX + 3)}" y2="${formatNumber(
        baseY - heightPx,
      )}" stroke="${theme.line}" stroke-width="${primaryStroke}"/>
      <line x1="${formatNumber(rightX - 3)}" y1="${formatNumber(
        baseY,
      )}" x2="${formatNumber(rightX + 3)}" y2="${formatNumber(
        baseY,
      )}" stroke="${theme.line}" stroke-width="${primaryStroke}"/>
      <text x="${formatNumber(rightX + 14)}" y="${formatNumber(
        baseY - heightPx / 2,
      )}" font-size="${fontSize}" font-family="Arial, sans-serif" font-weight="700" transform="rotate(90 ${formatNumber(
        rightX + 14,
      )} ${formatNumber(baseY - heightPx / 2)})" text-anchor="middle">${escapeXml(
        formatMeters(metrics.total_height_m),
      )}</text>
    </g>
  `;
}

function renderScaleBar(
  scalePxPerMeter,
  width,
  height,
  layout,
  theme,
  options = {},
) {
  const barMeters = chooseScaleBarMeters(scalePxPerMeter);
  const barWidthPx = barMeters * scalePxPerMeter;
  const x = width - layout.right - barWidthPx - 8;
  const y = Number.isFinite(options.y)
    ? options.y
    : height - layout.bottom + 44;
  const fontScale = options.fontScale || 1;
  const strokeScale = options.strokeScale || 1;
  const labelYOffset = Number.isFinite(options.labelYOffset)
    ? options.labelYOffset
    : 16;
  const labelFontSize = Number.isFinite(options.fontSize)
    ? options.fontSize
    : 10 * fontScale;
  const strokeWidth = polishSize(1.6, strokeScale);
  return {
    barMeters,
    markup: `
      <g id="blueprint-scale-bar">
        <line x1="${formatNumber(x)}" y1="${formatNumber(
          y,
        )}" x2="${formatNumber(x + barWidthPx)}" y2="${formatNumber(
          y,
        )}" stroke="${theme.line}" stroke-width="${strokeWidth}"/>
        <line x1="${formatNumber(x)}" y1="${formatNumber(
          y - 4,
        )}" x2="${formatNumber(x)}" y2="${formatNumber(
          y + 4,
        )}" stroke="${theme.line}" stroke-width="${strokeWidth}"/>
        <line x1="${formatNumber(x + barWidthPx / 2)}" y1="${formatNumber(
          y - 4,
        )}" x2="${formatNumber(x + barWidthPx / 2)}" y2="${formatNumber(
          y + 4,
        )}" stroke="${theme.line}" stroke-width="${strokeWidth}"/>
        <line x1="${formatNumber(x + barWidthPx)}" y1="${formatNumber(
          y - 4,
        )}" x2="${formatNumber(x + barWidthPx)}" y2="${formatNumber(
          y + 4,
        )}" stroke="${theme.line}" stroke-width="${strokeWidth}"/>
        <text x="${formatNumber(x + barWidthPx / 2)}" y="${formatNumber(
          y + labelYOffset,
        )}" font-size="${formatNumber(labelFontSize, 1)}" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(
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
  const polish = metadata.polish || {};
  const titleFont = polishSize(14, polish.fontScale || 1);
  const metaFont = polishSize(10, polish.fontScale || 1);
  const titleStroke = polishSize(1.1, polish.strokeScale || 1);
  return `
    <g id="phase7-elevation-title-block">
      <rect x="${formatNumber(x)}" y="${formatNumber(
        y,
      )}" width="328" height="46" fill="${theme.paper}" stroke="${theme.line}" stroke-width="${titleStroke}"/>
      <text x="${formatNumber(x + 12)}" y="${formatNumber(
        y + 17,
      )}" font-size="${titleFont}" font-family="Arial, sans-serif" font-weight="700" class="sheet-critical-label" data-text-role="critical">${escapeXml(
        `ELEVATION - ${String(orientation || "south").toUpperCase()}`,
      )}</text>
      <text x="${formatNumber(x + 12)}" y="${formatNumber(
        y + 34,
      )}" font-size="${metaFont}" font-family="Arial, sans-serif" class="sheet-critical-label" data-text-role="critical">${escapeXml(
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
  const metrics = resolveElevationMetrics(
    envelope.bounds,
    orientation,
    levelProfiles,
    sideFacade,
  );
  const width = options.width || 1200;
  const height = options.height || 760;
  const sheetMode = options.sheetMode === true;
  const sheetPolish = resolveElevationPolish(sheetMode);
  const showInternalTitleBlock =
    !sheetMode || options.showInternalTitleBlock === true;
  const layout = sheetMode
    ? { left: 34, top: 18, right: 38, bottom: 64 }
    : { left: 80, top: 62, right: 94, bottom: 118 };
  const availableWidth = Math.max(1, width - layout.left - layout.right);
  const availableHeight = Math.max(1, height - layout.top - layout.bottom);
  const roofLanguage = normalizeRoofLanguage(
    resolvedStyleDNA,
    facadeOrientation,
    geometry,
  );
  const roofPitchInfoBase = buildCanonicalRoofPitchInfo(geometry, {
    roofLanguage,
    spanM: metrics.width_m,
  });
  const roofAllowanceM = Math.max(
    sheetMode ? 0.72 : 1.2,
    Number(roofPitchInfoBase.riseM || 0),
  );
  const scale = Math.min(
    availableWidth / Math.max(metrics.width_m, 1),
    availableHeight / Math.max(metrics.total_height_m + roofAllowanceM, 1),
  );
  const widthPx = metrics.width_m * scale;
  const heightPx = metrics.total_height_m * scale;
  const baseX = layout.left + (availableWidth - widthPx) / 2;
  const baseY = layout.top + heightPx;
  const roofPitchInfo = {
    ...roofPitchInfoBase,
    risePx:
      Number.isFinite(Number(roofPitchInfoBase.riseM)) &&
      Number(roofPitchInfoBase.riseM) > 0
        ? roofPitchInfoBase.riseM * scale
        : null,
  };
  const palette = getCanonicalMaterialPalette({
    dna: resolvedStyleDNA,
    projectGeometry: geometry,
    facadeGrammar:
      options.facadeGrammar || geometry.metadata?.facade_grammar || null,
  });
  const materialZones = renderMaterialZones(
    sideFacade,
    facadeOrientation,
    palette,
    baseX,
    baseY,
    widthPx,
    heightPx,
    scale,
    theme,
  );
  // Phase 3/PR-B — derive a ridge datum from canonical roof pitch when it is
  // available. Missing pitch must stay explicit; final technical output should
  // not silently invent a 35 degree roof.
  const flatRoofForDatum =
    String(roofLanguage || "")
      .toLowerCase()
      .includes("flat") ||
    String(roofLanguage || "")
      .toLowerCase()
      .includes("parapet");
  const totalLevelHeightM = levelProfiles.reduce(
    (sum, level) => sum + Number(level.height_m || 3.2),
    0,
  );
  const canonicalRoof =
    geometry.metadata?.canonical_construction_truth?.roof || null;
  let ridgeHeightM = Number.isFinite(Number(roofPitchInfo.riseM))
    ? totalLevelHeightM + Number(roofPitchInfo.riseM)
    : Number(canonicalRoof?.ridge_height_m) ||
      Number(canonicalRoof?.peak_height_m) ||
      null;
  if (!Number.isFinite(ridgeHeightM)) {
    if (flatRoofForDatum) {
      ridgeHeightM = totalLevelHeightM + 0.45; // parapet upstand
    } else {
      ridgeHeightM = null;
    }
  }
  const ridgeYpx = baseY - ridgeHeightM * scale;
  const ridgeInfo =
    Number.isFinite(ridgeHeightM) && ridgeYpx < baseY
      ? { y: ridgeYpx, heightM: ridgeHeightM }
      : null;
  const datums = renderLevelDatums(
    baseX,
    baseY,
    widthPx,
    levelProfiles,
    scale,
    theme,
    sheetPolish,
    ridgeInfo,
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
    sideFacade,
    baseX,
    baseY,
    widthPx,
    heightPx,
    scale,
    theme,
  );
  const articulation = renderFacadeArticulation(
    sideFacade,
    baseX,
    baseY,
    widthPx,
    heightPx,
    scale,
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
    roofPitchInfo,
    sheetPolish,
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
    articulation.count > 0 ||
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
          (articulation.count > 3 ? 0.08 : 0.03) +
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
        facade_articulation_count: articulation.count,
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
        roof_pitch_degrees: roofPitchInfo.pitchDeg,
        roof_pitch_source: roofPitchInfo.source,
        roof_pitch_status: roofPitchInfo.status,
        roof_pitch_span_m: roofPitchInfo.spanM,
        roof_pitch_rise_m: roofPitchInfo.riseM,
        facade_features: features,
        blueprint_theme: theme.name,
      },
    };
  }

  const scaleBar = renderScaleBar(
    scale,
    width,
    height,
    layout,
    theme,
    showInternalTitleBlock
      ? { ...sheetPolish }
      : {
          y: height - 34,
          labelYOffset: 14,
          fontSize: 9,
          ...sheetPolish,
        },
  );
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
  ${materialZones.markup}
  ${articulation.markup}
  ${roof}
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
    sheetPolish,
  )}
  ${
    showInternalTitleBlock
      ? renderTitleBlock(orientation, width, height, layout, theme, {
          boundsSource: envelope.source,
          slotOccupancyRatio,
          polish: sheetPolish,
        })
      : ""
  }
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
      sheet_mode: sheetMode,
      has_title: !sheetMode,
      has_title_block: showInternalTitleBlock,
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
      facade_articulation_count: articulation.count,
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
      roof_pitch_degrees: roofPitchInfo.pitchDeg,
      roof_pitch_source: roofPitchInfo.source,
      roof_pitch_status: roofPitchInfo.status,
      roof_pitch_span_m: roofPitchInfo.spanM,
      roof_pitch_rise_m: roofPitchInfo.riseM,
      facade_features: features,
      opening_rhythm_count:
        facadeOrientation?.opening_rhythm?.opening_count ||
        openings.windowCount,
      blueprint_theme: theme.name,
      a1_quality_polish: sheetMode ? "elevation_datums_dimensions_v1" : null,
      slot_occupancy_ratio: slotOccupancyRatio,
      scale_bar_meters: scaleBar.barMeters,
    },
  };
}

export default {
  renderElevationSvg,
};

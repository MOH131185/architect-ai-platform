import { isFeatureEnabled } from "../../config/featureFlags.js";
import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";
import {
  buildSectionEvidence,
  resolveSectionCutCoordinate,
  sectionAxis,
} from "./sectionEvidenceService.js";
import { buildSectionConstructionGeometry } from "./sectionConstructionGeometryService.js";
import { truthBucketFromMode } from "./constructionTruthModel.js";
import { getSectionLineweights } from "./sectionLineweightService.js";
import { buildSectionWallDetailMarkup } from "./sectionWallDetailService.js";
import { buildSectionOpeningDetailMarkup } from "./sectionOpeningDetailService.js";
import { buildSectionStairDetailMarkup } from "./sectionStairDetailService.js";
import {
  getBlueprintTheme,
  getEnvelopeDrawingBounds,
  getEnvelopeDrawingBoundsWithSource,
  resolveCompiledProjectGeometryInput,
  resolveCompiledProjectStyleDNA,
} from "./drawingBounds.js";

const SECTION_THEME = getBlueprintTheme();
const SHEET_SECTION_POLISH = Object.freeze({
  fontScale: 1.12,
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

function resolveStairTruthLabel(truthState = "direct") {
  const normalized = String(truthState || "direct").toLowerCase();
  if (normalized === "contextual") {
    return "CONTEXTUAL";
  }
  if (normalized === "derived") {
    return "DERIVED";
  }
  return "DIRECT CUT";
}

function chooseScaleBarMeters(scalePxPerMeter = 1) {
  const candidates = [0.5, 1, 2, 5, 10];
  const eligible = candidates.filter(
    (entry) => entry * Math.max(scalePxPerMeter, 1) <= 160,
  );
  return eligible[eligible.length - 1] || 1;
}

function resolveSectionPolish(sheetMode = false) {
  return sheetMode ? SHEET_SECTION_POLISH : { fontScale: 1, strokeScale: 1 };
}

function polishSize(value, scale = 1) {
  return formatNumber(Number(value || 0) * Number(scale || 1), 1);
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

function projectRoomForSection(room = {}, sectionType = "longitudinal") {
  return sectionAxis(sectionType) === "x"
    ? {
        start: Number(room.bbox?.min_y || 0),
        end: Number(room.bbox?.max_y || 0),
      }
    : {
        start: Number(room.bbox?.min_x || 0),
        end: Number(room.bbox?.max_x || 0),
      };
}

function buildContextualSectionRooms(
  geometry = {},
  sectionType = "longitudinal",
  levelProfiles = [],
) {
  const roomsByLevel = new Map();
  for (const room of geometry.rooms || []) {
    const levelId = room.level_id || room.levelId || room.actual_level_id;
    if (!levelId) continue;
    if (!roomsByLevel.has(levelId)) roomsByLevel.set(levelId, []);
    roomsByLevel.get(levelId).push(room);
  }
  const contextualRooms = [];
  for (const level of levelProfiles) {
    const levelRooms = roomsByLevel.get(level.id) || [];
    levelRooms
      .slice()
      .sort(
        (left, right) =>
          Number(right.actual_area || right.actual_area_m2 || 0) -
          Number(left.actual_area || left.actual_area_m2 || 0),
      )
      .slice(0, 2)
      .forEach((room) => {
        contextualRooms.push({
          ...room,
          level,
          level_id: level.id,
          range: sectionDisplayRange(room, sectionType),
          truthState: "derived",
          name: room.name || room.function || room.id || "Room",
          actual_area:
            room.actual_area || room.actual_area_m2 || room.target_area_m2 || 0,
        });
      });
  }
  return contextualRooms;
}

function sectionDisplayRange(entry = {}, sectionType = "longitudinal") {
  const sectionRange = entry.clipGeometry?.sectionRange;
  if (
    sectionRange &&
    Number.isFinite(Number(sectionRange.start)) &&
    Number.isFinite(Number(sectionRange.end))
  ) {
    return {
      start: Number(sectionRange.start),
      end: Number(sectionRange.end),
    };
  }
  if ((entry.cutSpans || []).length >= 2) {
    return {
      start: Number(entry.cutSpans[0]),
      end: Number(entry.cutSpans[entry.cutSpans.length - 1]),
    };
  }
  const sectionPosition = Number(entry.clipGeometry?.sectionPositionM);
  if (Number.isFinite(sectionPosition)) {
    const halfWidth = Math.max(
      0.2,
      Number(entry.clipGeometry?.widthM || entry.width_m || 0.8) / 2,
    );
    return {
      start: sectionPosition - halfWidth,
      end: sectionPosition + halfWidth,
    };
  }
  return projectRoomForSection(entry, sectionType);
}

function getHorizontalOrigin(bounds = {}, sectionType = "longitudinal") {
  return sectionAxis(sectionType) === "x"
    ? Number(bounds.min_y || 0)
    : Number(bounds.min_x || 0);
}

function buildFallbackSectionProfile(
  geometry = {},
  sectionType = "longitudinal",
  bounds = getEnvelopeDrawingBounds(geometry),
) {
  const axis = sectionAxis(sectionType);
  const cutCoordinate =
    axis === "x"
      ? (Number(bounds.min_x || 0) + Number(bounds.max_x || 0)) / 2
      : (Number(bounds.min_y || 0) + Number(bounds.max_y || 0)) / 2;

  return axis === "x"
    ? {
        id: `section:${sectionType}:fallback`,
        sectionType,
        strategyId: "fallback-midline",
        strategyName: "Fallback Midline",
        focusEntityIds: [],
        cutLine: {
          from: { x: cutCoordinate, y: Number(bounds.min_y || 0) },
          to: { x: cutCoordinate, y: Number(bounds.max_y || 0) },
        },
      }
    : {
        id: `section:${sectionType}:fallback`,
        sectionType,
        strategyId: "fallback-midline",
        strategyName: "Fallback Midline",
        focusEntityIds: [],
        cutLine: {
          from: { x: Number(bounds.min_x || 0), y: cutCoordinate },
          to: { x: Number(bounds.max_x || 0), y: cutCoordinate },
        },
      };
}

// Phase 3 — stronger ground / grade hatch beneath the foundation band.
// Adds a deterministic 45-degree diagonal hatch pattern in the earth zone
// below ground level so the section reads with proper grade continuity at
// architectural-standard density. Pure SVG; no geometry mutation.
function renderGroundHatch(
  baseX,
  baseY,
  widthPx,
  height,
  padding,
  options = {},
) {
  const margin = 14;
  const startY = baseY + 32; // below the existing foundation soil band
  // The grade band sits in the lower margin BELOW baseY (which is at
  // height - padding). Allow it to extend almost to the bottom edge of the
  // SVG, leaving a small gutter for the scale bar / overall dimensions.
  const maxEndY = Math.max(startY, height - 18);
  const bandHeight = Math.max(0, Math.min(140, maxEndY - startY));
  if (bandHeight < 12) {
    return { markup: "", count: 0 };
  }
  const startX = baseX - margin;
  const bandWidth = widthPx + margin * 2;
  const fillOpacity = Number.isFinite(options.fillOpacity)
    ? options.fillOpacity
    : 0.32;
  const strokeWidth = options.strokeWidth || 0.85;
  const stepPx = options.stepPx || 14;
  const stroke = options.stroke || SECTION_THEME.lineLight;
  const fill = options.fill || SECTION_THEME.fillSoft;
  const lines = [];
  // 45-degree hatch: project diagonal lines across the band.
  for (
    let offset = -bandHeight;
    offset < bandWidth + bandHeight;
    offset += stepPx
  ) {
    const x1 = startX + offset;
    const y1 = startY;
    const x2 = x1 + bandHeight;
    const y2 = startY + bandHeight;
    // Clip to band rectangle
    const minX = startX;
    const maxX = startX + bandWidth;
    let cx1 = x1;
    let cy1 = y1;
    let cx2 = x2;
    let cy2 = y2;
    if (cx1 < minX) {
      cy1 += minX - cx1;
      cx1 = minX;
    }
    if (cx2 > maxX) {
      cy2 -= cx2 - maxX;
      cx2 = maxX;
    }
    if (cx2 <= cx1 || cy2 <= cy1) continue;
    lines.push(
      `<line x1="${formatNumber(cx1)}" y1="${formatNumber(cy1)}" x2="${formatNumber(cx2)}" y2="${formatNumber(cy2)}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`,
    );
  }
  return {
    markup: `<g id="phase3-section-ground-hatch" data-grade-band="true">
      <rect x="${formatNumber(startX)}" y="${formatNumber(startY)}" width="${formatNumber(bandWidth)}" height="${formatNumber(bandHeight)}" fill="${fill}" fill-opacity="${fillOpacity}"/>
      ${lines.join("")}
      <line x1="${formatNumber(startX)}" y1="${formatNumber(startY)}" x2="${formatNumber(startX + bandWidth)}" y2="${formatNumber(startY)}" stroke="${SECTION_THEME.line}" stroke-width="1.1"/>
    </g>`,
    count: lines.length,
  };
}

function renderScaleBar(scalePxPerMeter, width, height, padding, options = {}) {
  const barMeters = chooseScaleBarMeters(scalePxPerMeter);
  const barWidthPx = barMeters * scalePxPerMeter;
  const x = width - padding - barWidthPx - 8;
  const y = Number.isFinite(options.y) ? options.y : height - padding + 38;
  const fontScale = options.fontScale || 1;
  const strokeScale = options.strokeScale || 1;
  const labelYOffset = Number.isFinite(options.labelYOffset)
    ? options.labelYOffset
    : 16;
  const labelFontSize = Number.isFinite(options.fontSize)
    ? options.fontSize
    : 9 * fontScale;
  const strokeWidth = polishSize(1.6, strokeScale);
  return {
    barMeters,
    markup: `
      <g id="blueprint-scale-bar">
        <line x1="${formatNumber(x)}" y1="${formatNumber(
          y,
        )}" x2="${formatNumber(x + barWidthPx)}" y2="${formatNumber(
          y,
        )}" stroke="${SECTION_THEME.line}" stroke-width="${strokeWidth}"/>
        <line x1="${formatNumber(x)}" y1="${formatNumber(
          y - 4,
        )}" x2="${formatNumber(x)}" y2="${formatNumber(
          y + 4,
        )}" stroke="${SECTION_THEME.line}" stroke-width="${strokeWidth}"/>
        <line x1="${formatNumber(x + barWidthPx / 2)}" y1="${formatNumber(
          y - 4,
        )}" x2="${formatNumber(x + barWidthPx / 2)}" y2="${formatNumber(
          y + 4,
        )}" stroke="${SECTION_THEME.line}" stroke-width="${strokeWidth}"/>
        <line x1="${formatNumber(x + barWidthPx)}" y1="${formatNumber(
          y - 4,
        )}" x2="${formatNumber(x + barWidthPx)}" y2="${formatNumber(
          y + 4,
        )}" stroke="${SECTION_THEME.line}" stroke-width="${strokeWidth}"/>
        <text x="${formatNumber(x + barWidthPx / 2)}" y="${formatNumber(
          y + labelYOffset,
        )}" font-size="${formatNumber(labelFontSize, 1)}" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(
          `${barMeters} m`,
        )}</text>
      </g>
    `,
  };
}

function renderOverallSectionDimensions(
  baseX,
  baseY,
  widthPx,
  heightPx,
  totalHeightM,
  horizontalExtentM,
  width,
  padding,
  polish = {},
) {
  const topY = padding - 18;
  const rightX = width - padding + 18;
  const fontSize = polishSize(10, polish.fontScale || 1);
  const guideStroke = polishSize(0.9, polish.strokeScale || 1);
  const primaryStroke = polishSize(1, polish.strokeScale || 1);
  return `
    <g id="phase8-section-dimensions">
      <line x1="${formatNumber(baseX)}" y1="${formatNumber(
        baseY - heightPx,
      )}" x2="${formatNumber(baseX)}" y2="${formatNumber(
        topY,
      )}" stroke="${SECTION_THEME.lineMuted}" stroke-width="${guideStroke}"/>
      <line x1="${formatNumber(baseX + widthPx)}" y1="${formatNumber(
        baseY - heightPx,
      )}" x2="${formatNumber(baseX + widthPx)}" y2="${formatNumber(
        topY,
      )}" stroke="${SECTION_THEME.lineMuted}" stroke-width="${guideStroke}"/>
      <line x1="${formatNumber(baseX)}" y1="${formatNumber(
        topY,
      )}" x2="${formatNumber(baseX + widthPx)}" y2="${formatNumber(
        topY,
      )}" stroke="${SECTION_THEME.line}" stroke-width="${primaryStroke}"/>
      <line x1="${formatNumber(baseX)}" y1="${formatNumber(
        topY - 3,
      )}" x2="${formatNumber(baseX)}" y2="${formatNumber(
        topY + 3,
      )}" stroke="${SECTION_THEME.line}" stroke-width="${primaryStroke}"/>
      <line x1="${formatNumber(baseX + widthPx)}" y1="${formatNumber(
        topY - 3,
      )}" x2="${formatNumber(baseX + widthPx)}" y2="${formatNumber(
        topY + 3,
      )}" stroke="${SECTION_THEME.line}" stroke-width="${primaryStroke}"/>
      <text x="${formatNumber(baseX + widthPx / 2)}" y="${formatNumber(
        topY - 6,
      )}" font-size="${fontSize}" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle">${escapeXml(
        formatMeters(horizontalExtentM),
      )}</text>

      <line x1="${formatNumber(baseX + widthPx)}" y1="${formatNumber(
        baseY - heightPx,
      )}" x2="${formatNumber(rightX)}" y2="${formatNumber(
        baseY - heightPx,
      )}" stroke="${SECTION_THEME.lineMuted}" stroke-width="${guideStroke}"/>
      <line x1="${formatNumber(baseX + widthPx)}" y1="${formatNumber(
        baseY,
      )}" x2="${formatNumber(rightX)}" y2="${formatNumber(
        baseY,
      )}" stroke="${SECTION_THEME.lineMuted}" stroke-width="${guideStroke}"/>
      <line x1="${formatNumber(rightX)}" y1="${formatNumber(
        baseY - heightPx,
      )}" x2="${formatNumber(rightX)}" y2="${formatNumber(
        baseY,
      )}" stroke="${SECTION_THEME.line}" stroke-width="${primaryStroke}"/>
      <line x1="${formatNumber(rightX - 3)}" y1="${formatNumber(
        baseY - heightPx,
      )}" x2="${formatNumber(rightX + 3)}" y2="${formatNumber(
        baseY - heightPx,
      )}" stroke="${SECTION_THEME.line}" stroke-width="${primaryStroke}"/>
      <line x1="${formatNumber(rightX - 3)}" y1="${formatNumber(
        baseY,
      )}" x2="${formatNumber(rightX + 3)}" y2="${formatNumber(
        baseY,
      )}" stroke="${SECTION_THEME.line}" stroke-width="${primaryStroke}"/>
      <text x="${formatNumber(rightX + 14)}" y="${formatNumber(
        baseY - heightPx / 2,
      )}" font-size="${fontSize}" font-family="Arial, sans-serif" font-weight="700" transform="rotate(90 ${formatNumber(
        rightX + 14,
      )} ${formatNumber(baseY - heightPx / 2)})" text-anchor="middle">${escapeXml(
        formatMeters(totalHeightM),
      )}</text>
    </g>
  `;
}

function renderLevelDatums(
  baseX,
  baseY,
  widthPx,
  levelProfiles,
  scale,
  lineweights = {},
  polish = {},
) {
  const lines = [];
  const labels = [];
  const fontScale = polish.fontScale || 1;
  const strokeScale = polish.strokeScale || 1;
  const datumWeight = polishSize(lineweights.datum || 1.05, strokeScale);
  const labelStroke = polishSize(lineweights.guide || 0.78, strokeScale);
  const secondaryStroke = polishSize(lineweights.secondary || 1, strokeScale);
  const primaryLabelFont = polishSize(9, fontScale);
  const secondaryLabelFont = polishSize(8.5, fontScale);
  levelProfiles.forEach((level) => {
    const topY = baseY - level.top_m * scale;
    const midY =
      baseY - (level.bottom_m + Number(level.height_m || 3.2) / 2) * scale;
    lines.push(
      `<line x1="${baseX}" y1="${topY}" x2="${baseX + widthPx}" y2="${topY}" stroke="${SECTION_THEME.lineMuted}" stroke-width="${datumWeight}" stroke-dasharray="10 6" />`,
    );
    labels.push(`
      <g class="phase8-section-level-label">
        <line x1="${baseX - 52}" y1="${topY}" x2="${baseX - 6}" y2="${topY}" stroke="${SECTION_THEME.lineMuted}" stroke-width="${secondaryStroke}" />
        <rect x="${baseX - 176}" y="${topY - 11}" width="118" height="16" rx="3" ry="3" fill="${SECTION_THEME.paper}" fill-opacity="0.94" stroke="${SECTION_THEME.guide}" stroke-width="${labelStroke}" />
        <text x="${baseX - 166}" y="${topY + 1}" font-size="${primaryLabelFont}" font-family="Arial, sans-serif" font-weight="700" text-anchor="start" class="sheet-critical-label" data-text-role="critical">${escapeXml(
          `${level.name || `L${level.level_number}`} +${level.top_m.toFixed(2)}m`,
        )}</text>
        <rect x="${baseX - 84}" y="${midY - 9}" width="66" height="14" rx="3" ry="3" fill="${SECTION_THEME.paper}" fill-opacity="0.92" stroke="${SECTION_THEME.guide}" stroke-width="${labelStroke}" />
        <text x="${baseX - 51}" y="${midY + 1}" font-size="${secondaryLabelFont}" font-family="Arial, sans-serif" text-anchor="middle" class="sheet-critical-label" data-text-role="critical">${escapeXml(
          level.name || `L${level.level_number}`,
        )}</text>
      </g>
    `);
  });

  labels.push(`
    <line x1="${baseX - 52}" y1="${baseY}" x2="${baseX - 6}" y2="${baseY}" stroke="${SECTION_THEME.line}" stroke-width="${secondaryStroke}" />
    <rect x="${baseX - 144}" y="${baseY - 11}" width="86" height="16" rx="3" ry="3" fill="${SECTION_THEME.paper}" fill-opacity="0.94" stroke="${SECTION_THEME.guide}" stroke-width="${labelStroke}" />
    <text x="${baseX - 134}" y="${baseY + 1}" font-size="${primaryLabelFont}" font-family="Arial, sans-serif" font-weight="700" text-anchor="start" class="sheet-critical-label" data-text-role="critical">FFL +0.00m</text>
  `);

  return {
    markup: `<g id="phase8-section-datums">${lines.join("")}${labels.join("")}</g>`,
    count: levelProfiles.length + 1,
  };
}

function renderFoundation(
  baseX,
  baseY,
  widthPx,
  lineweights = {},
  foundationTruthQuality = "weak",
  foundationGeometry = null,
) {
  const quality = String(foundationTruthQuality || "weak").toLowerCase();
  const truthMode = String(foundationGeometry?.supportMode || "missing");
  const truthState = String(foundationGeometry?.truthState || "direct");
  const contextual = quality !== "verified";
  const fillOpacity =
    quality === "blocked" ? 0.48 : quality === "weak" ? 0.66 : 1;
  const dasharray = quality === "blocked" ? ' stroke-dasharray="8 5"' : "";
  const bands = (foundationGeometry?.bands || []).length
    ? foundationGeometry.bands
    : [
        {
          id: "foundation-band:fallback",
          x: baseX + widthPx * 0.08,
          width: widthPx * 0.84,
        },
      ];
  const bandMarkup = bands
    .map((band) => {
      const bandDash =
        band.truthState === "contextual"
          ? ' stroke-dasharray="6 4"'
          : dasharray;
      const bandOpacity =
        band.truthState === "contextual" ? fillOpacity * 0.82 : fillOpacity;
      return `
      <rect x="${band.x}" y="${baseY - 18}" width="${band.width}" height="18" fill="${SECTION_THEME.fillSoft}" fill-opacity="${bandOpacity}" stroke="${SECTION_THEME.lineMuted}" stroke-width="${lineweights.primary || 1.2}"${bandDash} data-truth-state="${band.truthState || "direct"}" />`;
    })
    .join("");
  const groundLineMarkup = (foundationGeometry?.groundLines || [])
    .map(
      (entry) =>
        `<line x1="${entry.x}" y1="${baseY + 12}" x2="${entry.x + entry.width}" y2="${baseY + 12}" stroke="${SECTION_THEME.lineLight}" stroke-width="${lineweights.secondary || 1}"${entry.truthState === "contextual" ? ' stroke-dasharray="5 4" stroke-opacity="0.72"' : ""} data-truth-state="${entry.truthState || "direct"}" />`,
    )
    .join("");
  const plinthMarkup = (foundationGeometry?.plinthLines || [])
    .map(
      (entry) =>
        `<line x1="${entry.x}" y1="${baseY - 2}" x2="${entry.x + entry.width}" y2="${baseY - 2}" stroke="${SECTION_THEME.lineMuted}" stroke-width="${lineweights.primary || 1.2}"${entry.truthState === "contextual" ? ' stroke-dasharray="5 4" stroke-opacity="0.76"' : ""} data-truth-state="${entry.truthState || "direct"}" />`,
    )
    .join("");
  const stepMarkup = (foundationGeometry?.stepLines || [])
    .map(
      (entry) =>
        `<path d="M ${entry.x} ${baseY + 8} L ${entry.x + entry.width / 2} ${baseY - 6} L ${entry.x + entry.width} ${baseY - 6}" fill="none" stroke="${SECTION_THEME.lineLight}" stroke-width="${lineweights.secondary || 1}" stroke-dasharray="${entry.truthState === "contextual" ? "6 5" : "5 4"}"${entry.truthState === "contextual" ? ' stroke-opacity="0.74"' : ""} data-truth-state="${entry.truthState || "direct"}" />`,
    )
    .join("");
  const interfaceMarkup = (foundationGeometry?.slabGroundInterfaces || [])
    .map(
      (entry) =>
        `<line x1="${entry.x}" y1="${baseY}" x2="${entry.x + entry.width}" y2="${baseY}" stroke="${SECTION_THEME.line}" stroke-width="${lineweights.cutOutline || 2}"${entry.truthState === "contextual" ? ' stroke-dasharray="6 4" stroke-opacity="0.76"' : ""} data-truth-state="${entry.truthState || "direct"}" />`,
    )
    .join("");
  const zoneMarkup = (foundationGeometry?.zones || [])
    .map(
      (entry) =>
        `<rect x="${entry.x}" y="${baseY + 6}" width="${entry.width}" height="12" fill="${SECTION_THEME.fillSoft}"${entry.truthState === "contextual" ? ' fill-opacity="0.72"' : ""} stroke="${SECTION_THEME.lineLight}" stroke-width="${lineweights.secondary || 1}"${entry.truthState === "contextual" ? ' stroke-dasharray="5 4" stroke-opacity="0.74"' : ""} data-truth-state="${entry.truthState || "direct"}" />`,
    )
    .join("");
  const directClipMarkup = (foundationGeometry?.directClips || [])
    .map((entry) => {
      const width = Math.max(
        8,
        Number(entry.width || 0),
        Math.min(22, Number(entry.clipDepthM || 0) * 22),
      );
      const x = Number(entry.x || 0) + (Number(entry.width || 0) - width) / 2;
      const truthState = String(entry.truthState || "direct").toLowerCase();
      return `<rect x="${x}" y="${baseY - 16}" width="${width}" height="34" fill="${SECTION_THEME.pocheSoft}" fill-opacity="${truthState === "direct" ? 0.92 : 0.68}" stroke="${SECTION_THEME.line}" stroke-width="${lineweights.primary || 1.2}"${truthState === "direct" ? "" : ' stroke-dasharray="6 4"'} data-truth-state="${truthState}" />`;
    })
    .join("");
  const baseWallConditionMarkup = (foundationGeometry?.baseWallConditions || [])
    .map(
      (entry) =>
        `<line x1="${entry.x}" y1="${baseY - 10}" x2="${entry.x + entry.width}" y2="${baseY - 10}" stroke="${SECTION_THEME.lineMuted}" stroke-width="${lineweights.secondary || 1}"${entry.truthState === "contextual" ? ' stroke-dasharray="6 4" stroke-opacity="0.74"' : ""} data-truth-state="${entry.truthState || "direct"}" />`,
    )
    .join("");
  const soilBandCount = Math.max(6, Math.round((widthPx + 28) / 44));
  const soilMarkup = Array.from({ length: soilBandCount }, (_, index) => {
    const startX = baseX - 14 + (index * (widthPx + 28)) / soilBandCount;
    const y = baseY + 18 + (index % 2) * 3;
    return `<path d="M ${startX} ${y} L ${startX + 8} ${y + 4} L ${startX + 16} ${y} L ${startX + 24} ${y + 4}" fill="none" stroke="${SECTION_THEME.guide}" stroke-width="${lineweights.guide || 0.72}" />`;
  }).join("");
  return `
    <g id="phase8-section-foundation" data-truth="${quality}" data-truth-mode="${truthMode}" data-truth-state="${truthState}">
      <rect x="${baseX - 10}" y="${baseY}" width="${widthPx + 20}" height="42" fill="${SECTION_THEME.paper}" fill-opacity="${fillOpacity}" />
      <rect x="${baseX - 14}" y="${baseY + 12}" width="${widthPx + 28}" height="18" fill="${SECTION_THEME.fillSoft}" fill-opacity="0.24" />
      ${bandMarkup}
      ${directClipMarkup}
      ${zoneMarkup}
      ${groundLineMarkup}
      ${plinthMarkup}
      ${baseWallConditionMarkup}
      ${stepMarkup}
      ${interfaceMarkup}
      ${soilMarkup}
      <line x1="${baseX - 14}" y1="${baseY}" x2="${baseX + widthPx + 14}" y2="${baseY}" stroke="${SECTION_THEME.line}" stroke-width="${lineweights.cutOutline || 2}"${dasharray} />
      <line x1="${baseX - 14}" y1="${baseY + 12}" x2="${baseX + widthPx + 14}" y2="${baseY + 12}" stroke="${SECTION_THEME.guide}" stroke-width="${lineweights.secondary || 1}" stroke-dasharray="6 4" />
      <text x="${baseX + widthPx - 6}" y="${baseY + 26}" font-size="8" font-family="Arial, sans-serif" text-anchor="end" fill="${SECTION_THEME.lineLight}">GROUND RELATION</text>
      ${
        contextual
          ? `<text x="${baseX + widthPx - 6}" y="${baseY + 34}" font-size="8" font-family="Arial, sans-serif" text-anchor="end" fill="${SECTION_THEME.lineLight}">FOUNDATION CONTEXTUAL</text>`
          : ""
      }
    </g>
  `;
}

function renderRoofPitchLabel(baseX, ridgeY, widthPx, pitchDeg) {
  const numericPitch = Number(pitchDeg);
  if (!Number.isFinite(numericPitch) || numericPitch <= 0) {
    return "";
  }
  const cx = baseX + widthPx / 2 + 32;
  const cy = ridgeY + 18;
  return `
    <g id="phase14-section-roof-pitch" data-roof-pitch-deg="${numericPitch.toFixed(1)}">
      <text x="${cx}" y="${cy}" font-size="10" font-family="Arial, sans-serif" font-weight="700" fill="${SECTION_THEME.line}" data-text-role="roof-pitch">PITCH ${numericPitch.toFixed(0)}°</text>
    </g>
  `;
}

function renderRoof(
  baseX,
  topY,
  widthPx,
  roofLanguage = "pitched",
  lineweights = {},
  roofTruthQuality = "weak",
  roofGeometry = null,
  pitchDeg = null,
) {
  const quality = String(roofTruthQuality || "weak").toLowerCase();
  const truthMode = String(roofGeometry?.supportMode || "missing");
  const truthState = String(roofGeometry?.truthState || "direct");
  const dasharray = quality === "verified" ? "" : ' stroke-dasharray="7 4"';
  const strokeOpacity =
    quality === "blocked" ? 0.52 : quality === "weak" ? 0.74 : 1;
  const roofX = roofGeometry?.band?.x ?? baseX;
  const roofWidth = roofGeometry?.band?.width ?? widthPx;
  const flat = String(roofLanguage || "")
    .toLowerCase()
    .includes("flat");
  const parapetMarkup = (roofGeometry?.parapets || [])
    .map(
      (entry) =>
        `<line x1="${entry.x}" y1="${topY - 15}" x2="${entry.x + entry.width}" y2="${topY - 15}" stroke="${SECTION_THEME.line}" stroke-width="${lineweights.primary || 1.4}"${entry.truthState === "contextual" ? ' stroke-dasharray="6 4" stroke-opacity="0.74"' : dasharray} data-truth-state="${entry.truthState || "direct"}" />`,
    )
    .join("");
  const roofBreakMarkup = (roofGeometry?.roofBreaks || [])
    .map(
      (entry) =>
        `<line x1="${entry.x}" y1="${topY - 26}" x2="${entry.x}" y2="${topY + 4}" stroke="${SECTION_THEME.lineMuted}" stroke-width="${lineweights.secondary || 1}" stroke-dasharray="${entry.truthState === "contextual" ? "6 5" : "4 4"}"${entry.truthState === "contextual" ? ' stroke-opacity="0.74"' : ""} data-truth-state="${entry.truthState || "direct"}" />`,
    )
    .join("");
  const attachmentMarkup = (roofGeometry?.attachments || [])
    .map(
      (entry) =>
        `<rect x="${entry.x}" y="${topY - 28}" width="${Math.max(10, entry.width)}" height="12" fill="${SECTION_THEME.paper}"${entry.truthState === "contextual" ? ' fill-opacity="0.72"' : ""} stroke="${SECTION_THEME.lineMuted}" stroke-width="0.9"${entry.truthState === "contextual" ? ' stroke-dasharray="5 4" stroke-opacity="0.76"' : ""} data-truth-state="${entry.truthState || "direct"}" />`,
    )
    .join("");
  const hipMarkup = (roofGeometry?.hips || [])
    .map(
      (entry) =>
        `<line x1="${entry.x}" y1="${topY - 34}" x2="${entry.x}" y2="${topY}" stroke="${SECTION_THEME.lineMuted}" stroke-width="${lineweights.secondary || 1}"${entry.truthState === "contextual" ? ' stroke-dasharray="6 4" stroke-opacity="0.74"' : ""} data-truth-state="${entry.truthState || "direct"}" />`,
    )
    .join("");
  const valleyMarkup = (roofGeometry?.valleys || [])
    .map(
      (entry) =>
        `<line x1="${entry.x}" y1="${topY - 30}" x2="${entry.x}" y2="${topY - 2}" stroke="${SECTION_THEME.lineLight}" stroke-width="${lineweights.secondary || 1}" stroke-dasharray="${entry.truthState === "contextual" ? "7 5" : "4 4"}"${entry.truthState === "contextual" ? ' stroke-opacity="0.76"' : ""} data-truth-state="${entry.truthState || "direct"}" />`,
    )
    .join("");
  const cutPlaneMarkup = (roofGeometry?.cutPlanes || [])
    .map((entry) => {
      const width = Math.max(
        10,
        Number(entry.width || 0),
        Math.min(26, Number(entry.clipDepthM || 0) * 20),
      );
      const x = Number(entry.x || 0) + (Number(entry.width || 0) - width) / 2;
      const truthState = String(entry.truthState || "direct").toLowerCase();
      return `<rect x="${x}" y="${topY - 30}" width="${width}" height="22" fill="${SECTION_THEME.fillSoft}" fill-opacity="${truthState === "direct" ? 0.9 : 0.66}" stroke="${SECTION_THEME.lineMuted}" stroke-width="${lineweights.primary || 1.1}"${truthState === "direct" ? "" : ' stroke-dasharray="6 4"'} data-truth-state="${truthState}" />`;
    })
    .join("");
  if (flat) {
    return `
      <g id="phase14-section-roof" data-truth="${quality}" data-truth-mode="${truthMode}" data-truth-state="${truthState}">
      <rect x="${roofX}" y="${topY - 16}" width="${roofWidth}" height="4" fill="${SECTION_THEME.paper}" stroke="${SECTION_THEME.line}" stroke-opacity="${strokeOpacity}" stroke-width="${lineweights.secondary || 1}"${dasharray} />
      <rect x="${roofX}" y="${topY - 12}" width="${roofWidth}" height="12" fill="${SECTION_THEME.fillSoft}" fill-opacity="${quality === "blocked" ? 0.45 : quality === "weak" ? 0.68 : 1}" stroke="${SECTION_THEME.line}" stroke-opacity="${strokeOpacity}" stroke-width="${lineweights.primary || 1.6}"${dasharray} />
      <line x1="${roofX}" y1="${topY - 12}" x2="${roofX + roofWidth}" y2="${topY - 12}" stroke="${SECTION_THEME.line}" stroke-opacity="${strokeOpacity}" stroke-width="${lineweights.cutOutline || 2}"${dasharray} />
      <line x1="${roofX + 8}" y1="${topY - 7}" x2="${roofX + roofWidth - 8}" y2="${topY - 7}" stroke="${SECTION_THEME.lineLight}" stroke-width="${lineweights.tertiary || 0.8}" />
      <line x1="${roofX + 8}" y1="${topY - 3}" x2="${roofX + roofWidth - 8}" y2="${topY - 3}" stroke="${SECTION_THEME.lineMuted}" stroke-width="${lineweights.secondary || 1}" />
      ${cutPlaneMarkup}
      ${parapetMarkup}
      ${roofBreakMarkup}
      ${hipMarkup}
      ${valleyMarkup}
      ${attachmentMarkup}
      </g>
    `;
  }

  const ridgeY = topY - 52;
  const undersideY = ridgeY + 12;
  const pitchLabel = renderRoofPitchLabel(roofX, ridgeY, roofWidth, pitchDeg);
  return `
    <g id="phase14-section-roof" data-truth="${quality}" data-truth-mode="${truthMode}" data-truth-state="${truthState}">
    <path d="M ${roofX - 4} ${topY} L ${roofX + roofWidth / 2} ${ridgeY} L ${roofX + roofWidth + 4} ${topY} L ${roofX + roofWidth - 12} ${topY} L ${roofX + roofWidth / 2} ${undersideY} L ${roofX + 12} ${topY} Z" fill="${SECTION_THEME.fillSoft}" fill-opacity="${quality === "blocked" ? 0.42 : quality === "weak" ? 0.66 : 0.92}" stroke="${SECTION_THEME.lineMuted}" stroke-opacity="${strokeOpacity}" stroke-width="${lineweights.primary || 1.4}"${dasharray} />
    <path d="M ${roofX} ${topY} L ${roofX + roofWidth / 2} ${ridgeY} L ${roofX + roofWidth} ${topY}" fill="none" stroke="${SECTION_THEME.line}" stroke-opacity="${strokeOpacity}" stroke-width="${lineweights.cutOutline || 2}"${dasharray} />
    <path d="M ${roofX + 12} ${topY} L ${roofX + roofWidth / 2} ${undersideY} L ${roofX + roofWidth - 12} ${topY}" fill="none" stroke="${SECTION_THEME.lineMuted}" stroke-opacity="${strokeOpacity}" stroke-width="${lineweights.primary || 1.2}"${dasharray} />
    <line x1="${roofX + roofWidth / 2}" y1="${ridgeY}" x2="${roofX + roofWidth / 2}" y2="${ridgeY + 10}" stroke="${SECTION_THEME.line}" stroke-width="${lineweights.secondary || 1}" />
    <line x1="${roofX + 10}" y1="${topY - 8}" x2="${roofX + roofWidth - 10}" y2="${topY - 8}" stroke="${SECTION_THEME.lineLight}" stroke-width="${lineweights.tertiary || 0.8}" stroke-dasharray="4 4" />
    ${cutPlaneMarkup}
    ${roofBreakMarkup}
    ${hipMarkup}
    ${valleyMarkup}
    ${attachmentMarkup}
    </g>
    ${pitchLabel}
  `;
}

function renderCutRooms(
  cutRooms = [],
  sectionType = "longitudinal",
  levelProfiles = [],
  baseX = 0,
  baseY = 0,
  scale = 1,
  originM = 0,
) {
  const markup = cutRooms
    .map((room) => {
      const level =
        room.level || levelProfiles.find((entry) => entry.id === room.level_id);
      if (!level) {
        return "";
      }

      const projection = room.range || sectionDisplayRange(room, sectionType);
      const startM = Number(projection.start || 0) - originM;
      const endM = Number(projection.end || projection.start || 0) - originM;
      const x = room.x ?? baseX + startM * scale;
      const widthPx =
        room.width ?? Math.max(18, Math.abs(endM - startM) * scale);
      const y = room.y ?? baseY - level.top_m * scale;
      const heightPx =
        room.height ?? Math.max(24, Number(level.height_m || 3.2) * scale);
      const name = escapeXml(
        String(room.name || room.id || "ROOM").toUpperCase(),
      );

      return `
        <g class="phase8-cut-room">
          <rect x="${x}" y="${y}" width="${widthPx}" height="${heightPx}" fill="${SECTION_THEME.paper}" stroke="${SECTION_THEME.line}" stroke-width="1.6" />
          <line x1="${x}" y1="${y + heightPx}" x2="${x + widthPx}" y2="${y + heightPx}" stroke="${SECTION_THEME.line}" stroke-width="2.1" />
          <line x1="${x}" y1="${y}" x2="${x}" y2="${y + heightPx}" stroke="${SECTION_THEME.line}" stroke-width="2.1" />
          <text x="${x + widthPx / 2}" y="${y + heightPx / 2 - 4}" font-size="12" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle" class="sheet-critical-label" data-text-role="critical">${name}</text>
          <text x="${x + widthPx / 2}" y="${y + heightPx / 2 + 11}" font-size="10" font-family="Arial, sans-serif" text-anchor="middle" class="sheet-critical-label" data-text-role="critical">${escapeXml(
            `${Number(room.actual_area || room.target_area_m2 || 0).toFixed(1)} M2`,
          )}</text>
        </g>
      `;
    })
    .join("");

  return {
    markup: `<g id="phase8-section-cut-rooms">${markup}</g>`,
    count: cutRooms.length,
  };
}

function renderStairCut(
  stairs = [],
  sectionType = "longitudinal",
  baseX = 0,
  baseY = 0,
  scale = 1,
  levelProfiles = [],
  originM = 0,
) {
  const markup = (stairs || [])
    .map((stair) => {
      const level =
        stair.level ||
        levelProfiles.find((entry) => entry.id === stair.level_id) ||
        levelProfiles[0];
      if (!level) {
        return "";
      }
      const projection = stair.range || sectionDisplayRange(stair, sectionType);
      const startM = Number(projection.start || 0) - originM;
      const endM = Number(projection.end || projection.start || 0) - originM;
      const x = stair.x ?? baseX + startM * scale;
      const widthPx =
        stair.width ?? Math.max(20, Math.abs(endM - startM) * scale);
      const y =
        stair.y ??
        baseY - (level.bottom_m + Number(level.height_m || 3.2) * 0.95) * scale;
      const heightPx =
        stair.height ??
        Math.max(
          28,
          Number(stair.depth_m || stair.bbox?.height || 2.8) * scale,
        );
      const treadCount = stair.treadCount || 7;
      const truthState = String(
        stair.truthState || stair.clipGeometry?.truthState || "direct",
      ).toLowerCase();
      const truthLabel = resolveStairTruthLabel(truthState);
      const fillOpacity =
        truthState === "direct"
          ? 0.92
          : truthState === "contextual"
            ? 0.74
            : 0.56;
      const strokeDash =
        truthState === "direct" ? "" : ' stroke-dasharray="6 4"';
      const treadSpacing = heightPx / treadCount;
      const treads = Array.from({ length: treadCount }, (_, index) => {
        const treadY = y + treadSpacing * (index + 1);
        return `<line x1="${x + 4}" y1="${treadY}" x2="${x + widthPx - 4}" y2="${treadY}" stroke="${SECTION_THEME.lineLight}" stroke-width="1.02" />`;
      }).join("");
      const truthLabelWidth = Math.min(
        Math.max(54, truthLabel.length * 5.4 + 10),
        Math.max(54, widthPx - 8),
      );
      const arrowStart = {
        x: x + widthPx * 0.58,
        y: y + heightPx - 10,
      };
      const arrowEnd = {
        x: x + widthPx * 0.58,
        y: y + 18,
      };
      const arrowHead = `M ${formatNumber(arrowEnd.x)} ${formatNumber(
        arrowEnd.y - 6,
      )} L ${formatNumber(arrowEnd.x - 4)} ${formatNumber(
        arrowEnd.y + 2,
      )} L ${formatNumber(arrowEnd.x + 4)} ${formatNumber(arrowEnd.y + 2)} Z`;

      return `
        <g id="phase8-section-stair-${escapeXml(stair.id || "stair")}" data-truth-state="${truthState}">
          <rect x="${x}" y="${y}" width="${widthPx}" height="${heightPx}" fill="${SECTION_THEME.paper}" fill-opacity="${fillOpacity}" stroke="${SECTION_THEME.line}" stroke-width="1.6"${strokeDash} />
          <line x1="${x + 3}" y1="${y + 4}" x2="${x + 3}" y2="${y + heightPx - 4}" stroke="${SECTION_THEME.line}" stroke-width="1.15"${strokeDash} />
          ${treads}
          <line x1="${formatNumber(arrowStart.x)}" y1="${formatNumber(
            arrowStart.y,
          )}" x2="${formatNumber(arrowEnd.x)}" y2="${formatNumber(
            arrowEnd.y,
          )}" stroke="${SECTION_THEME.line}" stroke-width="1.2"${strokeDash} />
          <path d="${arrowHead}" fill="${SECTION_THEME.line}"/>
          <rect x="${x + (widthPx - truthLabelWidth) / 2}" y="${y + 4}" width="${truthLabelWidth}" height="12" rx="3" ry="3" fill="${SECTION_THEME.paper}" fill-opacity="0.94" stroke="${SECTION_THEME.guide}" stroke-width="0.7" />
          <text x="${x + widthPx / 2}" y="${y + 13}" font-size="8" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle" class="sheet-critical-label" data-text-role="critical">${escapeXml(
            truthLabel,
          )}</text>
          <text x="${x + widthPx / 2}" y="${y + 27}" font-size="11" font-family="Arial, sans-serif" text-anchor="middle" class="sheet-critical-label" data-text-role="critical">STAIR</text>
          <text x="${x + widthPx / 2}" y="${y + heightPx - 7}" font-size="10" font-family="Arial, sans-serif" text-anchor="middle" class="sheet-critical-label" data-text-role="critical">UP</text>
        </g>
      `;
    })
    .join("");

  return {
    markup: `<g id="phase8-section-stair-cuts">${markup}</g>`,
    count: (stairs || []).length,
    treadCount: (stairs || []).reduce(
      (sum, stair) => sum + Number(stair.treadCount || 7),
      0,
    ),
  };
}

function renderSlabCuts(
  slabs = [],
  lineweights = {},
  slabTruthQuality = "weak",
) {
  const quality = String(slabTruthQuality || "weak").toLowerCase();
  const markup = (slabs || [])
    .map((slab) => {
      const truthState = String(slab.truthState || quality).toLowerCase();
      const dasharray =
        truthState === "direct"
          ? ""
          : truthState === "contextual"
            ? ' stroke-dasharray="6 4"'
            : ' stroke-dasharray="8 5"';
      const fillOpacity =
        truthState === "direct"
          ? 0.88
          : truthState === "contextual"
            ? 0.62
            : 0.42;
      const buildUpDepth = Math.max(
        7,
        Math.min(14, Number(slab.clipDepthM || 0) * 18),
      );
      const edgeInset = Math.min(6, Math.max(3, slab.width * 0.04));
      return `
        <g id="phase14-section-slab-${escapeXml(slab.level?.id || slab.id)}" data-truth="${quality}" data-truth-state="${truthState}">
          <rect x="${slab.x || 0}" y="${slab.y}" width="${slab.width}" height="${buildUpDepth}" fill="${SECTION_THEME.fillSoft}" fill-opacity="${fillOpacity}" stroke="${SECTION_THEME.line}" stroke-width="${lineweights.primary || 1.2}"${dasharray} />
          <line x1="${slab.x || 0}" y1="${slab.y}" x2="${(slab.x || 0) + slab.width}" y2="${slab.y}" stroke="${SECTION_THEME.line}" stroke-width="${lineweights.cutOutline || 1.8}"${dasharray} />
          <line x1="${slab.x || 0}" y1="${slab.y}" x2="${slab.x || 0}" y2="${slab.y + buildUpDepth}" stroke="${SECTION_THEME.line}" stroke-width="${lineweights.secondary || 1}" />
          <line x1="${(slab.x || 0) + slab.width}" y1="${slab.y}" x2="${(slab.x || 0) + slab.width}" y2="${slab.y + buildUpDepth}" stroke="${SECTION_THEME.line}" stroke-width="${lineweights.secondary || 1}" />
          <line x1="${(slab.x || 0) + edgeInset}" y1="${slab.y + buildUpDepth / 2}" x2="${(slab.x || 0) + slab.width - edgeInset}" y2="${slab.y + buildUpDepth / 2}" stroke="${SECTION_THEME.lineLight}" stroke-width="${lineweights.tertiary || 0.8}" stroke-dasharray="5 3" />
          <line x1="${slab.x || 0}" y1="${slab.y + buildUpDepth}" x2="${(slab.x || 0) + slab.width}" y2="${slab.y + buildUpDepth}" stroke="${SECTION_THEME.lineLight}" stroke-width="${lineweights.tertiary || 0.8}" />
        </g>`;
    })
    .join("");
  return {
    markup: `<g id="phase14-section-slabs">${markup}</g>`,
    count: (slabs || []).length,
  };
}

function renderCutWalls(
  walls = [],
  sectionType = "longitudinal",
  baseX = 0,
  baseY = 0,
  scale = 1,
  levelProfiles = [],
  lineweights = {},
  originM = 0,
) {
  const markup = (walls || [])
    .map((wall, index) => {
      const level =
        levelProfiles.find((entry) => entry.id === wall.level_id) ||
        levelProfiles[0];
      if (!level) {
        return "";
      }
      const projection = sectionDisplayRange(wall, sectionType);
      const startM = Number(projection.start || 0) - originM;
      const endM = Number(projection.end || projection.start || 0) - originM;
      const center = (startM + endM) / 2;
      const widthPx = Math.max(
        8,
        Number(wall.thickness_m || 0.18) * scale,
        Math.abs(endM - startM) * scale,
      );
      const x = baseX + center * scale - widthPx / 2;
      const y = baseY - level.top_m * scale;
      const heightPx = Math.max(24, Number(level.height_m || 3.2) * scale);
      const truthState = String(wall.truthState || "direct").toLowerCase();
      const fillOpacity =
        truthState === "direct"
          ? 0.88
          : truthState === "contextual"
            ? 0.56
            : 0.34;
      const strokeDash =
        truthState === "direct" ? "" : ' stroke-dasharray="7 4"';

      return `
        <g id="phase13-section-cut-wall-${escapeXml(wall.id || index)}" data-truth-state="${truthState}">
          <rect x="${x}" y="${y}" width="${widthPx}" height="${heightPx}" fill="${SECTION_THEME.poche}" fill-opacity="${fillOpacity}" stroke="${SECTION_THEME.line}" stroke-width="${lineweights.cutOutline || 1.8}"${strokeDash} />
          <line x1="${x}" y1="${y + 3}" x2="${x}" y2="${y + heightPx - 3}" stroke="${SECTION_THEME.line}" stroke-width="${lineweights.primary || 1.2}"${strokeDash} />
          <line x1="${x + widthPx}" y1="${y + 3}" x2="${x + widthPx}" y2="${y + heightPx - 3}" stroke="${SECTION_THEME.line}" stroke-width="${lineweights.primary || 1.2}"${strokeDash} />
          ${
            widthPx > 14
              ? `<line x1="${x + widthPx / 2}" y1="${y + 4}" x2="${x + widthPx / 2}" y2="${y + heightPx - 4}" stroke="${SECTION_THEME.lineLight}" stroke-width="${lineweights.hatch || 0.7}" />`
              : ""
          }
        </g>
      `;
    })
    .join("");

  return {
    markup: `<g id="phase13-section-cut-walls">${markup}</g>`,
    count: (walls || []).length,
  };
}

function renderCutOpenings(
  openings = [],
  sectionType = "longitudinal",
  baseX = 0,
  baseY = 0,
  scale = 1,
  levelProfiles = [],
  originM = 0,
) {
  const markup = (openings || [])
    .map((opening, index) => {
      const level =
        levelProfiles.find((entry) => entry.id === opening.level_id) ||
        levelProfiles[0];
      if (!level) {
        return "";
      }
      const projection = sectionDisplayRange(opening, sectionType);
      const sillHeight = Number(opening.clipGeometry?.sillHeightM || 0.9);
      const headHeight = Number(opening.clipGeometry?.headHeightM || 2.1);
      const startM = Number(projection.start || 0) - originM;
      const endM = Number(projection.end || projection.start || 0) - originM;
      const widthPx = Math.max(10, Math.abs(endM - startM) * scale);
      const x = baseX + startM * scale;
      const y = baseY - (level.bottom_m + headHeight) * scale;
      const heightPx = Math.max(10, (headHeight - sillHeight) * scale);
      const truthState = String(opening.truthState || "direct").toLowerCase();
      const strokeDash =
        truthState === "direct" ? "" : ' stroke-dasharray="6 4"';
      const fillOpacity =
        truthState === "direct" ? 1 : truthState === "contextual" ? 0.82 : 0.66;

      return `
        <g id="phase13-section-cut-opening-${escapeXml(opening.id || index)}" data-truth-state="${truthState}">
          <rect x="${x}" y="${y}" width="${widthPx}" height="${heightPx}" fill="${SECTION_THEME.paper}" fill-opacity="${fillOpacity}" stroke="${SECTION_THEME.lineMuted}" stroke-width="1"${strokeDash} />
          <line x1="${x}" y1="${y}" x2="${x + widthPx}" y2="${y}" stroke="${SECTION_THEME.line}" stroke-width="1"${strokeDash} />
          <line x1="${x}" y1="${y + heightPx}" x2="${x + widthPx}" y2="${y + heightPx}" stroke="${SECTION_THEME.line}" stroke-width="1"${strokeDash} />
        </g>
      `;
    })
    .join("");

  return {
    markup: `<g id="phase13-section-cut-openings">${markup}</g>`,
    count: (openings || []).length,
  };
}

export function renderSectionSvg(
  geometryInput = {},
  styleDNA = {},
  options = {},
) {
  const rawGeometryInput = resolveCompiledProjectGeometryInput(geometryInput);
  const resolvedStyleDNA =
    styleDNA && Object.keys(styleDNA).length
      ? styleDNA
      : resolveCompiledProjectStyleDNA(geometryInput, styleDNA);
  const geometry = coerceToCanonicalProjectGeometry({
    ...(rawGeometryInput || {}),
    metadata: rawGeometryInput?.metadata || {},
  });
  const sectionType = String(
    options.sectionType || "longitudinal",
  ).toLowerCase();
  const envelopeBounds = getEnvelopeDrawingBoundsWithSource(geometry);
  const sectionProfile =
    options.sectionProfile ||
    buildFallbackSectionProfile(geometry, sectionType, envelopeBounds.bounds);
  const sectionSemantics = options.sectionSemantics || null;
  const levelProfiles = getLevelProfiles(geometry);
  const width = options.width || 1200;
  const height = options.height || 760;
  const sheetMode = options.sheetMode === true;
  const sheetPolish = resolveSectionPolish(sheetMode);
  const showInternalTitleBlock =
    !sheetMode || options.showInternalTitleBlock === true;
  const padding = sheetMode ? 34 : 86;
  const bounds = envelopeBounds.bounds || getEnvelopeDrawingBounds(geometry);
  const horizontalOrigin = getHorizontalOrigin(bounds, sectionType);
  const horizontalExtent =
    sectionAxis(sectionType) === "x"
      ? Number(bounds.height || 10)
      : Number(bounds.width || 12);
  const totalHeight =
    levelProfiles.reduce(
      (sum, level) => sum + Number(level.height_m || 3.2),
      0,
    ) || 3.2;
  const scale = Math.min(
    (width - padding * 2) / Math.max(horizontalExtent, 1),
    (height - padding * 2) /
      Math.max(totalHeight + (sheetMode ? 0.82 : 1.4), 1),
  );
  const baseX = (width - horizontalExtent * scale) / 2;
  const sectionHeightPx = totalHeight * scale;
  const availableHeightPx = Math.max(1, height - padding * 2);
  const centeredBaseY = padding + (availableHeightPx + sectionHeightPx) / 2;
  const baseY = sheetMode
    ? Math.min(height - padding, centeredBaseY)
    : height - padding;
  const sectionEvidence =
    options.sectionEvidence || buildSectionEvidence(geometry, sectionProfile);
  const sectionTruthModel = sectionEvidence.sectionTruthModel || null;
  const sectionFaceBundle = sectionEvidence.sectionFaceBundle || null;
  const sectionFaceSummary = sectionEvidence.sectionFaceSummary || null;
  const lineweights = getSectionLineweights({
    constructionTruthQuality:
      sectionTruthModel?.overall?.quality ||
      sectionEvidence.summary?.sectionConstructionTruthQuality ||
      sectionEvidence.summary?.directEvidenceQuality ||
      "weak",
    draftingEvidenceScore:
      sectionEvidence.summary?.sectionDraftingEvidenceScore || 0,
    profileComplexityScore:
      sectionEvidence.summary?.sectionProfileComplexityScore || 0,
    faceCredibilityScore:
      sectionFaceBundle?.credibility?.score ||
      sectionFaceSummary?.credibilityScore ||
      0,
    faceCredibilityQuality:
      sectionFaceBundle?.credibility?.quality ||
      sectionFaceSummary?.credibilityQuality ||
      "blocked",
    cutFaceCount:
      sectionFaceBundle?.summary?.cutFaceCount ||
      sectionFaceSummary?.cutFaceCount ||
      0,
    cutProfileCount:
      sectionFaceBundle?.summary?.cutProfileCount ||
      sectionFaceSummary?.cutProfileCount ||
      0,
  });
  const roofTruthQuality = sectionEvidence.summary?.roofTruthQuality || "weak";
  const roofTruthMode = sectionEvidence.summary?.roofTruthMode || "missing";
  const roofTruthState =
    sectionEvidence.summary?.roofTruthState ||
    truthBucketFromMode(roofTruthMode);
  const slabTruthQuality = sectionEvidence.summary?.slabTruthQuality || "weak";
  const foundationTruthQuality =
    sectionEvidence.summary?.foundationTruthQuality || "weak";
  const foundationTruthMode =
    sectionEvidence.summary?.foundationTruthMode || "missing";
  const foundationTruthState =
    sectionEvidence.summary?.foundationTruthState ||
    truthBucketFromMode(foundationTruthMode);
  const cutCoordinate = resolveSectionCutCoordinate(
    geometry,
    sectionProfile,
    sectionType,
  );
  const cutRooms = sectionEvidence.intersections?.rooms || [];
  const intersectedStairs = sectionEvidence.intersections?.stairs || [];
  const cutWalls = sectionEvidence.intersections?.walls || [];
  const cutOpenings = sectionEvidence.intersections?.openings || [];
  const geometryComplete =
    sectionEvidence.summary?.geometryCommunicable !== false &&
    levelProfiles.length > 0;
  const allowWeakSectionFallback = options.allowWeakSectionFallback === true;
  const minimalSectionFallback =
    levelProfiles.length > 0 &&
    ((geometry.rooms || []).length > 0 || (geometry.walls || []).length > 0);
  const useDraftingGradeGraphics =
    isFeatureEnabled("useDraftingGradeSectionGraphicsPhase14") ||
    isFeatureEnabled("useDraftingGradeSectionGraphicsPhase18");
  const constructionGeometry = buildSectionConstructionGeometry({
    geometry,
    sectionType,
    sectionEvidence,
    baseX,
    baseY,
    scale,
    levelProfiles,
  });
  const contextualSectionRooms =
    constructionGeometry.rooms.length || cutRooms.length
      ? []
      : buildContextualSectionRooms(geometry, sectionType, levelProfiles);
  const renderedSectionRooms = constructionGeometry.rooms.length
    ? constructionGeometry.rooms
    : cutRooms.length
      ? cutRooms
      : contextualSectionRooms;
  const renderedCutRoomCount = renderedSectionRooms.length;
  const renderedStairCount =
    constructionGeometry.stairs.length || intersectedStairs.length;

  if (
    isFeatureEnabled("useSectionRendererUpgradePhase8") &&
    !geometryComplete &&
    !allowWeakSectionFallback &&
    !minimalSectionFallback
  ) {
    return {
      svg: null,
      section_type: sectionType,
      stair_count: intersectedStairs.length,
      renderer: "deterministic-section-svg",
      title: `Section - ${sectionType}`,
      status: "blocked",
      blocking_reasons: [
        ...(sectionEvidence.blockers || []),
        ...(sectionEvidence.warnings || []),
      ],
      technical_quality_metadata: {
        drawing_type: "section",
        geometry_complete: false,
        cut_room_count: cutRooms.length,
        section_usefulness_score: 0,
        section_candidate_quality:
          sectionProfile?.sectionCandidateQuality || null,
        section_candidate_score: sectionProfile?.score || null,
        section_evidence_quality:
          sectionEvidence.summary?.evidenceQuality || "block",
        section_direct_evidence_count:
          sectionEvidence.summary?.directEvidenceCount || 0,
      },
    };
  }

  const datums = renderLevelDatums(
    baseX,
    baseY,
    horizontalExtent * scale,
    levelProfiles,
    scale,
    lineweights,
    sheetPolish,
  );
  const foundation = renderFoundation(
    baseX,
    baseY,
    horizontalExtent * scale,
    lineweights,
    foundationTruthQuality,
    constructionGeometry.foundation,
  );
  // Phase 3 — render the grade hatch beneath the foundation band so the
  // section reads with proper earth/ground continuity. Render-only; sits
  // behind the foundation visually (composed earlier in the SVG).
  const groundHatch = renderGroundHatch(
    baseX,
    baseY,
    horizontalExtent * scale,
    height,
    padding,
  );
  const cutRoomMarkup = renderCutRooms(
    renderedSectionRooms,
    sectionType,
    levelProfiles,
    baseX,
    baseY,
    scale,
    horizontalOrigin,
  );
  const stairMarkup = useDraftingGradeGraphics
    ? buildSectionStairDetailMarkup({
        stairs: constructionGeometry.stairs,
        lineweights,
      })
    : renderStairCut(
        constructionGeometry.stairs.length
          ? constructionGeometry.stairs
          : intersectedStairs,
        sectionType,
        baseX,
        baseY,
        scale,
        levelProfiles,
        horizontalOrigin,
      );
  const useClippedGraphics = isFeatureEnabled(
    "useClippedSectionGraphicsPhase13",
  );
  const wallMarkup = useClippedGraphics
    ? useDraftingGradeGraphics
      ? buildSectionWallDetailMarkup({
          walls: constructionGeometry.walls,
          lineweights,
        })
      : renderCutWalls(
          constructionGeometry.walls.length
            ? constructionGeometry.walls
            : cutWalls,
          sectionType,
          baseX,
          baseY,
          scale,
          levelProfiles,
          lineweights,
          horizontalOrigin,
        )
    : { markup: "", count: 0 };
  const openingMarkup = useClippedGraphics
    ? useDraftingGradeGraphics
      ? buildSectionOpeningDetailMarkup({
          openings: constructionGeometry.openings,
          lineweights,
        })
      : renderCutOpenings(
          constructionGeometry.openings.length
            ? constructionGeometry.openings
            : cutOpenings,
          sectionType,
          baseX,
          baseY,
          scale,
          levelProfiles,
          horizontalOrigin,
        )
    : { markup: "", count: 0 };
  const slabMarkup = renderSlabCuts(
    constructionGeometry.slabs.map((slab) => ({
      ...slab,
      x: baseX,
    })),
    lineweights,
    slabTruthQuality,
  );
  const sectionResolvedPitchDeg = (() => {
    const lang = String(
      resolvedStyleDNA.roof_language || geometry.roof?.type || "pitched gable",
    ).toLowerCase();
    if (lang.includes("flat") || lang.includes("parapet")) {
      return null;
    }
    return Number(
      geometry.metadata?.geometry_rules?.roof_pitch_degrees ||
        geometry.metadata?.canonical_construction_truth?.roof?.pitch_deg ||
        constructionGeometry.roof?.pitchDeg ||
        resolvedStyleDNA?.roofPitch ||
        resolvedStyleDNA?.roof_pitch ||
        35,
    );
  })();
  const roof = renderRoof(
    baseX,
    baseY - totalHeight * scale,
    horizontalExtent * scale,
    resolvedStyleDNA.roof_language || geometry.roof?.type || "pitched gable",
    lineweights,
    roofTruthQuality,
    constructionGeometry.roof,
    sectionResolvedPitchDeg,
  );
  const evidenceUsefulnessScore = Math.max(
    Number(sectionSemantics?.scores?.usefulness || 0),
    Number(sectionEvidence.summary?.usefulnessScore || 0),
  );
  const renderedUsefulnessScore =
    (renderedCutRoomCount > 0 ? 0.62 : 0.2) +
    (renderedStairCount > 0 ? 0.18 : 0) +
    (levelProfiles.length > 1 ? 0.12 : 0.04);
  const usefulnessScore = roundMetric(
    clamp(Math.max(evidenceUsefulnessScore, renderedUsefulnessScore), 0, 1),
  );
  const slotOccupancyRatio = Number(
    clamp(
      (horizontalExtent * scale * (totalHeight * scale)) /
        Math.max((width - padding * 2) * (height - padding * 2), 1),
      0,
      1,
    ).toFixed(3),
  );
  const scaleBar = renderScaleBar(
    scale,
    width,
    height,
    padding,
    showInternalTitleBlock
      ? { ...sheetPolish }
      : {
          y: height - 34,
          labelYOffset: 14,
          fontSize: 9,
          ...sheetPolish,
        },
  );
  const titleBlockStroke = polishSize(1.1, sheetPolish.strokeScale);
  const titleBlockTitleFont = polishSize(14, sheetPolish.fontScale);
  const titleBlockMetaFont = polishSize(10, sheetPolish.fontScale);
  const titleBlockMarkup = showInternalTitleBlock
    ? `
    <g id="phase8-section-title-block">
      <rect x="${formatNumber(padding)}" y="${formatNumber(
        height - padding + 10,
      )}" width="338" height="46" fill="${SECTION_THEME.paper}" stroke="${SECTION_THEME.line}" stroke-width="${titleBlockStroke}"/>
      <text x="${formatNumber(padding + 12)}" y="${formatNumber(
        height - padding + 27,
      )}" font-size="${titleBlockTitleFont}" font-family="Arial, sans-serif" font-weight="700" class="sheet-critical-label" data-text-role="critical">${escapeXml(
        sectionProfile?.strategyName
          ? `${sectionProfile.strategyName} Section`
          : `Section - ${sectionType.toUpperCase()}`,
      )}</text>
      <text x="${formatNumber(padding + 12)}" y="${formatNumber(
        height - padding + 43,
      )}" font-size="${titleBlockMetaFont}" font-family="Arial, sans-serif" class="sheet-critical-label" data-text-role="critical">${escapeXml(
        `Bounds ${envelopeBounds.source} · ${Math.round(
          slotOccupancyRatio * 100,
        )}% slot occupancy`,
      )}</text>
    </g>
  `
    : "";

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-theme="${SECTION_THEME.name}" data-bounds-source="${envelopeBounds.source}">
  <rect width="${width}" height="${height}" fill="${SECTION_THEME.paper}" />
  ${stairMarkup.defs || ""}
  ${
    sheetMode
      ? ""
      : `<text x="${padding}" y="34" font-size="19" font-family="Arial, sans-serif" font-weight="700">${escapeXml(
          sectionProfile?.strategyName
            ? `${sectionProfile.strategyName} Section`
            : `Section - ${sectionType.toUpperCase()}`,
        )}</text>
  <text x="${padding}" y="50" font-size="11" font-family="Arial, sans-serif">${escapeXml(
    `Cut coordinate ${cutCoordinate.toFixed(2)}m / usefulness ${usefulnessScore.toFixed(2)} / ${String(sectionProfile?.strategyId || "default-cut")}`,
  )}</text>`
  }
  ${groundHatch.markup}
  ${foundation}
  ${roof}
  ${datums.markup}
  ${slabMarkup.markup}
  ${cutRoomMarkup.markup}
  ${wallMarkup.markup}
  ${openingMarkup.markup}
  ${stairMarkup.markup}
  ${renderOverallSectionDimensions(
    baseX,
    baseY,
    horizontalExtent * scale,
    totalHeight * scale,
    totalHeight,
    horizontalExtent,
    width,
    padding,
    sheetPolish,
  )}
  ${titleBlockMarkup}
  ${scaleBar.markup}
  ${options.overlayMarkup || ""}
</svg>`;

  return {
    svg,
    section_type: sectionType,
    stair_count: intersectedStairs.length,
    renderer: "deterministic-section-svg",
    title: `Section - ${sectionType}`,
    technical_quality_metadata: {
      drawing_type: "section",
      sheet_mode: sheetMode,
      has_title: !sheetMode,
      has_title_block: showInternalTitleBlock,
      has_scale_bar: true,
      has_overall_dimensions: true,
      geometry_complete: geometryComplete,
      stair_count: renderedStairCount,
      room_label_count: options.hideRoomLabels ? 0 : renderedCutRoomCount,
      wall_cut_count: cutWalls.length,
      slab_line_count: levelProfiles.length,
      level_label_count: levelProfiles.length,
      cut_room_count: renderedCutRoomCount,
      cut_opening_count: cutOpenings.length,
      foundation_marker_count: 1,
      ground_hatch_band_lines: groundHatch.count,
      ground_hatch_visible: groundHatch.count > 0,
      stair_tread_count: stairMarkup.treadCount,
      roof_profile_visible: true,
      section_usefulness_score: usefulnessScore,
      section_candidate_quality:
        sectionProfile?.sectionCandidateQuality || null,
      section_candidate_score: sectionProfile?.score || null,
      section_strategy_id:
        sectionProfile?.strategyId ||
        sectionProfile?.chosenStrategy?.id ||
        null,
      section_strategy_name:
        sectionProfile?.strategyName ||
        sectionProfile?.chosenStrategy?.name ||
        null,
      section_expected_communication_value: Number(
        sectionProfile?.expectedCommunicationValue || 0,
      ),
      focus_entity_count: (sectionProfile?.focusEntityIds || []).length,
      cut_coordinate_m: cutCoordinate,
      bounds_source: envelopeBounds.source,
      blueprint_theme: SECTION_THEME.name,
      a1_quality_polish: sheetMode ? "section_datums_dimensions_v1" : null,
      slot_occupancy_ratio: slotOccupancyRatio,
      scale_bar_meters: scaleBar.barMeters,
      section_evidence_quality:
        sectionEvidence.summary?.evidenceQuality || null,
      section_direct_evidence_quality:
        sectionEvidence.summary?.directEvidenceQuality || null,
      section_inferred_evidence_quality:
        sectionEvidence.summary?.inferredEvidenceQuality || null,
      section_direct_evidence_count:
        sectionEvidence.summary?.directEvidenceCount || 0,
      section_direct_evidence_score:
        sectionEvidence.summary?.directEvidenceScore || 0,
      section_near_evidence_count:
        sectionEvidence.summary?.nearEvidenceCount || 0,
      section_inferred_evidence_count:
        sectionEvidence.summary?.inferredEvidenceCount || 0,
      section_inferred_evidence_score:
        sectionEvidence.summary?.inferredEvidenceScore || 0,
      section_communication_value:
        sectionEvidence.summary?.communicationValue || usefulnessScore,
      section_construction_truth_quality:
        sectionEvidence.summary?.sectionConstructionTruthQuality || null,
      section_construction_evidence_quality:
        sectionEvidence.summary?.sectionConstructionEvidenceQuality || null,
      section_truth_model_version:
        sectionTruthModel?.version ||
        sectionEvidence.summary?.sectionTruthModelVersion ||
        null,
      section_construction_evidence_score:
        sectionEvidence.summary?.constructionEvidenceScore || 0,
      section_direct_construction_truth_count:
        sectionTruthModel?.overall?.directCount ||
        sectionEvidence.summary?.directConstructionTruthCount ||
        0,
      section_contextual_construction_truth_count:
        sectionTruthModel?.overall?.contextualCount ||
        sectionEvidence.summary?.contextualConstructionTruthCount ||
        0,
      section_derived_construction_truth_count:
        sectionTruthModel?.overall?.derivedCount ||
        sectionEvidence.summary?.derivedConstructionTruthCount ||
        0,
      section_unsupported_construction_truth_count:
        sectionTruthModel?.overall?.unsupportedCount ||
        sectionEvidence.summary?.unsupportedConstructionTruthCount ||
        0,
      section_contextual_evidence_score:
        sectionEvidence.summary?.sectionContextualEvidenceScore || 0,
      section_contextual_evidence_quality:
        sectionEvidence.summary?.sectionContextualEvidenceQuality || null,
      section_derived_evidence_score:
        sectionEvidence.summary?.sectionDerivedEvidenceScore || 0,
      section_derived_evidence_quality:
        sectionEvidence.summary?.sectionDerivedEvidenceQuality || null,
      section_exact_construction_clip_count:
        sectionEvidence.summary?.exactConstructionClipCount || 0,
      section_exact_profile_clip_count:
        sectionEvidence.summary?.exactConstructionProfileClipCount || 0,
      section_near_boolean_clip_count:
        sectionEvidence.summary?.nearBooleanConstructionClipCount || 0,
      section_band_coverage_ratio:
        sectionEvidence.summary?.averageConstructionBandCoverageRatio || 0,
      section_profile_segment_count:
        sectionEvidence.summary?.constructionProfileSegmentCount || 0,
      section_direct_profile_hit_count:
        sectionEvidence.summary?.directConstructionProfileHitCount || 0,
      section_profile_complexity_score:
        sectionEvidence.summary?.sectionProfileComplexityScore || 0,
      section_drafting_evidence_score:
        sectionEvidence.summary?.sectionDraftingEvidenceScore || 0,
      section_cut_face_truth_available: Boolean(
        sectionEvidence.summary?.sectionCutFaceTruthAvailable ||
        (sectionFaceBundle?.summary?.cutFaceCount || 0) > 0,
      ),
      section_face_bundle_version: sectionFaceBundle?.version || null,
      section_face_total_count:
        sectionFaceBundle?.summary?.totalCount ||
        sectionFaceSummary?.totalCount ||
        0,
      section_face_cut_face_count:
        sectionFaceBundle?.summary?.cutFaceCount ||
        sectionFaceSummary?.cutFaceCount ||
        0,
      section_face_cut_profile_count:
        sectionFaceBundle?.summary?.cutProfileCount ||
        sectionFaceSummary?.cutProfileCount ||
        0,
      section_face_contextual_count:
        sectionFaceBundle?.summary?.contextualCount ||
        sectionFaceSummary?.contextualCount ||
        0,
      section_face_derived_count:
        sectionFaceBundle?.summary?.derivedCount ||
        sectionFaceSummary?.derivedCount ||
        0,
      section_face_total_area_m2:
        sectionFaceBundle?.summary?.totalAreaM2 ||
        sectionFaceSummary?.totalAreaM2 ||
        0,
      section_face_credibility_score:
        sectionFaceBundle?.credibility?.score ||
        sectionFaceSummary?.credibilityScore ||
        0,
      section_face_credibility_quality:
        sectionFaceBundle?.credibility?.quality ||
        sectionFaceSummary?.credibilityQuality ||
        null,
      section_cut_face_construction_truth_count:
        sectionEvidence.summary?.cutFaceConstructionTruthCount || 0,
      section_cut_profile_construction_truth_count:
        sectionEvidence.summary?.cutProfileConstructionTruthCount || 0,
      section_contextual_profile_construction_truth_count:
        sectionEvidence.summary?.contextualProfileConstructionTruthCount || 0,
      section_derived_profile_construction_truth_count:
        sectionEvidence.summary?.derivedProfileConstructionTruthCount || 0,
      section_average_construction_profile_continuity:
        sectionEvidence.summary?.averageConstructionProfileContinuity || 0,
      wall_section_clip_quality:
        sectionEvidence.summary?.wallSectionClipQuality || null,
      opening_section_clip_quality:
        sectionEvidence.summary?.openingSectionClipQuality || null,
      stair_section_clip_quality:
        sectionEvidence.summary?.stairSectionClipQuality || null,
      slab_section_clip_quality:
        sectionEvidence.summary?.slabSectionClipQuality || null,
      roof_section_clip_quality:
        sectionEvidence.summary?.roofSectionClipQuality || null,
      foundation_section_clip_quality:
        sectionEvidence.summary?.foundationSectionClipQuality || null,
      cut_wall_truth_quality:
        sectionEvidence.summary?.cutWallTruthQuality || null,
      cut_wall_direct_truth_count:
        sectionEvidence.summary?.cutWallDirectTruthCount || 0,
      cut_wall_contextual_truth_count:
        sectionEvidence.summary?.cutWallContextualTruthCount || 0,
      cut_wall_derived_truth_count:
        sectionEvidence.summary?.cutWallDerivedTruthCount || 0,
      cut_wall_exact_clip_count:
        sectionEvidence.summary?.cutWallExactClipCount || 0,
      cut_opening_truth_quality:
        sectionEvidence.summary?.cutOpeningTruthQuality || null,
      cut_opening_direct_truth_count:
        sectionEvidence.summary?.cutOpeningDirectTruthCount || 0,
      cut_opening_contextual_truth_count:
        sectionEvidence.summary?.cutOpeningContextualTruthCount || 0,
      cut_opening_derived_truth_count:
        sectionEvidence.summary?.cutOpeningDerivedTruthCount || 0,
      cut_opening_exact_clip_count:
        sectionEvidence.summary?.cutOpeningExactClipCount || 0,
      stair_truth_quality: sectionEvidence.summary?.stairTruthQuality || null,
      stair_direct_truth_count:
        sectionEvidence.summary?.stairDirectTruthCount || 0,
      stair_contextual_truth_count:
        sectionEvidence.summary?.stairContextualTruthCount || 0,
      stair_derived_truth_count:
        sectionEvidence.summary?.stairDerivedTruthCount || 0,
      slab_truth_quality: sectionEvidence.summary?.slabTruthQuality || null,
      slab_exact_clip_count:
        sectionEvidence.summary?.directSlabExactClipCount || 0,
      roof_truth_quality: sectionEvidence.summary?.roofTruthQuality || null,
      roof_truth_mode: roofTruthMode,
      roof_truth_state: roofTruthState,
      roof_explicit_primitive_count:
        sectionEvidence.summary?.explicitRoofPrimitiveCount || 0,
      roof_edge_count: sectionEvidence.summary?.explicitRoofEdgeCount || 0,
      roof_parapet_count: sectionEvidence.summary?.explicitParapetCount || 0,
      roof_break_count: sectionEvidence.summary?.explicitRoofBreakCount || 0,
      roof_hip_count: sectionEvidence.summary?.explicitHipCount || 0,
      roof_valley_count: sectionEvidence.summary?.explicitValleyCount || 0,
      roof_attachment_count:
        sectionEvidence.summary?.explicitDormerAttachmentCount || 0,
      roof_direct_clip_count: sectionEvidence.summary?.directRoofCount || 0,
      roof_direct_truth_count:
        sectionEvidence.summary?.roofDirectTruthCount || 0,
      roof_contextual_truth_count:
        sectionEvidence.summary?.roofContextualTruthCount || 0,
      roof_derived_truth_count:
        sectionEvidence.summary?.roofDerivedTruthCount || 0,
      roof_exact_clip_count:
        sectionEvidence.summary?.directRoofExactClipCount || 0,
      foundation_truth_quality:
        sectionEvidence.summary?.foundationTruthQuality || null,
      foundation_truth_mode: foundationTruthMode,
      foundation_truth_state: foundationTruthState,
      foundation_direct_clip_count:
        sectionEvidence.summary?.directFoundationCount || 0,
      foundation_direct_truth_count:
        sectionEvidence.summary?.foundationDirectTruthCount || 0,
      foundation_contextual_truth_count:
        sectionEvidence.summary?.foundationContextualTruthCount || 0,
      foundation_derived_truth_count:
        sectionEvidence.summary?.foundationDerivedTruthCount || 0,
      base_condition_direct_clip_count:
        sectionEvidence.summary?.directBaseConditionCount || 0,
      base_condition_direct_truth_count:
        sectionEvidence.summary?.baseConditionDirectTruthCount || 0,
      base_condition_contextual_truth_count:
        sectionEvidence.summary?.baseConditionContextualTruthCount || 0,
      base_condition_derived_truth_count:
        sectionEvidence.summary?.baseConditionDerivedTruthCount || 0,
      explicit_foundation_count:
        sectionEvidence.summary?.explicitFoundationCount || 0,
      explicit_base_condition_count:
        sectionEvidence.summary?.explicitBaseConditionCount || 0,
      explicit_ground_relation_count:
        sectionEvidence.summary?.explicitGroundRelationCount || 0,
      foundation_zone_count: sectionEvidence.summary?.foundationZoneCount || 0,
      base_wall_condition_count:
        sectionEvidence.summary?.baseWallConditionCount || 0,
      section_fallback_dependence:
        sectionEvidence.summary?.constructionFallbackDependence || 0,
      section_direct_clip_count: sectionEvidence.summary?.directClipCount || 0,
      section_approximate_evidence_count:
        sectionEvidence.summary?.approximateEvidenceCount || 0,
      section_cut_opening_count: sectionEvidence.summary?.cutOpeningCount || 0,
      section_focus_hit_count: sectionEvidence.summary?.focusHitCount || 0,
      chosen_section_rationale:
        sectionEvidence.summary?.chosenSectionRationale ||
        sectionProfile?.rationale?.[0] ||
        null,
    },
  };
}

export default {
  renderSectionSvg,
};

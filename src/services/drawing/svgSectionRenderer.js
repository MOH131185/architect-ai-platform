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

function renderLevelDatums(baseX, baseY, widthPx, levelProfiles, scale) {
  const lines = [];
  const labels = [];
  levelProfiles.forEach((level) => {
    const topY = baseY - level.top_m * scale;
    const midY =
      baseY - (level.bottom_m + Number(level.height_m || 3.2) / 2) * scale;
    lines.push(
      `<line x1="${baseX}" y1="${topY}" x2="${baseX + widthPx}" y2="${topY}" stroke="#5b6470" stroke-width="1.2" />`,
    );
    labels.push(`
      <line x1="${baseX - 52}" y1="${topY}" x2="${baseX - 6}" y2="${topY}" stroke="#374151" stroke-width="1" />
      <text x="${baseX - 58}" y="${topY + 4}" font-size="10" font-family="Arial, sans-serif" font-weight="700" text-anchor="end">${escapeXml(
        `${level.name || `L${level.level_number}`} +${level.top_m.toFixed(2)}m`,
      )}</text>
      <text x="${baseX - 10}" y="${midY}" font-size="9" font-family="Arial, sans-serif" text-anchor="end">${escapeXml(
        level.name || `L${level.level_number}`,
      )}</text>
    `);
  });

  labels.push(`
    <line x1="${baseX - 52}" y1="${baseY}" x2="${baseX - 6}" y2="${baseY}" stroke="#111" stroke-width="1.2" />
    <text x="${baseX - 58}" y="${baseY + 4}" font-size="10" font-family="Arial, sans-serif" font-weight="700" text-anchor="end">FFL +0.00m</text>
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
      <rect x="${band.x}" y="${baseY - 18}" width="${band.width}" height="18" fill="#c8c0b2" fill-opacity="${bandOpacity}" stroke="#444" stroke-width="${lineweights.primary || 1.2}"${bandDash} data-truth-state="${band.truthState || "direct"}" />`;
    })
    .join("");
  const groundLineMarkup = (foundationGeometry?.groundLines || [])
    .map(
      (entry) =>
        `<line x1="${entry.x}" y1="${baseY + 12}" x2="${entry.x + entry.width}" y2="${baseY + 12}" stroke="#6b7280" stroke-width="${lineweights.secondary || 1}"${entry.truthState === "contextual" ? ' stroke-dasharray="5 4" stroke-opacity="0.72"' : ""} data-truth-state="${entry.truthState || "direct"}" />`,
    )
    .join("");
  const plinthMarkup = (foundationGeometry?.plinthLines || [])
    .map(
      (entry) =>
        `<line x1="${entry.x}" y1="${baseY - 2}" x2="${entry.x + entry.width}" y2="${baseY - 2}" stroke="#3f3f46" stroke-width="${lineweights.primary || 1.2}"${entry.truthState === "contextual" ? ' stroke-dasharray="5 4" stroke-opacity="0.76"' : ""} data-truth-state="${entry.truthState || "direct"}" />`,
    )
    .join("");
  const stepMarkup = (foundationGeometry?.stepLines || [])
    .map(
      (entry) =>
        `<path d="M ${entry.x} ${baseY + 8} L ${entry.x + entry.width / 2} ${baseY - 6} L ${entry.x + entry.width} ${baseY - 6}" fill="none" stroke="#7c6f64" stroke-width="${lineweights.secondary || 1}" stroke-dasharray="${entry.truthState === "contextual" ? "6 5" : "5 4"}"${entry.truthState === "contextual" ? ' stroke-opacity="0.74"' : ""} data-truth-state="${entry.truthState || "direct"}" />`,
    )
    .join("");
  const interfaceMarkup = (foundationGeometry?.slabGroundInterfaces || [])
    .map(
      (entry) =>
        `<line x1="${entry.x}" y1="${baseY}" x2="${entry.x + entry.width}" y2="${baseY}" stroke="#111" stroke-width="${lineweights.cutOutline || 2}"${entry.truthState === "contextual" ? ' stroke-dasharray="6 4" stroke-opacity="0.76"' : ""} data-truth-state="${entry.truthState || "direct"}" />`,
    )
    .join("");
  const zoneMarkup = (foundationGeometry?.zones || [])
    .map(
      (entry) =>
        `<rect x="${entry.x}" y="${baseY + 6}" width="${entry.width}" height="12" fill="#bfa98d"${entry.truthState === "contextual" ? ' fill-opacity="0.72"' : ""} stroke="#6b5d4f" stroke-width="${lineweights.secondary || 1}"${entry.truthState === "contextual" ? ' stroke-dasharray="5 4" stroke-opacity="0.74"' : ""} data-truth-state="${entry.truthState || "direct"}" />`,
    )
    .join("");
  const baseWallConditionMarkup = (foundationGeometry?.baseWallConditions || [])
    .map(
      (entry) =>
        `<line x1="${entry.x}" y1="${baseY - 10}" x2="${entry.x + entry.width}" y2="${baseY - 10}" stroke="#5f5146" stroke-width="${lineweights.secondary || 1}"${entry.truthState === "contextual" ? ' stroke-dasharray="6 4" stroke-opacity="0.74"' : ""} data-truth-state="${entry.truthState || "direct"}" />`,
    )
    .join("");
  return `
    <g id="phase8-section-foundation" data-truth="${quality}" data-truth-mode="${truthMode}" data-truth-state="${truthState}">
      <rect x="${baseX - 10}" y="${baseY}" width="${widthPx + 20}" height="42" fill="#ded8cc" fill-opacity="${fillOpacity}" />
      ${bandMarkup}
      ${zoneMarkup}
      ${groundLineMarkup}
      ${plinthMarkup}
      ${baseWallConditionMarkup}
      ${stepMarkup}
      ${interfaceMarkup}
      <line x1="${baseX - 14}" y1="${baseY}" x2="${baseX + widthPx + 14}" y2="${baseY}" stroke="#1f2937" stroke-width="${lineweights.cutOutline || 2}"${dasharray} />
      <line x1="${baseX - 14}" y1="${baseY + 12}" x2="${baseX + widthPx + 14}" y2="${baseY + 12}" stroke="#8b8172" stroke-width="${lineweights.secondary || 1}" stroke-dasharray="6 4" />
      ${
        contextual
          ? `<text x="${baseX + widthPx - 6}" y="${baseY + 34}" font-size="8" font-family="Arial, sans-serif" text-anchor="end" fill="#6b7280">FOUNDATION CONTEXTUAL</text>`
          : ""
      }
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
        `<line x1="${entry.x}" y1="${topY - 15}" x2="${entry.x + entry.width}" y2="${topY - 15}" stroke="#111" stroke-width="${lineweights.primary || 1.4}"${entry.truthState === "contextual" ? ' stroke-dasharray="6 4" stroke-opacity="0.74"' : dasharray} data-truth-state="${entry.truthState || "direct"}" />`,
    )
    .join("");
  const roofBreakMarkup = (roofGeometry?.roofBreaks || [])
    .map(
      (entry) =>
        `<line x1="${entry.x}" y1="${topY - 26}" x2="${entry.x}" y2="${topY + 4}" stroke="#4b5563" stroke-width="${lineweights.secondary || 1}" stroke-dasharray="${entry.truthState === "contextual" ? "6 5" : "4 4"}"${entry.truthState === "contextual" ? ' stroke-opacity="0.74"' : ""} data-truth-state="${entry.truthState || "direct"}" />`,
    )
    .join("");
  const attachmentMarkup = (roofGeometry?.attachments || [])
    .map(
      (entry) =>
        `<rect x="${entry.x}" y="${topY - 28}" width="${Math.max(10, entry.width)}" height="12" fill="#f2f4f7"${entry.truthState === "contextual" ? ' fill-opacity="0.72"' : ""} stroke="#374151" stroke-width="0.9"${entry.truthState === "contextual" ? ' stroke-dasharray="5 4" stroke-opacity="0.76"' : ""} data-truth-state="${entry.truthState || "direct"}" />`,
    )
    .join("");
  const hipMarkup = (roofGeometry?.hips || [])
    .map(
      (entry) =>
        `<line x1="${entry.x}" y1="${topY - 34}" x2="${entry.x}" y2="${topY}" stroke="#3f4b59" stroke-width="${lineweights.secondary || 1}"${entry.truthState === "contextual" ? ' stroke-dasharray="6 4" stroke-opacity="0.74"' : ""} data-truth-state="${entry.truthState || "direct"}" />`,
    )
    .join("");
  const valleyMarkup = (roofGeometry?.valleys || [])
    .map(
      (entry) =>
        `<line x1="${entry.x}" y1="${topY - 30}" x2="${entry.x}" y2="${topY - 2}" stroke="#64748b" stroke-width="${lineweights.secondary || 1}" stroke-dasharray="${entry.truthState === "contextual" ? "7 5" : "4 4"}"${entry.truthState === "contextual" ? ' stroke-opacity="0.76"' : ""} data-truth-state="${entry.truthState || "direct"}" />`,
    )
    .join("");
  if (flat) {
    return `
      <g id="phase14-section-roof" data-truth="${quality}" data-truth-mode="${truthMode}" data-truth-state="${truthState}">
      <rect x="${roofX}" y="${topY - 12}" width="${roofWidth}" height="12" fill="#d5dae1" fill-opacity="${quality === "blocked" ? 0.45 : quality === "weak" ? 0.68 : 1}" stroke="#111" stroke-opacity="${strokeOpacity}" stroke-width="${lineweights.primary || 1.6}"${dasharray} />
      <line x1="${roofX}" y1="${topY - 12}" x2="${roofX + roofWidth}" y2="${topY - 12}" stroke="#111" stroke-opacity="${strokeOpacity}" stroke-width="${lineweights.cutOutline || 2}"${dasharray} />
      <line x1="${roofX + 8}" y1="${topY - 7}" x2="${roofX + roofWidth - 8}" y2="${topY - 7}" stroke="#6b7280" stroke-width="${lineweights.tertiary || 0.8}" />
      ${parapetMarkup}
      ${roofBreakMarkup}
      ${hipMarkup}
      ${valleyMarkup}
      ${attachmentMarkup}
      </g>
    `;
  }

  return `
    <g id="phase14-section-roof" data-truth="${quality}" data-truth-mode="${truthMode}" data-truth-state="${truthState}">
    <path d="M ${roofX} ${topY} L ${roofX + roofWidth / 2} ${topY - 52} L ${roofX + roofWidth} ${topY}" fill="none" stroke="#111" stroke-opacity="${strokeOpacity}" stroke-width="${lineweights.cutOutline || 2}"${dasharray} />
    <path d="M ${roofX + 10} ${topY} L ${roofX + roofWidth / 2} ${topY - 40} L ${roofX + roofWidth - 10} ${topY}" fill="none" stroke="#6b7280" stroke-opacity="${strokeOpacity}" stroke-width="${lineweights.secondary || 0.9}"${dasharray} />
    <line x1="${roofX + 10}" y1="${topY - 8}" x2="${roofX + roofWidth - 10}" y2="${topY - 8}" stroke="#6b7280" stroke-width="${lineweights.tertiary || 0.8}" stroke-dasharray="4 4" />
    ${roofBreakMarkup}
    ${hipMarkup}
    ${valleyMarkup}
    ${attachmentMarkup}
    </g>
  `;
}

function renderCutRooms(
  cutRooms = [],
  sectionType = "longitudinal",
  levelProfiles = [],
  baseX = 0,
  baseY = 0,
  scale = 1,
) {
  const markup = cutRooms
    .map((room) => {
      const level =
        room.level || levelProfiles.find((entry) => entry.id === room.level_id);
      if (!level) {
        return "";
      }

      const projection = room.range || sectionDisplayRange(room, sectionType);
      const x = room.x ?? baseX + projection.start * scale;
      const widthPx =
        room.width ?? Math.max(18, (projection.end - projection.start) * scale);
      const y = room.y ?? baseY - level.top_m * scale;
      const heightPx =
        room.height ?? Math.max(24, Number(level.height_m || 3.2) * scale);
      const name = escapeXml(
        String(room.name || room.id || "ROOM").toUpperCase(),
      );

      return `
        <g class="phase8-cut-room">
          <rect x="${x}" y="${y}" width="${widthPx}" height="${heightPx}" fill="#f9f7f2" stroke="#222" stroke-width="2.2" />
          <line x1="${x}" y1="${y + heightPx}" x2="${x + widthPx}" y2="${y + heightPx}" stroke="#111" stroke-width="2.6" />
          <line x1="${x}" y1="${y}" x2="${x}" y2="${y + heightPx}" stroke="#111" stroke-width="2.6" />
          <text x="${x + widthPx / 2}" y="${y + heightPx / 2 - 3}" font-size="10.5" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle">${name}</text>
          <text x="${x + widthPx / 2}" y="${y + heightPx / 2 + 10}" font-size="9" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(
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
      const x = stair.x ?? baseX + projection.start * scale;
      const widthPx =
        stair.width ??
        Math.max(20, (projection.end - projection.start) * scale);
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
      const treadSpacing = heightPx / treadCount;
      const treads = Array.from({ length: treadCount }, (_, index) => {
        const treadY = y + treadSpacing * (index + 1);
        return `<line x1="${x + 4}" y1="${treadY}" x2="${x + widthPx - 4}" y2="${treadY}" stroke="#444" stroke-width="0.9" />`;
      }).join("");

      return `
        <g id="phase8-section-stair-${escapeXml(stair.id || "stair")}">
          <rect x="${x}" y="${y}" width="${widthPx}" height="${heightPx}" fill="#efefef" stroke="#333" stroke-width="1.4" />
          ${treads}
          <text x="${x + widthPx / 2}" y="${y + 16}" font-size="10" font-family="Arial, sans-serif" text-anchor="middle">STAIR</text>
          <text x="${x + widthPx / 2}" y="${y + heightPx - 6}" font-size="9" font-family="Arial, sans-serif" text-anchor="middle">UP</text>
        </g>
      `;
    })
    .join("");

  return {
    markup: `<g id="phase8-section-stair-cuts">${markup}</g>`,
    count: (stairs || []).length,
    treadCount: (stairs || []).length * 7,
  };
}

function renderSlabCuts(
  slabs = [],
  lineweights = {},
  slabTruthQuality = "weak",
) {
  const quality = String(slabTruthQuality || "weak").toLowerCase();
  const dasharray = quality === "verified" ? "" : ' stroke-dasharray="6 4"';
  const markup = (slabs || [])
    .map(
      (slab) => `
        <g id="phase14-section-slab-${escapeXml(slab.level?.id || slab.id)}" data-truth="${quality}">
          <line x1="${slab.x || 0}" y1="${slab.y}" x2="${(slab.x || 0) + slab.width}" y2="${slab.y}" stroke="#111" stroke-width="${lineweights.primary || 1.2}"${dasharray} />
          <line x1="${slab.x || 0}" y1="${slab.y + 4}" x2="${(slab.x || 0) + slab.width}" y2="${slab.y + 4}" stroke="#6b7280" stroke-width="${lineweights.tertiary || 0.8}" />
        </g>`,
    )
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
      const center = (Number(projection.start) + Number(projection.end)) / 2;
      const widthPx = Math.max(
        8,
        Number(wall.thickness_m || 0.18) * scale,
        Math.abs(Number(projection.end) - Number(projection.start)) * scale,
      );
      const x = baseX + center * scale - widthPx / 2;
      const y = baseY - level.top_m * scale;
      const heightPx = Math.max(24, Number(level.height_m || 3.2) * scale);

      return `
        <rect id="phase13-section-cut-wall-${escapeXml(wall.id || index)}" x="${x}" y="${y}" width="${widthPx}" height="${heightPx}" fill="#151515" fill-opacity="0.82" stroke="#111" stroke-width="1.2" />
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
      const widthPx = Math.max(
        10,
        Math.abs(Number(projection.end) - Number(projection.start)) * scale,
      );
      const x = baseX + Number(projection.start) * scale;
      const y = baseY - (level.bottom_m + headHeight) * scale;
      const heightPx = Math.max(10, (headHeight - sillHeight) * scale);

      return `
        <g id="phase13-section-cut-opening-${escapeXml(opening.id || index)}">
          <rect x="${x}" y="${y}" width="${widthPx}" height="${heightPx}" fill="#ffffff" stroke="#475569" stroke-width="1" />
          <line x1="${x}" y1="${y}" x2="${x + widthPx}" y2="${y}" stroke="#111" stroke-width="1" />
          <line x1="${x}" y1="${y + heightPx}" x2="${x + widthPx}" y2="${y + heightPx}" stroke="#111" stroke-width="1" />
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
  const rawGeometryInput =
    geometryInput?.projectGeometry ||
    geometryInput?.geometry ||
    geometryInput ||
    {};
  const geometry = coerceToCanonicalProjectGeometry({
    ...rawGeometryInput,
    metadata: rawGeometryInput?.metadata || {},
  });
  const sectionType = String(
    options.sectionType || "longitudinal",
  ).toLowerCase();
  const sectionProfile = options.sectionProfile || null;
  const sectionSemantics = options.sectionSemantics || null;
  const levelProfiles = getLevelProfiles(geometry);
  const width = options.width || 1200;
  const height = options.height || 760;
  const padding = 86;
  const bounds = getBuildableBounds(geometry);
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
    (height - padding * 2) / Math.max(totalHeight + 1.4, 1),
  );
  const baseX = (width - horizontalExtent * scale) / 2;
  const baseY = height - padding;
  const sectionEvidence =
    options.sectionEvidence || buildSectionEvidence(geometry, sectionProfile);
  const lineweights = getSectionLineweights({
    constructionTruthQuality:
      sectionEvidence.summary?.sectionConstructionTruthQuality ||
      sectionEvidence.summary?.directEvidenceQuality ||
      "weak",
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
  const useDraftingGradeGraphics = isFeatureEnabled(
    "useDraftingGradeSectionGraphicsPhase14",
  );
  const constructionGeometry = buildSectionConstructionGeometry({
    geometry,
    sectionType,
    sectionEvidence,
    baseX,
    baseY,
    scale,
    levelProfiles,
  });

  if (
    isFeatureEnabled("useSectionRendererUpgradePhase8") &&
    !geometryComplete
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
  );
  const foundation = renderFoundation(
    baseX,
    baseY,
    horizontalExtent * scale,
    lineweights,
    foundationTruthQuality,
    constructionGeometry.foundation,
  );
  const cutRoomMarkup = renderCutRooms(
    constructionGeometry.rooms.length ? constructionGeometry.rooms : cutRooms,
    sectionType,
    levelProfiles,
    baseX,
    baseY,
    scale,
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
  const roof = renderRoof(
    baseX,
    baseY - totalHeight * scale,
    horizontalExtent * scale,
    styleDNA.roof_language || geometry.roof?.type || "pitched gable",
    lineweights,
    roofTruthQuality,
    constructionGeometry.roof,
  );
  const usefulnessScore = roundMetric(
    clamp(
      Number(sectionSemantics?.scores?.usefulness || 0) ||
        Number(sectionEvidence.summary?.usefulnessScore || 0) ||
        (cutRooms.length > 0 ? 0.62 : 0.2) +
          (intersectedStairs.length > 0 ? 0.18 : 0) +
          (levelProfiles.length > 1 ? 0.12 : 0.04),
      0,
      1,
    ),
  );

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#fff" />
  ${stairMarkup.defs || ""}
  <text x="${padding}" y="34" font-size="22" font-family="Arial, sans-serif" font-weight="700">${escapeXml(
    sectionProfile?.strategyName
      ? `${sectionProfile.strategyName} Section`
      : `Section - ${sectionType.toUpperCase()}`,
  )}</text>
  <text x="${padding}" y="50" font-size="10" font-family="Arial, sans-serif">${escapeXml(
    `Cut coordinate ${cutCoordinate.toFixed(2)}m / usefulness ${usefulnessScore.toFixed(2)} / ${String(sectionProfile?.strategyId || "default-cut")}`,
  )}</text>
  ${foundation}
  ${roof}
  ${datums.markup}
  ${slabMarkup.markup}
  ${cutRoomMarkup.markup}
  ${wallMarkup.markup}
  ${openingMarkup.markup}
  ${stairMarkup.markup}
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
      has_title: true,
      geometry_complete: geometryComplete,
      stair_count: intersectedStairs.length,
      room_label_count: options.hideRoomLabels ? 0 : cutRooms.length,
      wall_cut_count: cutWalls.length,
      slab_line_count: levelProfiles.length,
      level_label_count: levelProfiles.length,
      cut_room_count: cutRooms.length,
      cut_opening_count: cutOpenings.length,
      foundation_marker_count: 1,
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
      section_construction_evidence_score:
        sectionEvidence.summary?.constructionEvidenceScore || 0,
      cut_wall_truth_quality:
        sectionEvidence.summary?.cutWallTruthQuality || null,
      cut_wall_exact_clip_count:
        sectionEvidence.summary?.cutWallExactClipCount || 0,
      cut_opening_truth_quality:
        sectionEvidence.summary?.cutOpeningTruthQuality || null,
      cut_opening_exact_clip_count:
        sectionEvidence.summary?.cutOpeningExactClipCount || 0,
      stair_truth_quality: sectionEvidence.summary?.stairTruthQuality || null,
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
      roof_exact_clip_count:
        sectionEvidence.summary?.directRoofExactClipCount || 0,
      foundation_truth_quality:
        sectionEvidence.summary?.foundationTruthQuality || null,
      foundation_truth_mode: foundationTruthMode,
      foundation_truth_state: foundationTruthState,
      foundation_direct_clip_count:
        sectionEvidence.summary?.directFoundationCount || 0,
      base_condition_direct_clip_count:
        sectionEvidence.summary?.directBaseConditionCount || 0,
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
    },
  };
}

export default {
  renderSectionSvg,
};

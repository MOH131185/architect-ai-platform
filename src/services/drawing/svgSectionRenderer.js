import { isFeatureEnabled } from "../../config/featureFlags.js";
import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";
import {
  buildSectionEvidence,
  resolveSectionCutCoordinate,
  sectionAxis,
} from "./sectionEvidenceService.js";

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

function renderFoundation(baseX, baseY, widthPx) {
  return `
    <g id="phase8-section-foundation">
      <rect x="${baseX - 10}" y="${baseY}" width="${widthPx + 20}" height="42" fill="#ded8cc" />
      <rect x="${baseX + widthPx * 0.08}" y="${baseY - 18}" width="${widthPx * 0.12}" height="18" fill="#c8c0b2" stroke="#444" stroke-width="1.2" />
      <rect x="${baseX + widthPx * 0.8}" y="${baseY - 18}" width="${widthPx * 0.12}" height="18" fill="#c8c0b2" stroke="#444" stroke-width="1.2" />
      <line x1="${baseX - 14}" y1="${baseY}" x2="${baseX + widthPx + 14}" y2="${baseY}" stroke="#1f2937" stroke-width="2" />
    </g>
  `;
}

function renderRoof(baseX, topY, widthPx, roofLanguage = "pitched") {
  const flat = String(roofLanguage || "")
    .toLowerCase()
    .includes("flat");
  if (flat) {
    return `
      <rect x="${baseX}" y="${topY - 12}" width="${widthPx}" height="12" fill="#d5dae1" stroke="#111" stroke-width="1.6" />
      <line x1="${baseX}" y1="${topY - 12}" x2="${baseX + widthPx}" y2="${topY - 12}" stroke="#111" stroke-width="2" />
    `;
  }

  return `
    <path d="M ${baseX} ${topY} L ${baseX + widthPx / 2} ${topY - 52} L ${baseX + widthPx} ${topY}" fill="none" stroke="#111" stroke-width="2" />
    <line x1="${baseX + 10}" y1="${topY - 8}" x2="${baseX + widthPx - 10}" y2="${topY - 8}" stroke="#6b7280" stroke-width="0.8" stroke-dasharray="4 4" />
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
      const level = levelProfiles.find((entry) => entry.id === room.level_id);
      if (!level) {
        return "";
      }

      const projection = sectionDisplayRange(room, sectionType);
      const x = baseX + projection.start * scale;
      const widthPx = Math.max(18, (projection.end - projection.start) * scale);
      const y = baseY - level.top_m * scale;
      const heightPx = Math.max(24, Number(level.height_m || 3.2) * scale);
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
        levelProfiles.find((entry) => entry.id === stair.level_id) ||
        levelProfiles[0];
      if (!level) {
        return "";
      }
      const projection = sectionDisplayRange(stair, sectionType);
      const x = baseX + projection.start * scale;
      const widthPx = Math.max(20, (projection.end - projection.start) * scale);
      const y =
        baseY - (level.bottom_m + Number(level.height_m || 3.2) * 0.95) * scale;
      const heightPx = Math.max(
        28,
        Number(stair.depth_m || stair.bbox?.height || 2.8) * scale,
      );
      const treadCount = 7;
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
  const foundation = renderFoundation(baseX, baseY, horizontalExtent * scale);
  const cutRoomMarkup = renderCutRooms(
    cutRooms,
    sectionType,
    levelProfiles,
    baseX,
    baseY,
    scale,
  );
  const stairMarkup = renderStairCut(
    intersectedStairs,
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
    ? renderCutWalls(cutWalls, sectionType, baseX, baseY, scale, levelProfiles)
    : { markup: "", count: 0 };
  const openingMarkup = useClippedGraphics
    ? renderCutOpenings(
        cutOpenings,
        sectionType,
        baseX,
        baseY,
        scale,
        levelProfiles,
      )
    : { markup: "", count: 0 };
  const roof = renderRoof(
    baseX,
    baseY - totalHeight * scale,
    horizontalExtent * scale,
    styleDNA.roof_language || geometry.roof?.type || "pitched gable",
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

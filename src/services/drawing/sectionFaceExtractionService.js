import { isFeatureEnabled } from "../../config/featureFlags.js";

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, Number(value || 0)));
}

export function phase21TrueSectioningEnabled() {
  return (
    isFeatureEnabled("useTrueGeometricSectioningPhase21") ||
    isFeatureEnabled("useCentralizedSectionTruthModelPhase21") ||
    isFeatureEnabled("useDraftingGradeSectionGraphicsPhase21") ||
    isFeatureEnabled("useConstructionTruthDrivenSectionRankingPhase21") ||
    isFeatureEnabled("useSectionConstructionCredibilityGatePhase21")
  );
}

function orthAxisSymbol(axis = "x") {
  return axis === "x" ? "y" : "x";
}

function orthAxisValue(point = null, axis = "x") {
  if (!point || typeof point !== "object") {
    return null;
  }
  const value = axis === "x" ? Number(point.y) : Number(point.x);
  return Number.isFinite(value) ? value : null;
}

function segmentProfile(entity = {}, axis = "x") {
  const start = entity?.start;
  const end = entity?.end;
  if (!start || !end) {
    return null;
  }
  const startValue = orthAxisValue(start, axis);
  const endValue = orthAxisValue(end, axis);
  if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) {
    return null;
  }
  return {
    start: round(Math.min(startValue, endValue)),
    end: round(Math.max(startValue, endValue)),
  };
}

function bboxProfile(entity = {}, axis = "x") {
  const bbox = entity?.bbox;
  if (!bbox) {
    return null;
  }
  if (axis === "x") {
    if (
      !Number.isFinite(Number(bbox.min_y)) ||
      !Number.isFinite(Number(bbox.max_y))
    ) {
      return null;
    }
    return {
      start: round(Number(bbox.min_y)),
      end: round(Number(bbox.max_y)),
    };
  }
  if (
    !Number.isFinite(Number(bbox.min_x)) ||
    !Number.isFinite(Number(bbox.max_x))
  ) {
    return null;
  }
  return {
    start: round(Number(bbox.min_x)),
    end: round(Number(bbox.max_x)),
  };
}

function buildFace({
  startOrth,
  endOrth,
  bottom,
  top,
  kind,
  primitive,
  sourceId = null,
  materialSignature = null,
  extras = {},
}) {
  const orthMin = round(Math.min(Number(startOrth), Number(endOrth)));
  const orthMax = round(Math.max(Number(startOrth), Number(endOrth)));
  const bottomValue = round(Number(bottom));
  const topValue = round(Number(top));
  const width = round(Math.max(0, orthMax - orthMin));
  const height = round(Math.max(0, topValue - bottomValue));
  return {
    kind,
    primitive,
    sourceId,
    materialSignature,
    orth: {
      start: orthMin,
      end: orthMax,
      width,
    },
    height: {
      bottom: bottomValue,
      top: topValue,
      span: height,
    },
    area: round(Math.max(0, width * height)),
    ...extras,
  };
}

function wallFaceFromSpans(wall = {}, span = null, level = null) {
  const levelBottom = Number(level?.bottom_m ?? 0);
  const levelTop = Number(
    level?.top_m ?? levelBottom + Number(level?.height_m ?? 3.2),
  );
  const sillOffset = Number(wall?.base_offset_m ?? 0);
  const wallBottom = round(
    levelBottom + (Number.isFinite(sillOffset) ? sillOffset : 0),
  );
  const wallTop = round(levelTop - (Number(wall?.top_offset_m ?? 0) || 0));
  return buildFace({
    startOrth: span.start,
    endOrth: span.end,
    bottom: wallBottom,
    top: wallTop,
    kind: "wall_cut_face",
    primitive: "wall_cut_face_polygon",
    sourceId: wall?.id || null,
    materialSignature:
      wall?.construction_assembly ||
      wall?.material ||
      wall?.assembly ||
      "wall_assembly_default",
    extras: {
      thicknessM: round(Number(wall?.thickness_m ?? 0.2)),
      exterior: Boolean(wall?.exterior),
      levelId: level?.id || null,
      levelName: level?.name || null,
    },
  });
}

function slabFaceFromLevel(slab = {}, level = null, orthProfile = null) {
  if (!level || !orthProfile) {
    return null;
  }
  const slabThickness = Math.max(0.08, Number(slab?.thickness_m ?? 0.2) || 0.2);
  const topValue = round(Number(level.top_m ?? 0));
  const bottomValue = round(topValue - slabThickness);
  return buildFace({
    startOrth: orthProfile.start,
    endOrth: orthProfile.end,
    bottom: bottomValue,
    top: topValue,
    kind: "slab_cut_face",
    primitive: "slab_cut_face_polygon",
    sourceId: slab?.id || level?.id || null,
    materialSignature:
      slab?.construction_assembly || slab?.material || "slab_assembly_default",
    extras: {
      levelId: level?.id || null,
      levelName: level?.name || null,
      thicknessM: round(slabThickness),
    },
  });
}

function foundationFaceFromEntity(foundation = {}, span = null) {
  if (!span) {
    return null;
  }
  const depth = Math.max(
    0.25,
    Number(foundation?.depth_m ?? foundation?.height_m ?? 0.6) || 0.6,
  );
  const topValue = round(Number(foundation?.top_m ?? 0));
  const bottomValue = round(topValue - depth);
  return buildFace({
    startOrth: span.start,
    endOrth: span.end,
    bottom: bottomValue,
    top: topValue,
    kind: "foundation_cut_face",
    primitive: "foundation_cut_face_polygon",
    sourceId: foundation?.id || null,
    materialSignature:
      foundation?.foundation_type ||
      foundation?.type ||
      "foundation_assembly_default",
    extras: {
      depthM: round(depth),
      type:
        foundation?.foundation_type || foundation?.type || "foundation_zone",
    },
  });
}

function openingFaceFromWall(
  opening = {},
  wall = null,
  span = null,
  level = null,
) {
  if (!span) {
    return null;
  }
  const sillHeight =
    Number(opening?.sill_height_m ?? opening?.sillHeight ?? 0.9) || 0.9;
  const headHeight =
    Number(
      opening?.head_height_m ??
        opening?.headHeight ??
        sillHeight + Number(opening?.height_m ?? 1.2),
    ) || 2.1;
  const levelBottom = Number(level?.bottom_m ?? 0);
  const bottomValue = round(levelBottom + Math.min(sillHeight, headHeight));
  const topValue = round(levelBottom + Math.max(sillHeight, headHeight));
  return buildFace({
    startOrth: span.start,
    endOrth: span.end,
    bottom: bottomValue,
    top: topValue,
    kind: "opening_cut_face",
    primitive: "opening_cut_face_polygon",
    sourceId: opening?.id || null,
    materialSignature:
      opening?.type ||
      wall?.construction_assembly ||
      "opening_assembly_default",
    extras: {
      sillHeightM: round(sillHeight),
      headHeightM: round(headHeight),
      wallId: wall?.id || opening?.wall_id || null,
      levelId: level?.id || null,
    },
  });
}

function stairFaceFromSpans(stair = {}, span = null, level = null) {
  if (!span) {
    return null;
  }
  const levelBottom = Number(level?.bottom_m ?? 0);
  const levelTop = Number(
    level?.top_m ?? levelBottom + Number(level?.height_m ?? 3.2),
  );
  return buildFace({
    startOrth: span.start,
    endOrth: span.end,
    bottom: round(levelBottom),
    top: round(levelTop),
    kind: "stair_cut_face",
    primitive: "stair_cut_face_polygon",
    sourceId: stair?.id || null,
    materialSignature: "stair_assembly_default",
    extras: {
      treadCount: Number(stair?.tread_count ?? 7),
      riserHeightM: round(Number(stair?.riser_height_m ?? 0.17)),
    },
  });
}

function roofFaceFromEntity(
  roofEntity = {},
  span = null,
  topOfEnvelope = 0,
  roofHeight = 1.6,
) {
  if (!span) {
    return null;
  }
  const top = round(Number(topOfEnvelope) + Math.max(0.4, Number(roofHeight)));
  const bottom = round(Number(topOfEnvelope));
  return buildFace({
    startOrth: span.start,
    endOrth: span.end,
    bottom,
    top,
    kind: "roof_cut_face",
    primitive: "roof_cut_face_polygon",
    sourceId: roofEntity?.id || null,
    materialSignature:
      roofEntity?.primitive_family ||
      roofEntity?.type ||
      "roof_assembly_default",
    extras: {
      roofType: roofEntity?.type || roofEntity?.primitive_family || "pitched",
      supportMode: roofEntity?.support_mode || roofEntity?.supportMode || null,
    },
  });
}

function pickLevelForEntity(entity = {}, levelProfiles = []) {
  if (!levelProfiles.length) {
    return null;
  }
  const levelId = entity?.level_id || entity?.levelId || null;
  if (levelId) {
    return (
      levelProfiles.find((level) => level.id === levelId) || levelProfiles[0]
    );
  }
  return levelProfiles[0];
}

function profileFromClipGeometry(entry = {}, axis = "x") {
  const clipGeometry = entry?.clipGeometry || {};
  const sectionRange = clipGeometry.sectionRange;
  if (
    sectionRange &&
    Number.isFinite(Number(sectionRange.start)) &&
    Number.isFinite(Number(sectionRange.end)) &&
    Number(sectionRange.end) >= Number(sectionRange.start)
  ) {
    return {
      start: round(Number(sectionRange.start)),
      end: round(Number(sectionRange.end)),
    };
  }
  if (Array.isArray(entry?.cutSpans) && entry.cutSpans.length >= 2) {
    const sorted = entry.cutSpans
      .map((value) => Number(value))
      .filter(Number.isFinite)
      .sort((left, right) => left - right);
    if (sorted.length >= 2) {
      return {
        start: round(sorted[0]),
        end: round(sorted[sorted.length - 1]),
      };
    }
  }
  return segmentProfile(entry, axis) || bboxProfile(entry, axis);
}

function extractWallFaces(
  geometry = {},
  intersections = {},
  axis = "x",
  levelProfiles = [],
) {
  const wallEntries = [
    ...(intersections.walls?.direct || []),
    ...(intersections.walls?.near || []),
  ];
  const faces = [];
  const exactFaces = [];
  wallEntries.forEach((entry) => {
    const profile = profileFromClipGeometry(entry, axis);
    if (!profile) {
      return;
    }
    const matchingWall =
      (geometry.walls || []).find((wall) => wall.id === entry.id) || entry;
    const level = pickLevelForEntity(matchingWall, levelProfiles);
    const face = wallFaceFromSpans(matchingWall, profile, level);
    const isDirect =
      entry.constructionTruthState === "direct" && entry.exactClip;
    if (isDirect) {
      face.truthKind = "cut_face";
      face.truthState = "direct";
      exactFaces.push(face);
    } else if (entry.constructionTruthState === "direct") {
      face.truthKind = "cut_profile";
      face.truthState = "direct";
    } else {
      face.truthKind =
        entry.constructionTruthState === "contextual"
          ? "contextual_profile"
          : entry.constructionTruthState === "derived"
            ? "derived_profile"
            : "unsupported";
      face.truthState = entry.constructionTruthState || "contextual";
    }
    faces.push(face);
  });
  return { faces, exactFaces };
}

function extractOpeningFaces(
  geometry = {},
  intersections = {},
  axis = "x",
  levelProfiles = [],
) {
  const openingEntries = [
    ...(intersections.windows?.direct || []),
    ...(intersections.doors?.direct || []),
    ...(intersections.entrances?.direct || []),
    ...(intersections.windows?.near || []),
    ...(intersections.doors?.near || []),
    ...(intersections.entrances?.near || []),
  ];
  const faces = [];
  const exactFaces = [];
  openingEntries.forEach((entry) => {
    const profile = profileFromClipGeometry(entry, axis);
    if (!profile) {
      return;
    }
    const wall =
      (geometry.walls || []).find(
        (wallEntry) => wallEntry.id === entry.wall_id,
      ) || null;
    const level =
      pickLevelForEntity(entry, levelProfiles) ||
      pickLevelForEntity(wall || {}, levelProfiles);
    const face = openingFaceFromWall(entry, wall, profile, level);
    if (!face) {
      return;
    }
    const isDirect =
      entry.constructionTruthState === "direct" && entry.exactClip;
    if (isDirect) {
      face.truthKind = "cut_face";
      face.truthState = "direct";
      exactFaces.push(face);
    } else if (entry.constructionTruthState === "direct") {
      face.truthKind = "cut_profile";
      face.truthState = "direct";
    } else {
      face.truthKind =
        entry.constructionTruthState === "contextual"
          ? "contextual_profile"
          : entry.constructionTruthState === "derived"
            ? "derived_profile"
            : "unsupported";
      face.truthState = entry.constructionTruthState || "contextual";
    }
    faces.push(face);
  });
  return { faces, exactFaces };
}

function extractStairFaces(
  geometry = {},
  intersections = {},
  axis = "x",
  levelProfiles = [],
) {
  const stairEntries = [
    ...(intersections.stairs?.direct || []),
    ...(intersections.stairs?.near || []),
  ];
  const faces = [];
  const exactFaces = [];
  stairEntries.forEach((entry) => {
    const profile = profileFromClipGeometry(entry, axis);
    if (!profile) {
      return;
    }
    const matchingStair =
      (geometry.stairs || []).find((stair) => stair.id === entry.id) || entry;
    const level = pickLevelForEntity(matchingStair, levelProfiles);
    const face = stairFaceFromSpans(matchingStair, profile, level);
    if (!face) {
      return;
    }
    const isDirect =
      entry.constructionTruthState === "direct" && entry.exactClip;
    if (isDirect) {
      face.truthKind = "cut_face";
      face.truthState = "direct";
      exactFaces.push(face);
    } else if (entry.constructionTruthState === "direct") {
      face.truthKind = "cut_profile";
      face.truthState = "direct";
    } else {
      face.truthKind =
        entry.constructionTruthState === "contextual"
          ? "contextual_profile"
          : entry.constructionTruthState === "derived"
            ? "derived_profile"
            : "unsupported";
      face.truthState = entry.constructionTruthState || "contextual";
    }
    faces.push(face);
  });
  return { faces, exactFaces };
}

function extractSlabFaces(
  geometry = {},
  intersections = {},
  axis = "x",
  levelProfiles = [],
  envelopeSpan = null,
) {
  const slabEntries = [
    ...(intersections.slabs?.direct || []),
    ...(intersections.slabs?.near || []),
  ];
  const faces = [];
  const exactFaces = [];
  slabEntries.forEach((entry) => {
    const profile = profileFromClipGeometry(entry, axis) || envelopeSpan;
    if (!profile) {
      return;
    }
    const matchingSlab =
      (geometry.slabs || []).find((slab) => slab.id === entry.id) || entry;
    const level =
      pickLevelForEntity(matchingSlab, levelProfiles) ||
      levelProfiles.find((candidate) => candidate.id === entry.levelId) ||
      levelProfiles[0];
    const face = slabFaceFromLevel(matchingSlab, level, profile);
    if (!face) {
      return;
    }
    const isDirect =
      entry.constructionTruthState === "direct" && entry.exactClip;
    if (isDirect) {
      face.truthKind = "cut_face";
      face.truthState = "direct";
      exactFaces.push(face);
    } else if (entry.constructionTruthState === "direct") {
      face.truthKind = "cut_profile";
      face.truthState = "direct";
    } else {
      face.truthKind =
        entry.constructionTruthState === "contextual"
          ? "contextual_profile"
          : entry.constructionTruthState === "derived"
            ? "derived_profile"
            : "unsupported";
      face.truthState = entry.constructionTruthState || "contextual";
    }
    faces.push(face);
  });
  return { faces, exactFaces };
}

function extractRoofFaces(
  geometry = {},
  intersections = {},
  axis = "x",
  envelopeSpan = null,
  topOfEnvelopeM = 0,
) {
  const roofEntries = [
    ...(intersections.roofElements?.direct || []),
    ...(intersections.roofElements?.near || []),
  ];
  const faces = [];
  const exactFaces = [];
  roofEntries.forEach((entry) => {
    const profile = profileFromClipGeometry(entry, axis) || envelopeSpan;
    if (!profile) {
      return;
    }
    const roofHeight = Math.max(
      0.3,
      Number(entry?.clipGeometry?.clipDepthM || geometry.roof?.height_m || 1.6),
    );
    const face = roofFaceFromEntity(entry, profile, topOfEnvelopeM, roofHeight);
    if (!face) {
      return;
    }
    const isDirect =
      entry.constructionTruthState === "direct" && entry.exactClip;
    if (isDirect) {
      face.truthKind = "cut_face";
      face.truthState = "direct";
      exactFaces.push(face);
    } else if (entry.constructionTruthState === "direct") {
      face.truthKind = "cut_profile";
      face.truthState = "direct";
    } else {
      face.truthKind =
        entry.constructionTruthState === "contextual"
          ? "contextual_profile"
          : entry.constructionTruthState === "derived"
            ? "derived_profile"
            : "unsupported";
      face.truthState = entry.constructionTruthState || "contextual";
    }
    faces.push(face);
  });
  return { faces, exactFaces };
}

function extractFoundationFaces(intersections = {}, axis = "x") {
  const entries = [
    ...(intersections.foundations?.direct || []),
    ...(intersections.foundations?.near || []),
    ...(intersections.baseConditions?.direct || []),
    ...(intersections.baseConditions?.near || []),
  ];
  const faces = [];
  const exactFaces = [];
  entries.forEach((entry) => {
    const profile = profileFromClipGeometry(entry, axis);
    if (!profile) {
      return;
    }
    const face = foundationFaceFromEntity(entry, profile);
    if (!face) {
      return;
    }
    const isDirect =
      entry.constructionTruthState === "direct" && entry.exactClip;
    if (isDirect) {
      face.truthKind = "cut_face";
      face.truthState = "direct";
      exactFaces.push(face);
    } else if (entry.constructionTruthState === "direct") {
      face.truthKind = "cut_profile";
      face.truthState = "direct";
    } else {
      face.truthKind =
        entry.constructionTruthState === "contextual"
          ? "contextual_profile"
          : entry.constructionTruthState === "derived"
            ? "derived_profile"
            : "unsupported";
      face.truthState = entry.constructionTruthState || "contextual";
    }
    faces.push(face);
  });
  return { faces, exactFaces };
}

function aggregateFaces(facesByKind = {}) {
  const result = {
    totalCount: 0,
    cutFaceCount: 0,
    cutProfileCount: 0,
    contextualCount: 0,
    derivedCount: 0,
    unsupportedCount: 0,
    totalAreaM2: 0,
  };
  Object.values(facesByKind).forEach((group) => {
    (group.faces || []).forEach((face) => {
      result.totalCount += 1;
      result.totalAreaM2 += Number(face.area || 0);
      if (face.truthKind === "cut_face") {
        result.cutFaceCount += 1;
      } else if (face.truthKind === "cut_profile") {
        result.cutProfileCount += 1;
      } else if (face.truthKind === "contextual_profile") {
        result.contextualCount += 1;
      } else if (face.truthKind === "derived_profile") {
        result.derivedCount += 1;
      } else {
        result.unsupportedCount += 1;
      }
    });
  });
  result.totalAreaM2 = round(result.totalAreaM2, 3);
  return result;
}

function faceCredibilityScore(summary = {}) {
  if (!summary.totalCount) {
    return 0;
  }
  const cutFaceWeight = summary.cutFaceCount * 0.32;
  const cutProfileWeight = summary.cutProfileCount * 0.14;
  const contextualPenalty = summary.contextualCount * 0.02;
  const derivedPenalty = summary.derivedCount * 0.03;
  const unsupportedPenalty = summary.unsupportedCount * 0.04;
  return clamp(
    cutFaceWeight +
      cutProfileWeight -
      contextualPenalty -
      derivedPenalty -
      unsupportedPenalty,
    0,
    1,
  );
}

function faceCoverageQuality(score = 0) {
  if (score >= 0.72) return "verified";
  if (score >= 0.44) return "weak";
  return "blocked";
}

export function extractSectionFaces({
  geometry = {},
  intersections = {},
  axis = "x",
  levelProfiles = [],
  envelopeSpan = null,
  topOfEnvelopeM = 0,
} = {}) {
  if (!phase21TrueSectioningEnabled()) {
    return {
      version: "phase20-face-extraction-shim",
      faces: {
        walls: { faces: [], exactFaces: [] },
        openings: { faces: [], exactFaces: [] },
        stairs: { faces: [], exactFaces: [] },
        slabs: { faces: [], exactFaces: [] },
        roofs: { faces: [], exactFaces: [] },
        foundations: { faces: [], exactFaces: [] },
      },
      summary: {
        totalCount: 0,
        cutFaceCount: 0,
        cutProfileCount: 0,
        contextualCount: 0,
        derivedCount: 0,
        unsupportedCount: 0,
        totalAreaM2: 0,
      },
      credibility: { score: 0, quality: "blocked" },
      perKind: {},
    };
  }

  const walls = extractWallFaces(geometry, intersections, axis, levelProfiles);
  const openings = extractOpeningFaces(
    geometry,
    intersections,
    axis,
    levelProfiles,
  );
  const stairs = extractStairFaces(
    geometry,
    intersections,
    axis,
    levelProfiles,
  );
  const slabs = extractSlabFaces(
    geometry,
    intersections,
    axis,
    levelProfiles,
    envelopeSpan,
  );
  const roofs = extractRoofFaces(
    geometry,
    intersections,
    axis,
    envelopeSpan,
    topOfEnvelopeM,
  );
  const foundations = extractFoundationFaces(intersections, axis);

  const facesByKind = { walls, openings, stairs, slabs, roofs, foundations };
  const summary = aggregateFaces(facesByKind);
  const score = faceCredibilityScore(summary);
  const quality = faceCoverageQuality(score);

  const perKind = Object.fromEntries(
    Object.entries(facesByKind).map(([kind, group]) => [
      kind,
      {
        totalCount: (group.faces || []).length,
        cutFaceCount: (group.exactFaces || []).length,
        cutProfileCount: (group.faces || []).filter(
          (face) => face.truthKind === "cut_profile",
        ).length,
        contextualCount: (group.faces || []).filter(
          (face) => face.truthKind === "contextual_profile",
        ).length,
        derivedCount: (group.faces || []).filter(
          (face) => face.truthKind === "derived_profile",
        ).length,
      },
    ]),
  );

  return {
    version: "phase21-section-face-extraction-v1",
    faces: facesByKind,
    summary,
    credibility: { score: round(score), quality },
    perKind,
  };
}

export function summarizeFaceTruthForRenderer(faceBundle = null) {
  if (!faceBundle) {
    return {
      cutFaceCount: 0,
      cutProfileCount: 0,
      contextualCount: 0,
      derivedCount: 0,
      totalCount: 0,
      credibilityScore: 0,
      credibilityQuality: "blocked",
    };
  }
  const summary = faceBundle.summary || {};
  return {
    cutFaceCount: Number(summary.cutFaceCount || 0),
    cutProfileCount: Number(summary.cutProfileCount || 0),
    contextualCount: Number(summary.contextualCount || 0),
    derivedCount: Number(summary.derivedCount || 0),
    totalCount: Number(summary.totalCount || 0),
    totalAreaM2: Number(summary.totalAreaM2 || 0),
    credibilityScore: Number(faceBundle.credibility?.score || 0),
    credibilityQuality: faceBundle.credibility?.quality || "blocked",
  };
}

export default {
  extractSectionFaces,
  summarizeFaceTruthForRenderer,
  phase21TrueSectioningEnabled,
};

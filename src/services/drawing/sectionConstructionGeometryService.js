function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
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

function projectBboxRange(entry = {}, sectionType = "longitudinal") {
  const bbox = entry?.bbox || {};
  return String(sectionType || "longitudinal").toLowerCase() === "longitudinal"
    ? {
        start: Number(bbox.min_y ?? bbox.y ?? 0),
        end: Number(
          bbox.max_y ?? Number(bbox.y || 0) + Number(bbox.height || 0),
        ),
      }
    : {
        start: Number(bbox.min_x ?? bbox.x ?? 0),
        end: Number(
          bbox.max_x ?? Number(bbox.x || 0) + Number(bbox.width || 0),
        ),
      };
}

export function getLevelProfiles(geometry = {}) {
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

export function resolveSectionDisplayRange(
  entry = {},
  sectionType = "longitudinal",
) {
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
  return projectBboxRange(entry, sectionType);
}

export function resolveLevelProfileForEntry(entry = {}, levelProfiles = []) {
  return (
    levelProfiles.find((profile) => profile.id === entry.level_id) ||
    levelProfiles[0] ||
    null
  );
}

function projectRangeToPixels(range = {}, baseX = 0, scale = 1) {
  const start = Number(range.start || 0);
  const end = Number(range.end || start);
  const minimum = Math.min(start, end);
  const maximum = Math.max(start, end);
  return {
    x: round(baseX + minimum * scale),
    width: round(Math.max(8, (maximum - minimum) * scale)),
    centerX: round(baseX + ((minimum + maximum) / 2) * scale),
  };
}

function resolveConstructionEntryRange(
  entry = {},
  sectionType = "longitudinal",
) {
  return resolveSectionDisplayRange(entry, sectionType);
}

export function buildSectionConstructionGeometry({
  geometry = {},
  sectionType = "longitudinal",
  sectionEvidence = {},
  baseX = 0,
  baseY = 0,
  scale = 1,
  levelProfiles = getLevelProfiles(geometry),
} = {}) {
  const bounds = getBuildableBounds(geometry);
  const horizontalExtent =
    String(sectionType || "longitudinal").toLowerCase() === "longitudinal"
      ? Number(bounds.height || 10)
      : Number(bounds.width || 12);
  const totalHeight =
    levelProfiles[levelProfiles.length - 1]?.top_m ||
    levelProfiles.reduce(
      (sum, level) => sum + Number(level.height_m || 3.2),
      0,
    ) ||
    3.2;
  const directRooms = sectionEvidence.intersections?.rooms || [];
  const directWalls = sectionEvidence.intersections?.walls || [];
  const directOpenings = sectionEvidence.intersections?.openings || [];
  const directStairs = sectionEvidence.intersections?.stairs || [];
  const directRoof = sectionEvidence.intersections?.roofElements || [];
  const nearRoof = sectionEvidence.intersections?.nearRoofElements || [];
  const directFoundations = sectionEvidence.intersections?.foundations || [];
  const nearFoundations = sectionEvidence.intersections?.nearFoundations || [];
  const directBaseConditions =
    sectionEvidence.intersections?.baseConditions || [];
  const nearBaseConditions =
    sectionEvidence.intersections?.nearBaseConditions || [];

  const rooms = directRooms
    .map((room) => {
      const level = resolveLevelProfileForEntry(room, levelProfiles);
      if (!level) return null;
      const range = resolveSectionDisplayRange(room, sectionType);
      const pixels = projectRangeToPixels(range, baseX, scale);
      return {
        ...room,
        level,
        range,
        x: pixels.x,
        width: pixels.width,
        y: round(baseY - level.top_m * scale),
        height: round(Math.max(24, Number(level.height_m || 3.2) * scale)),
      };
    })
    .filter(Boolean);

  const walls = directWalls
    .map((wall) => {
      const level = resolveLevelProfileForEntry(wall, levelProfiles);
      if (!level) return null;
      const range = resolveSectionDisplayRange(wall, sectionType);
      const pixels = projectRangeToPixels(range, baseX, scale);
      const thicknessPx = Math.max(
        8,
        Number(wall.thickness_m || 0.18) * scale,
        pixels.width,
      );
      return {
        ...wall,
        level,
        range,
        x: round(pixels.centerX - thicknessPx / 2),
        width: round(thicknessPx),
        y: round(baseY - level.top_m * scale),
        height: round(Math.max(24, Number(level.height_m || 3.2) * scale)),
      };
    })
    .filter(Boolean);

  const openings = directOpenings
    .map((opening) => {
      const level = resolveLevelProfileForEntry(opening, levelProfiles);
      if (!level) return null;
      const range = resolveSectionDisplayRange(opening, sectionType);
      const pixels = projectRangeToPixels(range, baseX, scale);
      const sillHeight = Number(opening.clipGeometry?.sillHeightM || 0.9);
      const headHeight = Number(opening.clipGeometry?.headHeightM || 2.1);
      return {
        ...opening,
        level,
        range,
        x: pixels.x,
        width: Math.max(10, pixels.width),
        y: round(baseY - (level.bottom_m + headHeight) * scale),
        height: round(Math.max(10, (headHeight - sillHeight) * scale)),
        sillHeight,
        headHeight,
      };
    })
    .filter(Boolean);

  const stairs = directStairs
    .map((stair) => {
      const level = resolveLevelProfileForEntry(stair, levelProfiles);
      if (!level) return null;
      const range = resolveSectionDisplayRange(stair, sectionType);
      const pixels = projectRangeToPixels(range, baseX, scale);
      const depthM = Number(stair.depth_m || stair.bbox?.height || 2.8);
      const heightPx = Math.max(28, depthM * scale);
      return {
        ...stair,
        level,
        range,
        x: pixels.x,
        width: Math.max(20, pixels.width),
        y: round(
          baseY -
            (level.bottom_m + Number(level.height_m || 3.2) * 0.95) * scale,
        ),
        height: round(heightPx),
        treadCount: Math.max(6, Math.min(10, Math.round(depthM / 0.28))),
      };
    })
    .filter(Boolean);

  const slabs = levelProfiles.map((level, index) => ({
    id: `section-slab:${level.id || index}`,
    level,
    y: round(baseY - level.top_m * scale),
    width: round(horizontalExtent * scale),
  }));

  const foundation = {
    x: round(baseX - 10),
    y: round(baseY),
    width: round(horizontalExtent * scale + 20),
    height: 42,
    directFoundationCount: directFoundations.length,
    directBaseConditionCount: directBaseConditions.length,
    contextual:
      directFoundations.length === 0 && directBaseConditions.length === 0,
    bands: [...directFoundations, ...directBaseConditions]
      .map((entry, index) => {
        const range = resolveConstructionEntryRange(entry, sectionType);
        const pixels = projectRangeToPixels(range, baseX, scale);
        return {
          id: entry.id || `foundation-band:${index}`,
          x: pixels.x,
          width: pixels.width,
        };
      })
      .filter((entry) => Number.isFinite(entry.x) && entry.width > 0),
  };

  const roofSource = directRoof.length ? directRoof : nearRoof;
  const roofBand = roofSource[0]
    ? (() => {
        const range = resolveConstructionEntryRange(roofSource[0], sectionType);
        const pixels = projectRangeToPixels(range, baseX, scale);
        return {
          x: pixels.x,
          width: pixels.width,
        };
      })()
    : null;
  const roof = {
    directRoofCount: directRoof.length,
    contextual: directRoof.length === 0,
    band: roofBand,
  };

  return {
    version:
      directRoof.length ||
      directFoundations.length ||
      directBaseConditions.length ||
      nearFoundations.length ||
      nearBaseConditions.length
        ? "phase15-section-construction-geometry-v1"
        : "phase14-section-construction-geometry-v1",
    sectionType,
    baseX: round(baseX),
    baseY: round(baseY),
    scale: round(scale),
    totalHeight: round(totalHeight),
    levelProfiles,
    rooms,
    walls,
    openings,
    stairs,
    slabs,
    roof,
    foundation,
  };
}

export default {
  getLevelProfiles,
  resolveSectionDisplayRange,
  resolveLevelProfileForEntry,
  buildSectionConstructionGeometry,
};

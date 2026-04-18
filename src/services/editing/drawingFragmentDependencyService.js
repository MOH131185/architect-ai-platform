import { selectSectionCandidates } from "../drawing/sectionCutPlanner.js";

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean))].sort();
}

function normalizeSide(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function resolveSectionFragmentIds(drawings = null, artifactStore = null) {
  const liveIds = (drawings?.section || []).map(
    (entry, index) => `drawing:section:${entry.section_type || index}`,
  );
  const storedIds = Object.keys(
    artifactStore?.artifacts?.drawings?.fragments || {},
  ).filter((entry) => entry.startsWith("drawing:section:"));
  const ids = liveIds.length ? liveIds : storedIds;
  return ids.length
    ? unique(ids)
    : ["drawing:section:longitudinal", "drawing:section:transverse"];
}

function buildSectionCandidateMap(
  projectGeometry = {},
  drawings = null,
  artifactStore = null,
) {
  const plannedCandidates = new Map(
    (selectSectionCandidates(projectGeometry).candidates || []).map(
      (candidate) => [candidate.sectionType, candidate],
    ),
  );
  return resolveSectionFragmentIds(drawings, artifactStore).map(
    (fragmentId) => {
      const sectionType = fragmentId.replace("drawing:section:", "");
      return {
        fragmentId,
        sectionType,
        candidate: plannedCandidates.get(sectionType) || {
          sectionType,
          cutLine: null,
          focusEntityIds: [],
        },
      };
    },
  );
}

function hasSpatialData(entity = {}) {
  return Boolean(
    entity.centroid ||
    entity.position ||
    entity.bbox ||
    (entity.start && entity.end),
  );
}

function getEntityCenter(entity = {}) {
  if (entity.position) {
    return {
      x: Number(entity.position.x || 0),
      y: Number(entity.position.y || 0),
    };
  }
  if (entity.centroid) {
    return {
      x: Number(entity.centroid.x || 0),
      y: Number(entity.centroid.y || 0),
    };
  }
  if (entity.bbox) {
    return {
      x: (Number(entity.bbox.min_x || 0) + Number(entity.bbox.max_x || 0)) / 2,
      y: (Number(entity.bbox.min_y || 0) + Number(entity.bbox.max_y || 0)) / 2,
    };
  }
  if (entity.start && entity.end) {
    return {
      x: (Number(entity.start.x || 0) + Number(entity.end.x || 0)) / 2,
      y: (Number(entity.start.y || 0) + Number(entity.end.y || 0)) / 2,
    };
  }
  return null;
}

function getEntityRange(entity = {}, axis = "x") {
  if (entity.bbox) {
    return axis === "x"
      ? [Number(entity.bbox.min_x || 0), Number(entity.bbox.max_x || 0)]
      : [Number(entity.bbox.min_y || 0), Number(entity.bbox.max_y || 0)];
  }
  if (entity.start && entity.end) {
    return axis === "x"
      ? [
          Math.min(Number(entity.start.x || 0), Number(entity.end.x || 0)),
          Math.max(Number(entity.start.x || 0), Number(entity.end.x || 0)),
        ]
      : [
          Math.min(Number(entity.start.y || 0), Number(entity.end.y || 0)),
          Math.max(Number(entity.start.y || 0), Number(entity.end.y || 0)),
        ];
  }
  if (entity.position) {
    const coordinate = Number(
      axis === "x" ? entity.position.x || 0 : entity.position.y || 0,
    );
    return [coordinate, coordinate];
  }
  const center = getEntityCenter(entity);
  if (!center) {
    return [0, 0];
  }
  return axis === "x" ? [center.x, center.x] : [center.y, center.y];
}

function intersectsSectionCandidate(
  entity = {},
  candidate = {},
  projectGeometry = {},
) {
  if (!candidate?.cutLine) {
    return true;
  }
  if ((candidate.focusEntityIds || []).includes(entity.id)) {
    return true;
  }
  if (!hasSpatialData(entity)) {
    return true;
  }

  const bounds = projectGeometry?.site?.buildable_bbox ||
    projectGeometry?.site?.boundary_bbox || {
      width: 12,
      height: 10,
    };
  const toleranceX = Math.max(0.6, Number(bounds.width || 12) * 0.12);
  const toleranceY = Math.max(0.6, Number(bounds.height || 10) * 0.12);

  if (candidate.sectionType === "longitudinal") {
    const cutX = Number(candidate.cutLine.from?.x || 0);
    const [minX, maxX] = getEntityRange(entity, "x");
    return cutX >= minX - toleranceX && cutX <= maxX + toleranceX;
  }

  if (candidate.sectionType === "transverse") {
    const cutY = Number(candidate.cutLine.from?.y || 0);
    const [minY, maxY] = getEntityRange(entity, "y");
    return cutY >= minY - toleranceY && cutY <= maxY + toleranceY;
  }

  return true;
}

function resolveRelevantSectionFragments(
  entity = {},
  { projectGeometry = {}, drawings = null, artifactStore = null } = {},
) {
  const candidates = buildSectionCandidateMap(
    projectGeometry,
    drawings,
    artifactStore,
  );

  if (String(entity.type || "").toLowerCase() === "section_cut") {
    return unique([
      entity.sectionType ? `drawing:section:${entity.sectionType}` : null,
    ]);
  }

  if (!candidates.length) {
    return [];
  }

  const matching = candidates
    .filter(({ candidate }) =>
      intersectsSectionCandidate(entity, candidate, projectGeometry),
    )
    .map(({ fragmentId }) => fragmentId);

  if (matching.length > 0) {
    return unique(matching);
  }

  if (!hasSpatialData(entity)) {
    return unique(candidates.map(({ fragmentId }) => fragmentId));
  }

  return [];
}

function resolvePlanFragmentId(levelId = null) {
  return levelId ? `drawing:plan:${levelId}` : null;
}

function resolveElevationFragmentId(side = "") {
  const normalized = normalizeSide(side);
  return normalized ? `drawing:elevation:${normalized}` : null;
}

export function resolveEntityDrawingDependencies(
  entity = {},
  {
    projectGeometry = {},
    drawings = null,
    artifactStore = null,
    panelCandidates = [],
  } = {},
) {
  const fragments = [];
  const panelIds = [];
  const sectionIds = resolveRelevantSectionFragments(entity, {
    projectGeometry,
    drawings,
    artifactStore,
  });
  const type = String(entity.type || "").toLowerCase();

  if (type === "room") {
    fragments.push(resolvePlanFragmentId(entity.levelId), ...sectionIds);
  } else if (type === "wall") {
    fragments.push(resolvePlanFragmentId(entity.levelId), ...sectionIds);
    if (entity.side) {
      fragments.push(resolveElevationFragmentId(entity.side));
    }
  } else if (type === "opening") {
    fragments.push(resolvePlanFragmentId(entity.levelId), ...sectionIds);
    if (entity.side) {
      fragments.push(resolveElevationFragmentId(entity.side));
    }
  } else if (type === "stair") {
    fragments.push(resolvePlanFragmentId(entity.levelId), ...sectionIds);
  } else if (type === "facade_component") {
    fragments.push(
      resolveElevationFragmentId(entity.side),
      entity.side ? `facade:side:${normalizeSide(entity.side)}` : null,
    );
  } else if (type === "panel_candidate") {
    panelIds.push(entity.panelId);
    fragments.push(...(entity.sourceArtifacts || []));
  }

  const fragmentIds = unique(fragments);
  const dependentPanels = unique([
    ...panelIds,
    ...(panelCandidates || [])
      .filter((candidate) =>
        (candidate.sourceArtifacts || []).some((artifactId) =>
          fragmentIds.includes(artifactId),
        ),
      )
      .map((candidate) => candidate.id),
  ]);

  return {
    entityId: entity.id,
    fragmentIds,
    panelIds: dependentPanels,
  };
}

export function buildDrawingFragmentDependencies({
  entities = [],
  projectGeometry = {},
  drawings = null,
  artifactStore = null,
  panelCandidates = [],
} = {}) {
  return unique(
    (entities || []).map((entity) => entity?.id).filter(Boolean),
  ).map((entityId) => {
    const entity =
      (entities || []).find((entry) => entry.id === entityId) || {};
    return {
      entityId,
      ...resolveEntityDrawingDependencies(entity, {
        projectGeometry,
        drawings,
        artifactStore,
        panelCandidates,
      }),
    };
  });
}

export default {
  resolveEntityDrawingDependencies,
  buildDrawingFragmentDependencies,
};

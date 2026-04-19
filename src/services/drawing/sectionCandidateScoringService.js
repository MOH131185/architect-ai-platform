function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function isLongitudinal(candidate = {}) {
  return String(candidate.sectionType || "").toLowerCase() === "longitudinal";
}

function cutCoordinate(candidate = {}) {
  if (isLongitudinal(candidate)) {
    return Number(candidate.cutLine?.from?.x || candidate.cutLine?.to?.x || 0);
  }
  return Number(candidate.cutLine?.from?.y || candidate.cutLine?.to?.y || 0);
}

function entityDistance(entity = {}, candidate = {}) {
  const coordinate = cutCoordinate(candidate);
  const bbox = entity.bbox || {};
  const min = Number(
    isLongitudinal(candidate)
      ? bbox.min_x || bbox.x || 0
      : bbox.min_y || bbox.y || 0,
  );
  const max = Number(
    isLongitudinal(candidate)
      ? bbox.max_x || (bbox.x || 0) + (bbox.width || 0)
      : bbox.max_y || (bbox.y || 0) + (bbox.height || 0),
  );
  if (coordinate >= min && coordinate <= max) {
    return 0;
  }
  return Math.min(Math.abs(coordinate - min), Math.abs(coordinate - max));
}

function countFocusedRooms(projectGeometry = {}, candidate = {}) {
  return (projectGeometry.rooms || []).filter(
    (room) => entityDistance(room, candidate) < 0.65,
  ).length;
}

function scoreStairAlignment(projectGeometry = {}, candidate = {}) {
  const stairs = projectGeometry.stairs || [];
  if (!stairs.length) return 0.25;
  const bestDistance = Math.min(
    ...stairs.map((stair) => entityDistance(stair, candidate)),
  );
  return clamp(1 - bestDistance / 3.2, 0, 1);
}

function scoreRoomCoverage(projectGeometry = {}, candidate = {}) {
  const roomCount = countFocusedRooms(projectGeometry, candidate);
  return clamp(roomCount / 3, 0.25, 1);
}

function scoreEntranceAlignment(projectGeometry = {}, candidate = {}) {
  const entrances = projectGeometry.entrances || [];
  if (!entrances.length) return 0.35;
  const coordinate = cutCoordinate(candidate);
  const bestDistance = Math.min(
    ...entrances.map((entry) =>
      Math.abs(
        coordinate -
          Number(
            isLongitudinal(candidate)
              ? entry.position_m?.x || entry.position?.x || 0
              : entry.position_m?.y || entry.position?.y || 0,
          ),
      ),
    ),
  );
  return clamp(1 - bestDistance / 4, 0, 1);
}

function scoreCirculation(projectGeometry = {}, candidate = {}) {
  const circulation = projectGeometry.circulation || [];
  if (!circulation.length) return 0.35;
  const coordinate = cutCoordinate(candidate);
  const bestDistance = Math.min(
    ...circulation.flatMap((path) =>
      (path.polyline || []).map((point) =>
        Math.abs(
          coordinate -
            Number(isLongitudinal(candidate) ? point.x || 0 : point.y || 0),
        ),
      ),
    ),
  );
  return clamp(1 - bestDistance / 3.5, 0, 1);
}

export function scoreSectionCandidate(projectGeometry = {}, candidate = {}) {
  const stairAlignment = scoreStairAlignment(projectGeometry, candidate);
  const roomCoverage = scoreRoomCoverage(projectGeometry, candidate);
  const entranceAlignment = scoreEntranceAlignment(projectGeometry, candidate);
  const circulationScore = scoreCirculation(projectGeometry, candidate);
  const levelSpan = (projectGeometry.levels || []).length > 1 ? 1 : 0.58;
  const usefulness = clamp(
    stairAlignment * 0.28 +
      roomCoverage * 0.24 +
      circulationScore * 0.18 +
      entranceAlignment * 0.1 +
      levelSpan * 0.2,
    0,
    1,
  );
  const rationale = [
    stairAlignment > 0.72
      ? "Cut aligns strongly with stair/core relationships."
      : "Cut only partially aligns with stair/core relationships.",
    roomCoverage > 0.72
      ? "Cut crosses multiple meaningful rooms."
      : "Cut crosses a limited room set.",
    circulationScore > 0.7
      ? "Cut follows the main circulation narrative."
      : "Cut is not strongly aligned to the main circulation path.",
  ];

  return {
    score: round(usefulness),
    sectionCandidateQuality:
      usefulness >= 0.78 ? "pass" : usefulness >= 0.64 ? "warning" : "block",
    categoryScores: {
      stairAlignment: round(stairAlignment),
      roomCoverage: round(roomCoverage),
      circulation: round(circulationScore),
      entranceAlignment: round(entranceAlignment),
      levelSpan: round(levelSpan),
    },
    rationale,
    focusedRoomCount: countFocusedRooms(projectGeometry, candidate),
  };
}

export function rankSectionCandidates(projectGeometry = {}, candidates = []) {
  return (candidates || [])
    .map((candidate) => {
      const evaluation = scoreSectionCandidate(projectGeometry, candidate);
      return {
        ...candidate,
        score: evaluation.score,
        sectionCandidateQuality: evaluation.sectionCandidateQuality,
        categoryScores: evaluation.categoryScores,
        rationale: [
          ...new Set([...(candidate.rationale || []), ...evaluation.rationale]),
        ],
        focusedRoomCount: evaluation.focusedRoomCount,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return String(left.id).localeCompare(String(right.id));
    });
}

export default {
  scoreSectionCandidate,
  rankSectionCandidates,
};

import { isFeatureEnabled } from "../../config/featureFlags.js";
import {
  buildSectionEvidence,
  buildSectionEvidenceSummary,
} from "./sectionEvidenceService.js";

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
  if (roomCount <= 0) {
    return 0.05;
  }
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
  const useSectionEvidence = isFeatureEnabled("useSectionEvidencePhase10");
  const sectionEvidence = buildSectionEvidence(projectGeometry, candidate);
  const sectionEvidenceSummary = buildSectionEvidenceSummary(sectionEvidence);
  const stairAlignment = scoreStairAlignment(projectGeometry, candidate);
  const roomCoverage = scoreRoomCoverage(projectGeometry, candidate);
  const entranceAlignment = scoreEntranceAlignment(projectGeometry, candidate);
  const circulationScore = scoreCirculation(projectGeometry, candidate);
  const levelSpan = (projectGeometry.levels || []).length > 1 ? 1 : 0.58;
  const strategyCommunication = clamp(
    Number(candidate.expectedCommunicationValue || 0.58),
    0,
    1,
  );
  const evidenceUsefulness = clamp(
    Number(sectionEvidenceSummary.usefulnessScore || 0),
    0,
    1,
  );
  const cutSpecificity = clamp(
    Number(sectionEvidenceSummary.cutSpecificity || 0),
    0,
    1,
  );
  const usefulness = clamp(
    stairAlignment * 0.19 +
      roomCoverage * 0.16 +
      circulationScore * 0.12 +
      entranceAlignment * 0.08 +
      levelSpan * 0.1 +
      strategyCommunication * 0.08 +
      (useSectionEvidence ? evidenceUsefulness * 0.2 : 0) +
      (useSectionEvidence ? cutSpecificity * 0.07 : 0),
    0,
    1,
  );
  let sectionCandidateQuality =
    usefulness >= 0.78 ? "pass" : usefulness >= 0.64 ? "warning" : "block";
  if (
    useSectionEvidence &&
    sectionEvidenceSummary.evidenceQuality === "pass" &&
    usefulness >= 0.74
  ) {
    sectionCandidateQuality = "pass";
  }
  if (
    useSectionEvidence &&
    sectionEvidenceSummary.evidenceQuality === "block" &&
    usefulness < 0.84
  ) {
    sectionCandidateQuality = "block";
  } else if (
    useSectionEvidence &&
    sectionEvidenceSummary.evidenceQuality === "warning" &&
    sectionCandidateQuality === "pass"
  ) {
    sectionCandidateQuality = "warning";
  }
  const rationale = [
    candidate.strategyName
      ? `${candidate.strategyName} strategy was selected as the deterministic section candidate.`
      : "Section candidate uses the default deterministic cut strategy.",
    stairAlignment > 0.72
      ? "Cut aligns strongly with stair/core relationships."
      : "Cut only partially aligns with stair/core relationships.",
    roomCoverage > 0.72
      ? "Cut crosses multiple meaningful rooms."
      : "Cut crosses a limited room set.",
    circulationScore > 0.7
      ? "Cut follows the main circulation narrative."
      : "Cut is not strongly aligned to the main circulation path.",
    ...sectionEvidence.rationale,
  ];

  return {
    score: round(usefulness),
    sectionCandidateQuality,
    categoryScores: {
      stairAlignment: round(stairAlignment),
      roomCoverage: round(roomCoverage),
      circulation: round(circulationScore),
      entranceAlignment: round(entranceAlignment),
      levelSpan: round(levelSpan),
      strategyCommunication: round(strategyCommunication),
      sectionEvidenceUsefulness: round(evidenceUsefulness),
      cutSpecificity: round(cutSpecificity),
    },
    rationale,
    focusedRoomCount: countFocusedRooms(projectGeometry, candidate),
    sectionEvidence,
    sectionEvidenceSummary,
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
        chosenStrategy: {
          id: candidate.strategyId || "default-section-strategy",
          name: candidate.strategyName || "Default Section Strategy",
          expectedCommunicationValue: Number(
            candidate.expectedCommunicationValue || 0,
          ),
        },
        rationale: [
          ...new Set([...(candidate.rationale || []), ...evaluation.rationale]),
        ],
        focusedRoomCount: evaluation.focusedRoomCount,
        sectionEvidence: evaluation.sectionEvidence,
        sectionEvidenceSummary: evaluation.sectionEvidenceSummary,
      };
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return String(left.id).localeCompare(String(right.id));
    })
    .map((candidate, index, array) => ({
      ...candidate,
      rejectedAlternatives: array
        .filter((entry) => entry.id !== candidate.id)
        .slice(0, 3)
        .map((entry) => ({
          id: entry.id,
          title: entry.title,
          strategyId: entry.strategyId || null,
          score: entry.score,
        })),
      selectedForBoard: index === 0,
    }));
}

export default {
  scoreSectionCandidate,
  rankSectionCandidates,
};

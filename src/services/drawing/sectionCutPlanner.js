import { isFeatureEnabled } from "../../config/featureFlags.js";
import { rankSectionCandidates } from "./sectionCandidateScoringService.js";
import { buildSectionStrategyCandidates } from "./sectionStrategyLibrary.js";

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function getBounds(projectGeometry = {}) {
  return (
    projectGeometry.site?.buildable_bbox ||
    projectGeometry.site?.boundary_bbox || {
      min_x: 0,
      min_y: 0,
      max_x: 12,
      max_y: 10,
      width: 12,
      height: 10,
    }
  );
}

function roomCenter(room = {}) {
  return {
    x: (Number(room.bbox?.min_x || 0) + Number(room.bbox?.max_x || 0)) / 2,
    y: (Number(room.bbox?.min_y || 0) + Number(room.bbox?.max_y || 0)) / 2,
  };
}

function buildCandidate(
  id,
  sectionType,
  cutLine,
  score,
  rationale,
  focusEntityIds,
) {
  return {
    id,
    sectionType,
    title: `Section ${sectionType.toUpperCase()}`,
    cutLine,
    score: round(score),
    rationale,
    focusEntityIds,
  };
}

export function selectSectionCandidates(projectGeometry = {}, options = {}) {
  const bounds = getBounds(projectGeometry);
  const stairs = projectGeometry.stairs || [];
  const levels = projectGeometry.levels || [];
  const openings = projectGeometry.windows || [];
  const rooms = (projectGeometry.rooms || [])
    .slice()
    .sort(
      (left, right) =>
        Number(right.actual_area || right.target_area_m2 || 0) -
        Number(left.actual_area || left.target_area_m2 || 0),
    );
  const longestAxis =
    Number(bounds.width || 0) >= Number(bounds.height || 0)
      ? "longitudinal"
      : "transverse";

  const stair = stairs[0] || null;
  const keyRoom = rooms[0] || null;
  const secondaryRoom = rooms[1] || keyRoom || null;
  const stairFocus = stair ? [`entity:stair:${stair.id}`] : [];
  const primaryRoomFocus = keyRoom ? [`entity:room:${keyRoom.id}`] : [];
  const secondaryRoomFocus = secondaryRoom
    ? [`entity:room:${secondaryRoom.id}`]
    : [];
  const centerX = stair?.bbox
    ? (Number(stair.bbox.min_x || 0) + Number(stair.bbox.max_x || 0)) / 2
    : keyRoom
      ? roomCenter(keyRoom).x
      : Number(bounds.min_x || 0) + Number(bounds.width || 12) / 2;
  const centerY = stair?.bbox
    ? (Number(stair.bbox.min_y || 0) + Number(stair.bbox.max_y || 0)) / 2
    : keyRoom
      ? roomCenter(keyRoom).y
      : Number(bounds.min_y || 0) + Number(bounds.height || 10) / 2;

  const longitudinal = buildCandidate(
    `section:${longestAxis}:primary`,
    "longitudinal",
    {
      from: { x: centerX, y: bounds.min_y },
      to: { x: centerX, y: bounds.max_y },
    },
    0.62 +
      (stairs.length ? 0.16 : 0) +
      (levels.length > 1 ? 0.08 : 0) +
      (rooms.length > 1 ? 0.06 : 0),
    [
      stairs.length
        ? "Primary longitudinal section is aligned to the stair/core for vertical communication."
        : keyRoom
          ? `Primary longitudinal section is aligned through ${keyRoom.name || keyRoom.id}.`
          : "Primary longitudinal section uses the buildable-envelope centerline.",
      levels.length > 1
        ? "Multiple levels increase vertical section usefulness."
        : "Single-level section remains useful for volumetric communication.",
      keyRoom
        ? `Largest room contribution: ${keyRoom.name || keyRoom.id}.`
        : "No dominant room could be identified for section targeting.",
    ],
    stairFocus.length ? [...stairFocus, ...primaryRoomFocus] : primaryRoomFocus,
  );
  longitudinal.semanticGoal = stair ? "vertical_circulation" : "primary_volume";

  const transverse = buildCandidate(
    "section:transverse:secondary",
    "transverse",
    {
      from: {
        x: bounds.min_x,
        y: stair
          ? centerY
          : secondaryRoom
            ? roomCenter(secondaryRoom).y
            : centerY,
      },
      to: {
        x: bounds.max_x,
        y: stair
          ? centerY
          : secondaryRoom
            ? roomCenter(secondaryRoom).y
            : centerY,
      },
    },
    0.55 +
      (openings.length ? 0.08 : 0) +
      (stairs.length ? 0.06 : 0) +
      (secondaryRoom ? 0.06 : 0),
    [
      stair
        ? "Secondary transverse section tracks stair depth and vertical circulation."
        : openings.length
          ? "Secondary transverse section samples main opening rhythm."
          : "Secondary transverse section cross-checks room depth and massing.",
      secondaryRoom && !stair
        ? `Secondary cut communicates ${secondaryRoom.name || secondaryRoom.id}.`
        : stair
          ? `Secondary cut remains anchored to ${stair.name || stair.id}.`
          : "Secondary cut defaults to the buildable-envelope centerline.",
    ],
    stairFocus.length ? stairFocus : secondaryRoomFocus,
  );
  transverse.semanticGoal = stair ? "stair_depth" : "secondary_space";

  const entrance = (projectGeometry.entrances || [])[0] || null;
  const entranceLongitudinal = entrance
    ? buildCandidate(
        "section:longitudinal:entrance",
        "longitudinal",
        {
          from: {
            x: Number(
              entrance.position_m?.x || entrance.position?.x || centerX,
            ),
            y: bounds.min_y,
          },
          to: {
            x: Number(
              entrance.position_m?.x || entrance.position?.x || centerX,
            ),
            y: bounds.max_y,
          },
        },
        0.58 + (levels.length > 1 ? 0.08 : 0) + (rooms.length > 2 ? 0.06 : 0),
        [
          "Alternate longitudinal section is anchored to the entrance axis for arrival-to-core communication.",
          entrance
            ? "Entrance alignment helps communicate how the building is approached and entered."
            : "No entrance anchor was available.",
        ],
        [
          ...(primaryRoomFocus || []),
          ...(entrance ? [`entity:entrance:${entrance.id || "main"}`] : []),
        ],
      )
    : null;
  if (entranceLongitudinal) {
    entranceLongitudinal.semanticGoal = "entrance_axis";
  }

  const alternateRoom = rooms[2] || secondaryRoom;
  const transverseLiving = alternateRoom
    ? buildCandidate(
        "section:transverse:room-sequence",
        "transverse",
        {
          from: {
            x: bounds.min_x,
            y: roomCenter(alternateRoom).y,
          },
          to: {
            x: bounds.max_x,
            y: roomCenter(alternateRoom).y,
          },
        },
        0.56 +
          (levels.length > 1 ? 0.06 : 0) +
          (openings.length > 2 ? 0.05 : 0),
        [
          `Alternate transverse section is centered through ${alternateRoom.name || alternateRoom.id} to communicate room sequence.`,
          openings.length
            ? "Opening data can be read against the section cut for facade depth communication."
            : "Facade opening relationships remain limited for this alternate cut.",
        ],
        [`entity:room:${alternateRoom.id}`],
      )
    : null;
  if (transverseLiving) {
    transverseLiving.semanticGoal = "room_sequence";
  }

  const legacyCandidates = [
    longitudinal,
    transverse,
    ...(entranceLongitudinal ? [entranceLongitudinal] : []),
    ...(transverseLiving ? [transverseLiving] : []),
  ];
  const strategyCandidates = isFeatureEnabled(
    "useSectionStrategyLibraryPhase10",
  )
    ? buildSectionStrategyCandidates(projectGeometry, options).candidates
    : [];
  const baseCandidates = strategyCandidates.length
    ? strategyCandidates
    : legacyCandidates;
  const rankedCandidates = isFeatureEnabled("useSectionSemanticSelectionPhase9")
    ? rankSectionCandidates(projectGeometry, baseCandidates)
    : [longitudinal, transverse].sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return String(left.id).localeCompare(String(right.id));
      });
  const hasPhase17ConstructionPrimitives =
    (projectGeometry.roof_primitives || []).some((entry) =>
      ["hip", "valley"].includes(String(entry.primitive_family || "")),
    ) ||
    (projectGeometry.foundations || []).some((entry) =>
      ["foundation_zone", "strip_footing_zone"].includes(
        String(entry.foundation_type || ""),
      ),
    ) ||
    (projectGeometry.base_conditions || []).some(
      (entry) => String(entry.condition_type || "") === "base_wall_condition",
    );

  return {
    version:
      isFeatureEnabled("useNearBooleanSectioningPhase20") ||
      isFeatureEnabled("useCentralizedSectionTruthModelPhase20") ||
      isFeatureEnabled("useDraftingGradeSectionGraphicsPhase20") ||
      isFeatureEnabled("useConstructionTruthDrivenSectionRankingPhase20") ||
      isFeatureEnabled("useSectionConstructionCredibilityGatePhase20")
        ? "phase20-section-cut-planner-v1"
        : isFeatureEnabled("useDeeperSectionClippingPhase18") ||
            isFeatureEnabled("useDraftingGradeSectionGraphicsPhase18") ||
            isFeatureEnabled("useConstructionTruthDrivenSectionRankingPhase18")
          ? "phase18-section-cut-planner-v1"
          : hasPhase17ConstructionPrimitives &&
              (isFeatureEnabled("useCanonicalConstructionTruthModelPhase17") ||
                isFeatureEnabled("useExplicitRoofPrimitiveSynthesisPhase17") ||
                isFeatureEnabled(
                  "useExplicitFoundationPrimitiveSynthesisPhase17",
                ) ||
                isFeatureEnabled("useDeeperRoofFoundationClippingPhase17"))
            ? "phase17-section-cut-planner-v1"
            : isFeatureEnabled("useTrueSectionClippingPhase13") ||
                isFeatureEnabled("useSectionTruthScoringPhase13")
              ? "phase13-section-cut-planner-v1"
              : isFeatureEnabled("useSectionStrategyLibraryPhase10")
                ? "phase10-section-cut-planner-v1"
                : isFeatureEnabled("useSectionSemanticSelectionPhase9")
                  ? "phase9-section-cut-planner-v1"
                  : "phase8-section-cut-planner-v1",
    candidates: rankedCandidates,
    chosenStrategy: rankedCandidates[0]?.chosenStrategy || null,
    rejectedAlternatives: rankedCandidates[0]?.rejectedAlternatives || [],
  };
}

export default {
  selectSectionCandidates,
};

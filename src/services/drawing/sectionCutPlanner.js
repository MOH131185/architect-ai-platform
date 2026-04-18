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
  const longestAxis =
    Number(bounds.width || 0) >= Number(bounds.height || 0)
      ? "longitudinal"
      : "transverse";

  const stair = stairs[0] || null;
  const stairFocus = stair ? [`entity:stair:${stair.id}`] : [];
  const centerX = stair?.bbox
    ? (Number(stair.bbox.min_x || 0) + Number(stair.bbox.max_x || 0)) / 2
    : Number(bounds.min_x || 0) + Number(bounds.width || 12) / 2;
  const centerY = stair?.bbox
    ? (Number(stair.bbox.min_y || 0) + Number(stair.bbox.max_y || 0)) / 2
    : Number(bounds.min_y || 0) + Number(bounds.height || 10) / 2;

  const longitudinal = buildCandidate(
    `section:${longestAxis}:primary`,
    "longitudinal",
    {
      from: { x: centerX, y: bounds.min_y },
      to: { x: centerX, y: bounds.max_y },
    },
    0.62 + (stairs.length ? 0.16 : 0) + (levels.length > 1 ? 0.08 : 0),
    [
      stairs.length
        ? "Primary longitudinal section is aligned to the stair/core for vertical communication."
        : "Primary longitudinal section uses the buildable-envelope centerline.",
      levels.length > 1
        ? "Multiple levels increase vertical section usefulness."
        : "Single-level section remains useful for volumetric communication.",
    ],
    stairFocus,
  );

  const transverse = buildCandidate(
    "section:transverse:secondary",
    "transverse",
    {
      from: { x: bounds.min_x, y: centerY },
      to: { x: bounds.max_x, y: centerY },
    },
    0.55 + (openings.length ? 0.08 : 0) + (stairs.length ? 0.06 : 0),
    [
      openings.length
        ? "Secondary transverse section samples main opening rhythm."
        : "Secondary transverse section cross-checks room depth and massing.",
    ],
    stairFocus,
  );

  return {
    version: "phase7-section-cut-planner-v1",
    candidates: [longitudinal, transverse].sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return String(left.id).localeCompare(String(right.id));
    }),
  };
}

export default {
  selectSectionCandidates,
};

function boxesOverlap(left = {}, right = {}) {
  return !(
    left.x + left.width <= right.x ||
    right.x + right.width <= left.x ||
    left.y + left.height <= right.y ||
    right.y + right.height <= left.y
  );
}

export function validateAnnotationPlacements(placements = [], options = {}) {
  const warnings = [];
  const errors = [];
  const minimumFontSize = Math.max(8, Number(options.minimumFontSize || 10));
  const collisions = [];

  (placements || []).forEach((placement) => {
    if (!placement?.id) {
      errors.push("Annotation placement is missing a stable id.");
    }
    if (!placement?.text || !String(placement.text).trim()) {
      errors.push(`Annotation ${placement?.id || "unknown"} has empty text.`);
    }
    if (
      !placement?.box ||
      !Number.isFinite(Number(placement.box.x)) ||
      !Number.isFinite(Number(placement.box.y)) ||
      !Number.isFinite(Number(placement.box.width)) ||
      !Number.isFinite(Number(placement.box.height))
    ) {
      errors.push(
        `Annotation ${placement?.id || "unknown"} is missing a valid placement box.`,
      );
    }
    if (Number(placement.fontSize || 0) < minimumFontSize) {
      warnings.push(
        `Annotation ${placement.id} font size ${placement.fontSize} is below the recommended minimum ${minimumFontSize}.`,
      );
    }
  });

  for (let index = 0; index < placements.length; index += 1) {
    for (let inner = index + 1; inner < placements.length; inner += 1) {
      const left = placements[index];
      const right = placements[inner];
      if (boxesOverlap(left.box, right.box)) {
        collisions.push([left.id, right.id]);
      }
    }
  }

  if (collisions.length > 0) {
    warnings.push(
      `${collisions.length} annotation placement collision(s) remain after deterministic fallback.`,
    );
  }

  const fallbackPlacements = (placements || []).filter(
    (placement) => placement.placementMode !== "ideal",
  );
  if (fallbackPlacements.length > 0) {
    warnings.push(
      `${fallbackPlacements.length} annotation(s) required fallback placement.`,
    );
  }

  return {
    version: "phase7-annotation-placement-validator-v1",
    placementStable: errors.length === 0 && collisions.length === 0,
    collisionCount: collisions.length,
    collisions,
    fallbackPlacementCount: fallbackPlacements.length,
    warnings,
    errors,
  };
}

export default {
  validateAnnotationPlacements,
};

/**
 * Entrance auto-trigger gate
 *
 * Pure decision helper for whether the wizard should automatically run
 * `handleAutoDetectEntrance` once the site polygon arrives. Pulled out of
 * `ArchitectAIWizardContainer` so the gating rules can be unit-tested
 * without rendering the full wizard.
 *
 * The gate fires (returns `true`) exactly when ALL of these hold:
 *   1. A usable site polygon (≥ 3 vertices) is available.
 *   2. No detection is currently in flight.
 *   3. No earlier auto-detect already recorded a result on projectDetails.
 *   4. The user has NOT already picked a non-default direction
 *      (manual override always wins; the wizard's default is "N").
 *
 * Returns a `{ shouldFire, reason }` object so callers can log *why* the
 * trigger did or did not fire — useful for diagnosing user reports of
 * "auto-detect not working" without sprinkling console logs at five
 * different gates inside the useEffect.
 */

export const ENTRANCE_AUTO_TRIGGER_DEFAULT_DIRECTIONS = Object.freeze([
  "",
  "N",
]);

export function shouldAutoTriggerEntranceDetection({
  sitePolygon = [],
  isDetectingEntrance = false,
  projectDetails = {},
} = {}) {
  if (!Array.isArray(sitePolygon) || sitePolygon.length < 3) {
    return {
      shouldFire: false,
      reason: "no_polygon",
      polygonLength: sitePolygon?.length || 0,
    };
  }
  if (isDetectingEntrance) {
    return { shouldFire: false, reason: "already_detecting" };
  }
  if (projectDetails.entranceAutoDetected === true) {
    return { shouldFire: false, reason: "already_auto_detected" };
  }
  const direction = projectDetails.entranceDirection;
  if (
    direction &&
    !ENTRANCE_AUTO_TRIGGER_DEFAULT_DIRECTIONS.includes(direction)
  ) {
    return {
      shouldFire: false,
      reason: "manual_direction_set",
      direction,
    };
  }
  return { shouldFire: true, reason: "ready" };
}

export default shouldAutoTriggerEntranceDetection;

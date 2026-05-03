/**
 * Boundary field normalization
 *
 * The site-boundary pipeline returns multiple area field names depending on
 * which layer produced the result:
 *   - modern proxy (api/site/boundary): areaM2
 *   - legacy propertyBoundaryService: area
 *   - some downstream consumers: surfaceAreaM2
 *
 * This helper consolidates them onto a single canonical field (areaM2) and
 * keeps a deprecated `area` alias for old UI code. Any new code should read
 * `areaM2` only.
 */

let warned = false;

function coerce(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Normalize a boundary record so both `area` and `areaM2` resolve to the same
 * number. Returns a NEW object — does not mutate the input.
 *
 * @param {object|null|undefined} boundary
 * @returns {object|null}
 */
export function normalizeAreaM2(boundary) {
  if (!boundary || typeof boundary !== "object") {
    return boundary ?? null;
  }
  const candidates = [
    coerce(boundary.areaM2),
    coerce(boundary.area),
    coerce(boundary.surfaceAreaM2),
    coerce(boundary?.metadata?.areaM2),
    coerce(boundary?.metadata?.area),
    coerce(boundary?.metadata?.surfaceAreaM2),
  ];
  const areaM2 = candidates.find((value) => value !== null) ?? 0;

  if (
    process.env.NODE_ENV !== "production" &&
    !warned &&
    boundary.area != null &&
    boundary.areaM2 == null
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      "[boundaryFields] Boundary record uses legacy `area` field; consumers should switch to `areaM2`.",
    );
    warned = true;
  }

  return {
    ...boundary,
    area: areaM2,
    areaM2,
    surfaceAreaM2: areaM2,
  };
}

/**
 * Read the canonical area in m² from a boundary record without producing a
 * new object. Useful for read-only UI sites that just want the number.
 *
 * @param {object|null|undefined} boundary
 * @returns {number} area in m², or 0 when not available
 */
export function readBoundaryAreaM2(boundary) {
  if (!boundary || typeof boundary !== "object") {
    return 0;
  }
  return (
    coerce(boundary.areaM2) ??
    coerce(boundary.area) ??
    coerce(boundary.surfaceAreaM2) ??
    coerce(boundary?.metadata?.areaM2) ??
    coerce(boundary?.metadata?.area) ??
    coerce(boundary?.metadata?.surfaceAreaM2) ??
    0
  );
}

export default {
  normalizeAreaM2,
  readBoundaryAreaM2,
};

/**
 * Boundary field normalization compatibility wrapper.
 *
 * New code should import from `services/site/boundaryPolicy.js`; this module
 * keeps the older utility path stable for existing UI callers and tests.
 */

import {
  buildManualVerifiedBoundary,
  normalizeBoundaryAreaFields,
  readBoundaryAreaM2,
  validateBoundaryPolygonForManualVerification,
} from "../services/site/boundaryPolicy.js";

let warned = false;

export function normalizeAreaM2(boundary) {
  if (
    process.env.NODE_ENV !== "production" &&
    !warned &&
    boundary &&
    typeof boundary === "object" &&
    boundary.area != null &&
    boundary.areaM2 == null
  ) {
    // eslint-disable-next-line no-console
    console.warn(
      "[boundaryFields] Boundary record uses legacy `area` field; consumers should switch to `areaM2`.",
    );
    warned = true;
  }
  return normalizeBoundaryAreaFields(boundary);
}

export {
  buildManualVerifiedBoundary,
  normalizeBoundaryAreaFields,
  readBoundaryAreaM2,
  validateBoundaryPolygonForManualVerification,
};

export default {
  normalizeAreaM2,
  normalizeBoundaryAreaFields,
  readBoundaryAreaM2,
  validateBoundaryPolygonForManualVerification,
  buildManualVerifiedBoundary,
};

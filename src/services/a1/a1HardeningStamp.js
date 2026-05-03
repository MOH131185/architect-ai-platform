/**
 * A1 hardening build-stamp (PR-D finishing).
 *
 * Records which slice of the 14-phase A1 consistency / site-boundary /
 * entry-direction hardening is baked into the running build. The stamp
 * appears in:
 *   - the compose manifest (manifest.buildStamp)
 *   - the consistency smoke output
 *
 * Bump A1_HARDENING_VERSION when the next round of follow-ups merges so
 * downstream consumers (QA, ops dashboards, support tooling) can tell at a
 * glance whether a given run came from the hardened pipeline.
 */

export const A1_HARDENING_VERSION = "a1-hardening-v1.1";

export const A1_HARDENING_PRS = Object.freeze([
  {
    id: "PR-A",
    title: "Authority stamping + diffusion block + 422 gate codes",
    phases: [1, 2, 3],
  },
  {
    id: "PR-B",
    title: "Roof pitch annotation in elevations + sections",
    phases: [4, 5, 6, 7],
  },
  {
    id: "PR-C",
    title:
      "Boundary legacy demotion + area normalization + main entry service " +
      "(plus re-review fixes: clear stale manual_verified, surfaceArea fallback)",
    phases: [8, 9, 10, 11],
  },
  {
    id: "PR-D",
    title:
      "Layout lock + flag aliases + consistency smoke + lightweight raster " +
      "test mode + manifest build-stamp",
    phases: [12, 13, 14],
  },
]);

export function buildA1HardeningStamp() {
  return {
    version: A1_HARDENING_VERSION,
    prs: A1_HARDENING_PRS.map((entry) => entry.id),
    phases: A1_HARDENING_PRS.flatMap((entry) => entry.phases),
    stampedAt: new Date(0).toISOString(),
  };
}

export default {
  A1_HARDENING_VERSION,
  A1_HARDENING_PRS,
  buildA1HardeningStamp,
};

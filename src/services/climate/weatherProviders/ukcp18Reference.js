/**
 * UKCP18 reference stub. Plan §1.3 / §6.3 / §13.4.
 *
 * The UK Climate Projections 2018 (UKCP18) dataset is the Met Office reference
 * for climate-change-aware design. Production access requires the CEDA
 * archive + UKCP18 user agreement. This module returns a metadata-only stub
 * that cites the dataset and warns the caller that downscaling has NOT been
 * performed — useful as an audit-trail entry on the climate pack.
 */

export const UKCP18_DATASET = Object.freeze({
  document_id: "ukcp18-met-office",
  title: "Met Office UKCP18 — UK Climate Projections 2018",
  source_url:
    "https://www.metoffice.gov.uk/research/approach/collaboration/ukcp",
  license_note:
    "UKCP18 access is via the CEDA archive under the UKCP18 user terms; downloads require a free CEDA account and the user must accept the UKCP18 licence.",
  resolutions: ["12km", "2.2km regional", "60km global"],
  scenarios: ["RCP2.6", "RCP4.5", "RCP6.0", "RCP8.5"],
});

export function ukcp18ReferenceFor(siteOrLocation = {}) {
  const lat = Number(siteOrLocation?.lat);
  const lon = Number(siteOrLocation?.lon);
  const haveCoords = Number.isFinite(lat) && Number.isFinite(lon);
  return {
    schema_version: "ukcp18-reference-v1",
    dataset: UKCP18_DATASET,
    site_query: haveCoords
      ? {
          lat,
          lon,
          query_resolved: false, // we don't fetch from CEDA at MVP
          note: "Site coordinates recorded for future UKCP18 downscaling; no live fetch performed.",
        }
      : null,
    data_quality: {
      severity: "info",
      message: haveCoords
        ? "UKCP18 reference attached to climate pack. Run an external downscaling job (e.g. CEDA THREDDS) before relying on projection numbers."
        : "UKCP18 reference attached without coordinates; no site-level lookup recorded.",
    },
  };
}

export default { UKCP18_DATASET, ukcp18ReferenceFor };

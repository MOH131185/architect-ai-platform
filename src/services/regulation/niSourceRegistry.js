/**
 * Northern Ireland Building Regulations source registry.
 *
 * NI uses the Building Regulations (Northern Ireland) administered by the
 * Department of Finance via building control offices. Technical Booklets
 * (A through R) are the equivalent of England's Approved Documents but with
 * NI-specific provisions. Plan §6.4: nation routing required.
 *
 * No rule engine today — citations only.
 */

export const TECHNICAL_BOOKLETS_NI = Object.freeze([
  {
    document_id: "ni-tb-B-2012",
    booklet: "B",
    title: "Technical Booklet B: Materials and workmanship",
    version: "2012",
    source_url:
      "https://www.finance-ni.gov.uk/publications/technical-booklet-b-2012-materials-and-workmanship",
    last_reviewed_at: null,
  },
  {
    document_id: "ni-tb-D-2012",
    booklet: "D",
    title: "Technical Booklet D: Structure",
    version: "2012",
    source_url:
      "https://www.finance-ni.gov.uk/publications/technical-booklet-d-structure",
    last_reviewed_at: null,
  },
  {
    document_id: "ni-tb-E-2012",
    booklet: "E",
    title: "Technical Booklet E: Fire safety",
    version: "2012 (with revisions)",
    source_url:
      "https://www.finance-ni.gov.uk/publications/technical-booklet-e-fire-safety",
    last_reviewed_at: null,
  },
  {
    document_id: "ni-tb-F1-2022",
    booklet: "F1",
    title: "Technical Booklet F1: Conservation of fuel and power — dwellings",
    version: "2022",
    source_url:
      "https://www.finance-ni.gov.uk/publications/technical-booklet-f1-conservation-fuel-and-power-dwellings",
    last_reviewed_at: null,
  },
  {
    document_id: "ni-tb-R-2012",
    booklet: "R",
    title: "Technical Booklet R: Access to and use of buildings",
    version: "2012",
    source_url:
      "https://www.finance-ni.gov.uk/publications/technical-booklet-r-access-and-use-buildings",
    last_reviewed_at: null,
  },
]);

export const NI_PLANNING_GUIDANCE = Object.freeze({
  document_id: "ni-strategic-planning-policy",
  title: "Strategic Planning Policy Statement for Northern Ireland",
  source_url:
    "https://www.infrastructure-ni.gov.uk/articles/strategic-planning-policy-statement",
  notes:
    "SPPS sets the strategic planning frame for NI. Consult alongside the relevant council Local Development Plan.",
});

export default {
  TECHNICAL_BOOKLETS_NI,
  NI_PLANNING_GUIDANCE,
};

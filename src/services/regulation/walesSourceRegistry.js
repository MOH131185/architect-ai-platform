/**
 * Welsh Building Regulations source registry.
 *
 * Wales follows England's Approved Document structure for several Parts but
 * has its own Part L (Conservation of fuel and power) since 2014 and its own
 * energy efficiency requirements. Plan §6.4: nation routing must cite
 * Wales-specific guidance, NOT England's, when site is in Wales.
 *
 * No rule engine evaluation today — these citations are produced by the
 * jurisdiction router for manual_review checks.
 */

export const APPROVED_DOCUMENTS_WALES = Object.freeze([
  {
    document_id: "wales-ad-A-2004",
    part: "A",
    title: "Approved Document A: Structure (Wales)",
    version: "2004 incorporating amendments",
    source_url:
      "https://www.gov.wales/sites/default/files/publications/2019-05/approved-document-a-structure.pdf",
    last_reviewed_at: null,
  },
  {
    document_id: "wales-ad-B-2020",
    part: "B",
    title: "Approved Document B: Fire safety (Wales)",
    version: "2020 amendments",
    source_url: "https://www.gov.wales/building-regulations-approved-documents",
    last_reviewed_at: null,
  },
  {
    document_id: "wales-ad-L-2022",
    part: "L",
    title: "Approved Document L: Conservation of fuel and power (Wales)",
    version: "2022 (Wales-specific)",
    source_url:
      "https://www.gov.wales/sites/default/files/publications/2022-12/approved-document-l-conservation-of-fuel-and-power-volume-1-dwellings-in-wales.pdf",
    last_reviewed_at: null,
  },
  {
    document_id: "wales-ad-M-2015",
    part: "M",
    title: "Approved Document M: Access and use of buildings (Wales)",
    version: "2015 incorporating amendments",
    source_url: "https://www.gov.wales/building-regulations-approved-documents",
    last_reviewed_at: null,
  },
]);

export const WELSH_PLANNING_GUIDANCE = Object.freeze({
  document_id: "wales-planning-policy",
  title: "Planning Policy Wales (Edition 12)",
  source_url:
    "https://www.gov.wales/sites/default/files/publications/2024-02/planning-policy-wales-edition-12.pdf",
  notes:
    "Wales Future Wales 2040 + PPW Edition 12 set the strategic planning frame; consult before applying England design-code patterns.",
});

export default {
  APPROVED_DOCUMENTS_WALES,
  WELSH_PLANNING_GUIDANCE,
};

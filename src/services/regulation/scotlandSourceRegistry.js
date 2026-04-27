/**
 * Scottish Building Standards source registry.
 *
 * Scotland uses Technical Handbooks (Domestic + Non-Domestic) administered by
 * Scottish Government via Building Standards. The structure is materially
 * different from England's Approved Documents (Sections 0-7 instead of Parts
 * A-T). Plan §6.4 requires nation-specific citations.
 *
 * No rule engine today — citations only.
 */

export const TECHNICAL_HANDBOOKS_SCOTLAND = Object.freeze([
  {
    document_id: "scot-th-domestic-2024",
    section: "Domestic",
    title: "Technical Handbook 2024 — Domestic",
    version: "2024 edition",
    source_url:
      "https://www.gov.scot/publications/building-standards-technical-handbook-2024-domestic/",
    last_reviewed_at: null,
  },
  {
    document_id: "scot-th-nondomestic-2024",
    section: "Non-Domestic",
    title: "Technical Handbook 2024 — Non-Domestic",
    version: "2024 edition",
    source_url:
      "https://www.gov.scot/publications/building-standards-technical-handbook-2024-non-domestic/",
    last_reviewed_at: null,
  },
]);

export const SCOTTISH_SECTION_INDEX = Object.freeze([
  { section: "0", title: "General" },
  { section: "1", title: "Structure" },
  { section: "2", title: "Fire" },
  { section: "3", title: "Environment" },
  { section: "4", title: "Safety" },
  { section: "5", title: "Noise" },
  { section: "6", title: "Energy" },
  { section: "7", title: "Sustainability" },
]);

export const SCOTTISH_PLANNING_GUIDANCE = Object.freeze({
  document_id: "scot-nppf-4",
  title: "National Planning Framework 4",
  source_url:
    "https://www.gov.scot/publications/national-planning-framework-4/",
  notes:
    "NPF4 (adopted 2023) is the statutory development plan for Scotland. Consult alongside any council Local Development Plan.",
});

export default {
  TECHNICAL_HANDBOOKS_SCOTLAND,
  SCOTTISH_SECTION_INDEX,
  SCOTTISH_PLANNING_GUIDANCE,
};

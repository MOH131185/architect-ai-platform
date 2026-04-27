/**
 * Approved Documents source registry (England). Plan §6.4 / §1.3.
 *
 * Each entry is the canonical reference a regulation pre-check rule cites.
 * `last_reviewed_at` is intentionally null until an admin curates a review;
 * the e2e test checks for source_documents presence, not freshness.
 */

export const APPROVED_DOCUMENTS_ENGLAND = Object.freeze([
  {
    document_id: "ad-A-2013",
    part: "A",
    title: "Approved Document A: Structure",
    version: "2013 incorporating 2013 amendments",
    source_url:
      "https://www.gov.uk/government/publications/structure-approved-document-a",
    last_reviewed_at: null,
  },
  {
    document_id: "ad-B-2022",
    part: "B",
    title: "Approved Document B: Fire safety",
    version: "2019 edition incorporating 2020 and 2022 amendments",
    source_url:
      "https://www.gov.uk/government/publications/fire-safety-approved-document-b",
    last_reviewed_at: null,
  },
  {
    document_id: "ad-E-2003",
    part: "E",
    title: "Approved Document E: Resistance to the passage of sound",
    version: "2003 edition incorporating 2004, 2010, 2013 and 2015 amendments",
    source_url:
      "https://www.gov.uk/government/publications/resistance-to-sound-approved-document-e",
    last_reviewed_at: null,
  },
  {
    document_id: "ad-F-2021",
    part: "F",
    title: "Approved Document F: Ventilation",
    version: "2021 edition",
    source_url:
      "https://www.gov.uk/government/publications/ventilation-approved-document-f",
    last_reviewed_at: null,
  },
  {
    document_id: "ad-G-2015",
    part: "G",
    title:
      "Approved Document G: Sanitation, hot water safety and water efficiency",
    version: "2015 edition incorporating 2016 amendments",
    source_url:
      "https://www.gov.uk/government/publications/sanitation-hot-water-safety-and-water-efficiency-approved-document-g",
    last_reviewed_at: null,
  },
  {
    document_id: "ad-H-2015",
    part: "H",
    title: "Approved Document H: Drainage and waste disposal",
    version: "2015 edition",
    source_url:
      "https://www.gov.uk/government/publications/drainage-and-waste-disposal-approved-document-h",
    last_reviewed_at: null,
  },
  {
    document_id: "ad-K-2013",
    part: "K",
    title: "Approved Document K: Protection from falling, collision and impact",
    version: "2013 edition incorporating 2013 amendments",
    source_url:
      "https://www.gov.uk/government/publications/protection-from-falling-collision-and-impact-approved-document-k",
    last_reviewed_at: null,
  },
  {
    document_id: "ad-L-2021",
    part: "L",
    title: "Approved Document L: Conservation of fuel and power",
    version: "2021 edition (2023 amendments)",
    source_url:
      "https://www.gov.uk/government/publications/conservation-of-fuel-and-power-approved-document-l",
    last_reviewed_at: null,
  },
  {
    document_id: "ad-M-2015",
    part: "M",
    title: "Approved Document M: Access to and use of buildings",
    version: "2015 edition incorporating 2016 amendments",
    source_url:
      "https://www.gov.uk/government/publications/access-to-and-use-of-buildings-approved-document-m",
    last_reviewed_at: null,
  },
  {
    document_id: "ad-O-2021",
    part: "O",
    title: "Approved Document O: Overheating",
    version: "2021 edition",
    source_url:
      "https://www.gov.uk/government/publications/overheating-approved-document-o",
    last_reviewed_at: null,
  },
  {
    document_id: "ad-Q-2015",
    part: "Q",
    title: "Approved Document Q: Security in dwellings",
    version: "2015 edition",
    source_url:
      "https://www.gov.uk/government/publications/security-in-dwellings-approved-document-q",
    last_reviewed_at: null,
  },
  {
    document_id: "ad-R-2016",
    part: "R",
    title:
      "Approved Document R: Physical infrastructure for high-speed electronic communications",
    version: "2016 edition",
    source_url:
      "https://www.gov.uk/government/publications/electronic-communications-approved-document-r",
    last_reviewed_at: null,
  },
  {
    document_id: "ad-S-2022",
    part: "S",
    title:
      "Approved Document S: Infrastructure for the charging of electric vehicles",
    version: "2022 edition",
    source_url:
      "https://www.gov.uk/government/publications/electric-vehicle-charging-approved-document-s",
    last_reviewed_at: null,
  },
  {
    document_id: "ad-T-2024",
    part: "T",
    title: "Approved Document T: Toilet accommodation",
    version: "2024 edition",
    source_url:
      "https://www.gov.uk/government/publications/toilet-accommodation-approved-document-t",
    last_reviewed_at: null,
  },
  {
    document_id: "regulation-7",
    part: "Regulation 7",
    title: "Building Regulations 2010, Regulation 7: Materials and workmanship",
    version: "2010 with subsequent amendments",
    source_url:
      "https://www.gov.uk/government/publications/materials-and-workmanship-approved-document-7",
    last_reviewed_at: null,
  },
]);

const BY_PART = new Map(
  APPROVED_DOCUMENTS_ENGLAND.map((doc) => [doc.part, doc]),
);
const BY_ID = new Map(
  APPROVED_DOCUMENTS_ENGLAND.map((doc) => [doc.document_id, doc]),
);

export function findSourceByPart(part) {
  return BY_PART.get(part) || null;
}

export function findSourceById(documentId) {
  return BY_ID.get(documentId) || null;
}

export function listSourceDocumentsForParts(parts = []) {
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    const doc = findSourceByPart(part);
    if (!doc || seen.has(doc.document_id)) continue;
    seen.add(doc.document_id);
    out.push({
      source_document_id: doc.document_id,
      title: doc.title,
      version: doc.version,
      url: doc.source_url,
      retrieved_at: doc.last_reviewed_at,
    });
  }
  return out;
}

export default {
  APPROVED_DOCUMENTS_ENGLAND,
  findSourceByPart,
  findSourceById,
  listSourceDocumentsForParts,
};

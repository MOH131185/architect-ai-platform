/**
 * Approved Document K — protection from falling, collision and impact.
 * Geometry-aware where possible; manual review otherwise. Plan §6.4 / §4.5.
 */

import { findSourceByPart } from "../sourceRegistry.js";

const SOURCE = findSourceByPart("K");
const SOURCE_DOC_ID = SOURCE?.document_id || "ad-K-2013";
const SOURCE_URL = SOURCE?.source_url || "";

function makeCheck({
  checkId,
  title,
  severity,
  status,
  summary,
  action,
  applies = [],
}) {
  return {
    check_id: checkId,
    title,
    source_document_id: SOURCE_DOC_ID,
    source_url: SOURCE_URL,
    severity,
    status,
    applies_to_element_ids: applies,
    summary,
    recommended_action: action,
  };
}

export function checkPartK({ brief, projectGeometry }) {
  const stairs = Array.isArray(projectGeometry?.stairs)
    ? projectGeometry.stairs
    : [];
  const targetStoreys = Math.max(1, Number(brief?.target_storeys || 1));
  const results = [];

  // K.1 — stair element present when more than one storey
  if (targetStoreys > 1) {
    results.push(
      makeCheck({
        checkId: "ad-K-stair-presence",
        title: "Approved Document K — stair geometry between storeys",
        severity: stairs.length > 0 ? "info" : "hard_blocker",
        status: stairs.length > 0 ? "pass" : "fail",
        summary:
          stairs.length > 0
            ? `${stairs.length} stair element(s) connect the programmed levels; pitch and rise/going to be verified at Stage 3.`
            : `Multi-storey scheme with ${targetStoreys} levels has no stair geometry — AD K cannot be evaluated.`,
        action:
          stairs.length > 0
            ? "At Stage 3, confirm rise (≤220 mm domestic / ≤190 mm public), going (≥220 mm), and pitch (≤42° / ≤38°)."
            : "Add a compliant stair element connecting all programmed levels.",
        applies: stairs.map((s) => s.id),
      }),
    );
  }

  // K.2 — guarding presence above 600 mm fall (manual review at this stage)
  results.push(
    makeCheck({
      checkId: "ad-K-guarding",
      title: "Approved Document K — guarding to falls",
      severity: "needs_consultant",
      status: "manual_review",
      summary:
        "Guarding heights, balustrade design, and infill spacing depend on detailed elevations not yet present at this stage.",
      action:
        "At Stage 4 verify: 900 mm minimum (domestic stair), 1100 mm minimum (balcony / public landing), 100 mm sphere infill rule.",
      applies: [],
    }),
  );

  // K.3 — headroom over stair (heuristic only; we don't store stair-soffit height yet)
  results.push(
    makeCheck({
      checkId: "ad-K-headroom",
      title: "Approved Document K — stair headroom",
      severity: "needs_consultant",
      status: "manual_review",
      summary:
        "Headroom over stairs requires the soffit profile from the level above, which is not yet detailed in the ProjectGraph.",
      action:
        "Verify 2.0 m minimum headroom along the entire flight at Stage 3 spatial coordination.",
      applies: stairs.map((s) => s.id),
    }),
  );

  return results;
}

export default { checkPartK };

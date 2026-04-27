/**
 * Approved Document M (England) — accessibility pre-checks driven by the
 * compiled ProjectGraph geometry. Plan §6.4 / §4.5.
 *
 * These are early-stage flags only; they do NOT replace consultant review.
 */

import { findSourceByPart } from "../sourceRegistry.js";

const SOURCE = findSourceByPart("M");
const SOURCE_DOC_ID = SOURCE?.document_id || "ad-M-2015";
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

const MIN_DOOR_WIDTH_M = 0.85;
const MIN_MAIN_ENTRANCE_WIDTH_M = 1.0;

export function checkPartM({ brief, programme, projectGeometry }) {
  const doors = Array.isArray(projectGeometry?.doors)
    ? projectGeometry.doors
    : [];
  const stairs = Array.isArray(projectGeometry?.stairs)
    ? projectGeometry.stairs
    : [];
  const programmeSpaces = Array.isArray(programme?.spaces)
    ? programme.spaces
    : [];
  const targetStoreys = Math.max(1, Number(brief?.target_storeys || 1));

  const results = [];

  // M.1 — door clear-width pre-check
  const narrowDoors = doors.filter((door) => {
    if (!door) return false;
    const required =
      door.kind === "main_entrance"
        ? MIN_MAIN_ENTRANCE_WIDTH_M
        : MIN_DOOR_WIDTH_M;
    return Number(door.width_m || 0) < required;
  });
  results.push(
    makeCheck({
      checkId: "ad-M-door-width",
      title: "Approved Document M — door clear width",
      severity: narrowDoors.length > 0 ? "warning" : "info",
      status: narrowDoors.length > 0 ? "fail" : "pass",
      summary:
        narrowDoors.length > 0
          ? `${narrowDoors.length} door(s) below the AD M clear-width threshold (main entrance ${MIN_MAIN_ENTRANCE_WIDTH_M}m, internal ${MIN_DOOR_WIDTH_M}m).`
          : `All ${doors.length} door(s) meet the AD M minimum clear-width pre-check.`,
      action:
        narrowDoors.length > 0
          ? "Widen flagged doors or substitute with sliding leaves to meet AD M minimum clear widths."
          : "No action — AD M door-width pre-check satisfied.",
      applies: narrowDoors.map((d) => d.id),
    }),
  );

  // M.2 — at least one accessible WC
  const accessibleWc = programmeSpaces.find((space) => {
    if (!space) return false;
    const name = String(space.name || "").toLowerCase();
    const fn = String(space.function || "").toLowerCase();
    const hasWcWord =
      name.includes("wc") || name.includes("toilet") || fn.includes("wc");
    const isAccessible =
      space.accessible !== false ||
      name.includes("accessible") ||
      fn.includes("accessible") ||
      fn.includes("inclusive");
    return hasWcWord && isAccessible;
  });
  results.push(
    makeCheck({
      checkId: "ad-M-accessible-wc",
      title: "Approved Document M — accessible WC presence",
      severity: accessibleWc ? "info" : "warning",
      status: accessibleWc ? "pass" : "fail",
      summary: accessibleWc
        ? `Accessible WC programmed: "${accessibleWc.name}".`
        : "No accessible WC found in programme; AD M requires at least one inclusive WC at the principal level.",
      action: accessibleWc
        ? "No action — accessible WC present."
        : "Add an accessible WC space to the programme at the principal entry level.",
      applies: accessibleWc ? [accessibleWc.space_id] : [],
    }),
  );

  // M.3 — main entrance level access (presence check)
  const mainEntrances = doors.filter((door) => door?.kind === "main_entrance");
  results.push(
    makeCheck({
      checkId: "ad-M-main-entrance",
      title: "Approved Document M — principal accessible entrance",
      severity: mainEntrances.length > 0 ? "info" : "warning",
      status: mainEntrances.length > 0 ? "pass" : "needs_consultant",
      summary:
        mainEntrances.length > 0
          ? `${mainEntrances.length} main entrance door identified at ground level.`
          : "No door tagged as a main entrance was found; AD M requires a clearly identified accessible principal entrance.",
      action:
        mainEntrances.length > 0
          ? "Verify threshold detail (≤15 mm upstand) and approach gradient with the access consultant."
          : "Tag the principal accessible entrance and confirm a level threshold and approach.",
      applies: mainEntrances.map((d) => d.id),
    }),
  );

  // M.4 — multi-storey vertical access
  if (targetStoreys > 1) {
    results.push(
      makeCheck({
        checkId: "ad-M-vertical-access",
        title: "Approved Document M — vertical access between storeys",
        severity: stairs.length > 0 ? "warning" : "hard_blocker",
        status: stairs.length > 0 ? "needs_consultant" : "fail",
        summary:
          stairs.length > 0
            ? `${stairs.length} stair element(s) provide vertical access; AD M Category 2/3 dwellings or non-domestic buildings may also require a passenger lift.`
            : `No stair element found in a ${targetStoreys}-storey scheme. Vertical access is required by AD M.`,
        action:
          stairs.length > 0
            ? "Confirm whether a lift is required by AD M (Category 2/3 dwellings or non-domestic) and add to the model if so."
            : "Add a compliant stair (and lift if applicable) connecting all programmed levels.",
        applies: stairs.map((s) => s.id),
      }),
    );
  }

  return results;
}

export default { checkPartM };

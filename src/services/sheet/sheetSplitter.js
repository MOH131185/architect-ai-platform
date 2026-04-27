/**
 * Sheet splitter — plan §6.11.
 *
 * When a single A1 cannot legibly carry every panel, split into a numbered
 * series (A1-01 overview, A1-02 plans/sections, A1-03 environment). Triggers:
 *   - programme spaces > 18, OR
 *   - target_storeys > 2, OR
 *   - regulation rule_summary.hard_blocker_count + warning_count > 6
 *
 * Each sheet plan describes which panel_types belong on it and the human-
 * readable label for the title block. Returns at minimum one plan so the
 * caller can always loop over sheets.
 */

export const SPLIT_THRESHOLDS = Object.freeze({
  programmeSpaces: 18,
  storeys: 2,
  regulationHotspots: 6,
});

const ALL_PANELS = Object.freeze([
  "site_context",
  "hero_3d",
  "exterior_render",
  "axonometric",
  "interior_3d",
  "floor_plan_ground",
  "floor_plan_first",
  "floor_plan_level2",
  "floor_plan_level3",
  "floor_plan_level4",
  "floor_plan_level5",
  "floor_plan_level6",
  "floor_plan_level7",
  "elevation_north",
  "elevation_south",
  "elevation_east",
  "elevation_west",
  "section_AA",
  "section_BB",
]);

const SPLIT_PLAN = Object.freeze([
  {
    sheet_number: "A1-01",
    label: "RIBA Stage 2 Overview",
    panel_types: [
      "site_context",
      "hero_3d",
      "exterior_render",
      "axonometric",
      "interior_3d",
    ],
    rationale: "Site context + compiled 3D views for client orientation.",
  },
  {
    sheet_number: "A1-02",
    label: "Plans and Sections",
    panel_types: [
      "floor_plan_ground",
      "floor_plan_first",
      "floor_plan_level2",
      "floor_plan_level3",
      "floor_plan_level4",
      "floor_plan_level5",
      "floor_plan_level6",
      "floor_plan_level7",
      "section_AA",
      "section_BB",
    ],
    rationale: "Spatial coordination drawings.",
  },
  {
    sheet_number: "A1-03",
    label: "Elevations and Environment",
    panel_types: [
      "elevation_north",
      "elevation_south",
      "elevation_east",
      "elevation_west",
    ],
    rationale: "Façade strategy and environmental response.",
  },
]);

const MASTER_PLAN_TEMPLATE = Object.freeze({
  sheet_number: "A1-00",
  label: "RIBA Stage 2 Master",
  panel_types: [...ALL_PANELS],
  rationale:
    "Comprehensive A1 master containing every required panel for client preview.",
  is_master: true,
});

/**
 * Decide whether to split the A1 deliverable into a multi-sheet series.
 *
 * @param {object} ctx
 * @param {object} ctx.brief
 * @param {object} ctx.programme
 * @param {object} ctx.regulations
 * @returns {{ split: boolean, sheets: Array<object>, triggers: object }}
 */
export function decideSheetSplit({ brief, programme, regulations } = {}) {
  const programmeSpaceCount = Array.isArray(programme?.spaces)
    ? programme.spaces.length
    : 0;
  const storeys = Math.max(1, Number(brief?.target_storeys || 1));
  const ruleSummary = regulations?.rule_summary || {};
  const regulationHotspots =
    Number(ruleSummary.hard_blocker_count || 0) +
    Number(ruleSummary.warning_count || 0);

  const triggers = {
    programmeSpaceCount,
    programmeOverflow: programmeSpaceCount > SPLIT_THRESHOLDS.programmeSpaces,
    storeys,
    storeyOverflow: storeys > SPLIT_THRESHOLDS.storeys,
    regulationHotspots,
    regulationOverflow:
      regulationHotspots > SPLIT_THRESHOLDS.regulationHotspots,
    thresholds: SPLIT_THRESHOLDS,
  };

  const split =
    triggers.programmeOverflow ||
    triggers.storeyOverflow ||
    triggers.regulationOverflow;

  const masterSheet = cloneSheetPlan([MASTER_PLAN_TEMPLATE])[0];
  const supplementarySheets = split ? cloneSheetPlan(SPLIT_PLAN) : [];

  return {
    split,
    triggers,
    sheets: split ? [masterSheet, ...supplementarySheets] : [masterSheet],
  };
}

function cloneSheetPlan(plan) {
  return plan.map((entry) => ({
    ...entry,
    panel_types: [...entry.panel_types],
  }));
}

export default { decideSheetSplit, SPLIT_THRESHOLDS };

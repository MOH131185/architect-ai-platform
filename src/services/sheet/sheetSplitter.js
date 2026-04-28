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
  "material_palette",
  "key_notes",
  "title_block",
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
      "material_palette",
      "key_notes",
      "title_block",
    ],
    rationale: "Site context + compiled 3D views for client orientation.",
    // Phase B: technical companion sheets force board-v2 (the dense
    // technical-first grid) even when the master is presentation-v3.
    layoutTemplate: "board-v2",
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
    layoutTemplate: "board-v2",
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
    layoutTemplate: "board-v2",
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

// Phase B: residential briefs that route to presentation-v3 fit up to 3
// storeys on a single A1-001 (the presentation grid stacks elevations on
// the right column and tiles ground/first/second plans across the top
// row). 4+ storeys still split, and programme/regulation overflow still
// trigger a split regardless of layout choice.
const RESIDENTIAL_PRESENTATION_STOREY_LIMIT = 3;

function looksResidential(buildingType) {
  if (!buildingType) return false;
  const normalized = String(buildingType).trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.includes("residential")) return true;
  if (normalized.includes("dwelling")) return true;
  if (
    [
      "house",
      "detached",
      "detached_house",
      "detached-house",
      "semi_detached",
      "semi-detached",
      "terraced",
      "terraced_house",
      "terraced-house",
      "townhouse",
      "family_house",
      "family-house",
      "apartment",
      "apartments",
      "flat",
      "flats",
      "extension",
      "loft_conversion",
      "loft-conversion",
      "refurb",
      "refurbishment",
      "single_dwelling",
      "single-dwelling",
    ].includes(normalized)
  ) {
    return true;
  }
  return false;
}

/**
 * Decide whether to split the A1 deliverable into a multi-sheet series.
 *
 * Phase B: when the brief is residential and would route to presentation-v3,
 * up to 3 storeys remain on the single master A1-001 sheet. Programme /
 * regulation overflow continue to force a split independent of layout.
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

  const buildingType = brief?.building_type || brief?.buildingType || null;
  const residentialPresentation = looksResidential(buildingType);

  // Phase B override: residential 1-3 storeys on presentation-v3 stay on a
  // single sheet even though storeys > SPLIT_THRESHOLDS.storeys (which is 2).
  // Beyond 3 storeys the technical content overflows the presentation grid
  // and we fall back to the existing storey-overflow trigger.
  const storeyOverflowRaw = storeys > SPLIT_THRESHOLDS.storeys;
  const storeyOverflowSuppressedByPresentation =
    residentialPresentation &&
    storeys <= RESIDENTIAL_PRESENTATION_STOREY_LIMIT &&
    storeyOverflowRaw;

  const triggers = {
    programmeSpaceCount,
    programmeOverflow: programmeSpaceCount > SPLIT_THRESHOLDS.programmeSpaces,
    storeys,
    storeyOverflow:
      storeyOverflowRaw && !storeyOverflowSuppressedByPresentation,
    storeyOverflowSuppressedByPresentation,
    residentialPresentation,
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

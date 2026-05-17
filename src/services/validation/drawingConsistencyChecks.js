import { isFeatureEnabled } from "../../config/featureFlags.js";

const VISUAL_PANEL_LOCK_TYPES = Object.freeze([
  "hero_3d",
  "exterior_render",
  "axonometric",
  "interior_3d",
]);

const TECHNICAL_PANEL_AUTHORITY_TYPES = Object.freeze([
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

function unique(items = []) {
  return [...new Set((items || []).filter(Boolean))];
}

function hasSvgPayload(entry) {
  const svg =
    entry?.svg ||
    entry?.svgString ||
    entry?.metadata?.svgString ||
    entry?.dataUrl ||
    entry?.imageUrl ||
    entry?.url;
  return Boolean(svg && String(svg).includes("<svg"));
}

const TECHNICAL_PANEL_CONTRACT_VERSION = "technical-panel-contract-v1";

function classTokenRegex(token) {
  return new RegExp(`class=["'][^"']*\\b${token}\\b[^"']*["']`, "i");
}

function svgHasId(svg, id) {
  return String(svg || "").includes(`id="${id}"`);
}

function svgHasClassToken(svg, token) {
  return classTokenRegex(token).test(String(svg || ""));
}

function numberFromEntry(entry, keys = []) {
  for (const key of keys) {
    const value =
      entry?.[key] ??
      entry?.metadata?.[key] ??
      entry?.technicalQualityMetadata?.[key] ??
      entry?.technical_quality_metadata?.[key] ??
      entry?.metadata?.technicalQualityMetadata?.[key] ??
      entry?.metadata?.technical_quality_metadata?.[key];
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) {
      return number;
    }
  }
  return 0;
}

function valueFromEntry(entry, keys = []) {
  for (const key of keys) {
    const value =
      entry?.[key] ??
      entry?.metadata?.[key] ??
      entry?.technicalQualityMetadata?.[key] ??
      entry?.technical_quality_metadata?.[key] ??
      entry?.metadata?.technicalQualityMetadata?.[key] ??
      entry?.metadata?.technical_quality_metadata?.[key];
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return null;
}

function panelTypeOf(entry) {
  return entry?.type || entry?.panelType || entry?.panel_type || null;
}

function normalizePanelEntries(panels = {}) {
  if (Array.isArray(panels)) {
    return panels
      .filter((panel) => panel !== undefined)
      .map((panel) => ({
        panel,
        type: panelTypeOf(panel),
      }));
  }
  if (!panels || typeof panels !== "object") return [];
  return Object.entries(panels).map(([type, panel]) => ({
    panel,
    type: panelTypeOf(panel) || type,
  }));
}

function panelMetadataOf(panel) {
  return panel?.metadata && typeof panel.metadata === "object"
    ? panel.metadata
    : {};
}

function readPanelField(panel, field) {
  const metadata = panelMetadataOf(panel);
  const candidates = [
    panel,
    metadata,
    panel?.meta,
    panel?.renderProvenance,
    metadata?.renderProvenance,
    panel?.imageRenderMetadata,
    metadata?.imageRenderMetadata,
    panel?.technicalQualityMetadata,
    metadata?.technicalQualityMetadata,
  ];
  for (const candidate of candidates) {
    if (candidate && Object.prototype.hasOwnProperty.call(candidate, field)) {
      return candidate[field];
    }
  }
  return null;
}

function readAnyPanelField(panel, fields = []) {
  for (const field of fields) {
    const value = readPanelField(panel, field);
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

function readPanelGeometryHash(panel) {
  return readAnyPanelField(panel, [
    "geometryHash",
    "sourceGeometryHash",
    "source_model_hash",
    "sourceModelHash",
    "geometry_hash",
  ]);
}

function readPanelVisualManifestHash(panel) {
  return readAnyPanelField(panel, [
    "visualManifestHash",
    "visual_manifest_hash",
  ]);
}

function normalizeAuthorityToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function booleanPanelField(panel, field) {
  const value = readPanelField(panel, field);
  return value === true || value === "true";
}

function isImageModelToken(value) {
  const token = normalizeAuthorityToken(value);
  if (!token || token === "deterministic" || token === "none") return false;
  return (
    token.includes("openai") ||
    token.includes("gpt-image") ||
    token.includes("dall-e") ||
    token.includes("dalle") ||
    token.includes("flux") ||
    token.includes("stability") ||
    token.includes("midjourney") ||
    token === "image_model" ||
    token === "text_to_image"
  );
}

function modelTokenIndicatesImageGeneration(value) {
  const token = normalizeAuthorityToken(value);
  if (!token) return false;
  return (
    token.includes("gpt-image") ||
    token.includes("dall-e") ||
    token.includes("dalle") ||
    token.includes("flux") ||
    token.includes("stability") ||
    token.includes("midjourney") ||
    token.includes("image")
  );
}

function panelUsesImageModel(panel) {
  return [
    readPanelField(panel, "provider"),
    readPanelField(panel, "providerUsed"),
    readPanelField(panel, "imageProviderUsed"),
    readPanelField(panel, "generationProvider"),
  ].some(isImageModelToken);
}

function technicalPanelUsesImageModel(panel) {
  if (booleanPanelField(panel, "openaiImageUsed")) return true;
  if (booleanPanelField(panel, "imageModelGenerated")) return true;
  if (booleanPanelField(panel, "technicalDrawingFromImageModel")) return true;
  if (panelUsesImageModel(panel)) return true;
  return [
    readPanelField(panel, "model"),
    readPanelField(panel, "imageRenderModel"),
  ].some(modelTokenIndicatesImageGeneration);
}

function visualPanelUsesTextOnlyGeneration(panel) {
  if (!panelUsesImageModel(panel)) return false;
  const referenceSource = normalizeAuthorityToken(
    readPanelField(panel, "referenceSource"),
  );
  const generationMode = normalizeAuthorityToken(
    readAnyPanelField(panel, [
      "generationMode",
      "imageGenerationMode",
      "renderMode",
      "visualRenderMode",
      "source",
    ]),
  );
  if (
    referenceSource === "compiled_3d_control_svg" ||
    generationMode === "geometry_locked_image_render"
  ) {
    return false;
  }
  return (
    !referenceSource ||
    referenceSource.includes("text") ||
    referenceSource.includes("prompt") ||
    generationMode.includes("text_to_image") ||
    generationMode.includes("prompt")
  );
}

function isTechnicalPanelType(type) {
  if (!type) return false;
  if (TECHNICAL_PANEL_AUTHORITY_TYPES.includes(type)) return true;
  return (
    String(type).startsWith("floor_plan_") ||
    String(type).startsWith("elevation_") ||
    String(type).startsWith("section_")
  );
}

function technicalPanelHasDeterministicSvgSource(panel) {
  const renderer = normalizeAuthorityToken(readPanelField(panel, "renderer"));
  const source = normalizeAuthorityToken(readPanelField(panel, "source"));
  const sourceType = normalizeAuthorityToken(
    readPanelField(panel, "sourceType"),
  );
  const providerUsed = normalizeAuthorityToken(
    readPanelField(panel, "providerUsed"),
  );
  const imageProviderUsed = normalizeAuthorityToken(
    readPanelField(panel, "imageProviderUsed"),
  );
  return (
    renderer === "deterministic_svg" ||
    providerUsed === "deterministic_svg" ||
    sourceType === "deterministic_svg" ||
    source === "compiled_project_technical_panel" ||
    source === "compiled_technical_svg" ||
    (imageProviderUsed === "none" && renderer === "deterministic_svg")
  );
}

function authorityError(code, message, details = {}) {
  return {
    code,
    message: `${code}: ${message}`,
    details,
  };
}

function pushAuthorityError(errors, code, panels, message) {
  if (!panels.length) return;
  errors.push(
    authorityError(code, message(panels), {
      panels,
    }),
  );
}

function hasAnyClassToken(svg, tokens = []) {
  return tokens.some((token) => svgHasClassToken(svg, token));
}

function hasCadLineweightClasses(entry, svg) {
  const classes = valueFromEntry(entry, ["cad_lineweight_classes"]);
  return (
    (Array.isArray(classes) && classes.length > 0) ||
    hasAnyClassToken(svg, [
      "cad-lineweight-cut",
      "cad-lineweight-outline",
      "cad-lineweight-primary",
      "cad-lineweight-secondary",
      "cad-lineweight-projection",
      "cad-lineweight-detail",
    ])
  );
}

function hasCadLayerClasses(entry, svg) {
  const classes = valueFromEntry(entry, ["cad_layer_classes"]);
  return (
    (Array.isArray(classes) && classes.length > 0) ||
    hasAnyClassToken(svg, [
      "cad-layer-walls",
      "cad-layer-material-hatches",
      "cad-layer-ground",
      "cad-layer-dimensions",
      "cad-layer-datums",
    ])
  );
}

function hasPlanRoomAreas(entry, svg) {
  return (
    numberFromEntry(entry, ["area_label_count"]) > 0 ||
    valueFromEntry(entry, ["has_room_area_labels"]) === true ||
    svgHasClassToken(svg, "room-area-label") ||
    /data-room-area-m2=/i.test(String(svg || ""))
  );
}

function hasPlanSectionMarkers(entry, svg) {
  return (
    numberFromEntry(entry, ["section_marker_count"]) > 0 ||
    svgHasId(svg, "plan-section-markers") ||
    svgHasClassToken(svg, "section-marker")
  );
}

function hasElevationDatum(entry, svg, datumRole) {
  const normalized = String(datumRole || "").toLowerCase();
  if (normalized === "eaves") {
    return (
      numberFromEntry(entry, ["eaves_datum_count"]) > 0 ||
      /data-datum-role=["']eaves["']/i.test(String(svg || ""))
    );
  }
  if (normalized === "ridge") {
    return (
      numberFromEntry(entry, ["ridge_datum_count"]) > 0 ||
      /data-datum-role=["']ridge["']/i.test(String(svg || ""))
    );
  }
  return /data-datum-role=["']ffl(?:-ground)?["']|FFL/i.test(String(svg || ""));
}

function hasSectionVerticalDimension(entry, svg) {
  return (
    numberFromEntry(entry, ["vertical_dimension_chain_count"]) > 0 ||
    valueFromEntry(entry, ["has_vertical_dimension_chain"]) === true ||
    svgHasClassToken(svg, "cad-vertical-dimension-chain")
  );
}

function collectPlanSectionLabels(entries = []) {
  const labels = new Set();
  for (const entry of entries || []) {
    const metaLabels = valueFromEntry(entry, ["section_marker_labels"]);
    if (Array.isArray(metaLabels)) {
      metaLabels.forEach((label) => labels.add(String(label).toUpperCase()));
    }
    const svg = String(entry?.svg || "");
    const matches = svg.matchAll(/data-section-label=["']([^"']+)["']/gi);
    for (const match of matches) {
      labels.add(String(match[1] || "").toUpperCase());
    }
  }
  return labels;
}

function normalizeSectionLabel(entry = {}) {
  const normalized = String(entry.section_id || entry.panel_type || "")
    .replace(/^SECTION[_ -]?/i, "")
    .replace(/^section[_ -]?/i, "")
    .replace(/_/g, "-")
    .toUpperCase();
  const compact = normalized.replace(/[^A-Z]/g, "");
  if (
    compact.length === 2 &&
    compact[0] === compact[1] &&
    !normalized.includes("-")
  ) {
    return `${compact[0]}-${compact[1]}`;
  }
  return normalized;
}

function hasPlanScaleBar(entry, svg) {
  return (
    svgHasId(svg, "scale-bar") ||
    svgHasId(svg, "blueprint-scale-bar") ||
    numberFromEntry(entry, ["scale_bar_count"]) > 0 ||
    entry?.technicalQualityMetadata?.has_scale_bar === true ||
    entry?.technical_quality_metadata?.has_scale_bar === true ||
    entry?.metadata?.technicalQualityMetadata?.has_scale_bar === true ||
    entry?.metadata?.technical_quality_metadata?.has_scale_bar === true
  );
}

function hasPlanRoomLabels(entry, svg) {
  return (
    svgHasId(svg, "room-label") ||
    svgHasId(svg, "plan-room-labels") ||
    svgHasClassToken(svg, "room-label") ||
    svgHasClassToken(svg, "room-labels") ||
    svgHasClassToken(svg, "plan-room-label") ||
    numberFromEntry(entry, ["room_label_count"]) > 0
  );
}

function hasDimensionChain(entry, svg) {
  return (
    svgHasClassToken(svg, "dimension-chain") ||
    numberFromEntry(entry, ["dimension_chain_count"]) > 0 ||
    entry?.technicalQualityMetadata?.has_overall_dimensions === true ||
    entry?.technical_quality_metadata?.has_overall_dimensions === true ||
    entry?.metadata?.technicalQualityMetadata?.has_overall_dimensions ===
      true ||
    entry?.metadata?.technical_quality_metadata?.has_overall_dimensions === true
  );
}

function hasGroundLine(entry, svg) {
  return (
    svgHasId(svg, "ground-line") ||
    svgHasId(svg, "phase8-ground-line") ||
    svgHasId(svg, "phase3-section-ground-hatch") ||
    numberFromEntry(entry, ["ground_line_count", "ground_hatch_band_lines"]) >
      0 ||
    entry?.technicalQualityMetadata?.ground_hatch_visible === true ||
    entry?.technical_quality_metadata?.ground_hatch_visible === true ||
    entry?.metadata?.technicalQualityMetadata?.ground_hatch_visible === true ||
    entry?.metadata?.technical_quality_metadata?.ground_hatch_visible === true
  );
}

function hasSectionIdentifier(entry, svg) {
  return (
    /section[- ]?[A-Z]-[A-Z]/i.test(String(svg || "")) ||
    /section[- ]?[A-Z]-[A-Z]/i.test(String(entry?.section_id || "")) ||
    /section[-_ ]?[A-Z]{2}/i.test(String(entry?.section_id || "")) ||
    /section[-_ ]?[A-Z]{2}/i.test(String(entry?.panel_type || ""))
  );
}

// A plan SVG is "sheet-mode" when it is being composed inside the global A1
// sheet (which renders ONE north arrow and ONE title block at the sheet
// chrome level, not per panel). The plan renderer intentionally omits the
// per-panel north-arrow / title-block in that case to avoid double-rendering.
// We accept any of the well-known signals callers may attach so the check is
// resilient to future plumbing tweaks:
//   - explicit `entry.sheet_mode === true` (slice-level forwarded flag)
//   - `entry.technicalQualityMetadata.sheet_mode === true`
//     (camelCase key used by canonical pack builder)
//   - `entry.technical_quality_metadata.sheet_mode === true`
//     (snake_case key as the renderer originally emits it)
//   - `entry.metadata.technicalQualityMetadata.sheet_mode === true`
//   - `entry.metadata.technical_quality_metadata.sheet_mode === true`
//   - SVG carries the `data-sheet-mode="true"` attribute (defensive — not
//     emitted today, allows the renderer to opt in later without re-touching
//     this validator).
function isSheetModePlan(entry) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.sheet_mode === true || entry.sheetMode === true) return true;
  const metaCandidates = [
    entry.technicalQualityMetadata,
    entry.technical_quality_metadata,
    entry.metadata?.technicalQualityMetadata,
    entry.metadata?.technical_quality_metadata,
  ];
  for (const meta of metaCandidates) {
    if (meta && meta.sheet_mode === true) return true;
  }
  const svg = String(entry.svg || "");
  if (svg.includes('data-sheet-mode="true"')) return true;
  return false;
}

function validateCollection(name, entries = [], minimumCount = 1) {
  const warnings = [];
  const errors = [];

  if (entries.length < minimumCount) {
    errors.push(
      `${name} is incomplete: expected at least ${minimumCount} output(s).`,
    );
  }

  entries.forEach((entry, index) => {
    if (!hasSvgPayload(entry)) {
      errors.push(`${name}[${index}] is missing SVG content.`);
    }
  });

  return { warnings, errors };
}

function validatePlanCollection(entries = [], levelCount = 1) {
  const base = validateCollection("drawings.plan", entries, levelCount);
  const warnings = [...base.warnings];
  const errors = [...base.errors];
  const seenLevels = new Set();

  entries.forEach((entry, index) => {
    if (entry?.level_id) {
      if (seenLevels.has(entry.level_id)) {
        warnings.push(
          `drawings.plan[${index}] duplicates level_id "${entry.level_id}".`,
        );
      }
      seenLevels.add(entry.level_id);
    }

    const svg = String(entry?.svg || "");
    const sheetModeEntry = isSheetModePlan(entry);
    // Per-panel north-arrow and title-block are required for STANDALONE
    // technical exports (single-plan PDFs, vector previews, etc). They are
    // INTENTIONALLY omitted when the plan is composed into the A1 sheet,
    // because the sheet renders a single global north arrow + title block.
    // Only relax these two specific marker requirements for sheet-mode —
    // everything else (scale-bar, room-label, dimension-chain warnings,
    // cross-view storey/window agreement, SVG payload presence) stays.
    if (svg && !sheetModeEntry && !svg.includes('id="north-arrow"')) {
      errors.push(`drawings.plan[${index}] is missing the north-arrow marker.`);
    }
    if (svg && !sheetModeEntry && !svg.includes('id="title-block"')) {
      errors.push(`drawings.plan[${index}] is missing the title-block marker.`);
    }
    // Reliability checks added 2026-05-02 to surface common A1 floor-plan
    // regressions (missing scale bar, no room labels, no dimension chains)
    // as warnings rather than letting them slip through silently.
    if (svg && !hasPlanScaleBar(entry, svg)) {
      warnings.push(
        `drawings.plan[${index}] has no scale-bar marker — A1 plans should include a scale bar.`,
      );
    }
    if (svg && !hasPlanRoomLabels(entry, svg)) {
      warnings.push(
        `drawings.plan[${index}] has no room-label text elements — rooms may render unlabelled.`,
      );
    }
    if (svg && !hasDimensionChain(entry, svg)) {
      warnings.push(
        `drawings.plan[${index}] has no dimension-chain — outer dimensions may be missing.`,
      );
    }
  });

  if (entries.length > levelCount) {
    warnings.push(
      `drawings.plan returned ${entries.length} outputs for ${levelCount} level(s).`,
    );
  }

  return { warnings, errors };
}

function validateElevationCollection(entries = [], projectGeometry = {}) {
  const base = validateCollection("drawings.elevation", entries, 1);
  const warnings = [...base.warnings];
  const errors = [...base.errors];
  const expectedWindowCount = (projectGeometry.windows || []).length;
  const reportedWindowCount = entries.reduce(
    (sum, entry) => sum + Number(entry.window_count || 0),
    0,
  );

  if (expectedWindowCount > 0 && reportedWindowCount === 0) {
    warnings.push(
      "Elevation outputs do not report any windows despite exterior openings in geometry.",
    );
  }

  // Reliability checks added 2026-05-02: every elevation should mark FFL
  // (finished floor level) and have a ground line — without these the
  // user can't read floor heights off the elevation.
  entries.forEach((entry, index) => {
    const svg = String(entry?.svg || "");
    if (svg && !hasGroundLine(entry, svg)) {
      warnings.push(
        `drawings.elevation[${index}] is missing the ground-line marker.`,
      );
    }
    if (svg && !svg.match(/FFL|finished floor|level-marker/i)) {
      warnings.push(
        `drawings.elevation[${index}] has no FFL / level markers — floor heights unreadable.`,
      );
    }
  });

  return { warnings, errors };
}

function validateSectionCollection(entries = [], projectGeometry = {}) {
  const base = validateCollection("drawings.section", entries, 1);
  const warnings = [...base.warnings];
  const errors = [...base.errors];
  const expectedStairCount = (projectGeometry.stairs || []).length;
  const reportedStairCount = entries.reduce(
    (sum, entry) => sum + Number(entry.stair_count || 0),
    0,
  );

  if (expectedStairCount > 0 && reportedStairCount === 0) {
    warnings.push(
      "Section outputs do not report stair graphics despite multi-level stair geometry.",
    );
  }

  // Reliability checks added 2026-05-02: sections without ground lines or
  // section markers (A-A / B-B labels) can't be cross-referenced with
  // their cut-line on the plan.
  entries.forEach((entry, index) => {
    const svg = String(entry?.svg || "");
    if (svg && !hasGroundLine(entry, svg)) {
      warnings.push(
        `drawings.section[${index}] is missing the ground-line marker.`,
      );
    }
    if (svg && !hasSectionIdentifier(entry, svg)) {
      warnings.push(
        `drawings.section[${index}] has no section identifier (A-A, B-B) — cannot cross-reference with plan.`,
      );
    }
  });

  return { warnings, errors };
}

/**
 * Cross-view consistency: compare counts that should agree across drawing
 * types. The 2D drawings and the 3D panels are derived from the same
 * ProjectGraph, so disagreement here means a render path silently dropped
 * or invented elements that aren't in the source geometry.
 *
 * Returns warnings (not errors) — a discrepancy is a strong smell but
 * shouldn't block export until we are confident the per-view counters
 * are reliable.
 */
function validateCrossViewConsistency({ drawings = {}, projectGeometry = {} }) {
  const warnings = [];
  const planEntries = drawings.plan || [];
  const elevationEntries = drawings.elevation || [];
  const sectionEntries = drawings.section || [];

  // 1. Plan window count vs elevation window count. The plan shows windows
  // as openings on the perimeter; elevations show them as glazing panels.
  // For a single building these should match exactly.
  const planWindowCount = planEntries.reduce(
    (sum, entry) => sum + Number(entry?.window_count || 0),
    0,
  );
  const elevationWindowCount = elevationEntries.reduce(
    (sum, entry) => sum + Number(entry?.window_count || 0),
    0,
  );
  if (
    planWindowCount > 0 &&
    elevationWindowCount > 0 &&
    planWindowCount !== elevationWindowCount
  ) {
    warnings.push(
      `Cross-view: plan reports ${planWindowCount} windows but elevations report ${elevationWindowCount} — same building should have the same opening count.`,
    );
  }

  // 2. Floor count in plan vs section. A two-storey plan must have a
  // section that spans both storeys.
  const planLevelCount = planEntries.length;
  const expectedFloorCount = Math.max(1, (projectGeometry.levels || []).length);
  const reportedSectionFloorCount = sectionEntries.reduce(
    (max, entry) => Math.max(max, Number(entry?.floor_count || 0)),
    0,
  );
  if (
    expectedFloorCount > 1 &&
    reportedSectionFloorCount > 0 &&
    reportedSectionFloorCount < expectedFloorCount
  ) {
    warnings.push(
      `Cross-view: project has ${expectedFloorCount} floors but section only depicts ${reportedSectionFloorCount} — section must span all storeys.`,
    );
  }
  if (
    planLevelCount > 0 &&
    expectedFloorCount > 0 &&
    planLevelCount !== expectedFloorCount
  ) {
    warnings.push(
      `Cross-view: ${planLevelCount} plan(s) returned for ${expectedFloorCount} ProjectGraph level(s).`,
    );
  }

  // 3. Visual identity hash agreement (3D panels). When `visualIdentityLocked`
  // is true on the panels, all panels must carry the same
  // `visualManifestHash` so 2D and 3D are derived from the same geometry.
  const panels = Array.isArray(drawings.panels) ? drawings.panels : [];
  if (panels.length > 1) {
    const hashes = panels
      .map((panel) => panel?.metadata?.visualManifestHash)
      .filter(Boolean);
    const distinct = [...new Set(hashes)];
    if (hashes.length === panels.length && distinct.length > 1) {
      warnings.push(
        `Cross-view: panels carry ${distinct.length} different visualManifestHash values — 2D and 3D derive from different geometry.`,
      );
    }
    const allLocked = panels.every(
      (panel) => panel?.metadata?.visualIdentityLocked === true,
    );
    if (!allLocked) {
      warnings.push(
        "Cross-view: at least one panel reports visualIdentityLocked=false — 2D/3D consistency cannot be guaranteed.",
      );
    }
  }

  return warnings;
}

export function validateVisualPanelLocks({
  panels = {},
  expectedGeometryHash = null,
  expectedVisualManifestHash = null,
  imageGenEnabled = false,
  strictPhotoreal = false,
} = {}) {
  const warnings = [];
  const errors = [];
  const entries = normalizePanelEntries(panels);
  const panelMap = new Map();
  for (const entry of entries) {
    if (VISUAL_PANEL_LOCK_TYPES.includes(entry.type)) {
      panelMap.set(entry.type, entry.panel);
    }
  }

  const missingVisualPanels = [];
  const missingGeometryHashPanels = [];
  const geometryMismatchPanels = [];
  const geometryHashByPanel = {};
  const missingVisualManifestHashPanels = [];
  const visualManifestMismatchPanels = [];
  const visualManifestHashByPanel = {};
  const unlockedVisualPanels = [];
  const textOnlyVisualPanels = [];
  const strictFallbackPanels = [];

  for (const type of VISUAL_PANEL_LOCK_TYPES) {
    const panel = panelMap.get(type);
    if (!panel) {
      missingVisualPanels.push(type);
      continue;
    }

    const geometryHash = readPanelGeometryHash(panel);
    if (!geometryHash) {
      missingGeometryHashPanels.push(type);
    } else {
      geometryHashByPanel[type] = geometryHash;
      if (expectedGeometryHash && geometryHash !== expectedGeometryHash) {
        geometryMismatchPanels.push(type);
      }
    }

    const visualManifestHash = readPanelVisualManifestHash(panel);
    if (!visualManifestHash) {
      missingVisualManifestHashPanels.push(type);
    } else {
      visualManifestHashByPanel[type] = visualManifestHash;
      if (
        expectedVisualManifestHash &&
        visualManifestHash !== expectedVisualManifestHash
      ) {
        visualManifestMismatchPanels.push(type);
      }
    }

    if (readPanelField(panel, "visualIdentityLocked") !== true) {
      unlockedVisualPanels.push(type);
    }

    if (visualPanelUsesTextOnlyGeneration(panel)) {
      textOnlyVisualPanels.push(type);
    }

    if (
      imageGenEnabled === true &&
      strictPhotoreal === true &&
      booleanPanelField(panel, "imageRenderFallback")
    ) {
      strictFallbackPanels.push(type);
    }
  }

  pushAuthorityError(
    errors,
    "VISUAL_PANEL_MISSING",
    missingVisualPanels,
    (panelTypes) =>
      `Required visual panel(s) missing: ${panelTypes.join(", ")}.`,
  );
  pushAuthorityError(
    errors,
    "PROJECT_PANEL_GEOMETRY_HASH_MISSING",
    missingGeometryHashPanels,
    (panelTypes) =>
      `Visual panel(s) missing geometryHash/sourceGeometryHash/source_model_hash: ${panelTypes.join(", ")}.`,
  );
  pushAuthorityError(
    errors,
    "PROJECT_PANEL_GEOMETRY_HASH_MISMATCH",
    geometryMismatchPanels,
    (panelTypes) =>
      `Visual panel geometry hash differs from expectedGeometryHash for: ${panelTypes.join(", ")}.`,
  );
  pushAuthorityError(
    errors,
    "VISUAL_MANIFEST_HASH_MISSING",
    missingVisualManifestHashPanels,
    (panelTypes) =>
      `Visual panel(s) missing visualManifestHash: ${panelTypes.join(", ")}.`,
  );
  pushAuthorityError(
    errors,
    "VISUAL_MANIFEST_HASH_MISMATCH",
    visualManifestMismatchPanels,
    (panelTypes) =>
      `Visual panel visualManifestHash differs from expectedVisualManifestHash for: ${panelTypes.join(", ")}.`,
  );
  pushAuthorityError(
    errors,
    "VISUAL_IDENTITY_UNLOCKED",
    unlockedVisualPanels,
    (panelTypes) =>
      `Visual panel(s) are missing visualIdentityLocked=true: ${panelTypes.join(", ")}.`,
  );
  pushAuthorityError(
    errors,
    "VISUAL_PANEL_TEXT_ONLY_IMAGE_GENERATION",
    textOnlyVisualPanels,
    (panelTypes) =>
      `Visual panel(s) used an image model without compiled_3d_control_svg referenceSource: ${panelTypes.join(", ")}.`,
  );
  pushAuthorityError(
    errors,
    "STRICT_IMAGE_RENDER_FALLBACK",
    strictFallbackPanels,
    (panelTypes) =>
      `imageRenderFallback=true while image generation and strict photoreal mode are enabled: ${panelTypes.join(", ")}.`,
  );

  return {
    warnings,
    errors,
    checks: {
      requiredVisualPanelTypes: VISUAL_PANEL_LOCK_TYPES.slice(),
      evaluatedPanelCount: panelMap.size,
      expectedGeometryHash,
      expectedVisualManifestHash,
      imageGenEnabled: imageGenEnabled === true,
      strictPhotoreal: strictPhotoreal === true,
      missingVisualPanels,
      missingGeometryHashPanels,
      geometryMismatchPanels,
      geometryHashByPanel,
      geometryHashes: unique(Object.values(geometryHashByPanel)),
      missingVisualManifestHashPanels,
      visualManifestMismatchPanels,
      visualManifestHashByPanel,
      visualManifestHashes: unique(Object.values(visualManifestHashByPanel)),
      unlockedVisualPanels,
      textOnlyVisualPanels,
      strictFallbackPanels,
    },
  };
}

export function validateTechnicalPanelAuthority({
  technicalPanels = {},
  expectedGeometryHash = null,
} = {}) {
  const warnings = [];
  const errors = [];
  const entries = normalizePanelEntries(technicalPanels).filter((entry) =>
    isTechnicalPanelType(entry.type),
  );
  const missingSvgPanels = [];
  const missingGeometryHashPanels = [];
  const geometryMismatchPanels = [];
  const imageModelPanels = [];
  const nonDeterministicPanels = [];
  const geometryHashByPanel = {};

  for (const { panel, type } of entries) {
    if (!panel || !hasSvgPayload(panel)) {
      missingSvgPanels.push(type);
      if (!panel) continue;
    }

    const geometryHash = readPanelGeometryHash(panel);
    if (!geometryHash) {
      missingGeometryHashPanels.push(type);
    } else {
      geometryHashByPanel[type] = geometryHash;
      if (expectedGeometryHash && geometryHash !== expectedGeometryHash) {
        geometryMismatchPanels.push(type);
      }
    }

    if (technicalPanelUsesImageModel(panel)) {
      imageModelPanels.push(type);
    }

    if (
      readPanelField(panel, "technicalDrawing") !== true ||
      !technicalPanelHasDeterministicSvgSource(panel)
    ) {
      nonDeterministicPanels.push(type);
    }
  }

  pushAuthorityError(
    errors,
    "TECHNICAL_PANEL_MISSING_SVG",
    missingSvgPanels,
    (panelTypes) =>
      `Technical panel(s) missing deterministic SVG payload: ${panelTypes.join(", ")}.`,
  );
  pushAuthorityError(
    errors,
    "TECHNICAL_PANEL_GEOMETRY_HASH_MISSING",
    missingGeometryHashPanels,
    (panelTypes) =>
      `Technical panel(s) missing geometryHash/source_model_hash: ${panelTypes.join(", ")}.`,
  );
  pushAuthorityError(
    errors,
    "TECHNICAL_PANEL_GEOMETRY_HASH_MISMATCH",
    geometryMismatchPanels,
    (panelTypes) =>
      `Technical panel geometry hash differs from expectedGeometryHash for: ${panelTypes.join(", ")}.`,
  );
  pushAuthorityError(
    errors,
    "TECHNICAL_PANEL_IMAGE_MODEL_USED",
    imageModelPanels,
    (panelTypes) =>
      `Technical panel(s) used image generation instead of deterministic SVG: ${panelTypes.join(", ")}.`,
  );
  pushAuthorityError(
    errors,
    "TECHNICAL_PANEL_NOT_MARKED_DETERMINISTIC",
    nonDeterministicPanels,
    (panelTypes) =>
      `Technical panel(s) are not marked as technicalDrawing=true with deterministic SVG renderer/source metadata: ${panelTypes.join(", ")}.`,
  );

  return {
    warnings,
    errors,
    checks: {
      expectedGeometryHash,
      evaluatedPanelCount: entries.length,
      technicalPanelTypes: entries.map((entry) => entry.type),
      missingSvgPanels,
      missingGeometryHashPanels,
      geometryMismatchPanels,
      geometryHashByPanel,
      geometryHashes: unique(Object.values(geometryHashByPanel)),
      imageModelPanels,
      nonDeterministicPanels,
    },
  };
}

export function validateTechnicalPanelContract({
  technicalPanels = {},
  expectedGeometryHash = null,
} = {}) {
  const result = validateTechnicalPanelAuthority({
    technicalPanels,
    expectedGeometryHash,
  });
  return {
    ...result,
    checks: {
      version: TECHNICAL_PANEL_CONTRACT_VERSION,
      passed: result.errors.length === 0,
      ...result.checks,
    },
  };
}

function validateCadGradeTechnicalQa({ drawings = {}, projectGeometry = {} }) {
  const warnings = [];
  const planEntries = drawings.plan || [];
  const elevationEntries = drawings.elevation || [];
  const sectionEntries = drawings.section || [];

  planEntries.forEach((entry, index) => {
    const svg = String(entry?.svg || "");
    if (svg && !hasPlanRoomLabels(entry, svg)) {
      warnings.push(
        `CAD_QA_PLAN_ROOM_LABELS: drawings.plan[${index}] has no room labels.`,
      );
    }
    if (svg && !hasPlanRoomAreas(entry, svg)) {
      warnings.push(
        `CAD_QA_PLAN_ROOM_AREAS: drawings.plan[${index}] has no room area labels.`,
      );
    }
    if (svg && !hasDimensionChain(entry, svg)) {
      warnings.push(
        `CAD_QA_PLAN_DIMENSIONS: drawings.plan[${index}] has no dimension chain.`,
      );
    }
    if (svg && !hasPlanSectionMarkers(entry, svg)) {
      warnings.push(
        `CAD_QA_SECTION_MARKERS_MISSING: drawings.plan[${index}] has no coordinated section markers.`,
      );
    }
    if (
      svg &&
      (!hasCadLayerClasses(entry, svg) || !hasCadLineweightClasses(entry, svg))
    ) {
      warnings.push(
        `CAD_QA_LINEWEIGHT_CLASSES: drawings.plan[${index}] is missing CAD layer or line-weight classes.`,
      );
    }
  });

  elevationEntries.forEach((entry, index) => {
    const svg = String(entry?.svg || "");
    if (svg && !hasElevationDatum(entry, svg, "ffl")) {
      warnings.push(
        `CAD_QA_ELEVATION_FFL_DATUM: drawings.elevation[${index}] has no FFL datum.`,
      );
    }
    if (svg && !hasElevationDatum(entry, svg, "eaves")) {
      warnings.push(
        `CAD_QA_ELEVATION_EAVES_DATUM: drawings.elevation[${index}] has no eaves datum.`,
      );
    }
    if (svg && !hasElevationDatum(entry, svg, "ridge")) {
      warnings.push(
        `CAD_QA_ELEVATION_RIDGE_DATUM: drawings.elevation[${index}] has no ridge/parapet datum.`,
      );
    }
    if (
      svg &&
      (!hasCadLayerClasses(entry, svg) || !hasCadLineweightClasses(entry, svg))
    ) {
      warnings.push(
        `CAD_QA_LINEWEIGHT_CLASSES: drawings.elevation[${index}] is missing CAD layer or line-weight classes.`,
      );
    }
  });

  sectionEntries.forEach((entry, index) => {
    const svg = String(entry?.svg || "");
    if (svg && !hasGroundLine(entry, svg)) {
      warnings.push(
        `CAD_QA_SECTION_GROUND_LINE: drawings.section[${index}] has no ground line or hatch.`,
      );
    }
    if (svg && !hasSectionVerticalDimension(entry, svg)) {
      warnings.push(
        `CAD_QA_SECTION_VERTICAL_DIMENSION: drawings.section[${index}] has no vertical dimension chain.`,
      );
    }
    if (
      svg &&
      (!hasCadLayerClasses(entry, svg) || !hasCadLineweightClasses(entry, svg))
    ) {
      warnings.push(
        `CAD_QA_LINEWEIGHT_CLASSES: drawings.section[${index}] is missing CAD layer or line-weight classes.`,
      );
    }
  });

  const expectedWindows = (projectGeometry.windows || []).length;
  const expectedDoors = (projectGeometry.doors || []).length;
  const expectedOpenings = expectedWindows + expectedDoors;
  const planOpenings = planEntries.reduce(
    (sum, entry) =>
      sum +
      Number(entry?.window_count || 0) +
      numberFromEntry(entry, ["door_count"]),
    0,
  );
  const elevationWindows = elevationEntries.reduce(
    (sum, entry) => sum + Number(entry?.window_count || 0),
    0,
  );
  const elevationDoors = elevationEntries.reduce(
    (sum, entry) => sum + numberFromEntry(entry, ["door_count"]),
    0,
  );
  const elevationOpenings = elevationWindows + elevationDoors;
  const expectedElevationOpenings =
    elevationDoors > 0 ? expectedOpenings : expectedWindows;
  if (
    expectedOpenings > 0 &&
    ((planOpenings > 0 && planOpenings !== expectedOpenings) ||
      (elevationOpenings > 0 &&
        elevationOpenings !== expectedElevationOpenings))
  ) {
    warnings.push(
      `CAD_QA_OPENING_COUNT_ALIGNMENT: ProjectGraph has ${expectedOpenings} openings, plans report ${planOpenings}, elevations report ${elevationOpenings}.`,
    );
  }

  const planSectionLabels = collectPlanSectionLabels(planEntries);
  if (sectionEntries.length && planSectionLabels.size) {
    sectionEntries.forEach((entry, index) => {
      const label = normalizeSectionLabel(entry);
      if (label && !planSectionLabels.has(label)) {
        warnings.push(
          `CAD_QA_SECTION_MARKER_ALIGNMENT: drawings.section[${index}] (${label}) has no matching plan section marker.`,
        );
      }
    });
  }

  return warnings;
}

export function runDrawingConsistencyChecks({
  projectGeometry,
  drawings = {},
  drawingTypes = ["plan", "elevation", "section"],
  enableCrossViewChecks = true,
} = {}) {
  const warnings = [];
  const errors = [];
  const levelCount = Math.max(1, (projectGeometry?.levels || []).length);

  if (drawingTypes.includes("plan")) {
    const planCheck = validatePlanCollection(drawings.plan || [], levelCount);
    warnings.push(...planCheck.warnings);
    errors.push(...planCheck.errors);
  }

  if (drawingTypes.includes("elevation")) {
    const elevationCheck = validateElevationCollection(
      drawings.elevation || [],
      projectGeometry,
    );
    warnings.push(...elevationCheck.warnings);
    errors.push(...elevationCheck.errors);
  }

  if (drawingTypes.includes("section")) {
    const sectionCheck = validateSectionCollection(
      drawings.section || [],
      projectGeometry,
    );
    warnings.push(...sectionCheck.warnings);
    errors.push(...sectionCheck.errors);
  }

  if (enableCrossViewChecks) {
    const crossViewWarnings = validateCrossViewConsistency({
      drawings,
      projectGeometry,
    });
    warnings.push(...crossViewWarnings);
  }

  const cadGradeTechnicalQa = isFeatureEnabled("cadGradeTechnicalQa");
  if (cadGradeTechnicalQa) {
    warnings.push(
      ...validateCadGradeTechnicalQa({
        drawings,
        projectGeometry,
      }),
    );
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    checks: {
      requestedTypes: drawingTypes,
      levelCount,
      crossViewChecks: enableCrossViewChecks,
      cadGradeTechnicalQa,
      cadGradeTechnicalQaBlocking: false,
      counts: {
        plan: (drawings.plan || []).length,
        elevation: (drawings.elevation || []).length,
        section: (drawings.section || []).length,
        panels: (drawings.panels || []).length,
      },
    },
  };
}

export { validateCrossViewConsistency };

export default {
  runDrawingConsistencyChecks,
  validateCrossViewConsistency,
  validateTechnicalPanelAuthority,
  validateVisualPanelLocks,
  validateTechnicalPanelContract,
};

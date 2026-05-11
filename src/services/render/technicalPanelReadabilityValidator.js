/**
 * Technical panel readability validator.
 *
 * Runs after the deterministic SVG renderers have produced individual
 * technical panels and BEFORE the A1 sheet composer accepts them. It
 * surfaces three classes of readability failure that the user reported
 * on non-residential (Office Studio) sheets:
 *
 *   1. Tiny panels — the slot the panel was rendered into came out
 *      below the minimum readable pixel footprint for its drawing
 *      type. Sheet acceptance should warn (or fail in strict mode) so
 *      a continuation technical sheet can be requested instead of
 *      shipping unreadable panels.
 *
 *   2. Clipped top/bottom content — elevations whose ridge datum sits
 *      outside the viewBox, or sections whose roof allowance ate into
 *      the level labels. The deterministic renderers attach a
 *      `technical_quality_metadata` object on every panel; this
 *      validator inspects the relevant flags.
 *
 *   3. Low content occupancy — a panel that renders correctly but
 *      fills less than the agreed minimum percentage of its slot
 *      because the geometry collapsed (single-room office, very thin
 *      facade, etc.). At that point the deterministic SVG is still
 *      authoritative — we only flag the panel so the composer can
 *      promote it to a larger slot or split to a companion sheet.
 *
 * The validator is pure: no DOM, no fetch, no side effects. Tests can
 * stub panels with arbitrary `technical_quality_metadata` and assert
 * the returned report. Authority guarantees on technical drawings are
 * **not** touched — the panels themselves remain unchanged; this only
 * produces diagnostic flags.
 */

// Minimum readable pixel footprint per drawing type. Kept consistent
// with getTechnicalPanelRenderSize in compiledProjectTechnicalPackBuilder
// so the validator can't mark a panel as "tiny" unless the size builder
// genuinely failed to upscale it. Elevation min bumped to 640×400 to
// match the readability work in this PR.
export const TECHNICAL_PANEL_MIN_SIZE = Object.freeze({
  plan: { width: 760, height: 420 },
  section: { width: 720, height: 400 },
  elevation: { width: 640, height: 400 },
});

// Minimum drawn-content occupancy as a fraction of the panel area.
// Below this the panel is visually empty (e.g. a thin facade rendered
// inside a square slot) and should trigger a layout reflow rather than
// be shipped as-is.
const MIN_CONTENT_OCCUPANCY = 0.35;

export const READABILITY_CODES = Object.freeze({
  PANEL_BELOW_MIN_SIZE: "PANEL_BELOW_MIN_SIZE",
  CONTENT_CLIPPED_TOP: "CONTENT_CLIPPED_TOP",
  CONTENT_CLIPPED_BOTTOM: "CONTENT_CLIPPED_BOTTOM",
  CONTENT_OCCUPANCY_LOW: "CONTENT_OCCUPANCY_LOW",
  ROOF_DATUM_MISSING: "ROOF_DATUM_MISSING",
  POCHE_OBSCURES_LABELS: "POCHE_OBSCURES_LABELS",
});

function classifyPanel(panelType) {
  if (!panelType || typeof panelType !== "string") return "other";
  if (panelType.startsWith("floor_plan_")) return "plan";
  if (panelType.startsWith("section_")) return "section";
  if (panelType.startsWith("elevation_")) return "elevation";
  return "other";
}

function panelArea(panel) {
  const width = Number(panel?.width) || 0;
  const height = Number(panel?.height) || 0;
  return Math.max(0, width * height);
}

function inferContentOccupancy(panel, drawingClass) {
  const meta =
    panel?.technical_quality_metadata ||
    panel?.metadata?.technical_quality_metadata ||
    null;
  // The renderers can hint at content extent via specific markers. When
  // none of them are present we assume the panel is acceptable rather
  // than fail noisily — this validator is opt-in additive.
  if (!meta) return null;
  const explicit = Number(meta.content_occupancy_ratio);
  if (Number.isFinite(explicit) && explicit > 0 && explicit <= 1) {
    return explicit;
  }
  if (drawingClass === "plan") {
    const roomCount = Number(meta.room_label_count || 0);
    const wallCount = Number(meta.wall_count || meta.wall_segment_count || 0);
    if (roomCount === 0 && wallCount === 0) return 0;
  }
  if (drawingClass === "section") {
    const cuts = Number(
      meta.section_wall_cut_count || meta.wall_cut_count || 0,
    );
    if (cuts === 0) return 0;
  }
  if (drawingClass === "elevation") {
    if (meta.roof_profile_visible === false) return 0.2;
  }
  return null;
}

function evaluatePanel(panel, options = {}) {
  const drawingClass = classifyPanel(panel?.panelType || panel?.type);
  const issues = [];
  if (drawingClass === "other") {
    // Not a technical drawing panel — ignore.
    return { panelType: panel?.panelType || null, drawingClass, issues };
  }

  const minSize = TECHNICAL_PANEL_MIN_SIZE[drawingClass];
  if (minSize) {
    const width = Number(panel?.width) || 0;
    const height = Number(panel?.height) || 0;
    if (width < minSize.width || height < minSize.height) {
      issues.push({
        code: READABILITY_CODES.PANEL_BELOW_MIN_SIZE,
        severity: "error",
        message:
          `${drawingClass} panel rendered at ${width}x${height}px, ` +
          `below readable minimum ${minSize.width}x${minSize.height}px.`,
        panelType: panel?.panelType || null,
      });
    }
  }

  const meta =
    panel?.technical_quality_metadata ||
    panel?.metadata?.technical_quality_metadata ||
    null;
  if (meta) {
    if (
      meta.content_clipped_top === true ||
      meta.top_content_clipped === true
    ) {
      issues.push({
        code: READABILITY_CODES.CONTENT_CLIPPED_TOP,
        severity: "error",
        message: "Top content (roof / ridge datum / level label) clipped.",
        panelType: panel?.panelType || null,
      });
    }
    if (
      meta.content_clipped_bottom === true ||
      meta.bottom_content_clipped === true
    ) {
      issues.push({
        code: READABILITY_CODES.CONTENT_CLIPPED_BOTTOM,
        severity: "error",
        message: "Bottom content (ground line / foundation datum) clipped.",
        panelType: panel?.panelType || null,
      });
    }
    if (drawingClass === "elevation" && meta.roof_profile_visible === false) {
      issues.push({
        code: READABILITY_CODES.ROOF_DATUM_MISSING,
        severity: "warning",
        message: "Elevation roof profile not visible — likely clipped at top.",
        panelType: panel?.panelType || null,
      });
    }
    if (drawingClass === "section" && meta.poche_dominates_labels === true) {
      issues.push({
        code: READABILITY_CODES.POCHE_OBSCURES_LABELS,
        severity: "warning",
        message: "Section poche fill is obscuring room labels.",
        panelType: panel?.panelType || null,
      });
    }
  }

  const occupancy = inferContentOccupancy(panel, drawingClass);
  const occupancyFloor = Number.isFinite(options.minContentOccupancy)
    ? options.minContentOccupancy
    : MIN_CONTENT_OCCUPANCY;
  if (occupancy !== null && occupancy < occupancyFloor) {
    issues.push({
      code: READABILITY_CODES.CONTENT_OCCUPANCY_LOW,
      severity: "warning",
      message:
        `Content occupies only ${(occupancy * 100).toFixed(0)}% of the ` +
        `panel area (floor ${(occupancyFloor * 100).toFixed(0)}%).`,
      panelType: panel?.panelType || null,
    });
  }

  return {
    panelType: panel?.panelType || null,
    drawingClass,
    width: Number(panel?.width) || 0,
    height: Number(panel?.height) || 0,
    area: panelArea(panel),
    occupancy,
    issues,
  };
}

/**
 * Validate readability across an array of technical panels.
 *
 * @param {{panels: Array<object>, minContentOccupancy?: number}} input
 * @returns {{
 *   status: "pass" | "warning" | "fail",
 *   issues: Array<{code:string,severity:string,message:string,panelType:string|null}>,
 *   panelReports: Array<object>,
 *   summary: {errorCount: number, warningCount: number, panelCount: number, evaluatedCount: number}
 * }}
 */
export function validateTechnicalPanelReadability({
  panels = [],
  minContentOccupancy,
} = {}) {
  const panelReports = panels.map((panel) =>
    evaluatePanel(panel, { minContentOccupancy }),
  );
  const issues = panelReports.flatMap((report) => report.issues);
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const evaluatedCount = panelReports.filter(
    (r) => r.drawingClass !== "other",
  ).length;
  const status =
    errorCount > 0 ? "fail" : warningCount > 0 ? "warning" : "pass";
  return {
    status,
    issues,
    panelReports,
    summary: {
      errorCount,
      warningCount,
      panelCount: panels.length,
      evaluatedCount,
    },
  };
}

export default validateTechnicalPanelReadability;

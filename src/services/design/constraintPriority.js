/**
 * Constraint priority enforcement. Plan §3.2:
 *
 *   1. Safety, statutory constraints, and site boundary
 *   2. Programme and accessibility
 *   3. Climate / passive performance and material suitability
 *   4. Local planning / context / design-code character
 *   5. User style preference
 *   6. Portfolio / graphic presentation style
 *
 * detectConflicts returns Conflict[] describing where a lower-priority
 * preference was dropped because a higher-priority constraint won. The
 * conflicts are surfaced into qa.warnings so the user sees what was
 * over-ridden, with the rationale.
 */

export const CONSTRAINT_PRIORITY = Object.freeze([
  "safety",
  "programme",
  "climate",
  "local",
  "user",
  "portfolio",
]);

const CLIMATE_INCOMPATIBLE_KEYWORDS = [
  "all-glass",
  "fully glazed",
  "frameless glass facade",
  "highly reflective glazing",
  "mirrored facade",
  "thin glazing",
];

const CONTEXT_INCOMPATIBLE_KEYWORDS = [
  "sci-fi",
  "futurism",
  "alien geometry",
  "blob form",
  "parametric ribbon",
];

function lc(value) {
  return String(value || "").toLowerCase();
}

function arrayLc(arr) {
  return Array.isArray(arr) ? arr.map(lc) : [];
}

function makeConflict({
  conflictId,
  higherPriority,
  lowerPriority,
  higherKept,
  lowerDropped,
  severity,
  rationale,
}) {
  return {
    conflict_id: conflictId,
    higher_priority: higherPriority,
    lower_priority: lowerPriority,
    higher_priority_kept: higherKept,
    lower_priority_dropped: lowerDropped,
    severity,
    summary: rationale,
  };
}

export function detectConflicts({
  brief,
  site,
  climate,
  programme,
  regulations,
  localStyle,
} = {}) {
  const conflicts = [];
  const styleKw = arrayLc(brief?.user_intent?.style_keywords);
  const matPrefs = arrayLc(brief?.user_intent?.material_preferences);
  const userKeywords = [...styleKw, ...matPrefs];

  // Conflict 1 — climate vs user: high/medium overheating risk + user-requested
  // unshaded glazing patterns.
  const overheatingRisk = climate?.overheating?.risk_level || "unknown";
  const climateDropped = userKeywords.filter((kw) =>
    CLIMATE_INCOMPATIBLE_KEYWORDS.some((bad) => kw.includes(bad)),
  );
  if (
    climateDropped.length > 0 &&
    (overheatingRisk === "high" || overheatingRisk === "medium")
  ) {
    conflicts.push(
      makeConflict({
        conflictId: "climate-overrides-user-glazing",
        higherPriority: "climate",
        lowerPriority: "user",
        higherKept: `overheating risk = ${overheatingRisk}; controlled shading required`,
        lowerDropped: climateDropped,
        severity: "warning",
        rationale: `Climate suitability outranks user preference per plan §3.2; the requested unshaded-glazing keywords (${climateDropped.join(", ")}) were de-emphasised in the material palette.`,
      }),
    );
  }

  // Conflict 2 — local vs user: heritage / conservation site + user wants
  // sculptural / sci-fi forms.
  const heritageFlagged =
    Array.isArray(site?.heritage_flags) && site.heritage_flags.length > 0;
  const contextDropped = userKeywords.filter((kw) =>
    CONTEXT_INCOMPATIBLE_KEYWORDS.some((bad) => kw.includes(bad)),
  );
  if (heritageFlagged && contextDropped.length > 0) {
    conflicts.push(
      makeConflict({
        conflictId: "local-overrides-user-context",
        higherPriority: "local",
        lowerPriority: "user",
        higherKept: "heritage / conservation context detected on site",
        lowerDropped: contextDropped,
        severity: "warning",
        rationale: `Local planning / heritage character outranks user style preference per plan §3.2; the requested context-incompatible language (${contextDropped.join(", ")}) was de-emphasised.`,
      }),
    );
  }

  // Conflict 3 — local vs user: low local_blend_strength on a heritage site.
  const localBlend = Number(brief?.user_intent?.local_blend_strength);
  if (heritageFlagged && Number.isFinite(localBlend) && localBlend < 0.3) {
    conflicts.push(
      makeConflict({
        conflictId: "local-overrides-low-blend-strength",
        higherPriority: "local",
        lowerPriority: "user",
        higherKept: "heritage / conservation context detected on site",
        lowerDropped: `local_blend_strength=${localBlend}`,
        severity: "warning",
        rationale: `Heritage context outranks user blend slider per plan §3.2; low local_blend_strength (${localBlend}) was raised toward the local palette.`,
      }),
    );
  }

  // Conflict 4 — safety vs user: any hard-blocker regulation result.
  const hardBlockerCount = regulations?.rule_summary?.hard_blocker_count || 0;
  if (hardBlockerCount > 0) {
    conflicts.push(
      makeConflict({
        conflictId: "safety-overrides-user",
        higherPriority: "safety",
        lowerPriority: "user",
        higherKept: `${hardBlockerCount} regulation hard-blocker(s) flagged`,
        lowerDropped: "user-driven typology choice",
        severity: "error",
        rationale: `Safety / statutory constraints outrank all other inputs per plan §3.2; the design must be revised to clear ${hardBlockerCount} hard-blocker(s) before progressing.`,
      }),
    );
  }

  // Conflict 5 — programme vs user: building type doesn't match the resolved
  // template (template_provenance fallback).
  const tp = programme?.template_provenance;
  if (tp?.source === "fallback_template") {
    conflicts.push(
      makeConflict({
        conflictId: "programme-overrides-unknown-type",
        higherPriority: "programme",
        lowerPriority: "user",
        higherKept: `community programme template substituted for unknown type "${tp.requested_building_type}"`,
        lowerDropped: tp.requested_building_type,
        severity: "warning",
        rationale: `Programme integrity outranks user-provided building type per plan §3.2; an unknown building_type was resolved to the community template to keep area validation honest.`,
      }),
    );
  }

  // Optional: surface localStyle weights when local_blend_strength was actively
  // overridden (provides traceability — not a conflict, an info note).
  if (localStyle?.blend_weights && conflicts.length === 0) {
    // intentionally do not add a conflict for the happy path
  }

  return conflicts;
}

export default { detectConflicts, CONSTRAINT_PRIORITY };

function hasSvgPayload(entry) {
  return Boolean(entry?.svg && String(entry.svg).includes("<svg"));
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
    if (svg && !svg.includes('id="north-arrow"')) {
      errors.push(`drawings.plan[${index}] is missing the north-arrow marker.`);
    }
    if (svg && !svg.includes('id="title-block"')) {
      errors.push(`drawings.plan[${index}] is missing the title-block marker.`);
    }
    // Reliability checks added 2026-05-02 to surface common A1 floor-plan
    // regressions (missing scale bar, no room labels, no dimension chains)
    // as warnings rather than letting them slip through silently.
    if (svg && !svg.includes('id="scale-bar"')) {
      warnings.push(
        `drawings.plan[${index}] has no scale-bar marker — A1 plans should include a scale bar.`,
      );
    }
    if (svg && !svg.match(/<text[^>]*class="room-label"|id="room-label"/)) {
      warnings.push(
        `drawings.plan[${index}] has no room-label text elements — rooms may render unlabelled.`,
      );
    }
    if (svg && !svg.includes('class="dimension-chain"')) {
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
    if (svg && !svg.includes('id="ground-line"')) {
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
    if (svg && !svg.includes('id="ground-line"')) {
      warnings.push(
        `drawings.section[${index}] is missing the ground-line marker.`,
      );
    }
    if (svg && !svg.match(/section[- ]?[A-Z]-[A-Z]/i)) {
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

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    checks: {
      requestedTypes: drawingTypes,
      levelCount,
      crossViewChecks: enableCrossViewChecks,
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
};

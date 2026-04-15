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

  return { warnings, errors };
}

export function runDrawingConsistencyChecks({
  projectGeometry,
  drawings = {},
  drawingTypes = ["plan", "elevation", "section"],
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

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    checks: {
      requestedTypes: drawingTypes,
      levelCount,
      counts: {
        plan: (drawings.plan || []).length,
        elevation: (drawings.elevation || []).length,
        section: (drawings.section || []).length,
      },
    },
  };
}

export default {
  runDrawingConsistencyChecks,
};

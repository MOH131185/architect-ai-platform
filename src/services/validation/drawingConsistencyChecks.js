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
    const elevationCheck = validateCollection(
      "drawings.elevation",
      drawings.elevation || [],
      1,
    );
    warnings.push(...elevationCheck.warnings);
    errors.push(...elevationCheck.errors);
  }

  if (drawingTypes.includes("section")) {
    const sectionCheck = validateCollection(
      "drawings.section",
      drawings.section || [],
      1,
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

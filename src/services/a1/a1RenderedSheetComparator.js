function unique(items = []) {
  return [...new Set((items || []).filter(Boolean))];
}

function isTechnicalPanelKey(key = "") {
  const normalized = String(key || "")
    .trim()
    .toLowerCase();
  return (
    normalized.startsWith("floor_plan") ||
    normalized.startsWith("floor-plan") ||
    normalized.startsWith("panel:floor-plan:") ||
    normalized.startsWith("elevation") ||
    normalized.startsWith("panel:elevation:") ||
    normalized.startsWith("section") ||
    normalized.startsWith("panel:section:")
  );
}

function activeTechnicalFamilies(coordinates = {}) {
  const keys = Object.keys(coordinates || {}).map((key) =>
    String(key || "")
      .trim()
      .toLowerCase(),
  );
  return {
    plan: keys.some(
      (key) =>
        key.startsWith("floor_plan") ||
        key.startsWith("floor-plan") ||
        key.startsWith("panel:floor-plan:"),
    ),
    elevation: keys.some(
      (key) =>
        key.startsWith("elevation") || key.startsWith("panel:elevation:"),
    ),
    section: keys.some(
      (key) => key.startsWith("section") || key.startsWith("panel:section:"),
    ),
  };
}

function patternAppliesToActivePanels(pattern, families = {}) {
  const source = String(pattern || "").toUpperCase();
  if (source.includes("PLAN")) {
    return families.plan;
  }
  if (source.includes("ELEVATION")) {
    return families.elevation;
  }
  if (source.includes("SECTION")) {
    return families.section;
  }
  return true;
}

export function compareRenderedSheetAgainstFixture({
  fixture = null,
  renderedTextZone = null,
  technicalPanelRegression = null,
  coordinates = {},
  sheetSvg = "",
} = {}) {
  if (!fixture) {
    return {
      version: "phase10-a1-rendered-sheet-comparator-v1",
      status: "pass",
      blockers: [],
      warnings: [
        "No regression fixture was selected for final-sheet comparison.",
      ],
      fixtureId: null,
      checks: {},
    };
  }
  if (!sheetSvg && !(renderedTextZone?.zones || []).length) {
    return {
      version: "phase10-a1-rendered-sheet-comparator-v1",
      fixtureId: fixture.id,
      status: "warning",
      blockers: [],
      warnings: [
        "No composed sheet evidence was available for regression fixture comparison.",
      ],
      checks: {},
    };
  }

  const blockers = [];
  const warnings = [];
  const textNodeCount = Number(
    renderedTextZone?.textNodeCount ||
      renderedTextZone?.textElementCount ||
      (String(sheetSvg || "").match(/<text\b/g) || []).length ||
      0,
  );
  const panelHeaderPassCount = (renderedTextZone?.zones || []).filter(
    (zone) => zone.type === "panel_header" && zone.status === "pass",
  ).length;
  const titleBlockZone = (renderedTextZone?.zones || []).find(
    (zone) => zone.id === "title-block",
  );
  const technicalPanelCoordinateCount = Object.keys(coordinates || {}).filter(
    (key) => isTechnicalPanelKey(key),
  ).length;
  const technicalPanelCount =
    technicalPanelCoordinateCount ||
    Object.keys(technicalPanelRegression?.perSideElevationStatus || {}).length +
      (technicalPanelRegression?.sectionCandidateQuality || []).length;
  const blockingFragments = (
    technicalPanelRegression?.technicalFragmentScores || []
  ).filter((entry) => entry.verdict === "block").length;

  if (textNodeCount < Number(fixture.minimumTextNodeCount || 0)) {
    blockers.push(
      `Final board text node count ${textNodeCount} is below regression fixture minimum ${fixture.minimumTextNodeCount}.`,
    );
  }
  if (technicalPanelCount < Number(fixture.minimumTechnicalPanels || 0)) {
    blockers.push(
      `Final board exposes only ${technicalPanelCount} technical panel zone(s); fixture minimum is ${fixture.minimumTechnicalPanels}.`,
    );
  }
  if (panelHeaderPassCount < Number(fixture.minimumPanelHeaderPasses || 0)) {
    blockers.push(
      `Only ${panelHeaderPassCount} panel header zone(s) passed rendered verification; fixture minimum is ${fixture.minimumPanelHeaderPasses}.`,
    );
  }
  if (
    fixture.requireTitleBlockEvidence &&
    titleBlockZone &&
    titleBlockZone.status === "block"
  ) {
    blockers.push(
      "Rendered title block zone evidence is below the fixture minimum for a publishable technical board.",
    );
  } else if (fixture.requireTitleBlockEvidence && !titleBlockZone) {
    warnings.push(
      "Rendered title block zone could not be assessed against the selected regression fixture.",
    );
  }
  if (blockingFragments > Number(fixture.maximumBlockingFragments || 0)) {
    blockers.push(
      `Technical fragment blocker count ${blockingFragments} exceeds fixture maximum ${fixture.maximumBlockingFragments}.`,
    );
  }

  const verificationPhase =
    renderedTextZone?.verificationPhase ||
    renderedTextZone?.verificationState?.phase ||
    "pre_compose";
  const requiredLabelPatterns = (fixture.requiredLabelPatterns || []).filter(
    (pattern) =>
      patternAppliesToActivePanels(
        pattern,
        activeTechnicalFamilies(coordinates),
      ),
  );
  const labelPassCount = requiredLabelPatterns.filter(
    (pattern) =>
      (renderedTextZone?.zones || []).some((zone) =>
        (zone.matchedLabels || []).some((label) => pattern.test(label)),
      ) ||
      (verificationPhase !== "post_compose" &&
        pattern.test(String(sheetSvg || ""))),
  ).length;
  if (labelPassCount < requiredLabelPatterns.length) {
    warnings.push(
      `Rendered sheet matched ${labelPassCount}/${requiredLabelPatterns.length} regression label pattern(s).`,
    );
  }

  return {
    version: "phase10-a1-rendered-sheet-comparator-v1",
    fixtureId: fixture.id,
    status: blockers.length ? "block" : warnings.length ? "warning" : "pass",
    blockers: unique(blockers),
    warnings: unique(warnings),
    checks: {
      textNodeCount,
      panelHeaderPassCount,
      technicalPanelCount,
      blockingFragments,
      labelPassCount,
    },
  };
}

export default {
  compareRenderedSheetAgainstFixture,
};

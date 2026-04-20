const REGRESSION_FIXTURES = {
  technical_board_reference_v1: {
    id: "technical_board_reference_v1",
    description:
      "Known-good technical A1 board expectations for deterministic plan/elevation/section compositions.",
    minimumTextNodeCount: 8,
    minimumTechnicalPanels: 3,
    minimumPanelHeaderPasses: 2,
    requireTitleBlockEvidence: true,
    requiredLabelPatterns: [/PLAN/i, /ELEVATION/i, /SECTION/i],
    maximumBlockingFragments: 0,
  },
  weak_board_guard_v1: {
    id: "weak_board_guard_v1",
    description:
      "Lower-bound guard used to ensure obviously weak or blank technical boards are rejected.",
    minimumTextNodeCount: 4,
    minimumTechnicalPanels: 2,
    minimumPanelHeaderPasses: 1,
    requireTitleBlockEvidence: false,
    requiredLabelPatterns: [/ELEVATION/i, /SECTION/i],
    maximumBlockingFragments: 1,
  },
};

export function getA1RegressionFixtureCatalog() {
  return { ...REGRESSION_FIXTURES };
}

export function resolveA1RegressionFixture({
  fixtureId = null,
  drawings = {},
} = {}) {
  if (fixtureId && REGRESSION_FIXTURES[fixtureId]) {
    return REGRESSION_FIXTURES[fixtureId];
  }

  const technicalPanelCount =
    (drawings.plan || []).length +
    (drawings.elevation || []).length +
    (drawings.section || []).length;

  return technicalPanelCount >= 3
    ? REGRESSION_FIXTURES.technical_board_reference_v1
    : REGRESSION_FIXTURES.weak_board_guard_v1;
}

export default {
  getA1RegressionFixtureCatalog,
  resolveA1RegressionFixture,
};

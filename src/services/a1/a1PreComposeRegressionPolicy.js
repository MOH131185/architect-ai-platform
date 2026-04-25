function unique(items = []) {
  return [...new Set((items || []).filter(Boolean))];
}

function normalizeBlocker(blocker = "") {
  return String(blocker || "").trim();
}

export function isDeferredPreComposeRenderedEvidenceBlocker(blocker = "") {
  const text = normalizeBlocker(blocker);
  return (
    /^Rendered text zone .+ lacks enough evidence for reliable final-sheet labelling\./i.test(
      text,
    ) ||
    /^Rendered text zone .+ lacks enough raster evidence for reliable final-sheet labelling\./i.test(
      text,
    ) ||
    /^Final board text node count \d+ is below regression fixture minimum \d+\./i.test(
      text,
    ) ||
    /^Only \d+ panel header zone\(s\) passed rendered verification; fixture minimum is \d+\./i.test(
      text,
    ) ||
    /^Rendered title block zone evidence is below the fixture minimum for a publishable technical board\./i.test(
      text,
    )
  );
}

export function resolvePreComposeRegressionPolicy({
  finalSheetRegression = null,
  enforcePostComposeVerification = false,
} = {}) {
  const allBlockers = unique(finalSheetRegression?.blockers || []).map(
    normalizeBlocker,
  );

  if (!allBlockers.length) {
    return {
      version: "phase23-a1-pre-compose-regression-policy-v1",
      status: "pass",
      shouldBlockBeforeCompose: false,
      canDeferToPostCompose: false,
      hardBlockers: [],
      deferredBlockers: [],
    };
  }

  if (!enforcePostComposeVerification) {
    return {
      version: "phase23-a1-pre-compose-regression-policy-v1",
      status: "block",
      shouldBlockBeforeCompose: true,
      canDeferToPostCompose: false,
      hardBlockers: allBlockers,
      deferredBlockers: [],
    };
  }

  const technicalBlockers = new Set(
    unique(finalSheetRegression?.technicalPanelRegression?.blockers || []).map(
      normalizeBlocker,
    ),
  );
  const textZoneBlockers = new Set(
    unique(finalSheetRegression?.textZoneSanity?.blockers || []).map(
      normalizeBlocker,
    ),
  );
  const fixtureBlockers = new Set(
    unique(finalSheetRegression?.fixtureComparison?.blockers || []).map(
      normalizeBlocker,
    ),
  );

  const hardBlockers = [];
  const deferredBlockers = [];

  for (const blocker of allBlockers) {
    if (technicalBlockers.has(blocker)) {
      hardBlockers.push(blocker);
      continue;
    }

    if (
      (textZoneBlockers.has(blocker) || fixtureBlockers.has(blocker)) &&
      isDeferredPreComposeRenderedEvidenceBlocker(blocker)
    ) {
      deferredBlockers.push(blocker);
      continue;
    }

    hardBlockers.push(blocker);
  }

  return {
    version: "phase23-a1-pre-compose-regression-policy-v1",
    status: hardBlockers.length ? "block" : "deferred_to_post_compose",
    shouldBlockBeforeCompose: hardBlockers.length > 0,
    canDeferToPostCompose:
      hardBlockers.length === 0 && deferredBlockers.length > 0,
    hardBlockers: unique(hardBlockers),
    deferredBlockers: unique(deferredBlockers),
  };
}

export function summarizeRegressionBlockers(blockers = [], limit = 4) {
  const selected = unique(blockers).slice(0, limit);
  if (!selected.length) {
    return "";
  }
  const suffix = blockers.length > selected.length ? " ..." : "";
  return `${selected.join("; ")}${suffix}`;
}

export default {
  isDeferredPreComposeRenderedEvidenceBlocker,
  resolvePreComposeRegressionPolicy,
  summarizeRegressionBlockers,
};

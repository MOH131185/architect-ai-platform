function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

export function runA1TextZoneSanity({
  sheetSvg = "",
  expectedLabels = [],
  fontReadiness = null,
} = {}) {
  const svg = String(sheetSvg || "");
  const blockers = [];
  const warnings = [];
  const labelChecks = unique(expectedLabels).map((label) => ({
    label,
    present: svg ? svg.includes(label) : null,
  }));

  if (svg) {
    if (!svg.includes("@font-face") || !svg.includes("data:font/ttf;base64,")) {
      blockers.push(
        "Final sheet SVG is missing embedded font-face payloads required for reliable raster text rendering.",
      );
    }
    if (!svg.includes("ArchiAISans") && !svg.includes("EmbeddedSans")) {
      warnings.push(
        "Final sheet SVG does not appear to use the embedded-safe font family stack.",
      );
    }
    if ((svg.match(/<text\b/g) || []).length < 4) {
      warnings.push(
        "Final sheet SVG contains very few text nodes; label-zone coverage may be incomplete.",
      );
    }
  } else {
    warnings.push(
      "No final sheet SVG was available for label-zone sanity checks; only pre-compose text readiness could be assessed.",
    );
  }

  if (fontReadiness?.readyForEmbedding === false) {
    blockers.push(
      "Bundled font embedding is not ready, so final-sheet text cannot be trusted in serverless rasterization.",
    );
  } else if (fontReadiness?.fullEmbeddingReady === false) {
    warnings.push(
      "Bold font embedding is degraded; text hierarchy may render flatter than intended.",
    );
  }

  return {
    version: "phase9-a1-text-zone-sanity-v1",
    status: blockers.length ? "block" : warnings.length ? "warning" : "pass",
    blockers: unique(blockers),
    warnings: unique(warnings),
    textElementCount: svg ? (svg.match(/<text\b/g) || []).length : 0,
    labelChecks,
  };
}

export default {
  runA1TextZoneSanity,
};

import { verifyRenderedTextZonesSync } from "./a1RenderedTextVerificationService.js";
import { buildVerificationState } from "./a1VerificationStateModel.js";

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

export function runA1TextZoneSanity({
  sheetSvg = "",
  expectedLabels = [],
  fontReadiness = null,
  coordinates = {},
  panelLabelMap = {},
  width = null,
  height = null,
  renderedTextZone = null,
} = {}) {
  const svg = String(sheetSvg || "");
  const blockers = [];
  const warnings = [];
  const labelChecks = unique(expectedLabels).map((label) => ({
    label,
    present: svg ? svg.includes(label) : null,
  }));
  const renderedZone =
    renderedTextZone ||
    (svg
      ? verifyRenderedTextZonesSync({
          sheetSvg: svg,
          expectedLabels,
          coordinates,
          panelLabelMap,
          width,
          height,
        })
      : {
          version: "phase10-a1-rendered-text-verification-v1",
          verificationPhase: "pre_compose",
          status: "warning",
          blockers: [],
          warnings: [
            "No composed sheet evidence was available for rendered text-zone verification.",
          ],
          confidence: 0,
          zones: [],
          textNodeCount: 0,
          verificationState: buildVerificationState({
            phase: "pre_compose",
            status: "warning",
            warnings: [
              "No composed sheet evidence was available for rendered text-zone verification.",
            ],
            confidence: 0,
            label: "renderedTextZone",
            evidenceSource: "metadata",
          }),
        });

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
  blockers.push(...(renderedZone.blockers || []));
  warnings.push(...(renderedZone.warnings || []));

  return {
    version: renderedZone
      ? "phase10-a1-text-zone-sanity-v1"
      : "phase9-a1-text-zone-sanity-v1",
    verificationPhase: renderedZone?.verificationPhase || "pre_compose",
    status: blockers.length ? "block" : warnings.length ? "warning" : "pass",
    blockers: unique(blockers),
    warnings: unique(warnings),
    textElementCount: svg ? (svg.match(/<text\b/g) || []).length : 0,
    labelChecks,
    renderedTextZoneStatus: renderedZone.status,
    renderedTextZone: renderedZone,
    verificationState: buildVerificationState({
      phase: renderedZone?.verificationPhase || "pre_compose",
      status: blockers.length ? "block" : warnings.length ? "warning" : "pass",
      blockers,
      warnings,
      confidence: renderedZone?.confidence ?? null,
      label: "textZoneSanity",
      evidenceSource:
        renderedZone?.verificationPhase === "post_compose"
          ? "rendered_output"
          : "svg_text",
    }),
  };
}

export default {
  runA1TextZoneSanity,
};

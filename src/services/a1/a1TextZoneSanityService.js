import { verifyRenderedTextZonesSync } from "./a1RenderedTextVerificationService.js";
import { buildVerificationState } from "./a1VerificationStateModel.js";
import { FINAL_SHEET_MIN_FONT_SIZE_PX } from "../../utils/svgFontEmbedder.js";

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function hasStrongRequiredRenderedProof(renderedZone = null) {
  const zones = renderedZone?.zones || [];
  const requiredZones = zones.filter((zone) => zone.required === true);
  if (!requiredZones.length) {
    return false;
  }
  const allRequiredResolved = requiredZones.every(
    (zone) => zone.status === "pass" && zone.evidenceState !== "blocked",
  );
  const verifiedRequiredCount = requiredZones.filter((zone) =>
    ["verified", "weak"].includes(zone.evidenceState),
  ).length;
  return (
    allRequiredResolved &&
    verifiedRequiredCount === requiredZones.length &&
    Number(renderedZone?.confidence || 0) >= 0.48
  );
}

function collectUndersizedTextFonts(sheetSvg = "") {
  const svg = String(sheetSvg || "");
  const matches = [];
  const regex = /<text\b[^>]*\bfont-size=(["'])([^"']+)\1[^>]*>/gi;
  let match = regex.exec(svg);
  while (match) {
    const fontSize = Number(match[2]);
    if (Number.isFinite(fontSize) && fontSize < FINAL_SHEET_MIN_FONT_SIZE_PX) {
      matches.push(fontSize);
    }
    match = regex.exec(svg);
  }
  return matches;
}

function resolveRenderedTextEvidenceQuality(renderedZone = null) {
  if (!renderedZone) {
    return "provisional";
  }
  if (
    renderedZone?.verificationPhase === "post_compose" &&
    (renderedZone?.methodsUsed || []).includes("ocr") &&
    renderedZone?.ocrEvidenceQuality === "verified"
  ) {
    return "verified";
  }
  if (
    renderedZone?.ocr?.available &&
    renderedZone?.ocrEvidenceQuality &&
    renderedZone.ocrEvidenceQuality !== "provisional"
  ) {
    return renderedZone.ocrEvidenceQuality;
  }
  if (
    renderedZone?.verificationPhase === "post_compose" &&
    hasStrongRequiredRenderedProof(renderedZone)
  ) {
    return "verified";
  }
  if (renderedZone?.verificationState?.blocked) {
    return "weak";
  }
  if (
    renderedZone?.verificationState?.verified &&
    renderedZone?.status === "pass"
  ) {
    return "verified";
  }
  if (renderedZone?.status === "pass" || renderedZone?.status === "warning") {
    return "weak";
  }
  return "provisional";
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
  const verificationPhase =
    renderedZone?.verificationPhase === "post_compose"
      ? "post_compose"
      : "pre_compose";
  const isPostComposeEvidence = verificationPhase === "post_compose";

  if (svg) {
    if (!svg.includes("@font-face") || !svg.includes("data:font/ttf;base64,")) {
      const missingFontMessage =
        "Final sheet SVG is missing embedded font-face payloads required for reliable raster text rendering.";
      if (isPostComposeEvidence) {
        blockers.push(missingFontMessage);
      } else {
        warnings.push(
          `${missingFontMessage} Pre-compose checks treat this as provisional until rendered output is verified.`,
        );
      }
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
    const undersizedFonts = collectUndersizedTextFonts(svg);
    if (undersizedFonts.length > 0) {
      const undersizedFontMessage = `Final sheet SVG contains text below the enforced minimum readable size of ${FINAL_SHEET_MIN_FONT_SIZE_PX}px.`;
      if (isPostComposeEvidence) {
        blockers.push(undersizedFontMessage);
      } else {
        warnings.push(
          `${undersizedFontMessage} Pre-compose checks treat this as provisional until rendered output is verified.`,
        );
      }
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
    version:
      renderedZone?.ocr || renderedZone?.ocrEvidenceQuality
        ? "phase12-a1-text-zone-sanity-v1"
        : renderedZone
          ? "phase10-a1-text-zone-sanity-v1"
          : "phase9-a1-text-zone-sanity-v1",
    verificationPhase,
    status: blockers.length ? "block" : warnings.length ? "warning" : "pass",
    blockers: unique(blockers),
    warnings: unique(warnings),
    textElementCount: svg ? (svg.match(/<text\b/g) || []).length : 0,
    labelChecks,
    renderedTextZoneStatus: renderedZone.status,
    renderedTextEvidenceQuality:
      resolveRenderedTextEvidenceQuality(renderedZone),
    renderedTextZone: renderedZone,
    methodsUsed: renderedZone?.methodsUsed || [],
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

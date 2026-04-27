/**
 * Approved Document O — overheating in new residential buildings (England).
 * Plan §6.3 / §6.4. Drives off the climate pack's sun-path data.
 */

import { findSourceByPart } from "../sourceRegistry.js";

const SOURCE = findSourceByPart("O");
const SOURCE_DOC_ID = SOURCE?.document_id || "ad-O-2021";
const SOURCE_URL = SOURCE?.source_url || "";

const RESIDENTIAL_TYPES = new Set([
  "dwelling",
  "multi_residential",
  "mixed_use",
]);

function makeCheck({
  checkId,
  title,
  severity,
  status,
  summary,
  action,
  applies = [],
}) {
  return {
    check_id: checkId,
    title,
    source_document_id: SOURCE_DOC_ID,
    source_url: SOURCE_URL,
    severity,
    status,
    applies_to_element_ids: applies,
    summary,
    recommended_action: action,
  };
}

export function checkPartO({ brief, climate, projectGeometry }) {
  const buildingType = brief?.building_type || "";
  if (!RESIDENTIAL_TYPES.has(buildingType)) {
    return [
      makeCheck({
        checkId: "ad-O-applicability",
        title: "Approved Document O — applicability",
        severity: "info",
        status: "not_applicable",
        summary: `AD O applies to new residential buildings; building_type "${buildingType}" is non-residential.`,
        action: "No AD O action required for non-residential buildings.",
      }),
    ];
  }

  const results = [];

  // O.1 — overall overheating-risk routing
  const riskLevel = climate?.overheating?.risk_level || "unknown";
  const riskSeverityMap = {
    low: { severity: "info", status: "pass" },
    medium: { severity: "warning", status: "needs_consultant" },
    high: { severity: "hard_blocker", status: "fail" },
    unknown: { severity: "warning", status: "manual_review" },
  };
  const riskRouting = riskSeverityMap[riskLevel] || riskSeverityMap.unknown;
  results.push(
    makeCheck({
      checkId: "ad-O-overheating-risk",
      title: "Approved Document O — overheating risk",
      severity: riskRouting.severity,
      status: riskRouting.status,
      summary: `Climate pack reports overheating risk: ${riskLevel}.`,
      action:
        riskRouting.status === "pass"
          ? "Continue passive design strategy; confirm at Stage 3."
          : riskLevel === "high"
            ? "Reduce uncontrolled south/west glazing and add external shading before progressing."
            : "Run the AD O simplified method or CIBSE TM59 dynamic assessment to substantiate the risk rating.",
    }),
  );

  // O.2 — TM59 recommendation
  const tm59 = climate?.overheating?.tm59_recommended === true;
  results.push(
    makeCheck({
      checkId: "ad-O-tm59",
      title: "CIBSE TM59 dynamic-overheating assessment",
      severity: tm59 ? "warning" : "info",
      status: tm59 ? "needs_consultant" : "not_applicable",
      summary: tm59
        ? "TM59 dynamic assessment is recommended for this dwelling/care home/student residence type."
        : "TM59 dynamic assessment is not required by the simplified method for this typology.",
      action: tm59
        ? "Engage an environmental consultant to run TM59 alongside the AD O method before Stage 3 sign-off."
        : "No TM59 action required; AD O simplified method may be used.",
    }),
  );

  // O.3 — west-facing window count (proxy for unshaded west glazing)
  const windows = Array.isArray(projectGeometry?.windows)
    ? projectGeometry.windows
    : [];
  const walls = Array.isArray(projectGeometry?.walls)
    ? projectGeometry.walls
    : [];
  const wallById = new Map(walls.map((wall) => [wall.id, wall]));
  const westWindows = windows.filter((win) => {
    const wall = wallById.get(win?.wall_id);
    return wall?.exterior === true && wall?.orientation === "west";
  });
  const westThreshold = 2;
  results.push(
    makeCheck({
      checkId: "ad-O-west-glazing",
      title: "Approved Document O — west-facing glazing",
      severity:
        westWindows.length > westThreshold
          ? "warning"
          : westWindows.length > 0
            ? "info"
            : "info",
      status: westWindows.length > westThreshold ? "needs_consultant" : "pass",
      summary:
        westWindows.length > westThreshold
          ? `${westWindows.length} window(s) on west-facing walls; AD O flags west glazing as the dominant overheating driver in UK summer.`
          : `${westWindows.length} window(s) on west-facing walls — within the early-stage tolerance.`,
      action:
        westWindows.length > westThreshold
          ? "Reduce, shade, or reorient the west-facing openings and re-run AD O simplified method."
          : "No action — west-glazing exposure is within the early-stage tolerance.",
      applies: westWindows.map((w) => w.id),
    }),
  );

  // O.4 — sun-path peak altitude (driven by computeSunPath)
  const summerPeak =
    climate?.sun_path?.summer_solstice?.peak?.altitudeDeg ?? null;
  if (summerPeak !== null) {
    const altRouting =
      summerPeak > 60
        ? { severity: "warning", status: "needs_consultant" }
        : summerPeak > 50
          ? { severity: "info", status: "needs_consultant" }
          : { severity: "info", status: "pass" };
    results.push(
      makeCheck({
        checkId: "ad-O-summer-altitude",
        title: "Approved Document O — summer-solstice peak altitude",
        severity: altRouting.severity,
        status: altRouting.status,
        summary: `Deterministic sun-path peak altitude on summer solstice: ${summerPeak}°.`,
        action:
          summerPeak > 60
            ? "High overhead sun increases risk of unshaded south/west glazing; specify external shading geometry."
            : "Peak altitude is moderate — overhead shading cost-effective, side shading still recommended.",
      }),
    );
  }

  return results;
}

export default { checkPartO };

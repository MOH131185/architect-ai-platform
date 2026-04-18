import { LAYOUT_REPAIR_STRATEGIES } from "./layoutRepairStrategies.js";
import { planIrregularEnvelopeFallback } from "../site/irregularEnvelopeFallbackPlanner.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";

const STRATEGY_ORDER = LAYOUT_REPAIR_STRATEGIES.map((strategy) => strategy.id);

function collectValidationText(validationReport = {}) {
  return [
    ...(validationReport.errors || []),
    ...(validationReport.warnings || []),
    ...(validationReport.repairSuggestions || []),
  ]
    .join(" ")
    .toLowerCase();
}

function collectSignals(projectGeometry = {}, validationReport = {}) {
  const text = collectValidationText(validationReport);
  const stairs = (projectGeometry.stairs || []).length;
  const wetZones = (projectGeometry.rooms || []).filter(
    (room) => room.wet_zone,
  ).length;
  return {
    adjacency: text.includes("adjacency"),
    circulation:
      text.includes("circulation") ||
      text.includes("corridor") ||
      text.includes("access"),
    envelope:
      text.includes("envelope") ||
      text.includes("outside") ||
      text.includes("overlap") ||
      text.includes("fit"),
    proportions:
      text.includes("area tolerance") ||
      text.includes("proportion") ||
      text.includes("deviation"),
    core: text.includes("stair") || text.includes("core") || stairs > 0,
    stacking: text.includes("wet") || text.includes("stack") || wetZones > 1,
  };
}

export function resolveLayoutSearchStrategyPlan(
  projectGeometry = {},
  validationReport = {},
  options = {},
) {
  const signals = collectSignals(projectGeometry, validationReport);
  const ordered = [];
  const append = (strategyId) => {
    if (!STRATEGY_ORDER.includes(strategyId) || ordered.includes(strategyId)) {
      return;
    }
    ordered.push(strategyId);
  };

  if (signals.adjacency) append("repair:adjacency-cluster");
  if (signals.circulation) append("repair:circulation-spine");
  if (signals.envelope || signals.proportions) append("repair:band-repack");
  if (signals.core) append("repair:core-access-normalize");
  if (signals.stacking) append("repair:wet-stack-align");
  STRATEGY_ORDER.forEach(append);

  const fallback = planIrregularEnvelopeFallback(
    projectGeometry.site || {},
    projectGeometry.site?.buildable_bbox ||
      projectGeometry.site?.buildable_polygon
      ? projectGeometry.site
      : null,
  );
  const passes = [
    {
      id: "repair-pass:baseline",
      strategyPath: [],
      rationale: [
        "Preserve the baseline state as the deterministic no-op candidate.",
      ],
    },
    ...ordered
      .slice(0, Math.max(3, Number(options.maxPrimaryStrategies || 4)))
      .map((strategyId, index) => ({
        id: `repair-pass:${index + 1}:${strategyId}`,
        strategyPath: [strategyId],
        rationale: [`Primary repair pass prioritizes ${strategyId}.`],
      })),
  ];

  const compoundPasses = [];
  for (let index = 0; index < Math.min(ordered.length - 1, 4); index += 1) {
    compoundPasses.push({
      id: `repair-pass:compound:${index + 1}`,
      strategyPath: [ordered[index], ordered[index + 1]],
      rationale: [
        `Compound pass applies ${ordered[index]} before ${ordered[index + 1]}.`,
      ],
    });
  }
  const tertiaryPasses = isFeatureEnabled("usePhase6RepairSearch")
    ? ordered
        .slice(0, Math.max(0, ordered.length - 2))
        .map((strategyId, index) => ({
          id: `repair-pass:tertiary:${index + 1}`,
          strategyPath: [
            ordered[index],
            ordered[index + 1],
            ordered[index + 2],
          ].filter(Boolean),
          rationale: [
            `Tertiary pass chains ${[
              ordered[index],
              ordered[index + 1],
              ordered[index + 2],
            ]
              .filter(Boolean)
              .join(" -> ")} for deterministic multi-step repair.`,
          ],
        }))
    : [];

  return {
    version: isFeatureEnabled("usePhase6RepairSearch")
      ? "phase7-layout-search-strategy-v1"
      : "phase6-layout-search-strategy-v1",
    signals,
    orderedStrategies: ordered,
    fallback,
    passes: [...passes, ...compoundPasses, ...tertiaryPasses],
  };
}

export default {
  resolveLayoutSearchStrategyPlan,
};

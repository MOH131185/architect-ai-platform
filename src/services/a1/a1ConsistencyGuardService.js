import { isFeatureEnabled } from "../../config/featureFlags.js";
import { runHeroIdentityChecks } from "./a1PanelIdentityChecks.js";

export function evaluateA1ConsistencyGuards({
  projectGeometry = {},
  visualPackage = null,
  facadeGrammar = null,
} = {}) {
  if (!isFeatureEnabled("useA1ConsistencyGuards")) {
    return {
      version: "phase8-a1-consistency-guards-v1",
      enabled: false,
      consistencyReady: true,
      warnings: [],
      blockingReasons: [],
      checks: [],
    };
  }

  if (!visualPackage) {
    return {
      version: "phase8-a1-consistency-guards-v1",
      enabled: true,
      consistencyReady: true,
      warnings: [],
      blockingReasons: [],
      checks: [],
    };
  }

  const heroIdentityCheck = runHeroIdentityChecks({
    visualPackage,
    projectGeometry,
    facadeGrammar,
  });

  return {
    version: "phase8-a1-consistency-guards-v1",
    enabled: true,
    consistencyReady: heroIdentityCheck.blockers.length === 0,
    warnings: heroIdentityCheck.warnings,
    blockingReasons: heroIdentityCheck.blockers,
    checks: [heroIdentityCheck],
    heroVsCanonicalWarnings: heroIdentityCheck.warnings,
  };
}

export default {
  evaluateA1ConsistencyGuards,
};

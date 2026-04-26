/**
 * Keep legacy Hybrid A1 flags aligned with the active pipeline mode.
 *
 * ProjectGraph is now the production default, so this component must not force
 * the old multi-panel workflow when the ProjectGraph vertical slice is active.
 */

import { useEffect } from "react";
import {
  setFeatureFlag,
  isFeatureEnabled,
  FEATURE_FLAGS,
} from "../config/featureFlags.js";
import { getCurrentPipelineMode, PIPELINE_MODE } from "../config/pipelineMode.js";
import logger from "../utils/logger.js";

export default function ForceHybridMode() {
  useEffect(() => {
    logger.info("ForceHybridMode component mounted");

    try {
      sessionStorage.removeItem("featureFlags");
      logger.info("Cleared sessionStorage feature flags");
    } catch (error) {
      logger.warn("Unable to clear sessionStorage feature flags", { error });
    }

    const pipelineMode = getCurrentPipelineMode();

    if (pipelineMode === PIPELINE_MODE.PROJECT_GRAPH) {
      FEATURE_FLAGS.hybridA1Mode = false;
      setFeatureFlag("hybridA1Mode", false);

      logger.info(
        "ProjectGraph pipeline active; legacy Hybrid A1 forcing is disabled.",
      );
      logger.info("Next generation will use the ProjectGraph vertical slice.");
      return;
    }

    FEATURE_FLAGS.hybridA1Mode = true;
    setFeatureFlag("hybridA1Mode", true);

    const isEnabled = isFeatureEnabled("hybridA1Mode");
    const directValue = FEATURE_FLAGS.hybridA1Mode;

    logger.info("Hybrid A1 Mode verification:");
    logger.info("   isFeatureEnabled:", isEnabled);
    logger.info("   FEATURE_FLAGS.hybridA1Mode:", directValue);

    if (!isEnabled || !directValue) {
      logger.error("CRITICAL: Failed to enable Hybrid A1 Mode.");
      logger.error(
        "This will result in single-view generation instead of multi-panel A1 sheet.",
      );
    } else {
      logger.success("Hybrid A1 Mode is enabled for legacy multi-panel mode.");
      logger.info("Next generation will use panel-based workflow.");
    }
  }, []);

  return null;
}

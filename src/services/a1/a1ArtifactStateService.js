import { buildArtifactState } from "../editing/artifactInvalidationService.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";
import { buildLegacyArtifactStateFromStore } from "../project/artifactFreshnessService.js";

export function buildA1ArtifactState(input = {}) {
  if (
    isFeatureEnabled("useArtifactLifecycleStore") &&
    input.projectGeometry?.metadata?.project_artifact_store
  ) {
    return buildLegacyArtifactStateFromStore(
      input.projectGeometry.metadata.project_artifact_store,
      input.projectGeometry?.metadata?.a1_readiness || null,
    );
  }
  return buildArtifactState(input);
}

export default {
  buildA1ArtifactState,
};

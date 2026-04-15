import { invalidateArtifactStoreFragments } from "../editing/fragmentInvalidationService.js";

export function invalidateA1ComposeState({
  artifactStore = {},
  invalidationPlan = {},
  geometrySignature = null,
} = {}) {
  return invalidateArtifactStoreFragments(
    artifactStore,
    invalidationPlan,
    geometrySignature,
  );
}

export default {
  invalidateA1ComposeState,
};

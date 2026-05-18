/**
 * Replicate FLUX render provider — CL-1 STUB.
 *
 * Returns `available: false` unconditionally. The real adapter lands in CL-4
 * behind `PROJECT_GRAPH_CONTROLNET_RENDER_ENABLED=true`. Until then,
 * selecting this provider via `PROJECT_GRAPH_RENDER_PROVIDER=replicate`
 * falls through to the deterministic-fallback path and records the
 * structured source gap `PROVIDER_NOT_IMPLEMENTED` on the result.
 *
 * @module services/render/providers/replicateFluxRenderProvider
 */

export const REPLICATE_PROVIDER_VERSION =
  "replicate-flux-render-provider-stub-v1";

export function getConfig(env = process.env) {
  return {
    provider: "replicate",
    configured: false,
    enabled: false,
    note: "Replicate FLUX provider stub — real adapter ships in CL-4 of the ControlNet/Redux render-stack plan.",
    flagControlNetRenderEnabled: Boolean(
      env?.PROJECT_GRAPH_CONTROLNET_RENDER_ENABLED,
    ),
    tokenPresent: Boolean(env?.REPLICATE_API_TOKEN),
  };
}

export function validateAvailable(/* env */) {
  return {
    available: false,
    fallbackReason: "PROVIDER_NOT_IMPLEMENTED",
    sourceGaps: ["PROVIDER_NOT_IMPLEMENTED"],
  };
}

export async function render() {
  const error = new Error(
    "Replicate FLUX provider is a CL-1 stub; real adapter lands in CL-4.",
  );
  error.fallbackReason = "PROVIDER_NOT_IMPLEMENTED";
  error.code = "REPLICATE_PROVIDER_NOT_IMPLEMENTED";
  throw error;
}

const replicateFluxRenderProvider = Object.freeze({
  name: "replicate",
  version: REPLICATE_PROVIDER_VERSION,
  getConfig,
  validateAvailable,
  render,
});

export default replicateFluxRenderProvider;

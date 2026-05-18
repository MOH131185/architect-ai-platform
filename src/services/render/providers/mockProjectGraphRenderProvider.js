/**
 * Mock ProjectGraph render provider — CL-1.
 *
 * The mock provider is deliberately **unavailable for rendering**. Selecting
 * it via `PROJECT_GRAPH_RENDER_PROVIDER=mock` flows through the renderer's
 * existing deterministic-fallback path, so:
 *
 *   - `pngBuffer` is null (no synthetic photoreal output, ever).
 *   - The downstream vertical slice keeps the compiled control SVG as the
 *     panel asset (`asset_type: compiled_3d_control_svg`).
 *   - Artifact metadata stamps `providerUsed: deterministic`,
 *     `imageProviderUsed: deterministic`, `imageRenderFallback: true`,
 *     `imageRenderFallbackReason: mock_provider`.
 *
 * Tightened in response to a CL-1 audit blocker: an earlier version returned
 * a rasterised PNG and provenance, which the slice service's
 * `renderProvenance ? "openai" : "deterministic"` stamping rule
 * (`projectGraphVerticalSliceService.js:9757-9760, :9804`) treated as a
 * successful OpenAI photoreal render. That leaked mock output through as
 * `providerUsed=openai` / `imageProviderUsed=openai` /
 * `asset_type=geometry_locked_presentation_svg`. Forbidden.
 *
 * @module services/render/providers/mockProjectGraphRenderProvider
 */

export const MOCK_PROVIDER_VERSION = "mock-projectgraph-render-provider-v2";

export const MOCK_PROVIDER_FALLBACK_REASON = "mock_provider";
export const MOCK_PROVIDER_SOURCE_GAP = "MOCK_PROVIDER_NO_RENDER";

export function getConfig(/* env */) {
  return {
    provider: "mock",
    configured: true,
    rendersImages: false,
    description:
      "Mock provider — never renders a photoreal image; the renderer falls through to deterministic-fallback metadata so the compiled control SVG remains the panel asset.",
  };
}

/**
 * Always returns `available: false` with the structured fallback metadata
 * the renderer's `handleFallback` consumes. This is the single source of
 * truth for the mock behaviour — `render` below is defensive and never
 * reached in production code paths.
 */
export function validateAvailable(/* env */) {
  return {
    available: false,
    fallbackReason: MOCK_PROVIDER_FALLBACK_REASON,
    sourceGaps: [MOCK_PROVIDER_SOURCE_GAP],
  };
}

/**
 * Defensive guard: if a future refactor accidentally bypasses
 * `validateAvailable` and invokes `render`, throw a structured error rather
 * than silently producing a buffer. The thrown error carries
 * `fallbackReason: "mock_provider"` so the renderer's outer catch maps it
 * to the correct deterministic-fallback path.
 */
export async function render() {
  const error = new Error(
    "mockProjectGraphRenderProvider.render must not be invoked — validateAvailable returns unavailable so the renderer falls through to deterministic fallback. Calling render() directly indicates a regression in the provider abstraction.",
  );
  error.fallbackReason = MOCK_PROVIDER_FALLBACK_REASON;
  error.code = "MOCK_PROVIDER_RENDER_INVOKED";
  throw error;
}

const mockProjectGraphRenderProvider = Object.freeze({
  name: "mock",
  version: MOCK_PROVIDER_VERSION,
  getConfig,
  validateAvailable,
  render,
});

export default mockProjectGraphRenderProvider;

/**
 * CL-1 (audit fix): unit tests for the mock ProjectGraph render provider.
 *
 * The mock provider is unavailable for rendering by design — selecting it
 * flows through the renderer's deterministic-fallback path so no PNG buffer
 * or provenance is ever produced. These tests pin that contract so a future
 * refactor cannot re-introduce the "mock returns a synthetic PNG" regression
 * that the CL-1 audit blocked.
 */

import mockProvider, {
  getConfig,
  validateAvailable,
  render,
  MOCK_PROVIDER_VERSION,
  MOCK_PROVIDER_FALLBACK_REASON,
  MOCK_PROVIDER_SOURCE_GAP,
} from "../../../../services/render/providers/mockProjectGraphRenderProvider.js";

describe("mockProjectGraphRenderProvider", () => {
  test("exports a frozen provider object with name=mock", () => {
    expect(mockProvider.name).toBe("mock");
    expect(mockProvider.version).toBe(MOCK_PROVIDER_VERSION);
    expect(Object.isFrozen(mockProvider)).toBe(true);
  });

  test("getConfig advertises rendersImages=false", () => {
    const config = getConfig();
    expect(config).toMatchObject({
      provider: "mock",
      configured: true,
      rendersImages: false,
    });
  });

  test("validateAvailable returns available=false with mock_provider fallback", () => {
    expect(validateAvailable()).toEqual({
      available: false,
      fallbackReason: MOCK_PROVIDER_FALLBACK_REASON,
      sourceGaps: [MOCK_PROVIDER_SOURCE_GAP],
    });
  });

  test("MOCK_PROVIDER_FALLBACK_REASON is the literal 'mock_provider'", () => {
    // Pin the literal so the slice service's
    // `imageRenderFallbackReason === "mock_provider"` contract holds.
    expect(MOCK_PROVIDER_FALLBACK_REASON).toBe("mock_provider");
  });

  test("render is a defensive throw — it must never be called in production", async () => {
    // If a future refactor accidentally bypasses validateAvailable, render
    // throws rather than silently producing a buffer.
    await expect(render()).rejects.toMatchObject({
      code: "MOCK_PROVIDER_RENDER_INVOKED",
      fallbackReason: "mock_provider",
    });
  });

  test("render never returns a buffer (no synthetic PNG path exists)", async () => {
    // Defensive: capture the contract verbally.
    await expect(
      render({ panelType: "hero_3d", referencePng: Buffer.from("x") }),
    ).rejects.toBeInstanceOf(Error);
  });
});

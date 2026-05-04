import { FEATURE_FLAGS } from "../../config/featureFlags.js";

// PR-D Phase 13: spec-named alias flags MUST stay in sync with their
// existing implementations via FEATURE_FLAG_GROUPS so callers can toggle
// either name without drift.
//
// Two of the spec names (strictFingerprintGate, vectorPanelGeneration)
// already exist in this codebase as DIFFERENT features with different
// semantics — they are intentionally NOT aliased and live as their original
// flags. The smoke + this test only validate the safe aliases.

describe("PR-D feature flag aliases (only the safe ones)", () => {
  test("geometryAuthorityMandatory is a true alias of strictGeometryMaskGate", () => {
    expect(FEATURE_FLAGS.geometryAuthorityMandatory).toBe(
      FEATURE_FLAGS.strictGeometryMaskGate,
    );
  });

  test("requireCanonicalPack is a true alias of strictCompiledProjectExports", () => {
    expect(FEATURE_FLAGS.requireCanonicalPack).toBe(
      FEATURE_FLAGS.strictCompiledProjectExports,
    );
  });

  test("threeTierPanelConsistency defaults to true", () => {
    expect(FEATURE_FLAGS.threeTierPanelConsistency).toBe(true);
  });

  test("ALLOW_DEMO_TECHNICAL_FALLBACK defaults to false", () => {
    // Final A1 must NEVER ship with the diffusion fallback enabled.
    expect(FEATURE_FLAGS.ALLOW_DEMO_TECHNICAL_FALLBACK).toBe(false);
  });

  test("strictFingerprintGate is NOT an alias (separate feature in this codebase)", () => {
    // The spec-named flag would mirror strictPreflightGate, but a flag with
    // the same name already exists for a different fingerprint-validation
    // gate. Both names retain their independent semantics; the aliasing
    // intentionally does not happen.
    expect(typeof FEATURE_FLAGS.strictFingerprintGate).toBe("boolean");
    expect(typeof FEATURE_FLAGS.strictPreflightGate).toBe("boolean");
  });

  test("vectorPanelGeneration is NOT an alias (separate feature in this codebase)", () => {
    expect(typeof FEATURE_FLAGS.vectorPanelGeneration).toBe("boolean");
    expect(typeof FEATURE_FLAGS.multiPanelA1).toBe("boolean");
  });
});

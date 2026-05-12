// PR1 of the A1 defect remediation plan. Asserts:
//   1. Address normalisation (Title Case + postcode uppercase + override).
//   2. Site/Context panel SVG no longer leaks Confidence / Boundary source /
//      "Estimated Boundary" text onto the user-facing sheet.
//   3. Key Notes panel SVG no longer leaks StyleBlendManifest or Blend weights.
//   4. IMAGE2 EDIT provenance badge is gated behind A1_SHOW_PROVENANCE_BADGES
//      env. DETERMINISTIC FALLBACK is always shown so render failures stay
//      visible.

import {
  buildKeyNotesPanelArtifact,
  __projectGraphVerticalSliceInternals,
} from "../../services/project/projectGraphVerticalSliceService.js";

const {
  resolveBriefAddress,
  formatAddressForProjectTitle,
  normalizeAddressCasing,
  buildSiteContextPanelArtifact,
  buildVisualPanelStatusBadge,
} = __projectGraphVerticalSliceInternals;

describe("PR1 — address normalisation", () => {
  test("resolveBriefAddress applies Title Case and uppercases the postcode", () => {
    const brief = { site_input: { address: "17 kensigton rd, dn15 8bq" } };
    expect(resolveBriefAddress(brief)).toBe("17 Kensigton Rd, DN15 8BQ");
  });

  test("resolveBriefAddress honours brief.address_override exactly (spelling fix path)", () => {
    const brief = {
      site_input: { address: "17 kensigton rd, dn15 8bq" },
      address_override: "17 Kensington Road, DN15 8BQ",
    };
    expect(resolveBriefAddress(brief)).toBe("17 Kensington Road, DN15 8BQ");
  });

  test("normalizeAddressCasing preserves hyphenated place names", () => {
    expect(
      normalizeAddressCasing("12 high street, stoke-on-trent, ST1 1AA"),
    ).toBe("12 High Street, Stoke-on-Trent, ST1 1AA");
  });

  test("normalizeAddressCasing handles addresses with no postcode", () => {
    expect(normalizeAddressCasing("the old vicarage, mill lane")).toBe(
      "The Old Vicarage, Mill Lane",
    );
  });

  test("normalizeAddressCasing collapses to empty for null/empty input", () => {
    expect(normalizeAddressCasing(null)).toBe("");
    expect(normalizeAddressCasing("")).toBe("");
    expect(normalizeAddressCasing("   ")).toBe("");
  });

  test("formatAddressForProjectTitle strips postcode but keeps Title Case", () => {
    expect(formatAddressForProjectTitle("17 kensigton rd, dn15 8bq")).toBe(
      "17 Kensigton Rd",
    );
  });
});

describe("PR1 — Site/Context panel no longer leaks pipeline uncertainty", () => {
  const fixtureSite = {
    area_m2: 537,
    local_boundary_polygon: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 26 },
      { x: 0, y: 26 },
    ],
    buildable_polygon: [
      { x: 2, y: 4 },
      { x: 18, y: 4 },
      { x: 18, y: 22 },
      { x: 2, y: 22 },
    ],
    boundary_estimated: true,
    boundary_source: "intelligent_fallback",
    boundary_confidence: 0.4,
    main_entry: { orientation: "northwest", source: "fallback" },
  };

  const artifact = buildSiteContextPanelArtifact({
    projectGraphId: "test-pg",
    site: fixtureSite,
    geometryHash: "abc123def456",
  });

  test("areaLabel keeps Site area + Main entry only", () => {
    expect(artifact.svgString).toMatch(
      /Site area: 537 m² \| Main entry: northwest/,
    );
  });

  test("areaLabel does not leak Confidence", () => {
    expect(artifact.svgString).not.toMatch(/Confidence:/);
  });

  test("areaLabel does not leak Boundary source", () => {
    expect(artifact.svgString).not.toMatch(/Boundary source:/);
  });

  test("areaLabel does not leak (inferred) or (fallback) parenthetical", () => {
    expect(artifact.svgString).not.toMatch(/\(inferred\)/);
    expect(artifact.svgString).not.toMatch(/\(fallback\)/);
  });

  test("'Estimated Boundary' literal is replaced with 'Site Boundary'", () => {
    expect(artifact.svgString).not.toMatch(/Estimated Boundary/);
    expect(artifact.svgString).toMatch(/Site Boundary/);
  });

  test("boundary confidence + source remain on root <svg> data attributes for QA", () => {
    expect(artifact.svgString).toMatch(/data-boundary-confidence="0\.4"/);
    expect(artifact.svgString).toMatch(
      /data-boundary-source="intelligent_fallback"/,
    );
  });
});

describe("PR1 — Key Notes panel no longer leaks StyleBlendManifest", () => {
  const baseArgs = {
    projectGraphId: "test-pg",
    brief: { project_name: "PR1 Test" },
    site: { area_m2: 320 },
    climate: null,
    regulations: null,
    localStyle: {
      styleBlendManifestHash: "fb73ac5054b92a57aaaaaaaaaaaa",
      style_blend_weights: {
        local: 0.58,
        user: 0.24,
        climate: 0.19,
        portfolio: 0,
      },
      style_blend_resolved_palette: [],
    },
    geometryHash: "abc123",
    sheetDesignContext: {
      styleBlendManifest: {
        manifestHash: "fb73ac5054b92a57aaaaaaaaaaaa",
        blendWeights: { local: 0.58, user: 0.24, climate: 0.19, portfolio: 0 },
        resolvedPalette: [],
        rejectedInfluences: [],
      },
    },
  };

  const artifact = buildKeyNotesPanelArtifact(baseArgs);

  test("Key Notes SVG contains no StyleBlendManifest substring", () => {
    expect(artifact.svgString).not.toMatch(/StyleBlendManifest/);
  });

  test("Key Notes SVG contains no 'Blend weights' substring", () => {
    expect(artifact.svgString).not.toMatch(/Blend weights/);
  });

  test("Key Notes SVG still emits the rest of the design rationale headings", () => {
    expect(artifact.svgString).toMatch(/External walls/);
    expect(artifact.svgString).toMatch(/Roof/);
    expect(artifact.svgString).toMatch(/Heating \/ Ventilation/);
  });
});

describe("PR1 — IMAGE2 EDIT badge gating", () => {
  const successArtifact = {
    panel_type: "exterior_render",
    metadata: { imageRenderFallback: false, imageProviderUsed: "openai" },
  };
  const fallbackArtifact = {
    panel_type: "exterior_render",
    metadata: {
      imageRenderFallback: true,
      imageRenderFallbackReason: "geometry_drift",
    },
  };

  let originalEnv;
  beforeEach(() => {
    originalEnv = process.env.A1_SHOW_PROVENANCE_BADGES;
  });
  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.A1_SHOW_PROVENANCE_BADGES;
    } else {
      process.env.A1_SHOW_PROVENANCE_BADGES = originalEnv;
    }
  });

  test("production default (env unset): success-path badge is hidden", () => {
    delete process.env.A1_SHOW_PROVENANCE_BADGES;
    expect(buildVisualPanelStatusBadge(successArtifact)).toBeNull();
  });

  test("dev/QA opt-in (env=true): success-path badge renders IMAGE2 EDIT", () => {
    process.env.A1_SHOW_PROVENANCE_BADGES = "true";
    const badge = buildVisualPanelStatusBadge(successArtifact);
    expect(badge).not.toBeNull();
    expect(badge.label).toBe("IMAGE2 EDIT");
    expect(badge.fallback).toBe(false);
  });

  test("fallback badge ('DETERMINISTIC FALLBACK') is shown in production regardless of env", () => {
    delete process.env.A1_SHOW_PROVENANCE_BADGES;
    const badge = buildVisualPanelStatusBadge(fallbackArtifact);
    expect(badge).not.toBeNull();
    expect(badge.label).toBe("DETERMINISTIC FALLBACK");
    expect(badge.fallback).toBe(true);
    expect(badge.fallbackReason).toBe("geometry_drift");
  });
});

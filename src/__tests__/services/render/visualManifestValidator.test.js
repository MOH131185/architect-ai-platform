/**
 * Phase 5B — visualManifestValidator focused tests.
 *
 * Locks the validator's behaviour for the four required scenarios in the
 * Phase 5B brief:
 *   1. matching panel metadata → status "pass"
 *   2. mismatched visualManifestHash → status "warning"
 *   3. mismatched sheetDesignContextHash → status "warning"
 *   4. missing/blank panel image → status "warning" (or "fail" for missing)
 *   5. deterministic fallback path passes
 *   6. output attaches to artifacts metadata (covered by separate
 *      projectGraphVerticalSliceService integration test)
 *   7. exportGate stays allowed in non-strict mode (covered by
 *      projectGraphVerticalSliceService integration test)
 */

import {
  evaluateVisualIdentity,
  validateVisualPanelArtifact,
  REQUIRED_VISUAL_PANEL_TYPES,
  VISUAL_MANIFEST_VALIDATOR_VERSION,
} from "../../../services/render/visualManifestValidator.js";

const MANIFEST_HASH = "manifest-hash-abc";
const MANIFEST_ID = "visual-manifest-pg001";
const CONTEXT_HASH = "context-hash-xyz";

const MOCK_MANIFEST = Object.freeze({
  manifestHash: MANIFEST_HASH,
  manifestId: MANIFEST_ID,
});

const MOCK_SHEET_DESIGN_CONTEXT = Object.freeze({
  contextHash: CONTEXT_HASH,
});

function makeDeterministicPanel(panelType, overrides = {}) {
  return {
    asset_id: `asset-${panelType}`,
    asset_type: "compiled_3d_control_svg",
    panel_type: panelType,
    panelType,
    width: 1500,
    height: 1050,
    svgString:
      `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="1050"><path d="M10 10 L1490 10 L1490 1040 L10 1040 Z" fill="#cccccc"/><polygon points="100,100 200,100 200,200 100,200"/><rect x="500" y="500" width="100" height="100"/><circle cx="800" cy="500" r="40"/></svg>`.padEnd(
        400,
        " ",
      ),
    metadata: {
      visualManifestId: MANIFEST_ID,
      visualManifestHash: MANIFEST_HASH,
      visualIdentityLocked: true,
      visualRenderMode: "deterministic_fallback",
      visualFidelityStatus: "degraded_control_render",
      imageRenderFallback: true,
      imageRenderFallbackReason: "gate_disabled",
      imageRenderByteLength: null,
      ...((overrides && overrides.metadata) || {}),
    },
    ...overrides,
  };
}

function makePhotorealPanel(panelType, overrides = {}) {
  return {
    ...makeDeterministicPanel(panelType, overrides),
    asset_type: "geometry_locked_presentation_svg",
    metadata: {
      visualManifestId: MANIFEST_ID,
      visualManifestHash: MANIFEST_HASH,
      visualIdentityLocked: true,
      visualRenderMode: "photoreal_image_gen",
      visualFidelityStatus: "photoreal_geometry_locked",
      imageRenderFallback: false,
      imageRenderByteLength: 256_000,
      imageProviderUsed: "openai",
      ...((overrides && overrides.metadata) || {}),
    },
  };
}

function makeFourDeterministicPanels(overrides = {}) {
  return {
    hero_3d: makeDeterministicPanel("hero_3d", overrides.hero_3d),
    exterior_render: makeDeterministicPanel(
      "exterior_render",
      overrides.exterior_render,
    ),
    axonometric: makeDeterministicPanel("axonometric", overrides.axonometric),
    interior_3d: makeDeterministicPanel("interior_3d", overrides.interior_3d),
  };
}

describe("visualManifestValidator — Phase 5B", () => {
  test("reports the validator version and required panel types", () => {
    expect(VISUAL_MANIFEST_VALIDATOR_VERSION).toBe(
      "visual-manifest-validator-v1",
    );
    expect(REQUIRED_VISUAL_PANEL_TYPES).toEqual([
      "hero_3d",
      "exterior_render",
      "axonometric",
      "interior_3d",
    ]);
  });

  test("matching panel metadata → status pass", () => {
    const panels = makeFourDeterministicPanels();
    const report = evaluateVisualIdentity({
      visualManifest: MOCK_MANIFEST,
      sheetDesignContext: MOCK_SHEET_DESIGN_CONTEXT,
      panelArtifacts: panels,
      sheetMetadata: { sheetDesignContextHash: CONTEXT_HASH },
    });

    expect(report.status).toBe("pass");
    expect(report.severity).toBe("info");
    expect(report.summary.passedPanels).toBe(4);
    expect(report.summary.warningPanels).toBe(0);
    expect(report.summary.missingPanels).toBe(0);
    expect(report.summary.distinctManifestHashes).toBe(1);
    expect(report.warnings).toEqual([]);
    expect(report.sheetWarnings).toEqual([]);
    expect(report.expectedManifestHash).toBe(MANIFEST_HASH);
    expect(report.expectedSheetDesignContextHash).toBe(CONTEXT_HASH);
    for (const panelType of REQUIRED_VISUAL_PANEL_TYPES) {
      expect(report.panels[panelType].status).toBe("pass");
      expect(report.panels[panelType].checks.manifestHashMatches).toBe(true);
      expect(report.panels[panelType].checks.manifestIdMatches).toBe(true);
      expect(report.panels[panelType].checks.visualIdentityLocked).toBe(true);
      expect(report.panels[panelType].checks.dimensionsValid).toBe(true);
      expect(report.panels[panelType].checks.nonBlankContent).toBe(true);
    }
  });

  test("mismatched visualManifestHash on one panel → status warning", () => {
    const panels = makeFourDeterministicPanels({
      axonometric: {
        metadata: {
          visualManifestId: MANIFEST_ID,
          visualManifestHash: "different-hash-xxx",
          visualIdentityLocked: true,
          visualRenderMode: "deterministic_fallback",
          visualFidelityStatus: "degraded_control_render",
          imageRenderFallback: true,
        },
      },
    });

    const report = evaluateVisualIdentity({
      visualManifest: MOCK_MANIFEST,
      sheetDesignContext: MOCK_SHEET_DESIGN_CONTEXT,
      panelArtifacts: panels,
      sheetMetadata: { sheetDesignContextHash: CONTEXT_HASH },
    });

    expect(report.status).toBe("warning");
    expect(report.severity).toBe("warning");
    expect(report.summary.warningPanels).toBe(1);
    expect(report.summary.passedPanels).toBe(3);
    expect(report.summary.distinctManifestHashes).toBe(2);
    expect(report.panels.axonometric.status).toBe("warning");
    expect(report.panels.axonometric.checks.manifestHashMatches).toBe(false);
    expect(report.sheetChecks.crossPanelManifestHashUnique).toBe(false);
    expect(report.warnings.some((w) => w.includes("axonometric"))).toBe(true);
    expect(
      report.warnings.some((w) => w.includes("visualManifestHash mismatch")),
    ).toBe(true);
    expect(
      report.sheetWarnings.some((w) =>
        w.includes("All four panels must share one identity"),
      ),
    ).toBe(true);
  });

  test("mismatched sheetDesignContextHash → status warning", () => {
    const panels = makeFourDeterministicPanels();

    const report = evaluateVisualIdentity({
      visualManifest: MOCK_MANIFEST,
      sheetDesignContext: MOCK_SHEET_DESIGN_CONTEXT,
      panelArtifacts: panels,
      sheetMetadata: { sheetDesignContextHash: "different-context-hash" },
    });

    expect(report.status).toBe("warning");
    expect(report.severity).toBe("warning");
    expect(report.sheetChecks.sheetDesignContextHashMatches).toBe(false);
    expect(
      report.sheetWarnings.some((w) =>
        w.includes("sheetDesignContextHash mismatch"),
      ),
    ).toBe(true);
    // Per-panel checks still pass
    for (const panelType of REQUIRED_VISUAL_PANEL_TYPES) {
      expect(report.panels[panelType].status).toBe("pass");
    }
  });

  test("blank/missing panel image → blank warns, missing fails", () => {
    const panels = makeFourDeterministicPanels({
      // Blank panel: empty svgString
      hero_3d: {
        svgString: "",
      },
    });
    // Drop interior_3d entirely
    delete panels.interior_3d;

    const report = evaluateVisualIdentity({
      visualManifest: MOCK_MANIFEST,
      sheetDesignContext: MOCK_SHEET_DESIGN_CONTEXT,
      panelArtifacts: panels,
      sheetMetadata: { sheetDesignContextHash: CONTEXT_HASH },
    });

    expect(report.status).toBe("fail");
    expect(report.severity).toBe("error");
    expect(report.summary.missingPanels).toBe(1);
    expect(report.summary.warningPanels).toBe(1);
    expect(report.panels.hero_3d.status).toBe("warning");
    expect(report.panels.hero_3d.checks.nonBlankContent).toBe(false);
    expect(report.panels.interior_3d.status).toBe("fail");
    expect(report.panels.interior_3d.checks.panelExists).toBe(false);
    expect(report.warnings.some((w) => w.includes("svgString is empty"))).toBe(
      true,
    );
    expect(
      report.warnings.some((w) => w.includes("Panel artifact missing")),
    ).toBe(true);
  });

  test("deterministic fallback path passes (no photoreal metadata required)", () => {
    const panels = makeFourDeterministicPanels();
    // Belt and braces: explicitly null out PNG-specific fields
    for (const panelType of REQUIRED_VISUAL_PANEL_TYPES) {
      panels[panelType].metadata.imageRenderByteLength = null;
      panels[panelType].metadata.imageProviderUsed = "deterministic";
      panels[panelType].metadata.openaiImageUsed = false;
    }

    const report = evaluateVisualIdentity({
      visualManifest: MOCK_MANIFEST,
      sheetDesignContext: MOCK_SHEET_DESIGN_CONTEXT,
      panelArtifacts: panels,
      sheetMetadata: { sheetDesignContextHash: CONTEXT_HASH },
    });

    expect(report.status).toBe("pass");
    for (const panelType of REQUIRED_VISUAL_PANEL_TYPES) {
      expect(report.panels[panelType].deterministicFallback).toBe(true);
      expect(report.panels[panelType].photoreal).toBe(false);
      expect(report.panels[panelType].checks.nonBlankContent).toBe(true);
    }
  });

  test("photoreal panel below PNG byte floor warns", () => {
    const panels = {
      hero_3d: makePhotorealPanel("hero_3d", {
        metadata: {
          visualManifestId: MANIFEST_ID,
          visualManifestHash: MANIFEST_HASH,
          visualIdentityLocked: true,
          visualRenderMode: "photoreal_image_gen",
          visualFidelityStatus: "photoreal_geometry_locked",
          imageRenderFallback: false,
          imageRenderByteLength: 64, // below floor
          imageProviderUsed: "openai",
        },
      }),
      exterior_render: makePhotorealPanel("exterior_render"),
      axonometric: makePhotorealPanel("axonometric"),
      interior_3d: makePhotorealPanel("interior_3d"),
    };

    const report = evaluateVisualIdentity({
      visualManifest: MOCK_MANIFEST,
      sheetDesignContext: MOCK_SHEET_DESIGN_CONTEXT,
      panelArtifacts: panels,
      sheetMetadata: { sheetDesignContextHash: CONTEXT_HASH },
    });

    expect(report.panels.hero_3d.status).toBe("warning");
    expect(report.panels.hero_3d.checks.nonBlankContent).toBe(false);
    expect(
      report.panels.hero_3d.warnings.some((w) =>
        w.includes("PNG byte length below floor"),
      ),
    ).toBe(true);
  });

  test("strict mode promotes warnings to error severity but does not throw", () => {
    const panels = makeFourDeterministicPanels({
      axonometric: {
        metadata: {
          visualManifestId: MANIFEST_ID,
          visualManifestHash: "different-hash-xxx",
          visualIdentityLocked: true,
          visualRenderMode: "deterministic_fallback",
          imageRenderFallback: true,
        },
      },
    });

    const report = evaluateVisualIdentity({
      visualManifest: MOCK_MANIFEST,
      sheetDesignContext: MOCK_SHEET_DESIGN_CONTEXT,
      panelArtifacts: panels,
      sheetMetadata: { sheetDesignContextHash: CONTEXT_HASH },
      options: { strictMode: true },
    });

    expect(report.strictMode).toBe(true);
    expect(report.status).toBe("fail");
    expect(report.severity).toBe("error");
    // warnings still surface as warnings on the panel level — only the
    // top-level severity is promoted, so the gate can choose to demote.
    expect(report.panels.axonometric.severity).toBe("warning");
  });

  test("validator never throws when called with empty input (degenerate case)", () => {
    const report = evaluateVisualIdentity({});
    expect(report.version).toBe(VISUAL_MANIFEST_VALIDATOR_VERSION);
    // Empty input = all 4 panels missing (per-panel severity "error") +
    // missing manifest (sheet warning). Top severity rolls up to "error".
    expect(report.status).toBe("fail");
    expect(report.severity).toBe("error");
    expect(report.summary.missingPanels).toBe(4);
    expect(report.sheetChecks.manifestPresent).toBe(false);
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  test("validateVisualPanelArtifact passes for a complete panel", () => {
    const panel = makeDeterministicPanel("hero_3d");
    const report = validateVisualPanelArtifact({
      panelType: "hero_3d",
      panel,
      expectedManifestHash: MANIFEST_HASH,
      expectedManifestId: MANIFEST_ID,
    });
    expect(report.status).toBe("pass");
    expect(report.warnings).toEqual([]);
  });

  test("validateVisualPanelArtifact warns when visualIdentityLocked is false", () => {
    const panel = makeDeterministicPanel("hero_3d");
    panel.metadata.visualIdentityLocked = false;
    const report = validateVisualPanelArtifact({
      panelType: "hero_3d",
      panel,
      expectedManifestHash: MANIFEST_HASH,
      expectedManifestId: MANIFEST_ID,
    });
    expect(report.status).toBe("warning");
    expect(
      report.warnings.some((w) =>
        w.includes("visualIdentityLocked is not true"),
      ),
    ).toBe(true);
  });

  test("validateVisualPanelArtifact warns on dimension regression", () => {
    const panel = makeDeterministicPanel("hero_3d");
    panel.width = 0;
    panel.height = -10;
    const report = validateVisualPanelArtifact({
      panelType: "hero_3d",
      panel,
      expectedManifestHash: MANIFEST_HASH,
      expectedManifestId: MANIFEST_ID,
    });
    expect(report.status).toBe("warning");
    expect(report.checks.dimensionsValid).toBe(false);
    expect(report.warnings.some((w) => w.includes("invalid dimensions"))).toBe(
      true,
    );
  });
});

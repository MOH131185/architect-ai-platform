/**
 * Phase 4 — integration: panel-consistency evidence MUST fold into the
 * existing `evaluateFinalA1ExportGate` so its mismatches drive
 * `a1ExportQa.status` from "pass" → "blocked" (Phase 3 contract).
 *
 * This suite calls the real `evaluateFinalA1ExportGate` with a minimal
 * but realistic input set so we exercise the actual aggregator wiring
 * (the place a future refactor could silently drop the Phase 4 evidence
 * row). For each case we assert:
 *
 *   - The `evidence.panelConsistencyStatus` row is populated.
 *   - The gate's `blockers` / `status` / `allowed` reflect the
 *     panel-consistency outcome.
 *   - Other gate inputs (PDF, raster, panels, etc.) are NOT failed by
 *     the absence of Phase 4 fixtures (we keep them present-but-passing
 *     so the only failure mode under test is Phase 4).
 */

import { evaluateFinalA1ExportGate } from "../../../services/a1/a1FinalExportContract.js";
import { PANEL_CONSISTENCY_CODES } from "../../../services/validation/panelGeometryConsistencyChecks.js";

const GEOMETRY_HASH = "geom-gate-abc";
const VISUAL_MANIFEST_HASH = "mfst-gate-xyz";
const PALETTE_HASH = "palette-gate-456";

function basePassingGateInputs(overrides = {}) {
  // The gate runs many evidence rows in addition to Phase 4. To keep
  // tests focused on the panel-consistency wiring, every other gate
  // input is supplied in a deliberately permissive shape.
  const renderContract = {
    isFinalA1: true,
    enforceRenderedText: false,
  };
  const sheetArtifact = {
    svgString: "<svg></svg>",
    svgHash: "sheet-svg-hash",
    sheet_size_mm: { width: 841, height: 594 },
    width: 9933,
    height: 7016,
    metadata: { isFinalA1: true },
  };
  const pdfMetadata = {
    version: "a1-pdf-metadata-v1",
    pdfRenderMode: "raster_textpaths_300dpi",
    isFinalA1: true,
    dpi: 300,
    widthPx: 9933,
    heightPx: 7016,
    widthPt: 2384.16,
    heightPt: 1683.7,
    textRenderMode: "font_paths",
    rasterIntegrityStatus: "pass",
    sourceSvgHash: "sheet-svg-hash",
    pdfBytes: 12345,
  };
  return {
    renderContract,
    pdfUrl: "/api/a1/compose-output/a1-gate.pdf",
    sheetArtifact,
    pdfMetadata,
    finalSheetRegression: { finalSheetRegressionReady: true },
    postComposeVerification: {
      publishability: { status: "pass" },
      renderedTextZone: { status: "pass" },
    },
    glyphIntegrity: { status: "pass" },
    rasterGlyphIntegrity: { status: "pass" },
    expectedGeometryHash: GEOMETRY_HASH,
    ...overrides,
  };
}

function fresh3DPanel(panelType, overrides = {}) {
  return {
    panel_type: panelType,
    geometryHash: GEOMETRY_HASH,
    visualManifestHash: VISUAL_MANIFEST_HASH,
    materialPaletteHash: PALETTE_HASH,
    cameraId: `cam-${panelType}`,
    viewDirection: "south-west",
    ...overrides,
  };
}

function fresh2DPanel(panelType, overrides = {}) {
  return {
    panel_type: panelType,
    geometryHash: GEOMETRY_HASH,
    ...overrides,
  };
}

function liveShape3DPanel(panelType, overrides = {}) {
  const cameraId = `compiled-camera-${panelType}`;
  const viewDirection =
    panelType === "axonometric"
      ? "south+west"
      : panelType === "interior_3d"
        ? "interior_room_cutaway_control"
        : "south+east";
  return {
    type: panelType,
    panelType,
    panel_type: panelType,
    status: "ready",
    hasSvg: true,
    source_model_hash: GEOMETRY_HASH,
    geometryHash: GEOMETRY_HASH,
    sourceGeometryHash: GEOMETRY_HASH,
    visualManifestHash: VISUAL_MANIFEST_HASH,
    materialPaletteHash: PALETTE_HASH,
    paletteHash: PALETTE_HASH,
    visualIdentityLocked: true,
    controlViewType:
      panelType === "interior_3d"
        ? "interior_room_cutaway_control"
        : panelType === "axonometric"
          ? "axonometric_massing_opening_control"
          : "exterior_massing_opening_control",
    cameraId,
    viewDirection,
    svgString: '<svg data-panel-id="live-3d"/>',
    metadata: {
      panelType,
      geometryHash: GEOMETRY_HASH,
      sourceGeometryHash: GEOMETRY_HASH,
      visualManifestHash: VISUAL_MANIFEST_HASH,
      materialPaletteHash: PALETTE_HASH,
      paletteHash: PALETTE_HASH,
      cameraId,
      viewDirection,
      camera: { visibleSides: viewDirection.split("+") },
    },
    ...overrides,
  };
}

function liveShape2DPanel(panelType, overrides = {}) {
  return {
    type: panelType,
    panelType,
    panel_type: panelType,
    status: "ready",
    hasSvg: true,
    source_model_hash: GEOMETRY_HASH,
    geometryHash: GEOMETRY_HASH,
    sourceGeometryHash: GEOMETRY_HASH,
    authoritySource: "compiled_project",
    authorityUsed: "compiled_project_canonical_pack",
    technicalDrawing: true,
    renderer: "deterministic_svg",
    provider: "deterministic",
    providerUsed: "deterministic_svg",
    imageProviderUsed: "none",
    svgString: '<svg data-panel-id="live-2d"/>',
    metadata: {
      panelType,
      geometryHash: GEOMETRY_HASH,
      sourceGeometryHash: GEOMETRY_HASH,
      authoritySource: "compiled_project",
      authorityUsed: "compiled_project_canonical_pack",
      technicalDrawing: true,
      renderer: "deterministic_svg",
    },
    ...overrides,
  };
}

function liveShapeMaterialPalettePanel(overrides = {}) {
  return {
    type: "material_palette",
    panelType: "material_palette",
    panel_type: "material_palette",
    status: "ready",
    hasSvg: true,
    source_model_hash: GEOMETRY_HASH,
    geometryHash: GEOMETRY_HASH,
    sourceGeometryHash: GEOMETRY_HASH,
    materialPaletteHash: PALETTE_HASH,
    paletteHash: PALETTE_HASH,
    svgString: '<svg data-panel-id="material_palette"/>',
    metadata: {
      panelType: "material_palette",
      geometryHash: GEOMETRY_HASH,
      sourceGeometryHash: GEOMETRY_HASH,
      materialPaletteHash: PALETTE_HASH,
      paletteHash: PALETTE_HASH,
    },
    ...overrides,
  };
}

function compiledProject({
  geometryHash = GEOMETRY_HASH,
  levels = 2,
  roof = "gable",
  entrance = "south",
  openings = 8,
} = {}) {
  return {
    geometryHash,
    levels: new Array(levels).fill({}),
    openings: new Array(openings).fill({}),
    roof: { form: roof },
    entranceOrientation: entrance,
  };
}

function visualManifest({
  manifestHash = VISUAL_MANIFEST_HASH,
  geometryHash = GEOMETRY_HASH,
  storeyCount = 2,
  roof = "gable",
  entrance = "south",
  primary = "brick",
  fingerprint = [4, 4],
} = {}) {
  return {
    manifestHash,
    geometryHash,
    storeyCount,
    roof: { form: roof },
    entranceOrientation: entrance,
    primaryFacadeMaterial: { name: primary },
    windowRhythmFingerprint: fingerprint,
  };
}

function materialPalette({ hash = PALETTE_HASH, primary = "brick" } = {}) {
  return { hash, primary: { name: primary } };
}

describe("evaluateFinalA1ExportGate — Phase 4 panel-consistency evidence wiring", () => {
  test("evidence row is present in the gate result even when no Phase 4 inputs are supplied", () => {
    const result = evaluateFinalA1ExportGate(basePassingGateInputs());
    expect(result.evidence?.panelConsistencyStatus).toBeDefined();
    expect(result.evidence.panelConsistencyStatus.evaluated).toBe(false);
    // Silent pass — no blockers, no warnings.
    expect(result.evidence.panelConsistencyStatus.status).toBe("pass");
  });

  test("same-source geometry + manifest + palette → gate stays at its previous status", () => {
    const result = evaluateFinalA1ExportGate(
      basePassingGateInputs({
        compiledProject: compiledProject(),
        visualManifest: visualManifest(),
        materialPalette: materialPalette(),
        panels: [
          fresh3DPanel("hero_3d"),
          fresh3DPanel("interior_3d"),
          fresh3DPanel("axonometric"),
          fresh2DPanel("floor_plan_ground"),
          fresh2DPanel("elevation_north"),
          fresh2DPanel("section_AA"),
        ],
        visualPanels: [fresh3DPanel("exterior_render")],
      }),
    );
    const ev = result.evidence.panelConsistencyStatus;
    expect(ev.evaluated).toBe(true);
    expect(ev.status).toBe("pass");
    // No Phase 4 codes appear in the gate's top-level blockers list.
    for (const blocker of result.blockers) {
      expect(blocker).not.toMatch(
        /PANEL_GEOMETRY_HASH_MISMATCH|VISUAL_MANIFEST_HASH_MISSING|FLOOR_COUNT_MISMATCH|ROOF_TYPE_MISMATCH/,
      );
    }
  });

  test("ProjectGraph live-shape panel evidence carries Phase 4 metadata without warnings", () => {
    const result = evaluateFinalA1ExportGate(
      basePassingGateInputs({
        compiledProject: compiledProject(),
        visualManifest: visualManifest(),
        materialPalette: materialPalette(),
        panels: [
          liveShape3DPanel("hero_3d"),
          liveShape2DPanel("floor_plan_ground"),
          liveShape2DPanel("elevation_north"),
          liveShape2DPanel("section_AA"),
          liveShapeMaterialPalettePanel(),
        ],
        visualPanels: [
          liveShape3DPanel("exterior_render"),
          liveShape3DPanel("interior_3d"),
          liveShape3DPanel("axonometric"),
        ],
      }),
    );

    const ev = result.evidence.panelConsistencyStatus;
    expect(ev.evaluated).toBe(true);
    expect(ev.status).toBe("pass");
    for (const drawing of result.evidence.panelConsistencyStatus.raw.mismatches
      .geometryHash) {
      expect(drawing.severity).not.toBe("warning");
    }
    expect(ev.codes).not.toEqual(
      expect.arrayContaining([
        PANEL_CONSISTENCY_CODES.PANEL_GEOMETRY_HASH_MISSING,
        PANEL_CONSISTENCY_CODES.VISUAL_MANIFEST_HASH_MISSING,
        PANEL_CONSISTENCY_CODES.MATERIAL_PALETTE_HASH_MISSING,
        PANEL_CONSISTENCY_CODES.CAMERA_VIEW_METADATA_MISSING,
      ]),
    );
  });

  test("ProjectGraph live-shape materialPaletteHash mismatch blocks final gate", () => {
    const result = evaluateFinalA1ExportGate(
      basePassingGateInputs({
        compiledProject: compiledProject(),
        visualManifest: visualManifest(),
        materialPalette: materialPalette({ hash: "palette-gate-different" }),
        panels: [
          liveShape3DPanel("hero_3d"),
          liveShape2DPanel("floor_plan_ground"),
          liveShapeMaterialPalettePanel(),
        ],
        visualPanels: [
          liveShape3DPanel("exterior_render"),
          liveShape3DPanel("interior_3d"),
          liveShape3DPanel("axonometric"),
        ],
      }),
    );

    expect(result.status).toBe("blocked");
    expect(result.allowed).toBe(false);
    expect(result.evidence.panelConsistencyStatus.codes).toContain(
      PANEL_CONSISTENCY_CODES.MATERIAL_PALETTE_HASH_MISMATCH,
    );
    expect(
      result.blockers.some((blocker) =>
        blocker.includes(
          PANEL_CONSISTENCY_CODES.MATERIAL_PALETTE_HASH_MISMATCH,
        ),
      ),
    ).toBe(true);
  });

  test("ProjectGraph live-shape missing camera/view warns without blocking", () => {
    const result = evaluateFinalA1ExportGate(
      basePassingGateInputs({
        compiledProject: compiledProject(),
        visualManifest: visualManifest(),
        materialPalette: materialPalette(),
        panels: [
          liveShape2DPanel("floor_plan_ground"),
          liveShapeMaterialPalettePanel(),
        ],
        visualPanels: [
          liveShape3DPanel("hero_3d", {
            cameraId: null,
            viewDirection: null,
            metadata: {
              panelType: "hero_3d",
              geometryHash: GEOMETRY_HASH,
              sourceGeometryHash: GEOMETRY_HASH,
              visualManifestHash: VISUAL_MANIFEST_HASH,
              materialPaletteHash: PALETTE_HASH,
              paletteHash: PALETTE_HASH,
            },
          }),
          liveShape3DPanel("exterior_render"),
          liveShape3DPanel("interior_3d"),
          liveShape3DPanel("axonometric"),
        ],
      }),
    );

    expect(result.allowed).toBe(true);
    expect(result.evidence.panelConsistencyStatus.status).toBe("warning");
    expect(result.evidence.panelConsistencyStatus.codes).toContain(
      PANEL_CONSISTENCY_CODES.CAMERA_VIEW_METADATA_MISSING,
    );
    expect(result.evidence.panelConsistencyStatus.blockers).toEqual([]);
  });

  test("ProjectGraph live-shape 2D drawing evidence carries geometry authority", () => {
    const drawings = {
      plan: [liveShape2DPanel("floor_plan_ground")],
      elevation: [liveShape2DPanel("elevation_north")],
      section: [liveShape2DPanel("section_AA")],
    };

    const result = evaluateFinalA1ExportGate(
      basePassingGateInputs({
        compiledProject: compiledProject(),
        visualManifest: visualManifest(),
        materialPalette: materialPalette(),
        panels: [liveShape3DPanel("hero_3d"), liveShapeMaterialPalettePanel()],
        visualPanels: [
          liveShape3DPanel("exterior_render"),
          liveShape3DPanel("interior_3d"),
          liveShape3DPanel("axonometric"),
        ],
        drawings,
      }),
    );

    for (const drawing of [
      ...drawings.plan,
      ...drawings.elevation,
      ...drawings.section,
    ]) {
      expect(drawing.geometryHash).toBe(GEOMETRY_HASH);
      expect(drawing.sourceGeometryHash).toBe(GEOMETRY_HASH);
      expect(drawing.authoritySource).toBe("compiled_project");
      expect(drawing.authorityUsed).toBe("compiled_project_canonical_pack");
    }
    expect(result.evidence.panelConsistencyStatus.status).toBe("pass");
  });

  test("3D panel with stale geometryHash → gate blocked + panelConsistencyStatus blocked", () => {
    const result = evaluateFinalA1ExportGate(
      basePassingGateInputs({
        compiledProject: compiledProject(),
        visualManifest: visualManifest(),
        materialPalette: materialPalette(),
        panels: [
          fresh3DPanel("hero_3d", { geometryHash: "stale-geom-xyz" }),
          fresh2DPanel("floor_plan_ground"),
        ],
      }),
    );
    expect(result.status).toBe("blocked");
    expect(result.allowed).toBe(false);
    expect(result.evidence.panelConsistencyStatus.status).toBe("blocked");
    expect(result.evidence.panelConsistencyStatus.codes).toContain(
      PANEL_CONSISTENCY_CODES.PANEL_GEOMETRY_HASH_MISMATCH,
    );
    expect(
      result.blockers.some((b) =>
        b.includes(PANEL_CONSISTENCY_CODES.PANEL_GEOMETRY_HASH_MISMATCH),
      ),
    ).toBe(true);
  });

  test("3D panel missing visualManifestHash → gate blocked with VISUAL_MANIFEST_HASH_MISSING", () => {
    const result = evaluateFinalA1ExportGate(
      basePassingGateInputs({
        compiledProject: compiledProject(),
        visualManifest: visualManifest(),
        materialPalette: materialPalette(),
        panels: [fresh3DPanel("hero_3d", { visualManifestHash: null })],
      }),
    );
    expect(result.status).toBe("blocked");
    expect(result.evidence.panelConsistencyStatus.codes).toContain(
      PANEL_CONSISTENCY_CODES.VISUAL_MANIFEST_HASH_MISSING,
    );
  });

  test("floor count mismatch (manifest vs compiled) → gate blocked", () => {
    const result = evaluateFinalA1ExportGate(
      basePassingGateInputs({
        compiledProject: compiledProject({ levels: 2 }),
        visualManifest: visualManifest({ storeyCount: 3 }),
        materialPalette: materialPalette(),
        panels: [fresh3DPanel("hero_3d")],
      }),
    );
    expect(result.status).toBe("blocked");
    expect(result.evidence.panelConsistencyStatus.codes).toContain(
      PANEL_CONSISTENCY_CODES.FLOOR_COUNT_MISMATCH,
    );
  });

  test("roof type mismatch → gate blocked", () => {
    const result = evaluateFinalA1ExportGate(
      basePassingGateInputs({
        compiledProject: compiledProject({ roof: "flat" }),
        visualManifest: visualManifest({ roof: "gable" }),
        materialPalette: materialPalette(),
        panels: [fresh3DPanel("hero_3d")],
      }),
    );
    expect(result.status).toBe("blocked");
    expect(result.evidence.panelConsistencyStatus.codes).toContain(
      PANEL_CONSISTENCY_CODES.ROOF_TYPE_MISMATCH,
    );
  });

  test("warning-only mismatches (entrance / primary material / opening count) keep gate non-blocked", () => {
    // The gate's overall status reflects the WORST evidence row across
    // all checks. With only Phase 4 warnings and the rest of the gate
    // passing, the gate should NOT be blocked. We can't assert
    // status === "warning" because the gate may still emit unrelated
    // warnings — we only assert blockers/allowed.
    const result = evaluateFinalA1ExportGate(
      basePassingGateInputs({
        compiledProject: compiledProject({ entrance: "north", openings: 8 }),
        visualManifest: visualManifest({
          entrance: "south",
          fingerprint: [3, 3],
          primary: "render",
        }),
        materialPalette: materialPalette({ primary: "brick" }),
        panels: [fresh3DPanel("hero_3d")],
      }),
    );
    const ev = result.evidence.panelConsistencyStatus;
    expect(ev.status).toBe("warning");
    expect(ev.blockers).toEqual([]);
    expect(ev.codes).toEqual(
      expect.arrayContaining([
        PANEL_CONSISTENCY_CODES.ENTRANCE_ORIENTATION_MISMATCH,
        PANEL_CONSISTENCY_CODES.PRIMARY_FACADE_MATERIAL_MISMATCH,
        PANEL_CONSISTENCY_CODES.OPENING_COUNT_MISMATCH,
      ]),
    );
    // Verify the warnings made it into the gate's top-level warnings list.
    expect(
      result.warnings.some((w) => w.includes("Entrance orientation mismatch")),
    ).toBe(true);
  });

  test("evidence aggregator runs Phase 4 even when crossViewConsistency runs too", () => {
    // Drawings input feeds both crossViewConsistencyStatus AND
    // panelConsistencyStatus. Asserting both are present locks the
    // wiring against future refactors that consolidate the two.
    const result = evaluateFinalA1ExportGate(
      basePassingGateInputs({
        compiledProject: compiledProject(),
        visualManifest: visualManifest(),
        materialPalette: materialPalette(),
        panels: [fresh3DPanel("hero_3d")],
        drawings: {
          plan: [fresh2DPanel("floor_plan_ground")],
          elevation: [fresh2DPanel("elevation_north")],
          section: [fresh2DPanel("section_AA")],
        },
        projectGeometry: { entranceOrientation: "south" },
      }),
    );
    expect(result.evidence.crossViewConsistencyStatus).toBeDefined();
    expect(result.evidence.panelConsistencyStatus).toBeDefined();
    expect(result.evidence.panelConsistencyStatus.evaluated).toBe(true);
  });
});

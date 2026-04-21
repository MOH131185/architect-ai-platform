import {
  resetFeatureFlags,
  setFeatureFlag,
} from "../../config/featureFlags.js";
import { coerceToCanonicalProjectGeometry } from "../../services/cad/geometryFactory.js";
import { buildSectionEvidence } from "../../services/drawing/sectionEvidenceService.js";
import { rankSectionCandidates } from "../../services/drawing/sectionCandidateScoringService.js";
import { renderSectionSvg } from "../../services/drawing/svgSectionRenderer.js";
import { scoreTechnicalPanel } from "../../services/drawing/technicalPanelScoringService.js";
import { buildA1VerificationBundle } from "../../services/a1/a1VerificationBundleService.js";
import { buildProjectReadinessResponse } from "../../services/models/architectureBackendContracts.js";

function rectangle(minX, minY, maxX, maxY) {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function createRawGeometry() {
  return {
    project_id: "phase20-section-truth",
    site: {
      boundary_bbox: {
        min_x: 0,
        min_y: 0,
        max_x: 12,
        max_y: 10,
        width: 12,
        height: 10,
      },
      buildable_bbox: {
        min_x: 0,
        min_y: 0,
        max_x: 12,
        max_y: 10,
        width: 12,
        height: 10,
      },
      boundary_polygon: rectangle(0, 0, 12, 10),
      buildable_polygon: rectangle(0, 0, 12, 10),
      ground_condition: "stepped_grade",
      support_mode: "stepped_grade",
      grade_delta_m: 1.1,
      plinth_height_m: 0.28,
    },
    roof: {
      id: "roof-main",
      type: "hip roof",
      polygon: rectangle(0, 0, 12, 10),
      bbox: {
        min_x: 0,
        min_y: 0,
        max_x: 12,
        max_y: 10,
        width: 12,
        height: 10,
      },
    },
    levels: [
      {
        id: "ground",
        level_number: 0,
        name: "Ground Floor",
        height_m: 3.2,
        footprint: rectangle(0, 0, 12, 10),
      },
      {
        id: "first",
        level_number: 1,
        name: "First Floor",
        height_m: 3,
        footprint: rectangle(0, 0, 12, 10),
      },
    ],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        level_id: "ground",
        actual_area: 30,
        polygon: rectangle(4.2, 0.8, 8.3, 5.2),
        bbox: { min_x: 4.2, min_y: 0.8, max_x: 8.3, max_y: 5.2 },
      },
      {
        id: "gallery",
        name: "Gallery",
        level_id: "first",
        actual_area: 16,
        polygon: rectangle(4.3, 1.0, 7.9, 5.0),
        bbox: { min_x: 4.3, min_y: 1.0, max_x: 7.9, max_y: 5.0 },
      },
    ],
    slabs: [
      {
        id: "ground-slab",
        level_id: "ground",
        polygon: rectangle(0, 0, 12, 10),
        bbox: { min_x: 0, min_y: 0, max_x: 12, max_y: 10 },
      },
      {
        id: "first-slab",
        level_id: "first",
        polygon: rectangle(0, 0, 12, 10),
        bbox: { min_x: 0, min_y: 0, max_x: 12, max_y: 10 },
      },
    ],
    walls: [
      {
        id: "wall-core-ground",
        level_id: "ground",
        start: { x: 6, y: 0 },
        end: { x: 6, y: 10 },
        thickness_m: 0.22,
      },
      {
        id: "wall-core-first",
        level_id: "first",
        start: { x: 6, y: 0 },
        end: { x: 6, y: 10 },
        thickness_m: 0.22,
      },
    ],
    windows: [
      {
        id: "window-core",
        wall_id: "wall-core-ground",
        level_id: "ground",
        position_m: { x: 6, y: 4.2 },
        width_m: 1.4,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
    ],
    doors: [
      {
        id: "door-core",
        wall_id: "wall-core-ground",
        level_id: "ground",
        position_m: { x: 6, y: 7.4 },
        width_m: 1.1,
        head_height_m: 2.2,
      },
    ],
    stairs: [
      {
        id: "main-stair",
        level_id: "ground",
        polygon: rectangle(5.1, 1.6, 6.9, 7.2),
        bbox: { min_x: 5.1, min_y: 1.6, max_x: 6.9, max_y: 7.2 },
      },
    ],
    entrances: [{ id: "main-entry", position_m: { x: 6, y: 7.8 } }],
    circulation: [
      {
        id: "main-circulation",
        polyline: [
          { x: 1.5, y: 7.4 },
          { x: 6, y: 7.4 },
          { x: 10.5, y: 7.4 },
        ],
      },
    ],
  };
}

function createExplicitCanonicalGeometry() {
  const rawGeometry = createRawGeometry();
  const geometry = coerceToCanonicalProjectGeometry(rawGeometry);
  geometry.windows = rawGeometry.windows;
  geometry.doors = rawGeometry.doors;
  geometry.roof_primitives = [
    {
      id: "roof-plane-main",
      primitive_family: "roof_plane",
      type: "pitched_roof_plane",
      polygon: rectangle(0, 0, 12, 10),
      bbox: {
        min_x: 0,
        min_y: 0,
        max_x: 12,
        max_y: 10,
        width: 12,
        height: 10,
      },
      ridge_height_m: 6.6,
      eave_height_m: 6.3,
      support_mode: "explicit_generated",
    },
    {
      id: "ridge-main",
      primitive_family: "ridge",
      type: "ridge_line",
      start: { x: 6, y: 0 },
      end: { x: 6, y: 10 },
      bbox: {
        min_x: 6,
        min_y: 0,
        max_x: 6,
        max_y: 10,
        width: 0,
        height: 10,
      },
      ridge_height_m: 6.6,
      eave_height_m: 6.3,
      support_mode: "explicit_generated",
    },
  ];
  geometry.foundations = [
    {
      id: "foundation-core",
      foundation_type: "continuous_footing",
      start: { x: 6, y: 0 },
      end: { x: 6, y: 10 },
      bbox: {
        min_x: 6,
        min_y: 0,
        max_x: 6,
        max_y: 10,
        width: 0,
        height: 10,
      },
      depth_m: 0.8,
      thickness_m: 0.42,
      support_mode: "explicit_ground_primitives",
    },
  ];
  geometry.base_conditions = [
    {
      id: "base-ground",
      condition_type: "stepped_grade",
      polygon: rectangle(0, 0, 12, 10),
      bbox: {
        min_x: 0,
        min_y: 0,
        max_x: 12,
        max_y: 10,
        width: 12,
        height: 10,
      },
      plinth_height_m: 0.28,
      support_mode: "explicit_ground_primitives",
    },
  ];
  geometry.metadata = {
    ...(geometry.metadata || {}),
    canonical_construction_truth: {
      ...(geometry.metadata?.canonical_construction_truth || {}),
      roof: { support_mode: "explicit_generated" },
      foundation: { support_mode: "explicit_ground_primitives" },
    },
  };
  return geometry;
}

function enablePhase20Flags() {
  setFeatureFlag("useTrueSectionClippingPhase13", true);
  setFeatureFlag("useClippedSectionGraphicsPhase13", true);
  setFeatureFlag("useSectionTruthScoringPhase13", true);
  setFeatureFlag("useSectionCredibilityGatePhase13", true);
  setFeatureFlag("useSectionConstructionTruthPhase14", true);
  setFeatureFlag("useDraftingGradeSectionGraphicsPhase14", true);
  setFeatureFlag("useSectionConstructionScoringPhase14", true);
  setFeatureFlag("useSectionConstructionCredibilityGatePhase14", true);
  setFeatureFlag("useCanonicalRoofPrimitivesPhase15", true);
  setFeatureFlag("useCanonicalFoundationPrimitivesPhase15", true);
  setFeatureFlag("useRoofFoundationSectionTruthPhase15", true);
  setFeatureFlag("useRoofFoundationCredibilityGatePhase15", true);
  setFeatureFlag("useRicherCanonicalRoofGeometryPhase16", true);
  setFeatureFlag("useRicherCanonicalFoundationGeometryPhase16", true);
  setFeatureFlag("useUpstreamConstructionPrimitivesPhase16", true);
  setFeatureFlag("useRoofFoundationTruthPhase16", true);
  setFeatureFlag("useRoofFoundationCredibilityGatePhase16", true);
  setFeatureFlag("useExplicitRoofPrimitiveSynthesisPhase17", true);
  setFeatureFlag("useExplicitFoundationPrimitiveSynthesisPhase17", true);
  setFeatureFlag("useCanonicalConstructionTruthModelPhase17", true);
  setFeatureFlag("useDeeperRoofFoundationClippingPhase17", true);
  setFeatureFlag("useRoofFoundationCredibilityGatePhase17", true);
  setFeatureFlag("useDeeperSectionClippingPhase18", true);
  setFeatureFlag("useDraftingGradeSectionGraphicsPhase18", true);
  setFeatureFlag("useConstructionTruthDrivenSectionRankingPhase18", true);
  setFeatureFlag("useSectionConstructionCredibilityGatePhase18", true);
  setFeatureFlag("useDeeperSectionClippingPhase19", true);
  setFeatureFlag("useDraftingGradeSectionGraphicsPhase19", true);
  setFeatureFlag("useConstructionTruthDrivenSectionRankingPhase19", true);
  setFeatureFlag("useSectionConstructionCredibilityGatePhase19", true);
  setFeatureFlag("useNearBooleanSectioningPhase20", true);
  setFeatureFlag("useCentralizedSectionTruthModelPhase20", true);
  setFeatureFlag("useDraftingGradeSectionGraphicsPhase20", true);
  setFeatureFlag("useConstructionTruthDrivenSectionRankingPhase20", true);
  setFeatureFlag("useSectionConstructionCredibilityGatePhase20", true);
}

describe("Phase 20 near-boolean sectioning and drafting-grade section truth", () => {
  beforeEach(() => {
    resetFeatureFlags();
    enablePhase20Flags();
  });

  afterEach(() => {
    resetFeatureFlags();
  });

  test("aligned cut exposes near-boolean clipping metrics and a centralized section-truth model", () => {
    const geometry = createExplicitCanonicalGeometry();
    const evidence = buildSectionEvidence(geometry, {
      id: "section:phase20:aligned",
      sectionType: "longitudinal",
      cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
      strategyId: "phase20-aligned",
      strategyName: "Phase 20 Aligned",
      expectedCommunicationValue: 0.92,
    });

    expect(evidence.version).toBe("phase20-section-evidence-service-v1");
    expect(evidence.summary.sectionTruthModelVersion).toBe(
      "phase20-section-truth-model-v1",
    );
    expect(evidence.summary.nearBooleanConstructionClipCount).toBeGreaterThan(
      0,
    );
    expect(
      evidence.summary.averageConstructionBandCoverageRatio,
    ).toBeGreaterThan(0.2);
    expect(evidence.sectionTruthModel.version).toBe(
      "phase20-section-truth-model-v1",
    );
    expect(evidence.sectionTruthModel.overall.directCount).toBe(
      evidence.summary.directConstructionTruthCount,
    );
    expect(evidence.sectionTruthModel.overall.contextualCount).toBe(
      evidence.summary.contextualConstructionTruthCount,
    );
    expect(["verified", "weak"]).toContain(
      evidence.sectionTruthModel.nodes.wall.directQuality,
    );
    expect(evidence.sectionTruthModel.nodes.wall.directCount).toBeGreaterThan(
      0,
    );
    expect(
      evidence.sectionTruthModel.nodes.opening.directCount,
    ).toBeGreaterThan(0);
    expect(
      evidence.sectionTruthModel.nodes.roof.totalCount,
    ).toBeGreaterThanOrEqual(0);
    expect(["direct", "contextual", "derived", "unsupported"]).toContain(
      evidence.sectionTruthModel.nodes.roof.truthState,
    );
    expect(["verified", "weak", "blocked"]).toContain(
      evidence.sectionTruthModel.nodes.foundation.directQuality,
    );
  });

  test("derived roof fallback remains derived and does not masquerade as direct cut truth", () => {
    const geometry = createExplicitCanonicalGeometry();
    geometry.roof_primitives = [
      {
        id: "derived-roof-profile",
        primitive_family: "derived_roof_profile",
        support_mode: "derived_profile_only",
        polygon: rectangle(0, 0, 12, 10),
        bbox: {
          min_x: 0,
          min_y: 0,
          max_x: 12,
          max_y: 10,
          width: 12,
          height: 10,
        },
      },
    ];
    geometry.metadata = {
      ...(geometry.metadata || {}),
      canonical_construction_truth: {
        ...(geometry.metadata?.canonical_construction_truth || {}),
        roof: { support_mode: "derived_profile_only" },
        foundation: { support_mode: "explicit_ground_primitives" },
      },
    };

    const evidence = buildSectionEvidence(geometry, {
      id: "section:phase20:derived-roof",
      sectionType: "longitudinal",
      cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
    });

    expect(evidence.summary.roofTruthMode).toBe("derived_profile_only");
    expect(evidence.summary.roofDirectTruthCount).toBe(0);
    expect(evidence.summary.roofDerivedTruthCount).toBeGreaterThan(0);
    expect(evidence.sectionTruthModel.nodes.roof.truthState).toBe("derived");
    expect(evidence.sectionTruthModel.nodes.roof.directQuality).not.toBe(
      "verified",
    );
  });

  test("deeper clipping changes section ranking in favor of the stronger construction cut", () => {
    const geometry = createExplicitCanonicalGeometry();
    const ranked = rankSectionCandidates(geometry, [
      {
        id: "section:poor",
        sectionType: "longitudinal",
        cutLine: { from: { x: 1.25, y: 0 }, to: { x: 1.25, y: 10 } },
        strategyId: "edge-skim",
        strategyName: "Edge Skim",
        expectedCommunicationValue: 0.76,
      },
      {
        id: "section:rich",
        sectionType: "longitudinal",
        cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
        strategyId: "core-cut",
        strategyName: "Core Cut",
        expectedCommunicationValue: 0.88,
        focusEntityIds: ["entity:stair:main-stair"],
      },
    ]);

    expect(ranked[0].id).toBe("section:rich");
    expect(
      ranked[0].sectionEvidence.sectionTruthModel.overall.directScore,
    ).toBeGreaterThan(
      ranked[1].sectionEvidence.sectionTruthModel.overall.directScore,
    );
    expect(
      ranked[0].sectionEvidenceSummary.nearBooleanConstructionClipCount,
    ).toBeGreaterThanOrEqual(
      ranked[1].sectionEvidenceSummary.nearBooleanConstructionClipCount,
    );
    expect(
      ranked[0].sectionEvidenceSummary.sectionContextualEvidenceScore,
    ).toBeLessThanOrEqual(
      ranked[1].sectionEvidenceSummary.sectionContextualEvidenceScore,
    );
  });

  test("renderer metadata and svg expose phase20 truth-aware drafting signals", () => {
    const geometry = createExplicitCanonicalGeometry();
    const sectionProfile = {
      id: "section:phase20:render",
      sectionType: "longitudinal",
      cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
      strategyId: "phase20-render",
      strategyName: "Phase 20 Render",
      expectedCommunicationValue: 0.9,
      rationale: ["Aligned to clipped roof, slab, wall, and foundation truth."],
    };
    const evidence = buildSectionEvidence(geometry, sectionProfile);
    const drawing = renderSectionSvg(
      geometry,
      {},
      {
        sectionType: "longitudinal",
        sectionProfile,
        sectionEvidence: evidence,
      },
    );

    expect(drawing.svg).toContain('data-truth-state="direct"');
    expect(drawing.svg).toContain("phase14-section-roof");
    expect(drawing.svg).toContain("phase8-section-foundation");
    expect(drawing.technical_quality_metadata.section_truth_model_version).toBe(
      "phase20-section-truth-model-v1",
    );
    expect(
      drawing.technical_quality_metadata.section_contextual_evidence_quality,
    ).toBeDefined();
    expect(
      drawing.technical_quality_metadata.section_derived_evidence_quality,
    ).toBeDefined();
    expect(
      drawing.technical_quality_metadata.section_near_boolean_clip_count,
    ).toBeGreaterThan(0);
    expect(
      drawing.technical_quality_metadata.section_band_coverage_ratio,
    ).toBeGreaterThan(0.2);
  });

  test("technical scoring blocks sections when exact cut truth is too thin and fallback dominates", () => {
    const geometry = createExplicitCanonicalGeometry();
    geometry.walls = [];
    geometry.windows = [];
    geometry.doors = [];
    geometry.stairs = [];
    geometry.slabs = [];
    geometry.foundations = [];
    geometry.base_conditions = [];
    geometry.roof_primitives = [
      {
        id: "derived-roof-profile",
        primitive_family: "derived_roof_profile",
        support_mode: "derived_profile_only",
        polygon: rectangle(0, 0, 12, 10),
        bbox: {
          min_x: 0,
          min_y: 0,
          max_x: 12,
          max_y: 10,
          width: 12,
          height: 10,
        },
      },
    ];
    const drawing = renderSectionSvg(
      geometry,
      {},
      {
        sectionType: "longitudinal",
        sectionProfile: {
          id: "section:phase20:weak",
          sectionType: "longitudinal",
          cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
        },
      },
    );
    const scored = scoreTechnicalPanel({
      drawingType: "section",
      drawing,
      readability: { score: 0.92, warnings: [] },
      annotation: { warnings: [], errors: [] },
      annotationPlacement: { placementStable: true, warnings: [], errors: [] },
    });

    expect(scored.version).toBe("phase20-technical-panel-scoring-v1");
    expect(
      String(
        drawing.technical_quality_metadata
          .section_construction_evidence_quality,
      ).toLowerCase(),
    ).toMatch(/^(weak|blocked)$/);
    expect(scored.verdict).toBe("block");
    expect(
      [...scored.blockers, ...scored.warnings].some((entry) =>
        /contextual|derived|exact construction evidence|section usefulness/i.test(
          String(entry),
        ),
      ),
    ).toBe(true);
  });

  test("verification bundle and readiness response expose phase20 section-truth fields consistently", () => {
    const verificationBundle = buildA1VerificationBundle({
      finalSheetRegression: {
        sectionEvidenceQuality: "verified",
        sectionDirectEvidenceQuality: "verified",
        sectionInferredEvidenceQuality: "verified",
        sectionContextualEvidenceQuality: "weak",
        sectionDerivedEvidenceQuality: "verified",
        sectionConstructionEvidenceQuality: "verified",
        sectionConstructionTruthQuality: "verified",
        wallSectionClipQuality: "verified",
        openingSectionClipQuality: "verified",
        stairSectionClipQuality: "verified",
        slabSectionClipQuality: "verified",
        roofSectionClipQuality: "weak",
        foundationSectionClipQuality: "verified",
        cutWallTruthQuality: "verified",
        cutOpeningTruthQuality: "verified",
        stairTruthQuality: "verified",
        slabTruthQuality: "verified",
        roofTruthQuality: "weak",
        roofTruthMode: "explicit_generated",
        roofTruthState: "direct",
        foundationTruthQuality: "verified",
        foundationTruthMode: "explicit_ground_primitives",
        foundationTruthState: "direct",
        sideFacadeEvidenceQuality: "verified",
        sectionTruthModelVersion: "phase20-section-truth-model-v1",
      },
      technicalCredibility: {
        summary: {
          sectionContextualEvidenceQuality: "weak",
          sectionDerivedEvidenceQuality: "verified",
          sectionTruthModelVersion: "phase20-section-truth-model-v1",
        },
      },
      publishability: {
        status: "reviewable",
        verificationPhase: "pre_compose",
      },
    });

    expect(verificationBundle.version).toBe("phase20-a1-verification-v1");
    expect(verificationBundle.sectionContextualEvidenceQuality).toBe("weak");
    expect(verificationBundle.sectionDerivedEvidenceQuality).toBe("verified");
    expect(verificationBundle.sectionTruthModelVersion).toBe(
      "phase20-section-truth-model-v1",
    );

    const response = buildProjectReadinessResponse({
      result: {
        ready: false,
        composeReady: false,
        finalSheetRegression: {
          sectionContextualEvidenceQuality: "blocked",
          sectionDerivedEvidenceQuality: "blocked",
        },
        verificationBundle,
      },
    });

    expect(response.sectionContextualEvidenceQuality).toBe("weak");
    expect(response.sectionDerivedEvidenceQuality).toBe("verified");
    expect(response.sectionTruthModelVersion).toBe(
      "phase20-section-truth-model-v1",
    );
    expect(response.verification.sectionContextualEvidenceQuality).toBe(
      response.sectionContextualEvidenceQuality,
    );
    expect(response.verification.sectionDerivedEvidenceQuality).toBe(
      response.sectionDerivedEvidenceQuality,
    );
    expect(response.verification.sectionTruthModelVersion).toBe(
      response.sectionTruthModelVersion,
    );
  });
});

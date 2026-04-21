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
    project_id: "phase19-section-truth",
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
      grade_delta_m: 1.2,
      plinth_height_m: 0.28,
    },
    roof: {
      id: "roof-main",
      type: "hip roof",
      polygon: rectangle(0, 0, 12, 10),
      bbox: { min_x: 0, min_y: 0, max_x: 12, max_y: 10, width: 12, height: 10 },
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

function enablePhase19Flags() {
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
  setFeatureFlag("useRoofFoundationSectionCredibilityGatePhase15", true);
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
}

describe("Phase 19 richer section clipping and drafting truth", () => {
  beforeEach(() => {
    resetFeatureFlags();
    enablePhase19Flags();
  });

  afterEach(() => {
    resetFeatureFlags();
  });

  test("aligned cut exposes richer profile clipping metrics and verified clip qualities", () => {
    const rawGeometry = createRawGeometry();
    const geometry = coerceToCanonicalProjectGeometry(rawGeometry);
    geometry.windows = rawGeometry.windows;
    geometry.doors = rawGeometry.doors;

    const evidence = buildSectionEvidence(geometry, {
      id: "section:phase19:aligned",
      sectionType: "longitudinal",
      cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
      strategyId: "phase19-aligned",
      strategyName: "Phase 19 Aligned",
      expectedCommunicationValue: 0.9,
    });

    expect([
      "phase19-section-evidence-service-v1",
      "phase20-section-evidence-service-v1",
    ]).toContain(evidence.version);
    expect(evidence.summary.exactConstructionProfileClipCount).toBeGreaterThan(
      0,
    );
    expect(evidence.summary.constructionProfileSegmentCount).toBeGreaterThan(0);
    expect(evidence.summary.sectionProfileComplexityScore).toBeGreaterThan(0.2);
    expect(evidence.summary.sectionDraftingEvidenceScore).toBeGreaterThan(0.35);
    expect(evidence.summary.wallSectionClipQuality).toBe("verified");
    expect(evidence.summary.openingSectionClipQuality).toBe("verified");
    expect(["verified", "weak", "blocked"]).toContain(
      evidence.summary.slabSectionClipQuality,
    );
  });

  test("phase19 ranking prefers the richer clipped construction candidate", () => {
    const rawGeometry = createRawGeometry();
    const geometry = coerceToCanonicalProjectGeometry(rawGeometry);
    geometry.windows = rawGeometry.windows;
    geometry.doors = rawGeometry.doors;

    const ranked = rankSectionCandidates(geometry, [
      {
        id: "section:edge",
        sectionType: "longitudinal",
        cutLine: { from: { x: 1.1, y: 0 }, to: { x: 1.1, y: 10 } },
        strategyId: "edge-skim",
        strategyName: "Edge Skim",
        expectedCommunicationValue: 0.72,
      },
      {
        id: "section:core",
        sectionType: "longitudinal",
        cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
        strategyId: "core-cut",
        strategyName: "Core Cut",
        expectedCommunicationValue: 0.88,
      },
    ]);

    expect(ranked[0].id).toBe("section:core");
    expect(
      ranked[0].sectionEvidenceSummary.sectionDraftingEvidenceScore,
    ).toBeGreaterThan(
      ranked[1].sectionEvidenceSummary.sectionDraftingEvidenceScore,
    );
    expect(
      ranked[0].sectionEvidenceSummary.sectionProfileComplexityScore,
    ).toBeGreaterThanOrEqual(
      ranked[1].sectionEvidenceSummary.sectionProfileComplexityScore,
    );
  });

  test("renderer exposes phase19 clip-quality metadata", () => {
    const rawGeometry = createRawGeometry();
    const geometry = coerceToCanonicalProjectGeometry(rawGeometry);
    geometry.windows = rawGeometry.windows;
    geometry.doors = rawGeometry.doors;
    const evidence = buildSectionEvidence(geometry, {
      id: "section:phase19:render",
      sectionType: "longitudinal",
      cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
      strategyId: "phase19-render",
      strategyName: "Phase 19 Render",
      rationale: ["Aligned to clipped wall, opening, and substructure truth."],
    });
    const drawing = renderSectionSvg(
      geometry,
      {},
      {
        sectionType: "longitudinal",
        sectionEvidence: evidence,
        sectionProfile: {
          id: "section:phase19:render",
          sectionType: "longitudinal",
          cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
        },
      },
    );

    expect(
      drawing.technical_quality_metadata.section_profile_complexity_score,
    ).toBeGreaterThan(0);
    expect(
      drawing.technical_quality_metadata.section_drafting_evidence_score,
    ).toBeGreaterThan(0);
    expect(drawing.technical_quality_metadata.wall_section_clip_quality).toBe(
      "verified",
    );
    expect(
      drawing.technical_quality_metadata.section_exact_profile_clip_count,
    ).toBeGreaterThan(0);
  });

  test("technical scoring blocks sections with blocked wall clip truth", () => {
    const scored = scoreTechnicalPanel({
      drawingType: "section",
      drawing: {
        title: "Weak Section",
        svg: "<svg></svg>",
        technical_quality_metadata: {
          geometry_complete: true,
          cut_room_count: 1,
          level_label_count: 2,
          foundation_marker_count: 1,
          roof_profile_visible: true,
          section_usefulness_score: 0.74,
          section_direct_evidence_quality: "verified",
          section_direct_evidence_score: 0.78,
          section_inferred_evidence_quality: "verified",
          section_construction_evidence_quality: "verified",
          section_construction_truth_quality: "verified",
          wall_section_clip_quality: "blocked",
          opening_section_clip_quality: "weak",
          stair_section_clip_quality: "weak",
          slab_section_clip_quality: "verified",
          roof_section_clip_quality: "weak",
          foundation_section_clip_quality: "weak",
          cut_wall_truth_quality: "blocked",
        },
      },
      readability: { score: 0.84, warnings: [] },
      annotation: { warnings: [], errors: [] },
      annotationPlacement: { warnings: [], errors: [], placementStable: true },
    });

    expect(scored.version).toBe("phase19-technical-panel-scoring-v1");
    expect(scored.verdict).toBe("block");
    expect(scored.blockers.join(" ")).toMatch(/wall profile truth/i);
  });

  test("verification bundle and readiness response expose phase19 clip qualities", () => {
    const verificationBundle = buildA1VerificationBundle({
      finalSheetRegression: {
        sectionEvidenceQuality: "verified",
        sectionDirectEvidenceQuality: "verified",
        sectionInferredEvidenceQuality: "verified",
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
        foundationTruthQuality: "verified",
        foundationTruthMode: "explicit_ground_primitives",
        sideFacadeEvidenceQuality: "verified",
      },
      technicalCredibility: {
        summary: {
          wallSectionClipQuality: "verified",
        },
      },
      publishability: {
        status: "reviewable",
        verificationPhase: "pre_compose",
      },
    });

    expect(verificationBundle.version).toBe("phase19-a1-verification-v1");
    expect(verificationBundle.wallSectionClipQuality).toBe("verified");
    expect(verificationBundle.roofSectionClipQuality).toBe("weak");

    const response = buildProjectReadinessResponse({
      result: {
        ready: false,
        composeReady: false,
        finalSheetRegression: {
          wallSectionClipQuality: "weak",
        },
        verificationBundle,
      },
    });

    expect(response.wallSectionClipQuality).toBe("verified");
    expect(response.openingSectionClipQuality).toBe("verified");
    expect(response.stairSectionClipQuality).toBe("verified");
    expect(response.slabSectionClipQuality).toBe("verified");
    expect(response.roofSectionClipQuality).toBe("weak");
    expect(response.foundationSectionClipQuality).toBe("verified");
    expect(response.verification.wallSectionClipQuality).toBe(
      response.wallSectionClipQuality,
    );
  });
});

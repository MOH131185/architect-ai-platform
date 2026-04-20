import {
  resetFeatureFlags,
  setFeatureFlag,
} from "../../config/featureFlags.js";
import { coerceToCanonicalProjectGeometry } from "../../services/cad/geometryFactory.js";
import { buildSectionEvidence } from "../../services/drawing/sectionEvidenceService.js";
import { rankSectionCandidates } from "../../services/drawing/sectionCandidateScoringService.js";
import { renderSectionSvg } from "../../services/drawing/svgSectionRenderer.js";
import { scoreTechnicalPanel } from "../../services/drawing/technicalPanelScoringService.js";
import { evaluateA1TechnicalCredibility } from "../../services/a1/a1TechnicalCredibilityService.js";
import { classifyA1Publishability } from "../../services/a1/a1PublishabilityService.js";
import { buildA1VerificationBundle } from "../../services/a1/a1VerificationBundleService.js";

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
    project_id: "phase15-roof-foundation",
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
      ground_condition: "level_ground",
      plinth_height_m: 0.18,
    },
    roof: {
      id: "roof-main",
      type: "pitched gable",
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
        height_m: 3.1,
        footprint: rectangle(0, 0, 12, 10),
      },
    ],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        level_id: "ground",
        actual_area: 28,
        polygon: rectangle(4.1, 0.8, 8.4, 5.4),
        bbox: { min_x: 4.1, min_y: 0.8, max_x: 8.4, max_y: 5.4 },
      },
      {
        id: "gallery",
        name: "Gallery",
        level_id: "first",
        actual_area: 16,
        polygon: rectangle(4.3, 1.2, 7.8, 5.2),
        bbox: { min_x: 4.3, min_y: 1.2, max_x: 7.8, max_y: 5.2 },
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
      {
        id: "wall-west",
        level_id: "ground",
        start: { x: 0, y: 0 },
        end: { x: 0, y: 10 },
        thickness_m: 0.24,
        exterior: true,
        kind: "exterior",
      },
      {
        id: "wall-east",
        level_id: "ground",
        start: { x: 12, y: 0 },
        end: { x: 12, y: 10 },
        thickness_m: 0.24,
        exterior: true,
        kind: "exterior",
      },
    ],
    windows: [
      {
        id: "window-core",
        wall_id: "wall-core-ground",
        level_id: "ground",
        position_m: { x: 6, y: 4.4 },
        width_m: 1.2,
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
        polygon: rectangle(5.2, 1.8, 6.8, 7.4),
        bbox: { min_x: 5.2, min_y: 1.8, max_x: 6.8, max_y: 7.4 },
      },
    ],
  };
}

function createExplicitCanonicalGeometry() {
  const geometry = coerceToCanonicalProjectGeometry(createRawGeometry());
  geometry.roof_primitives = [
    {
      id: "roof-plane-main",
      primitive_family: "roof_plane",
      type: "pitched_roof_plane",
      polygon: rectangle(0, 0, 12, 10),
      bbox: { min_x: 0, min_y: 0, max_x: 12, max_y: 10, width: 12, height: 10 },
      ridge_height_m: 6.6,
      eave_height_m: 6.3,
    },
    {
      id: "ridge-main",
      primitive_family: "ridge",
      type: "ridge_line",
      start: { x: 6, y: 0 },
      end: { x: 6, y: 10 },
      bbox: { min_x: 6, min_y: 0, max_x: 6, max_y: 10, width: 0, height: 10 },
      ridge_height_m: 6.6,
      eave_height_m: 6.3,
    },
  ];
  geometry.foundations = [
    {
      id: "foundation-core",
      foundation_type: "continuous_footing",
      start: { x: 6, y: 0 },
      end: { x: 6, y: 10 },
      bbox: { min_x: 6, min_y: 0, max_x: 6, max_y: 10, width: 0, height: 10 },
      depth_m: 0.8,
      thickness_m: 0.42,
    },
  ];
  geometry.base_conditions = [
    {
      id: "base-ground",
      condition_type: "level_ground",
      polygon: rectangle(0, 0, 12, 10),
      bbox: { min_x: 0, min_y: 0, max_x: 12, max_y: 10, width: 12, height: 10 },
      plinth_height_m: 0.18,
    },
  ];
  return geometry;
}

describe("Phase 15 canonical roof and foundation truth", () => {
  afterEach(() => {
    resetFeatureFlags();
  });

  test("coercion synthesizes canonical roof, foundation, and base-condition primitives", () => {
    setFeatureFlag("useCanonicalRoofPrimitivesPhase15", true);
    setFeatureFlag("useCanonicalFoundationPrimitivesPhase15", true);

    const geometry = coerceToCanonicalProjectGeometry(createRawGeometry());

    expect(Array.isArray(geometry.roof_primitives)).toBe(true);
    expect(geometry.roof_primitives.length).toBeGreaterThanOrEqual(3);
    expect(Array.isArray(geometry.foundations)).toBe(true);
    expect(geometry.foundations.length).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(geometry.base_conditions)).toBe(true);
    expect(geometry.base_conditions.length).toBeGreaterThanOrEqual(1);
  });

  test("explicit roof and foundation primitives outrank derived fallback in section truth", () => {
    setFeatureFlag("useCanonicalRoofPrimitivesPhase15", true);
    setFeatureFlag("useCanonicalFoundationPrimitivesPhase15", true);
    setFeatureFlag("useRoofFoundationSectionTruthPhase15", true);
    setFeatureFlag("useSectionConstructionTruthPhase14", true);

    const explicitEvidence = buildSectionEvidence(
      createExplicitCanonicalGeometry(),
      {
        sectionType: "longitudinal",
        cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
        strategyId: "stair-communication",
        strategyName: "Stair Communication",
      },
    );
    const fallbackGeometry =
      coerceToCanonicalProjectGeometry(createRawGeometry());
    fallbackGeometry.roof_primitives = [];
    fallbackGeometry.foundations = [];
    fallbackGeometry.base_conditions = [];
    const fallbackEvidence = buildSectionEvidence(fallbackGeometry, {
      sectionType: "longitudinal",
      cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
      strategyId: "stair-communication",
      strategyName: "Stair Communication",
    });

    expect(explicitEvidence.summary.roofTruthQuality).toBe("verified");
    expect(explicitEvidence.summary.foundationTruthQuality).toBe("verified");
    expect(explicitEvidence.summary.explicitRoofPrimitiveCount).toBeGreaterThan(
      0,
    );
    expect(explicitEvidence.summary.explicitFoundationCount).toBeGreaterThan(0);
    expect(explicitEvidence.summary.explicitBaseConditionCount).toBeGreaterThan(
      0,
    );
    expect(
      explicitEvidence.sectionConstructionSemantics.roofTruth.score,
    ).toBeGreaterThan(
      fallbackEvidence.sectionConstructionSemantics.roofTruth.score,
    );
    expect(
      explicitEvidence.sectionConstructionSemantics.foundationTruth.score,
    ).toBeGreaterThan(
      fallbackEvidence.sectionConstructionSemantics.foundationTruth.score,
    );
  });

  test("section ranking prefers candidates that resolve explicit roof and foundation truth", () => {
    setFeatureFlag("useCanonicalRoofPrimitivesPhase15", true);
    setFeatureFlag("useCanonicalFoundationPrimitivesPhase15", true);
    setFeatureFlag("useRoofFoundationSectionTruthPhase15", true);
    setFeatureFlag("useRoofFoundationSectionCredibilityGatePhase15", true);
    setFeatureFlag("useSectionConstructionTruthPhase14", true);
    setFeatureFlag("useSectionConstructionScoringPhase14", true);

    const [best, weaker] = rankSectionCandidates(
      createExplicitCanonicalGeometry(),
      [
        {
          id: "section:aligned",
          sectionType: "longitudinal",
          cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
          strategyId: "roof-foundation-aligned",
          strategyName: "Roof Foundation Aligned",
          expectedCommunicationValue: 0.8,
        },
        {
          id: "section:offset",
          sectionType: "longitudinal",
          cutLine: { from: { x: 2, y: 0 }, to: { x: 2, y: 10 } },
          strategyId: "offset",
          strategyName: "Offset Cut",
          expectedCommunicationValue: 0.8,
        },
      ],
    );

    expect(best.id).toBe("section:aligned");
    expect(best.categoryScores.roofTruthScore).toBeGreaterThan(
      weaker.categoryScores.roofTruthScore,
    );
    expect(best.categoryScores.foundationTruthScore).toBeGreaterThan(
      weaker.categoryScores.foundationTruthScore,
    );
  });

  test("renderer carries direct roof and foundation truth into metadata and output", () => {
    setFeatureFlag("useCanonicalRoofPrimitivesPhase15", true);
    setFeatureFlag("useCanonicalFoundationPrimitivesPhase15", true);
    setFeatureFlag("useRoofFoundationSectionTruthPhase15", true);
    setFeatureFlag("useSectionConstructionTruthPhase14", true);
    setFeatureFlag("useDraftingGradeSectionGraphicsPhase14", true);
    setFeatureFlag("useClippedSectionGraphicsPhase13", true);

    const drawing = renderSectionSvg(
      createExplicitCanonicalGeometry(),
      {},
      {
        sectionType: "longitudinal",
        sectionProfile: {
          id: "section:explicit",
          sectionType: "longitudinal",
          cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
          strategyId: "stair-communication",
          strategyName: "Stair Communication",
        },
      },
    );

    expect(drawing.technical_quality_metadata.roof_truth_quality).toBe(
      "verified",
    );
    expect(drawing.technical_quality_metadata.foundation_truth_quality).toBe(
      "verified",
    );
    expect(
      drawing.technical_quality_metadata.roof_explicit_primitive_count,
    ).toBe(2);
    expect(
      drawing.technical_quality_metadata.foundation_direct_clip_count,
    ).toBe(1);
    expect(
      drawing.technical_quality_metadata.base_condition_direct_clip_count,
    ).toBe(1);
    expect(drawing.svg).toContain(
      'id="phase14-section-roof" data-truth="verified"',
    );
    expect(drawing.svg).not.toContain("FOUNDATION CONTEXTUAL");
  });

  test("technical scoring blocks sections when explicit foundation and base-condition truth is too thin", () => {
    setFeatureFlag("useRoofFoundationSectionCredibilityGatePhase15", true);

    const score = scoreTechnicalPanel({
      drawingType: "section",
      drawing: {
        title: "Thin Ground Condition Section",
        svg: "<svg><text>Thin Ground Condition</text></svg>",
        technical_quality_metadata: {
          section_usefulness_score: 0.78,
          section_direct_evidence_quality: "verified",
          section_direct_evidence_score: 0.84,
          section_inferred_evidence_quality: "weak",
          section_construction_truth_quality: "weak",
          roof_truth_quality: "weak",
          foundation_truth_quality: "blocked",
          foundation_direct_clip_count: 0,
          base_condition_direct_clip_count: 0,
          explicit_foundation_count: 1,
          explicit_base_condition_count: 1,
          annotation_count: 8,
          section_candidate_quality: "warning",
        },
      },
    });

    expect(score.verdict).toBe("block");
    expect(score.blockers.join(" ")).toMatch(
      /foundation\/base-condition truth/i,
    );
  });

  test("verification bundle and publishability expose roof and foundation truth consistently", () => {
    const finalSheetRegression = {
      verificationPhase: "post_compose",
      sectionEvidenceQuality: "verified",
      sectionDirectEvidenceQuality: "verified",
      sectionInferredEvidenceQuality: "verified",
      sectionConstructionTruthQuality: "verified",
      slabTruthQuality: "verified",
      roofTruthQuality: "verified",
      foundationTruthQuality: "weak",
      sideFacadeEvidenceQuality: "verified",
      renderedTextEvidenceQuality: "verified",
      blockers: [],
      warnings: [
        "Section foundation/base-condition truth remains weaker than preferred for final technical credibility.",
      ],
      verificationState: {
        phase: "post_compose",
        passed: true,
        verified: true,
        blocked: false,
        reviewable: false,
      },
    };

    const technicalCredibility = evaluateA1TechnicalCredibility({
      drawings: { plan: [{}, {}], elevation: [{}, {}], section: [{}] },
      finalSheetRegression,
      verificationPhase: "post_compose",
    });
    const publishability = classifyA1Publishability({
      finalSheetRegression,
      technicalCredibility,
      verificationPhase: "post_compose",
    });
    const verificationBundle = buildA1VerificationBundle({
      finalSheetRegression,
      technicalCredibility,
      publishability,
    });

    expect(technicalCredibility.summary.roofTruthQuality).toBe("verified");
    expect(technicalCredibility.summary.foundationTruthQuality).toBe("weak");
    expect(publishability.evidenceProfile.roofTruthQuality).toBe("verified");
    expect(publishability.evidenceProfile.foundationTruthQuality).toBe("weak");
    expect(verificationBundle.verification.roofTruthQuality).toBe("verified");
    expect(verificationBundle.verification.foundationTruthQuality).toBe("weak");
    expect(verificationBundle.verification.slabTruthQuality).toBe("verified");
  });
});

import {
  resetFeatureFlags,
  setFeatureFlag,
} from "../../config/featureFlags.js";
import { coerceToCanonicalProjectGeometry } from "../../services/cad/geometryFactory.js";
import { buildSectionEvidence } from "../../services/drawing/sectionEvidenceService.js";
import { renderSectionSvg } from "../../services/drawing/svgSectionRenderer.js";
import {
  rankSectionCandidates,
  scoreSectionCandidate,
} from "../../services/drawing/sectionCandidateScoringService.js";
import { projectFacadeGeometry } from "../../services/facade/facadeProjectionService.js";
import { buildSideFacadeSchema } from "../../services/facade/facadeSchemaBuilder.js";
import { assembleFacadeSideSemantics } from "../../services/facade/facadeSemanticAssembler.js";
import { buildProjectReadinessResponse } from "../../services/models/architectureBackendContracts.js";
import { buildA1VerificationBundle } from "../../services/a1/a1VerificationBundleService.js";

function rectangle(minX, minY, maxX, maxY) {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function createBaseGeometry({
  projectId = "phase17-project",
  roofType = "hip roof",
  groundCondition = "stepped_grade",
  supportMode = "stepped_grade",
  gradeDeltaM = 1.1,
} = {}) {
  return {
    project_id: projectId,
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
      ground_condition: groundCondition,
      support_mode: supportMode,
      grade_delta_m: gradeDeltaM,
      plinth_height_m: 0.28,
    },
    roof: {
      id: "roof-main",
      type: roofType,
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
    metadata: {
      style_dna: {
        geometry: {
          massing: {
            type: "L_shape",
          },
        },
      },
      facade_features: [
        {
          id: "dormer-north",
          type: "dormer",
          side: "north",
          width_m: 1.3,
          height_m: 0.8,
          center_x: 6.2,
          center_y: 2.1,
        },
      ],
    },
    levels: [
      {
        id: "ground",
        level_number: 0,
        name: "Ground Floor",
        height_m: 3.2,
        footprint: rectangle(0, 0, 12, 10),
        walls: [
          {
            id: "wall-east-core",
            level_id: "ground",
            start: { x: 8, y: 0 },
            end: { x: 8, y: 10 },
            thickness_m: 0.22,
          },
          {
            id: "wall-west-core",
            level_id: "ground",
            start: { x: 2, y: 0 },
            end: { x: 2, y: 10 },
            thickness_m: 0.22,
          },
          {
            id: "wall-north",
            level_id: "ground",
            start: { x: 0, y: 0 },
            end: { x: 12, y: 0 },
            thickness_m: 0.24,
            exterior: true,
            kind: "exterior",
            side: "north",
          },
          {
            id: "wall-south",
            level_id: "ground",
            start: { x: 0, y: 10 },
            end: { x: 12, y: 10 },
            thickness_m: 0.24,
            exterior: true,
            kind: "exterior",
            side: "south",
          },
        ],
      },
      {
        id: "first",
        level_number: 1,
        name: "First Floor",
        height_m: 3,
        footprint: rectangle(0, 0, 12, 10),
        walls: [
          {
            id: "wall-east-core-first",
            level_id: "first",
            start: { x: 8, y: 0 },
            end: { x: 8, y: 10 },
            thickness_m: 0.22,
          },
          {
            id: "wall-west-core-first",
            level_id: "first",
            start: { x: 2, y: 0 },
            end: { x: 2, y: 10 },
            thickness_m: 0.22,
          },
        ],
      },
    ],
    rooms: [
      {
        id: "main-room",
        name: "Main Room",
        level_id: "ground",
        actual_area: 96,
        polygon: rectangle(0.5, 0.5, 11.5, 9.5),
        bbox: { min_x: 0.5, min_y: 0.5, max_x: 11.5, max_y: 9.5 },
      },
    ],
    walls: [
      {
        id: "wall-east-core",
        level_id: "ground",
        start: { x: 8, y: 0 },
        end: { x: 8, y: 10 },
        thickness_m: 0.22,
      },
      {
        id: "wall-west-core",
        level_id: "ground",
        start: { x: 2, y: 0 },
        end: { x: 2, y: 10 },
        thickness_m: 0.22,
      },
      {
        id: "wall-east-core-first",
        level_id: "first",
        start: { x: 8, y: 0 },
        end: { x: 8, y: 10 },
        thickness_m: 0.22,
      },
      {
        id: "wall-west-core-first",
        level_id: "first",
        start: { x: 2, y: 0 },
        end: { x: 2, y: 10 },
        thickness_m: 0.22,
      },
      {
        id: "wall-north",
        level_id: "ground",
        start: { x: 0, y: 0 },
        end: { x: 12, y: 0 },
        thickness_m: 0.24,
        exterior: true,
        kind: "exterior",
        side: "north",
      },
      {
        id: "wall-south",
        level_id: "ground",
        start: { x: 0, y: 10 },
        end: { x: 12, y: 10 },
        thickness_m: 0.24,
        exterior: true,
        kind: "exterior",
        side: "south",
      },
    ],
    windows: [],
    doors: [],
    stairs: [],
  };
}

describe("Phase 17 explicit roof and foundation primitives", () => {
  beforeEach(() => {
    resetFeatureFlags();
    setFeatureFlag("useTrueSectionClippingPhase13", true);
    setFeatureFlag("useClippedSectionGraphicsPhase13", true);
    setFeatureFlag("useSectionConstructionTruthPhase14", true);
    setFeatureFlag("useDraftingGradeSectionGraphicsPhase14", true);
    setFeatureFlag("useRoofFoundationSectionTruthPhase15", true);
    setFeatureFlag("useRoofFoundationCredibilityGatePhase16", true);
    setFeatureFlag("useRicherCanonicalRoofGeometryPhase16", true);
    setFeatureFlag("useRicherCanonicalFoundationGeometryPhase16", true);
    setFeatureFlag("useUpstreamConstructionPrimitivesPhase16", true);
    setFeatureFlag("useRoofFoundationTruthPhase16", true);
    setFeatureFlag("useExplicitRoofPrimitiveSynthesisPhase17", true);
    setFeatureFlag("useExplicitFoundationPrimitiveSynthesisPhase17", true);
    setFeatureFlag("useCanonicalConstructionTruthModelPhase17", true);
    setFeatureFlag("useDeeperRoofFoundationClippingPhase17", true);
    setFeatureFlag("useRoofFoundationCredibilityGatePhase17", true);
  });

  afterEach(() => {
    resetFeatureFlags();
  });

  test("upstream synthesis generates explicit hips and valleys and preserves them into side-facade schema", () => {
    const geometry = coerceToCanonicalProjectGeometry(createBaseGeometry());
    const families = new Set(
      geometry.roof_primitives.map((entry) => entry.primitive_family),
    );
    const projection = projectFacadeGeometry(geometry, "north");
    const semantics = assembleFacadeSideSemantics({
      side: "north",
      projection,
      facadeOrientation: {},
      roofLanguage: geometry.roof?.type || "hip roof",
      features: geometry.metadata.facade_features,
    });
    const schema = buildSideFacadeSchema({
      side: "north",
      projection,
      facadeOrientation: {},
      facadeSemantics: semantics,
      features: geometry.metadata.facade_features,
      roofLanguage: geometry.roof?.type || "hip roof",
    });

    expect(families.has("hip")).toBe(true);
    expect(families.has("valley")).toBe(true);
    expect(
      geometry.metadata.canonical_construction_truth.roof.support_mode,
    ).toBe("explicit_generated");
    expect(projection.version).toBe("phase17-facade-projection-v1");
    expect(projection.roofHipCount).toBeGreaterThan(0);
    expect(projection.roofValleyCount).toBeGreaterThan(0);
    expect(schema.version).toBe("phase17-side-facade-schema-builder-v1");
    expect(schema.evidenceSummary.roofHipCount).toBeGreaterThan(0);
    expect(schema.evidenceSummary.roofValleyCount).toBeGreaterThan(0);
  });

  test("foundation synthesis produces explicit zones and base-wall conditions instead of contextual-only ground truth", () => {
    const geometry = coerceToCanonicalProjectGeometry(createBaseGeometry());
    const truth = geometry.metadata.canonical_construction_truth.foundation;

    expect(truth.support_mode).toBe("explicit_ground_primitives");
    expect(truth.foundation_zone_count).toBeGreaterThan(0);
    expect(truth.base_wall_condition_count).toBeGreaterThan(0);
    expect(truth.explicit_ground_relation_count).toBeGreaterThan(0);
  });

  test("section evidence and renderer expose normalized roof and foundation truth states", () => {
    const geometry = coerceToCanonicalProjectGeometry(createBaseGeometry());
    const evidence = buildSectionEvidence(geometry, {
      sectionType: "longitudinal",
      cutLine: { from: { x: 8, y: 0 }, to: { x: 8, y: 10 } },
      strategyId: "phase17-direct-cut",
      strategyName: "Phase 17 Direct Cut",
    });
    const drawing = renderSectionSvg(
      geometry,
      {},
      {
        sectionType: "longitudinal",
        sectionProfile: {
          id: "phase17-direct-cut",
          sectionType: "longitudinal",
          cutLine: { from: { x: 8, y: 0 }, to: { x: 8, y: 10 } },
          strategyId: "phase17-direct-cut",
          strategyName: "Phase 17 Direct Cut",
        },
      },
    );

    expect(evidence.version).toMatch(
      /^phase(17|18|19|20)-section-evidence-service-v1$/,
    );
    expect(evidence.summary.roofTruthState).toBe("direct");
    expect(evidence.summary.foundationTruthState).toBe("direct");
    expect(drawing.technical_quality_metadata.roof_truth_state).toBe("direct");
    expect(drawing.technical_quality_metadata.foundation_truth_state).toBe(
      "direct",
    );
    expect(drawing.technical_quality_metadata.roof_hip_count).toBeGreaterThan(
      0,
    );
    expect(
      drawing.technical_quality_metadata.foundation_zone_count,
    ).toBeGreaterThan(0);
  });

  test("candidate ranking prefers cuts with stronger explicit roof and foundation truth", () => {
    const geometry = coerceToCanonicalProjectGeometry({
      ...createBaseGeometry({
        projectId: "phase17-ranking",
        roofType: "pitched gable",
      }),
      roof_primitives: [
        {
          primitive_family: "ridge",
          type: "ridge_line",
          start: { x: 8, y: 0 },
          end: { x: 8, y: 10 },
          support_mode: "explicit_generated",
        },
      ],
      foundations: [
        {
          foundation_type: "foundation_zone",
          polygon: rectangle(7.5, 0, 8.5, 10),
          support_mode: "explicit_ground_primitives",
        },
      ],
      base_conditions: [
        {
          condition_type: "base_wall_condition",
          polygon: rectangle(7.6, 0, 8.4, 10),
          support_mode: "explicit_ground_primitives",
        },
      ],
    });
    const candidates = [
      {
        id: "section:weak",
        sectionType: "longitudinal",
        title: "Weak Section",
        cutLine: { from: { x: 2, y: 0 }, to: { x: 2, y: 10 } },
        strategyId: "phase17-weak",
        strategyName: "Phase 17 Weak",
        expectedCommunicationValue: 0.6,
        rationale: [],
        focusEntityIds: [],
      },
      {
        id: "section:strong",
        sectionType: "longitudinal",
        title: "Strong Section",
        cutLine: { from: { x: 8, y: 0 }, to: { x: 8, y: 10 } },
        strategyId: "phase17-strong",
        strategyName: "Phase 17 Strong",
        expectedCommunicationValue: 0.6,
        rationale: [],
        focusEntityIds: [],
      },
    ];

    const ranked = rankSectionCandidates(geometry, candidates);
    const weak = scoreSectionCandidate(geometry, candidates[0]);
    const strong = scoreSectionCandidate(geometry, candidates[1]);

    expect(ranked[0].id).toBe("section:strong");
    expect(strong.categoryScores.roofTruthScore).toBeGreaterThan(
      weak.categoryScores.roofTruthScore,
    );
    expect(strong.categoryScores.foundationTruthScore).toBeGreaterThan(
      weak.categoryScores.foundationTruthScore,
    );
  });

  test("derived roof-profile fallback does not masquerade as direct roof truth", () => {
    const geometry = coerceToCanonicalProjectGeometry({
      ...createBaseGeometry({
        projectId: "phase17-derived-roof",
        roofType: "pitched gable",
        groundCondition: "level_ground",
        supportMode: "level_ground",
      }),
      roof_primitives: [
        {
          primitive_family: "derived_roof_profile",
          type: "derived_roof_profile",
          start: { x: 0, y: 5 },
          end: { x: 12, y: 5 },
          support_mode: "derived_profile_only",
        },
      ],
    });
    const evidence = buildSectionEvidence(geometry, {
      sectionType: "longitudinal",
      cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
      strategyId: "phase17-derived",
      strategyName: "Phase 17 Derived",
    });
    const drawing = renderSectionSvg(
      geometry,
      {},
      {
        sectionType: "longitudinal",
        sectionProfile: {
          id: "phase17-derived",
          sectionType: "longitudinal",
          cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
          strategyId: "phase17-derived",
          strategyName: "Phase 17 Derived",
        },
      },
    );

    expect(evidence.summary.roofTruthMode).toBe("derived_profile_only");
    expect(evidence.summary.roofTruthState).toBe("derived");
    expect(drawing.technical_quality_metadata.roof_truth_state).toBe("derived");
  });

  test("readiness contract prefers canonical verification bundle truth states over stale compatibility fields", () => {
    const verificationBundle = buildA1VerificationBundle({
      finalSheetRegression: {
        verificationPhase: "pre_compose",
        roofTruthQuality: "verified",
        roofTruthMode: "explicit_generated",
        roofTruthState: "direct",
        foundationTruthQuality: "verified",
        foundationTruthMode: "explicit_ground_primitives",
        foundationTruthState: "direct",
        sectionDirectEvidenceQuality: "verified",
        sectionInferredEvidenceQuality: "verified",
        sectionConstructionTruthQuality: "verified",
        slabTruthQuality: "verified",
        sideFacadeEvidenceQuality: "verified",
        renderedTextEvidenceQuality: "provisional",
        sectionEvidenceQuality: "verified",
        warnings: [],
        blockers: [],
      },
      technicalCredibility: {
        verificationPhase: "pre_compose",
        status: "pass",
        blockers: [],
        warnings: [],
        summary: {
          roofTruthQuality: "verified",
          roofTruthMode: "explicit_generated",
          roofTruthState: "direct",
          foundationTruthQuality: "verified",
          foundationTruthMode: "explicit_ground_primitives",
          foundationTruthState: "direct",
        },
      },
      publishability: {
        verificationPhase: "pre_compose",
        status: "reviewable",
        decision: "reviewable_with_warnings",
        finalDecision: "provisional",
        blockers: [],
        warnings: [],
      },
    });
    const response = buildProjectReadinessResponse({
      result: {
        ready: false,
        composeReady: false,
        finalSheetRegression: {
          roofTruthMode: "derived_profile_only",
          roofTruthState: "derived",
          foundationTruthMode: "contextual_ground_relation",
          foundationTruthState: "contextual",
        },
        verificationBundle,
      },
    });

    expect(response.roofTruthState).toBe("direct");
    expect(response.foundationTruthState).toBe("direct");
    expect(response.verification.roofTruthState).toBe("direct");
    expect(response.verification.foundationTruthState).toBe("direct");
    expect(response.verificationBundle.verification.roofTruthState).toBe(
      "direct",
    );
  });
});

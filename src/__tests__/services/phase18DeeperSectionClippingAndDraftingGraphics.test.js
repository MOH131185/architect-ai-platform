import {
  resetFeatureFlags,
  setFeatureFlag,
} from "../../config/featureFlags.js";
import { coerceToCanonicalProjectGeometry } from "../../services/cad/geometryFactory.js";
import { buildSectionEvidence } from "../../services/drawing/sectionEvidenceService.js";
import { rankSectionCandidates } from "../../services/drawing/sectionCandidateScoringService.js";
import { renderSectionSvg } from "../../services/drawing/svgSectionRenderer.js";
import { scoreTechnicalPanel } from "../../services/drawing/technicalPanelScoringService.js";
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

function createRawGeometry({
  roofType = "hip roof",
  groundCondition = "stepped_grade",
  supportMode = "stepped_grade",
  gradeDeltaM = 1.2,
} = {}) {
  return {
    project_id: "phase18-section-clipping",
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
      bbox: { min_x: 0, min_y: 0, max_x: 12, max_y: 10, width: 12, height: 10 },
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
            id: "wall-core-ground",
            level_id: "ground",
            start: { x: 6, y: 0 },
            end: { x: 6, y: 10 },
            thickness_m: 0.22,
          },
        ],
      },
      {
        id: "first",
        level_number: 1,
        name: "First Floor",
        height_m: 3.0,
        footprint: rectangle(0, 0, 12, 10),
        walls: [
          {
            id: "wall-core-first",
            level_id: "first",
            start: { x: 6, y: 0 },
            end: { x: 6, y: 10 },
            thickness_m: 0.22,
          },
        ],
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

function enablePhase18Flags() {
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
}

describe("Phase 18 deeper section clipping and drafting graphics", () => {
  beforeEach(() => {
    resetFeatureFlags();
    enablePhase18Flags();
  });

  afterEach(() => {
    resetFeatureFlags();
  });

  test("deeper clipping exposes direct construction truth from explicit roof and foundation primitives", () => {
    const rawGeometry = createRawGeometry();
    const geometry = coerceToCanonicalProjectGeometry(rawGeometry);
    geometry.windows = rawGeometry.windows;
    geometry.doors = rawGeometry.doors;
    const evidence = buildSectionEvidence(geometry, {
      id: "section:phase18:aligned",
      sectionType: "longitudinal",
      cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
      strategyId: "phase18-aligned",
      strategyName: "Phase 18 Aligned",
      expectedCommunicationValue: 0.88,
      focusEntityIds: ["entity:stair:main-stair", "entity:room:living"],
    });

    expect(evidence.summary.sectionConstructionEvidenceQuality).toBe(
      "verified",
    );
    expect(evidence.summary.directConstructionTruthCount).toBeGreaterThan(0);
    expect(evidence.summary.exactConstructionClipCount).toBeGreaterThan(0);
    expect(evidence.summary.cutWallDirectTruthCount).toBeGreaterThan(0);
    expect(evidence.summary.cutOpeningDirectTruthCount).toBeGreaterThan(0);
    expect(evidence.summary.roofDirectTruthCount).toBeGreaterThan(0);
    expect(
      evidence.summary.foundationDirectTruthCount +
        evidence.summary.baseConditionDirectTruthCount,
    ).toBeGreaterThan(0);
  });

  test("contextual or derived roof fallback does not masquerade as direct roof truth", () => {
    setFeatureFlag("useExplicitRoofPrimitiveSynthesisPhase17", false);

    const geometry = coerceToCanonicalProjectGeometry(
      createRawGeometry({
        roofType: "pitched gable",
        groundCondition: "level_ground",
        supportMode: null,
        gradeDeltaM: 0,
      }),
    );
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
        foundation: { support_mode: "missing" },
      },
    };

    const evidence = buildSectionEvidence(geometry, {
      id: "section:phase18:derived-roof",
      sectionType: "longitudinal",
      cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
    });

    expect(evidence.summary.roofTruthMode).toBe("derived_profile_only");
    expect(evidence.summary.roofDirectTruthCount).toBe(0);
    expect(evidence.summary.roofDerivedTruthCount).toBeGreaterThan(0);
    expect(evidence.summary.roofTruthQuality).not.toBe("verified");
  });

  test("construction-rich cut outranks a broader but construction-poor cut", () => {
    const rawGeometry = createRawGeometry();
    const geometry = coerceToCanonicalProjectGeometry(rawGeometry);
    geometry.windows = rawGeometry.windows;
    geometry.doors = rawGeometry.doors;
    const ranked = rankSectionCandidates(geometry, [
      {
        id: "section:poor",
        sectionType: "longitudinal",
        cutLine: { from: { x: 1.4, y: 0 }, to: { x: 1.4, y: 10 } },
        strategyId: "edge-skim",
        strategyName: "Edge Skim",
        expectedCommunicationValue: 0.72,
      },
      {
        id: "section:rich",
        sectionType: "longitudinal",
        cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
        strategyId: "core-cut",
        strategyName: "Core Cut",
        expectedCommunicationValue: 0.86,
        focusEntityIds: ["entity:stair:main-stair"],
      },
    ]);

    expect(ranked[0].id).toBe("section:rich");
    expect(
      ranked[0].sectionEvidenceSummary.directConstructionTruthCount,
    ).toBeGreaterThan(
      ranked[1].sectionEvidenceSummary.directConstructionTruthCount,
    );
    expect(
      ranked[0].sectionEvidenceSummary.constructionEvidenceScore,
    ).toBeGreaterThanOrEqual(
      ranked[1].sectionEvidenceSummary.constructionEvidenceScore,
    );
  });

  test("renderer exposes phase18 construction-evidence metadata and truth-aware graphics", () => {
    const rawGeometry = createRawGeometry();
    const geometry = coerceToCanonicalProjectGeometry(rawGeometry);
    geometry.windows = rawGeometry.windows;
    geometry.doors = rawGeometry.doors;
    const sectionProfile = {
      id: "section:phase18:render",
      sectionType: "longitudinal",
      cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
      strategyId: "phase18-render",
      strategyName: "Phase 18 Render",
      expectedCommunicationValue: 0.9,
      rationale: ["Aligned to stair, wall, roof, and ground truth."],
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
    expect(
      drawing.technical_quality_metadata.section_construction_evidence_quality,
    ).toBe("verified");
    expect(
      drawing.technical_quality_metadata
        .section_direct_construction_truth_count,
    ).toBeGreaterThan(0);
    expect(
      drawing.technical_quality_metadata.section_exact_construction_clip_count,
    ).toBeGreaterThan(0);
    expect(drawing.technical_quality_metadata.chosen_section_rationale).toBe(
      "Aligned to stair, wall, roof, and ground truth.",
    );
  });

  test("technical scoring blocks weak sections when exact construction truth is too thin", () => {
    setFeatureFlag("useExplicitRoofPrimitiveSynthesisPhase17", false);
    setFeatureFlag("useExplicitFoundationPrimitiveSynthesisPhase17", false);

    const geometry = coerceToCanonicalProjectGeometry(
      createRawGeometry({
        roofType: "pitched gable",
        groundCondition: "level_ground",
        supportMode: null,
        gradeDeltaM: 0,
      }),
    );
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
          id: "section:phase18:weak",
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

    expect(
      String(
        drawing.technical_quality_metadata
          .section_construction_evidence_quality,
      ).toLowerCase(),
    ).toMatch(/^(weak|blocked)$/);
    expect(scored.verdict).toBe("block");
    if (
      String(
        drawing.technical_quality_metadata
          .section_construction_evidence_quality,
      ).toLowerCase() === "blocked"
    ) {
      expect(
        scored.blockers.some((entry) =>
          String(entry).includes("exact construction evidence is blocked"),
        ),
      ).toBe(true);
    } else {
      expect(
        [...scored.blockers, ...scored.warnings].some((entry) =>
          String(entry).includes("exact construction evidence"),
        ),
      ).toBe(true);
    }
  });

  test("canonical verification bundle and readiness response expose phase18 section truth fields", () => {
    const verificationBundle = buildA1VerificationBundle({
      finalSheetRegression: {
        verificationPhase: "pre_compose",
        renderedTextEvidenceQuality: "provisional",
        sideFacadeEvidenceQuality: "verified",
        sectionEvidenceQuality: "verified",
        sectionDirectEvidenceQuality: "verified",
        sectionInferredEvidenceQuality: "verified",
        sectionConstructionEvidenceQuality: "verified",
        sectionConstructionTruthQuality: "verified",
        cutWallTruthQuality: "verified",
        cutOpeningTruthQuality: "verified",
        stairTruthQuality: "verified",
        slabTruthQuality: "verified",
        roofTruthQuality: "verified",
        roofTruthMode: "explicit_generated",
        roofTruthState: "direct",
        foundationTruthQuality: "verified",
        foundationTruthMode: "explicit_ground_primitives",
        foundationTruthState: "direct",
        chosenSectionRationale:
          "Core cut preserves the strongest cut-construction truth.",
        sectionCandidateQuality: [
          {
            sectionType: "longitudinal",
            rationale: [
              "Core cut preserves the strongest cut-construction truth.",
            ],
          },
        ],
      },
      technicalCredibility: {
        verificationPhase: "pre_compose",
        status: "pass",
        blockers: [],
        warnings: [],
        summary: {},
      },
      publishability: {
        verificationPhase: "pre_compose",
        status: "reviewable",
        blockers: [],
        warnings: [],
      },
    });

    const response = buildProjectReadinessResponse({
      result: {
        ready: false,
        finalSheetRegression: {
          sectionConstructionEvidenceQuality: "weak",
          sectionConstructionTruthQuality: "weak",
          cutWallTruthQuality: "weak",
          cutOpeningTruthQuality: "weak",
          stairTruthQuality: "weak",
        },
        verificationBundle,
      },
    });

    expect(response.sectionConstructionEvidenceQuality).toBe("verified");
    expect(response.sectionConstructionTruthQuality).toBe("verified");
    expect(response.cutWallTruthQuality).toBe("verified");
    expect(response.cutOpeningTruthQuality).toBe("verified");
    expect(response.stairTruthQuality).toBe("verified");
    expect(response.sectionChosenRationale).toBe(
      "Core cut preserves the strongest cut-construction truth.",
    );
    expect(response.verification.sectionConstructionEvidenceQuality).toBe(
      response.sectionConstructionEvidenceQuality,
    );
    expect(response.verification.cutWallTruthQuality).toBe(
      response.cutWallTruthQuality,
    );
  });
});

import {
  resetFeatureFlags,
  setFeatureFlag,
} from "../../config/featureFlags.js";
import { buildSectionEvidence } from "../../services/drawing/sectionEvidenceService.js";
import { rankSectionCandidates } from "../../services/drawing/sectionCandidateScoringService.js";
import { renderSectionSvg } from "../../services/drawing/svgSectionRenderer.js";
import { scoreTechnicalPanel } from "../../services/drawing/technicalPanelScoringService.js";
import { buildA1VerificationBundle } from "../../services/a1/a1VerificationBundleService.js";
import { classifyA1Publishability } from "../../services/a1/a1PublishabilityService.js";
import { runA1TechnicalPanelRegression } from "../../services/a1/a1TechnicalPanelRegressionService.js";

function rectangle(minX, minY, maxX, maxY) {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function createGeometry() {
  return {
    project_id: "phase14-section-construction",
    schema_version: "canonical-project-geometry-v2",
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
    },
    roof: {
      id: "roof-main",
      type: "pitched gable",
      polygon: rectangle(0, 0, 12, 10),
      bbox: { min_x: 0, min_y: 0, max_x: 12, max_y: 10 },
    },
    levels: [
      { id: "ground", level_number: 0, name: "Ground Floor", height_m: 3.2 },
      { id: "first", level_number: 1, name: "First Floor", height_m: 3.1 },
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
    rooms: [
      {
        id: "living",
        name: "Living Room",
        level_id: "ground",
        actual_area: 28,
        polygon: rectangle(4.2, 0.6, 8.1, 5.4),
        bbox: { min_x: 4.2, min_y: 0.6, max_x: 8.1, max_y: 5.4 },
      },
      {
        id: "gallery",
        name: "Gallery",
        level_id: "first",
        actual_area: 15,
        polygon: rectangle(4.3, 1.1, 7.7, 5.2),
        bbox: { min_x: 4.3, min_y: 1.1, max_x: 7.7, max_y: 5.2 },
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
    entrances: [{ id: "main-entry", position_m: { x: 6, y: 7.8 } }],
    circulation: [
      {
        id: "main-circulation",
        polyline: [
          { x: 1.8, y: 7.5 },
          { x: 6, y: 7.5 },
          { x: 10.8, y: 7.5 },
        ],
      },
    ],
  };
}

describe("Phase 14 section construction truth", () => {
  afterEach(() => {
    resetFeatureFlags();
  });

  test("classifies wall, opening, stair, slab, roof, and foundation truth from direct cut geometry", () => {
    setFeatureFlag("useSectionConstructionTruthPhase14", true);

    const evidence = buildSectionEvidence(createGeometry(), {
      sectionType: "longitudinal",
      cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
      focusEntityIds: ["entity:stair:main-stair"],
    });

    expect(evidence.summary.sectionConstructionTruthQuality).toBe("verified");
    expect(evidence.summary.cutWallTruthQuality).toBe("verified");
    expect(evidence.summary.cutOpeningTruthQuality).toBe("verified");
    expect(evidence.summary.stairTruthQuality).toBe("verified");
    expect(["verified", "weak"]).toContain(evidence.summary.slabTruthQuality);
    expect(["verified", "weak"]).toContain(evidence.summary.roofTruthQuality);
    expect(["verified", "weak"]).toContain(
      evidence.summary.foundationTruthQuality,
    );
  });

  test("construction-poor section candidates are downgraded even when generic communication heuristics look acceptable", () => {
    setFeatureFlag("useSectionConstructionTruthPhase14", true);
    setFeatureFlag("useSectionConstructionScoringPhase14", true);

    const geometry = createGeometry();
    geometry.walls = [];
    geometry.windows = [];
    geometry.doors = [];
    geometry.stairs = [];

    const [candidate] = rankSectionCandidates(geometry, [
      {
        id: "candidate-weak-construction",
        sectionType: "longitudinal",
        cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
        strategyId: "roof-profile",
        strategyName: "Roof Profile",
        expectedCommunicationValue: 0.8,
      },
    ]);

    expect(
      candidate.sectionEvidenceSummary.sectionConstructionTruthQuality,
    ).toBe("blocked");
    expect(candidate.sectionCandidateQuality).toBe("block");
  });

  test("wall truth does not overclaim from room and slab clips when wall cuts are only contextual", () => {
    setFeatureFlag("useSectionConstructionTruthPhase14", true);

    const geometry = createGeometry();
    geometry.walls = geometry.walls.map((wall) => ({
      ...wall,
      start: { x: 8, y: wall.start.y },
      end: { x: 8, y: wall.end.y },
    }));
    geometry.windows = geometry.windows.map((opening) => ({
      ...opening,
      position_m: { x: 8, y: opening.position_m.y },
    }));
    geometry.doors = geometry.doors.map((opening) => ({
      ...opening,
      position_m: { x: 8, y: opening.position_m.y },
    }));

    const evidence = buildSectionEvidence(geometry, {
      sectionType: "longitudinal",
      cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
      focusEntityIds: ["entity:stair:main-stair"],
    });

    expect(evidence.summary.directClipCount).toBeGreaterThan(0);
    expect(evidence.summary.cutWallCount).toBe(0);
    expect(evidence.summary.cutWallExactClipCount).toBe(0);
    expect(evidence.summary.cutWallTruthQuality).toBe("blocked");
    expect(evidence.summary.sectionConstructionTruthQuality).not.toBe(
      "verified",
    );
  });

  test("renderer exposes drafting-grade section metadata and detail groups from construction truth", () => {
    setFeatureFlag("useSectionConstructionTruthPhase14", true);
    setFeatureFlag("useDraftingGradeSectionGraphicsPhase14", true);
    setFeatureFlag("useClippedSectionGraphicsPhase13", true);

    const sectionProfile = {
      id: "section:longitudinal:phase14",
      sectionType: "longitudinal",
      cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
      strategyId: "stair-communication",
      strategyName: "Stair Communication",
      expectedCommunicationValue: 0.84,
    };
    const evidence = buildSectionEvidence(createGeometry(), sectionProfile);
    const drawing = renderSectionSvg(
      createGeometry(),
      {},
      {
        sectionType: "longitudinal",
        sectionProfile,
        sectionEvidence: evidence,
      },
    );

    expect(drawing.svg).toContain("phase14-section-slabs");
    expect(drawing.svg).toContain("phase13-section-cut-walls");
    expect(drawing.svg).toContain("phase13-section-cut-openings");
    expect(drawing.svg).toContain("phase14-stair-arrow");
    expect(
      drawing.technical_quality_metadata.section_construction_truth_quality,
    ).toBe("verified");
    expect(drawing.technical_quality_metadata.cut_wall_truth_quality).toBe(
      "verified",
    );
    expect(
      drawing.technical_quality_metadata.cut_wall_exact_clip_count,
    ).toBeGreaterThanOrEqual(1);
  });

  test("renderer visually downgrades roof and foundation graphics when their truth is contextual", () => {
    setFeatureFlag("useSectionConstructionTruthPhase14", true);
    setFeatureFlag("useDraftingGradeSectionGraphicsPhase14", true);
    setFeatureFlag("useClippedSectionGraphicsPhase13", true);

    const geometry = createGeometry();
    geometry.roof = {
      type: "pitched gable",
    };

    const sectionProfile = {
      id: "section:longitudinal:phase14-contextual",
      sectionType: "longitudinal",
      cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
      strategyId: "stair-communication",
      strategyName: "Stair Communication",
      expectedCommunicationValue: 0.84,
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

    expect(drawing.technical_quality_metadata.roof_truth_quality).toBe(
      "blocked",
    );
    expect(drawing.svg).toContain(
      'id="phase14-section-roof" data-truth="blocked"',
    );
    expect(drawing.svg).toContain("FOUNDATION CONTEXTUAL");
  });

  test("technical scoring blocks sections when construction truth is blocked", () => {
    setFeatureFlag("useSectionConstructionCredibilityGatePhase14", true);

    const score = scoreTechnicalPanel({
      drawingType: "section",
      drawing: {
        title: "Construction Weak Section",
        svg: "<svg><text>Construction Weak</text></svg>",
        technical_quality_metadata: {
          section_usefulness_score: 0.76,
          section_direct_evidence_quality: "verified",
          section_inferred_evidence_quality: "weak",
          section_construction_truth_quality: "blocked",
          cut_wall_truth_quality: "blocked",
          slab_truth_quality: "blocked",
          foundation_truth_quality: "weak",
          section_direct_evidence_score: 0.74,
          section_construction_evidence_score: 0.18,
          section_inferred_evidence_score: 0.41,
          section_communication_value: 0.62,
          level_label_count: 2,
          foundation_marker_count: 1,
          roof_profile_visible: true,
          room_label_count: 1,
          annotation_guarantee: true,
        },
      },
      readability: { score: 0.82, warnings: [] },
      annotation: { warnings: [], errors: [] },
      annotationPlacement: { placementStable: true, warnings: [], errors: [] },
    });

    expect(score.verdict).toBe("block");
    expect(score.version).toBe("phase14-technical-panel-scoring-v1");
    expect(score.blockers.join(" ")).toContain("construction truth");
  });

  test("regression keeps missing construction truth provisional instead of verified", () => {
    const regression = runA1TechnicalPanelRegression({
      drawings: {
        section: [
          {
            section_type: "longitudinal",
            technical_quality_metadata: {
              section_usefulness_score: 0.82,
            },
          },
        ],
      },
    });

    expect(regression.sectionEvidenceQuality).toBe("provisional");
    expect(regression.sectionDirectEvidenceQuality).toBe("provisional");
    expect(regression.sectionInferredEvidenceQuality).toBe("provisional");
    expect(regression.sectionConstructionTruthQuality).toBe("provisional");
  });

  test("verification bundle and publishability carry Phase 14 section construction truth consistently", () => {
    const verification = buildA1VerificationBundle({
      finalSheetRegression: {
        verificationPhase: "post_compose",
        status: "pass",
        blockers: [],
        warnings: [],
        sectionEvidenceQuality: "verified",
        sectionDirectEvidenceQuality: "verified",
        sectionInferredEvidenceQuality: "verified",
        sectionConstructionTruthQuality: "verified",
        sideFacadeEvidenceQuality: "verified",
      },
      technicalCredibility: {
        verificationPhase: "post_compose",
        status: "pass",
        blockers: [],
        warnings: [],
        summary: {
          sectionConstructionTruthQuality: "verified",
        },
      },
      publishability: {
        verificationPhase: "post_compose",
        status: "publishable",
        blockers: [],
        warnings: [],
        finalDecision: "publishable",
      },
    });

    expect(verification.sectionConstructionTruthQuality).toBe("verified");
    expect(verification.verification.sectionConstructionTruthQuality).toBe(
      "verified",
    );

    const publishability = classifyA1Publishability({
      verificationPhase: "post_compose",
      finalSheetRegression: {
        blockers: [],
        warnings: [
          "Section construction truth remains weaker than preferred for drafting-grade final technical credibility.",
        ],
        sectionConstructionTruthQuality: "verified",
      },
      technicalCredibility: {
        blockers: [],
        warnings: [],
        summary: {
          sectionConstructionTruthQuality: "verified",
        },
      },
    });

    expect(publishability.status).toBe("publishable");
    expect(publishability.evidenceProfile.sectionConstructionTruthQuality).toBe(
      "verified",
    );
  });
});

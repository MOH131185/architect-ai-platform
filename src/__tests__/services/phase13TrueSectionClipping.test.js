import {
  resetFeatureFlags,
  setFeatureFlag,
} from "../../config/featureFlags.js";
import { buildSectionEvidence } from "../../services/drawing/sectionEvidenceService.js";
import { rankSectionCandidates } from "../../services/drawing/sectionCandidateScoringService.js";
import { renderSectionSvg } from "../../services/drawing/svgSectionRenderer.js";
import { scoreTechnicalPanel } from "../../services/drawing/technicalPanelScoringService.js";
import { classifyA1Publishability } from "../../services/a1/a1PublishabilityService.js";

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
    project_id: "phase13-section-truth",
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
      {
        id: "bbox-room",
        name: "BBox Room",
        level_id: "ground",
        actual_area: 12,
        bbox: { min_x: 9.8, min_y: 1.2, max_x: 10.4, max_y: 4.6 },
      },
    ],
    walls: [
      {
        id: "wall-core",
        level_id: "ground",
        start: { x: 6, y: 0 },
        end: { x: 6, y: 10 },
        thickness_m: 0.22,
      },
      {
        id: "wall-offset",
        level_id: "ground",
        start: { x: 10.1, y: 0 },
        end: { x: 10.1, y: 10 },
        thickness_m: 0.22,
      },
    ],
    windows: [
      {
        id: "window-core",
        wall_id: "wall-core",
        level_id: "ground",
        position_m: { x: 6, y: 4.4 },
        width_m: 1.2,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
      {
        id: "window-offset",
        wall_id: "wall-offset",
        level_id: "ground",
        position_m: { x: 10.1, y: 3.8 },
        width_m: 1.2,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
    ],
    doors: [
      {
        id: "door-core",
        wall_id: "wall-core",
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

describe("Phase 13 true section clipping", () => {
  afterEach(() => {
    resetFeatureFlags();
  });

  test("separates exact clipped evidence from bbox-only approximation honestly", () => {
    setFeatureFlag("useTrueSectionClippingPhase13", true);

    const evidence = buildSectionEvidence(createGeometry(), {
      sectionType: "longitudinal",
      cutLine: {
        from: { x: 6, y: 0 },
        to: { x: 6, y: 10 },
      },
      focusEntityIds: ["entity:stair:main-stair"],
    });

    expect([
      "phase13-section-geometry-intersection-v1",
      "phase17-section-geometry-intersection-v1",
      "phase18-section-geometry-intersection-v1",
      "phase19-section-geometry-intersection-v1",
      "phase20-section-geometry-intersection-v1",
    ]).toContain(evidence.sectionIntersections.version);
    expect(evidence.summary.cutRoomCount).toBeGreaterThan(0);
    expect(evidence.summary.cutStairCount).toBeGreaterThan(0);
    expect(evidence.summary.directClipCount).toBeGreaterThan(0);
    expect(evidence.summary.directEvidenceQuality).toBe("verified");
    expect(evidence.intersections.inferredRooms).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "bbox-room" })]),
    );
  });

  test("true clipping outranks a bbox-grazing candidate that older range scoring could over-value", () => {
    setFeatureFlag("useTrueSectionClippingPhase13", true);
    setFeatureFlag("useSectionTruthScoringPhase13", true);

    const candidates = rankSectionCandidates(createGeometry(), [
      {
        id: "candidate-direct",
        sectionType: "longitudinal",
        cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
        strategyId: "stair-communication",
        strategyName: "Stair Communication",
        expectedCommunicationValue: 0.84,
      },
      {
        id: "candidate-bbox-graze",
        sectionType: "longitudinal",
        cutLine: { from: { x: 10.1, y: 0 }, to: { x: 10.1, y: 10 } },
        strategyId: "bbox-graze",
        strategyName: "BBox Graze",
        expectedCommunicationValue: 0.82,
      },
    ]);

    expect(candidates[0].id).toBe("candidate-direct");
    expect(
      candidates[0].sectionEvidenceSummary.directEvidenceScore,
    ).toBeGreaterThan(candidates[1].sectionEvidenceSummary.directEvidenceScore);
    expect(candidates[0].rejectedAlternatives[0].reason).toContain(
      "direct cut evidence",
    );
  });

  test("section renderer exposes clipped wall and opening graphics from direct cut geometry", () => {
    setFeatureFlag("useTrueSectionClippingPhase13", true);
    setFeatureFlag("useClippedSectionGraphicsPhase13", true);

    const sectionProfile = {
      id: "section:longitudinal:test",
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

    expect(drawing.svg).toContain("phase13-section-cut-walls");
    expect(drawing.svg).toContain("phase13-section-cut-openings");
    expect(
      drawing.technical_quality_metadata.section_direct_evidence_quality,
    ).toBe("verified");
    expect(drawing.technical_quality_metadata.section_direct_clip_count).toBe(
      evidence.summary.directClipCount,
    );
    const openingMatch = drawing.svg.match(
      /phase13-section-cut-opening-window-core[\s\S]*?<rect x="([^"]+)"/,
    );
    expect(openingMatch).toBeTruthy();
    expect(Number(openingMatch[1])).toBeLessThan(600);
  });

  test("openings without compatible wall cut truth do not overclaim near evidence", () => {
    setFeatureFlag("useTrueSectionClippingPhase13", true);

    const geometry = createGeometry();
    geometry.windows = [
      {
        id: "window-orphan",
        wall_id: "missing-wall",
        level_id: "ground",
        position_m: { x: 6, y: 4.4 },
        width_m: 1.2,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
    ];
    geometry.doors = [];

    const evidence = buildSectionEvidence(geometry, {
      sectionType: "longitudinal",
      cutLine: {
        from: { x: 6, y: 0 },
        to: { x: 6, y: 10 },
      },
    });

    expect(evidence.summary.cutOpeningCount).toBe(0);
    expect(evidence.summary.nearOpeningCount).toBe(0);
    expect(evidence.summary.inferredOpeningCount).toBe(1);
  });

  test("technical scoring blocks sections when direct truth is blocked", () => {
    setFeatureFlag("useSectionCredibilityGatePhase13", true);

    const result = scoreTechnicalPanel({
      drawingType: "section",
      drawing: {
        title: "Weak Section",
        svg: "<svg><text>Weak Section</text></svg>",
        technical_quality_metadata: {
          section_usefulness_score: 0.69,
          section_direct_evidence_quality: "blocked",
          section_inferred_evidence_quality: "blocked",
          section_direct_evidence_score: 0.12,
          section_inferred_evidence_score: 0.84,
          section_communication_value: 0.42,
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

    expect(result.verdict).toBe("block");
    expect(result.blockers.join(" ")).toContain("direct section evidence");
  });

  test("publishability propagates blocked section truth when final-board evidence confirms it", () => {
    const publishability = classifyA1Publishability({
      verificationPhase: "post_compose",
      finalSheetRegression: {
        blockers: [],
        warnings: [],
        renderedTextEvidenceQuality: "verified",
        sectionEvidenceQuality: "blocked",
        sectionDirectEvidenceQuality: "blocked",
        sectionInferredEvidenceQuality: "blocked",
        sideFacadeEvidenceQuality: "verified",
      },
      technicalCredibility: {
        blockers: [
          "Section direct-evidence quality is blocked because exact cut proof is too weak across the available technical sections.",
        ],
        warnings: [],
        summary: {
          sectionEvidenceQuality: "blocked",
          sectionDirectEvidenceQuality: "blocked",
          sectionInferredEvidenceQuality: "blocked",
        },
      },
    });

    expect(publishability.status).toBe("blocked");
    expect(publishability.evidenceProfile.sectionDirectEvidenceQuality).toBe(
      "blocked",
    );
    expect(publishability.evidenceProfile.sectionInferredEvidenceQuality).toBe(
      "blocked",
    );
  });
});

import {
  resetFeatureFlags,
  setFeatureFlag,
} from "../../config/featureFlags.js";
import { scoreTechnicalPanel } from "../../services/drawing/technicalPanelScoringService.js";

describe("Priority 2 technical panel gating", () => {
  afterEach(() => {
    resetFeatureFlags();
  });

  test("blocks unlabeled or nearly empty plan panels", () => {
    const unlabeledPlan = scoreTechnicalPanel({
      drawingType: "plan",
      drawing: {
        title: "Unlabeled Plan",
        room_count: 3,
        svg: "<svg><rect width='10' height='10' /></svg>",
        technical_quality_metadata: {
          drawing_type: "plan",
          geometry_complete: true,
          geometry_completeness: 0.82,
          room_count: 3,
          room_label_count: 0,
          wall_count: 8,
          window_count: 2,
          door_count: 2,
          door_swing_count: 2,
          stair_count: 1,
          has_external_dimensions: true,
          has_north_arrow: true,
          has_title_block: true,
          plan_density_score: 0.82,
          annotation_guarantee: true,
        },
      },
      readability: { score: 0.84, warnings: [] },
      annotation: { warnings: [], errors: [] },
      annotationPlacement: {
        placementStable: true,
        warnings: [],
        errors: [],
      },
    });

    const blankPlan = scoreTechnicalPanel({
      drawingType: "plan",
      drawing: {
        title: "Blank Plan",
        room_count: 0,
        svg: "<svg />",
        technical_quality_metadata: {
          drawing_type: "plan",
          geometry_complete: true,
          geometry_completeness: 0.32,
          room_count: 0,
          room_label_count: 0,
          wall_count: 0,
          window_count: 0,
          door_count: 0,
          door_swing_count: 0,
          stair_count: 0,
          plan_density_score: 0.12,
          annotation_guarantee: true,
        },
      },
      readability: { score: 0.78, warnings: [] },
      annotation: { warnings: [], errors: [] },
      annotationPlacement: {
        placementStable: true,
        warnings: [],
        errors: [],
      },
    });

    expect(unlabeledPlan.blocking).toBe(true);
    expect(
      unlabeledPlan.blockers.some((entry) =>
        /room labels are missing/i.test(entry),
      ),
    ).toBe(true);
    expect(blankPlan.blocking).toBe(true);
    expect(
      blankPlan.blockers.some((entry) => /blank or nearly empty/i.test(entry)),
    ).toBe(true);
  });

  test("downgrades marginal elevations and unlabeled sections", () => {
    const marginalElevation = scoreTechnicalPanel({
      drawingType: "elevation",
      drawing: {
        title: "Marginal Elevation",
        window_count: 2,
        svg: "<svg><text>Marginal Elevation</text></svg>",
        technical_quality_metadata: {
          drawing_type: "elevation",
          geometry_complete: true,
          geometry_completeness: 0.86,
          facade_richness_score: 0.66,
          window_count: 2,
          level_label_count: 1,
          material_zone_count: 1,
          bay_count: 1,
          opening_group_count: 1,
          wall_zone_count: 1,
          has_title: true,
          has_title_block: true,
          annotation_guarantee: true,
        },
      },
      readability: { score: 0.88, warnings: [] },
      annotation: { warnings: [], errors: [] },
      annotationPlacement: {
        placementStable: true,
        warnings: [],
        errors: [],
      },
    });

    const unlabeledSection = scoreTechnicalPanel({
      drawingType: "section",
      drawing: {
        title: "Unlabeled Section",
        svg: "<svg><text>Section</text></svg>",
        technical_quality_metadata: {
          drawing_type: "section",
          geometry_complete: true,
          geometry_completeness: 0.88,
          cut_room_count: 2,
          room_label_count: 0,
          section_usefulness_score: 0.84,
          section_direct_evidence_quality: "verified",
          section_inferred_evidence_quality: "verified",
          section_direct_evidence_score: 0.84,
          section_inferred_evidence_score: 0.1,
          section_communication_value: 0.84,
          section_construction_evidence_score: 0.88,
          section_exact_construction_clip_count: 4,
          section_near_boolean_clip_count: 2,
          section_strategy_id: "stair-communication",
          section_face_credibility_quality: "verified",
          section_face_credibility_score: 0.88,
          section_cut_face_construction_truth_count: 2,
          section_face_bundle_version: "phase21-section-face-extraction-v1",
          level_label_count: 2,
          foundation_marker_count: 1,
          roof_profile_visible: true,
          annotation_guarantee: true,
        },
      },
      readability: { score: 0.86, warnings: [] },
      annotation: { warnings: [], errors: [] },
      annotationPlacement: {
        placementStable: true,
        warnings: [],
        errors: [],
      },
    });

    expect(marginalElevation.blocking).toBe(false);
    expect(
      marginalElevation.warnings.some((entry) =>
        /elevation richness .*marginal/i.test(entry),
      ),
    ).toBe(true);
    expect(unlabeledSection.blocking).toBe(false);
    expect(
      unlabeledSection.warnings.some((entry) =>
        /room labels are missing from the section panel/i.test(entry),
      ),
    ).toBe(true);
  });

  test("blocks sections when direct evidence remains weak", () => {
    setFeatureFlag("useSectionCredibilityGatePhase13", true);

    const score = scoreTechnicalPanel({
      drawingType: "section",
      drawing: {
        title: "Weak Direct Evidence Section",
        svg: "<svg><text>Section</text></svg>",
        technical_quality_metadata: {
          drawing_type: "section",
          geometry_complete: true,
          geometry_completeness: 0.9,
          cut_room_count: 2,
          room_label_count: 2,
          section_usefulness_score: 0.82,
          section_direct_evidence_quality: "weak",
          section_inferred_evidence_quality: "verified",
          section_direct_evidence_score: 0.42,
          section_inferred_evidence_score: 0.18,
          section_communication_value: 0.78,
          level_label_count: 2,
          foundation_marker_count: 1,
          roof_profile_visible: true,
          annotation_guarantee: true,
        },
      },
      readability: { score: 0.9, warnings: [] },
      annotation: { warnings: [], errors: [] },
      annotationPlacement: {
        placementStable: true,
        warnings: [],
        errors: [],
      },
    });

    expect(score.blocking).toBe(true);
    expect(
      score.blockers.some((entry) =>
        /direct section evidence remains weak/i.test(entry),
      ),
    ).toBe(true);
  });
});

import {
  resetFeatureFlags,
  setFeatureFlag,
} from "../../config/featureFlags.js";
import { coerceToCanonicalProjectGeometry } from "../../services/cad/geometryFactory.js";
import { buildSectionEvidence } from "../../services/drawing/sectionEvidenceService.js";
import { rankSectionCandidates } from "../../services/drawing/sectionCandidateScoringService.js";
import { renderSectionSvg } from "../../services/drawing/svgSectionRenderer.js";
import { runA1TechnicalPanelRegression } from "../../services/a1/a1TechnicalPanelRegressionService.js";
import { evaluateA1TechnicalCredibility } from "../../services/a1/a1TechnicalCredibilityService.js";
import { buildA1VerificationBundle } from "../../services/a1/a1VerificationBundleService.js";
import {
  buildProjectReadinessResponse,
  buildPlanA1PanelsResponse,
  buildProjectHealthResponse,
} from "../../services/models/architectureBackendContracts.js";

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
    project_id: "phase21-section-truth",
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

function enablePhase21Flags() {
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
  setFeatureFlag("useTrueGeometricSectioningPhase21", true);
  setFeatureFlag("useCentralizedSectionTruthModelPhase21", true);
  setFeatureFlag("useDraftingGradeSectionGraphicsPhase21", true);
  setFeatureFlag("useConstructionTruthDrivenSectionRankingPhase21", true);
  setFeatureFlag("useSectionConstructionCredibilityGatePhase21", true);
}

describe("Phase 21 true geometric sectioning and drafting-grade section truth", () => {
  beforeEach(() => {
    resetFeatureFlags();
    enablePhase21Flags();
  });

  afterEach(() => {
    resetFeatureFlags();
  });

  test("aligned core cut produces a phase21 section face bundle with cut-face or cut-profile truth", () => {
    const geometry = createExplicitCanonicalGeometry();
    const evidence = buildSectionEvidence(geometry, {
      id: "section:phase21:aligned",
      sectionType: "longitudinal",
      cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
      strategyId: "phase21-aligned",
      strategyName: "Phase 21 Aligned",
      expectedCommunicationValue: 0.92,
    });

    expect(evidence.sectionFaceBundle).not.toBeNull();
    expect(evidence.sectionFaceBundle.version).toBe(
      "phase21-section-face-extraction-v1",
    );
    expect(evidence.sectionTruthModel.version).toBe(
      "phase21-section-truth-model-v1",
    );
    expect(evidence.sectionTruthModel.sectionFaceBundleVersion).toBe(
      "phase21-section-face-extraction-v1",
    );
    const summary = evidence.sectionFaceBundle.summary || {};
    expect(summary.totalCount).toBeGreaterThan(0);
    expect(summary.cutFaceCount + summary.cutProfileCount).toBeGreaterThan(0);
    expect(["verified", "weak", "blocked"]).toContain(
      evidence.sectionFaceBundle.credibility.quality,
    );
  });

  test("section truth kinds differentiate cut_face, cut_profile, contextual_profile, and derived_profile", () => {
    const geometry = createExplicitCanonicalGeometry();
    const evidence = buildSectionEvidence(geometry, {
      id: "section:phase21:kinds",
      sectionType: "longitudinal",
      cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
    });
    const faces = evidence.sectionFaceBundle?.faces || {};
    const allTruthKinds = Object.values(faces).flatMap((group) =>
      (group.faces || []).map((face) => face.truthKind),
    );
    const uniqueKinds = new Set(allTruthKinds);
    uniqueKinds.forEach((kind) => {
      expect([
        "cut_face",
        "cut_profile",
        "contextual_profile",
        "derived_profile",
        "unsupported",
      ]).toContain(kind);
    });
    expect(allTruthKinds.length).toBeGreaterThan(0);
  });

  test("derived roof fallback maps to derived_profile or contextual_profile and not cut_face", () => {
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
      id: "section:phase21:derived-roof",
      sectionType: "longitudinal",
      cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
    });

    const roofFaces = evidence.sectionFaceBundle?.faces?.roofs?.faces || [];
    const roofTruthKinds = roofFaces.map((face) => face.truthKind);
    expect(roofTruthKinds).not.toContain("cut_face");
    if (roofTruthKinds.length) {
      expect(
        roofTruthKinds.every(
          (kind) =>
            kind === "derived_profile" ||
            kind === "contextual_profile" ||
            kind === "unsupported",
        ),
      ).toBe(true);
    }
  });

  test("phase21 ranking promotes the section with stronger cut-face/face-credibility truth", () => {
    const geometry = createExplicitCanonicalGeometry();
    const ranked = rankSectionCandidates(geometry, [
      {
        id: "section:edge",
        sectionType: "longitudinal",
        cutLine: { from: { x: 1.25, y: 0 }, to: { x: 1.25, y: 10 } },
        strategyId: "edge-skim",
        strategyName: "Edge Skim",
        expectedCommunicationValue: 0.76,
      },
      {
        id: "section:core",
        sectionType: "longitudinal",
        cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
        strategyId: "core-cut",
        strategyName: "Core Cut",
        expectedCommunicationValue: 0.88,
        focusEntityIds: ["entity:stair:main-stair"],
      },
    ]);

    expect(ranked[0].id).toBe("section:core");
    const winnerFaceCount =
      Number(
        ranked[0].sectionEvidence?.sectionFaceBundle?.summary?.cutFaceCount ||
          0,
      ) +
      Number(
        ranked[0].sectionEvidence?.sectionFaceBundle?.summary
          ?.cutProfileCount || 0,
      );
    const loserFaceCount =
      Number(
        ranked[1].sectionEvidence?.sectionFaceBundle?.summary?.cutFaceCount ||
          0,
      ) +
      Number(
        ranked[1].sectionEvidence?.sectionFaceBundle?.summary
          ?.cutProfileCount || 0,
      );
    expect(winnerFaceCount).toBeGreaterThanOrEqual(loserFaceCount);
    const rejected = ranked[0].rejectedAlternatives || [];
    const rejectedEdge = rejected.find((entry) => entry.id === "section:edge");
    expect(rejectedEdge).toBeDefined();
    expect(String(rejectedEdge.reason || "")).toMatch(
      /cut-face construction truth|section-face credibility|construction truth|direct cut/i,
    );
  });

  test("renderer surfaces phase21 cut-face and face-credibility signals into technical_quality_metadata", () => {
    const geometry = createExplicitCanonicalGeometry();
    const sectionProfile = {
      id: "section:phase21:render",
      sectionType: "longitudinal",
      cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
      strategyId: "phase21-render",
      strategyName: "Phase 21 Render",
      expectedCommunicationValue: 0.9,
      rationale: ["Aligned to cut-face walls, slabs, openings, and stairs."],
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

    const metadata = drawing.technical_quality_metadata || {};
    expect(metadata.section_truth_model_version).toBe(
      "phase21-section-truth-model-v1",
    );
    expect(metadata.section_face_bundle_version).toBe(
      "phase21-section-face-extraction-v1",
    );
    expect(["verified", "weak", "blocked"]).toContain(
      metadata.section_face_credibility_quality,
    );
    expect(metadata.section_face_cut_face_count).toBeDefined();
    expect(metadata.section_face_cut_profile_count).toBeDefined();
    expect(
      Number(metadata.section_face_cut_face_count) +
        Number(metadata.section_face_cut_profile_count),
    ).toBeGreaterThan(0);
  });

  test("technical credibility surfaces phase21 blockers and version when face credibility is blocked", () => {
    const credibility = evaluateA1TechnicalCredibility({
      drawings: {
        plan: [{}, {}],
        elevation: [{}, {}, {}, {}],
        section: [{}, {}],
      },
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
        roofSectionClipQuality: "verified",
        foundationSectionClipQuality: "verified",
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
        sectionFaceCredibilityQuality: "blocked",
        sectionFaceCredibilityScore: 0.18,
        sectionCutFaceTruthCount: 0,
        sectionCutProfileTruthCount: 0,
        sectionAverageProfileContinuity: 0.1,
        sectionFaceBundleVersion: "phase21-section-face-extraction-v1",
        sectionTruthModelVersion: "phase21-section-truth-model-v1",
      },
    });
    expect(credibility.version).toBe("phase21-a1-technical-credibility-v1");
    expect(credibility.status).toBe("block");
    expect(
      credibility.blockers.some((entry) =>
        /cut-face credibility/i.test(String(entry)),
      ),
    ).toBe(true);
    expect(credibility.summary.sectionFaceCredibilityQuality).toBe("blocked");
    expect(credibility.summary.sectionFaceBundleVersion).toBe(
      "phase21-section-face-extraction-v1",
    );
    expect(credibility.summary.sectionCutFaceTruthCount).toBe(0);
    expect(credibility.summary.sectionCutProfileTruthCount).toBe(0);
  });

  test("technical credibility emits weak-warning and cut-profile-only warning when appropriate", () => {
    const credibility = evaluateA1TechnicalCredibility({
      drawings: {
        plan: [{}],
        elevation: [{}, {}, {}, {}],
        section: [{}, {}],
      },
      finalSheetRegression: {
        sectionEvidenceQuality: "verified",
        sectionDirectEvidenceQuality: "verified",
        sectionFaceCredibilityQuality: "weak",
        sectionCutFaceTruthCount: 0,
        sectionCutProfileTruthCount: 3,
        sectionFaceBundleVersion: "phase21-section-face-extraction-v1",
      },
    });
    expect(credibility.version).toBe("phase21-a1-technical-credibility-v1");
    const messages = [...credibility.warnings, ...credibility.blockers];
    expect(
      messages.some((entry) =>
        /cut-face credibility.*weaker|weaker than preferred/i.test(
          String(entry),
        ),
      ),
    ).toBe(true);
    expect(
      messages.some((entry) =>
        /cut-profile truth but no true cut-face truth/i.test(String(entry)),
      ),
    ).toBe(true);
  });

  test("technical credibility blocks weak direct section evidence", () => {
    const credibility = evaluateA1TechnicalCredibility({
      drawings: {
        plan: [{}, {}],
        elevation: [{}, {}, {}, {}],
        section: [{}, {}],
      },
      finalSheetRegression: {
        sectionEvidenceQuality: "weak",
        sectionDirectEvidenceQuality: "weak",
        sectionInferredEvidenceQuality: "verified",
        sideFacadeEvidenceQuality: "verified",
        renderedTextEvidenceQuality: "verified",
      },
    });

    expect(credibility.status).toBe("block");
    expect(
      credibility.blockers.some((entry) =>
        /direct-evidence quality remains weak/i.test(String(entry)),
      ),
    ).toBe(true);
  });

  test("panel regression produces phase21 version tag and aggregate face credibility from section entries", () => {
    const regression = runA1TechnicalPanelRegression({
      drawings: {
        plan: [
          {
            svg: "<svg/>",
            technical_quality_metadata: { section_usefulness_score: 0.8 },
          },
        ],
        elevation: [
          {
            svg: "<svg/>",
            orientation: "north",
            technical_quality_metadata: {},
          },
          {
            svg: "<svg/>",
            orientation: "south",
            technical_quality_metadata: {},
          },
          {
            svg: "<svg/>",
            orientation: "east",
            technical_quality_metadata: {},
          },
          {
            svg: "<svg/>",
            orientation: "west",
            technical_quality_metadata: {},
          },
        ],
        section: [
          {
            svg: "<svg/>",
            section_type: "longitudinal",
            technical_quality_metadata: {
              section_truth_model_version: "phase21-section-truth-model-v1",
              section_face_bundle_version: "phase21-section-face-extraction-v1",
              section_face_credibility_quality: "weak",
              section_face_credibility_score: 0.55,
              section_face_cut_face_count: 0,
              section_face_cut_profile_count: 4,
              section_face_contextual_count: 1,
              section_face_derived_count: 0,
              section_average_construction_profile_continuity: 0.62,
            },
          },
          {
            svg: "<svg/>",
            section_type: "transverse",
            technical_quality_metadata: {
              section_truth_model_version: "phase21-section-truth-model-v1",
              section_face_bundle_version: "phase21-section-face-extraction-v1",
              section_face_credibility_quality: "blocked",
              section_face_credibility_score: 0.12,
              section_face_cut_face_count: 0,
              section_face_cut_profile_count: 0,
              section_face_contextual_count: 2,
              section_face_derived_count: 3,
              section_average_construction_profile_continuity: 0.08,
            },
          },
        ],
      },
    });

    expect(regression.version).toBe("phase21-a1-technical-panel-regression-v1");
    expect(regression.sectionFaceCredibilityQuality).toBe("blocked");
    expect(regression.sectionFaceBundleVersion).toBe(
      "phase21-section-face-extraction-v1",
    );
    expect(regression.sectionCutFaceTruthCount).toBe(0);
    expect(regression.sectionCutProfileTruthCount).toBeGreaterThan(0);
    const sectionEntries = regression.sectionCandidateQuality;
    expect(sectionEntries.length).toBe(2);
    expect(sectionEntries[0].sectionFaceCredibilityQuality).toBe("weak");
    expect(sectionEntries[1].sectionFaceCredibilityQuality).toBe("blocked");
  });

  test("verification bundle exposes phase21 fields and version when face credibility is populated", () => {
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
        roofSectionClipQuality: "verified",
        foundationSectionClipQuality: "verified",
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
        sideFacadeEvidenceQuality: "verified",
        sectionTruthModelVersion: "phase21-section-truth-model-v1",
        sectionFaceCredibilityQuality: "verified",
        sectionFaceCredibilityScore: 0.84,
        sectionCutFaceTruthCount: 6,
        sectionCutProfileTruthCount: 3,
        sectionAverageProfileContinuity: 0.75,
        sectionFaceBundleVersion: "phase21-section-face-extraction-v1",
      },
      technicalCredibility: {
        summary: {
          sectionFaceCredibilityQuality: "verified",
          sectionFaceBundleVersion: "phase21-section-face-extraction-v1",
        },
      },
      publishability: {
        status: "reviewable",
        verificationPhase: "pre_compose",
      },
    });

    expect(verificationBundle.version).toBe("phase21-a1-verification-v1");
    expect(verificationBundle.sectionFaceCredibilityQuality).toBe("verified");
    expect(verificationBundle.sectionFaceCredibilityScore).toBeCloseTo(0.84, 2);
    expect(verificationBundle.sectionCutFaceTruthCount).toBe(6);
    expect(verificationBundle.sectionCutProfileTruthCount).toBe(3);
    expect(verificationBundle.sectionFaceBundleVersion).toBe(
      "phase21-section-face-extraction-v1",
    );
  });

  test("project readiness/plan-a1-panels/project-health responses expose phase21 section face fields", () => {
    const finalSheetRegression = {
      sectionFaceCredibilityQuality: "verified",
      sectionFaceCredibilityScore: 0.82,
      sectionCutFaceTruthCount: 5,
      sectionCutProfileTruthCount: 2,
      sectionAverageProfileContinuity: 0.71,
      sectionFaceBundleVersion: "phase21-section-face-extraction-v1",
      sectionTruthModelVersion: "phase21-section-truth-model-v1",
    };
    const verificationBundle = buildA1VerificationBundle({
      finalSheetRegression,
      publishability: { status: "pass", verificationPhase: "pre_compose" },
    });

    const readiness = buildProjectReadinessResponse({
      result: { ready: true, finalSheetRegression, verificationBundle },
    });
    expect(readiness.sectionTruthModelVersion).toBe(
      "phase21-section-truth-model-v1",
    );

    const plan = buildPlanA1PanelsResponse({
      result: { finalSheetRegression, verificationBundle },
    });
    expect(plan.sectionTruthModelVersion).toBe(
      "phase21-section-truth-model-v1",
    );

    const health = buildProjectHealthResponse({
      result: {
        healthStatus: "pass",
        finalSheetRegression,
        verificationBundle,
      },
    });
    expect(health.sectionTruthModelVersion).toBe(
      "phase21-section-truth-model-v1",
    );

    [readiness, plan, health].forEach((response) => {
      expect(response.verificationBundle.sectionFaceCredibilityQuality).toBe(
        "verified",
      );
      expect(response.verificationBundle.sectionCutFaceTruthCount).toBe(5);
      expect(response.verificationBundle.sectionCutProfileTruthCount).toBe(2);
      expect(response.verificationBundle.sectionFaceBundleVersion).toBe(
        "phase21-section-face-extraction-v1",
      );
      expect(response.verification.sectionFaceCredibilityQuality).toBe(
        "verified",
      );
    });
  });
});

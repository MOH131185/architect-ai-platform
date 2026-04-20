import {
  resetFeatureFlags,
  setFeatureFlag,
} from "../../config/featureFlags.js";
import {
  embedFontInSVG,
  getFontEmbeddingReadinessSync,
} from "../../utils/svgFontEmbedder.js";
import { generateUnifiedSheet } from "../../services/unifiedSheetGenerator.js";
import { buildVisualGenerationPackage } from "../../services/visual/geometryLockedVisualRouter.js";
import { renderPlanSvg } from "../../services/drawing/svgPlanRenderer.js";
import { renderElevationSvg } from "../../services/drawing/svgElevationRenderer.js";
import { renderSectionSvg } from "../../services/drawing/svgSectionRenderer.js";
import { scoreTechnicalPanel } from "../../services/drawing/technicalPanelScoringService.js";
import { evaluateA1ConsistencyGuards } from "../../services/a1/a1ConsistencyGuardService.js";
import { buildA1ComposeBlockingState } from "../../services/a1/a1ComposeBlockingService.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createPhase8Geometry() {
  return {
    project_id: "phase8-a1-tech-recovery",
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
      boundary_polygon: [
        { x: 0, y: 0 },
        { x: 12, y: 0 },
        { x: 12, y: 10 },
        { x: 0, y: 10 },
      ],
      buildable_polygon: [
        { x: 0, y: 0 },
        { x: 12, y: 0 },
        { x: 12, y: 10 },
        { x: 0, y: 10 },
      ],
      north_orientation_deg: 0,
    },
    roof: {
      type: "pitched gable",
    },
    footprints: [
      {
        id: "fp-ground",
        polygon: [
          { x: 0, y: 0 },
          { x: 12, y: 0 },
          { x: 12, y: 10 },
          { x: 0, y: 10 },
        ],
      },
    ],
    levels: [
      {
        id: "ground",
        level_number: 0,
        name: "Ground Floor",
        height_m: 3.2,
        footprint_id: "fp-ground",
      },
      {
        id: "first",
        level_number: 1,
        name: "First Floor",
        height_m: 3.1,
        footprint_id: "fp-ground",
      },
    ],
    rooms: [
      {
        id: "living",
        level_id: "ground",
        name: "Living Room",
        zone: "public",
        polygon: [
          { x: 0, y: 0 },
          { x: 6, y: 0 },
          { x: 6, y: 4 },
          { x: 0, y: 4 },
        ],
        bbox: {
          min_x: 0,
          min_y: 0,
          max_x: 6,
          max_y: 4,
        },
        centroid: { x: 3, y: 2 },
        actual_area: 24,
      },
      {
        id: "kitchen",
        level_id: "ground",
        name: "Kitchen",
        zone: "service",
        polygon: [
          { x: 6, y: 0 },
          { x: 12, y: 0 },
          { x: 12, y: 4 },
          { x: 6, y: 4 },
        ],
        bbox: {
          min_x: 6,
          min_y: 0,
          max_x: 12,
          max_y: 4,
        },
        centroid: { x: 9, y: 2 },
        actual_area: 18,
      },
      {
        id: "bedroom",
        level_id: "first",
        name: "Bedroom 1",
        zone: "private",
        polygon: [
          { x: 0, y: 0 },
          { x: 6, y: 0 },
          { x: 6, y: 4 },
          { x: 0, y: 4 },
        ],
        bbox: {
          min_x: 0,
          min_y: 0,
          max_x: 6,
          max_y: 4,
        },
        centroid: { x: 3, y: 2 },
        actual_area: 16,
      },
    ],
    walls: [
      {
        id: "wall-south-ground",
        level_id: "ground",
        exterior: true,
        orientation: "horizontal",
        start: { x: 0, y: 0 },
        end: { x: 12, y: 0 },
        metadata: { side: "south", features: ["porch", "chimney"] },
      },
      {
        id: "wall-north-ground",
        level_id: "ground",
        exterior: true,
        orientation: "horizontal",
        start: { x: 0, y: 10 },
        end: { x: 12, y: 10 },
        metadata: { side: "north" },
      },
      {
        id: "wall-east-ground",
        level_id: "ground",
        exterior: true,
        orientation: "vertical",
        start: { x: 12, y: 0 },
        end: { x: 12, y: 10 },
        metadata: { side: "east" },
      },
      {
        id: "wall-west-ground",
        level_id: "ground",
        exterior: true,
        orientation: "vertical",
        start: { x: 0, y: 0 },
        end: { x: 0, y: 10 },
        metadata: { side: "west" },
      },
      {
        id: "wall-internal-ground",
        level_id: "ground",
        exterior: false,
        orientation: "vertical",
        start: { x: 6, y: 0 },
        end: { x: 6, y: 4 },
        metadata: {},
      },
      {
        id: "wall-south-first",
        level_id: "first",
        exterior: true,
        orientation: "horizontal",
        start: { x: 0, y: 0 },
        end: { x: 12, y: 0 },
        metadata: { side: "south", features: ["balcony", "dormer"] },
      },
    ],
    doors: [
      {
        id: "front-door",
        level_id: "ground",
        wall_id: "wall-south-ground",
        position_m: { x: 1.2, y: 0 },
        width_m: 1.1,
        head_height_m: 2.2,
      },
    ],
    windows: [
      {
        id: "window-living-1",
        level_id: "ground",
        wall_id: "wall-south-ground",
        position_m: { x: 3.2, y: 0 },
        width_m: 1.5,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
      {
        id: "window-living-2",
        level_id: "ground",
        wall_id: "wall-south-ground",
        position_m: { x: 8.6, y: 0 },
        width_m: 1.5,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
      {
        id: "window-bed-1",
        level_id: "first",
        wall_id: "wall-south-first",
        position_m: { x: 4.5, y: 0 },
        width_m: 1.4,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
    ],
    stairs: [
      {
        id: "main-stair",
        level_id: "ground",
        polygon: [
          { x: 5.2, y: 1.4 },
          { x: 6.8, y: 1.4 },
          { x: 6.8, y: 3.4 },
          { x: 5.2, y: 3.4 },
        ],
        bbox: {
          min_x: 5.2,
          min_y: 1.4,
          max_x: 6.8,
          max_y: 3.4,
        },
        depth_m: 2.8,
      },
    ],
    entrances: [
      {
        id: "main-entry",
        position_m: { x: 1.2, y: 0 },
      },
    ],
    circulation: [
      {
        id: "circulation-ground",
        level_id: "ground",
        polyline: [
          { x: 1, y: 2 },
          { x: 6, y: 2 },
          { x: 10, y: 2 },
        ],
      },
    ],
    metadata: {
      structural_grid: {
        x_axes: [
          { label: "A", position_m: 0 },
          { label: "B", position_m: 6 },
          { label: "C", position_m: 12 },
        ],
        y_axes: [
          { label: "1", position_m: 0 },
          { label: "2", position_m: 5 },
          { label: "3", position_m: 10 },
        ],
      },
      facade_features: {
        south: ["balcony", "porch", "chimney", "dormer"],
      },
    },
  };
}

function createFacadeGrammar() {
  return {
    style_bridge: {
      roof_language: "pitched gable",
      facade_language: "ordered brick bays with timber accents",
      opening_language: "ordered punched openings",
    },
    orientations: [
      {
        side: "south",
        opening_rhythm: {
          opening_count: 5,
        },
        material_zones: [
          { material: "primary facade" },
          { material: "secondary accent" },
        ],
        components: {
          bays: [{ id: "bay-1" }, { id: "bay-2" }, { id: "bay-3" }],
          balconies: [{ id: "balcony-1" }],
          feature_frames: [{ id: "frame-1" }],
        },
        parapet_mode: "none",
      },
    ],
  };
}

describe("Phase 8 A1 technical recovery", () => {
  afterEach(() => {
    resetFeatureFlags();
  });

  test("embeds bundled fonts into final sheet SVG payloads", async () => {
    const embedded = await embedFontInSVG(
      '<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="20">Readable Sheet Text</text></svg>',
    );
    const readiness = getFontEmbeddingReadinessSync();

    expect(embedded).toContain("@font-face");
    expect(embedded).toContain("data:font/ttf;base64,");
    expect(embedded).toContain("ArchiAISans");
    expect(readiness.family).toBe("ArchiAISans");
    expect(readiness.bundledRegularAvailable).toBe(true);
    expect(readiness.bundledBoldAvailable).toBe(true);
    expect(readiness.readyForEmbedding).toBe(true);
    expect(readiness.fullEmbeddingReady).toBe(true);
    expect(readiness.degradedEmbedding).toBe(false);
  });

  test("main unified sheet output is font-embedded before export", async () => {
    const svg = await generateUnifiedSheet(
      {
        designDNA: {
          projectID: "phase8-sheet",
          architecturalStyle: "Contextual Contemporary",
          materials: [
            {
              name: "Brick",
              application: "Facade",
              hexColor: "#B55D4C",
            },
          ],
          dimensions: {
            floorHeights: [3.2, 3.1],
            length: 12,
            width: 10,
            height: 6.3,
          },
          roof: {
            type: "gable",
            pitch: 35,
          },
        },
        visualizations: {},
      },
      {
        buildingProgram: "Phase 8 Residence",
        location: {
          address: "Birmingham, UK",
        },
      },
    );

    expect(typeof svg).toBe("string");
    expect(svg).toContain("@font-face");
    expect(svg).toContain("data:font/ttf;base64,");
    expect(svg).toContain("ArchiAISans");
  });

  test("hero visual package carries canonical material and facade identity", async () => {
    const projectGeometry = createPhase8Geometry();
    const facadeGrammar = createFacadeGrammar();
    setFeatureFlag("useHeroGeneratedLast", true);

    const visualPackage = await buildVisualGenerationPackage(
      projectGeometry,
      {
        facade_language: "ordered brick bays with timber accents",
        roof_language: "pitched gable",
        massing_language: "stepped rectangular massing",
        materials: [
          { role: "primary", name: "Brick", color: "#B55D4C" },
          { role: "secondary", name: "Timber", color: "#9A6A3A" },
          { role: "roof", name: "Slate", color: "#5F6670" },
        ],
      },
      "hero_3d",
      {
        facadeGrammar,
        portfolioStyle: "Warm minimal brick houses",
      },
    );

    expect(visualPackage.prompt).toContain("Primary material:");
    expect(visualPackage.prompt).toContain("Secondary material:");
    expect(visualPackage.prompt).toContain("Roof material:");
    expect(visualPackage.prompt).toContain("Window rhythm:");
    expect(visualPackage.prompt).toContain("Entrance position:");
    expect(visualPackage.prompt).toContain("Portfolio style anchor:");
    expect(
      visualPackage.generationDependencies.heroGeneratedAfterCanonicalInputs,
    ).toBe(true);
    expect(visualPackage.generationDependencies.enforcedByPhase8Flag).toBe(
      true,
    );
    expect(visualPackage.generationDependencies.pipelineOrder).toEqual([
      "canonical_geometry",
      "facade_grammar",
      "material_palette",
      "hero_visual",
    ]);
    expect(visualPackage.identitySpec.primaryMaterial.name).toBe("Brick");
  });

  test("plan renderer fails honestly on empty room geometry", () => {
    const geometry = createPhase8Geometry();
    geometry.rooms = [];

    const result = renderPlanSvg(geometry, { levelId: "ground" });

    expect(result.svg).toBeNull();
    expect(result.status).toBe("blocked");
    expect(result.blocking_reasons[0]).toContain("incomplete");
    expect(result.technical_quality_metadata.geometry_complete).toBe(false);
  });

  test("plan renderer adds readable room labels, areas, and door swings", () => {
    const geometry = createPhase8Geometry();

    const result = renderPlanSvg(geometry, { levelId: "ground" });

    expect(result.svg).toContain("LIVING ROOM");
    expect(result.svg).toContain("KITCHEN");
    expect(result.svg).toContain("M2");
    expect(result.svg).toContain('id="north-arrow"');
    expect(result.technical_quality_metadata.door_swing_count).toBeGreaterThan(
      0,
    );
    expect(result.technical_quality_metadata.has_external_dimensions).toBe(
      true,
    );
    expect(
      result.technical_quality_metadata.plan_density_score,
    ).toBeGreaterThan(0.56);
  });

  test("elevation renderer consumes facade grammar and canonical material palette", () => {
    const geometry = createPhase8Geometry();
    const facadeGrammar = createFacadeGrammar();

    const result = renderElevationSvg(
      geometry,
      {
        roof_language: "pitched gable",
        materials: [
          { role: "primary", name: "Brick", color: "#B55D4C" },
          { role: "secondary", name: "Timber", color: "#9A6A3A" },
          { role: "roof", name: "Slate", color: "#5F6670" },
        ],
      },
      {
        orientation: "south",
        facadeGrammar,
      },
    );

    expect(result.svg).toContain("phase8-elev-brick");
    expect(result.svg).toContain("Elevation - SOUTH");
    expect(
      result.technical_quality_metadata.material_zone_count,
    ).toBeGreaterThan(0);
    expect(result.technical_quality_metadata.ffl_marker_count).toBeGreaterThan(
      0,
    );
    expect(result.technical_quality_metadata.feature_count).toBeGreaterThan(0);
    expect(
      result.technical_quality_metadata.uses_canonical_material_palette,
    ).toBe(true);
  });

  test("elevation renderer fails closed when side-specific geometry is missing", () => {
    const geometry = createPhase8Geometry();
    geometry.walls = geometry.walls.filter(
      (wall) => wall.metadata?.side !== "east",
    );

    const result = renderElevationSvg(
      geometry,
      {
        roof_language: "pitched gable",
      },
      {
        orientation: "east",
      },
    );

    expect(result.svg).toBeNull();
    expect(result.status).toBe("blocked");
    expect(result.blocking_reasons[0]).toContain(
      "lacks enough canonical facade data",
    );
    expect(result.technical_quality_metadata.geometry_source).toBe(
      "envelope_derived",
    );
  });

  test("section renderer adds semantic cut content when geometry supports it", () => {
    const geometry = createPhase8Geometry();

    const result = renderSectionSvg(
      geometry,
      {
        roof_language: "pitched gable",
      },
      {
        sectionType: "longitudinal",
        sectionProfile: {
          cutLine: {
            from: { x: 5.8, y: 0 },
            to: { x: 5.8, y: 10 },
          },
          focusEntityIds: ["main-stair", "living"],
        },
        sectionSemantics: {
          scores: {
            usefulness: 0.86,
          },
        },
      },
    );

    expect(result.svg).toContain("Section - LONGITUDINAL");
    expect(result.svg).toContain("LIVING ROOM");
    expect(result.svg).toContain("STAIR");
    expect(
      result.technical_quality_metadata.foundation_marker_count,
    ).toBeGreaterThan(0);
    expect(result.technical_quality_metadata.stair_tread_count).toBeGreaterThan(
      0,
    );
    expect(result.technical_quality_metadata.section_usefulness_score).toBe(
      0.86,
    );
  });

  test("technical scoring blocks weak technical panels", () => {
    const score = scoreTechnicalPanel({
      drawingType: "plan",
      drawing: {
        title: "Weak Plan",
        svg: null,
        technical_quality_metadata: {
          drawing_type: "plan",
          geometry_complete: false,
          geometry_completeness: 0.2,
          room_count: 0,
          room_label_count: 0,
          plan_density_score: 0.1,
          annotation_guarantee: false,
        },
      },
      readability: {
        score: 0.22,
        warnings: ["Text is too faint."],
      },
      annotation: {
        warnings: ["Labels overlap."],
      },
      annotationPlacement: {
        placementStable: false,
        warnings: ["Fallback placement exhausted."],
      },
    });

    expect(score.verdict).toBe("block");
    expect(score.blocking).toBe(true);
    expect(
      score.blockers.some(
        (entry) =>
          entry.includes("plan density") || entry.includes("technical score"),
      ),
    ).toBe(true);
  });

  test("compose blocking fails closed on stale technical panels and identity drift", () => {
    const blocking = buildA1ComposeBlockingState({
      projectGeometry: createPhase8Geometry(),
      validationReport: {
        status: "valid_with_warnings",
      },
      freshness: {
        stalePanels: [{ id: "floor-plan-ground" }],
        missingAssets: [],
      },
      technicalPanelGate: {
        technicalReady: false,
        blockingReasons: ["Plan readability below threshold."],
      },
      consistencyGuard: {
        consistencyReady: false,
        blockingReasons: ["Hero identity drift detected for roofLanguage."],
      },
      fontReadiness: {
        readyForEmbedding: false,
      },
    });

    expect(blocking.composeReady).toBe(false);
    expect(blocking.blockingReasons).toContain(
      "Plan readability below threshold.",
    );
    expect(blocking.blockingReasons).toContain(
      "Hero identity drift detected for roofLanguage.",
    );
    expect(blocking.blockingReasons).toContain(
      "Bundled A1 font embedding is unavailable; final sheet text cannot be rasterized safely.",
    );
    expect(blocking.recoverableIssues).toContain(
      "Regenerate stale panel sources before compose.",
    );
  });

  test("consistency guard emits blockers and warnings on obvious hero drift", () => {
    const geometry = createPhase8Geometry();
    const facadeGrammar = createFacadeGrammar();
    const visualPackage = {
      identitySpec: {
        storeyCount: 1,
        roofLanguage: "flat parapet",
        windowRhythm: "irregular sparse openings",
        entrancePosition: "rear facade",
        primaryMaterial: { name: "Concrete" },
        roofMaterial: { name: "Metal" },
      },
    };

    const result = evaluateA1ConsistencyGuards({
      projectGeometry: geometry,
      visualPackage,
      facadeGrammar,
    });

    expect(result.consistencyReady).toBe(false);
    expect(
      result.blockingReasons.some((entry) => entry.includes("storeyCount")),
    ).toBe(true);
    expect(
      result.blockingReasons.some((entry) => entry.includes("roofLanguage")),
    ).toBe(true);
    expect(result.heroVsCanonicalWarnings.length).toBeGreaterThan(0);
  });

  test("consistency guard warns when hero identity metadata is missing", () => {
    const geometry = createPhase8Geometry();
    const facadeGrammar = createFacadeGrammar();
    const visualPackage = {
      identitySpec: {
        storeyCount: 2,
      },
    };

    const result = evaluateA1ConsistencyGuards({
      projectGeometry: geometry,
      visualPackage,
      facadeGrammar,
    });

    expect(result.consistencyReady).toBe(true);
    expect(
      result.heroVsCanonicalWarnings.some((entry) =>
        entry.includes("roofLanguage"),
      ),
    ).toBe(true);
    expect(
      result.heroVsCanonicalWarnings.some((entry) =>
        entry.includes("windowRhythm"),
      ),
    ).toBe(true);
  });
});

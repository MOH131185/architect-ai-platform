import {
  buildProjectGraphVerticalSliceRequest,
  normalizeProjectGraphDrawingArtifacts,
  sanitizeProjectGraphPanelMap,
  sanitizeProjectGraphSvg,
} from "../../hooks/useArchitectAIWorkflow.js";
import {
  PIPELINE_MODE,
  getCurrentPipelineMode,
} from "../../config/pipelineMode.js";
import { resolveWorkflowByMode } from "../../services/workflowRouter.js";
import fs from "fs";
import path from "path";

describe("buildProjectGraphVerticalSliceRequest", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test("defaults the browser workflow to the ProjectGraph vertical-slice endpoint", () => {
    delete process.env.REACT_APP_PIPELINE_MODE;
    delete process.env.PIPELINE_MODE;

    expect(getCurrentPipelineMode()).toBe(PIPELINE_MODE.PROJECT_GRAPH);
    expect(resolveWorkflowByMode()).toEqual({
      mode: PIPELINE_MODE.PROJECT_GRAPH,
      workflowKey: "project_graph_vertical_slice",
    });

    const hookSource = fs.readFileSync(
      path.join(process.cwd(), "src/hooks/useArchitectAIWorkflow.js"),
      "utf8",
    );
    expect(hookSource).toContain('"/api/project/generate-vertical-slice"');
  });

  test("strips binary portfolio and map snapshot data before ProjectGraph POST", () => {
    const largeImage = `data:image/png;base64,${"a".repeat(900_000)}`;
    const request = buildProjectGraphVerticalSliceRequest({
      designSpec: {
        buildingCategory: "residential",
        buildingSubType: "detached-house",
        area: 150,
        floorCount: 2,
        floorCountLocked: true,
        sitePolygon: [
          { lat: 52.483, lng: -1.893 },
          { lat: 52.483, lng: -1.892 },
          { lat: 52.482, lng: -1.892 },
        ],
        siteMetrics: { areaM2: 147, orientationDeg: 10 },
        programSpaces: [
          {
            name: "Living Room",
            area: 24,
            levelIndex: 0,
            dataUrl: largeImage,
            notes: "a".repeat(700),
          },
        ],
        portfolioBlend: {
          materialWeight: 0.6,
          portfolioFiles: [
            {
              name: "portfolio.png",
              type: "image/png",
              size: largeImage.length,
              dataUrl: largeImage,
              preview: largeImage,
              file: { shouldNeverSerialize: true },
            },
          ],
        },
        v2Bundle: {
          compiledProject: {
            huge: largeImage,
          },
        },
      },
      siteSnapshot: {
        dataUrl: largeImage,
        sha256: "snapshot-hash",
        center: { lat: 52.483, lng: -1.893 },
        size: { width: 640, height: 400 },
        metadata: { siteMetrics: { areaM2: 147 } },
      },
    });

    const serialized = JSON.stringify(request);

    expect(serialized).not.toContain("data:image");
    expect(serialized).not.toContain("shouldNeverSerialize");
    expect(request.siteSnapshot.dataUrl).toBeNull();
    expect(request.siteSnapshot.metadata.dataUrlOmitted).toBe(true);
    expect(serialized.length).toBeLessThan(20_000);
    expect(request.siteSnapshot.sha256).toBe("snapshot-hash");
    expect(request.siteMetrics.areaM2).toBe(147);
    expect(request.projectDetails.floorCount).toBe(2);
    expect(request.projectDetails.floorCountLocked).toBe(true);
    expect(request.brief.target_storeys).toBe(2);
    expect(request.programSpaces[0].notes).toHaveLength(500);
    expect(request.portfolioBlend.portfolioFiles[0]).toEqual({
      name: "portfolio.png",
      type: "image/png",
      size: largeImage.length,
      convertedFromPdf: false,
    });
  });

  test("raises unlocked 250 sqm detached-house payloads to two storeys", () => {
    const request = buildProjectGraphVerticalSliceRequest({
      designSpec: {
        buildingCategory: "residential",
        buildingSubType: "detached-house",
        buildingType: "detached-house",
        area: 250,
        targetAreaM2: 250,
        floorCount: 1,
        autoDetectedFloorCount: 1,
        floorCountLocked: false,
      },
    });

    expect(request.projectDetails.floorCount).toBe(2);
    expect(request.brief.target_storeys).toBe(2);
    expect(request.brief.targetStoreys).toBe(2);
  });

  test.each([
    ["office", "commercial", "office", "office_studio", "production"],
    ["school", "education", "school", "education_studio", "beta"],
    ["clinic", "healthcare", "clinic", "clinic", "production"],
    ["hospital", "healthcare", "hospital", "hospital", "beta"],
  ])(
    "preserves %s selection and posts canonical ProjectGraph building_type",
    (_label, category, subType, canonicalBuildingType, supportStatus) => {
      const request = buildProjectGraphVerticalSliceRequest({
        designSpec: {
          buildingCategory: category,
          buildingSubType: subType,
          area: 480,
          floorCount: 2,
          floorCountLocked: true,
        },
      });

      expect(request.projectDetails.category).toBe(category);
      expect(request.projectDetails.subType).toBe(subType);
      expect(request.projectDetails.canonicalBuildingType).toBe(
        canonicalBuildingType,
      );
      expect(request.projectDetails.buildingType).toBe(canonicalBuildingType);
      expect(request.projectDetails.projectTypeRoute).toBe("project_graph");
      expect(request.projectDetails.supportStatus).toBe(supportStatus);
      expect(request.projectDetails.programmeTemplateKey).toBe(
        canonicalBuildingType,
      );
      expect(request.brief.building_type).toBe(canonicalBuildingType);
      expect(request.brief.canonical_building_type).toBe(canonicalBuildingType);
      expect(request.brief.original_category).toBe(category);
      expect(request.brief.original_subtype).toBe(subType);
      expect(request.brief.project_type_route).toBe("project_graph");
      expect(request.brief.support_status).toBe(supportStatus);
    },
  );

  test("preserves a compact provided site map data URL for ProjectGraph site context", () => {
    const mapDataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR42mNk+M9Qz0AEYBxVSFIAAAeSAi8BTyQ1AAAAAElFTkSuQmCC";
    const request = buildProjectGraphVerticalSliceRequest({
      designSpec: {
        buildingCategory: "community",
        buildingSubType: "reading-room",
        area: 320,
        floorCount: 2,
      },
      siteSnapshot: {
        dataUrl: mapDataUrl,
        sha256: "snapshot-hash",
        center: { lat: 52.483, lng: -1.893 },
        sourceUrl: "provided-site-snapshot",
        attribution: "Provided site map",
      },
    });

    expect(request.siteSnapshot.dataUrl).toBe(mapDataUrl);
    expect(request.siteSnapshot.sourceUrl).toBe("provided-site-snapshot");
    expect(JSON.stringify(request).length).toBeLessThan(20_000);
  });

  test("propagates reference-match A1 intent through the ProjectGraph POST payload", () => {
    const request = buildProjectGraphVerticalSliceRequest({
      referenceMatch: true,
      designSpec: {
        buildingCategory: "residential",
        buildingSubType: "detached-house",
        projectName: "17 Kensington Road House",
        area: 75,
        autoDetectedFloorCount: 1,
        floorCountLocked: false,
      },
    });

    expect(request.referenceMatch).toBe(true);
    expect(request.reference_match).toBe(true);
    expect(request.renderIntent).toBe("reference_match_a1");
    expect(request.qualityTarget).toBe("reference_match");
    expect(request.brief.reference_match).toBe(true);
    expect(request.projectDetails.autoDetectedFloorCount).toBe(1);
  });

  test("drops malformed site polygon coordinates before ProjectGraph POST", () => {
    const request = buildProjectGraphVerticalSliceRequest({
      designSpec: {
        buildingCategory: "residential",
        buildingSubType: "detached-house",
        area: 150,
        floorCount: 2,
        sitePolygon: [
          { lat: 52.483, lng: -1.893 },
          { lat: ["bad"], lng: -1.892 },
          { lat: 52.482, lng: -1.892 },
        ],
      },
      siteSnapshot: {
        polygon: [
          { lat: 52.483, lng: -1.893 },
          { lat: 52.483, lng: -1.892 },
          { lat: 52.482, lng: -1.892 },
        ],
      },
    });

    expect(request.sitePolygon).toEqual([
      { lat: 52.483, lng: -1.893 },
      { lat: 52.483, lng: -1.892 },
      { lat: 52.482, lng: -1.892 },
    ]);
  });

  test("keeps building footprint contextual when site boundary is estimated", () => {
    const estimatedBoundary = [
      { lat: 53.591, lng: -0.689 },
      { lat: 53.591, lng: -0.687 },
      { lat: 53.59, lng: -0.687 },
    ];
    const buildingFootprint = [
      { lat: 53.5908, lng: -0.6886 },
      { lat: 53.5908, lng: -0.6882 },
      { lat: 53.5905, lng: -0.6882 },
    ];

    const request = buildProjectGraphVerticalSliceRequest({
      designSpec: {
        buildingCategory: "residential",
        buildingSubType: "detached-house",
        area: 250,
        floorCount: 2,
        location: {
          address: "17 Kensington Road",
          coordinates: { lat: 53.591237, lng: -0.688325 },
          boundaryAuthoritative: false,
          boundaryEstimated: true,
          estimatedSiteBoundary: estimatedBoundary,
          buildingFootprint,
          siteAnalysis: {
            boundarySource: "Intelligent Fallback",
            boundaryConfidence: 0.4,
            boundaryAuthoritative: false,
            boundaryEstimated: true,
            estimatedOnly: true,
            estimatedSiteBoundary: estimatedBoundary,
          },
        },
        sitePolygon: buildingFootprint,
        siteMetrics: {
          areaM2: 65,
          source: "google_building_outline",
        },
      },
      siteSnapshot: {
        sitePolygon: estimatedBoundary,
        mapType: "roadmap",
        drawPolygonOverlay: false,
        metadata: {
          sitePlanMode: "contextual_estimated_boundary",
          boundaryAuthoritative: false,
          boundaryEstimated: true,
          contextualBoundaryOverlayUsed: true,
          contextualBoundaryPolygon: estimatedBoundary,
        },
      },
    });

    expect(request.sitePolygon).toEqual([]);
    expect(request.siteSnapshot.sitePolygon).toEqual(estimatedBoundary);
    expect(request.siteSnapshot.mapType).toBe("roadmap");
    expect(request.siteSnapshot.drawPolygonOverlay).toBe(false);
    expect(request.siteSnapshot.metadata.sitePlanMode).toBe(
      "contextual_estimated_boundary",
    );
    expect(request.siteSnapshot.metadata.boundaryAuthoritative).toBe(false);
    expect(request.siteSnapshot.metadata.boundaryEstimated).toBe(true);
    expect(request.siteSnapshot.metadata.contextualBoundaryOverlayUsed).toBe(
      true,
    );
    expect(request.siteSnapshot.metadata.contextualBoundaryPolygon).toEqual(
      estimatedBoundary,
    );
    expect(request.siteMetrics.areaM2).toBeUndefined();
    expect(request.siteMetrics.boundaryAuthoritative).toBe(false);
    expect(request.locationData.boundaryAuthoritative).toBe(false);
    expect(request.locationData.boundaryEstimated).toBe(true);
    expect(request.locationData.estimatedSiteBoundary).toEqual(
      estimatedBoundary,
    );
    expect(request.locationData.buildingFootprint).toEqual(buildingFootprint);
    expect(request.locationData.siteAnalysis.boundarySource).toBe(
      "Intelligent Fallback",
    );
  });

  test("normalizes ProjectGraph drawing artifact maps before panel mapping", () => {
    const drawingMap = {
      "asset-ground": {
        asset_id: "asset-ground",
        panel_type: "floor_plan_ground",
        svgString: "<svg />",
      },
      "asset-north": {
        asset_id: "asset-north",
        panel_type: "elevation_north",
        svgString: "<svg />",
      },
    };

    expect(normalizeProjectGraphDrawingArtifacts(drawingMap)).toEqual([
      drawingMap["asset-ground"],
      drawingMap["asset-north"],
    ]);
    expect(
      normalizeProjectGraphDrawingArtifacts({
        drawings: [drawingMap["asset-ground"]],
      }),
    ).toEqual([drawingMap["asset-ground"]]);
    expect(normalizeProjectGraphDrawingArtifacts(null)).toEqual([]);
  });

  test("removes invalid SVG path data before browser rendering", () => {
    const svg = `
      <svg>
        <path d="undefined" stroke="red" />
        <path d=undefined stroke="orange" />
        <path d='null' stroke="purple"></path>
        <path d="L 0 0 L 10 10" stroke="pink" />
        <path d="M 0 0 L 10 10" stroke="black" />
        <path d="m 1 1 l 2 2" stroke="green" />
        <path d="M 0 NaN L 5 5" stroke="blue"></path>
      </svg>
    `;

    const sanitized = sanitizeProjectGraphSvg(svg);

    expect(sanitized).not.toContain('d="undefined"');
    expect(sanitized).not.toContain("d=undefined");
    expect(sanitized).not.toContain("d='null'");
    expect(sanitized).not.toContain('d="L 0 0 L 10 10"');
    expect(sanitized).not.toContain("NaN");
    expect(sanitized).toContain('d="M 0 0 L 10 10"');
    expect(sanitized).toContain('d="m 1 1 l 2 2"');
  });

  test("sanitizes ProjectGraph server panelMap SVG URLs before gallery rendering", () => {
    const badSvg =
      '<svg><path d="undefined" stroke="red" /><path d="M 0 0 L 10 10" /></svg>';
    const encodedBadSvg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      badSvg,
    )}`;

    const sanitized = sanitizeProjectGraphPanelMap({
      floor_plan_ground: {
        url: encodedBadSvg,
        dataUrl: encodedBadSvg,
        svgString: badSvg,
      },
    });

    const panel = sanitized.floor_plan_ground;
    expect(panel.svgString).not.toContain('d="undefined"');
    expect(decodeURIComponent(panel.url.split(",")[1])).not.toContain(
      'd="undefined"',
    );
    expect(decodeURIComponent(panel.dataUrl.split(",")[1])).not.toContain(
      'd="undefined"',
    );
    expect(panel.svgString).toContain('d="M 0 0 L 10 10"');
  });

  test("level authority: 'Second' string with no levelIndex maps to levelIndex 2 in a 3-floor brief", () => {
    const request = buildProjectGraphVerticalSliceRequest({
      designSpec: {
        buildingCategory: "residential",
        buildingSubType: "detached-house",
        area: 200,
        floorCount: 3,
        floorCountLocked: true,
        programSpaces: [
          { name: "Hall", area: 10, count: 1, level: "Ground" },
          { name: "Bed", area: 18, count: 1, level: "First" },
          { name: "Study", area: 12, count: 1, level: "Second" },
        ],
      },
    });

    expect(request.projectDetails.floorCount).toBe(3);
    expect(request.brief.target_storeys).toBe(3);
    const [hall, bed, study] = request.programSpaces;
    expect(hall).toMatchObject({
      level: "Ground",
      levelIndex: 0,
      level_index: 0,
    });
    expect(bed).toMatchObject({
      level: "First",
      levelIndex: 1,
      level_index: 1,
    });
    expect(study).toMatchObject({
      level: "Second",
      levelIndex: 2,
      level_index: 2,
    });
  });

  test("level authority: floorCount 2 clamps a 'Second' row down to First (no out-of-range index)", () => {
    const request = buildProjectGraphVerticalSliceRequest({
      designSpec: {
        buildingCategory: "residential",
        buildingSubType: "detached-house",
        area: 120,
        floorCount: 2,
        programSpaces: [
          { name: "Hall", area: 10, count: 1, level: "Ground" },
          { name: "Bed", area: 18, count: 1, level: "Second" },
        ],
      },
    });

    expect(request.projectDetails.floorCount).toBe(2);
    expect(request.brief.target_storeys).toBe(2);
    expect(request.programSpaces[1].levelIndex).toBe(1);
    expect(request.programSpaces[1].level).toBe("First");
  });

  test("level authority: explicit numeric levelIndex wins over string label", () => {
    const request = buildProjectGraphVerticalSliceRequest({
      designSpec: {
        buildingCategory: "residential",
        buildingSubType: "detached-house",
        area: 200,
        floorCount: 3,
        programSpaces: [
          { name: "Bed", area: 14, count: 1, levelIndex: 2, level: "Ground" },
        ],
      },
    });
    expect(request.programSpaces[0].levelIndex).toBe(2);
    expect(request.programSpaces[0].level).toBe("Second");
  });

  test("level authority: unlocked + autoDetectedFloorCount=3 propagates as target_storeys=3 even when floorCount is stale", () => {
    const request = buildProjectGraphVerticalSliceRequest({
      designSpec: {
        buildingCategory: "residential",
        buildingSubType: "detached-house",
        area: 200,
        floorCount: 2,
        floorCountLocked: false,
        autoDetectedFloorCount: 3,
        programSpaces: [
          { name: "Hall", area: 8, count: 1, level: "Ground" },
          { name: "Stair", area: 4, count: 1, level: "Ground" },
          { name: "Bed", area: 30, count: 1, level: "First" },
          { name: "Stair", area: 4, count: 1, level: "First" },
          { name: "Bed", area: 30, count: 1, level: "Second" },
          { name: "Stair", area: 4, count: 1, level: "Second" },
        ],
      },
    });
    expect(request.brief.target_storeys).toBe(3);
    const indices = request.programSpaces
      .map((s) => Number(s.levelIndex))
      .sort((a, b) => a - b);
    expect(indices).toEqual([0, 0, 1, 1, 2, 2]);
  });

  test("level authority: locked floorCount=3 wins over a lower autoDetectedFloorCount", () => {
    const request = buildProjectGraphVerticalSliceRequest({
      designSpec: {
        buildingCategory: "residential",
        buildingSubType: "detached-house",
        area: 200,
        floorCount: 3,
        floorCountLocked: true,
        autoDetectedFloorCount: 2,
        programSpaces: [
          { name: "Hall", area: 8, count: 1, level: "Ground" },
          { name: "Bed", area: 30, count: 1, level: "First" },
          { name: "Bed", area: 30, count: 1, level: "Second" },
        ],
      },
    });
    expect(request.brief.target_storeys).toBe(3);
    expect(request.projectDetails.floorCount).toBe(3);
    expect(request.projectDetails.floorCountLocked).toBe(true);
  });

  test("level authority: stale brief target_storeys cannot override current projectDetails", () => {
    const request = buildProjectGraphVerticalSliceRequest({
      designSpec: {
        buildingCategory: "residential",
        buildingSubType: "detached-house",
        area: 200,
        floorCount: 3,
        floorCountLocked: true,
        brief: {
          target_gia_m2: 200,
          target_storeys: 2,
          building_type: "detached-house",
        },
        programSpaces: [
          { name: "Hall", area: 8, count: 1, level: "Ground" },
          { name: "Bed", area: 30, count: 1, level: "First" },
          { name: "Study", area: 18, count: 1, level: "Second" },
        ],
      },
    });

    expect(request.projectDetails.floorCount).toBe(3);
    expect(request.brief.target_storeys).toBe(3);
    expect(
      request.programSpaces.map((space) => space.levelIndex).sort(),
    ).toEqual([0, 1, 2]);
  });
});

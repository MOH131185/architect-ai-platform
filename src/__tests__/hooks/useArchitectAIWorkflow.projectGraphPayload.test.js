import {
  buildProjectGraphVerticalSliceRequest,
  normalizeProjectGraphDrawingArtifacts,
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
        <path d="M 0 0 L 10 10" stroke="black" />
        <path d="M 0 NaN L 5 5" stroke="blue"></path>
      </svg>
    `;

    const sanitized = sanitizeProjectGraphSvg(svg);

    expect(sanitized).not.toContain('d="undefined"');
    expect(sanitized).not.toContain("NaN");
    expect(sanitized).toContain('d="M 0 0 L 10 10"');
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

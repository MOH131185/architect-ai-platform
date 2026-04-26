import {
  buildProjectGraphVerticalSliceRequest,
  normalizeProjectGraphDrawingArtifacts,
} from "../../hooks/useArchitectAIWorkflow.js";

describe("buildProjectGraphVerticalSliceRequest", () => {
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
    expect(serialized).not.toContain('"dataUrl"');
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
    expect(normalizeProjectGraphDrawingArtifacts({ drawings: [drawingMap["asset-ground"]] })).toEqual([
      drawingMap["asset-ground"],
    ]);
    expect(normalizeProjectGraphDrawingArtifacts(null)).toEqual([]);
  });
});

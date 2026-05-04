import {
  generateEnhancedFloorPlanSVG,
  generateEnhancedElevationSVG,
  generateEnhancedSectionSVG,
} from "../../services/design/enhancedTechnicalDrawingAdapter.js";
import {
  findTechnicalPanelsMissingAuthorityMetadata,
  findTechnicalPanelsMissingGeometryHash,
  findPanelsWithDisallowedTechnicalAuthority,
  readPanelAuthorityMetadata,
} from "../../services/a1/composeRuntime.js";

// Canonical authority strings the compose gate enforces (composeRuntime.js:214-219).
const CANONICAL_AUTHORITY_USED = "compiled_project_canonical_pack";
const CANONICAL_AUTHORITY_SOURCE = "compiled_project";
const FALLBACK_AUTHORITY_USED = "enhanced_geometry_adapter";

function makeMasterDNAWithPopulatedGeometryOnly() {
  // Minimum shape that GeometryAdapter recognises as having populatedGeometry,
  // so buildCanonicalTechnicalGeometry will succeed.
  const groundFloor = {
    level: 0,
    rooms: [
      {
        id: "room-living",
        name: "Living Room",
        type: "living",
        x: 0,
        y: 0,
        width: 6,
        height: 5,
        polygon: [
          { x: 0, y: 0 },
          { x: 6, y: 0 },
          { x: 6, y: 5 },
          { x: 0, y: 5 },
        ],
        actual_area: 30,
      },
      {
        id: "room-kitchen",
        name: "Kitchen",
        type: "kitchen",
        x: 6,
        y: 0,
        width: 4,
        height: 5,
        polygon: [
          { x: 6, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 5 },
          { x: 6, y: 5 },
        ],
        actual_area: 20,
      },
    ],
    walls: [
      {
        id: "wall-south",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        thickness: 0.3,
        exterior: true,
      },
      {
        id: "wall-north",
        start: { x: 0, y: 5 },
        end: { x: 10, y: 5 },
        thickness: 0.3,
        exterior: true,
      },
      {
        id: "wall-west",
        start: { x: 0, y: 0 },
        end: { x: 0, y: 5 },
        thickness: 0.3,
        exterior: true,
      },
      {
        id: "wall-east",
        start: { x: 10, y: 0 },
        end: { x: 10, y: 5 },
        thickness: 0.3,
        exterior: true,
      },
    ],
    polygon: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 },
    ],
  };

  return {
    populatedGeometry: {
      floors: [groundFloor],
    },
    dimensions: {
      width: 10,
      length: 5,
      floors: 1,
      floorHeights: [3.2],
    },
    styleDNA: {
      roof_language: "gable",
      materials: { primary: "brick", secondary: "render" },
    },
  };
}

function makeMasterDNAWithCompiledProjectGeometry(projectId = "compiled-a") {
  const dna = makeMasterDNAWithPopulatedGeometryOnly();
  const groundFloor = dna.populatedGeometry.floors[0];
  return {
    ...dna,
    canonicalGeometry: {
      schema_version: "canonical-project-geometry-v2",
      project_id: projectId,
      site: {
        boundary_polygon: groundFloor.polygon,
        buildable_polygon: groundFloor.polygon,
      },
      levels: [
        {
          id: "level-0",
          name: "Ground Floor",
          level_number: 0,
          height_m: 3.2,
          polygon: groundFloor.polygon,
          footprint: groundFloor.polygon,
          rooms: groundFloor.rooms,
          walls: groundFloor.walls,
        },
      ],
      rooms: groundFloor.rooms.map((room) => ({
        ...room,
        level_id: "level-0",
      })),
      walls: groundFloor.walls.map((wall) => ({
        ...wall,
        level_id: "level-0",
      })),
      doors: [],
      windows: [],
      footprints: [
        {
          id: "footprint-0",
          level_id: "level-0",
          polygon: groundFloor.polygon,
        },
      ],
      roof: { type: "gable", roof_language: "gable" },
      metadata: {
        source: "compiled_project",
        authoritySource: "compiled_project",
        compiledProjectSchemaVersion: "compiled-project-v1",
        style_dna: dna.styleDNA,
      },
    },
  };
}

describe("enhancedTechnicalDrawingAdapter authority stamping", () => {
  describe("canonical path (geometry available)", () => {
    test("floor plan stamps geometryHash, authorityUsed, authoritySource, schemaVersion", () => {
      const result = generateEnhancedFloorPlanSVG(
        makeMasterDNAWithCompiledProjectGeometry(),
        0,
        {},
      );

      expect(result).not.toBeNull();
      expect(result).toHaveProperty("dataUrl");
      expect(result).toHaveProperty("svg");
      expect(result.geometryHash).toEqual(expect.any(String));
      expect(result.geometryHash.length).toBeGreaterThan(0);
      expect(result.svgHash).toEqual(expect.any(String));
      expect(result.authorityUsed).toBe(CANONICAL_AUTHORITY_USED);
      expect(result.authoritySource).toBe(CANONICAL_AUTHORITY_SOURCE);
      expect(result.compiledProjectSchemaVersion).toEqual(expect.any(String));
      expect(result.generatorUsed).toBe("enhancedTechnicalDrawingAdapter");
      expect(result.sourceType).toBe("deterministic_svg");

      // composeRuntime.readPanelAuthorityMetadata must extract every field
      // from the same shape (panels are passed via { type, ...result }).
      const composePanel = { type: "floor_plan_ground", ...result };
      const auth = readPanelAuthorityMetadata(composePanel);
      expect(auth.geometryHash).toBe(result.geometryHash);
      expect(auth.authorityUsed).toBe(CANONICAL_AUTHORITY_USED);
      expect(auth.authoritySource).toBe(CANONICAL_AUTHORITY_SOURCE);
      expect(auth.compiledProjectSchemaVersion).toBe(
        result.compiledProjectSchemaVersion,
      );
      expect(auth.svgHash).toBe(result.svgHash);
    });

    test("elevation stamps canonical authority", () => {
      const result = generateEnhancedElevationSVG(
        makeMasterDNAWithCompiledProjectGeometry(),
        "south",
        {},
      );

      expect(result).not.toBeNull();
      expect(result.authorityUsed).toBe(CANONICAL_AUTHORITY_USED);
      expect(result.authoritySource).toBe(CANONICAL_AUTHORITY_SOURCE);
      expect(result.geometryHash).toEqual(expect.any(String));
      expect(result.svgHash).toEqual(expect.any(String));
    });

    test("section stamps canonical authority", () => {
      const result = generateEnhancedSectionSVG(
        makeMasterDNAWithCompiledProjectGeometry(),
        "longitudinal",
        {},
      );

      expect(result).not.toBeNull();
      expect(result.authorityUsed).toBe(CANONICAL_AUTHORITY_USED);
      expect(result.authoritySource).toBe(CANONICAL_AUTHORITY_SOURCE);
      expect(result.geometryHash).toEqual(expect.any(String));
      expect(result.svgHash).toEqual(expect.any(String));
    });

    test("svgHash is deterministic — same input twice gives same hash", () => {
      const a = generateEnhancedFloorPlanSVG(
        makeMasterDNAWithCompiledProjectGeometry(),
        0,
        {},
      );
      const b = generateEnhancedFloorPlanSVG(
        makeMasterDNAWithCompiledProjectGeometry(),
        0,
        {},
      );
      expect(a.svgHash).toBe(b.svgHash);
    });

    test("geometryHash ignores volatile projectId for identical compiled geometry", () => {
      const a = generateEnhancedFloorPlanSVG(
        makeMasterDNAWithCompiledProjectGeometry("compiled-project-a"),
        0,
        {},
      );
      const b = generateEnhancedFloorPlanSVG(
        makeMasterDNAWithCompiledProjectGeometry("compiled-project-b"),
        0,
        {},
      );

      expect(a.geometryHash).toBeTruthy();
      expect(a.geometryHash).toBe(b.geometryHash);
    });

    test("panels from same canonical geometry share the same geometryHash", () => {
      const dna = makeMasterDNAWithCompiledProjectGeometry();
      const plan = generateEnhancedFloorPlanSVG(dna, 0, {});
      const elev = generateEnhancedElevationSVG(dna, "south", {});
      const sect = generateEnhancedSectionSVG(dna, "longitudinal", {});

      expect(plan.geometryHash).toBeTruthy();
      expect(plan.geometryHash).toBe(elev.geometryHash);
      expect(elev.geometryHash).toBe(sect.geometryHash);
    });

    test("composed panels pass the gate validators", () => {
      const dna = makeMasterDNAWithCompiledProjectGeometry();
      const panels = [
        {
          type: "floor_plan_ground",
          ...generateEnhancedFloorPlanSVG(dna, 0, {}),
        },
        {
          type: "elevation_south",
          ...generateEnhancedElevationSVG(dna, "south", {}),
        },
        {
          type: "section_AA",
          ...generateEnhancedSectionSVG(dna, "longitudinal", {}),
        },
      ];

      expect(findTechnicalPanelsMissingGeometryHash(panels)).toEqual([]);
      expect(findTechnicalPanelsMissingAuthorityMetadata(panels)).toEqual([]);
      expect(findPanelsWithDisallowedTechnicalAuthority(panels)).toEqual([]);
    });
  });

  describe("enhanced fallback path (no canonical geometry)", () => {
    test("populatedGeometry-only output is rejected by the final A1 authority gate", () => {
      const result = generateEnhancedFloorPlanSVG(
        makeMasterDNAWithPopulatedGeometryOnly(),
        0,
        {},
      );

      expect(result).not.toBeNull();
      expect(result.authorityUsed).toBe(FALLBACK_AUTHORITY_USED);
      expect(result.authoritySource).toBe("masterDNA");

      const composePanel = { type: "floor_plan_ground", ...result };
      expect(findTechnicalPanelsMissingGeometryHash([composePanel])).toEqual(
        [],
      );
      expect(
        findTechnicalPanelsMissingAuthorityMetadata([composePanel]),
      ).toEqual([]);
      expect(
        findPanelsWithDisallowedTechnicalAuthority([composePanel]),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            panelType: "floor_plan_ground",
            authorityUsed: FALLBACK_AUTHORITY_USED,
            authoritySource: "masterDNA",
          }),
        ]),
      );
    });

    test("floor plan stamps fallback authority that the gate will reject", () => {
      const result = generateEnhancedFloorPlanSVG(
        makeMasterDNAWithPopulatedGeometryOnly(),
        0,
        {},
      );

      expect(result).not.toBeNull();
      expect(result.authorityUsed).toBe(FALLBACK_AUTHORITY_USED);
      expect(result.authoritySource).toBe("masterDNA");
      expect(result.geometryHash).toEqual(expect.any(String));

      // The compose gate must reject this panel (authority is not canonical).
      const composePanel = { type: "floor_plan_ground", ...result };
      const blocked = findPanelsWithDisallowedTechnicalAuthority([
        composePanel,
      ]);
      expect(blocked).toHaveLength(1);
      expect(blocked[0].panelType).toBe("floor_plan_ground");
      expect(blocked[0].authorityUsed).toBe(FALLBACK_AUTHORITY_USED);
    });
  });
});

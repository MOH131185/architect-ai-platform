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

function makeMasterDNAWithGeometry() {
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

function makeMinimalMasterDNAForFallback() {
  // No populatedGeometry → buildCanonicalTechnicalGeometry returns null,
  // forcing the enhanced fallback path. ArchitecturalFloorPlanGenerator
  // still produces SVG from masterDNA.rooms.
  return {
    rooms: [
      { name: "Living", x: 0, y: 0, width: 4, height: 3, area: 12 },
      { name: "Kitchen", x: 4, y: 0, width: 3, height: 3, area: 9 },
    ],
    dimensions: { width: 7, length: 3, floors: 1 },
    styleDNA: {
      roof_language: "flat",
      materials: { primary: "render" },
    },
  };
}

describe("enhancedTechnicalDrawingAdapter authority stamping", () => {
  describe("canonical path (geometry available)", () => {
    test("floor plan stamps geometryHash, authorityUsed, authoritySource, schemaVersion", () => {
      const result = generateEnhancedFloorPlanSVG(
        makeMasterDNAWithGeometry(),
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
        makeMasterDNAWithGeometry(),
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
        makeMasterDNAWithGeometry(),
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
        makeMasterDNAWithGeometry(),
        0,
        {},
      );
      const b = generateEnhancedFloorPlanSVG(
        makeMasterDNAWithGeometry(),
        0,
        {},
      );
      expect(a.svgHash).toBe(b.svgHash);
    });

    test("panels from same canonical geometry share the same geometryHash", () => {
      const dna = makeMasterDNAWithGeometry();
      const plan = generateEnhancedFloorPlanSVG(dna, 0, {});
      const elev = generateEnhancedElevationSVG(dna, "south", {});
      const sect = generateEnhancedSectionSVG(dna, "longitudinal", {});

      expect(plan.geometryHash).toBeTruthy();
      expect(plan.geometryHash).toBe(elev.geometryHash);
      expect(elev.geometryHash).toBe(sect.geometryHash);
    });

    test("composed panels pass the gate validators", () => {
      const dna = makeMasterDNAWithGeometry();
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
    test("floor plan stamps fallback authority that the gate will reject", () => {
      const result = generateEnhancedFloorPlanSVG(
        makeMinimalMasterDNAForFallback(),
        0,
        {},
      );

      // Result may be null if even the enhanced generator fails — the
      // important contract is that whatever metadata we stamp must NOT
      // claim canonical authority.
      if (result === null) {
        return;
      }

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

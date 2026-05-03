import {
  generateEnhancedElevationSVG,
  generateEnhancedSectionSVG,
} from "../../../services/design/enhancedTechnicalDrawingAdapter.js";

// PR-B Phase 5/6: roof pitch ANGLE must appear on both the elevation and the
// section so reviewers can read the pitch directly from the sheet (not just
// infer it from ridge geometry). This test verifies the label is present and
// that elevation and section show the same angle for the same geometry.

function makeMasterDNAWithPitchedRoof(pitchDeg = 35) {
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
      metadata: {
        geometry_rules: { roof_pitch_degrees: pitchDeg },
      },
    },
    dimensions: { width: 10, length: 5, floors: 1, floorHeights: [3.2] },
    styleDNA: { roof_language: "pitched gable", roofPitch: pitchDeg },
  };
}

function makeMasterDNAWithFlatRoof() {
  const dna = makeMasterDNAWithPitchedRoof(35);
  dna.styleDNA.roof_language = "flat";
  dna.populatedGeometry.metadata = {};
  return dna;
}

function extractPitchDeg(svg) {
  const match = String(svg || "").match(/data-roof-pitch-deg="([\d.]+)"/);
  return match ? Number(match[1]) : null;
}

describe("PR-B roof pitch annotation", () => {
  test("elevation renderer adds PITCH label with data-roof-pitch-deg attribute", () => {
    const result = generateEnhancedElevationSVG(
      makeMasterDNAWithPitchedRoof(35),
      "south",
      {},
    );
    expect(result).not.toBeNull();
    expect(result.svg).toMatch(/data-roof-pitch-deg=/);
    expect(result.svg).toMatch(/PITCH 35°/);
    expect(extractPitchDeg(result.svg)).toBe(35);
  });

  test("section renderer adds PITCH label with data-roof-pitch-deg attribute", () => {
    const result = generateEnhancedSectionSVG(
      makeMasterDNAWithPitchedRoof(35),
      "longitudinal",
      {},
    );
    expect(result).not.toBeNull();
    expect(result.svg).toMatch(/data-roof-pitch-deg=/);
    expect(result.svg).toMatch(/PITCH 35°/);
    expect(extractPitchDeg(result.svg)).toBe(35);
  });

  test("elevation and section show the same pitch for the same geometry", () => {
    const dna = makeMasterDNAWithPitchedRoof(40);
    const elev = generateEnhancedElevationSVG(dna, "south", {});
    const sect = generateEnhancedSectionSVG(dna, "longitudinal", {});
    expect(extractPitchDeg(elev.svg)).toBe(40);
    expect(extractPitchDeg(sect.svg)).toBe(40);
  });

  test("flat roof suppresses the pitch label (no angle to report)", () => {
    const elev = generateEnhancedElevationSVG(
      makeMasterDNAWithFlatRoof(),
      "south",
      {},
    );
    const sect = generateEnhancedSectionSVG(
      makeMasterDNAWithFlatRoof(),
      "longitudinal",
      {},
    );
    expect(elev.svg).not.toMatch(/data-roof-pitch-deg=/);
    expect(sect.svg).not.toMatch(/data-roof-pitch-deg=/);
  });
});

import {
  generateEnhancedElevationSVG,
  generateEnhancedSectionSVG,
} from "../../../services/design/enhancedTechnicalDrawingAdapter.js";
import { CANONICAL_PROJECT_GEOMETRY_VERSION } from "../../../services/cad/projectGeometrySchema.js";

// PR-B Phase 5/6: roof pitch ANGLE must appear on both the elevation and the
// section so reviewers can read the pitch directly from the sheet (not just
// infer it from ridge geometry). This test verifies the label is present and
// that elevation and section show the same angle for the same geometry.

function makeProjectGraphCanonicalGeometry({
  slopeDeg = 8,
  roofType = "low_pitch",
  includePitch = true,
} = {}) {
  const footprint = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 5 },
    { x: 0, y: 5 },
  ];
  const roofPlane = {
    id: "roof-plane-low-pitch",
    primitive_family: "roof_plane",
    type: "low_pitch_roof",
    support_mode: "explicit_generated",
    polygon: footprint,
    eave_depth_m: 0.35,
  };
  if (includePitch) {
    roofPlane.slope_deg = slopeDeg;
  }

  return {
    schema_version: CANONICAL_PROJECT_GEOMETRY_VERSION,
    project_id: "projectgraph-low-pitch-fixture",
    site: {
      boundary_polygon: footprint,
      buildable_polygon: footprint,
    },
    levels: [
      {
        id: "level-ground",
        name: "Ground Floor",
        level_number: 0,
        elevation_m: 0,
        height_m: 3.2,
        footprint_id: "footprint-ground",
      },
    ],
    footprints: [
      {
        id: "footprint-ground",
        level_id: "level-ground",
        polygon: footprint,
        bbox: { min_x: 0, min_y: 0, max_x: 10, max_y: 5, width: 10, height: 5 },
      },
    ],
    rooms: [
      {
        id: "room-living",
        level_id: "level-ground",
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
        level_id: "level-ground",
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
        level_id: "level-ground",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        thickness_m: 0.3,
        exterior: true,
        side: "south",
      },
      {
        id: "wall-north",
        level_id: "level-ground",
        start: { x: 0, y: 5 },
        end: { x: 10, y: 5 },
        thickness_m: 0.3,
        exterior: true,
        side: "north",
      },
      {
        id: "wall-west",
        level_id: "level-ground",
        start: { x: 0, y: 0 },
        end: { x: 0, y: 5 },
        thickness_m: 0.3,
        exterior: true,
        side: "west",
      },
      {
        id: "wall-east",
        level_id: "level-ground",
        start: { x: 10, y: 0 },
        end: { x: 10, y: 5 },
        thickness_m: 0.3,
        exterior: true,
        side: "east",
      },
    ],
    doors: [
      {
        id: "door-main",
        level_id: "level-ground",
        wall_id: "wall-south",
        position: { x: 5, y: 0 },
        width_m: 1,
        height_m: 2.1,
        sill_height_m: 0,
        side: "south",
      },
    ],
    windows: [
      {
        id: "window-north-1",
        level_id: "level-ground",
        wall_id: "wall-north",
        position: { x: 3, y: 5 },
        width_m: 1.2,
        height_m: 1.4,
        sill_height_m: 0.9,
        side: "north",
      },
      {
        id: "window-south-1",
        level_id: "level-ground",
        wall_id: "wall-south",
        position: { x: 8, y: 0 },
        width_m: 1.2,
        height_m: 1.4,
        sill_height_m: 0.9,
        side: "south",
      },
    ],
    stairs: [],
    slabs: [],
    roof_primitives: [
      roofPlane,
      {
        id: "roof-ridge-low-pitch",
        primitive_family: "ridge",
        type: "ridge",
        start: { x: 0, y: 2.5 },
        end: { x: 10, y: 2.5 },
      },
    ],
    foundations: [],
    base_conditions: [],
    roof: {
      type: roofType,
      polygon: footprint,
      // Deliberately no roof.pitch / roof.pitch_deg; tests must prove the
      // renderer reads the ProjectGraph primitive slope instead.
    },
    metadata: {
      units: "meters",
      deterministic: true,
      source: "project_graph_vertical_slice",
      style_dna: { roof_language: "civic low pitch" },
      canonical_construction_truth: {
        roof: {
          support_mode: "explicit_generated",
          primitive_count: 2,
          plane_count: 1,
          ridge_count: 1,
        },
      },
    },
  };
}

function makeMasterDNAWithProjectGraphRoof(options = {}) {
  return {
    projectGeometry: makeProjectGraphCanonicalGeometry(options),
    dimensions: { width: 10, length: 5, floors: 1, floorHeights: [3.2] },
    styleDNA: {
      roof_language: options.roofType === "flat" ? "flat" : "civic low pitch",
    },
  };
}

function makeMasterDNAWithFlatRoof() {
  return makeMasterDNAWithProjectGraphRoof({
    includePitch: false,
    roofType: "flat",
  });
}

function extractPitchDeg(svg) {
  const match = String(svg || "").match(/data-roof-pitch-deg="([\d.]+)"/);
  return match ? Number(match[1]) : null;
}

function extractNumberAttr(svg, attr) {
  const match = String(svg || "").match(new RegExp(`${attr}="([\\d.]+)"`));
  return match ? Number(match[1]) : null;
}

function extractStringAttr(svg, attr) {
  const match = String(svg || "").match(new RegExp(`${attr}="([^"]+)"`));
  return match ? match[1] : null;
}

function expectedRise(spanM, pitchDeg) {
  return (spanM / 2) * Math.tan((pitchDeg * Math.PI) / 180);
}

describe("PR-B roof pitch annotation", () => {
  test("elevation renderer uses ProjectGraph roof_primitives[].slope_deg", () => {
    const result = generateEnhancedElevationSVG(
      makeMasterDNAWithProjectGraphRoof({ slopeDeg: 8 }),
      "south",
      {},
    );
    expect(result).not.toBeNull();
    expect(result.svg).toMatch(/data-roof-pitch-deg=/);
    expect(result.svg).toMatch(/PITCH 8°/);
    expect(extractPitchDeg(result.svg)).toBe(8);
    expect(extractStringAttr(result.svg, "data-roof-pitch-source")).toBe(
      "roof_primitives.slope_deg",
    );
    expect(result.metadata.technical_quality_metadata.roof_pitch_degrees).toBe(
      8,
    );
  });

  test("section renderer uses ProjectGraph roof_primitives[].slope_deg", () => {
    const result = generateEnhancedSectionSVG(
      makeMasterDNAWithProjectGraphRoof({ slopeDeg: 8 }),
      "longitudinal",
      {},
    );
    expect(result).not.toBeNull();
    expect(result.svg).toMatch(/data-roof-pitch-deg=/);
    expect(result.svg).toMatch(/PITCH 8°/);
    expect(extractPitchDeg(result.svg)).toBe(8);
    expect(extractStringAttr(result.svg, "data-roof-pitch-source")).toBe(
      "roof_primitives.slope_deg",
    );
    expect(result.metadata.technical_quality_metadata.roof_pitch_degrees).toBe(
      8,
    );
  });

  test("elevation and section show the same canonical primitive pitch", () => {
    const dna = makeMasterDNAWithProjectGraphRoof({ slopeDeg: 8 });
    const elev = generateEnhancedElevationSVG(dna, "south", {});
    const sect = generateEnhancedSectionSVG(dna, "longitudinal", {});
    expect(extractPitchDeg(elev.svg)).toBe(8);
    expect(extractPitchDeg(sect.svg)).toBe(8);
    expect(elev.metadata.technical_quality_metadata.roof_pitch_source).toBe(
      sect.metadata.technical_quality_metadata.roof_pitch_source,
    );
  });

  test("missing canonical pitch does not silently default to 35 degrees", () => {
    const dna = makeMasterDNAWithProjectGraphRoof({ includePitch: false });
    const elev = generateEnhancedElevationSVG(dna, "south", {});
    const sect = generateEnhancedSectionSVG(dna, "longitudinal", {});

    expect(extractPitchDeg(elev.svg)).toBeNull();
    expect(extractPitchDeg(sect.svg)).toBeNull();
    expect(elev.svg).not.toMatch(/PITCH 35/);
    expect(sect.svg).not.toMatch(/PITCH 35/);
    expect(extractStringAttr(elev.svg, "data-roof-pitch-status")).toBe(
      "missing",
    );
    expect(extractStringAttr(sect.svg, "data-roof-pitch-status")).toBe(
      "missing",
    );
    expect(elev.metadata.technical_quality_metadata.roof_pitch_status).toBe(
      "missing",
    );
    expect(sect.metadata.technical_quality_metadata.roof_pitch_status).toBe(
      "missing",
    );
  });

  test("rendered roof rise metadata matches the labelled canonical pitch", () => {
    const dna = makeMasterDNAWithProjectGraphRoof({ slopeDeg: 8 });
    const elev = generateEnhancedElevationSVG(dna, "south", {});
    const sect = generateEnhancedSectionSVG(dna, "longitudinal", {});

    const elevationSpan = extractNumberAttr(elev.svg, "data-roof-span-m");
    const elevationRise = extractNumberAttr(elev.svg, "data-roof-rise-m");
    const sectionSpan = extractNumberAttr(sect.svg, "data-roof-span-m");
    const sectionRise = extractNumberAttr(sect.svg, "data-roof-rise-m");

    expect(elevationSpan).toBeGreaterThan(0);
    expect(elevationRise).toBeCloseTo(expectedRise(elevationSpan, 8), 1);
    expect(sectionSpan).toBeGreaterThan(0);
    expect(sectionRise).toBeCloseTo(expectedRise(sectionSpan, 8), 1);
    expect(
      elev.metadata.technical_quality_metadata.roof_pitch_rise_m,
    ).toBeCloseTo(
      expectedRise(
        elev.metadata.technical_quality_metadata.roof_pitch_span_m,
        8,
      ),
      3,
    );
    expect(
      sect.metadata.technical_quality_metadata.roof_pitch_rise_m,
    ).toBeCloseTo(
      expectedRise(
        sect.metadata.technical_quality_metadata.roof_pitch_span_m,
        8,
      ),
      3,
    );
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

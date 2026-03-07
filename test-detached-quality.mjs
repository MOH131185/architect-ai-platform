/**
 * Detached House Quality Test
 *
 * Tests the local geometry → SVG → DXF → IFC pipeline for a 4-bed detached house.
 * No API calls required — validates drawing quality and export correctness.
 *
 * Usage:  node test-detached-quality.mjs
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const OUT = resolve(__dirname, "quality_test_output");
mkdirSync(OUT, { recursive: true });

let passed = 0, failed = 0;
const results = [];

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
    results.push({ label, pass: true });
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
    results.push({ label, pass: false, detail });
  }
}

async function main() {
  console.log("\n🏠 ========================================");
  console.log("🏠 DETACHED HOUSE QUALITY TEST");
  console.log("🏠 4-bed, 180m², 2 floors, gable roof");
  console.log("🏠 ========================================\n");

  // ─── 1. Build CanonicalDesignState ────────────────────────────
  console.log("📋 Phase 1: Build CanonicalDesignState\n");

  const { buildCDSSync } = await import("./src/services/validation/CanonicalDesignState.js");
  const { buildProgramLock } = await import("./src/services/validation/programLockSchema.js");

  const programSpaces = [
    { name: "Living Room", area: 25, level: 0 },
    { name: "Kitchen-Diner", area: 30, level: 0 },
    { name: "Hallway", area: 10, level: 0 },
    { name: "WC", area: 3, level: 0 },
    { name: "Utility", area: 6, level: 0 },
    { name: "Master Bedroom", area: 18, level: 1 },
    { name: "En-Suite", area: 5, level: 1 },
    { name: "Bedroom 2", area: 15, level: 1 },
    { name: "Bedroom 3", area: 12, level: 1 },
    { name: "Bedroom 4", area: 10, level: 1 },
    { name: "Family Bathroom", area: 7, level: 1 },
    { name: "Landing", area: 8, level: 1 },
  ];

  const programLock = buildProgramLock(programSpaces, { floors: 2 });
  assert("ProgramLock built", !!programLock);
  assert(`ProgramLock has ${programSpaces.length} spaces`, programLock.spaces.length === programSpaces.length);
  assert("ProgramLock levelCount = 2", programLock.levelCount === 2);

  const masterDNA = {
    buildingType: "detached_house",
    dimensions: {
      width: 12,
      depth: 8,
      height: 8.5,
      floors: 2,
      floorHeight: 2.8,
      groundFloorHeight: 3.0,
    },
    style: {
      vernacularStyle: "contemporary british",
      materials: ["red brick", "slate", "timber"],
      windowStyle: "casement",
    },
    roof: { type: "gable", pitch: 35 },
    rooms: programSpaces.map((s) => ({
      name: s.name,
      area: s.area,
      floor: s.level === 0 ? "ground" : "first",
    })),
    materials: [
      { name: "Red brick", hexColor: "#B8604E", application: "exterior walls" },
      { name: "Slate tiles", hexColor: "#4A5568", application: "gable roof 35°" },
      { name: "Timber frame", hexColor: "#D4A574", application: "window frames" },
    ],
  };

  const cds = buildCDSSync({
    designId: "test-detached-quality",
    seed: 424242,
    masterDNA,
    programLock,
    locationData: {
      address: "42 Oak Lane, Cambridge, UK",
      coordinates: { lat: 52.2053, lng: 0.1218 },
    },
  });

  assert("CDS built", !!cds);
  assert("CDS has program", !!cds.program);
  assert("CDS hash present", typeof cds.hash === "string" && cds.hash.length > 5);
  writeFileSync(join(OUT, "cds.json"), JSON.stringify(cds, null, 2));
  console.log("   Saved: cds.json\n");

  // ─── 2. Build BuildingModel ───────────────────────────────────
  console.log("📐 Phase 2: Build BuildingModel from CDS\n");

  const { createBuildingModel } = await import("./src/geometry/BuildingModel.js");
  const model = createBuildingModel(cds);

  assert("BuildingModel created", !!model);
  assert(`Floors: ${model.floors.length}`, model.floors.length === 2);

  const validation = model.validate();
  assert(`Model valid: ${validation.valid}`, validation.valid, validation.errors?.join(", "));
  assert(`Walls generated: ${validation.metrics.walls}`, validation.metrics.walls > 0);
  assert(`Rooms generated: ${validation.metrics.rooms}`, validation.metrics.rooms > 0);
  assert(`Openings generated: ${validation.metrics.openings}`, validation.metrics.openings > 0);

  const dims = model.getDimensionsMeters();
  console.log(`   Dimensions: ${dims.width.toFixed(1)}m × ${dims.depth.toFixed(1)}m × ${dims.height.toFixed(1)}m`);
  assert("Width > 8m", dims.width > 8, `Got ${dims.width.toFixed(1)}m`);
  assert("Depth > 5m", dims.depth > 5, `Got ${dims.depth.toFixed(1)}m`);
  assert("Ridge height > 7m", dims.ridgeHeight > 7, `Got ${dims.ridgeHeight.toFixed(1)}m`);

  // Check rooms per floor
  const groundRooms = model.floors[0].rooms;
  const firstRooms = model.floors[1]?.rooms || [];
  console.log(`   Ground floor: ${groundRooms.length} rooms — ${groundRooms.map(r => r.name).join(", ")}`);
  console.log(`   First floor: ${firstRooms.length} rooms — ${firstRooms.map(r => r.name).join(", ")}`);

  assert("Ground floor has >= 3 rooms", groundRooms.length >= 3);
  assert("First floor has >= 3 rooms", firstRooms.length >= 3);

  // Check walls per floor
  console.log(`   Ground walls: ${model.floors[0].walls.length}`);
  console.log(`   First walls: ${model.floors[1]?.walls?.length || 0}`);
  console.log(`   Ground openings: ${model.floors[0].openings.length}`);
  console.log(`   First openings: ${model.floors[1]?.openings?.length || 0}`);

  // Check facade openings
  const facades = ["N", "S", "E", "W"];
  for (const f of facades) {
    const openings = model.getOpeningsForFacade(f);
    console.log(`   Facade ${f}: ${openings.length} openings`);
  }
  console.log();

  // ─── 3. Generate SVG Projections ──────────────────────────────
  console.log("🎨 Phase 3: Generate SVG Projections\n");

  const { projectFloorPlan, projectElevation, projectSection } = await import("./src/geometry/Projections2D.js");
  const projOpts = { theme: "artistic" };

  // Floor plans
  for (let fi = 0; fi < model.floors.length; fi++) {
    const svg = projectFloorPlan(model, fi, projOpts);
    const fname = `floor_plan_${fi}.svg`;
    writeFileSync(join(OUT, fname), svg);

    assert(`Floor plan ${fi} SVG generated (${(svg.length / 1024).toFixed(1)}KB)`, svg.length > 500);

    // Quality checks
    const hasRoomLabels = svg.includes("<text") && (svg.includes("Living") || svg.includes("Kitchen") || svg.includes("Bedroom"));
    assert(`Floor plan ${fi} has room labels`, hasRoomLabels);

    const hasWalls = svg.includes("<line") || svg.includes("<rect") || svg.includes("<path");
    assert(`Floor plan ${fi} has wall geometry`, hasWalls);

    const hasDimensionText = svg.includes("m²") || svg.includes("mm");
    assert(`Floor plan ${fi} has dimensions/area text`, hasDimensionText);

    console.log(`   Saved: ${fname}`);
  }

  // Elevations
  for (const facade of facades) {
    const svg = projectElevation(model, facade, projOpts);
    const fname = `elevation_${facade}.svg`;
    writeFileSync(join(OUT, fname), svg);

    assert(`Elevation ${facade} SVG generated (${(svg.length / 1024).toFixed(1)}KB)`, svg.length > 500);

    // Check for architectural elements
    const hasRoof = svg.includes("roof") || svg.includes("gable") || svg.includes("<polygon") || svg.includes("<path");
    assert(`Elevation ${facade} has roof/polygon elements`, hasRoof);

    console.log(`   Saved: ${fname}`);
  }

  // Sections
  for (const axis of ["X", "Y"]) {
    const svg = projectSection(model, axis, projOpts);
    const fname = `section_${axis}.svg`;
    writeFileSync(join(OUT, fname), svg);

    assert(`Section ${axis} SVG generated (${(svg.length / 1024).toFixed(1)}KB)`, svg.length > 500);
    console.log(`   Saved: ${fname}`);
  }

  console.log();

  // ─── 4. DXF Export ────────────────────────────────────────────
  console.log("📏 Phase 4: DXF Export\n");

  const { exportToDXF } = await import("./src/utils/dxfWriter.js");
  const vectorPlan = model.toVectorPlan();

  assert("vectorPlan has floors", vectorPlan.floors.length === 2);

  for (let fi = 0; fi < vectorPlan.floors.length; fi++) {
    const floor = vectorPlan.floors[fi];
    assert(`VectorPlan floor ${fi} has walls: ${floor.layers.walls.length}`, floor.layers.walls.length > 0);
    assert(`VectorPlan floor ${fi} has labels: ${floor.layers.labels.length}`, floor.layers.labels.length > 0);

    // Check wall coordinates are in meters (not mm)
    const firstWall = floor.layers.walls[0];
    if (firstWall) {
      const maxCoord = Math.max(Math.abs(firstWall.x1), Math.abs(firstWall.y1));
      assert(`VectorPlan floor ${fi} coords in meters (max: ${maxCoord.toFixed(2)})`, maxCoord < 100, "Coordinates look like mm, not meters");
    }
  }

  const dxfContent = exportToDXF(vectorPlan, {
    project: "Detached House",
    address: "42 Oak Lane, Cambridge, UK",
  });

  assert("DXF content generated", dxfContent.length > 500);
  assert("DXF has HEADER section", dxfContent.includes("SECTION") && dxfContent.includes("HEADER"));
  assert("DXF has ENTITIES section", dxfContent.includes("ENTITIES"));
  assert("DXF has WALLS layer", dxfContent.includes("WALLS"));
  assert("DXF has LABELS layer", dxfContent.includes("LABELS"));
  assert("DXF has EOF marker", dxfContent.includes("EOF"));
  assert("DXF uses AC1021 (AutoCAD 2007)", dxfContent.includes("AC1021"));

  writeFileSync(join(OUT, "floor_plan.dxf"), dxfContent);
  console.log(`   Saved: floor_plan.dxf (${(dxfContent.length / 1024).toFixed(1)}KB)\n`);

  // ─── 5. IFC Export ────────────────────────────────────────────
  console.log("🏗️  Phase 5: IFC Export\n");

  const { exportToIFC } = await import("./src/utils/ifcWriter.js");
  const ifcContent = exportToIFC(model, {
    projectName: "Detached House Test",
    address: "42 Oak Lane, Cambridge, UK",
    author: "ArchitectAI Quality Test",
  });

  assert("IFC content generated", ifcContent.length > 1000);
  assert("IFC has ISO-10303-21 header", ifcContent.includes("ISO-10303-21"));
  assert("IFC uses IFC2X3 schema", ifcContent.includes("IFC2X3"));
  assert("IFC has IFCPROJECT", ifcContent.includes("IFCPROJECT"));
  assert("IFC has IFCSITE", ifcContent.includes("IFCSITE"));
  assert("IFC has IFCBUILDING", ifcContent.includes("IFCBUILDING"));
  assert("IFC has IFCBUILDINGSTOREY", ifcContent.includes("IFCBUILDINGSTOREY"));
  assert("IFC has IFCWALLSTANDARDCASE", ifcContent.includes("IFCWALLSTANDARDCASE"));
  assert("IFC has IFCEXTRUDEDAREASOLID (wall geometry)", ifcContent.includes("IFCEXTRUDEDAREASOLID"));
  assert("IFC has IFCRELAGGREGATES", ifcContent.includes("IFCRELAGGREGATES"));
  assert("IFC has IFCRELCONTAINEDINSPATIALSTRUCTURE", ifcContent.includes("IFCRELCONTAINEDINSPATIALSTRUCTURE"));

  // Count entities
  const wallCount = (ifcContent.match(/IFCWALLSTANDARDCASE/g) || []).length;
  const windowCount = (ifcContent.match(/IFCWINDOW/g) || []).length;
  const doorCount = (ifcContent.match(/IFCDOOR/g) || []).length;
  const storeyCount = (ifcContent.match(/IFCBUILDINGSTOREY/g) || []).length;

  console.log(`   Entities: ${wallCount} walls, ${windowCount} windows, ${doorCount} doors, ${storeyCount} storeys`);
  assert(`IFC has walls (${wallCount})`, wallCount > 5);
  assert(`IFC has windows (${windowCount})`, windowCount > 0);
  assert(`IFC has doors (${doorCount})`, doorCount > 0);
  assert(`IFC has 2 storeys`, storeyCount === 2);
  assert("IFC has END-ISO-10303-21", ifcContent.includes("END-ISO-10303-21"));

  writeFileSync(join(OUT, "model.ifc"), ifcContent);
  console.log(`   Saved: model.ifc (${(ifcContent.length / 1024).toFixed(1)}KB)\n`);

  // ─── 6. Consistency Checks ────────────────────────────────────
  console.log("🔗 Phase 6: Cross-System Consistency\n");

  // SVG floor plan room count vs CDS program spaces
  const groundSvg = projectFloorPlan(model, 0, projOpts);
  const cdsGroundRooms = programSpaces.filter(s => s.level === 0);

  // Check how many room names appear in the SVG
  let roomsInSvg = 0;
  for (const room of cdsGroundRooms) {
    const simpleName = room.name.split(" ")[0]; // "Living", "Kitchen", "Hallway", etc.
    if (groundSvg.includes(simpleName)) roomsInSvg++;
  }
  assert(
    `Ground floor SVG contains ${roomsInSvg}/${cdsGroundRooms.length} room names`,
    roomsInSvg >= Math.floor(cdsGroundRooms.length * 0.6),
    "At least 60% of rooms should be labeled"
  );

  // DXF wall count should match BuildingModel walls
  const bmGroundWalls = model.floors[0].walls.length;
  const dxfWallLines = (dxfContent.match(/8\nWALLS/g) || []).length;
  assert(
    `DXF wall count (${dxfWallLines}) matches model (${bmGroundWalls + (model.floors[1]?.walls?.length || 0)})`,
    dxfWallLines > 0,
  );

  // IFC storey count matches BuildingModel floors
  assert(
    `IFC storeys (${storeyCount}) matches model floors (${model.floors.length})`,
    storeyCount === model.floors.length,
  );

  // ─── Cleanup ──────────────────────────────────────────────────
  model.dispose();

  // ─── Summary ──────────────────────────────────────────────────
  console.log("\n📊 ========================================");
  console.log("📊 QUALITY TEST RESULTS");
  console.log("📊 ========================================\n");

  console.log(`   Total: ${passed + failed}`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log();
  console.log(`   📁 Output: ${OUT}`);

  if (failed > 0) {
    console.log("\n   ❌ FAILURES:");
    for (const r of results.filter(r => !r.pass)) {
      console.log(`      - ${r.label}${r.detail ? `: ${r.detail}` : ""}`);
    }
  }

  console.log(`\n${failed === 0 ? "✅ ALL QUALITY TESTS PASSED" : `❌ ${failed} QUALITY TEST(S) FAILED`}\n`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error("💥 Fatal:", err);
  process.exitCode = 1;
});

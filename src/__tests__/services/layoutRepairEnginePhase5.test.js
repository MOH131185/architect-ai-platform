import { repairLayout } from "../../services/floorplan/layoutRepairEngine.js";
import { generateProjectPackage } from "../../services/project/projectGenerationService.js";
import { validateProject } from "../../services/validation/projectValidationEngine.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function reshapeRoom(room, nextBbox) {
  const bbox = {
    ...nextBbox,
    width: Number((nextBbox.max_x - nextBbox.min_x).toFixed(3)),
    height: Number((nextBbox.max_y - nextBbox.min_y).toFixed(3)),
  };
  return {
    ...room,
    bbox,
    polygon: [
      { x: bbox.min_x, y: bbox.min_y },
      { x: bbox.max_x, y: bbox.min_y },
      { x: bbox.max_x, y: bbox.max_y },
      { x: bbox.min_x, y: bbox.max_y },
    ],
    centroid: {
      x: Number((bbox.min_x + bbox.width / 2).toFixed(3)),
      y: Number((bbox.min_y + bbox.height / 2).toFixed(3)),
    },
    actual_area: Number((bbox.width * bbox.height).toFixed(3)),
  };
}

describe("layout repair engine Phase 5", () => {
  test("selects the same repair candidate deterministically and preserves stable room ids", async () => {
    const generated = await generateProjectPackage({
      project_id: "phase5-layout-repair",
      footprint: { width_m: 16, depth_m: 12 },
      room_program: [
        { name: "Living Room", target_area_m2: 24, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 16, adjacency: ["Living Room"] },
        { name: "Bedroom 1", target_area_m2: 14, level: 1 },
        { name: "Bathroom 1", target_area_m2: 7, level: 1, wet_zone: true },
      ],
      styleDNA: {
        facade_language: "rhythmic-openings-with-solid-masonry",
      },
    });
    const broken = clone(generated.projectGeometry);
    const [firstRoom, secondRoom] = broken.rooms;
    broken.rooms[0] = reshapeRoom(firstRoom, {
      min_x: 0.5,
      min_y: 0.5,
      max_x: 7,
      max_y: 5.5,
    });
    broken.rooms[1] = reshapeRoom(secondRoom, {
      min_x: 5.8,
      min_y: 0.8,
      max_x: 12.8,
      max_y: 5.8,
    });

    const validationBefore = validateProject({
      projectGeometry: broken,
    });

    const firstRepair = repairLayout(broken, validationBefore);
    const secondRepair = repairLayout(broken, validationBefore);
    const validationAfter = validateProject({
      projectGeometry: firstRepair.repairedProjectGeometry,
    });

    expect(firstRepair.selectedCandidate.candidateId).toBe(
      secondRepair.selectedCandidate.candidateId,
    );
    expect(
      firstRepair.repairedProjectGeometry.rooms.map((room) => room.id),
    ).toEqual(broken.rooms.map((room) => room.id));
    expect(validationAfter.errors.length).toBeLessThanOrEqual(
      validationBefore.errors.length,
    );
    expect(firstRepair.explanations.length).toBeGreaterThan(0);
  });

  test("keeps a deterministic no-op baseline when no repair strategy is selected", async () => {
    const generated = await generateProjectPackage({
      project_id: "phase5-layout-repair-baseline",
      footprint: { width_m: 14, depth_m: 10 },
      room_program: [
        { name: "Living Room", target_area_m2: 22, adjacency: ["Kitchen"] },
        { name: "Kitchen", target_area_m2: 14, adjacency: ["Living Room"] },
      ],
      styleDNA: {
        facade_language: "rhythmic-openings-with-solid-masonry",
      },
    });

    const validation = validateProject({
      projectGeometry: generated.projectGeometry,
    });
    const repaired = repairLayout(generated.projectGeometry, validation, {
      strategies: ["nonexistent-strategy"],
    });

    expect(repaired.selectedCandidate.candidateId).toBe("repair:baseline-noop");
    expect(
      repaired.repairedProjectGeometry.rooms.map((room) => room.id),
    ).toEqual(generated.projectGeometry.rooms.map((room) => room.id));
  });
});

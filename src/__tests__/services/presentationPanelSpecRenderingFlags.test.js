/**
 * Phase 4 — Track 2: panel spec rendering flags.
 *
 * Locks the contract that `buildPresentationV3SheetPanelSpecs` decorates
 * floor-plan, elevation, and section panels with the deterministic-SVG
 * rendering flags introduced in Phase 4:
 *   - floor plans → showOuterDimensionChain:true, outerDimensionSides
 *   - elevations  → showGroundHatch:true, showShadow, showMaterialLegend
 *   - sections    → showFloorToFloorLabels:true, showRidgeLabel:true
 *
 * Non-architectural panels (site_context, axonometric, hero_3d, etc.) keep
 * their unmodified shape.
 */

import { buildPresentationV3SheetPanelSpecs } from "../../services/project/projectGraphVerticalSliceService.js";

function bySource(specs, panelType) {
  return specs.find((spec) => spec.panelType === panelType);
}

describe("buildPresentationV3SheetPanelSpecs rendering flags", () => {
  test("floor plans carry outer dimension chain flags", () => {
    const specs = buildPresentationV3SheetPanelSpecs(2);
    const ground = bySource(specs, "floor_plan_ground");
    const first = bySource(specs, "floor_plan_first");
    for (const plan of [ground, first]) {
      expect(plan).toBeDefined();
      expect(plan.showOuterDimensionChain).toBe(true);
      expect(plan.outerDimensionSides).toEqual(["S", "W"]);
    }
  });

  test("elevations carry ground hatch + 45° shadow + material legend flags", () => {
    const specs = buildPresentationV3SheetPanelSpecs(2);
    for (const orientation of ["north", "south", "east", "west"]) {
      const elev = bySource(specs, `elevation_${orientation}`);
      expect(elev).toBeDefined();
      expect(elev.showGroundHatch).toBe(true);
      expect(elev.showShadow).toEqual({ azimuth: 45, elevation: 30 });
      expect(elev.showMaterialLegend).toBe(true);
    }
  });

  test("sections carry floor-to-floor + ridge label flags", () => {
    const specs = buildPresentationV3SheetPanelSpecs(2);
    for (const sectionId of ["section_AA", "section_BB"]) {
      const section = bySource(specs, sectionId);
      expect(section).toBeDefined();
      expect(section.showFloorToFloorLabels).toBe(true);
      expect(section.showRidgeLabel).toBe(true);
    }
  });

  test("non-architectural panels are not decorated", () => {
    const specs = buildPresentationV3SheetPanelSpecs(2);
    const site = bySource(specs, "site_context");
    const axon = bySource(specs, "axonometric");
    const hero = bySource(specs, "hero_3d");
    expect(site.showOuterDimensionChain).toBeUndefined();
    expect(axon.showGroundHatch).toBeUndefined();
    expect(hero.showShadow).toBeUndefined();
    expect(hero.showMaterialLegend).toBeUndefined();
  });

  test("single-storey + three-storey both decorate floor plans", () => {
    for (const storeys of [1, 3]) {
      const specs = buildPresentationV3SheetPanelSpecs(storeys);
      const ground = bySource(specs, "floor_plan_ground");
      expect(ground).toBeDefined();
      expect(ground.showOuterDimensionChain).toBe(true);
    }
  });
});

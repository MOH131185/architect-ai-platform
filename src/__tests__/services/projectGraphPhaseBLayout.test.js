import {
  computePanelCaptionLayout,
  isResidentialBuildingType,
  resolvePresentationLayoutTemplate,
  selectPanelContentViewBox,
} from "../../services/project/projectGraphVerticalSliceService.js";

describe("Phase B residential layout routing", () => {
  test("residential typologies are detected", () => {
    expect(isResidentialBuildingType("residential")).toBe(true);
    expect(isResidentialBuildingType("detached_house")).toBe(true);
    expect(isResidentialBuildingType("detached-house")).toBe(true);
    expect(isResidentialBuildingType("Detached House")).toBe(true);
    expect(isResidentialBuildingType("multi_residential")).toBe(true);
    expect(isResidentialBuildingType("apartment")).toBe(true);
    expect(isResidentialBuildingType("flat")).toBe(true);
    expect(isResidentialBuildingType("loft_conversion")).toBe(true);
    expect(isResidentialBuildingType("townhouse")).toBe(true);
    expect(isResidentialBuildingType("residential_estate")).toBe(true); // substring catch
    expect(isResidentialBuildingType("dwelling")).toBe(true);
  });

  test("non-residential typologies fall through to board-v2", () => {
    expect(isResidentialBuildingType("office_studio")).toBe(false);
    expect(isResidentialBuildingType("community")).toBe(false);
    expect(isResidentialBuildingType("education_studio")).toBe(false);
    expect(isResidentialBuildingType("mixed_use")).toBe(false);
    expect(isResidentialBuildingType(null)).toBe(false);
    expect(isResidentialBuildingType("")).toBe(false);
    expect(isResidentialBuildingType(undefined)).toBe(false);
  });

  test("resolvePresentationLayoutTemplate routes residential to presentation-v3", () => {
    expect(
      resolvePresentationLayoutTemplate({ building_type: "detached_house" }),
    ).toBe("presentation-v3");
    expect(
      resolvePresentationLayoutTemplate({ building_type: "multi_residential" }),
    ).toBe("presentation-v3");
    expect(
      resolvePresentationLayoutTemplate({ buildingType: "residential" }),
    ).toBe("presentation-v3");
  });

  test("resolvePresentationLayoutTemplate routes non-residential to board-v2", () => {
    expect(
      resolvePresentationLayoutTemplate({ building_type: "office_studio" }),
    ).toBe("board-v2");
    expect(
      resolvePresentationLayoutTemplate({ building_type: "mixed_use" }),
    ).toBe("board-v2");
    expect(resolvePresentationLayoutTemplate({})).toBe("board-v2");
    expect(resolvePresentationLayoutTemplate({ building_type: null })).toBe(
      "board-v2",
    );
  });
});

describe("Phase B closeout — presentation-v3 panel fit", () => {
  // contentBounds describes the tight rectangle around the technical
  // drawing's primitives; normalizedViewBox carries the existing 6–10%
  // padded fallback. presentation-v3 should crop to contentBounds.
  const technicalArtifact = {
    svgString:
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"></svg>',
    width: 1200,
    height: 900,
    contentBounds: { x: 100, y: 80, width: 1000, height: 720 },
    normalizedViewBox: "20 10 1160 880",
  };

  test("technical floor plans crop to contentBounds with ~1.5% padding under presentation-v3", () => {
    const viewBox = selectPanelContentViewBox({
      panelType: "floor_plan_ground",
      artifact: technicalArtifact,
      layoutTemplate: "presentation-v3",
    });
    const [, , w, h] = viewBox.split(/\s+/).map(Number);
    const contentArea = 1000 * 720;
    const viewBoxArea = w * h;
    // Floor plan padding (~1.5% per side) keeps content occupying ≥0.92 of
    // the viewBox so the drawing fills as much of the slot as possible
    // before aspect-fit kicks in.
    expect(contentArea / viewBoxArea).toBeGreaterThan(0.92);
  });

  test("technical sections crop to contentBounds with ~2% padding", () => {
    const viewBox = selectPanelContentViewBox({
      panelType: "section_AA",
      artifact: technicalArtifact,
      layoutTemplate: "presentation-v3",
    });
    const [, , w, h] = viewBox.split(/\s+/).map(Number);
    const occupancy = (1000 * 720) / (w * h);
    expect(occupancy).toBeGreaterThan(0.9);
  });

  test("elevations crop to contentBounds with ~2.5% padding (slightly looser to keep dimension labels)", () => {
    const viewBox = selectPanelContentViewBox({
      panelType: "elevation_north",
      artifact: technicalArtifact,
      layoutTemplate: "presentation-v3",
    });
    const [, , w, h] = viewBox.split(/\s+/).map(Number);
    const occupancy = (1000 * 720) / (w * h);
    // Elevation occupancy ≥0.88 (well within the brief's 75–90% band).
    expect(occupancy).toBeGreaterThan(0.88);
    // Sanity: elevation viewBox is wider than the floor-plan viewBox because
    // padding is larger.
    const planViewBox = selectPanelContentViewBox({
      panelType: "floor_plan_ground",
      artifact: technicalArtifact,
      layoutTemplate: "presentation-v3",
    });
    const planW = Number(planViewBox.split(/\s+/)[2]);
    expect(w).toBeGreaterThan(planW);
  });

  test("non-technical panels (site, hero, palette) keep the legacy normalizedViewBox", () => {
    for (const panelType of [
      "site_context",
      "hero_3d",
      "interior_3d",
      "axonometric",
      "material_palette",
      "key_notes",
      "title_block",
    ]) {
      expect(
        selectPanelContentViewBox({
          panelType,
          artifact: technicalArtifact,
          layoutTemplate: "presentation-v3",
        }),
      ).toBe("20 10 1160 880");
    }
  });

  test("board-v2 always returns the existing normalizedViewBox for technical panels", () => {
    for (const panelType of [
      "floor_plan_ground",
      "floor_plan_first",
      "section_AA",
      "elevation_north",
    ]) {
      expect(
        selectPanelContentViewBox({
          panelType,
          artifact: technicalArtifact,
          layoutTemplate: "board-v2",
        }),
      ).toBe("20 10 1160 880");
    }
  });

  test("falls back to normalizedViewBox when contentBounds is missing", () => {
    const artifact = {
      svgString:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"></svg>',
      width: 800,
      height: 600,
      normalizedViewBox: "10 10 780 580",
    };
    expect(
      selectPanelContentViewBox({
        panelType: "floor_plan_ground",
        artifact,
        layoutTemplate: "presentation-v3",
      }),
    ).toBe("10 10 780 580");
  });
});

describe("Phase B closeout — caption layout", () => {
  test("inline layout used when title + scale fit comfortably", () => {
    const layout = computePanelCaptionLayout({
      title: "GROUND FLOOR PLAN",
      scale: "1:100",
      panelWidth: 370,
      layoutTemplate: "presentation-v3",
    });
    expect(layout.layout).toBe("inline");
    expect(layout.titleY).toBe(layout.scaleY);
    expect(layout.scaleFontSize).toBeGreaterThan(4);
  });

  test("stacked layout used on narrow panels with long titles", () => {
    // Section A-A on a 60mm slot would never fit "SECTION A-A" + "1:50"
    // inline at the configured min-gap; verify stacking.
    const layout = computePanelCaptionLayout({
      title: "SECTION A-A",
      scale: "1:50",
      panelWidth: 60,
      layoutTemplate: "presentation-v3",
    });
    expect(layout.layout).toBe("stacked");
    expect(layout.scaleY).toBeGreaterThan(layout.titleY);
    expect(layout.scaleFontSize).toBeLessThan(4);
    // Stacked layout reserves more vertical space for the caption than the
    // inline layout (which uses CAPTION_INLINE_CONTENT_TOP_MM = 12).
    expect(layout.contentTopOffset).toBeGreaterThan(12);
  });

  test("2-storey plan slot (180mm) stacks even though widths technically fit", () => {
    // The visible distance between "GROUND FLOOR PLAN" and "1:100" on a
    // 180mm slot reads as a single merged phrase at A1 scale, so the
    // closeout v2 narrow threshold forces stacking under 200mm.
    const layout = computePanelCaptionLayout({
      title: "GROUND FLOOR PLAN",
      scale: "1:100",
      panelWidth: 180,
      layoutTemplate: "presentation-v3",
    });
    expect(layout.layout).toBe("stacked");
  });

  test("3-storey plan slot (116.7mm) stacks", () => {
    const layout = computePanelCaptionLayout({
      title: "SECOND FLOOR PLAN",
      scale: "1:100",
      panelWidth: 116.7,
      layoutTemplate: "presentation-v3",
    });
    expect(layout.layout).toBe("stacked");
  });

  test("wide elevation slot (251mm) stays inline", () => {
    const layout = computePanelCaptionLayout({
      title: "NORTH ELEVATION",
      scale: "1:100",
      panelWidth: 251,
      layoutTemplate: "presentation-v3",
    });
    expect(layout.layout).toBe("inline");
  });

  test("board-v2 always uses inline layout (regression guard)", () => {
    const layout = computePanelCaptionLayout({
      title: "SECTION A-A",
      scale: "1:50",
      panelWidth: 60,
      layoutTemplate: "board-v2",
    });
    expect(layout.layout).toBe("inline");
    // 180mm board-v2 also stays inline even though presentation-v3 would
    // stack it.
    const boardWidePanel = computePanelCaptionLayout({
      title: "GROUND FLOOR PLAN",
      scale: "1:100",
      panelWidth: 180,
      layoutTemplate: "board-v2",
    });
    expect(boardWidePanel.layout).toBe("inline");
  });

  test("missing scale collapses to inline regardless of width", () => {
    const layout = computePanelCaptionLayout({
      title: "MATERIAL PALETTE",
      scale: "",
      panelWidth: 60,
      layoutTemplate: "presentation-v3",
    });
    expect(layout.layout).toBe("inline");
  });

  test("scale x is anchored to the right edge with horizontal padding", () => {
    const layout = computePanelCaptionLayout({
      title: "FIRST FLOOR PLAN",
      scale: "1:100",
      panelWidth: 180,
      layoutTemplate: "presentation-v3",
    });
    expect(layout.scaleX).toBe(180 - 4);
    expect(layout.titleX).toBe(4);
  });
});

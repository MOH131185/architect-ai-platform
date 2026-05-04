import {
  buildPresentationV3SheetPanelSpecs,
  computePanelCaptionLayout,
  computePanelSlotFitMetrics,
  isResidentialBuildingType,
  resolvePresentationLayoutTemplate,
  selectPanelContentViewBox,
} from "../../services/project/projectGraphVerticalSliceService.js";

const A1_WIDTH_MM = 841;
const A1_HEIGHT_MM = 594;

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function findOverlap(specs) {
  for (let i = 0; i < specs.length; i += 1) {
    for (let j = i + 1; j < specs.length; j += 1) {
      if (rectsOverlap(specs[i], specs[j])) {
        return { a: specs[i], b: specs[j] };
      }
    }
  }
  return null;
}

function withinSheet(spec) {
  return (
    spec.x >= 0 &&
    spec.y >= 0 &&
    spec.x + spec.width <= A1_WIDTH_MM &&
    spec.y + spec.height <= A1_HEIGHT_MM
  );
}

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

describe("Phase B closeout v3 — presentation-v3 slot proportions", () => {
  test("3-storey residential plan slots have aspect ratio ≥ 1.20 (landscape)", () => {
    const specs = buildPresentationV3SheetPanelSpecs(3);
    const planSpecs = specs.filter((s) =>
      /^floor_plan_(ground|first|level2)$/.test(s.panelType),
    );
    expect(planSpecs).toHaveLength(3);
    for (const plan of planSpecs) {
      const aspect = plan.width / plan.height;
      expect(aspect).toBeGreaterThanOrEqual(1.2);
    }
  });

  test("3-storey row 1 height shrinks to 130mm so plans fit landscape", () => {
    const specs = buildPresentationV3SheetPanelSpecs(3);
    const site = specs.find((s) => s.panelType === "site_context");
    const ground = specs.find((s) => s.panelType === "floor_plan_ground");
    const elevationN = specs.find((s) => s.panelType === "elevation_north");
    expect(site.height).toBe(130);
    expect(ground.height).toBe(130);
    // North elevation is half the row height with a small gap above its
    // bottom sibling — so each elevation cell is ~62mm tall.
    expect(elevationN.height).toBeLessThanOrEqual(70);
  });

  test("3-storey row 2 absorbs the recovered vertical space (≥230mm tall)", () => {
    const specs = buildPresentationV3SheetPanelSpecs(3);
    const sectionAA = specs.find((s) => s.panelType === "section_AA");
    const axonometric = specs.find((s) => s.panelType === "axonometric");
    expect(sectionAA.height).toBeGreaterThanOrEqual(230);
    expect(axonometric.height).toBeGreaterThanOrEqual(230);
  });

  test("3-storey layout has no overlapping panels and stays within the A1 sheet", () => {
    const specs = buildPresentationV3SheetPanelSpecs(3);
    expect(findOverlap(specs)).toBeNull();
    for (const spec of specs) {
      expect(withinSheet(spec)).toBe(true);
    }
  });

  test("1-storey layout keeps a tighter standard row stack", () => {
    const specs = buildPresentationV3SheetPanelSpecs(1);
    const site = specs.find((s) => s.panelType === "site_context");
    const ground = specs.find((s) => s.panelType === "floor_plan_ground");
    const sectionAA = specs.find((s) => s.panelType === "section_AA");
    const hero = specs.find((s) => s.panelType === "hero_3d");
    expect(site.height).toBe(180);
    expect(ground.height).toBe(180);
    expect(sectionAA.height).toBe(178);
    expect(hero.height).toBe(200);
    expect(findOverlap(specs)).toBeNull();
  });

  test("2-storey layout places ground and first-floor plans side by side", () => {
    const specs = buildPresentationV3SheetPanelSpecs(2);
    const ground = specs.find((s) => s.panelType === "floor_plan_ground");
    const first = specs.find((s) => s.panelType === "floor_plan_first");
    expect(ground.height).toBe(180);
    expect(first.height).toBe(180);
    expect(first.x).toBeGreaterThan(ground.x);
    expect(ground.width).toBeGreaterThanOrEqual(175);
    expect(first.width).toBe(ground.width);
    expect(findOverlap(specs)).toBeNull();
  });

  test("row 3 keeps the same horizontal hierarchy across storey counts", () => {
    const oneStorey = buildPresentationV3SheetPanelSpecs(1);
    const threeStorey = buildPresentationV3SheetPanelSpecs(3);
    const row3PanelTypes = [
      "hero_3d",
      "interior_3d",
      "material_palette",
      "key_notes",
      "title_block",
    ];
    for (const panelType of row3PanelTypes) {
      const a = oneStorey.find((s) => s.panelType === panelType);
      const b = threeStorey.find((s) => s.panelType === panelType);
      expect(b.x).toBe(a.x);
      expect(b.width).toBe(a.width);
    }
  });

  test("3-storey plan slot caption stack still triggers (panel < 200mm)", () => {
    const specs = buildPresentationV3SheetPanelSpecs(3);
    const ground = specs.find((s) => s.panelType === "floor_plan_ground");
    expect(ground.width).toBeLessThan(200);
    const layout = computePanelCaptionLayout({
      title: "GROUND FLOOR PLAN",
      scale: "1:100",
      panelWidth: ground.width,
      layoutTemplate: "presentation-v3",
    });
    expect(layout.layout).toBe("stacked");
  });

  test("slot-fit metrics reflect final nested SVG aspect-fit on the board", () => {
    const specs = buildPresentationV3SheetPanelSpecs(2);
    const ground = specs.find((s) => s.panelType === "floor_plan_ground");
    const metrics = computePanelSlotFitMetrics({
      panelType: ground.panelType,
      artifact: {
        svgString:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900"></svg>',
        width: 1200,
        height: 900,
        contentBounds: { x: 100, y: 80, width: 1000, height: 720 },
        normalizedViewBox: "20 10 1160 880",
      },
      placement: {
        ...ground,
        title: "Ground Floor Plan",
        scale: "1:100",
        layoutTemplate: "presentation-v3",
      },
      layoutTemplate: "presentation-v3",
    });
    expect(metrics.occupancyRatio).toBeGreaterThan(0.7);
    expect(metrics.slotContentHeight).toBeLessThan(ground.height);
    expect(metrics.captionLayout).toBe("stacked");
  });
});

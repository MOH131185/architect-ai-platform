import {
  buildHouseExpoReferenceBlock,
  buildRoboflowSymbolVocabularyBlock,
  selectHouseExpoReferenceExamples,
} from "../../services/layoutReferenceService.js";

describe("layoutReferenceService", () => {
  test("selects HouseExpo examples for residential programs", () => {
    const examples = selectHouseExpoReferenceExamples([
      { name: "Living Room", program: "living" },
      { name: "Kitchen", program: "kitchen" },
      { name: "Bedroom 1", program: "bedroom" },
      { name: "Bedroom 2", program: "bedroom" },
      { name: "Bathroom", program: "bathroom" },
    ]);

    expect(examples.length).toBeGreaterThan(0);
    expect(examples[0]).toHaveProperty("roomCount");
    expect(examples[0]).toHaveProperty("bboxMeters.width");
  });

  test("builds a residential HouseExpo prompt block", () => {
    const block = buildHouseExpoReferenceBlock({
      buildingType: "residential",
      programSpaces: [
        { name: "Living Room", program: "living" },
        { name: "Kitchen", program: "kitchen" },
        { name: "Bedroom 1", program: "bedroom" },
        { name: "Bathroom", program: "bathroom" },
      ],
    });

    expect(block).toContain("HOUSEEXPO REFERENCE PRIORS");
    expect(block).toContain("Common room types");
    expect(block).toContain("Example 1");
  });

  test("skips HouseExpo priors for non-residential programs", () => {
    const block = buildHouseExpoReferenceBlock({
      buildingType: "hospital",
      programSpaces: [{ name: "Ward", program: "ward" }],
    });

    expect(block).toBe("");
  });

  test("builds Roboflow symbol vocabulary guidance", () => {
    const block = buildRoboflowSymbolVocabularyBlock();

    expect(block).toContain("ROBOFLOW FLOOR-PLAN SYMBOL PRIORS");
    expect(block).toContain("doors");
    expect(block).toContain("windows");
  });
});

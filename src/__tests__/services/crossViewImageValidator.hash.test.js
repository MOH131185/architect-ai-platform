import { validateAllPanels } from "../../services/validation/crossViewImageValidator.js";

describe("crossViewImageValidator geometry hash guard", () => {
  test("fails when panel map contains conflicting geometry hashes", async () => {
    const result = await validateAllPanels({
      hero_3d: { geometryHash: "geom-a" },
      axonometric: { geometryHash: "geom-b" },
    });

    expect(result.pass).toBe(false);
    expect(result.failedPanels).toHaveLength(1);
    expect(result.failedPanels[0].reasons.join(" ")).toMatch(
      /Geometry hash mismatch/i,
    );
  });
});

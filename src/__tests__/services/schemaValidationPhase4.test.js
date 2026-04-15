import { validateNamedSchema } from "../../services/contracts/schemaValidationService.js";

describe("schemaValidationService Phase 4", () => {
  test("rejects malformed canonical project geometry early", () => {
    const result = validateNamedSchema("canonicalProjectGeometry", {
      schema_version: "canonical-project-geometry-v2",
      site: {},
      levels: [],
    });

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((entry) => entry.includes("project_id is required")),
    ).toBe(true);
  });

  test("rejects malformed generate-project requests", () => {
    const result = validateNamedSchema("generateProjectRequest", {
      project_id: "bad-request",
      room_program: [],
      levels: 0,
      constraints: {},
      styleDNA: {},
    });

    expect(result.valid).toBe(false);
    expect(
      result.errors.some((entry) =>
        entry.includes("room_program must contain at least 1 items"),
      ),
    ).toBe(true);
    expect(
      result.errors.some((entry) => entry.includes("levels must be >= 1")),
    ).toBe(true);
  });
});

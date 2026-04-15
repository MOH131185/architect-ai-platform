import { validateRegisteredSchema } from "../../services/contracts/ajvValidationService.js";

describe("schema engine Phase 5", () => {
  test("rejects malformed complex readiness payloads with clear instance paths", () => {
    const result = validateRegisteredSchema("projectReadinessRequest", {
      projectGeometry: {},
      drawings: {
        plan: "not-an-array",
      },
    });

    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (entry) =>
          entry.instancePath === "/drawings" &&
          entry.message.includes("must match at least one allowed schema"),
      ),
    ).toBe(true);
  });

  test("reports deprecated aliases from the schema registry", () => {
    const result = validateRegisteredSchema("generateProjectRequest", {
      projectId: "phase5-schema-alias",
      project_id: "phase5-schema-alias",
      room_program: [{ name: "Living", target_area_m2: 20 }],
      levels: 1,
      constraints: {},
      styleDNA: {},
    });

    expect(result.warnings).toContain(
      '"projectId" is deprecated; use "project_id" instead.',
    );
  });
});

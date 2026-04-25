import { buildA1OverflowSheetSvg } from "../../services/a1/a1OverflowSheetComposer.js";

describe("a1OverflowSheetComposer", () => {
  test("builds a real A1-02 companion sheet with technical data sections", () => {
    const svg = buildA1OverflowSheetSvg({
      width: 1792,
      height: 1269,
      designId: "design-123",
      trace: { traceId: "trace-123", runId: "run-123" },
      layoutTemplate: "board-v2",
      renderIntent: "final_a1",
      masterDNA: {
        rooms: [{ name: "Kitchen", area: 22, floor: 0 }],
        materials: [{ name: "Brick", application: "external wall" }],
      },
      locationData: {
        climate: { zone: "London", prevailingWind: "SW" },
      },
      projectContext: {
        regulationPack: {
          jurisdiction: "UK",
          planningUseClass: "C3",
        },
      },
      finalSheetRegression: { status: "pass" },
      postComposeVerification: {
        status: "pass",
        publishability: { status: "publishable" },
        renderedTextZone: { ocrEvidenceQuality: "verified" },
      },
      glyphIntegrity: { status: "pass" },
      sheetTextContract: { requiredLabelCount: 64 },
      sheetSetPlan: {
        reason: "A1-01 is too dense for readable print export.",
      },
    });

    expect(svg).toContain('data-sheet-id="A1-02"');
    expect(svg).toContain("TECHNICAL DATA / QA / PROVENANCE");
    expect(svg).toContain("Programme Schedule");
    expect(svg).toContain("Materials / Construction");
    expect(svg).toContain("QA / Verification");
    expect(svg).toContain("Kitchen");
    expect(svg).toContain("Brick");
    expect(svg).toContain("Publishability: publishable");
  });
});

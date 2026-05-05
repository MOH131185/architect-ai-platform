import { evaluateVisualSemanticQa } from "../../services/render/visualSemanticValidator.js";

function artifact(panelType, controlViewType) {
  return {
    asset_id: `asset-${panelType}`,
    panel_type: panelType,
    svgString: '<svg><rect width="10" height="10"/></svg>',
    metadata: {
      panelType,
      controlViewType,
    },
  };
}

const panelArtifacts = {
  hero: artifact("hero_3d", "exterior_massing_opening_control"),
  exterior: artifact("exterior_render", "exterior_massing_opening_control"),
  axon: artifact("axonometric", "axonometric_massing_opening_control"),
  interior: artifact("interior_3d", "interior_room_cutaway_control"),
};

describe("evaluateVisualSemanticQa", () => {
  test("passes deterministic control metadata when view semantics match", () => {
    const report = evaluateVisualSemanticQa({
      panelArtifacts,
      strictMode: true,
    });

    expect(report.status).toBe("pass");
    expect(report.panels.interior_3d.controlViewType).toBe(
      "interior_room_cutaway_control",
    );
    expect(report.blockers).toEqual([]);
  });

  test("strict mode blocks when interior_3d is classified as exterior", () => {
    const report = evaluateVisualSemanticQa({
      panelArtifacts,
      strictMode: true,
      classifier: (panelType) =>
        panelType === "interior_3d"
          ? { viewClass: "exterior", isExterior: true, isInterior: false }
          : {
              viewClass:
                panelType === "axonometric" ? "axonometric" : "exterior",
            },
    });

    expect(report.status).toBe("fail");
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          panelType: "interior_3d",
          code: "VISUAL_SEMANTIC_INTERIOR_CLASSIFIED_EXTERIOR",
        }),
      ]),
    );
  });

  test("strict mode blocks material identity conflicts", () => {
    const report = evaluateVisualSemanticQa({
      panelArtifacts,
      strictMode: true,
      classifier: (panelType) => ({
        viewClass:
          panelType === "interior_3d"
            ? "interior"
            : panelType === "axonometric"
              ? "axonometric"
              : "exterior",
        isInterior: panelType === "interior_3d",
        isExterior: panelType !== "interior_3d",
        materialIdentityConflicts:
          panelType === "hero_3d" ? ["primary material mismatch"] : [],
      }),
    });

    expect(report.status).toBe("fail");
    expect(report.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          panelType: "hero_3d",
          code: "VISUAL_SEMANTIC_MATERIAL_IDENTITY_CONFLICT",
        }),
      ]),
    );
  });
});

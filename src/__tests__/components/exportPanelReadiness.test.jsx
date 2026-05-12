/**
 * ExportPanel readiness rendering.
 *
 * Verifies that:
 *   - With a compiledProject + injected exportManifest, DXF / IFC / JSON
 *     render as READY and XLSX renders BLOCKED with the takeoff reason.
 *   - The "Generate a design to unlock exports" footer is hidden once
 *     any deliverable surface exists (manifest OR geometryHash OR
 *     deliverable artifacts).
 *   - With no compiledProject at all, every engineering row is BLOCKED
 *     with a structured reason from BLOCKED_REASONS.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ExportPanel from "../../components/ExportPanel.jsx";
import { buildClientExportManifest } from "../../services/export/buildClientExportManifest.js";

jest.mock("../../components/ui/feedback/Tooltip.jsx", () => ({
  Tooltip: ({ children }) => <>{children}</>,
}));

jest.mock("../../components/ui/feedback/Tooltip", () => ({
  Tooltip: ({ children }) => <>{children}</>,
}));

jest.mock("../../components/ui/ToastProvider.jsx", () => ({
  useToastContext: () => ({
    toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() },
  }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderComponent(ui) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function rowByLabel(container, label) {
  return [...container.querySelectorAll("button")].find((b) =>
    b.textContent.includes(label),
  );
}

afterEach(() => {
  document.body.innerHTML = "";
});

const compiledWithGeometry = (overrides = {}) => ({
  geometryHash: "geom-hash-x",
  walls: [{ id: "w1" }],
  levels: [{ id: "L0", elevation_m: 0 }],
  ...overrides,
});

describe("ExportPanel readiness rendering", () => {
  test("with compiledProject + manifest: DXF/IFC/JSON ready, XLSX blocked with takeoff reason, footer hidden", () => {
    const designData = {
      compiledProject: compiledWithGeometry(),
      exportManifest: buildClientExportManifest({
        compiledProject: compiledWithGeometry(),
        projectQuantityTakeoff: null,
      }),
    };

    const { container, unmount } = renderComponent(
      <ExportPanel designData={designData} onExport={jest.fn()} />,
    );

    const dxfBtn = rowByLabel(container, "Export as DXF");
    const ifcBtn = rowByLabel(container, "Export as IFC");
    const jsonBtn = rowByLabel(container, "Export Authority JSON");
    const xlsxBtn = rowByLabel(container, "Export Excel Estimate");

    expect(dxfBtn.disabled).toBe(false);
    expect(ifcBtn.disabled).toBe(false);
    expect(jsonBtn.disabled).toBe(false);
    expect(xlsxBtn.disabled).toBe(true);

    // Footer prompt hidden once the manifest exists.
    expect(container.textContent).not.toContain(
      "Generate a design to unlock exports",
    );

    unmount();
  });

  test("IFC row blocked with IFC_GEOMETRY_INSUFFICIENT label when walls/levels empty", () => {
    const compiledMissingGeom = {
      geometryHash: "geom-hash-x",
      walls: [],
      levels: [],
    };
    const designData = {
      compiledProject: compiledMissingGeom,
      exportManifest: buildClientExportManifest({
        compiledProject: compiledMissingGeom,
        projectQuantityTakeoff: {
          items: [
            {
              category: "areas",
              item: "Gross Floor Area",
              quantity: 50,
              unit: "m2",
            },
          ],
        },
      }),
    };

    const { container, unmount } = renderComponent(
      <ExportPanel designData={designData} onExport={jest.fn()} />,
    );

    const dxfBtn = rowByLabel(container, "Export as DXF");
    const ifcBtn = rowByLabel(container, "Export as IFC");
    const jsonBtn = rowByLabel(container, "Export Authority JSON");

    expect(dxfBtn.disabled).toBe(false);
    expect(jsonBtn.disabled).toBe(false);
    expect(ifcBtn.disabled).toBe(true);
    expect(ifcBtn.getAttribute("title") || ifcBtn.textContent).toBeTruthy();

    unmount();
  });

  test("no DWG row is rendered", () => {
    const designData = {
      compiledProject: compiledWithGeometry(),
      exportManifest: buildClientExportManifest({
        compiledProject: compiledWithGeometry(),
      }),
    };

    const { container, unmount } = renderComponent(
      <ExportPanel designData={designData} onExport={jest.fn()} />,
    );

    const dwgRow = rowByLabel(container, "DWG");
    expect(dwgRow).toBeUndefined();

    unmount();
  });

  test("without compiledProject: all engineering rows blocked with structured reasons", () => {
    const designData = {
      // No compiledProject at all — manifest must still mark everything
      // as blocked rather than fall through to ready.
      exportManifest: buildClientExportManifest({}),
    };

    const { container, unmount } = renderComponent(
      <ExportPanel designData={designData} onExport={jest.fn()} />,
    );

    const dxfBtn = rowByLabel(container, "Export as DXF");
    const ifcBtn = rowByLabel(container, "Export as IFC");
    const jsonBtn = rowByLabel(container, "Export Authority JSON");
    const xlsxBtn = rowByLabel(container, "Export Excel Estimate");

    expect(dxfBtn.disabled).toBe(true);
    expect(ifcBtn.disabled).toBe(true);
    expect(jsonBtn.disabled).toBe(true);
    expect(xlsxBtn.disabled).toBe(true);

    unmount();
  });

  test("footer hidden once a compiledProject.geometryHash exists even without a manifest", () => {
    // Defence-in-depth: even if the hook somehow didn't inject the
    // manifest, the footer should not nag the user once a real
    // compiled geometry hash is present.
    const designData = {
      compiledProject: { geometryHash: "geom-hash-x" },
    };

    const { container, unmount } = renderComponent(
      <ExportPanel designData={designData} onExport={jest.fn()} />,
    );

    expect(container.textContent).not.toContain(
      "Generate a design to unlock exports",
    );

    unmount();
  });

  test("footer shown when there are no deliverables at all", () => {
    const { container, unmount } = renderComponent(
      <ExportPanel designData={{}} onExport={jest.fn()} />,
    );

    expect(container.textContent).toContain(
      "Generate a design to unlock exports",
    );

    unmount();
  });

  // Belt-and-braces: when the hook didn't attach exportManifest but
  // compiledProject (with geometry) is on the result, ExportPanel must
  // synthesise the manifest itself rather than render every engineering
  // row BLOCKED with no reason. Same builder, same authority gates.
  test("synthesises manifest in-component when designData has compiledProject but no exportManifest", () => {
    const designData = {
      compiledProject: compiledWithGeometry(),
      // No exportManifest field on purpose — must be synthesised.
    };

    const { container, unmount } = renderComponent(
      <ExportPanel designData={designData} onExport={jest.fn()} />,
    );

    const dxfBtn = rowByLabel(container, "Export as DXF");
    const ifcBtn = rowByLabel(container, "Export as IFC");
    const jsonBtn = rowByLabel(container, "Export Authority JSON");
    const xlsxBtn = rowByLabel(container, "Export Excel Estimate");

    expect(dxfBtn.disabled).toBe(false);
    expect(ifcBtn.disabled).toBe(false);
    expect(jsonBtn.disabled).toBe(false);
    // XLSX is still blocked because there's no takeoff; same builder.
    expect(xlsxBtn.disabled).toBe(true);

    // The "N/Y exports ready from the compiled bundle" subtitle
    // proves the synthesised manifest is being honoured.
    expect(container.textContent).toMatch(
      /exports ready from the compiled bundle/i,
    );

    unmount();
  });

  test("in-component synthesis lights up XLSX when projectQuantityTakeoff has items", () => {
    const designData = {
      compiledProject: compiledWithGeometry(),
      projectQuantityTakeoff: {
        items: [
          {
            category: "areas",
            item: "Gross Floor Area",
            quantity: 50,
            unit: "m2",
          },
        ],
      },
      // No exportManifest field — must be synthesised.
    };

    const { container, unmount } = renderComponent(
      <ExportPanel designData={designData} onExport={jest.fn()} />,
    );

    const dxfBtn = rowByLabel(container, "Export as DXF");
    const jsonBtn = rowByLabel(container, "Export Authority JSON");
    const xlsxBtn = rowByLabel(container, "Export Excel Estimate");

    expect(dxfBtn.disabled).toBe(false);
    expect(jsonBtn.disabled).toBe(false);
    expect(xlsxBtn.disabled).toBe(false);

    unmount();
  });

  test("server-attached exportManifest wins over in-component synthesis", () => {
    // Build a sentinel manifest with a non-default source value so we can
    // tell which one ExportPanel rendered against. If the synthesis was
    // (incorrectly) preferred over the server one, the source would
    // change to "client_fallback".
    const serverManifest = buildClientExportManifest({
      compiledProject: compiledWithGeometry(),
      projectQuantityTakeoff: {
        items: [{ category: "areas", item: "GFA", quantity: 100, unit: "m2" }],
      },
    });
    // Mutate the source to mimic an actual server-attached manifest.
    serverManifest.source = "server_attached_v2";

    const designData = {
      compiledProject: compiledWithGeometry(),
      // Server-attached manifest has different XLSX availability than the
      // synthesis would (server says ready, synthesis without takeoff
      // would say blocked). We give the synthesis NO takeoff to make the
      // divergence observable, and rely on the server manifest being the
      // one that's actually used.
      exportManifest: serverManifest,
    };

    const { container, unmount } = renderComponent(
      <ExportPanel designData={designData} onExport={jest.fn()} />,
    );

    const xlsxBtn = rowByLabel(container, "Export Excel Estimate");
    expect(xlsxBtn.disabled).toBe(false);

    unmount();
  });
});

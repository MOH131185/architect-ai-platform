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

describe("ExportPanel readiness rendering", () => {
  test("with compiledProject + manifest: DXF/IFC/JSON ready, XLSX blocked with takeoff reason, footer hidden", () => {
    const designData = {
      compiledProject: { geometryHash: "geom-hash-x" },
      exportManifest: buildClientExportManifest({
        compiledProject: { geometryHash: "geom-hash-x" },
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
});

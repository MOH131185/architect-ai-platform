/**
 * Phase 3 audit response — XLSX row renders amber "requires review"
 * when the client export manifest flags missing rates or a fallback
 * rate card. Codex caught that the XLSX row stayed plain green READY
 * even when the cost workbook would ship with incomplete cost data.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ExportPanel from "../../components/ExportPanel.jsx";

jest.mock("../../components/ui/feedback/Tooltip.jsx", () => ({
  Tooltip: ({ children }) => <>{children}</>,
}));
jest.mock("../../components/ui/feedback/Tooltip", () => ({
  Tooltip: ({ children }) => <>{children}</>,
}));

const mockToast = {
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
};
jest.mock("../../components/ui/ToastProvider.jsx", () => ({
  useToastContext: () => ({ toast: mockToast }),
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
  return [...container.querySelectorAll("button")].find((button) =>
    button.textContent.includes(label),
  );
}

const BASE_DATA = {
  projectName: "XLSX requires review smoke",
  geometryHash: "geom-xlsx-001",
  compiledProject: { geometryHash: "geom-xlsx-001" },
  a1ExportQa: { status: "pass", allowed: true, blockers: [], warnings: [] },
};

describe("ExportPanel — XLSX requires-review rendering (Codex audit)", () => {
  beforeEach(() => {
    mockToast.success.mockClear();
    mockToast.error.mockClear();
    mockToast.warning.mockClear();
  });

  test("plain READY when XLSX manifest entry is available + no requiresReview flag", () => {
    const designData = {
      ...BASE_DATA,
      exportManifest: {
        schema_version: "compiled-export-manifest-v1",
        exports: {
          dxf: { available: true, format: "DXF" },
          ifc: { available: false, format: "IFC", blockedReason: "x" },
          json: { available: true, format: "JSON" },
          xlsx: { available: true, format: "XLSX" },
        },
      },
    };
    const { container, unmount } = renderComponent(
      <ExportPanel designData={designData} onExport={() => {}} />,
    );
    try {
      const xlsxRow = rowByLabel(container, "Export Excel Estimate");
      expect(xlsxRow).toBeTruthy();
      expect(xlsxRow.getAttribute("data-export-status")).toBe("ready");
      expect(xlsxRow.getAttribute("data-export-degraded")).toBeNull();
    } finally {
      unmount();
    }
  });

  test("amber 'REQUIRES REVIEW' when manifest entry sets requiresReview:true", () => {
    const designData = {
      ...BASE_DATA,
      exportManifest: {
        schema_version: "compiled-export-manifest-v1",
        exports: {
          dxf: { available: true, format: "DXF" },
          ifc: { available: false, format: "IFC", blockedReason: "x" },
          json: { available: true, format: "JSON" },
          xlsx: {
            available: true,
            format: "XLSX",
            requiresReview: true,
            requiresReviewReason:
              "MISSING_RATES: 2 of 6 takeoff items are unpriced (coverage 67%) — reviewer must price manually.",
          },
        },
      },
    };
    const { container, unmount } = renderComponent(
      <ExportPanel designData={designData} onExport={() => {}} />,
    );
    try {
      const xlsxRow = rowByLabel(container, "Export Excel Estimate");
      expect(xlsxRow).toBeTruthy();
      expect(xlsxRow.getAttribute("data-export-status")).toBe("degraded");
      expect(xlsxRow.getAttribute("data-export-degraded")).toBe("true");
      // Chip label must replace the green READY with the amber
      // "REQUIRES REVIEW" so reviewers can't mistake the row for a
      // clean export.
      expect(xlsxRow.textContent).toMatch(/REQUIRES REVIEW/);
      expect(xlsxRow.textContent).not.toMatch(/\bREADY\b/);
      // Subtitle carries the structured reason.
      const subtitle = xlsxRow.querySelector(
        '[data-testid="export-degraded-subtitle"]',
      );
      expect(subtitle).toBeTruthy();
      expect(subtitle.textContent).toMatch(/MISSING_RATES/);
      // Row stays clickable — the user CAN download a workbook with
      // missing rates after reviewing; the badge is the safeguard.
      expect(xlsxRow.disabled).toBe(false);
    } finally {
      unmount();
    }
  });

  test("amber 'REQUIRES REVIEW' covers RATE_CARD_FALLBACK as well", () => {
    const designData = {
      ...BASE_DATA,
      exportManifest: {
        schema_version: "compiled-export-manifest-v1",
        exports: {
          dxf: { available: true, format: "DXF" },
          ifc: { available: false, format: "IFC", blockedReason: "x" },
          json: { available: true, format: "JSON" },
          xlsx: {
            available: true,
            format: "XLSX",
            requiresReview: true,
            requiresReviewReason:
              "RATE_CARD_FALLBACK: rate card is a residential proxy — adjust rates before issuing.",
          },
        },
      },
    };
    const { container, unmount } = renderComponent(
      <ExportPanel designData={designData} onExport={() => {}} />,
    );
    try {
      const xlsxRow = rowByLabel(container, "Export Excel Estimate");
      expect(xlsxRow.getAttribute("data-export-status")).toBe("degraded");
      expect(xlsxRow.textContent).toMatch(/RATE_CARD_FALLBACK/);
    } finally {
      unmount();
    }
  });
});

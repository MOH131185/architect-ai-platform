/**
 * Track 1 (Phase 1) + Codex audit response: degraded sheet export rows
 * must NEVER render as plain green READY.
 *
 * When `a1ExportQa.degradedExport === true` (readability/graphic blockers
 * only, PDF was emitted with a PRELIMINARY watermark), the PDF and PNG
 * rows in ExportPanel must:
 *
 *   - render `data-export-status="degraded"` instead of "ready"
 *   - render `data-export-degraded="true"`
 *   - show the "NOT FINAL — not for issue or construction" subtitle
 *   - stay clickable (the watermarked PDF is meant to be downloaded)
 *   - display the amber PRELIMINARY status chip via StatusChip's "warning"
 *     variant, not the green READY chip
 *
 * The dedicated `a1-qa-degraded-banner` must render alongside, with the
 * Copy QA report button accessible.
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

const baseDesignData = {
  projectName: "Degraded Export Smoke",
  geometryHash: "geom-degraded-001",
  compiledProject: { geometryHash: "geom-degraded-001" },
  exportManifest: {
    pdf: { available: true },
    png: { available: true },
    dxf: { available: false, blockedReason: "Not part of this bundle." },
  },
};

describe("ExportPanel — degraded sheet export rows (Codex audit regression)", () => {
  beforeEach(() => {
    mockToast.success.mockClear();
    mockToast.error.mockClear();
    mockToast.warning.mockClear();
  });

  test("degraded a1ExportQa marks PDF/PNG rows as degraded, NOT ready", () => {
    const designData = {
      ...baseDesignData,
      a1ExportQa: {
        status: "degraded",
        allowed: true,
        degradedExport: true,
        blockers: [
          {
            code: "TEXT_PROOF_TOFU",
            category: "readability",
            severity: "blocker",
            message: "Tofu glyphs detected in panel caption band.",
          },
        ],
        warnings: [],
      },
    };

    const { container, unmount } = renderComponent(
      <ExportPanel designData={designData} onExport={() => {}} />,
    );

    try {
      const pdfRow = rowByLabel(container, "Export as PDF");
      const pngRow = rowByLabel(container, "Export as PNG");
      expect(pdfRow).toBeTruthy();
      expect(pngRow).toBeTruthy();

      // PRIMARY ASSERTIONS — degraded must NOT look like ready.
      expect(pdfRow.getAttribute("data-export-status")).toBe("degraded");
      expect(pdfRow.getAttribute("data-export-degraded")).toBe("true");
      expect(pngRow.getAttribute("data-export-status")).toBe("degraded");
      expect(pngRow.getAttribute("data-export-degraded")).toBe("true");

      // The watermarked PDF/PNG must still be downloadable — degraded
      // rows are not disabled, only blocked rows are.
      expect(pdfRow.disabled).toBe(false);
      expect(pngRow.disabled).toBe(false);

      // The "NOT FINAL — not for issue or construction" subtitle is
      // rendered inline.
      const pdfSubtitle = pdfRow.querySelector(
        '[data-testid="export-degraded-subtitle"]',
      );
      expect(pdfSubtitle).toBeTruthy();
      expect(pdfSubtitle.textContent).toMatch(
        /NOT FINAL — not for issue or construction/i,
      );

      // The chip label is PRELIMINARY, not READY.
      expect(pdfRow.textContent).toMatch(/PRELIMINARY/);
      expect(pdfRow.textContent).not.toMatch(/\bREADY\b/);
      expect(pngRow.textContent).toMatch(/PRELIMINARY/);
      expect(pngRow.textContent).not.toMatch(/\bREADY\b/);
    } finally {
      unmount();
    }
  });

  test("degraded a1ExportQa renders the dedicated degraded banner with structured blockers", () => {
    const designData = {
      ...baseDesignData,
      a1ExportQa: {
        status: "degraded",
        allowed: true,
        degradedExport: true,
        blockers: [
          {
            code: "RENDER_SANITY_LOW_OCCUPANCY",
            category: "graphic",
            severity: "blocker",
            message: "Panel below 5% ink occupancy.",
          },
        ],
        warnings: [],
      },
    };

    const { container, unmount } = renderComponent(
      <ExportPanel designData={designData} onExport={() => {}} />,
    );

    try {
      const banner = container.querySelector(
        '[data-testid="a1-qa-degraded-banner"]',
      );
      expect(banner).toBeTruthy();
      expect(banner.getAttribute("data-a1-qa-status")).toBe("degraded");
      // Structured blocker entry shows category + code.
      const entry = banner.querySelector(
        '[data-a1-qa-code="RENDER_SANITY_LOW_OCCUPANCY"]',
      );
      expect(entry).toBeTruthy();
      expect(entry.getAttribute("data-a1-qa-category")).toBe("graphic");
      // Copy QA report button is reachable from the degraded banner.
      const copy = banner.querySelector('[data-testid="a1-qa-copy-report"]');
      expect(copy).toBeTruthy();

      // The hard-blocked banner must NOT also be rendered — exclusivity
      // invariant.
      expect(
        container.querySelector('[data-testid="a1-qa-blocked-banner"]'),
      ).toBeNull();
    } finally {
      unmount();
    }
  });

  test("hard-blocked a1ExportQa still disables PDF/PNG rows (regression guard)", () => {
    // Defence in depth: confirm the degraded path didn't accidentally
    // soften hard-blocked rows.
    const designData = {
      ...baseDesignData,
      a1ExportQa: {
        status: "blocked",
        allowed: false,
        degradedExport: false,
        blockers: [
          {
            code: "GEOMETRY_HASH_MISSING",
            category: "authority",
            severity: "blocker",
            message: "Compiled geometry hash is empty.",
          },
        ],
        warnings: [],
      },
    };

    const { container, unmount } = renderComponent(
      <ExportPanel designData={designData} onExport={() => {}} />,
    );

    try {
      const pdfRow = rowByLabel(container, "Export as PDF");
      const pngRow = rowByLabel(container, "Export as PNG");
      expect(pdfRow.disabled).toBe(true);
      expect(pngRow.disabled).toBe(true);
      expect(pdfRow.getAttribute("data-export-status")).toBe("blocked");
      expect(pngRow.getAttribute("data-export-status")).toBe("blocked");
      // The degraded banner must NOT render in the hard-blocked state.
      expect(
        container.querySelector('[data-testid="a1-qa-degraded-banner"]'),
      ).toBeNull();
      // The blocked banner IS rendered.
      expect(
        container.querySelector('[data-testid="a1-qa-blocked-banner"]'),
      ).toBeTruthy();
    } finally {
      unmount();
    }
  });

  test("clean a1ExportQa leaves PDF/PNG rows as plain ready (no false degradation)", () => {
    const designData = {
      ...baseDesignData,
      a1ExportQa: {
        status: "pass",
        allowed: true,
        degradedExport: false,
        blockers: [],
        warnings: [],
      },
    };

    const { container, unmount } = renderComponent(
      <ExportPanel designData={designData} onExport={() => {}} />,
    );

    try {
      const pdfRow = rowByLabel(container, "Export as PDF");
      const pngRow = rowByLabel(container, "Export as PNG");
      expect(pdfRow.getAttribute("data-export-status")).toBe("ready");
      expect(pngRow.getAttribute("data-export-status")).toBe("ready");
      expect(pdfRow.getAttribute("data-export-degraded")).toBeNull();
      expect(pngRow.getAttribute("data-export-degraded")).toBeNull();
      expect(pdfRow.disabled).toBe(false);
      expect(pngRow.disabled).toBe(false);
      // No QA banners rendered on a clean pass.
      expect(
        container.querySelector('[data-testid="a1-qa-degraded-banner"]'),
      ).toBeNull();
      expect(
        container.querySelector('[data-testid="a1-qa-blocked-banner"]'),
      ).toBeNull();
      expect(
        container.querySelector('[data-testid="a1-qa-warning-banner"]'),
      ).toBeNull();
    } finally {
      unmount();
    }
  });
});

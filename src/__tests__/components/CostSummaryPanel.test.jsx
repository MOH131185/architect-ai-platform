/**
 * Phase 3 (Track 5) — CostSummaryPanel rendering contract.
 *
 * The panel reads a `cost-summary-v1` object from `designData.costSummary`
 * and renders:
 *   - total £ + low/high confidence range chip
 *   - £ / m² GIA
 *   - contingency line
 *   - top 5 cost drivers
 *   - RATE_CARD_FALLBACK amber banner when applicable
 *   - "Download cost workbook" button that fires `onDownloadWorkbook`
 *
 * Empty state: when costSummary is null, the panel renders a placeholder
 * card so legacy / pre-Phase-3 history records degrade gracefully.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import CostSummaryPanel from "../../components/CostSummaryPanel.jsx";

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

const SAMPLE_SUMMARY = {
  schemaVersion: "cost-summary-v1",
  currency: "GBP",
  totalGbp: 425000,
  totalLowGbp: 380000,
  totalHighGbp: 480000,
  gia: 120,
  costPerSqm: 3541,
  contingencyPercent: 10,
  contingencyAllowanceGbp: 42500,
  contingentTotalGbp: 467500,
  topDrivers: [
    {
      itemCode: "areas-gross-floor-area",
      description: "Gross Floor Area",
      category: "areas",
      subtotal: 198000,
      subtotalLow: 182000,
      subtotalHigh: 218000,
    },
    {
      itemCode: "envelope-glazing-area",
      description: "Glazing Area",
      category: "envelope",
      subtotal: 62400,
      subtotalLow: 54912,
      subtotalHigh: 71760,
    },
    {
      itemCode: "envelope-external-wall-area",
      description: "External Wall Area",
      category: "envelope",
      subtotal: 37500,
      subtotalLow: 33000,
      subtotalHigh: 43125,
    },
  ],
  rateCardId: "uk_residential_v2",
  rateCardKey: "residential",
  rateCardFallbackWarning: null,
  qualityTier: "mid",
  region: "uk-average",
  qualityFactor: 1,
  regionFactor: 1,
  buildingType: "residential",
  geometryHash: "geom-cost-panel-001",
};

describe("CostSummaryPanel", () => {
  test("empty state renders a placeholder when costSummary is null", () => {
    const { container, unmount } = renderComponent(
      <CostSummaryPanel costSummary={null} />,
    );
    try {
      const empty = container.querySelector(
        '[data-testid="cost-summary-panel-empty"]',
      );
      expect(empty).toBeTruthy();
      expect(empty.textContent).toMatch(/Cost Estimate/i);
      expect(
        container.querySelector('[data-testid="cost-summary-panel"]'),
      ).toBeNull();
    } finally {
      unmount();
    }
  });

  test("renders the headline total + range + £/m² when a summary is supplied", () => {
    const { container, unmount } = renderComponent(
      <CostSummaryPanel costSummary={SAMPLE_SUMMARY} />,
    );
    try {
      const panel = container.querySelector(
        '[data-testid="cost-summary-panel"]',
      );
      expect(panel).toBeTruthy();
      const total = panel.querySelector('[data-testid="cost-summary-total"]');
      expect(total).toBeTruthy();
      expect(total.textContent).toContain("£425,000");
      const range = panel.querySelector('[data-testid="cost-summary-range"]');
      expect(range).toBeTruthy();
      expect(range.textContent).toContain("£380,000");
      expect(range.textContent).toContain("£480,000");
      const perSqm = panel.querySelector(
        '[data-testid="cost-summary-per-sqm"]',
      );
      expect(perSqm).toBeTruthy();
      expect(perSqm.textContent).toContain("£3,541");
      expect(perSqm.textContent).toContain("120 m² GIA");
    } finally {
      unmount();
    }
  });

  test("renders the contingency line with percent + allowance + contingent subtotal", () => {
    const { container, unmount } = renderComponent(
      <CostSummaryPanel costSummary={SAMPLE_SUMMARY} />,
    );
    try {
      const contingency = container.querySelector(
        '[data-testid="cost-summary-contingency"]',
      );
      expect(contingency).toBeTruthy();
      expect(contingency.textContent).toContain("10%");
      expect(contingency.textContent).toContain("£42,500");
      expect(contingency.textContent).toContain("£467,500");
    } finally {
      unmount();
    }
  });

  test("renders the top 5 cost drivers in subtotal order", () => {
    const { container, unmount } = renderComponent(
      <CostSummaryPanel costSummary={SAMPLE_SUMMARY} />,
    );
    try {
      const drivers = [
        ...container.querySelectorAll(
          '[data-testid="cost-summary-driver-row"]',
        ),
      ];
      expect(drivers.length).toBe(SAMPLE_SUMMARY.topDrivers.length);
      expect(drivers[0].getAttribute("data-driver-code")).toBe(
        "areas-gross-floor-area",
      );
      expect(drivers[0].textContent).toContain("Gross Floor Area");
      expect(drivers[0].textContent).toContain("£198,000");
    } finally {
      unmount();
    }
  });

  test("RATE_CARD_FALLBACK warning renders an amber banner", () => {
    const summary = {
      ...SAMPLE_SUMMARY,
      rateCardFallbackWarning: {
        code: "RATE_CARD_FALLBACK",
        message:
          "No rate card for buildingType=factory; using uk_residential_v2 as proxy. Reviewer should adjust rates manually.",
      },
    };
    const { container, unmount } = renderComponent(
      <CostSummaryPanel costSummary={summary} />,
    );
    try {
      const banner = container.querySelector(
        '[data-testid="cost-summary-fallback-banner"]',
      );
      expect(banner).toBeTruthy();
      expect(banner.textContent).toContain("RATE_CARD_FALLBACK");
      expect(banner.textContent).toContain("uk_residential_v2");
    } finally {
      unmount();
    }
  });

  test("download button fires onDownloadWorkbook when clicked", () => {
    const handler = jest.fn();
    const { container, unmount } = renderComponent(
      <CostSummaryPanel
        costSummary={SAMPLE_SUMMARY}
        onDownloadWorkbook={handler}
      />,
    );
    try {
      const button = container.querySelector(
        '[data-testid="cost-summary-download"]',
      );
      expect(button).toBeTruthy();
      expect(button.disabled).toBe(false);
      act(() => {
        button.click();
      });
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      unmount();
    }
  });

  test("download button is disabled when no handler is supplied", () => {
    const { container, unmount } = renderComponent(
      <CostSummaryPanel costSummary={SAMPLE_SUMMARY} />,
    );
    try {
      const button = container.querySelector(
        '[data-testid="cost-summary-download"]',
      );
      expect(button.disabled).toBe(true);
    } finally {
      unmount();
    }
  });
});

/**
 * Phase 3 (Track 5) — Cost Summary Panel.
 *
 * Renders the headline cost numbers the pipeline produced via
 * `buildCostSummary({compiledProject, takeoff})`: total £ + low/high
 * confidence range + £/m² GIA + top 5 cost drivers, plus a download
 * link for the full xlsx workbook.
 *
 * Props (all optional — panel renders an empty-state stub when absent):
 *   costSummary      — the structured cost-summary-v1 object produced by
 *                      buildCostSummary. Null/undefined → empty state.
 *   onDownloadWorkbook — handler invoked when the user clicks the
 *                      "Download cost workbook" button. Receives no
 *                      args. Parent decides whether to fire the xlsx
 *                      export route, save-to-history, etc.
 *
 * Visual contract: amber `RATE_CARD_FALLBACK` banner when the rate
 * card resolver fell back to residential as a proxy — reviewers need
 * to know the per-typology rates weren't a direct match before they
 * sign off on the total.
 */

import React from "react";
import { TrendingUp, AlertTriangle, FileSpreadsheet } from "lucide-react";
import Card from "./ui/Card.jsx";

function formatGbp(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function formatGbpPerM2(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  return `${new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(Number(value))}/m²`;
}

const CostSummaryPanel = ({ costSummary = null, onDownloadWorkbook }) => {
  if (!costSummary) {
    return (
      <Card
        variant="glass"
        padding="md"
        className="cost-summary-panel"
        data-testid="cost-summary-panel-empty"
      >
        <div className="mb-1 text-eyebrow">Cost Estimate</div>
        <p className="text-[12px] leading-snug text-white/55">
          Generate a design to see the preliminary cost estimate. Cost coverage
          is preliminary (Stage 2) — reviewer adjustment required before issuing
          as a cost plan.
        </p>
      </Card>
    );
  }

  const {
    totalGbp,
    totalLowGbp,
    totalHighGbp,
    gia,
    costPerSqm,
    contingencyPercent,
    contingencyAllowanceGbp,
    contingentTotalGbp,
    topDrivers = [],
    rateCardId,
    rateCardFallbackWarning,
    qualityTier,
    region,
  } = costSummary;

  const hasFallback = Boolean(rateCardFallbackWarning);

  return (
    <Card
      variant="glass"
      padding="md"
      className="cost-summary-panel"
      data-testid="cost-summary-panel"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-eyebrow">Cost Estimate</div>
          <div className="mt-0.5 text-[11px] text-white/55">
            {rateCardId
              ? `${rateCardId} · ${qualityTier} quality · ${region}`
              : "rate card missing"}
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-200"
          data-testid="cost-summary-stage"
          title="Stage 2 design estimate — preliminary, reviewer adjustment required."
        >
          <TrendingUp className="h-3 w-3" strokeWidth={2} />
          Stage 2
        </span>
      </div>

      {hasFallback && (
        <div
          className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200"
          data-testid="cost-summary-fallback-banner"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle
              className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-300"
              strokeWidth={2}
            />
            <div>
              <span className="font-medium">
                {rateCardFallbackWarning.code}
              </span>
              <span className="ml-1 opacity-90">
                {rateCardFallbackWarning.message}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
          data-testid="cost-summary-total"
        >
          <div className="text-eyebrow text-white/55">Total</div>
          <div className="mt-1 text-lg font-semibold text-white/95 tabular-nums">
            {formatGbp(totalGbp)}
          </div>
          {(totalLowGbp != null || totalHighGbp != null) && (
            <div
              className="mt-0.5 text-[10px] text-white/55 tabular-nums"
              data-testid="cost-summary-range"
            >
              {formatGbp(totalLowGbp)} – {formatGbp(totalHighGbp)}
            </div>
          )}
        </div>
        <div
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"
          data-testid="cost-summary-per-sqm"
        >
          <div className="text-eyebrow text-white/55">£ / m² GIA</div>
          <div className="mt-1 text-lg font-semibold text-white/95 tabular-nums">
            {formatGbpPerM2(costPerSqm)}
          </div>
          <div className="mt-0.5 text-[10px] text-white/55 tabular-nums">
            {gia ? `${Number(gia).toFixed(0)} m² GIA` : "—"}
          </div>
        </div>
      </div>

      {contingencyAllowanceGbp != null && (
        <div
          className="mb-4 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-white/70"
          data-testid="cost-summary-contingency"
        >
          <span className="text-eyebrow mr-2 text-white/55">Contingency</span>
          <span className="tabular-nums">
            {contingencyPercent}% = {formatGbp(contingencyAllowanceGbp)}
          </span>
          {contingentTotalGbp != null && (
            <span className="ml-2 text-white/55">
              · Contingent subtotal {formatGbp(contingentTotalGbp)}
            </span>
          )}
        </div>
      )}

      {topDrivers.length > 0 && (
        <div className="mb-4" data-testid="cost-summary-drivers">
          <div className="text-eyebrow mb-1.5 text-white/55">
            Top Cost Drivers
          </div>
          <ol className="space-y-1">
            {topDrivers.map((driver, idx) => (
              <li
                key={driver.itemCode || idx}
                className="flex items-start justify-between gap-3 text-[11px] text-white/75"
                data-testid="cost-summary-driver-row"
                data-driver-code={driver.itemCode}
              >
                <span className="truncate">
                  <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-sm border border-white/15 text-[9px] text-white/50 tabular-nums">
                    {idx + 1}
                  </span>
                  {driver.description}
                </span>
                <span className="flex-shrink-0 font-medium tabular-nums text-white/85">
                  {formatGbp(driver.subtotal)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <button
        type="button"
        onClick={onDownloadWorkbook}
        disabled={typeof onDownloadWorkbook !== "function"}
        className="group flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition-all duration-200 hover:border-white/20 hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-royal-500/30 disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="cost-summary-download"
      >
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-royal-600/20 bg-royal-600/10 text-royal-300">
          <FileSpreadsheet className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <span className="flex flex-1 min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-white/85">
            Download cost workbook
          </span>
          <span className="mt-0.5 truncate text-[11px] leading-snug text-white/55">
            7-sheet xlsx · includes Risk &amp; Contingency
          </span>
        </span>
      </button>
    </Card>
  );
};

export default CostSummaryPanel;
export { CostSummaryPanel };

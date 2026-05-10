/**
 * Regression lock-in for the missing-TooltipProvider crash.
 *
 * Without a TooltipProvider mounted at the app root, every component that
 * renders <Tooltip> (radix-ui) throws:
 *
 *   Error: `Tooltip` must be used within `TooltipProvider`
 *
 * ExportPanel uses <Tooltip> in ExportRow, so opening the
 * "DXF / BIM / Cost Export" surface from ResultsStep crashes into the
 * AsyncErrorBoundary in dev. Production may differ silently.
 *
 * This test asserts:
 *   1. App.js imports TooltipProvider from the canonical Tooltip module.
 *   2. App.js wraps its tree with <TooltipProvider> (i.e. the import is
 *      actually used, not dead).
 *   3. The Tooltip module still exports TooltipProvider (catch a future
 *      rename / removal in the UI layer).
 */

const fs = require("fs");
const path = require("path");

describe("App root TooltipProvider mount", () => {
  test("App.js imports TooltipProvider from the Tooltip module", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../App.js"),
      "utf8",
    );
    expect(source).toMatch(
      /import\s*\{\s*[^}]*\bTooltipProvider\b[^}]*\}\s*from\s*["'][^"']*Tooltip(?:\.jsx)?["']/,
    );
  });

  test("App.js wraps its tree with <TooltipProvider>", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../App.js"),
      "utf8",
    );
    expect(source).toMatch(/<TooltipProvider\b[\s\S]*<\/TooltipProvider>/);
  });

  test("Tooltip module still exports TooltipProvider", () => {
    const tooltipSource = fs.readFileSync(
      path.resolve(__dirname, "../components/ui/feedback/Tooltip.jsx"),
      "utf8",
    );
    expect(tooltipSource).toMatch(/export\s*\{[^}]*\bTooltipProvider\b[^}]*\}/);
  });
});

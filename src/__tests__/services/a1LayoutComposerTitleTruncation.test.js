/**
 * Title block truncation / wrap.
 *
 * Long project names and addresses (e.g.
 *   "190 Corporation St, Birmingham B4 6QD")
 * previously overflowed the A1 title block and overlapped the building-
 * type label. The deterministic fit helpers split on a natural comma
 * break and truncate with an ellipsis as a fallback so the header
 * stays readable regardless of input length.
 */

import { __titleBlockInternals } from "../../services/a1LayoutComposer.js";

const { fitMaxChars, fitTitleText, splitTitleAcrossLines } =
  __titleBlockInternals;

describe("title block fit helpers", () => {
  test("fitMaxChars returns more characters for wider title blocks", () => {
    const narrow = fitMaxChars(240, 22);
    const wide = fitMaxChars(600, 22);
    expect(wide).toBeGreaterThan(narrow);
    expect(narrow).toBeGreaterThanOrEqual(8);
  });

  test("fitTitleText leaves short titles untouched", () => {
    const fitted = fitTitleText("Office Studio", 400, 22);
    expect(fitted).toBe("Office Studio");
  });

  test("fitTitleText truncates long titles with an ellipsis", () => {
    const long = "A very very very very long project name that overflows";
    const fitted = fitTitleText(long, 240, 22);
    expect(fitted.endsWith("…")).toBe(true);
    expect(fitted.length).toBeLessThan(long.length);
  });

  test("splitTitleAcrossLines wraps a comma-separated address onto two lines", () => {
    const lines = splitTitleAcrossLines(
      "190 Corporation St, Birmingham B4 6QD",
      280,
      22,
    );
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe("190 Corporation St");
    expect(lines[1]).toBe("Birmingham B4 6QD");
  });

  test("splitTitleAcrossLines falls back to truncation when no comma break exists", () => {
    const lines = splitTitleAcrossLines(
      "ThisIsAVeryLongUnbrokenProjectNameThatHasNoCommaSeparators",
      240,
      22,
    );
    expect(lines.length).toBe(1);
    expect(lines[0].endsWith("…")).toBe(true);
  });

  test("short title that fits on one line is not split even when it has a comma", () => {
    const lines = splitTitleAcrossLines("A, B", 800, 22);
    expect(lines).toEqual(["A, B"]);
  });
});

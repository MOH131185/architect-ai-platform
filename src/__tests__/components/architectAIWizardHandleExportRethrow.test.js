/**
 * Phase 1 export-fix: structural regression test for the `handleExport`
 * rethrow.
 *
 * `handleExport` is defined inline inside ArchitectAIWizardContainer via
 * `useCallback`, so it can't be unit-tested in isolation without mounting
 * the entire component tree (which the project's other component tests do
 * with heavy mocking). A focused, low-cost regression marker is to assert
 * the source contains the rethrow pattern: a `throw err` immediately after
 * the `logger.error(...)` call in each export handler. If a future refactor
 * removes the rethrow and reintroduces the silent-success bug, this test
 * fails loudly with a pointer to the exact handler.
 *
 * Background: when handleExport caught and swallowed the error, the caller
 * in ExportPanel saw an undefined return value and rendered a "complete"
 * status toast even after a 413 or invalid-blob failure. With the rethrow,
 * the failure propagates and the UI surfaces the real error.
 */

import fs from "fs";
import path from "path";

const SOURCE = fs.readFileSync(
  path.resolve(__dirname, "../../components/ArchitectAIWizardContainer.jsx"),
  "utf8",
);

function handlerBody(name) {
  const opener = `const ${name} = useCallback(`;
  const start = SOURCE.indexOf(opener);
  if (start < 0) return null;
  // Match the matching closing paren of useCallback by tracking depth.
  let depth = 0;
  let i = start + opener.length;
  while (i < SOURCE.length) {
    const ch = SOURCE[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      if (depth === 0) return SOURCE.slice(start, i + 1);
      depth -= 1;
    }
    i += 1;
  }
  return null;
}

const HANDLERS = ["handleExport", "handleExportCAD", "handleExportBIM"];

describe("ArchitectAIWizardContainer export handlers — rethrow after logging", () => {
  for (const name of HANDLERS) {
    test(`${name} rethrows after logger.error so ExportPanel sees failures`, () => {
      const body = handlerBody(name);
      expect(body).toBeTruthy();
      // The handler must contain a `throw err` AFTER `logger.error(...)` inside
      // the catch block. Pattern: `logger.error(... err); throw err;`
      const rethrowPattern =
        /logger\.error\([^)]*err[^)]*\)\s*;\s*throw\s+err\s*;/;
      expect(body).toMatch(rethrowPattern);
    });
  }
});

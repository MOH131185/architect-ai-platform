/**
 * Phase 1 export-fix — slice handler master-SVG persistence precheck.
 *
 * `persistMasterSvgForExport` computes the ACTUAL URL-encoded data URL byte
 * count (the prior approximate `svgString.length * 2 + 64` over- and under-
 * counted in opposite directions for different sheet contents) and only
 * writes to disk / durable storage when the encoded size exceeds the inline
 * budget. This suite exercises both transports against the in-memory and
 * filesystem adapters and the env-driven `resolveComposeOutputDir`.
 */

import fs from "fs";
import path from "path";
import os from "os";

import { persistMasterSvgForExport } from "../../../api/project/generate-vertical-slice.js";
import {
  createInMemoryArtifactStorageAdapter,
  setDefaultArtifactStorageAdapter,
  clearInMemoryArtifactStorage,
  BLOB_KIND_A1_SHEET_SVG,
} from "../../services/export/artifactStorageService.js";

let originalComposeOutputDir;
let composeOutputDir;

beforeEach(() => {
  composeOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), "slice-svg-"));
  originalComposeOutputDir = process.env.A1_COMPOSE_OUTPUT_DIR;
  process.env.A1_COMPOSE_OUTPUT_DIR = composeOutputDir;
  clearInMemoryArtifactStorage();
});

afterEach(() => {
  if (originalComposeOutputDir === undefined) {
    delete process.env.A1_COMPOSE_OUTPUT_DIR;
  } else {
    process.env.A1_COMPOSE_OUTPUT_DIR = originalComposeOutputDir;
  }
  try {
    fs.rmSync(composeOutputDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  setDefaultArtifactStorageAdapter(null);
  clearInMemoryArtifactStorage();
});

function buildResult(svgString) {
  return {
    success: true,
    projectGraph: { project_id: "test-proj" },
    artifacts: { a1Sheet: { svgString } },
  };
}

describe("persistMasterSvgForExport — encoded-byte precheck", () => {
  test("under inline budget: no svgOutputFile, no svgArtifactRef", async () => {
    // A ~5 KB ASCII SVG encodes to ~5 KB even percent-escaped, well under
    // the 220 KB budget. The function returns early; no disk write.
    const small = "<svg>" + "x".repeat(5 * 1024) + "</svg>";
    const result = buildResult(small);
    await persistMasterSvgForExport(result, { packageId: "pkg-small" });
    expect(result.artifacts.a1Sheet.svgOutputFile).toBeUndefined();
    expect(result.artifacts.a1Sheet.svgArtifactRef).toBeUndefined();
  });

  test("over inline budget: writes file to compose-output dir + sets svgUrl/svgOutputFile", async () => {
    // A repeated-`<` payload percent-escapes to %3C — 3x size — so this
    // ~80 KB SVG explodes past the 220 KB encoded budget and forces
    // persistence. The previous approximate check would have missed it.
    const heavy = "<svg>" + "<".repeat(80 * 1024) + "</svg>";
    const result = buildResult(heavy);
    await persistMasterSvgForExport(result, { packageId: "pkg-heavy" });

    const a1 = result.artifacts.a1Sheet;
    expect(a1.transport).toBe("file");
    expect(typeof a1.svgOutputFile).toBe("string");
    expect(typeof a1.svgUrl).toBe("string");
    expect(a1.svgUrl).toMatch(/^\/api\/a1\/compose-output\/a1-.*\.svg$/);
    // File should actually exist on disk under the compose-output dir.
    expect(fs.existsSync(a1.svgOutputFile)).toBe(true);
    expect(fs.readFileSync(a1.svgOutputFile, "utf8")).toBe(heavy);
  });

  test("over inline budget: writes durable blob via storage adapter and sets svgArtifactRef", async () => {
    // The default adapter resolves to in-memory in this test env, which is
    // NOT production-durable; the slice flag (`available`) reflects that
    // and the blob is still written so same-instance reads work.
    const adapter = createInMemoryArtifactStorageAdapter();
    setDefaultArtifactStorageAdapter(adapter);

    const heavy = "<svg>" + "<".repeat(80 * 1024) + "</svg>";
    const result = buildResult(heavy);
    await persistMasterSvgForExport(result, { packageId: "pkg-blob" });

    const ref = result.artifacts.a1Sheet.svgArtifactRef;
    expect(ref).toBeTruthy();
    expect(ref.packageId).toBe("pkg-blob");
    expect(ref.kind).toBe(BLOB_KIND_A1_SHEET_SVG);
    expect(ref.adapter).toBe("memory");
    // In-memory is not production-durable — `available` must be false so the
    // export client falls back to svgOutputFile / inline.
    expect(ref.productionDurable).toBe(false);
    expect(ref.available).toBe(false);

    // The actual bytes round-trip through the adapter.
    const got = await adapter.getBlobArtifact({
      packageId: "pkg-blob",
      kind: BLOB_KIND_A1_SHEET_SVG,
    });
    expect(got.found).toBe(true);
    expect(Buffer.from(got.bytes).toString("utf8")).toBe(heavy);
  });

  test("missing svgString is a no-op", async () => {
    const result = { success: true, artifacts: { a1Sheet: {} } };
    await persistMasterSvgForExport(result, { packageId: "pkg" });
    expect(result.artifacts.a1Sheet.svgOutputFile).toBeUndefined();
    expect(result.artifacts.a1Sheet.svgArtifactRef).toBeUndefined();
  });

  test("unsuccessful result is a no-op", async () => {
    const result = {
      success: false,
      artifacts: { a1Sheet: { svgString: "<svg></svg>" } },
    };
    await persistMasterSvgForExport(result, { packageId: "pkg" });
    expect(result.artifacts.a1Sheet.svgOutputFile).toBeUndefined();
  });
});

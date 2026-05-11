/**
 * exportService.exportDeliverablesPackage — compact-ref dispatch
 *
 * Asserts that when a pre-baked artifact package exists on the sheet
 * (sheet.package.packageId + downloadRoute or signedUrl), the
 * *Download Deliverables ZIP* action:
 *   - hits the existing GET download endpoint (no huge POST body)
 *   - does NOT send compiledProject / projectGraph / a1Pdf / a1Png in
 *     any outgoing fetch
 *   - surfaces 404 / 410 from the prebake route verbatim instead of
 *     silently re-uploading the full payload
 *
 * Also exercises the legacy POST fallback when no prebake exists.
 */

import exportService from "../../services/exportService.js";

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_CREATE_URL = URL.createObjectURL;
const ORIGINAL_REVOKE_URL = URL.revokeObjectURL;
const ORIGINAL_ANCHOR_CLICK = HTMLAnchorElement.prototype.click;

beforeEach(() => {
  URL.createObjectURL = jest.fn(() => "blob:zip");
  URL.revokeObjectURL = jest.fn();
  HTMLAnchorElement.prototype.click = jest.fn();
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  URL.createObjectURL = ORIGINAL_CREATE_URL;
  URL.revokeObjectURL = ORIGINAL_REVOKE_URL;
  HTMLAnchorElement.prototype.click = ORIGINAL_ANCHOR_CLICK;
  jest.restoreAllMocks();
});

function headerBag(headers = {}) {
  return {
    get(name) {
      const key = Object.keys(headers).find(
        (h) => h.toLowerCase() === name.toLowerCase(),
      );
      return key ? headers[key] : null;
    },
  };
}

function sheetWithPrebake() {
  return {
    projectId: "project-x",
    projectName: "Project X",
    userId: "user-x",
    geometryHash: "geom-hash-x",
    compiledProject: { geometryHash: "geom-hash-x" },
    artifacts: {
      a1Sheet: { svgString: "<svg>x</svg>" },
      a1Pdf: { dataUrl: "data:application/pdf;base64,AAAA" },
      a1Png: { dataUrl: "data:image/png;base64,AAAA" },
    },
    package: {
      packageId: "pkg-prebaked-001",
      packageHash: "hash-001",
      downloadRoute:
        "/api/project/export/artifact-package/pkg-prebaked-001/download",
      signedUrl: null,
      signedUrlAvailable: false,
    },
  };
}

function sheetWithoutPrebake() {
  return {
    projectId: "project-y",
    projectName: "Project Y",
    userId: "user-y",
    geometryHash: "geom-hash-y",
    compiledProject: { geometryHash: "geom-hash-y" },
    artifacts: {
      a1Sheet: { svgString: "<svg>y</svg>" },
      a1Pdf: { dataUrl: "data:application/pdf;base64,BBBB" },
    },
  };
}

describe("exportDeliverablesPackage — compact-ref dispatch", () => {
  test("routes to the prebaked GET download endpoint when sheet.package has a downloadRoute", async () => {
    const zipBlob = new Blob(["zip-bytes"], { type: "application/zip" });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: headerBag({
        "Content-Disposition": 'attachment; filename="Project_X.zip"',
      }),
      blob: jest.fn().mockResolvedValue(zipBlob),
    });

    const result = await exportService.exportDeliverablesPackage({
      sheet: sheetWithPrebake(),
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = global.fetch.mock.calls[0];
    expect(calledUrl).toBe(
      "/api/project/export/artifact-package/pkg-prebaked-001/download",
    );
    expect(calledInit.method).toBe("GET");
    // No body on a GET — and definitely no full payload re-upload.
    expect(calledInit.body).toBeUndefined();
    expect(result.format).toBe("ZIP");
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });

  test("never sends compiledProject / projectGraph / a1Pdf / a1Png when prebake exists", async () => {
    const zipBlob = new Blob(["zip-bytes"], { type: "application/zip" });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: headerBag({}),
      blob: jest.fn().mockResolvedValue(zipBlob),
    });

    await exportService.exportDeliverablesPackage({
      sheet: sheetWithPrebake(),
    });

    const [, init] = global.fetch.mock.calls[0];
    const FORBIDDEN_LARGE_FIELDS = [
      "compiledProject",
      "projectGraph",
      "a1Sheet",
      "a1Pdf",
      "a1Png",
      "dxfArtifact",
      "dwgArtifact",
      "ifcArtifact",
      "technicalDrawings",
      "qaReport",
      "visualManifest",
      "styleBlendManifest",
      "jurisdictionPack",
      "artifacts",
    ];
    if (init.body) {
      const body = JSON.parse(init.body);
      FORBIDDEN_LARGE_FIELDS.forEach((field) => {
        expect(body[field]).toBeUndefined();
      });
    } else {
      // GET path: no body at all. Nothing to inspect — assertion stands.
      expect(init.body).toBeUndefined();
    }
  });

  test("404 from the prebake route surfaces clearly and does NOT silently fall back", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: headerBag({}),
      json: jest.fn().mockResolvedValue({
        error: "Stored deliverables package not found.",
        code: "ARTIFACT_STORAGE_NOT_FOUND",
      }),
      blob: jest.fn().mockResolvedValue(new Blob([])),
    });

    await expect(
      exportService.exportDeliverablesPackage({
        sheet: sheetWithPrebake(),
      }),
    ).rejects.toThrow(/Stored deliverables/i);

    // Only the prebake fetch was attempted — no fallback POST.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][0]).toBe(
      "/api/project/export/artifact-package/pkg-prebaked-001/download",
    );
  });

  test("falls back to legacy POST /artifact-package when no prebake exists on the sheet", async () => {
    const zipBlob = new Blob(["legacy-bytes"], { type: "application/zip" });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: headerBag({
        "Content-Disposition": 'attachment; filename="Project_Y.zip"',
      }),
      blob: jest.fn().mockResolvedValue(zipBlob),
    });

    const result = await exportService.exportDeliverablesPackage({
      sheet: sheetWithoutPrebake(),
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = global.fetch.mock.calls[0];
    expect(calledUrl).toBe("/api/project/export/artifact-package");
    expect(calledInit.method).toBe("POST");
    // Legacy body is the full bundle — exercised by other tests too.
    const body = JSON.parse(calledInit.body);
    expect(body.compiledProject).toBeTruthy();
    expect(result.format).toBe("ZIP");
  });
});

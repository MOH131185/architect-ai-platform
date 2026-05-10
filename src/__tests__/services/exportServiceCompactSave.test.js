/**
 * Client-side dispatch for ExportPanel's Save Package.
 *
 * Asserts that exportService.storeDeliverablesPackage:
 *   - sends the compact-ref body when sheet.package.packageId is present
 *     (no a1Pdf, no a1Png, no compiledProject in the request body)
 *   - falls back to the legacy full-payload body when sheet.package is missing
 *
 * This is the contract the server's compact-ref branch in
 * /api/project/export/artifact-package/store relies on.
 */

import exportService from "../../services/exportService.js";

const ORIGINAL_FETCH = global.fetch;

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  jest.restoreAllMocks();
});

function mockFetchOk(body) {
  return jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  });
}

function aSheetWithPackage() {
  return {
    projectId: "project-x",
    projectName: "Project X",
    userId: "user-x",
    geometryHash: "geom-hash-x",
    artifacts: {
      a1Sheet: { svgString: "<svg>x</svg>" },
      a1Pdf: { dataUrl: "data:application/pdf;base64,AAAA" },
      a1Png: { dataUrl: "data:image/png;base64,AAAA" },
    },
    compiledProject: { geometryHash: "geom-hash-x" },
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

function aSheetWithoutPackage() {
  return {
    projectId: "project-y",
    projectName: "Project Y",
    userId: "user-y",
    geometryHash: "geom-hash-y",
    artifacts: {
      a1Sheet: { svgString: "<svg>y</svg>" },
      a1Pdf: { dataUrl: "data:application/pdf;base64,BBBB" },
      a1Png: { dataUrl: "data:image/png;base64,BBBB" },
    },
    compiledProject: { geometryHash: "geom-hash-y" },
  };
}

describe("exportService.storeDeliverablesPackage — compact-ref dispatch", () => {
  test("sends compact ref body when sheet.package.packageId is present", async () => {
    global.fetch = mockFetchOk({
      packageId: "pkg-prebaked-001",
      packageHash: "hash-001",
      manifest: {},
      storage: {},
      history: { packageId: "pkg-prebaked-001" },
    });

    await exportService.storeDeliverablesPackage({
      sheet: aSheetWithPackage(),
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/project/export/artifact-package/store");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);

    // Compact-ref body MUST contain packageId + small metadata
    expect(body.packageId).toBe("pkg-prebaked-001");
    expect(body.projectId).toBe("project-x");
    expect(body.projectName).toBe("Project X");
    expect(body.userId).toBe("user-x");

    // Compact-ref body MUST NOT contain any large artifact fields
    const FORBIDDEN_LARGE_FIELDS = [
      "a1Sheet",
      "a1Pdf",
      "a1Png",
      "compiledProject",
      "projectGraph",
      "dxfArtifact",
      "dwgArtifact",
      "ifcArtifact",
      "technicalDrawings",
      "structuralArtifacts",
      "mepArtifacts",
      "detailArtifacts",
      "schedulesWorkbook",
      "qaReport",
      "visualManifest",
      "styleBlendManifest",
      "jurisdictionPack",
      "artifacts",
    ];
    FORBIDDEN_LARGE_FIELDS.forEach((field) => {
      expect(body[field]).toBeUndefined();
    });

    // Net body size must be tiny (well under any sane HTTP body limit)
    expect(init.body.length).toBeLessThan(2000);
  });

  test("falls back to full legacy body when sheet has no pre-baked package", async () => {
    global.fetch = mockFetchOk({
      packageId: "pkg-legacy-001",
      packageHash: "hash-legacy",
      manifest: {},
      storage: {},
      history: { packageId: "pkg-legacy-001" },
    });

    await exportService.storeDeliverablesPackage({
      sheet: aSheetWithoutPackage(),
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = global.fetch.mock.calls[0];
    const body = JSON.parse(init.body);

    // Legacy body carries the full bundle for backward compatibility
    expect(body.packageId).toBeUndefined();
    expect(body.a1Sheet).toEqual(
      expect.objectContaining({ svgString: "<svg>y</svg>" }),
    );
    expect(body.a1Pdf).toEqual(
      expect.objectContaining({
        dataUrl: "data:application/pdf;base64,BBBB",
      }),
    );
    expect(body.compiledProject).toEqual(
      expect.objectContaining({ geometryHash: "geom-hash-y" }),
    );
  });

  test("propagates expiresInSeconds in compact body", async () => {
    global.fetch = mockFetchOk({ packageId: "x", packageHash: "y" });
    await exportService.storeDeliverablesPackage({
      sheet: aSheetWithPackage(),
      expiresInSeconds: 7200,
    });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.expiresInSeconds).toBe(7200);
  });

  test("throws with server error message on non-OK response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: { get: () => null },
      json: jest.fn().mockResolvedValue({
        error: "Package not found in storage. Re-generate the design.",
        code: "PACKAGE_DRAFT_NOT_FOUND",
      }),
      text: jest
        .fn()
        .mockResolvedValue(
          '{"error":"Package not found in storage.","code":"PACKAGE_DRAFT_NOT_FOUND"}',
        ),
    });
    await expect(
      exportService.storeDeliverablesPackage({ sheet: aSheetWithPackage() }),
    ).rejects.toThrow(/Package not found in storage/i);
  });
});

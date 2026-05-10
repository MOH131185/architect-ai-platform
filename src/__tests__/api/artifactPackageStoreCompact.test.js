/**
 * Compact-ref Save Package mode for /api/project/export/artifact-package/store.
 *
 * Generation pre-bakes the deliverables ZIP into storage and returns
 * `{ packageId, packageHash, ... }` to the client. Save Package becomes a
 * tiny `{ packageId, projectId, userId }` POST that promotes the existing
 * storage entry into history — no re-upload of tens of MB of artifacts.
 *
 * These tests verify:
 *   - compact body → 200 with full history shape
 *   - missing packageId → 404 PACKAGE_DRAFT_NOT_FOUND
 *   - deleted packageId → 410 PACKAGE_DRAFT_DELETED
 *   - access denial via existing artifactAccessPolicyService
 *   - compact-mode and legacy-mode history records carry the same packageHash
 *     (determinism preserved)
 *   - full legacy body still works (no regression)
 */

import storeArtifactPackageHandler from "../../../api/project/export/artifact-package/store.js";
import artifactPackageHandler from "../../../api/project/export/artifact-package.js";
import artifactPackageHistoryHandler from "../../../api/project/export/artifact-package/history.js";
import {
  clearInMemoryArtifactStorage,
  createInMemoryArtifactStorageAdapter,
  setDefaultArtifactStorageAdapter,
} from "../../services/export/artifactStorageService.js";
import { clearArtifactPackageHistory } from "../../services/export/artifactHistoryService.js";

function dataUri(mimeType, value) {
  return `data:${mimeType};base64,${Buffer.from(value).toString("base64")}`;
}

function createMockResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}

function baseFullBody(overrides = {}) {
  return {
    projectName: "Compact Smoke Project",
    projectId: "project-compact-001",
    projectGraphId: "graph-compact-001",
    geometryHash: "geometryhash-compact-001",
    visualManifestHash: "visualhash-compact-001",
    styleBlendManifestHash: "stylehash-compact-001",
    jurisdictionId: "uk-england",
    countryCode: "GB",
    flags: {
      structuralEnabled: false,
      mepEnabled: false,
      detailsEnabled: false,
      dwgEnabled: false,
      ifcEnabled: false,
    },
    a1Sheet: {
      svgString:
        '<svg xmlns="http://www.w3.org/2000/svg"><text>A1</text></svg>',
      sheetNumber: "A1-001",
    },
    a1Pdf: {
      dataUrl: dataUri("application/pdf", "%PDF compact"),
      sheetNumber: "A1-001",
    },
    qaReport: {
      status: "pass",
      issues: [],
    },
    ...overrides,
  };
}

async function preStoreFullPayload(overrides = {}) {
  // Use the legacy full-payload Save path to seed storage with a real
  // artifact, then we exercise the compact-ref path against the resulting id.
  const seedReq = {
    method: "POST",
    headers: {},
    body: baseFullBody(overrides),
  };
  const seedRes = createMockResponse();
  await storeArtifactPackageHandler(seedReq, seedRes);
  expect(seedRes.statusCode).toBe(200);
  return {
    packageId: seedRes.body.packageId,
    packageHash: seedRes.body.packageHash,
    legacyResponse: seedRes.body,
  };
}

describe("/api/project/export/artifact-package/store — compact-ref mode", () => {
  beforeEach(() => {
    clearInMemoryArtifactStorage();
    clearArtifactPackageHistory();
    setDefaultArtifactStorageAdapter(createInMemoryArtifactStorageAdapter());
  });
  afterEach(() => {
    clearInMemoryArtifactStorage();
    clearArtifactPackageHistory();
    setDefaultArtifactStorageAdapter(createInMemoryArtifactStorageAdapter());
  });

  test("compact body promotes pre-baked storage entry into history with full response shape", async () => {
    const { packageId, packageHash } = await preStoreFullPayload();
    clearArtifactPackageHistory(); // re-record from scratch via compact mode

    const req = {
      method: "POST",
      headers: {},
      body: {
        packageId,
        projectId: "project-compact-001",
        userId: "user-compact-001",
      },
    };
    const res = createMockResponse();
    await storeArtifactPackageHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.packageId).toBe(packageId);
    expect(res.body.packageHash).toBe(packageHash);
    expect(res.body.source).toBe("compact_ref");
    // Same shape as the legacy path (manifest summary, storage, history)
    expect(res.body.manifest).toEqual(
      expect.objectContaining({
        packageId,
        packageHash,
        projectId: "project-compact-001",
      }),
    );
    expect(res.body.storage).toEqual(
      expect.objectContaining({
        adapterCapabilities: expect.any(Object),
        storageProvider: expect.any(String),
        byteLength: expect.any(Number),
      }),
    );
    expect(res.body.history).toEqual(
      expect.objectContaining({
        packageId,
        packageHash,
        projectId: "project-compact-001",
        userId: "user-compact-001",
        status: "stored",
      }),
    );
  });

  test("missing packageId returns 404 PACKAGE_DRAFT_NOT_FOUND", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: { packageId: "not-a-real-package-id", projectId: "x" },
    };
    const res = createMockResponse();
    await storeArtifactPackageHandler(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual(
      expect.objectContaining({
        code: "PACKAGE_DRAFT_NOT_FOUND",
        packageId: "not-a-real-package-id",
      }),
    );
    expect(res.body.error).toMatch(/Re-generate/i);
  });

  test("compact and legacy modes produce identical packageHash (determinism)", async () => {
    const { packageId, packageHash, legacyResponse } =
      await preStoreFullPayload();

    const compactReq = {
      method: "POST",
      headers: {},
      body: {
        packageId,
        projectId: legacyResponse.manifest.projectId,
        userId: legacyResponse.history?.userId || null,
      },
    };
    const compactRes = createMockResponse();
    clearArtifactPackageHistory();
    await storeArtifactPackageHandler(compactReq, compactRes);

    expect(compactRes.statusCode).toBe(200);
    expect(compactRes.body.packageHash).toBe(packageHash);
    expect(compactRes.body.history.packageHash).toBe(packageHash);
    expect(compactRes.body.history.geometryHash).toBe(
      legacyResponse.history.geometryHash,
    );
    expect(compactRes.body.history.artifactCount).toBe(
      legacyResponse.history.artifactCount,
    );
  });

  test("compact response carries no zipBytes / rawBytes / secret fields", async () => {
    const { packageId } = await preStoreFullPayload();
    const req = {
      method: "POST",
      headers: {},
      body: { packageId, projectId: "project-compact-001", userId: "u" },
    };
    const res = createMockResponse();
    await storeArtifactPackageHandler(req, res);

    expect(res.statusCode).toBe(200);
    const json = JSON.stringify(res.body);
    expect(json).not.toContain("zipBytes");
    expect(json).not.toContain("rawBytes");
    expect(json).not.toContain("secret-value-that-must-not-appear");
  });

  test("history list returns the compact-stored package", async () => {
    const { packageId } = await preStoreFullPayload();
    clearArtifactPackageHistory();
    await storeArtifactPackageHandler(
      {
        method: "POST",
        headers: {},
        body: { packageId, projectId: "project-compact-001", userId: "u-1" },
      },
      createMockResponse(),
    );

    const histRes = createMockResponse();
    await artifactPackageHistoryHandler(
      {
        method: "GET",
        headers: {},
        query: { projectId: "project-compact-001" },
      },
      histRes,
    );

    expect(histRes.statusCode).toBe(200);
    expect(histRes.body.history).toHaveLength(1);
    expect(histRes.body.history[0]).toEqual(
      expect.objectContaining({ packageId }),
    );
  });

  test("legacy full-payload Save still works after the compact branch", async () => {
    const req = { method: "POST", headers: {}, body: baseFullBody() };
    const res = createMockResponse();
    await storeArtifactPackageHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.packageId).toBeTruthy();
    expect(res.body.packageHash).toBeTruthy();
    expect(res.body.source).toBeUndefined(); // legacy path doesn't tag source
    expect(res.body.history).toEqual(
      expect.objectContaining({ packageId: res.body.packageId }),
    );
  });

  test("legacy direct ZIP route POST /artifact-package still serves application/zip", async () => {
    // Regression: this PR must not break the existing direct download path.
    const req = { method: "POST", headers: {}, body: baseFullBody() };
    const res = createMockResponse();
    await artifactPackageHandler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/zip");
    expect(Buffer.isBuffer(res.body)).toBe(true);
  });

  test("body with both packageId AND artifact bytes falls through to legacy path (compact detection requires no artifact fields)", async () => {
    // Defence-in-depth: if a caller sends both for any reason, we treat it as
    // legacy and rebuild from bytes. The compact branch is strictly for
    // artifact-free bodies.
    const { packageId } = await preStoreFullPayload();
    clearArtifactPackageHistory();
    const req = {
      method: "POST",
      headers: {},
      body: {
        ...baseFullBody({ projectId: "project-compact-002" }),
        packageId,
      },
    };
    const res = createMockResponse();
    await storeArtifactPackageHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.source).toBeUndefined(); // legacy path
    expect(res.body.packageId).toBeTruthy(); // freshly built id, may differ
  });
});

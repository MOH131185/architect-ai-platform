import {
  buildArtifactPackage,
  listZipEntryNames,
} from "../../../services/export/artifactPackageService.js";
import {
  ARTIFACT_STORAGE_DELETED,
  ARTIFACT_STORAGE_EXPIRED,
  clearInMemoryArtifactStorage,
  createInMemoryArtifactStorageAdapter,
  verifySignedDownloadToken,
} from "../../../services/export/artifactStorageService.js";
import {
  clearArtifactPackageHistory,
  createArtifactHistoryRecord,
  listArtifactPackageHistory,
  markArtifactPackageDeleted,
  recordArtifactPackageHistory,
} from "../../../services/export/artifactHistoryService.js";

function baseInput(overrides = {}) {
  return {
    projectName: "Stored Package",
    projectId: "project-storage-001",
    projectGraphId: "graph-storage-001",
    geometryHash: "geometry-storage-001",
    visualManifestHash: "visual-storage-001",
    styleBlendManifestHash: "style-storage-001",
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
    },
    a1Pdf: {
      dataUrl: "data:application/pdf;base64,JVBERi0xLjcgYTFwZGY=",
    },
    qaReport: {
      status: "pass",
      issues: [],
    },
    ...overrides,
  };
}

describe("artifact storage and history services", () => {
  afterEach(() => {
    clearInMemoryArtifactStorage();
    clearArtifactPackageHistory();
  });

  test("storage adapter stores and retrieves package bytes without changing packageHash", async () => {
    const packageResult = buildArtifactPackage(baseInput());
    const adapter = createInMemoryArtifactStorageAdapter();

    const stored = await adapter.putArtifactPackage({
      packageId: packageResult.packageId,
      zipBytes: packageResult.zipBytes,
      manifest: packageResult.manifest,
      metadata: { userId: "user-storage-001" },
    });
    const retrieved = await adapter.getArtifactPackage({
      packageId: packageResult.packageId,
    });

    expect(stored.packageHash).toBe(packageResult.packageHash);
    expect(retrieved.found).toBe(true);
    expect(retrieved.record.packageHash).toBe(packageResult.packageHash);
    expect([...retrieved.record.zipBytes]).toEqual([...packageResult.zipBytes]);
    expect(listZipEntryNames(retrieved.record.zipBytes)).toContain(
      "manifest.json",
    );
  });

  test("history record includes package and authority hashes without secret values", async () => {
    const packageResult = buildArtifactPackage(
      baseInput({
        env: { OPENAI_API_KEY: "secret-that-must-not-appear" },
      }),
    );
    const adapter = createInMemoryArtifactStorageAdapter();
    const storageRecord = await adapter.putArtifactPackage({
      packageId: packageResult.packageId,
      zipBytes: packageResult.zipBytes,
      manifest: packageResult.manifest,
      metadata: { userId: "user-history-001" },
    });

    const record = recordArtifactPackageHistory(
      createArtifactHistoryRecord({
        packageResult,
        storageRecord,
        userId: "user-history-001",
        downloadRoute: `/api/project/export/artifact-package/${packageResult.packageId}/download`,
        now: "2026-05-09T12:00:00.000Z",
      }),
    );

    expect(record).toEqual(
      expect.objectContaining({
        packageHash: packageResult.packageHash,
        projectId: "project-storage-001",
        projectGraphId: "graph-storage-001",
        geometryHash: "geometry-storage-001",
        visualManifestHash: "visual-storage-001",
        styleBlendManifestHash: "style-storage-001",
        jurisdictionId: "uk-england",
        countryCode: "GB",
        status: "stored",
        qaStatus: "pass",
      }),
    );
    expect(JSON.stringify(record)).not.toContain("secret-that-must-not-appear");
    expect(
      listArtifactPackageHistory({ projectId: "project-storage-001" }),
    ).toHaveLength(1);
  });

  test("signed URL capability is explicit and verifiable when configured", async () => {
    const adapter = createInMemoryArtifactStorageAdapter({
      signedUrlSecret: "test-signing-secret",
      signedUrlBaseUrl: "/api/project/export/artifact-package",
      now: "2026-05-09T12:00:00.000Z",
    });
    const packageResult = buildArtifactPackage(baseInput());
    await adapter.putArtifactPackage({
      packageId: packageResult.packageId,
      zipBytes: packageResult.zipBytes,
      manifest: packageResult.manifest,
    });

    const signed = await adapter.createSignedDownloadUrl({
      packageId: packageResult.packageId,
      expiresInSeconds: 60,
    });
    const url = new URL(`https://example.test${signed.signedUrl}`);
    const verification = await verifySignedDownloadToken({
      packageId: packageResult.packageId,
      expires: url.searchParams.get("expires"),
      signature: url.searchParams.get("signature"),
      secret: "test-signing-secret",
      now: "2026-05-09T12:00:30.000Z",
    });
    const expired = await verifySignedDownloadToken({
      packageId: packageResult.packageId,
      expires: url.searchParams.get("expires"),
      signature: url.searchParams.get("signature"),
      secret: "test-signing-secret",
      now: "2026-05-09T12:02:00.000Z",
    });

    expect(adapter.adapterCapabilities.signedUrls).toBe(true);
    expect(signed.supported).toBe(true);
    expect(verification.valid).toBe(true);
    expect(expired).toEqual(
      expect.objectContaining({
        valid: false,
        reason: ARTIFACT_STORAGE_EXPIRED,
      }),
    );
  });

  test("signed URLs are not faked when unsupported", async () => {
    const adapter = createInMemoryArtifactStorageAdapter();
    const signed = await adapter.createSignedDownloadUrl({
      packageId: "package-no-signing",
      expiresInSeconds: 60,
    });

    expect(adapter.adapterCapabilities.signedUrls).toBe(false);
    expect(signed.supported).toBe(false);
    expect(signed.signedUrl).toBeUndefined();
  });

  test("deleted package handling returns a clear status", async () => {
    const adapter = createInMemoryArtifactStorageAdapter();
    const packageResult = buildArtifactPackage(baseInput());
    await adapter.putArtifactPackage({
      packageId: packageResult.packageId,
      zipBytes: packageResult.zipBytes,
      manifest: packageResult.manifest,
    });
    recordArtifactPackageHistory(
      createArtifactHistoryRecord({
        packageResult,
        storageRecord: await adapter
          .getArtifactPackage({
            packageId: packageResult.packageId,
          })
          .then((result) => result.record),
      }),
    );

    const deleted = await adapter.deleteArtifactPackage({
      packageId: packageResult.packageId,
    });
    const retrieved = await adapter.getArtifactPackage({
      packageId: packageResult.packageId,
    });
    const history = markArtifactPackageDeleted({
      packageId: packageResult.packageId,
      now: "2026-05-09T13:00:00.000Z",
    });

    expect(deleted.deleted).toBe(true);
    expect(retrieved).toEqual(
      expect.objectContaining({
        found: false,
        code: ARTIFACT_STORAGE_DELETED,
      }),
    );
    expect(history.record.status).toBe("deleted");
  });
});

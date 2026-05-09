import artifactPackageHandler from "../../../api/project/export/artifact-package.js";
import storeArtifactPackageHandler from "../../../api/project/export/artifact-package/store.js";
import artifactPackageMetadataHandler from "../../../api/project/export/artifact-package/[packageId].js";
import downloadArtifactPackageHandler from "../../../api/project/export/artifact-package/[packageId]/download.js";
import artifactPackageHistoryHandler from "../../../api/project/export/artifact-package/history.js";
import { listZipEntryNames } from "../../services/export/artifactPackageService.js";
import {
  clearInMemoryArtifactStorage,
  createInMemoryArtifactStorageAdapter,
  setDefaultArtifactStorageAdapter,
} from "../../services/export/artifactStorageService.js";
import { clearArtifactPackageHistory } from "../../services/export/artifactHistoryService.js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function dataUri(mimeType, value) {
  return `data:${mimeType};base64,${Buffer.from(value).toString("base64")}`;
}

async function pdfDataUri(label) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(label);
  pdf.setCreator("artifact-package-api-test");
  pdf.setProducer("artifact-package-api-test");
  pdf.setCreationDate(new Date("1980-01-01T00:00:00.000Z"));
  pdf.setModificationDate(new Date("1980-01-01T00:00:00.000Z"));
  const page = pdf.addPage([200, 200]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(label, {
    x: 24,
    y: 144,
    font,
    size: 12,
    color: rgb(0, 0, 0),
  });
  const bytes = await pdf.save({
    useObjectStreams: false,
    addDefaultPage: false,
  });
  return dataUri("application/pdf", bytes);
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

function readZipEntry(zipBytes, entryName) {
  const bytes = Buffer.from(zipBytes);
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    const signature = bytes.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;

    const compressedSize = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    const name = bytes.slice(nameStart, nameEnd).toString("utf8");
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;

    if (name === entryName) {
      return bytes.slice(dataStart, dataEnd);
    }
    offset = dataEnd;
  }

  return null;
}

function readZipJson(zipBytes, entryName) {
  const entry = readZipEntry(zipBytes, entryName);
  expect(entry).toBeTruthy();
  return JSON.parse(entry.toString("utf8"));
}

function baseBody(overrides = {}) {
  return {
    projectName: "My Project ../ 2026",
    projectId: "project-zip-001",
    projectGraphId: "graph-zip-001",
    geometryHash: "geometryhash-zip-001",
    visualManifestHash: "visualhash-zip-001",
    styleBlendManifestHash: "stylehash-zip-001",
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
      dataUrl: dataUri("application/pdf", "%PDF package"),
      sheetNumber: "A1-001",
    },
    dxfArtifact: {
      fileName: "cad/my-project.dxf",
      content: "0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n",
    },
    qaReport: {
      status: "pass",
      issues: [],
    },
    env: {
      OPENAI_API_KEY: "secret-value-that-must-not-appear",
    },
    ...overrides,
  };
}

describe("/api/project/export/artifact-package", () => {
  afterEach(() => {
    clearInMemoryArtifactStorage();
    clearArtifactPackageHistory();
    setDefaultArtifactStorageAdapter(createInMemoryArtifactStorageAdapter());
    delete process.env.ARTIFACT_PACKAGE_SIGNING_SECRET;
    delete process.env.ARTIFACT_SIGNED_URL_TTL_SECONDS;
    delete process.env.ARTIFACT_ACCESS_CONTROL_STRICT;
  });

  test("returns application/zip with a safe attachment filename", async () => {
    const req = { method: "POST", headers: {}, body: baseBody() };
    const res = createMockResponse();

    await artifactPackageHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/zip");
    expect(res.headers["Content-Disposition"]).toBe(
      'attachment; filename="My_Project_2026-deliverables.zip"',
    );
    expect(Buffer.isBuffer(res.body)).toBe(true);
  });

  test("includes manifest.json and supplied QA report without secret values", async () => {
    const req = { method: "POST", headers: {}, body: baseBody() };
    const res = createMockResponse();

    await artifactPackageHandler(req, res);

    const names = listZipEntryNames(res.body);
    expect(names).toEqual(
      expect.arrayContaining(["manifest.json", "qa/qa-report.json"]),
    );

    const manifest = readZipJson(res.body, "manifest.json");
    const qaReport = readZipJson(res.body, "qa/qa-report.json");
    const manifestText = JSON.stringify(manifest);

    expect(manifest).toEqual(
      expect.objectContaining({
        projectId: "project-zip-001",
        projectGraphId: "graph-zip-001",
        geometryHash: "geometryhash-zip-001",
        visualManifestHash: "visualhash-zip-001",
        styleBlendManifestHash: "stylehash-zip-001",
        jurisdictionId: "uk-england",
        countryCode: "GB",
      }),
    );
    expect(qaReport).toEqual(expect.objectContaining({ status: "pass" }));
    expect(manifestText).not.toContain("secret-value-that-must-not-appear");
    expect(Buffer.from(res.body).toString("latin1")).not.toContain(
      "secret-value-that-must-not-appear",
    );
  });

  test("DWG and IFC unavailable are source gaps with no fake files", async () => {
    const req = { method: "POST", headers: {}, body: baseBody() };
    const res = createMockResponse();

    await artifactPackageHandler(req, res);

    const manifest = readZipJson(res.body, "manifest.json");
    const names = listZipEntryNames(res.body);

    expect(manifest.sourceGaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "DWG_CONVERSION_UNAVAILABLE" }),
        expect.objectContaining({ code: "IFC_EXPORT_UNAVAILABLE" }),
      ]),
    );
    expect(names.some((name) => name.endsWith(".dwg"))).toBe(false);
    expect(names.some((name) => name.endsWith(".ifc"))).toBe(false);
  });

  test("includes stitched deliverables PDF in ZIP when generated PDFs exist", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: baseBody({
        a1Pdf: {
          dataUrl: await pdfDataUri("A1 PDF"),
          sheetNumber: "A1-001",
        },
        technicalDrawings: [
          {
            panelType: "section",
            mimeType: "application/pdf",
            pdfDataUrl: await pdfDataUri("Section PDF"),
            sheetNumber: "A-201",
          },
        ],
      }),
    };
    const res = createMockResponse();

    await artifactPackageHandler(req, res);

    const names = listZipEntryNames(res.body);
    const stitchedFileName = "presentation/my-project-2026-deliverables.pdf";
    const manifest = readZipJson(res.body, "manifest.json");
    const stitchedBytes = readZipEntry(res.body, stitchedFileName);
    expect(stitchedBytes).toBeTruthy();
    const stitchedPdf = await PDFDocument.load(new Uint8Array(stitchedBytes));

    expect(names).toContain(stitchedFileName);
    expect(manifest.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: stitchedFileName,
          type: "stitched_pdf_package",
          mimeType: "application/pdf",
        }),
      ]),
    );
    expect(stitchedPdf.getPageCount()).toBe(3);
  });

  test("rejects package requests with no generated artifact source", async () => {
    const req = {
      method: "POST",
      headers: {},
      body: { projectName: "Empty Project" },
    };
    const res = createMockResponse();

    await artifactPackageHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual(
      expect.objectContaining({ code: "PACKAGE_ARTIFACTS_REQUIRED" }),
    );
  });

  test("stores a real package, records history, and downloads through fallback route", async () => {
    setDefaultArtifactStorageAdapter(createInMemoryArtifactStorageAdapter());
    const storeReq = { method: "POST", headers: {}, body: baseBody() };
    const storeRes = createMockResponse();

    await storeArtifactPackageHandler(storeReq, storeRes);

    expect(storeRes.statusCode).toBe(200);
    expect(storeRes.body).toEqual(
      expect.objectContaining({
        packageId: expect.stringMatching(/^artifact-package-/),
        packageHash: expect.any(String),
        signedUrl: null,
        downloadRoute: expect.stringContaining("/download"),
        history: expect.objectContaining({
          projectId: "project-zip-001",
          geometryHash: "geometryhash-zip-001",
          visualManifestHash: "visualhash-zip-001",
          styleBlendManifestHash: "stylehash-zip-001",
          jurisdictionId: "uk-england",
          status: "stored",
        }),
      }),
    );
    expect(storeRes.body).toEqual(
      expect.objectContaining({
        storageProvider: "memory",
        signedUrlAvailable: false,
        packageHistoryStatus: "stored",
      }),
    );
    expect(storeRes.body.storage).toEqual(
      expect.objectContaining({
        storageProvider: "memory",
      }),
    );
    expect(JSON.stringify(storeRes.body)).not.toContain(
      "secret-value-that-must-not-appear",
    );

    const packageId = storeRes.body.packageId;
    const metadataRes = createMockResponse();
    await artifactPackageMetadataHandler(
      { method: "GET", headers: {}, query: { packageId } },
      metadataRes,
    );
    expect(metadataRes.statusCode).toBe(200);
    expect(metadataRes.body.manifest.packageHash).toBe(
      storeRes.body.packageHash,
    );

    const downloadRes = createMockResponse();
    await downloadArtifactPackageHandler(
      { method: "GET", headers: {}, query: { packageId } },
      downloadRes,
    );
    expect(downloadRes.statusCode).toBe(200);
    expect(downloadRes.headers["Content-Type"]).toBe("application/zip");
    expect(listZipEntryNames(downloadRes.body)).toContain("manifest.json");

    const historyRes = createMockResponse();
    await artifactPackageHistoryHandler(
      {
        method: "GET",
        headers: {},
        query: { projectId: "project-zip-001" },
      },
      historyRes,
    );
    expect(historyRes.statusCode).toBe(200);
    expect(historyRes.body.history).toHaveLength(1);
    expect(JSON.stringify(historyRes.body)).not.toContain("zipBytes");
    expect(JSON.stringify(historyRes.body)).not.toContain(
      "secret-value-that-must-not-appear",
    );
  });

  test("artifact package storage, history, metadata, and download enforce access policy", async () => {
    const adapter = createInMemoryArtifactStorageAdapter({
      signedUrlSecret: "access-test-secret",
      now: "2026-05-09T12:00:00.000Z",
    });
    setDefaultArtifactStorageAdapter(adapter);
    const storeRes = createMockResponse();
    await storeArtifactPackageHandler(
      {
        method: "POST",
        headers: {
          "x-user-id": "user-a",
          "x-accessible-project-ids": "project-zip-001",
        },
        body: { ...baseBody(), userId: "user-a" },
      },
      storeRes,
    );

    expect(storeRes.statusCode).toBe(200);
    expect(storeRes.body.signedUrlAvailable).toBe(true);
    const packageId = storeRes.body.packageId;

    const deniedStoreRes = createMockResponse();
    await storeArtifactPackageHandler(
      {
        method: "POST",
        headers: { "x-user-id": "user-b" },
        body: { ...baseBody(), userId: "user-a" },
      },
      deniedStoreRes,
    );
    expect(deniedStoreRes.statusCode).toBe(403);

    const deniedHistoryRes = createMockResponse();
    await artifactPackageHistoryHandler(
      {
        method: "GET",
        headers: {
          "x-user-id": "user-b",
          "x-accessible-project-ids": "other-project",
        },
        query: { projectId: "project-zip-001" },
      },
      deniedHistoryRes,
    );
    expect(deniedHistoryRes.statusCode).toBe(403);

    const filteredHistoryRes = createMockResponse();
    await artifactPackageHistoryHandler(
      {
        method: "GET",
        headers: { "x-user-id": "user-b" },
        query: { projectId: "project-zip-001" },
      },
      filteredHistoryRes,
    );
    expect(filteredHistoryRes.statusCode).toBe(200);
    expect(filteredHistoryRes.body.history).toHaveLength(0);
    expect(JSON.stringify(filteredHistoryRes.body)).not.toContain("signature=");

    const deniedMetadataRes = createMockResponse();
    await artifactPackageMetadataHandler(
      {
        method: "GET",
        headers: { "x-user-id": "user-b" },
        query: { packageId },
      },
      deniedMetadataRes,
    );
    expect(deniedMetadataRes.statusCode).toBe(404);

    const deniedDownloadRes = createMockResponse();
    await downloadArtifactPackageHandler(
      {
        method: "GET",
        headers: { "x-user-id": "user-b" },
        query: { packageId },
      },
      deniedDownloadRes,
    );
    expect(deniedDownloadRes.statusCode).toBe(404);

    const allowedDownloadRes = createMockResponse();
    await downloadArtifactPackageHandler(
      {
        method: "GET",
        headers: { "x-user-id": "user-a" },
        query: { packageId },
      },
      allowedDownloadRes,
    );
    expect(allowedDownloadRes.statusCode).toBe(200);
    expect(allowedDownloadRes.headers["Content-Type"]).toBe("application/zip");
  });

  test("store endpoint returns a real signed URL when adapter supports it", async () => {
    process.env.ARTIFACT_PACKAGE_SIGNING_SECRET = "api-test-secret";
    setDefaultArtifactStorageAdapter(
      createInMemoryArtifactStorageAdapter({
        signedUrlSecret: "api-test-secret",
        signedUrlBaseUrl: "/api/project/export/artifact-package",
        now: "2026-05-09T12:00:00.000Z",
      }),
    );
    const storeRes = createMockResponse();

    await storeArtifactPackageHandler(
      {
        method: "POST",
        headers: {},
        body: { ...baseBody(), expiresInSeconds: 60 },
      },
      storeRes,
    );

    expect(storeRes.statusCode).toBe(200);
    expect(storeRes.body.signedUrl).toContain(
      `/api/project/export/artifact-package/${storeRes.body.packageId}/download`,
    );
    expect(storeRes.body.signedUrl).toContain("signature=");
    expect(storeRes.body.downloadRoute).toBe(null);
  });

  test("deleted stored package returns a clear download error", async () => {
    const adapter = createInMemoryArtifactStorageAdapter();
    setDefaultArtifactStorageAdapter(adapter);
    const storeRes = createMockResponse();
    await storeArtifactPackageHandler(
      { method: "POST", headers: {}, body: baseBody() },
      storeRes,
    );

    await adapter.deleteArtifactPackage({ packageId: storeRes.body.packageId });
    const downloadRes = createMockResponse();
    await downloadArtifactPackageHandler(
      {
        method: "GET",
        headers: {},
        query: { packageId: storeRes.body.packageId },
      },
      downloadRes,
    );

    expect(downloadRes.statusCode).toBe(410);
    expect(downloadRes.body).toEqual(
      expect.objectContaining({ code: "ARTIFACT_STORAGE_DELETED" }),
    );
  });
});

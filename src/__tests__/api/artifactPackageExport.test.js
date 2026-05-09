import artifactPackageHandler from "../../../api/project/export/artifact-package.js";
import { listZipEntryNames } from "../../services/export/artifactPackageService.js";

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
});

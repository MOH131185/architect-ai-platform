/**
 * Phase 6 — Codex audit blocker #3 response.
 *
 * Locks the API/route-level contract:
 *   1. When the client POSTs `{ handoff:true, a1ExportQa:{degradedExport:true} }`,
 *      the returned ZIP carries handoff.json with qa.status:"degraded".
 *   2. When the client POSTs a hard-blocked QA (geometry/authority
 *      category), the API still produces the ZIP (no server-side refusal),
 *      but exportService gates the request client-side. This test asserts
 *      that whatever a1ExportQa the client sends is mirrored faithfully
 *      in handoff.json's qa block.
 *   3. handoff.json.packageHash equals the returned X-Artifact-Package-Hash.
 *   4. handoff.json.files indexes the artifact list AND manifest.json,
 *      and explicitly documents handoff.json + README.md as
 *      `selfReferentialFiles`. This is the artifact-only index contract
 *      Codex required after Phase 6 audit.
 */

import handler from "../../../api/project/export/artifact-package.js";
import { listZipEntryNames } from "../../../src/services/export/artifactPackageService.js";

function rectangle(minX, minY, maxX, maxY) {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function compiledFixture() {
  const polygon = rectangle(0, 0, 10, 8);
  return {
    schema_version: "compiled-project-v1",
    geometryHash: "phase6-route-test-001",
    metadata: { source: "compiled_project", projectName: "Phase6 Route" },
    levels: [
      {
        id: "L0",
        level_number: 0,
        height_m: 3,
        bottom_m: 0,
        top_m: 3,
        footprint: { polygon, area_m2: 80 },
      },
    ],
    walls: [
      {
        id: "wS",
        levelId: "L0",
        thickness_m: 0.25,
        height_m: 3,
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
      },
      {
        id: "wE",
        levelId: "L0",
        thickness_m: 0.25,
        height_m: 3,
        start: { x: 10, y: 0 },
        end: { x: 10, y: 8 },
      },
      {
        id: "wN",
        levelId: "L0",
        thickness_m: 0.25,
        height_m: 3,
        start: { x: 10, y: 8 },
        end: { x: 0, y: 8 },
      },
      {
        id: "wW",
        levelId: "L0",
        thickness_m: 0.25,
        height_m: 3,
        start: { x: 0, y: 8 },
        end: { x: 0, y: 0 },
      },
    ],
    slabs: [
      { id: "slab0", levelId: "L0", polygon, thickness_m: 0.2, elevation_m: 0 },
    ],
    openings: [],
    roof: {
      type: "pitched_gable",
      planes: [{ id: "p1", polygon, ridge_height_m: 5.5, eave_height_m: 3.5 }],
      ridges: [],
      eaves: [],
      hips: [],
      valleys: [],
      parapets: [],
      dormers: [],
    },
  };
}

function readZipEntryBytes(zipBytes, fileName) {
  const buf = Buffer.from(zipBytes);
  const targetName = Buffer.from(fileName, "utf8");
  for (let i = 0; i + 30 < buf.length; i += 1) {
    if (
      buf[i] === 0x50 &&
      buf[i + 1] === 0x4b &&
      buf[i + 2] === 0x03 &&
      buf[i + 3] === 0x04
    ) {
      const compressedSize = buf.readUInt32LE(i + 18);
      const fileNameLen = buf.readUInt16LE(i + 26);
      const extraLen = buf.readUInt16LE(i + 28);
      const nameBytes = buf.slice(i + 30, i + 30 + fileNameLen);
      if (nameBytes.equals(targetName)) {
        const dataStart = i + 30 + fileNameLen + extraLen;
        return buf.slice(dataStart, dataStart + compressedSize);
      }
      i = i + 30 + fileNameLen + extraLen + compressedSize - 1;
    }
  }
  return null;
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
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
    end() {
      return this;
    },
  };
}

function makeReq(body, method = "POST") {
  return { method, body, headers: {} };
}

async function postHandoff(body) {
  const res = makeRes();
  await handler(makeReq({ handoff: true, ...body }), res);
  return res;
}

describe("/api/project/export/artifact-package — handoff QA propagation", () => {
  test("degraded a1ExportQa propagates into handoff.json.qa.status", async () => {
    const res = await postHandoff({
      projectName: "Route Test Degraded",
      compiledProject: compiledFixture(),
      a1ExportQa: {
        allowed: true,
        status: "degraded",
        degradedExport: true,
        blockers: [
          {
            category: "readability",
            code: "TEXT_PROOF_LOW",
            message: "small text",
          },
        ],
        warnings: [{ message: "small text" }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.headers["x-handoff-package"]).toBe("true");
    expect(res.headers["x-handoff-qa-status"]).toBe("degraded");
    const handoffJsonBytes = readZipEntryBytes(res.body, "handoff.json");
    expect(handoffJsonBytes).not.toBeNull();
    const handoff = JSON.parse(handoffJsonBytes.toString("utf8"));
    expect(handoff.qa.status).toBe("degraded");
    expect(handoff.qa.degradedExport).toBe(true);
  });

  test("clean a1ExportQa propagates as qa.status:'pass'", async () => {
    const res = await postHandoff({
      projectName: "Route Test Clean",
      compiledProject: compiledFixture(),
      a1ExportQa: { allowed: true, status: "pass", blockers: [], warnings: [] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-handoff-qa-status"]).toBe("pass");
    const handoff = JSON.parse(
      readZipEntryBytes(res.body, "handoff.json").toString("utf8"),
    );
    expect(handoff.qa.status).toBe("pass");
  });

  test("authority-category blocker propagates as qa.status:'blocked'", async () => {
    // The API/route layer mirrors whatever a1ExportQa the caller sent.
    // The client-side gate (exportService.exportHandoffPackage) blocks
    // this request before it leaves the browser; that gate is covered
    // in src/__tests__/services/exportServiceHandoffPackage.test.js.
    // The API path is the second line of defense: it must NOT
    // silently rewrite "blocked" to "pass".
    const res = await postHandoff({
      projectName: "Route Test Blocked",
      compiledProject: compiledFixture(),
      a1ExportQa: {
        allowed: false,
        status: "blocked",
        blockers: [
          {
            category: "authority",
            code: "GEOMETRY_SIGNATURE_FAILED",
            message: "Authority failure",
          },
        ],
        warnings: [],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-handoff-qa-status"]).toBe("blocked");
    const handoff = JSON.parse(
      readZipEntryBytes(res.body, "handoff.json").toString("utf8"),
    );
    expect(handoff.qa.status).toBe("blocked");
  });
});

describe("/api/project/export/artifact-package — handoff manifest integrity", () => {
  let res;
  let handoff;

  beforeAll(async () => {
    res = await postHandoff({
      projectName: "Route Integrity",
      compiledProject: compiledFixture(),
    });
    handoff = JSON.parse(
      readZipEntryBytes(res.body, "handoff.json").toString("utf8"),
    );
  });

  test("handoff.json.packageHash equals the X-Artifact-Package-Hash header", () => {
    expect(res.headers["x-artifact-package-hash"]).toBe(handoff.packageHash);
  });

  test("handoff.json.selfReferentialFiles lists handoff.json and README.md", () => {
    expect(handoff.selfReferentialFiles).toContain("handoff.json");
    expect(handoff.selfReferentialFiles).toContain("README.md");
  });

  test("handoff.json.files includes manifest.json with a matching sha256", () => {
    const manifestEntry = handoff.files.find((f) => f.path === "manifest.json");
    expect(manifestEntry).toBeDefined();
    const manifestBytes = readZipEntryBytes(res.body, "manifest.json");
    expect(manifestBytes).not.toBeNull();
    expect(manifestEntry.size).toBe(manifestBytes.length);
    expect(typeof manifestEntry.sha256).toBe("string");
    expect(manifestEntry.sha256.length).toBeGreaterThan(0);
  });

  test("handoff.json.files does NOT include handoff.json or README.md (selfReferential)", () => {
    const handoffSelf = handoff.files.find((f) => f.path === "handoff.json");
    const readmeSelf = handoff.files.find((f) => f.path === "README.md");
    expect(handoffSelf).toBeUndefined();
    expect(readmeSelf).toBeUndefined();
  });

  test("every indexed file in handoff.json.files actually exists in the ZIP with matching size", () => {
    for (const file of handoff.files) {
      const bytes = readZipEntryBytes(res.body, file.path);
      expect(bytes).not.toBeNull();
      expect(bytes.length).toBe(file.size);
    }
  });

  test("handoff.json.files[].sha256 is a REAL SHA-256 of the ZIP entry bytes (Codex blocker #1)", async () => {
    const { createHash } = await import("node:crypto");
    for (const file of handoff.files) {
      const bytes = readZipEntryBytes(res.body, file.path);
      expect(bytes).not.toBeNull();
      const realSha256 = createHash("sha256").update(bytes).digest("hex");
      expect(file.sha256).toBe(realSha256);
      // SHA-256 hex is 64 chars; the legacy FNV fingerprint was 16.
      expect(file.sha256.length).toBe(64);
    }
  });

  test("ZIP contains handoff.json + README.md + manifest.json on top of every indexed file", () => {
    const names = listZipEntryNames(res.body);
    expect(names).toContain("handoff.json");
    expect(names).toContain("README.md");
    expect(names).toContain("manifest.json");
    for (const file of handoff.files) {
      expect(names).toContain(file.path);
    }
  });
});

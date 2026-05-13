/**
 * Phase 1 export-fix — blob-artifact storage extension on the adapters.
 *
 * The slice handler writes the master A1 SVG via
 * `adapter.putBlobArtifact({packageId, kind: "a1-sheet-svg", bytes})`,
 * and `/api/a1/export` reads it back via `getBlobArtifact(...)` when the
 * client sends a durable `artifactRef`. This exercises both in-memory and
 * filesystem adapters end-to-end so the production-durability contract
 * (slice → adapter → export) is provable.
 */

import fs from "fs";
import path from "path";
import os from "os";

import {
  createInMemoryArtifactStorageAdapter,
  createFilesystemArtifactStorageAdapter,
  clearInMemoryArtifactStorage,
  ARTIFACT_STORAGE_NOT_FOUND,
  BLOB_KIND_A1_SHEET_SVG,
} from "../../services/export/artifactStorageService.js";

const SVG_STRING =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'/>";

describe("createInMemoryArtifactStorageAdapter — blob artifacts", () => {
  beforeEach(() => clearInMemoryArtifactStorage());

  test("round-trips utf-8 SVG bytes by {packageId, kind}", async () => {
    const adapter = createInMemoryArtifactStorageAdapter();
    const stored = await adapter.putBlobArtifact({
      packageId: "pkg-1",
      kind: BLOB_KIND_A1_SHEET_SVG,
      bytes: Buffer.from(SVG_STRING, "utf8"),
    });
    expect(stored).toMatchObject({
      stored: true,
      packageId: "pkg-1",
      kind: BLOB_KIND_A1_SHEET_SVG,
      adapter: "memory",
    });
    expect(stored.byteLength).toBe(Buffer.byteLength(SVG_STRING, "utf8"));

    const got = await adapter.getBlobArtifact({
      packageId: "pkg-1",
      kind: BLOB_KIND_A1_SHEET_SVG,
    });
    expect(got.found).toBe(true);
    expect(Buffer.from(got.bytes).toString("utf8")).toBe(SVG_STRING);
    expect(got.contentType).toMatch(/image\/svg\+xml/);
  });

  test("returns NOT_FOUND for unknown {packageId, kind}", async () => {
    const adapter = createInMemoryArtifactStorageAdapter();
    const got = await adapter.getBlobArtifact({
      packageId: "ghost",
      kind: BLOB_KIND_A1_SHEET_SVG,
    });
    expect(got).toEqual({ found: false, code: ARTIFACT_STORAGE_NOT_FOUND });
  });

  test("rejects invalid blob kinds (defense against path-style abuse)", async () => {
    const adapter = createInMemoryArtifactStorageAdapter();
    await expect(
      adapter.putBlobArtifact({
        packageId: "pkg",
        kind: "../etc/passwd",
        bytes: Buffer.from("x"),
      }),
    ).rejects.toThrow(/Invalid blob kind/);
  });

  test("isolated packages do not collide", async () => {
    const adapter = createInMemoryArtifactStorageAdapter();
    await adapter.putBlobArtifact({
      packageId: "pkg-a",
      kind: BLOB_KIND_A1_SHEET_SVG,
      bytes: Buffer.from("AAA", "utf8"),
    });
    await adapter.putBlobArtifact({
      packageId: "pkg-b",
      kind: BLOB_KIND_A1_SHEET_SVG,
      bytes: Buffer.from("BBB", "utf8"),
    });
    const a = await adapter.getBlobArtifact({
      packageId: "pkg-a",
      kind: BLOB_KIND_A1_SHEET_SVG,
    });
    const b = await adapter.getBlobArtifact({
      packageId: "pkg-b",
      kind: BLOB_KIND_A1_SHEET_SVG,
    });
    expect(Buffer.from(a.bytes).toString("utf8")).toBe("AAA");
    expect(Buffer.from(b.bytes).toString("utf8")).toBe("BBB");
  });
});

describe("createFilesystemArtifactStorageAdapter — blob artifacts", () => {
  let rootDir;
  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "blob-storage-"));
  });
  afterEach(() => {
    try {
      fs.rmSync(rootDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  test("persists to disk under <root>/artifact-packages/_blobs/<id>/<kind>.<ext>", async () => {
    const adapter = createFilesystemArtifactStorageAdapter({ rootDir });
    const stored = await adapter.putBlobArtifact({
      packageId: "pkg-disk-1",
      kind: BLOB_KIND_A1_SHEET_SVG,
      bytes: Buffer.from(SVG_STRING, "utf8"),
    });
    expect(stored.stored).toBe(true);

    const expectedPath = path.join(
      rootDir,
      "artifact-packages/_blobs/pkg-disk-1/a1-sheet-svg.svg",
    );
    expect(fs.existsSync(expectedPath)).toBe(true);
    expect(fs.readFileSync(expectedPath, "utf8")).toBe(SVG_STRING);
  });

  test("round-trips via getBlobArtifact after restart-equivalent (fresh adapter)", async () => {
    const writer = createFilesystemArtifactStorageAdapter({ rootDir });
    await writer.putBlobArtifact({
      packageId: "pkg-fs-2",
      kind: BLOB_KIND_A1_SHEET_SVG,
      bytes: Buffer.from(SVG_STRING, "utf8"),
    });

    // Simulate cold start by constructing a new adapter against the same dir.
    const reader = createFilesystemArtifactStorageAdapter({ rootDir });
    const got = await reader.getBlobArtifact({
      packageId: "pkg-fs-2",
      kind: BLOB_KIND_A1_SHEET_SVG,
    });
    expect(got.found).toBe(true);
    expect(Buffer.from(got.bytes).toString("utf8")).toBe(SVG_STRING);
  });

  test("missing file returns NOT_FOUND without throwing", async () => {
    const adapter = createFilesystemArtifactStorageAdapter({ rootDir });
    const got = await adapter.getBlobArtifact({
      packageId: "absent",
      kind: BLOB_KIND_A1_SHEET_SVG,
    });
    expect(got).toEqual({ found: false, code: ARTIFACT_STORAGE_NOT_FOUND });
  });
});

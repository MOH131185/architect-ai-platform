/**
 * Unit tests for buildClientExportManifest.
 *
 * Covers the readiness contract ExportPanel relies on when the
 * project-graph slice does not emit a server-side export manifest:
 *   - DXF / IFC / JSON ready when compiledProject.geometryHash exists
 *   - XLSX blocked with QUANTITY_TAKEOFF_UNAVAILABLE when no takeoff
 *   - Every engineering row blocked with COMPILED_PROJECT_MISSING when
 *     there is no compiledProject at all
 *   - DWG always blocked with DWG_CONVERSION_UNAVAILABLE
 *   - PDF and PNG always available
 *   - GLB visible only when compiledProject.artifacts.glbUrl is set
 */

import {
  buildClientExportManifest,
  BLOCKED_REASONS,
} from "../../services/export/buildClientExportManifest.js";

describe("buildClientExportManifest", () => {
  test("DXF/IFC/JSON ready when compiledProject.geometryHash present", () => {
    const manifest = buildClientExportManifest({
      compiledProject: { geometryHash: "geom-hash-123" },
    });
    expect(manifest.exports.dxf.available).toBe(true);
    expect(manifest.exports.dxf.blockedReason).toBeUndefined();
    expect(manifest.exports.ifc.available).toBe(true);
    expect(manifest.exports.ifc.blockedReason).toBeUndefined();
    expect(manifest.exports.json.available).toBe(true);
    expect(manifest.exports.json.blockedReason).toBeUndefined();
  });

  test("XLSX blocked with QUANTITY_TAKEOFF_UNAVAILABLE when geometry present but no takeoff", () => {
    const manifest = buildClientExportManifest({
      compiledProject: { geometryHash: "geom-hash-123" },
      projectQuantityTakeoff: null,
    });
    expect(manifest.exports.xlsx.available).toBe(false);
    expect(manifest.exports.xlsx.blockedReason).toBe(
      BLOCKED_REASONS.QUANTITY_TAKEOFF_UNAVAILABLE,
    );
  });

  test("XLSX ready when geometry AND a non-empty takeoff are present", () => {
    const manifest = buildClientExportManifest({
      compiledProject: { geometryHash: "geom-hash-123" },
      projectQuantityTakeoff: { items: [{ code: "wall_a", quantity: 12 }] },
    });
    expect(manifest.exports.xlsx.available).toBe(true);
    expect(manifest.exports.xlsx.blockedReason).toBeUndefined();
  });

  test("XLSX blocked with QUANTITY_TAKEOFF_UNAVAILABLE when takeoff items array is empty", () => {
    const manifest = buildClientExportManifest({
      compiledProject: { geometryHash: "geom-hash-123" },
      projectQuantityTakeoff: { items: [] },
    });
    expect(manifest.exports.xlsx.available).toBe(false);
    expect(manifest.exports.xlsx.blockedReason).toBe(
      BLOCKED_REASONS.QUANTITY_TAKEOFF_UNAVAILABLE,
    );
  });

  test("all engineering rows blocked with COMPILED_PROJECT_MISSING when no compiledProject", () => {
    const manifest = buildClientExportManifest({});
    expect(manifest.exports.dxf.available).toBe(false);
    expect(manifest.exports.dxf.blockedReason).toBe(
      BLOCKED_REASONS.COMPILED_PROJECT_MISSING,
    );
    expect(manifest.exports.ifc.available).toBe(false);
    expect(manifest.exports.ifc.blockedReason).toBe(
      BLOCKED_REASONS.COMPILED_PROJECT_MISSING,
    );
    expect(manifest.exports.xlsx.available).toBe(false);
    expect(manifest.exports.xlsx.blockedReason).toBe(
      BLOCKED_REASONS.COMPILED_PROJECT_MISSING,
    );
  });

  test("engineering rows blocked with GEOMETRY_HASH_MISSING when compiledProject exists but has no hash", () => {
    const manifest = buildClientExportManifest({
      compiledProject: {
        /* no geometryHash */
      },
    });
    expect(manifest.exports.dxf.available).toBe(false);
    expect(manifest.exports.dxf.blockedReason).toBe(
      BLOCKED_REASONS.GEOMETRY_HASH_MISSING,
    );
    expect(manifest.exports.ifc.available).toBe(false);
    expect(manifest.exports.ifc.blockedReason).toBe(
      BLOCKED_REASONS.GEOMETRY_HASH_MISSING,
    );
  });

  test("DWG is always blocked with DWG_CONVERSION_UNAVAILABLE", () => {
    const withGeometry = buildClientExportManifest({
      compiledProject: { geometryHash: "geom-hash-123" },
    });
    expect(withGeometry.exports.dwg.available).toBe(false);
    expect(withGeometry.exports.dwg.blockedReason).toBe(
      BLOCKED_REASONS.DWG_CONVERSION_UNAVAILABLE,
    );

    const withoutAnything = buildClientExportManifest({});
    expect(withoutAnything.exports.dwg.available).toBe(false);
    expect(withoutAnything.exports.dwg.blockedReason).toBe(
      BLOCKED_REASONS.DWG_CONVERSION_UNAVAILABLE,
    );
  });

  test("PDF and PNG are always available", () => {
    const empty = buildClientExportManifest({});
    expect(empty.exports.pdf.available).toBe(true);
    expect(empty.exports.png.available).toBe(true);
  });

  test("GLB surfaces only when compiledProject.artifacts.glbUrl is set", () => {
    const without = buildClientExportManifest({
      compiledProject: { geometryHash: "g" },
    });
    expect(without.exports.glb.available).toBe(false);

    const withModel = buildClientExportManifest({
      compiledProject: {
        geometryHash: "g",
        artifacts: { glbUrl: "https://example.test/model.glb" },
      },
    });
    expect(withModel.exports.glb.available).toBe(true);
    expect(withModel.exports.glb.url).toBe("https://example.test/model.glb");
  });

  test("manifest carries schema_version, pipelineVersion, and geometryHash for downstream consumers", () => {
    const manifest = buildClientExportManifest({
      compiledProject: { geometryHash: "geom-hash-456" },
      pipelineVersion: "project-graph-vertical-slice-v1",
      projectName: "Office Studio",
    });
    expect(manifest.schema_version).toBe("compiled-export-manifest-v1");
    expect(manifest.pipelineVersion).toBe("project-graph-vertical-slice-v1");
    expect(manifest.geometryHash).toBe("geom-hash-456");
    expect(manifest.projectName).toBe("Office Studio");
  });
});

/**
 * Phase 2 amendment — restored-history gate for engineering exports.
 *
 * Before this gate, a design reloaded from history kept its restored
 * `exportManifest` claiming DXF/IFC/JSON/XLSX were READY (those flags
 * reflected what was achievable at generation time). The exporters in
 * `exportService` need the full `compiledProject` body — which the
 * design-history compactor intentionally strips on save — so clicking
 * any engineering row 4xx'd inside exportService. This suite locks the
 * fix: when `restoredFromHistory: true` AND no compiledProject is in
 * scope, every engineering key in the manifest is forced to
 * `available: false` with the structured reason
 * `REGENERATE_REQUIRED_FOR_ENGINEERING_EXPORT`. PNG / PDF / SVG remain
 * unaffected (sheet exports flow through the Phase 1 compact-reference
 * route and survive history reload).
 */

import {
  buildClientExportManifest,
  buildCompiledProjectExportSummary,
  buildExportManifestFromSummary,
  applyHistoryRestoreGate,
  BLOCKED_REASONS,
  ENGINEERING_EXPORT_KEYS,
} from "../../services/export/buildClientExportManifest.js";

const GEOMETRY_HASH = "geom-history-gate-abc";

function freshCompiledProject({ walls = 6, levels = 3, openings = 12 } = {}) {
  return {
    geometryHash: GEOMETRY_HASH,
    walls: new Array(walls).fill({}),
    levels: new Array(levels).fill({}),
    openings: new Array(openings).fill({}),
    artifacts: {},
  };
}

function freshlyReadyManifest() {
  return buildClientExportManifest({
    compiledProject: freshCompiledProject(),
    projectQuantityTakeoff: { items: new Array(8).fill({}) },
    geometryHash: GEOMETRY_HASH,
    projectName: "Gated Project",
  });
}

describe("applyHistoryRestoreGate — engineering rows", () => {
  test("ENGINEERING_EXPORT_KEYS covers the four keys the gate targets", () => {
    expect([...ENGINEERING_EXPORT_KEYS].sort()).toEqual([
      "dxf",
      "ifc",
      "json",
      "xlsx",
    ]);
  });

  test("does nothing for freshly-generated designs (restoredFromHistory=false)", () => {
    const manifest = freshlyReadyManifest();
    const gated = applyHistoryRestoreGate({
      manifest,
      restoredFromHistory: false,
      hasCompiledProject: true,
    });
    expect(gated).toBe(manifest);
  });

  test("does nothing for restored designs that still expose compiledProject", () => {
    // Edge case: a future history schema could persist the full
    // compiledProject. If it's in scope, the gate must not interfere.
    const manifest = freshlyReadyManifest();
    const gated = applyHistoryRestoreGate({
      manifest,
      restoredFromHistory: true,
      hasCompiledProject: true,
    });
    expect(gated).toBe(manifest);
    expect(gated.exports.dxf.available).toBe(true);
    expect(gated.exports.ifc.available).toBe(true);
    expect(gated.exports.json.available).toBe(true);
    expect(gated.exports.xlsx.available).toBe(true);
  });

  test("forces engineering rows OFF when restored without compiledProject", () => {
    const manifest = freshlyReadyManifest();
    const gated = applyHistoryRestoreGate({
      manifest,
      restoredFromHistory: true,
      hasCompiledProject: false,
    });
    expect(gated).not.toBe(manifest); // new object
    for (const key of ENGINEERING_EXPORT_KEYS) {
      expect(gated.exports[key].available).toBe(false);
      expect(gated.exports[key].blockedReason).toBe(
        BLOCKED_REASONS.REGENERATE_REQUIRED_FOR_ENGINEERING_EXPORT,
      );
    }
  });

  test("preserves sheet exports (png / pdf), DWG block, and GLB row", () => {
    const manifest = freshlyReadyManifest();
    const gated = applyHistoryRestoreGate({
      manifest,
      restoredFromHistory: true,
      hasCompiledProject: false,
    });
    // PNG / PDF flow through /api/a1/export and survive history reload.
    expect(gated.exports.png.available).toBe(true);
    expect(gated.exports.pdf.available).toBe(true);
    // DWG keeps its own structured block.
    expect(gated.exports.dwg.blockedReason).toBe(
      BLOCKED_REASONS.DWG_CONVERSION_UNAVAILABLE,
    );
  });

  test("preserves geometryHash, schema_version, projectName on the gated manifest", () => {
    const manifest = freshlyReadyManifest();
    const gated = applyHistoryRestoreGate({
      manifest,
      restoredFromHistory: true,
      hasCompiledProject: false,
    });
    expect(gated.geometryHash).toBe(GEOMETRY_HASH);
    expect(gated.schema_version).toBe(manifest.schema_version);
    expect(gated.projectName).toBe("Gated Project");
  });

  test("marks gated manifests via source suffix so callers can tell them apart", () => {
    const manifest = freshlyReadyManifest();
    const gated = applyHistoryRestoreGate({
      manifest,
      restoredFromHistory: true,
      hasCompiledProject: false,
    });
    expect(gated.source).toBe("client_fallback+restore_gated");
  });

  test("works on a rebuilt-from-summary manifest (the common reload path)", () => {
    // The hydrator rebuilds via buildExportManifestFromSummary when only
    // the slim summary is persisted. Gate must still apply.
    const summary = buildCompiledProjectExportSummary({
      compiledProject: freshCompiledProject(),
      projectQuantityTakeoff: { items: new Array(2).fill({}) },
      geometryHash: GEOMETRY_HASH,
    });
    const rebuilt = buildExportManifestFromSummary({ summary });
    const gated = applyHistoryRestoreGate({
      manifest: rebuilt,
      restoredFromHistory: true,
      hasCompiledProject: false,
    });
    expect(gated.source).toBe("restored_from_summary+restore_gated");
    for (const key of ENGINEERING_EXPORT_KEYS) {
      expect(gated.exports[key].available).toBe(false);
      expect(gated.exports[key].blockedReason).toBe(
        BLOCKED_REASONS.REGENERATE_REQUIRED_FOR_ENGINEERING_EXPORT,
      );
    }
    // Authority info still flows through.
    expect(gated.geometryHash).toBe(GEOMETRY_HASH);
  });

  test("null manifest passes through (no synthetic engineering rows)", () => {
    expect(
      applyHistoryRestoreGate({
        manifest: null,
        restoredFromHistory: true,
        hasCompiledProject: false,
      }),
    ).toBeNull();
  });
});

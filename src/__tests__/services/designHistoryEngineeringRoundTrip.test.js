/**
 * Phase 2 export-fix — design history engineering-bundle round-trip.
 *
 * The design history compactor strips the full `compiledProject` and
 * `projectQuantityTakeoff` on save (they would blow the localStorage
 * budget). Phase 1 left the engineering rows in ExportPanel BLOCKED after
 * a history reload because the hydrator had no information to feed
 * `buildClientExportManifest`. This suite proves the new contract:
 *
 *   - The slim `compiledProjectExportSummary` (~80 bytes) is captured BEFORE
 *     the compactor runs, so geometryHash / wall + level / takeoff-item
 *     counts survive.
 *   - The hydrator restores `exportManifest`, `geometryHash`,
 *     `compiledProjectExportSummary`, and `sheetArtifactManifest` explicitly.
 *   - When the persisted `exportManifest` is missing but the summary is
 *     present, the hydrator rebuilds the manifest from the summary so
 *     ExportPanel renders correct READY/BLOCKED rows.
 */

import {
  buildClientExportManifest,
  buildCompiledProjectExportSummary,
  buildExportManifestFromSummary,
  BLOCKED_REASONS,
} from "../../services/export/buildClientExportManifest.js";
import { buildSheetResultFromDesignHistoryEntry } from "../../services/designHistoryResultHydrator.js";

const FRESH_GEOMETRY_HASH = "geom-hash-abcdef";

function freshCompiledProject({ walls = 4, levels = 2, openings = 8 } = {}) {
  return {
    geometryHash: FRESH_GEOMETRY_HASH,
    walls: new Array(walls).fill({}),
    levels: new Array(levels).fill({}),
    openings: new Array(openings).fill({}),
    artifacts: { glbUrl: null },
  };
}

describe("buildCompiledProjectExportSummary", () => {
  test("captures the four counts and geometryHash from a fresh compiledProject", () => {
    const summary = buildCompiledProjectExportSummary({
      compiledProject: freshCompiledProject(),
      projectQuantityTakeoff: { items: new Array(12).fill({}) },
      geometryHash: FRESH_GEOMETRY_HASH,
    });
    expect(summary).toEqual({
      schema_version: "compiled-project-export-summary-v1",
      geometryHash: FRESH_GEOMETRY_HASH,
      wallCount: 4,
      levelCount: 2,
      openingCount: 8,
      takeoffItemCount: 12,
      glbAvailable: false,
    });
  });

  test("returns null when nothing is present", () => {
    expect(buildCompiledProjectExportSummary({})).toBeNull();
  });

  test("falls back to compiledProject.geometryHash when explicit hash is missing", () => {
    const summary = buildCompiledProjectExportSummary({
      compiledProject: freshCompiledProject(),
      projectQuantityTakeoff: null,
    });
    expect(summary?.geometryHash).toBe(FRESH_GEOMETRY_HASH);
    expect(summary?.takeoffItemCount).toBe(0);
  });

  test("flags GLB availability when compiledProject.artifacts.glbUrl is set", () => {
    const summary = buildCompiledProjectExportSummary({
      compiledProject: {
        ...freshCompiledProject(),
        artifacts: { glbUrl: "https://example.test/model.glb" },
      },
      projectQuantityTakeoff: null,
    });
    expect(summary?.glbAvailable).toBe(true);
  });
});

describe("buildExportManifestFromSummary — readiness mirrors fresh manifest", () => {
  test("rebuilt manifest matches a freshly-built one for the same inputs", () => {
    const compiledProject = freshCompiledProject();
    const takeoff = { items: new Array(5).fill({}) };
    const summary = buildCompiledProjectExportSummary({
      compiledProject,
      projectQuantityTakeoff: takeoff,
      geometryHash: FRESH_GEOMETRY_HASH,
    });

    const fresh = buildClientExportManifest({
      compiledProject,
      projectQuantityTakeoff: takeoff,
      geometryHash: FRESH_GEOMETRY_HASH,
      projectName: "Test Project",
      pipelineVersion: "test-v1",
    });
    const restored = buildExportManifestFromSummary({
      summary,
      projectName: "Test Project",
      pipelineVersion: "test-v1",
    });

    // `source` differs deliberately so callers can tell them apart; every
    // other readiness signal must match exactly.
    expect(fresh.source).toBe("client_fallback");
    expect(restored.source).toBe("restored_from_summary");
    expect(restored.geometryHash).toBe(fresh.geometryHash);
    for (const key of [
      "png",
      "pdf",
      "dxf",
      "ifc",
      "json",
      "xlsx",
      "dwg",
      "glb",
    ]) {
      expect(restored.exports[key].available).toBe(
        fresh.exports[key].available,
      );
      expect(restored.exports[key].blockedReason || null).toBe(
        fresh.exports[key].blockedReason || null,
      );
    }
  });

  test("zero walls / levels keeps IFC blocked with IFC_GEOMETRY_INSUFFICIENT", () => {
    const summary = buildCompiledProjectExportSummary({
      compiledProject: freshCompiledProject({ walls: 0, levels: 0 }),
      projectQuantityTakeoff: null,
      geometryHash: FRESH_GEOMETRY_HASH,
    });
    const restored = buildExportManifestFromSummary({ summary });
    expect(restored.exports.ifc.available).toBe(false);
    expect(restored.exports.ifc.blockedReason).toBe(
      BLOCKED_REASONS.IFC_GEOMETRY_INSUFFICIENT,
    );
  });

  test("zero takeoff items keeps XLSX blocked with QUANTITY_TAKEOFF_UNAVAILABLE", () => {
    const summary = buildCompiledProjectExportSummary({
      compiledProject: freshCompiledProject(),
      projectQuantityTakeoff: null,
      geometryHash: FRESH_GEOMETRY_HASH,
    });
    const restored = buildExportManifestFromSummary({ summary });
    expect(restored.exports.xlsx.available).toBe(false);
    expect(restored.exports.xlsx.blockedReason).toBe(
      BLOCKED_REASONS.QUANTITY_TAKEOFF_UNAVAILABLE,
    );
  });

  test("missing geometryHash blocks DXF / JSON / XLSX with structured reason codes", () => {
    const summary = buildCompiledProjectExportSummary({
      compiledProject: {
        // no geometryHash, no walls/levels
        walls: [],
        levels: [],
        openings: [],
      },
      projectQuantityTakeoff: { items: [] },
    });
    const restored = buildExportManifestFromSummary({ summary });
    expect(restored.exports.dxf.available).toBe(false);
    expect(restored.exports.dxf.blockedReason).toBe(
      BLOCKED_REASONS.GEOMETRY_HASH_MISSING,
    );
    expect(restored.exports.json.available).toBe(false);
    expect(restored.exports.json.blockedReason).toBe(
      BLOCKED_REASONS.GEOMETRY_HASH_MISSING,
    );
    expect(restored.exports.xlsx.available).toBe(false);
    expect(restored.exports.xlsx.blockedReason).toBe(
      BLOCKED_REASONS.GEOMETRY_HASH_MISSING,
    );
  });
});

describe("buildSheetResultFromDesignHistoryEntry — preserves engineering bundle", () => {
  test("restores top-level exportManifest verbatim when present in saved design", () => {
    const compiledProject = freshCompiledProject();
    const savedExportManifest = buildClientExportManifest({
      compiledProject,
      projectQuantityTakeoff: { items: new Array(3).fill({}) },
      geometryHash: FRESH_GEOMETRY_HASH,
    });
    const savedDesign = {
      designId: "design-1",
      id: "design-1",
      composedSheetUrl: "/api/a1/compose-output/a1-foo.png",
      a1Sheet: { sheetId: "sheet-1" },
      sheetMetadata: { designId: "design-1" },
      // Phase 2 engineering bundle persisted by designHistoryRepository:
      geometryHash: FRESH_GEOMETRY_HASH,
      compiledProjectExportSummary: buildCompiledProjectExportSummary({
        compiledProject,
        projectQuantityTakeoff: { items: new Array(3).fill({}) },
        geometryHash: FRESH_GEOMETRY_HASH,
      }),
      exportManifest: savedExportManifest,
    };

    const restored = buildSheetResultFromDesignHistoryEntry(savedDesign);

    expect(restored.geometryHash).toBe(FRESH_GEOMETRY_HASH);
    expect(restored.compiledProjectExportSummary).toEqual(
      savedDesign.compiledProjectExportSummary,
    );
    // exportManifest preserved verbatim (no rebuild).
    expect(restored.exportManifest).toBe(savedExportManifest);
    expect(restored.exportManifest.exports.dxf.available).toBe(true);
    expect(restored.exportManifest.exports.ifc.available).toBe(true);
  });

  test("rebuilds exportManifest from compiledProjectExportSummary when manifest is missing", () => {
    // Older saves OR a compactor that drops `exportManifest` but keeps the
    // tiny summary should still produce a manifest on reload.
    const compiledProject = freshCompiledProject();
    const summary = buildCompiledProjectExportSummary({
      compiledProject,
      projectQuantityTakeoff: { items: new Array(7).fill({}) },
      geometryHash: FRESH_GEOMETRY_HASH,
    });
    const savedDesign = {
      designId: "design-2",
      id: "design-2",
      composedSheetUrl: "/api/a1/compose-output/a1-bar.png",
      a1Sheet: { sheetId: "sheet-2" },
      sheetMetadata: { designId: "design-2" },
      compiledProjectExportSummary: summary,
      // NO exportManifest
    };

    const restored = buildSheetResultFromDesignHistoryEntry(savedDesign);

    expect(restored.exportManifest).toBeTruthy();
    expect(restored.exportManifest.source).toBe("restored_from_summary");
    expect(restored.exportManifest.exports.dxf.available).toBe(true);
    expect(restored.exportManifest.exports.ifc.available).toBe(true);
    expect(restored.exportManifest.exports.xlsx.available).toBe(true);
  });

  test("absence of both manifest and summary leaves exportManifest null (no false positives)", () => {
    const savedDesign = {
      designId: "design-3",
      id: "design-3",
      composedSheetUrl: "/api/a1/compose-output/a1-baz.png",
      a1Sheet: { sheetId: "sheet-3" },
      sheetMetadata: { designId: "design-3" },
      // No engineering fields at all
    };

    const restored = buildSheetResultFromDesignHistoryEntry(savedDesign);
    expect(restored.exportManifest).toBeFalsy();
    expect(restored.compiledProjectExportSummary).toBeFalsy();
  });

  test("hydrator restores sheetArtifactManifest from any of the canonical positions", () => {
    const manifest = { exportGate: "pass", version: "test-v1" };

    // Top-level
    expect(
      buildSheetResultFromDesignHistoryEntry({
        designId: "d",
        a1Sheet: {},
        sheetArtifactManifest: manifest,
      }).sheetArtifactManifest,
    ).toBe(manifest);

    // Inside a1Sheet
    expect(
      buildSheetResultFromDesignHistoryEntry({
        designId: "d",
        a1Sheet: { sheetArtifactManifest: manifest },
      }).sheetArtifactManifest,
    ).toBe(manifest);

    // Inside metadata
    expect(
      buildSheetResultFromDesignHistoryEntry({
        designId: "d",
        a1Sheet: {},
        sheetMetadata: { sheetArtifactManifest: manifest },
      }).sheetArtifactManifest,
    ).toBe(manifest);
  });
});

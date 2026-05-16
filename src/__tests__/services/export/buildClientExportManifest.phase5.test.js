/**
 * Phase 5 — Codex audit blocker #3.
 *
 * Locks the readiness rules:
 *   - GLB is available when a compiledProject with geometryHash is in
 *     scope (on-demand build path).
 *   - GLB stays available when a pre-baked `artifacts.glbUrl` is present
 *     (legacy / Meshy3D / history-restored path).
 *   - GLB is gated by applyHistoryRestoreGate when the design is restored
 *     from history WITHOUT a full compiledProject AND without a
 *     pre-baked glbUrl — that path cannot build on demand.
 *   - DWG is available ONLY when the server-provided
 *     dwgConverterCapabilities.available === true.
 *   - DWG is blocked with DWG_CONVERSION_UNAVAILABLE + docsUrl otherwise,
 *     so the UI can render "Install ODA File Converter (link)".
 */

import {
  buildClientExportManifest,
  applyHistoryRestoreGate,
  BLOCKED_REASONS,
  ENGINEERING_EXPORT_KEYS,
} from "../../../services/export/buildClientExportManifest.js";

function compiledFixture(overrides = {}) {
  return {
    geometryHash: "phase5-manifest-test",
    walls: [{ id: "w1" }, { id: "w2" }],
    levels: [{ id: "L0" }],
    openings: [{ id: "o1" }],
    slabs: [{ id: "s1" }],
    ...overrides,
  };
}

describe("buildClientExportManifest — Phase 5 GLB readiness", () => {
  test("GLB available on a fresh compiledProject (on-demand build path)", () => {
    const manifest = buildClientExportManifest({
      compiledProject: compiledFixture(),
    });
    expect(manifest.exports.glb.available).toBe(true);
    expect(manifest.exports.glb.method).toBe("POST");
    expect(manifest.exports.glb.endpoint).toBe("/api/project/export/glb");
    expect(manifest.exports.glb.source).toBe("on_demand_compiled_project");
    expect(manifest.exports.glb.url).toBeFalsy();
  });

  test("GLB stays available with a pre-baked glbUrl + reports legacy source", () => {
    const manifest = buildClientExportManifest({
      compiledProject: {
        ...compiledFixture(),
        artifacts: { glbUrl: "https://cdn.example/model.glb" },
      },
    });
    expect(manifest.exports.glb.available).toBe(true);
    expect(manifest.exports.glb.url).toBe("https://cdn.example/model.glb");
    expect(manifest.exports.glb.source).toBe("pre_baked_artifact");
    expect(manifest.exports.glb.method).toBe("GET");
  });

  test("GLB blocked when neither compiledProject nor pre-baked url is present", () => {
    const manifest = buildClientExportManifest({});
    expect(manifest.exports.glb.available).toBe(false);
    expect(manifest.exports.glb.blockedReason).toBe(
      BLOCKED_REASONS.COMPILED_PROJECT_MISSING,
    );
  });

  test("GLB is in ENGINEERING_EXPORT_KEYS so history-restore gate handles it", () => {
    expect(ENGINEERING_EXPORT_KEYS).toContain("glb");
  });

  test("applyHistoryRestoreGate blocks GLB when no compiledProject AND no pre-baked url", () => {
    const manifest = buildClientExportManifest({
      compiledProject: compiledFixture(),
    });
    const gated = applyHistoryRestoreGate({
      manifest,
      restoredFromHistory: true,
      hasCompiledProject: false,
    });
    expect(gated.exports.glb.available).toBe(false);
    expect(gated.exports.glb.blockedReason).toBe(
      BLOCKED_REASONS.REGENERATE_REQUIRED_FOR_ENGINEERING_EXPORT,
    );
  });

  test("applyHistoryRestoreGate keeps GLB available when a pre-baked url survives history", () => {
    const manifest = buildClientExportManifest({
      compiledProject: {
        ...compiledFixture(),
        artifacts: { glbUrl: "preserved://restored-from-history" },
      },
    });
    const gated = applyHistoryRestoreGate({
      manifest,
      restoredFromHistory: true,
      hasCompiledProject: false,
    });
    expect(gated.exports.glb.available).toBe(true);
    expect(gated.exports.glb.url).toBe("preserved://restored-from-history");
  });
});

describe("buildClientExportManifest — Phase 5 DWG readiness", () => {
  test("DWG blocked by default when no converter capabilities passed", () => {
    const manifest = buildClientExportManifest({
      compiledProject: compiledFixture(),
    });
    expect(manifest.exports.dwg.available).toBe(false);
    expect(manifest.exports.dwg.blockedReason).toBe(
      BLOCKED_REASONS.DWG_CONVERSION_UNAVAILABLE,
    );
  });

  test("DWG blocked when capabilities report unavailable", () => {
    const manifest = buildClientExportManifest({
      compiledProject: compiledFixture(),
      dwgConverterCapabilities: {
        available: false,
        reason: "DWG conversion is disabled.",
        docsUrl: "https://example/docs",
      },
    });
    expect(manifest.exports.dwg.available).toBe(false);
    expect(manifest.exports.dwg.blockedReason).toBe(
      BLOCKED_REASONS.DWG_CONVERSION_UNAVAILABLE,
    );
    expect(manifest.exports.dwg.docsUrl).toBe("https://example/docs");
    expect(manifest.exports.dwg.converterReason).toMatch(/disabled/);
  });

  test("DWG available when capabilities.available is true + compiledProject in scope", () => {
    const manifest = buildClientExportManifest({
      compiledProject: compiledFixture(),
      dwgConverterCapabilities: {
        available: true,
        provider: "oda",
        odaPath: "/usr/local/bin/oda",
        docsUrl: "https://opendesign.com/...",
      },
    });
    expect(manifest.exports.dwg.available).toBe(true);
    expect(manifest.exports.dwg.method).toBe("POST");
    expect(manifest.exports.dwg.endpoint).toBe("/api/project/export/dwg");
    expect(manifest.exports.dwg.converterProvider).toBe("oda");
  });

  test("DWG blocked when capabilities OK but no compiledProject (geometry missing)", () => {
    const manifest = buildClientExportManifest({
      dwgConverterCapabilities: { available: true, provider: "oda" },
    });
    expect(manifest.exports.dwg.available).toBe(false);
    expect(manifest.exports.dwg.blockedReason).toBe(
      BLOCKED_REASONS.COMPILED_PROJECT_MISSING,
    );
  });
});

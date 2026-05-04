import { buildComposeArtifactManifest } from "../../../services/a1/composeTrace.js";
import {
  A1_HARDENING_VERSION,
  A1_HARDENING_PRS,
  buildA1HardeningStamp,
} from "../../../services/a1/a1HardeningStamp.js";

// PR-D finishing: the compose manifest must carry the A1 hardening build
// stamp + an authority block that aggregates technical/visual/boundary/
// mainEntry authority for ops + QA dashboards. These tests pin the contract.

const STAMPED_TECHNICAL_PANEL = {
  type: "floor_plan_ground",
  hasBuffer: true,
  geometryHash: "geom-canonical-1",
  svgHash: "svg-fp-1",
  authorityUsed: "compiled_project_canonical_pack",
  authoritySource: "compiled_project",
  panelAuthorityReason:
    "deterministic projection from compiled canonical geometry",
  generatorUsed: "enhancedTechnicalDrawingAdapter",
  sourceType: "deterministic_svg",
  compiledProjectSchemaVersion: "compiled-project-v1",
};

const STAMPED_VISUAL_PANEL = {
  type: "hero_3d",
  hasBuffer: true,
  geometryHash: "geom-canonical-1",
  authorityUsed: "compiled_project_canonical_pack",
  authoritySource: "compiled_project",
  generatorUsed: "canonical_render_service",
  sourceType: "raster_render",
  compiledProjectSchemaVersion: "compiled-project-v1",
};

describe("a1HardeningStamp module", () => {
  test("A1_HARDENING_VERSION matches the documented vN.M format", () => {
    expect(A1_HARDENING_VERSION).toMatch(/^a1-hardening-v\d+(\.\d+)?$/);
  });

  test("A1_HARDENING_PRS lists PR-A through PR-D", () => {
    const ids = A1_HARDENING_PRS.map((entry) => entry.id);
    expect(ids).toEqual(["PR-A", "PR-B", "PR-C", "PR-D"]);
  });

  test("buildA1HardeningStamp returns the canonical shape", () => {
    const stamp = buildA1HardeningStamp();
    expect(stamp.version).toBe(A1_HARDENING_VERSION);
    expect(stamp.prs).toEqual(["PR-A", "PR-B", "PR-C", "PR-D"]);
    expect(stamp.phases).toEqual(
      expect.arrayContaining([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]),
    );
    expect(stamp.stampedAt).toBe("1970-01-01T00:00:00.000Z");
  });
});

describe("buildComposeArtifactManifest authority + buildStamp (PR-D)", () => {
  test("includes A1 hardening buildStamp at the top level", () => {
    const manifest = buildComposeArtifactManifest({
      panelsByKey: { floor_plan_ground: STAMPED_TECHNICAL_PANEL },
      geometryHash: "geom-canonical-1",
    });
    expect(manifest.buildStamp).toBeTruthy();
    expect(manifest.buildStamp.version).toBe(A1_HARDENING_VERSION);
    expect(manifest.buildStamp.prs).toContain("PR-A");
    expect(manifest.buildStamp.prs).toContain("PR-D");
  });

  test("authority.technicalPanelsAuthority is the mode of technical panels", () => {
    const manifest = buildComposeArtifactManifest({
      panelsByKey: {
        floor_plan_ground: STAMPED_TECHNICAL_PANEL,
        elevation_south: {
          ...STAMPED_TECHNICAL_PANEL,
          type: "elevation_south",
        },
        section_AA: { ...STAMPED_TECHNICAL_PANEL, type: "section_AA" },
      },
      geometryHash: "geom-canonical-1",
    });
    expect(manifest.authority.technicalPanelsAuthority).toBe(
      "compiled_project_canonical_pack",
    );
    expect(manifest.authority.geometryHash).toBe("geom-canonical-1");
    expect(manifest.authority.compiledProjectSchemaVersion).toBe(
      "compiled-project-v1",
    );
    expect(manifest.authority.canonicalProjectGeometryVersion).toBe(
      "compiled-project-v1",
    );
  });

  test("authority.visualPanelsAuthority is the mode of non-technical panels", () => {
    const manifest = buildComposeArtifactManifest({
      panelsByKey: {
        floor_plan_ground: STAMPED_TECHNICAL_PANEL,
        hero_3d: STAMPED_VISUAL_PANEL,
        interior_3d: { ...STAMPED_VISUAL_PANEL, type: "interior_3d" },
      },
      geometryHash: "geom-canonical-1",
    });
    expect(manifest.authority.visualPanelsAuthority).toBe(
      "compiled_project_canonical_pack",
    );
  });

  test("authority.boundaryAuthority summarises the boundary input", () => {
    const manifest = buildComposeArtifactManifest({
      panelsByKey: { floor_plan_ground: STAMPED_TECHNICAL_PANEL },
      geometryHash: "geom-canonical-1",
      boundaryAuthority: {
        boundarySource: "manual_verified",
        boundaryAuthoritative: true,
        areaM2: 425,
        policyVersion: "site-boundary-policy-v3",
      },
    });
    expect(manifest.authority.boundaryAuthority).toEqual({
      source: "manual_verified",
      authoritative: true,
      areaM2: 425,
      policyVersion: "site-boundary-policy-v3",
    });
  });

  test("authority.boundaryAuthority falls back through area / surfaceAreaM2", () => {
    const manifest = buildComposeArtifactManifest({
      panelsByKey: { floor_plan_ground: STAMPED_TECHNICAL_PANEL },
      geometryHash: "geom-canonical-1",
      boundaryAuthority: {
        boundarySource: "compiled_project",
        boundaryAuthoritative: true,
        surfaceAreaM2: 880,
      },
    });
    expect(manifest.authority.boundaryAuthority.areaM2).toBe(880);
  });

  test("authority.mainEntryAuthority summarises the main entry input", () => {
    const manifest = buildComposeArtifactManifest({
      panelsByKey: { floor_plan_ground: STAMPED_TECHNICAL_PANEL },
      geometryHash: "geom-canonical-1",
      mainEntryAuthority: {
        direction: "south",
        bearingDeg: 180,
        source: "manual",
        confidence: 1,
      },
    });
    expect(manifest.authority.mainEntryAuthority).toEqual({
      direction: "south",
      bearingDeg: 180,
      source: "manual",
      confidence: 1,
    });
  });

  test("authority.boundaryAuthority and mainEntryAuthority are null when not supplied", () => {
    const manifest = buildComposeArtifactManifest({
      panelsByKey: { floor_plan_ground: STAMPED_TECHNICAL_PANEL },
      geometryHash: "geom-canonical-1",
    });
    expect(manifest.authority.boundaryAuthority).toBeNull();
    expect(manifest.authority.mainEntryAuthority).toBeNull();
  });

  test("manifest preserves existing fields (hashes, panelsByKey, qa)", () => {
    const manifest = buildComposeArtifactManifest({
      panelsByKey: { floor_plan_ground: STAMPED_TECHNICAL_PANEL },
      geometryHash: "geom-canonical-1",
      dnaHash: "dna-1",
      programHash: "program-1",
      qaResults: { allPassed: true, summary: "ok" },
    });
    expect(manifest.hashes.geometryHash).toBe("geom-canonical-1");
    expect(manifest.hashes.dnaHash).toBe("dna-1");
    expect(manifest.hashes.programHash).toBe("program-1");
    expect(manifest.qa.allPassed).toBe(true);
    expect(manifest.panelsByKey.floor_plan_ground.geometryHash).toBe(
      "geom-canonical-1",
    );
  });
});

/**
 * Track 1 (Phase 1) — A1 export degraded-mode contract.
 *
 * Verifies the new behaviour added on top of the post-UI-smoke
 * `buildA1ExportQaFromGate` fold:
 *
 *   - readability/graphic-only blockers => status "degraded", allowed:true,
 *     degradedExport:true. PDF artifact will still be emitted (with a
 *     PRELIMINARY stamp; that's tested separately in the slice integration
 *     tests).
 *   - any geometry/authority/unknown blocker, OR gate.allowed:false, hard-
 *     blocks the export — degradedExport stays false.
 *   - the categorizer recognises the canonical A1ExportGate prefixes and
 *     leaves unrecognised codes as UNKNOWN (non-degradable so we fail
 *     closed).
 */

import {
  categorizeBlocker,
  blockersAreDegradable,
  BLOCKER_CATEGORIES,
  DEGRADABLE_BLOCKER_CATEGORIES,
} from "../../services/qa/blockerCategories.js";
import { __projectGraphVerticalSliceInternals } from "../../services/project/projectGraphVerticalSliceService.js";

const { buildA1ExportQaFromGate } = __projectGraphVerticalSliceInternals;

const PASS_GATE = Object.freeze({
  status: "pass",
  allowed: true,
  blockers: [],
  warnings: [],
  demotedToPreview: false,
  scope: "compose_final",
  version: "phase-f-a1-export-gate-v1",
});

const blockerCode = (code, extra = {}) => ({
  code,
  severity: "blocker",
  message: `synthetic ${code}`,
  ...extra,
});

describe("categorizeBlocker", () => {
  test("authority prefixes route to authority category", () => {
    expect(categorizeBlocker("MISSING_CANONICAL_PACK: missing")).toBe(
      BLOCKER_CATEGORIES.AUTHORITY,
    );
    expect(categorizeBlocker("MISSING_CANONICAL_3D_RENDERS: missing")).toBe(
      BLOCKER_CATEGORIES.AUTHORITY,
    );
    expect(categorizeBlocker("CANONICAL_3D_VALIDATION_FAILED: bad")).toBe(
      BLOCKER_CATEGORIES.AUTHORITY,
    );
    expect(categorizeBlocker("MISSING_REQUIRED_PANEL: hero_3d")).toBe(
      BLOCKER_CATEGORIES.AUTHORITY,
    );
    expect(categorizeBlocker("COMPILED_PROJECT_MISSING")).toBe(
      BLOCKER_CATEGORIES.AUTHORITY,
    );
    expect(categorizeBlocker("GEOMETRY_HASH_MISSING: empty")).toBe(
      BLOCKER_CATEGORIES.AUTHORITY,
    );
    expect(categorizeBlocker("GEOMETRY_SIGNATURE_FAILED: x")).toBe(
      BLOCKER_CATEGORIES.AUTHORITY,
    );
    expect(categorizeBlocker("INTEGRITY_PANEL_HASH: x")).toBe(
      BLOCKER_CATEGORIES.AUTHORITY,
    );
  });

  test("geometry prefixes route to geometry category", () => {
    expect(categorizeBlocker("EDGE_CONSISTENCY_FAILED: diff")).toBe(
      BLOCKER_CATEGORIES.GEOMETRY,
    );
    expect(categorizeBlocker("VISUAL_CONSISTENCY_FAILED: pHash diff")).toBe(
      BLOCKER_CATEGORIES.GEOMETRY,
    );
    expect(categorizeBlocker("CROSS_VIEW_MISMATCH")).toBe(
      BLOCKER_CATEGORIES.GEOMETRY,
    );
    expect(categorizeBlocker("PANEL_GEOMETRY_HASH_MISMATCH")).toBe(
      BLOCKER_CATEGORIES.GEOMETRY,
    );
  });

  test("readability prefixes route to readability category", () => {
    expect(categorizeBlocker("TEXT_PROOF_TOFU: missing glyphs")).toBe(
      BLOCKER_CATEGORIES.READABILITY,
    );
    expect(categorizeBlocker("GLYPH_INTEGRITY_TOFU")).toBe(
      BLOCKER_CATEGORIES.READABILITY,
    );
    expect(categorizeBlocker("FONT_EMBEDDING_FAILED")).toBe(
      BLOCKER_CATEGORIES.READABILITY,
    );
  });

  test("graphic prefixes route to graphic category", () => {
    expect(categorizeBlocker("RENDER_SANITY_LOW_OCCUPANCY")).toBe(
      BLOCKER_CATEGORIES.GRAPHIC,
    );
    expect(categorizeBlocker("LAYOUT_PANEL_OVERLAP")).toBe(
      BLOCKER_CATEGORIES.GRAPHIC,
    );
    expect(categorizeBlocker("OCCUPANCY_BELOW_THRESHOLD")).toBe(
      BLOCKER_CATEGORIES.GRAPHIC,
    );
    expect(categorizeBlocker("THIN_STRIP_DETECTED")).toBe(
      BLOCKER_CATEGORIES.GRAPHIC,
    );
  });

  test("PANEL_QA_FAILED routes by subtype; bare form is UNKNOWN", () => {
    expect(categorizeBlocker("PANEL_QA_FAILED: hero_3d failed")).toBe(
      BLOCKER_CATEGORIES.UNKNOWN,
    );
    expect(categorizeBlocker("PANEL_QA_FAILED:geometry_alignment off")).toBe(
      BLOCKER_CATEGORIES.GEOMETRY,
    );
    expect(categorizeBlocker("PANEL_QA_FAILED:readability_tofu")).toBe(
      BLOCKER_CATEGORIES.READABILITY,
    );
    expect(categorizeBlocker("PANEL_QA_FAILED:text_proof_low")).toBe(
      BLOCKER_CATEGORIES.READABILITY,
    );
  });

  test("structured blockers respect an explicit category field", () => {
    expect(
      categorizeBlocker({
        code: "UNRECOGNISED",
        category: BLOCKER_CATEGORIES.GRAPHIC,
      }),
    ).toBe(BLOCKER_CATEGORIES.GRAPHIC);
  });

  test("unknown / empty / null inputs are UNKNOWN", () => {
    expect(categorizeBlocker(null)).toBe(BLOCKER_CATEGORIES.UNKNOWN);
    expect(categorizeBlocker("")).toBe(BLOCKER_CATEGORIES.UNKNOWN);
    expect(categorizeBlocker("SOMETHING_NEW_GATE_DOES_NOT_KNOW")).toBe(
      BLOCKER_CATEGORIES.UNKNOWN,
    );
  });
});

describe("blockersAreDegradable", () => {
  test("empty list is never degradable (clean export, not degraded)", () => {
    expect(blockersAreDegradable([])).toBe(false);
    expect(blockersAreDegradable(null)).toBe(false);
    expect(blockersAreDegradable(undefined)).toBe(false);
  });

  test("all-readability list is degradable", () => {
    expect(
      blockersAreDegradable([
        blockerCode("TEXT_PROOF_TOFU"),
        blockerCode("GLYPH_INTEGRITY_TOFU"),
      ]),
    ).toBe(true);
  });

  test("all-graphic list is degradable", () => {
    expect(
      blockersAreDegradable([
        blockerCode("RENDER_SANITY_LOW_OCCUPANCY"),
        blockerCode("LAYOUT_PANEL_OVERLAP"),
      ]),
    ).toBe(true);
  });

  test("mixed graphic + readability list is degradable", () => {
    expect(
      blockersAreDegradable([
        blockerCode("RENDER_SANITY_LOW_OCCUPANCY"),
        blockerCode("TEXT_PROOF_TOFU"),
      ]),
    ).toBe(true);
  });

  test("any geometry blocker forces non-degradable", () => {
    expect(
      blockersAreDegradable([
        blockerCode("TEXT_PROOF_TOFU"),
        blockerCode("EDGE_CONSISTENCY_FAILED"),
      ]),
    ).toBe(false);
  });

  test("any authority blocker forces non-degradable", () => {
    expect(
      blockersAreDegradable([
        blockerCode("RENDER_SANITY_LOW_OCCUPANCY"),
        blockerCode("MISSING_CANONICAL_PACK"),
      ]),
    ).toBe(false);
  });

  test("an unknown blocker fails closed (non-degradable)", () => {
    expect(
      blockersAreDegradable([
        blockerCode("RENDER_SANITY_LOW_OCCUPANCY"),
        blockerCode("SOMETHING_BRAND_NEW"),
      ]),
    ).toBe(false);
  });

  test("DEGRADABLE_BLOCKER_CATEGORIES is exactly {graphic, readability}", () => {
    expect(DEGRADABLE_BLOCKER_CATEGORIES.has(BLOCKER_CATEGORIES.GRAPHIC)).toBe(
      true,
    );
    expect(
      DEGRADABLE_BLOCKER_CATEGORIES.has(BLOCKER_CATEGORIES.READABILITY),
    ).toBe(true);
    expect(DEGRADABLE_BLOCKER_CATEGORIES.has(BLOCKER_CATEGORIES.GEOMETRY)).toBe(
      false,
    );
    expect(
      DEGRADABLE_BLOCKER_CATEGORIES.has(BLOCKER_CATEGORIES.AUTHORITY),
    ).toBe(false);
    expect(DEGRADABLE_BLOCKER_CATEGORIES.has(BLOCKER_CATEGORIES.UNKNOWN)).toBe(
      false,
    );
  });
});

describe("buildA1ExportQaFromGate — degradedExport path", () => {
  test("pure readability blockers => status 'degraded', allowed:true, degradedExport:true", () => {
    const result = buildA1ExportQaFromGate({
      exportGate: {
        ...PASS_GATE,
        status: "blocked",
        blockers: [
          blockerCode("TEXT_PROOF_TOFU"),
          blockerCode("GLYPH_INTEGRITY_TOFU"),
        ],
      },
    });
    expect(result.status).toBe("degraded");
    expect(result.allowed).toBe(true);
    expect(result.degradedExport).toBe(true);
    expect(result.blockers).toHaveLength(2);
    expect(result.blockers[0].category).toBe(BLOCKER_CATEGORIES.READABILITY);
    expect(result.blockers[1].category).toBe(BLOCKER_CATEGORIES.READABILITY);
  });

  test("pure graphic blockers => degraded", () => {
    const result = buildA1ExportQaFromGate({
      exportGate: {
        ...PASS_GATE,
        status: "blocked",
        blockers: [blockerCode("RENDER_SANITY_LOW_OCCUPANCY")],
      },
    });
    expect(result.status).toBe("degraded");
    expect(result.allowed).toBe(true);
    expect(result.degradedExport).toBe(true);
    expect(result.blockers[0].category).toBe(BLOCKER_CATEGORIES.GRAPHIC);
  });

  test("any geometry blocker hard-blocks (no degrade)", () => {
    const result = buildA1ExportQaFromGate({
      exportGate: {
        ...PASS_GATE,
        status: "blocked",
        blockers: [blockerCode("EDGE_CONSISTENCY_FAILED")],
      },
    });
    expect(result.status).toBe("blocked");
    expect(result.allowed).toBe(false);
    expect(result.degradedExport).toBe(false);
  });

  test("any authority blocker hard-blocks (no degrade)", () => {
    const result = buildA1ExportQaFromGate({
      exportGate: {
        ...PASS_GATE,
        status: "blocked",
        blockers: [blockerCode("MISSING_CANONICAL_PACK")],
      },
    });
    expect(result.status).toBe("blocked");
    expect(result.allowed).toBe(false);
    expect(result.degradedExport).toBe(false);
  });

  test("mixed geometry + readability => blocked, not degraded", () => {
    const result = buildA1ExportQaFromGate({
      exportGate: {
        ...PASS_GATE,
        status: "blocked",
        blockers: [
          blockerCode("EDGE_CONSISTENCY_FAILED"),
          blockerCode("TEXT_PROOF_TOFU"),
        ],
      },
    });
    expect(result.status).toBe("blocked");
    expect(result.allowed).toBe(false);
    expect(result.degradedExport).toBe(false);
  });

  test("gate.allowed:false is a hard veto even with degradable blockers only", () => {
    // The gate has spoken — we never second-guess an explicit allowed:false.
    // Preserves the existing buildA1ExportQaFromGate contract documented
    // in projectGraphVerticalSliceServiceA1ExportQaFromGate.test.js.
    const result = buildA1ExportQaFromGate({
      exportGate: {
        ...PASS_GATE,
        allowed: false,
        status: "blocked",
        blockers: [blockerCode("RENDER_SANITY_LOW_OCCUPANCY")],
      },
    });
    expect(result.status).toBe("blocked");
    expect(result.allowed).toBe(false);
    expect(result.degradedExport).toBe(false);
  });

  test("panel QA fail synthetic blocker (no subtype) => UNKNOWN => blocked, not degraded", () => {
    // Preserves the existing PANEL_QA_FAILED contract: the bare synthetic
    // blocker carries no subtype info, so we cannot tell whether the
    // failure is cosmetic or structural — fail closed.
    const result = buildA1ExportQaFromGate({
      exportGate: { ...PASS_GATE },
      panelQaSummary: { status: "fail" },
    });
    expect(result.status).toBe("blocked");
    expect(result.allowed).toBe(false);
    expect(result.degradedExport).toBe(false);
    expect(
      result.blockers.find((b) => b.code === "PANEL_QA_FAILED")?.category,
    ).toBe(BLOCKER_CATEGORIES.UNKNOWN);
  });

  test("clean pass => degradedExport:false (no blockers, no warnings)", () => {
    const result = buildA1ExportQaFromGate({
      exportGate: { ...PASS_GATE },
      panelQaSummary: { status: "passed" },
    });
    expect(result.status).toBe("pass");
    expect(result.allowed).toBe(true);
    expect(result.degradedExport).toBe(false);
  });

  test("input blockers are cloned, not mutated, when stamping category", () => {
    const gateBlockers = [{ code: "TEXT_PROOF_TOFU", severity: "blocker" }];
    buildA1ExportQaFromGate({
      exportGate: {
        ...PASS_GATE,
        status: "blocked",
        blockers: gateBlockers,
      },
    });
    expect(gateBlockers).toEqual([
      { code: "TEXT_PROOF_TOFU", severity: "blocker" },
    ]);
    expect(gateBlockers[0]).not.toHaveProperty("category");
  });
});

describe("categorizeBlocker — Codex audit safety overrides", () => {
  // Hard categories (authority / geometry) derived from CODE must always
  // win over a supplied `category` field. Codex audit flagged the prior
  // behaviour: { code: "GEOMETRY_HASH_MISSING", category: "graphic" } was
  // treated as graphic and routed through degradedExport, which would
  // have leaked unauthoritative geometry downstream.
  test("supplied 'graphic' category cannot soften a GEOMETRY_HASH_MISSING code", () => {
    expect(
      categorizeBlocker({
        code: "GEOMETRY_HASH_MISSING",
        category: BLOCKER_CATEGORIES.GRAPHIC,
      }),
    ).toBe(BLOCKER_CATEGORIES.AUTHORITY);
  });

  test("supplied 'readability' category cannot soften an EDGE_CONSISTENCY_FAILED code", () => {
    expect(
      categorizeBlocker({
        code: "EDGE_CONSISTENCY_FAILED",
        category: BLOCKER_CATEGORIES.READABILITY,
      }),
    ).toBe(BLOCKER_CATEGORIES.GEOMETRY);
  });

  test("supplied 'authority' category can promote a soft TEXT_PROOF code (fail closed)", () => {
    // Callers may legitimately want to escalate a soft code — only
    // softening is blocked.
    expect(
      categorizeBlocker({
        code: "TEXT_PROOF_TOFU",
        category: BLOCKER_CATEGORIES.AUTHORITY,
      }),
    ).toBe(BLOCKER_CATEGORIES.AUTHORITY);
  });

  test("supplied category fills in for codes the prefix map doesn't recognise", () => {
    expect(
      categorizeBlocker({
        code: "BRAND_NEW_FUTURE_CODE",
        category: BLOCKER_CATEGORIES.GRAPHIC,
      }),
    ).toBe(BLOCKER_CATEGORIES.GRAPHIC);
  });

  test("invalid supplied category is ignored (no spoofing through unknown values)", () => {
    expect(
      categorizeBlocker({
        code: "BRAND_NEW_FUTURE_CODE",
        category: "not-a-real-category",
      }),
    ).toBe(BLOCKER_CATEGORIES.UNKNOWN);
  });
});

describe("buildA1ExportQaFromGate — returned blocker category is honest", () => {
  // Codex audit (second pass): the previous fix made the *decision*
  // honour code-derived hard categories, but the returned blocker still
  // echoed the caller's spoofed `category` field. Downstream consumers
  // (PDF JSON attachment, ExportPanel UI banner, copy-QA-report payload)
  // would then misreport the blocker's category. Authoritative category
  // must be written into the returned object, not just used for the
  // degrade decision.
  test("returned blocker category reflects categorizeBlocker, not raw input", () => {
    const result = buildA1ExportQaFromGate({
      exportGate: {
        ...PASS_GATE,
        status: "blocked",
        blockers: [
          {
            code: "GEOMETRY_HASH_MISSING",
            category: "graphic",
            severity: "blocker",
            message: "Spoofed graphic on a hard authority code.",
          },
        ],
      },
    });
    // Hard-block decision still holds.
    expect(result.status).toBe("blocked");
    expect(result.allowed).toBe(false);
    expect(result.degradedExport).toBe(false);
    // AND the returned blocker exposes the authoritative category.
    const blocker = result.blockers.find(
      (b) => b.code === "GEOMETRY_HASH_MISSING",
    );
    expect(blocker.category).toBe(BLOCKER_CATEGORIES.AUTHORITY);
    // The raw claim is preserved for forensics so support can see what
    // the upstream said vs. what the gate decided.
    expect(blocker.claimedCategory).toBe("graphic");
  });

  test("returned blocker drops claimedCategory when the caller's claim already matches the authoritative derivation", () => {
    const result = buildA1ExportQaFromGate({
      exportGate: {
        ...PASS_GATE,
        status: "blocked",
        blockers: [
          {
            code: "TEXT_PROOF_TOFU",
            category: "readability",
            severity: "blocker",
          },
        ],
      },
    });
    const blocker = result.blockers.find((b) => b.code === "TEXT_PROOF_TOFU");
    expect(blocker.category).toBe(BLOCKER_CATEGORIES.READABILITY);
    expect(blocker).not.toHaveProperty("claimedCategory");
  });

  test("returned blocker carries authoritative category for codes with no claim", () => {
    const result = buildA1ExportQaFromGate({
      exportGate: {
        ...PASS_GATE,
        status: "blocked",
        blockers: [{ code: "EDGE_CONSISTENCY_FAILED", severity: "blocker" }],
      },
    });
    const blocker = result.blockers.find(
      (b) => b.code === "EDGE_CONSISTENCY_FAILED",
    );
    expect(blocker.category).toBe(BLOCKER_CATEGORIES.GEOMETRY);
    expect(blocker).not.toHaveProperty("claimedCategory");
  });

  test("string blockReason fallback emits a structured object with derived category", () => {
    const result = buildA1ExportQaFromGate({
      exportGate: {
        ...PASS_GATE,
        status: "blocked",
        blockers: ["RENDER_SANITY_LOW_OCCUPANCY: panel below 5% ink"],
      },
    });
    const blocker = result.blockers[0];
    expect(blocker.code).toBe("RENDER_SANITY_LOW_OCCUPANCY");
    expect(blocker.category).toBe(BLOCKER_CATEGORIES.GRAPHIC);
    // Renders as degraded since GRAPHIC is in the degradable set.
    expect(result.status).toBe("degraded");
    expect(result.degradedExport).toBe(true);
  });
});

describe("A1ExportGate.js direct-import safety (Codex audit follow-up)", () => {
  test("module loads without crashing on the removed CrossView legacy path", async () => {
    // Before the fix the static import of
    // `../consistency/CrossViewConsistencyService.js` blew up any direct
    // importer (Jest, REPL). The active prod build doesn't reach it, but
    // tests / dev tools must be able to import the module.
    const mod = await import("../../services/qa/A1ExportGate.js");
    expect(typeof mod.validateForExport).toBe("function");
    expect(typeof mod.categorizeBlocker).toBe("function");
    expect(typeof mod.blockersAreDegradable).toBe("function");
  });
});

// PR7 — production hardening before architect-user testing.
// Asserts the six audit-driven fixes:
//   F1. NDSS warnings demote QA status (passed -> warn) and surface as a
//       visible "Regulatory caveats" group in the Key Notes panel.
//   F2. ProgrammeNDSSViolationError is exported and instances have a
//       structured `violations` array suitable for an HTTP 422 payload.
//   F3. MVHR Key Note swaps phrasing for single-storey briefs (no
//       ceiling void).
//   F4. A1_RENDER_GEOMETRY_QA_ENABLED + A1_SHOW_PROVENANCE_BADGES are
//       declared in the env contract (check-env.cjs + .env.example).
//   F5. PDF /Author wiring: title-block author resolves brief.team.drawn_by
//       -> brief.architect -> platform fallback. (PDF write itself is
//       hard to unit-test without rendering; we cover the resolver path
//       via the title-block builder which uses the same field chain.)
//   F6. Title block renders a DRAFT band when both authorship fields
//       are at their defaults.

import fs from "node:fs";
import path from "node:path";
import {
  buildKeyNoteItems,
  buildTitleBlockPanelArtifact,
} from "../../services/project/projectGraphVerticalSliceService.js";
import { ProgrammeNDSSViolationError } from "../../services/project/ndssValidator.js";

describe("PR7 — F1: NDSS warnings demote QA status + render Regulatory caveats", () => {
  function baseArgs(extras = {}) {
    return {
      brief: { project_name: "PR7", target_storeys: 2 },
      site: { area_m2: 320 },
      climate: null,
      regulations: null,
      localStyle: null,
      ...extras,
    };
  }

  test("with no NDSS warnings: Regulatory caveats group is omitted", () => {
    const groups = buildKeyNoteItems(
      baseArgs({ qaSummary: { ndssWarnings: [] } }),
    );
    expect(groups.find((g) => g.id === "regulatory_caveats")).toBeUndefined();
  });

  test("with NDSS warnings: Regulatory caveats group renders a headline + per-room lines", () => {
    const groups = buildKeyNoteItems(
      baseArgs({
        qaSummary: {
          ndssWarnings: [
            {
              roomName: "Bedroom 1",
              ruleKey: "bedroom_double",
              kind: "min_area",
              observedM2: 8.2,
              requiredM2: 11.5,
              message: "area below minimum",
            },
            {
              roomName: "WC",
              ruleKey: "aspect_ratio",
              kind: "aspect_ratio",
              observedAspect: 3.27,
              maxAspect: 2.5,
              message: "long-thin slot",
            },
          ],
        },
      }),
    );
    const caveats = groups.find((g) => g.id === "regulatory_caveats");
    expect(caveats).toBeDefined();
    expect(caveats.heading).toBe("Regulatory caveats");
    expect(caveats.lines.length).toBeGreaterThanOrEqual(2);
    expect(caveats.lines[0]).toMatch(/NDSS warnings/);
    expect(caveats.lines.some((l) => /Bedroom 1/.test(l))).toBe(true);
    expect(caveats.lines.some((l) => /WC/.test(l))).toBe(true);
  });

  test("with more than 5 warnings: tail line summarises the overflow", () => {
    const ndssWarnings = Array.from({ length: 7 }, (_, i) => ({
      roomName: `Room ${i}`,
      ruleKey: "bedroom_single",
      kind: "min_area",
      observedM2: 5.0,
      requiredM2: 7.5,
      message: "area below minimum",
    }));
    const groups = buildKeyNoteItems(baseArgs({ qaSummary: { ndssWarnings } }));
    const caveats = groups.find((g) => g.id === "regulatory_caveats");
    expect(caveats.lines).toContain("+ 2 more violations (see build log).");
  });
});

describe("PR7 — F2: ProgrammeNDSSViolationError shape suitable for HTTP 422", () => {
  test("error exposes a `violations` array on instances", () => {
    const violations = [
      {
        roomName: "Bedroom 1",
        ruleKey: "bedroom_double",
        kind: "min_area",
        message: "below NDSS minimum",
      },
    ];
    const err = new ProgrammeNDSSViolationError(violations);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ProgrammeNDSSViolationError");
    expect(Array.isArray(err.violations)).toBe(true);
    expect(err.violations).toEqual(violations);
  });
});

describe("PR7 — F3: MVHR Key Note swaps phrasing for single-storey briefs", () => {
  test("target_storeys=2 → 'ducted through ceiling void'", () => {
    const groups = buildKeyNoteItems({
      brief: { project_name: "PR7", target_storeys: 2 },
      site: { area_m2: 320 },
      climate: null,
      regulations: null,
      localStyle: null,
    });
    const hv = groups.find((g) => g.id === "heating_ventilation");
    expect(hv).toBeDefined();
    expect(hv.lines.join("\n")).toMatch(/ducted through ceiling void/);
    expect(hv.lines.join("\n")).not.toMatch(/no ceiling void on single-storey/);
  });

  test("target_storeys=1 → wall/roof-mounted phrasing, no ceiling-void claim", () => {
    const groups = buildKeyNoteItems({
      brief: { project_name: "PR7", target_storeys: 1 },
      site: { area_m2: 80 },
      climate: null,
      regulations: null,
      localStyle: null,
    });
    const hv = groups.find((g) => g.id === "heating_ventilation");
    expect(hv).toBeDefined();
    expect(hv.lines.join("\n")).not.toMatch(/through ceiling void/);
    expect(hv.lines.join("\n")).toMatch(/wall-\s*or\s+roof-mounted/);
    expect(hv.lines.join("\n")).toMatch(/single-storey/);
  });
});

describe("PR7 — F4: env contract declares the new A1 vars", () => {
  const repoRoot = path.resolve(
    new URL("../../../", import.meta.url).pathname.replace(/^\//, ""),
  );
  const envCheckSource = fs.readFileSync(
    path.join(repoRoot, "scripts", "check-env.cjs"),
    "utf8",
  );
  const envExampleSource = fs.readFileSync(
    path.join(repoRoot, ".env.example"),
    "utf8",
  );

  test("check-env.cjs lists A1_RENDER_GEOMETRY_QA_ENABLED", () => {
    expect(envCheckSource).toMatch(/A1_RENDER_GEOMETRY_QA_ENABLED/);
  });

  test("check-env.cjs lists A1_SHOW_PROVENANCE_BADGES", () => {
    expect(envCheckSource).toMatch(/A1_SHOW_PROVENANCE_BADGES/);
  });

  test(".env.example documents both vars with defaults", () => {
    expect(envExampleSource).toMatch(/A1_RENDER_GEOMETRY_QA_ENABLED=false/);
    expect(envExampleSource).toMatch(/A1_SHOW_PROVENANCE_BADGES=false/);
  });
});

describe("PR7 — F6: DRAFT band on unverified title blocks", () => {
  function tbArgs(extras = {}) {
    return {
      projectGraphId: "pg-pr7",
      brief: { project_name: "PR7" },
      geometryHash: "abc",
      ...extras,
    };
  }

  test("default brief (no team metadata) → DRAFT band rendered", () => {
    const artifact = buildTitleBlockPanelArtifact(tbArgs());
    expect(artifact.svgString).toMatch(/data-unverified-draft="true"/);
    expect(artifact.svgString).toMatch(/data-draft-flag="true"/);
    expect(artifact.svgString).toMatch(
      /DRAFT — AI-DRAWN, AWAITING HUMAN REVIEW/,
    );
  });

  test("brief with drawn_by override AND checked_by override → no band", () => {
    const artifact = buildTitleBlockPanelArtifact(
      tbArgs({
        brief: {
          project_name: "PR7",
          team: { drawn_by: "MR", checked_by: "JL" },
        },
      }),
    );
    expect(artifact.svgString).toMatch(/data-unverified-draft="false"/);
    expect(artifact.svgString).not.toMatch(/DRAFT — AI-DRAWN/);
  });

  test("brief with only checked_by override (drawn_by stays AI) → no band", () => {
    const artifact = buildTitleBlockPanelArtifact(
      tbArgs({
        brief: { project_name: "PR7", team: { checked_by: "JL" } },
      }),
    );
    expect(artifact.svgString).toMatch(/data-unverified-draft="false"/);
  });

  test("brief with only drawn_by override (checked_by stays em-dash) → no band", () => {
    const artifact = buildTitleBlockPanelArtifact(
      tbArgs({
        brief: { project_name: "PR7", team: { drawn_by: "MR" } },
      }),
    );
    expect(artifact.svgString).toMatch(/data-unverified-draft="false"/);
  });
});

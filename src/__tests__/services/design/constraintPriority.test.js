import {
  detectConflicts,
  CONSTRAINT_PRIORITY,
} from "../../../services/design/constraintPriority.js";

describe("CONSTRAINT_PRIORITY ordering", () => {
  test("matches plan §3.2 (safety > programme > climate > local > user > portfolio)", () => {
    expect(CONSTRAINT_PRIORITY).toEqual([
      "safety",
      "programme",
      "climate",
      "local",
      "user",
      "portfolio",
    ]);
  });
});

describe("detectConflicts", () => {
  test("returns no conflicts for the happy path", () => {
    const out = detectConflicts({
      brief: {
        user_intent: {
          style_keywords: ["warm brick", "RIBA portfolio"],
          material_preferences: ["warm stock brick"],
          local_blend_strength: 0.7,
        },
      },
      site: { heritage_flags: [] },
      climate: { overheating: { risk_level: "low" } },
      programme: { template_provenance: { source: "matched_template" } },
      regulations: { rule_summary: { hard_blocker_count: 0 } },
      localStyle: { blend_weights: { local: 0.5 } },
    });
    expect(out).toEqual([]);
  });

  test("climate outranks user when overheating is medium and user requests reflective glazing", () => {
    const out = detectConflicts({
      brief: {
        user_intent: {
          style_keywords: [],
          material_preferences: ["highly reflective glazing"],
          local_blend_strength: 0.5,
        },
      },
      site: { heritage_flags: [] },
      climate: { overheating: { risk_level: "medium" } },
      programme: { template_provenance: { source: "matched_template" } },
      regulations: { rule_summary: { hard_blocker_count: 0 } },
    });
    const conflict = out.find(
      (c) => c.conflict_id === "climate-overrides-user-glazing",
    );
    expect(conflict).toBeTruthy();
    expect(conflict.higher_priority).toBe("climate");
    expect(conflict.lower_priority).toBe("user");
    expect(conflict.severity).toBe("warning");
  });

  test("local outranks user on heritage site requesting sci-fi form", () => {
    const out = detectConflicts({
      brief: {
        user_intent: {
          style_keywords: ["sci-fi futurism"],
          material_preferences: [],
          local_blend_strength: 0.5,
        },
      },
      site: { heritage_flags: [{ type: "conservation_area" }] },
      climate: { overheating: { risk_level: "low" } },
      programme: { template_provenance: { source: "matched_template" } },
      regulations: { rule_summary: { hard_blocker_count: 0 } },
    });
    const conflict = out.find(
      (c) => c.conflict_id === "local-overrides-user-context",
    );
    expect(conflict).toBeTruthy();
    expect(conflict.higher_priority).toBe("local");
  });

  test("local outranks low local_blend_strength on heritage site", () => {
    const out = detectConflicts({
      brief: {
        user_intent: {
          style_keywords: [],
          material_preferences: [],
          local_blend_strength: 0.1,
        },
      },
      site: { heritage_flags: [{ type: "listed_building" }] },
      climate: { overheating: { risk_level: "low" } },
      programme: { template_provenance: { source: "matched_template" } },
      regulations: { rule_summary: { hard_blocker_count: 0 } },
    });
    expect(
      out.find((c) => c.conflict_id === "local-overrides-low-blend-strength"),
    ).toBeTruthy();
  });

  test("safety outranks user when regulation hard_blockers fire", () => {
    const out = detectConflicts({
      brief: {
        user_intent: {
          style_keywords: [],
          material_preferences: [],
          local_blend_strength: 0.5,
        },
      },
      site: { heritage_flags: [] },
      climate: { overheating: { risk_level: "low" } },
      programme: { template_provenance: { source: "matched_template" } },
      regulations: { rule_summary: { hard_blocker_count: 1 } },
    });
    const conflict = out.find((c) => c.conflict_id === "safety-overrides-user");
    expect(conflict).toBeTruthy();
    expect(conflict.severity).toBe("error");
  });

  test("programme outranks unknown user-supplied building_type", () => {
    const out = detectConflicts({
      brief: {
        user_intent: {
          style_keywords: [],
          material_preferences: [],
          local_blend_strength: 0.5,
        },
      },
      site: { heritage_flags: [] },
      climate: { overheating: { risk_level: "low" } },
      programme: {
        template_provenance: {
          source: "fallback_template",
          requested_building_type: "warehouse",
        },
      },
      regulations: { rule_summary: { hard_blocker_count: 0 } },
    });
    expect(
      out.find((c) => c.conflict_id === "programme-overrides-unknown-type"),
    ).toBeTruthy();
  });
});

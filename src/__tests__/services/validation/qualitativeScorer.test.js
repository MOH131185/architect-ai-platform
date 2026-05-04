import {
  scoreQualitative,
  __testing__,
} from "../../../services/validation/qaScorers/qualitativeScorer.js";

const {
  RUBRIC_AXES,
  SYSTEM_PROMPT,
  buildUserPrompt,
  safeJSONParse,
  normaliseAxes,
} = __testing__;

describe("RUBRIC_AXES — fixed shape", () => {
  test("five RIBA-flavoured axes with key/label/description", () => {
    expect(RUBRIC_AXES.length).toBe(5);
    const keys = RUBRIC_AXES.map((axis) => axis.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "articulation_rhythm",
        "material_coherence_with_locale",
        "programmatic_legibility",
        "riba_stage_suitability",
        "contextual_fit",
      ]),
    );
    for (const axis of RUBRIC_AXES) {
      expect(axis.label.length).toBeGreaterThan(0);
      expect(axis.description.length).toBeGreaterThan(20);
    }
  });
});

describe("buildUserPrompt — prompt structure", () => {
  test("includes design context fields and JSON output schema", () => {
    const text = buildUserPrompt({
      briefSummary: "150 m² terraced house",
      styleProvenance: {
        packLabel: "London stucco terrace",
        descriptive_narrative: "Regency stucco terrace.",
        historical_period: "Regency",
        source: "ukVernacularPacks",
      },
      reasoningChainText: "site→climate→style chain",
      programmeSummary: "12 rooms, 2 levels",
      adjacencyScore: 92,
    });
    expect(text).toMatch(/BRIEF: 150 m² terraced house/);
    expect(text).toMatch(/STYLE PROVENANCE: London stucco terrace/);
    expect(text).toMatch(/PROGRAMME: 12 rooms/);
    expect(text).toMatch(/ADJACENCY SCORE: 92\/100/);
    expect(text).toMatch(/REASONING CHAIN: site→climate→style chain/);
    // Output schema must enumerate every rubric axis
    expect(text).toMatch(/articulation_rhythm/);
    expect(text).toMatch(/material_coherence_with_locale/);
    expect(text).toMatch(/programmatic_legibility/);
    expect(text).toMatch(/riba_stage_suitability/);
    expect(text).toMatch(/contextual_fit/);
  });
});

describe("safeJSONParse", () => {
  test("plain JSON parses", () => {
    expect(safeJSONParse('{"a":1}')).toEqual({ a: 1 });
  });

  test("fenced JSON parses", () => {
    expect(safeJSONParse('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  test("malformed input returns null", () => {
    expect(safeJSONParse("not JSON at all")).toBeNull();
  });

  test("JSON embedded in prose is recovered", () => {
    expect(safeJSONParse('Here is the verdict: {"a":2} done.')).toEqual({
      a: 2,
    });
  });
});

describe("normaliseAxes", () => {
  test("pads missing axes with score 2 default", () => {
    const axes = normaliseAxes({
      axes: [
        { key: "articulation_rhythm", score: 4, rationale: "Clear rhythm." },
      ],
    });
    expect(axes).toHaveLength(5);
    const articulation = axes.find((a) => a.key === "articulation_rhythm");
    expect(articulation.score).toBe(4);
    expect(articulation.rationale).toBe("Clear rhythm.");
    const missing = axes.find((a) => a.key === "contextual_fit");
    expect(missing.score).toBe(2);
    expect(missing.rationale).toMatch(/insufficient evidence/i);
  });

  test("clamps scores to 0–5", () => {
    const axes = normaliseAxes({
      axes: [
        { key: "articulation_rhythm", score: 9, rationale: "" },
        { key: "contextual_fit", score: -1, rationale: "" },
      ],
    });
    const a = axes.find((x) => x.key === "articulation_rhythm");
    const c = axes.find((x) => x.key === "contextual_fit");
    expect(a.score).toBe(5);
    expect(c.score).toBe(0);
  });

  test("returns null when input has no axes array", () => {
    expect(normaliseAxes({ foo: "bar" })).toBeNull();
  });
});

describe("scoreQualitative — full path", () => {
  test("returns null when no complete fn supplied", async () => {
    const result = await scoreQualitative({ context: {} });
    expect(result).toBeNull();
  });

  test("returns null when complete throws", async () => {
    const result = await scoreQualitative({
      context: {},
      complete: async () => {
        throw new Error("model unavailable");
      },
    });
    expect(result).toBeNull();
  });

  test("returns null when LLM returns malformed JSON", async () => {
    const result = await scoreQualitative({
      context: {},
      complete: async () => "this is not JSON",
    });
    expect(result).toBeNull();
  });

  test("happy path: parses axes, computes 0–100 headline score", async () => {
    const fakeResponse = JSON.stringify({
      axes: [
        { key: "articulation_rhythm", score: 4, rationale: "good" },
        { key: "material_coherence_with_locale", score: 5, rationale: "ok" },
        { key: "programmatic_legibility", score: 3, rationale: "fine" },
        { key: "riba_stage_suitability", score: 4, rationale: "stage 3" },
        { key: "contextual_fit", score: 4, rationale: "fits" },
      ],
      headline_rationale: "Solid contextual response with strong materials.",
    });
    const result = await scoreQualitative({
      context: { briefSummary: "150 m² terraced house" },
      complete: async ({ system, prompt }) => {
        // System prompt should mention RIBA / strict JSON / 0–5 axes.
        expect(system).toBe(SYSTEM_PROMPT);
        expect(prompt).toMatch(/0..5/);
        return fakeResponse;
      },
    });
    expect(result).not.toBeNull();
    // Mean of [4,5,3,4,4] = 4.0 → 80
    expect(result.score).toBe(80);
    expect(result.axes).toHaveLength(5);
    expect(result.rationale).toMatch(/Solid/);
  });

  test("happy path: model id from arg propagates to complete()", async () => {
    let captured = null;
    await scoreQualitative({
      context: {},
      model: "gpt-fake-judge",
      complete: async (args) => {
        captured = args;
        return JSON.stringify({
          axes: RUBRIC_AXES.map((a) => ({
            key: a.key,
            score: 3,
            rationale: "",
          })),
          headline_rationale: "",
        });
      },
    });
    expect(captured.model).toBe("gpt-fake-judge");
    expect(captured.maxTokens).toBe(800);
  });
});

/**
 * Qualitative QA scorer (paper §4.6).
 *
 * Asks an LLM to grade the generated A1 sheet against a fixed RIBA-flavoured
 * rubric on five axes (each 0–5):
 *   1. Articulation rhythm (facade legibility, opening proportion)
 *   2. Material coherence with locale (consistency with styleProvenance)
 *   3. Programmatic legibility (clear public/private/service zoning)
 *   4. RIBA-stage suitability (Stage 2 vs Stage 3 detail level)
 *   5. Contextual fit (responds to street, climate, neighbours)
 *
 * The scorer is best-effort: any failure (no model, parse error, network
 * timeout) returns `null` and never blocks the QA report.
 *
 * Default usage is to inject the model client. The caller (the QA wiring in
 * projectGraphVerticalSliceService) supplies a `complete` function with the
 * shape `({ system, prompt, model, maxTokens }) => Promise<string>`.
 */

const RUBRIC_AXES = Object.freeze([
  {
    key: "articulation_rhythm",
    label: "Articulation rhythm",
    description:
      "Facade legibility, opening proportion, vertical/horizontal balance, depth of reveal.",
  },
  {
    key: "material_coherence_with_locale",
    label: "Material coherence with locale",
    description:
      "Consistency between the chosen palette and the regional vernacular pack (where one is resolved); appropriateness for climate and conservation context.",
  },
  {
    key: "programmatic_legibility",
    label: "Programmatic legibility",
    description:
      "Clarity of public/private/service zoning; whether circulation reads as circulation; whether wet zones stack and whether the entrance sequence is obvious.",
  },
  {
    key: "riba_stage_suitability",
    label: "RIBA-stage suitability",
    description:
      "Whether the level of detail matches the declared RIBA stage — Stage 2 (concept) tolerates massing-level decisions; Stage 3 (developed design) needs dimensions, materials, and consistent technical drawings.",
  },
  {
    key: "contextual_fit",
    label: "Contextual fit",
    description:
      "Response to street rhythm, neighbouring buildings, climate orientation, daylight, and topographic context.",
  },
]);

const SYSTEM_PROMPT = [
  "You are a chartered architect (RIBA) evaluating a single A1 architectural sheet against a fixed rubric.",
  "Return strict JSON only — no prose before or after the JSON.",
  "Score each axis from 0 (poor) to 5 (excellent). Ground every score in the supplied design context; do not invent details that are not in the input.",
  "If a piece of evidence is missing for a given axis, score that axis 2 (insufficient evidence) and say so in the rationale.",
].join(" ");

function buildUserPrompt({
  briefSummary,
  styleProvenance,
  reasoningChainText,
  programmeSummary,
  adjacencyScore,
  quantitativeBreakdown,
}) {
  return [
    "Design context:",
    briefSummary ? `BRIEF: ${briefSummary}` : "BRIEF: (not supplied)",
    styleProvenance
      ? `STYLE PROVENANCE: ${
          styleProvenance.packLabel || "unknown"
        } — ${styleProvenance.descriptive_narrative || "n/a"} (period: ${
          styleProvenance.historical_period || "n/a"
        }; source: ${styleProvenance.source})`
      : "STYLE PROVENANCE: none",
    programmeSummary
      ? `PROGRAMME: ${programmeSummary}`
      : "PROGRAMME: (not supplied)",
    typeof adjacencyScore === "number"
      ? `ADJACENCY SCORE: ${adjacencyScore}/100 (rule-based)`
      : "ADJACENCY SCORE: n/a",
    quantitativeBreakdown
      ? `QUANTITATIVE METRICS: ${JSON.stringify(quantitativeBreakdown)}`
      : "QUANTITATIVE METRICS: n/a",
    reasoningChainText
      ? `REASONING CHAIN: ${reasoningChainText}`
      : "REASONING CHAIN: (not supplied)",
    "",
    "Score each axis 0..5 and emit JSON of the form:",
    `{
  "axes": [
    { "key": "articulation_rhythm",            "score": <number>, "rationale": "<one sentence>" },
    { "key": "material_coherence_with_locale", "score": <number>, "rationale": "<one sentence>" },
    { "key": "programmatic_legibility",        "score": <number>, "rationale": "<one sentence>" },
    { "key": "riba_stage_suitability",         "score": <number>, "rationale": "<one sentence>" },
    { "key": "contextual_fit",                 "score": <number>, "rationale": "<one sentence>" }
  ],
  "headline_rationale": "<one sentence summarising the overall judgement>"
}`,
  ].join("\n");
}

function safeJSONParse(text) {
  if (typeof text !== "string") return null;
  // Allow models that wrap JSON in fenced code blocks.
  const stripped = text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch (_) {
    // Try to recover by extracting the first {...} block
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (_inner) {
      return null;
    }
  }
}

function normaliseAxes(parsed) {
  if (!parsed || !Array.isArray(parsed.axes)) return null;
  const byKey = new Map();
  for (const axis of parsed.axes) {
    if (!axis || typeof axis !== "object") continue;
    const key = String(axis.key || axis.axis || "").trim();
    if (!key) continue;
    const score = Number(axis.score);
    if (!Number.isFinite(score)) continue;
    byKey.set(key, {
      key,
      score: Math.max(0, Math.min(5, score)),
      rationale: String(axis.rationale || "").trim(),
    });
  }
  // Ensure every rubric axis is present; default missing to score 2 with a
  // synthetic rationale so consumers always see the full rubric shape.
  const axes = RUBRIC_AXES.map((def) => {
    if (byKey.has(def.key)) {
      return { ...byKey.get(def.key), label: def.label };
    }
    return {
      key: def.key,
      label: def.label,
      score: 2,
      rationale:
        "Axis not returned by evaluator; defaulted to insufficient evidence.",
    };
  });
  return axes;
}

/**
 * Score the A1 sheet qualitatively. Returns null on any failure.
 *
 * @param {object} args
 * @param {object} args.context   Design context to feed the LLM.
 * @param {Function} args.complete  ({ system, prompt, model, maxTokens }) =>
 *                                  Promise<string>. Required.
 * @param {string} [args.model]   Model id; defaults to STEP_13_QA_MODEL env.
 * @returns {Promise<null|{
 *   score: number,
 *   axes: Array<{ key, label, score, rationale }>,
 *   rationale: string
 * }>}
 */
export async function scoreQualitative({ context = {}, complete, model } = {}) {
  if (typeof complete !== "function") return null;
  const prompt = buildUserPrompt(context);
  let raw = "";
  try {
    raw = await complete({
      system: SYSTEM_PROMPT,
      prompt,
      model: model || process.env.STEP_13_QA_MODEL || null,
      maxTokens: 800,
    });
  } catch (_) {
    return null;
  }
  const parsed = safeJSONParse(raw);
  if (!parsed) return null;
  const axes = normaliseAxes(parsed);
  if (!axes) return null;
  // Headline 0-100 score from the average of the 5 axes (each 0-5).
  const meanFive =
    axes.reduce((sum, axis) => sum + (axis.score || 0), 0) / axes.length;
  const score = Math.round(meanFive * 20);
  return {
    score,
    axes,
    rationale: String(parsed.headline_rationale || "").trim(),
  };
}

export const __testing__ = {
  RUBRIC_AXES,
  SYSTEM_PROMPT,
  buildUserPrompt,
  safeJSONParse,
  normaliseAxes,
};

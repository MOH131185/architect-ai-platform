// PR5 of the A1 defect remediation plan. Vision-QA verifier that scores a
// rendered panel PNG against the canonical ProjectGraph properties so the
// image renderer can retry-on-drift and fall back to the deterministic
// SVG when the photoreal render strays from the orthographic truth.
//
// Default behaviour is OFF. Production opts in via:
//   A1_RENDER_GEOMETRY_QA_ENABLED=true
// because adding a vision-model dependency on every render-panel call
// is the kind of change that needs an explicit production flip, not a
// silent default. When OFF, verifyRenderAgainstGeometry returns
// { ok: true, skipped: true } and the renderer behaves exactly as
// before PR5.
//
// Model resolution uses the existing STEP_09_3D model registry entry
// (modelStepResolver.MODEL_3D) so the vision QA model is the same
// reasoning model used elsewhere for 3D validation. Tests can inject
// their own verifier or stub the OpenAI fetch.

import { resolveArchitectureStepModel } from "../modelStepResolver.js";

export const RENDER_GEOMETRY_QA_PASS_THRESHOLD = 0.7;

function isVisionQAEnabled(env) {
  const value =
    (env && env.A1_RENDER_GEOMETRY_QA_ENABLED) ||
    (typeof process !== "undefined" &&
      process.env &&
      process.env.A1_RENDER_GEOMETRY_QA_ENABLED);
  return String(value || "").toLowerCase() === "true";
}

function pickEnv(env) {
  if (env && typeof env === "object") return env;
  return typeof process !== "undefined" ? process.env : {};
}

// Pull the small set of properties the verifier checks against. We
// intentionally keep this list short — vision models grade poorly on
// long checklists and the goal is to catch the egregious-drift case
// (different gable count, wrong façade material) not nitpicks.
export function deriveExpectedPropertiesFromGeometry(
  projectGeometry = {},
  panelType = null,
) {
  const levels = Array.isArray(projectGeometry?.levels)
    ? projectGeometry.levels
    : [];
  const storeyCount = levels.length || null;
  const roof = projectGeometry?.roof || {};
  const roofPrimitives = Array.isArray(projectGeometry?.roof_primitives)
    ? projectGeometry.roof_primitives
    : [];
  const gableCount = roofPrimitives.filter((p) =>
    /gable/i.test(String(p?.type || p?.kind || "")),
  ).length;
  const ridgeHeightM = Number(
    roof?.ridge_height_m ||
      roof?.ridgeHeightM ||
      projectGeometry?.ridge_height_m ||
      0,
  );
  const openings = Array.isArray(projectGeometry?.openings)
    ? projectGeometry.openings
    : [];
  const windowCount = openings.filter(
    (o) => String(o?.kind || "").toLowerCase() === "window",
  ).length;
  const exteriorDoorCount = openings.filter(
    (o) =>
      String(o?.kind || "").toLowerCase() === "door" && o?.exterior === true,
  ).length;
  const materials = Array.isArray(projectGeometry?.materials)
    ? projectGeometry.materials
    : [];
  const primaryFacade = materials.find((m) =>
    /primary|facade|exterior\s*wall/i.test(
      String(m?.application || m?.role || ""),
    ),
  );
  const entryOrientation =
    projectGeometry?.site?.main_entry?.orientation ||
    projectGeometry?.main_entry?.orientation ||
    null;
  return {
    panelType: panelType || null,
    storey_count: storeyCount,
    gable_count: gableCount || null,
    primary_facade_material: primaryFacade?.name || null,
    ridge_height_m: ridgeHeightM > 0 ? Number(ridgeHeightM.toFixed(2)) : null,
    window_count_approx: windowCount || null,
    exterior_door_count_approx: exteriorDoorCount || null,
    entry_orientation: entryOrientation,
  };
}

function buildPrompt(expected) {
  const expectedJson = JSON.stringify(expected, null, 2);
  return [
    "You are an architectural vision QA. Compare the attached photoreal render of a building",
    "against the EXPECTED properties below (derived from the canonical ProjectGraph geometry).",
    "Score how well the render matches the expected properties on a scale of 0.0 to 1.0,",
    "where 1.0 is perfect match and 0.0 is clearly a different building. Return STRICT JSON only.",
    "",
    "EXPECTED:",
    expectedJson,
    "",
    "Respond with JSON of shape:",
    '{ "score": 0.0-1.0, "mismatches": ["short description", ...] }',
    "Only list mismatches you are CONFIDENT about; do not invent issues.",
    "If a field is null in EXPECTED, do not score it.",
  ].join("\n");
}

function parseQAResponse(rawText) {
  if (!rawText) return null;
  const trimmed = String(rawText).trim();
  // Try direct JSON parse first; fall back to regex-extracting the first
  // JSON object substring in case the model wraps it in code fencing.
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (_inner) {
      return null;
    }
  }
}

function normaliseQAResult(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return { score: 0, mismatches: ["unparseable QA response"] };
  }
  const scoreRaw = Number(parsed.score);
  const score = Number.isFinite(scoreRaw)
    ? Math.max(0, Math.min(1, scoreRaw))
    : 0;
  const mismatches = Array.isArray(parsed.mismatches)
    ? parsed.mismatches
        .map((m) => String(m || "").trim())
        .filter((m) => m.length > 0)
        .slice(0, 8)
    : [];
  return { score, mismatches };
}

// Default vision call: POST the render PNG (as base64 in a chat completion
// with a user image input) to OpenAI and parse the JSON reply. Tests inject
// their own verifier via the {verifier} option in
// projectGraphImageRenderer; production paths use this default.
async function callOpenAIVisionQA({ pngBytes, expected, modelId, env }) {
  const apiKey =
    env.OPENAI_REASONING_API_KEY ||
    env.OPENAI_API_KEY ||
    env.OPENAI_IMAGES_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      score: null,
      mismatches: [],
      skipped: true,
      reason: "missing_api_key",
    };
  }
  const prompt = buildPrompt(expected);
  const base64 = Buffer.isBuffer(pngBytes)
    ? pngBytes.toString("base64")
    : Buffer.from(pngBytes).toString("base64");
  const body = {
    model: modelId,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${base64}` },
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 400,
  };
  try {
    const response = await global.fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) {
      return {
        ok: false,
        score: null,
        mismatches: [],
        skipped: true,
        reason: `qa_http_${response.status}`,
      };
    }
    const data = await response.json().catch(() => ({}));
    const rawText = data?.choices?.[0]?.message?.content || "";
    const parsed = parseQAResponse(rawText);
    const { score, mismatches } = normaliseQAResult(parsed);
    return {
      ok: score >= RENDER_GEOMETRY_QA_PASS_THRESHOLD,
      score,
      mismatches,
      skipped: false,
      reason: null,
    };
  } catch (error) {
    return {
      ok: false,
      score: null,
      mismatches: [],
      skipped: true,
      reason: `qa_exception_${error?.name || "unknown"}`,
    };
  }
}

// Public verifier. When the env gate is off (default), returns a "skipped"
// pass so the renderer never gates on QA in environments that haven't
// explicitly opted in. When the gate is on, calls the vision model
// (or an injected verifier) and returns its verdict.
export async function verifyRenderAgainstGeometry({
  pngBytes,
  projectGeometry = null,
  panelType = null,
  modelId = null,
  env = null,
  verifier = null,
} = {}) {
  const resolvedEnv = pickEnv(env);
  if (!isVisionQAEnabled(resolvedEnv)) {
    return {
      ok: true,
      score: null,
      mismatches: [],
      skipped: true,
      reason: "qa_gate_disabled",
    };
  }
  if (!pngBytes) {
    return {
      ok: false,
      score: null,
      mismatches: ["missing render bytes"],
      skipped: true,
      reason: "missing_png_bytes",
    };
  }
  const expected = deriveExpectedPropertiesFromGeometry(
    projectGeometry || {},
    panelType,
  );
  const resolvedModelId =
    modelId ||
    (() => {
      try {
        const resolved = resolveArchitectureStepModel("MODEL_3D", {
          env: resolvedEnv,
        });
        return resolved?.model || null;
      } catch (_) {
        return null;
      }
    })();
  if (typeof verifier === "function") {
    const injected = await verifier({
      pngBytes,
      expected,
      modelId: resolvedModelId,
      env: resolvedEnv,
    });
    return normaliseInjectedResult(injected);
  }
  if (!resolvedModelId) {
    return {
      ok: false,
      score: null,
      mismatches: [],
      skipped: true,
      reason: "missing_qa_model",
    };
  }
  return callOpenAIVisionQA({
    pngBytes,
    expected,
    modelId: resolvedModelId,
    env: resolvedEnv,
  });
}

function normaliseInjectedResult(result) {
  if (!result || typeof result !== "object") {
    return {
      ok: false,
      score: 0,
      mismatches: ["injected verifier returned no result"],
      skipped: false,
      reason: "verifier_no_result",
    };
  }
  const score =
    typeof result.score === "number"
      ? Math.max(0, Math.min(1, result.score))
      : null;
  const mismatches = Array.isArray(result.mismatches)
    ? result.mismatches.map((m) => String(m || "")).filter(Boolean)
    : [];
  const ok =
    typeof result.ok === "boolean"
      ? result.ok
      : score !== null && score >= RENDER_GEOMETRY_QA_PASS_THRESHOLD;
  return {
    ok,
    score,
    mismatches,
    skipped: result.skipped === true,
    reason: result.reason || null,
  };
}

// Helper for the retry-on-drift loop: amend the original prompt with an
// "AVOID:" tail listing the verifier's reported mismatches plus the
// correct expected property summary.
export function amendPromptForRetry(
  originalPrompt,
  mismatches = [],
  expected = null,
) {
  const cleanedMismatches = Array.isArray(mismatches)
    ? mismatches
        .map((m) => String(m || "").trim())
        .filter((m) => m.length > 0)
        .slice(0, 4)
    : [];
  if (cleanedMismatches.length === 0) return originalPrompt;
  const avoidLine = `AVOID: ${cleanedMismatches.join("; ")}.`;
  const lockLine = expected
    ? `The building MUST match: storey_count=${expected.storey_count ?? "n/a"}, gable_count=${expected.gable_count ?? "n/a"}, primary_facade_material=${expected.primary_facade_material ?? "n/a"}, entry_orientation=${expected.entry_orientation ?? "n/a"}.`
    : null;
  const tail = [avoidLine, lockLine].filter(Boolean).join(" ");
  return `${originalPrompt}\n\n${tail}`;
}

/**
 * Render Provider Registry — CL-1 of the ControlNet/Redux render-stack plan.
 *
 * Provider-neutral seam for the ProjectGraph rendered-panel pipeline. The
 * registry exposes a small contract so the renderer can dispatch to mock /
 * openai / replicate adapters without leaking provider-specific code into
 * `projectGraphImageRenderer.js`.
 *
 * Invariants (hard):
 *   - ProjectGraph / compiledProject remains the only geometry authority.
 *     Providers receive a rasterised deterministic-geometry reference image;
 *     they never invent geometry.
 *   - Deterministic technical drawings (plans / elevations / sections) and
 *     engineering exports (DXF, IFC, JSON, XLSX) MUST NOT call into any
 *     provider here. Enforced by `drawingConsistencyChecks.js` blockers.
 *   - `geometryHash` is the cross-artifact identity key. Future
 *     `controlSvgHash`, `footprintMaskHash`, `depthHash`, `lineartHash` (CL-2)
 *     and `reduxReferenceSetHash` (CL-3) flow through the contract below but
 *     never enter `geometryHash`.
 *
 * Resolution rules (`selectProvider`):
 *   1. If `PROJECT_GRAPH_RENDER_PROVIDER` is set to a known name, use it.
 *   2. Else if `PROJECT_GRAPH_IMAGE_GEN_ENABLED=true` (legacy implicit), use
 *      `openai`. This preserves byte-identical production behaviour for runs
 *      that were already opted-in before CL-1.
 *   3. Otherwise return `{ provider: null, reason: "gate_disabled" }` so the
 *      renderer takes the existing deterministic-fallback path.
 *
 * Provider contract (each provider exports a frozen object):
 *   - `name: "openai" | "mock" | "replicate"`
 *   - `getConfig(env): object`                      — diagnostics snapshot
 *   - `validateAvailable(env): { available, fallbackReason?, sourceGaps? }`
 *   - `render(request): Promise<ProviderRenderResult>` — throws on call
 *     failure with `.fallbackReason` set; never returns synthetic success.
 *
 * @module services/render/providers/renderProviderRegistry
 */

import openaiEnv from "../../openaiProviderEnv.cjs";
import openaiImageEditProvider from "./openaiImageEditProvider.js";
import mockProjectGraphRenderProvider from "./mockProjectGraphRenderProvider.js";
import replicateFluxRenderProvider from "./replicateFluxRenderProvider.js";

export const RENDER_PROVIDER_ENV_VAR = "PROJECT_GRAPH_RENDER_PROVIDER";
export const RENDER_PROVIDER_REGISTRY_VERSION = "render-provider-registry-v1";

const PROVIDERS = Object.freeze({
  openai: openaiImageEditProvider,
  mock: mockProjectGraphRenderProvider,
  replicate: replicateFluxRenderProvider,
});

export const KNOWN_PROVIDER_NAMES = Object.freeze(Object.keys(PROVIDERS));

/**
 * @typedef {object} ProjectGraphRenderRequest
 * @property {"hero_3d"|"exterior_render"|"axonometric"|"interior_3d"} panelType
 * @property {Buffer} referencePng                Rasterised deterministic SVG (geometry-locked).
 * @property {string} prompt                      Climate + style + programme aware prompt.
 * @property {string} deterministicSvg            Source SVG, for providers that need it raw.
 * @property {string} geometryHash                Cross-artifact identity (never derived from images).
 * @property {string} [controlSvgHash]            CL-2 — sha of compiled control SVG.
 * @property {string} [footprintMaskHash]         CL-2 — sha of binary footprint mask PNG.
 * @property {string} [depthHash]                 CL-2 — sha of ProjectGraph-derived depth PNG.
 * @property {string} [lineartHash]               CL-2 — sha of compiled lineart/canny PNG.
 * @property {string} [reduxReferenceSetHash]     CL-3 — sha of portfolio reference bundle.
 * @property {object} [providerOptions]           Provider-specific opaque options.
 * @property {object} env                         Resolved env snapshot (defaults to process.env).
 */

/**
 * @typedef {object} ProviderRenderResult
 * @property {Buffer} pngBuffer
 * @property {string} model
 * @property {string} [size]
 * @property {string} [revisedPrompt]
 * @property {string} [requestId]
 * @property {object} [usage]
 * @property {object} providerMetadata          Provider-specific provenance fields.
 * @property {string[]} [sourceGaps]            Structured reasons for partial fulfilment.
 */

function normaliseName(name) {
  return typeof name === "string" ? name.trim().toLowerCase() : "";
}

/**
 * Resolve the active render provider per the rules above.
 *
 * @param {{ env?: object, overrideName?: string }} [options]
 * @returns {{
 *   provider: object|null,
 *   resolvedName: string|null,
 *   reason: "explicit"|"legacy_implicit"|"gate_disabled"|"unknown_provider",
 *   explicitRequest: string|null,
 * }}
 */
export function selectProvider({
  env = process.env,
  overrideName = null,
} = {}) {
  const explicitRaw =
    overrideName ?? openaiEnv.readEnv(env, RENDER_PROVIDER_ENV_VAR);
  const explicit = normaliseName(explicitRaw);

  if (explicit) {
    const provider = PROVIDERS[explicit];
    if (!provider) {
      return {
        provider: null,
        resolvedName: explicit,
        reason: "unknown_provider",
        explicitRequest: explicit,
      };
    }
    return {
      provider,
      resolvedName: provider.name,
      reason: "explicit",
      explicitRequest: explicit,
    };
  }

  if (
    openaiEnv.isTruthy(
      openaiEnv.readEnv(env, "PROJECT_GRAPH_IMAGE_GEN_ENABLED"),
    )
  ) {
    return {
      provider: PROVIDERS.openai,
      resolvedName: "openai",
      reason: "legacy_implicit",
      explicitRequest: null,
    };
  }

  return {
    provider: null,
    resolvedName: null,
    reason: "gate_disabled",
    explicitRequest: null,
  };
}

/**
 * Lookup a provider by name. Returns null when unknown.
 * @param {string} name
 */
export function getProviderByName(name) {
  return PROVIDERS[normaliseName(name)] || null;
}

/**
 * Provider availability snapshot for diagnostics endpoints (not used in CL-1
 * production code, but useful for CL-6 UI / status routes).
 * @param {object} [env]
 */
export function describeProviderRegistry(env = process.env) {
  const selection = selectProvider({ env });
  return {
    registryVersion: RENDER_PROVIDER_REGISTRY_VERSION,
    known: KNOWN_PROVIDER_NAMES,
    explicit: openaiEnv.readEnv(env, RENDER_PROVIDER_ENV_VAR) || null,
    selectedProvider: selection.resolvedName,
    selectionReason: selection.reason,
    providers: KNOWN_PROVIDER_NAMES.reduce((acc, name) => {
      acc[name] = PROVIDERS[name].getConfig
        ? PROVIDERS[name].getConfig(env)
        : { configured: false };
      return acc;
    }, {}),
  };
}

export default {
  selectProvider,
  getProviderByName,
  describeProviderRegistry,
  RENDER_PROVIDER_ENV_VAR,
  RENDER_PROVIDER_REGISTRY_VERSION,
  KNOWN_PROVIDER_NAMES,
};

# Structured Style Pack — Implementation Plan

> **Deliverable location:** This document's full content is what will be written to `docs/style-pack/PLAN.md` once the user approves. Plan-mode constraints prevent me from creating that file yet; the body below IS the planned file content verbatim.

## Context

Architects upload portfolio PDFs/images to bias the design pipeline. Today the influence is implicit: `localStylePack.js` allocates a fixed ~15 % `portfolio` weight to a text-keyword-derived "evidence" object, and STEP 06 (massing) plus STEP 11 (materials) read no structured pack at all. As a result, two RIBA-grade portfolios that look identical (e.g. "Victorian terrace with shopfront base") can yield wildly different geometries because nothing parametrically constrains floor count, aspect ratio, opening rhythm, or material families.

This plan introduces a **locked, schema-validated Style Pack** extracted **deterministically** from uploaded portfolio files. STEP 06 and STEP 11 consume the pack as **parametric constraints** so portfolio identity is reproducible. The pack is consumed **upstream** of STEP 07 so it folds into `geometryHash` indirectly via geometry parameter changes — it is not added to the hash payload itself (which must remain pure geometry).

Determinism contract:

- same brief + same portfolio bytes → same Style Pack → same `geometryHash`
- same brief + no portfolio → existing `geometryHash` unchanged (regression-pinned)
- same brief + pack vs no pack → different `geometryHash` (the pack must actually shift geometry)

## Verified codebase facts (load-bearing for this plan)

| Claim                                                                           | Verified at                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portfolio file processing is client-side                                        | `src/utils/portfolioFileProcessing.js:100-130` (not `services/`)                                                                                                                                                                |
| "Portfolio ~15 %" weighting                                                     | `src/services/style/localStylePack.js:21` (`PLAN_WEIGHTS.portfolio = 0.15`); dynamic `0.05 + 0.2 * innovation` at line 72                                                                                                       |
| STEP 06 + STEP 11 env keys present                                              | `src/services/modelStepResolver.js:61-116`; `.env.example` lines 333, 406                                                                                                                                                       |
| Massing/programme orchestrator                                                  | `buildProgramme()` at `src/services/project/projectGraphVerticalSliceService.js:4267`, called at line 14745                                                                                                                     |
| **STEP 07 in the active slice is deterministic JS, not LLM**                    | `buildProjectGeometryFromProgramme` at `projectGraphVerticalSliceService.js:5540` — randomness is `seededRotation(brief.generation_seed, …)`. `STEP_07_PROJECT_GRAPH_MODEL` is dormant capacity. Determinism is currently safe. |
| `geometryHash` payload is PURE geometry                                         | `buildGeometryHashPayload()` at `src/services/compiler/compiledProjectCompiler.js:1241-1348`; hash applied at line 1573                                                                                                         |
| `metadata.style_dna` is threaded into `geometrySeed.metadata` but NOT into hash | `compileProject()` line 1357 (`geometrySeed.metadata = deepMerge(..., { style_dna })`) vs hash payload above which omits `metadata`                                                                                             |
| `layout_archetype` is the strongest existing style→footprint lever              | declared `localStylePack.js:421`; consumed at `projectGraphVerticalSliceService.js:5561`                                                                                                                                        |
| Floor-to-floor height is currently a hardcoded literal                          | `projectGraphVerticalSliceService.js:5640-5641` (`levelIndex * 3.2`)                                                                                                                                                            |
| optionScorer climate weight can overrule a style match                          | `src/services/design/optionScorer.js:11` (`CATEGORY_WEIGHTS`), archetype bonus `+0.04` at line 118                                                                                                                              |
| Schemas directory exists                                                        | `src/schemas/` (currently holds `spatialGraph.js`)                                                                                                                                                                              |
| `docs/style-pack/` directory                                                    | does not exist                                                                                                                                                                                                                  |

---

## 1. Files to create

| Path                                                                    | Purpose                                                                                                                                                                          | Exported symbols                                                                                                                                                             |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/schemas/stylePack.schema.json`                                     | Locked JSON Schema for the Style Pack (draft-07). Single source of truth for shape, types, ranges.                                                                               | (JSON, no exports)                                                                                                                                                           |
| `src/schemas/stylePack.js`                                              | Thin JS sibling that imports the JSON and exports `STYLE_PACK_SCHEMA`, `STYLE_PACK_VERSION`, `validateStylePack(pack)`, `EMPTY_STYLE_PACK`. Used by extractor + applier + tests. | `STYLE_PACK_SCHEMA`, `STYLE_PACK_VERSION`, `validateStylePack`, `EMPTY_STYLE_PACK`                                                                                           |
| `src/services/style/stylePackExtractor.js`                              | Pure, deterministic extractor: N processed portfolio records → one Style Pack JSON. Heuristic-only in v1 (no LLM).                                                               | `extractStylePack({ portfolioFiles, briefHints, extractorVersion })`, `computeStylePackHash(pack)`                                                                           |
| `src/services/style/stylePackConstraintApplier.js`                      | Applies Style Pack to brief / programme inputs (STEP 06) and to material palette inputs (STEP 11). No-op when pack is null.                                                      | `applyStylePackToBrief({ brief, stylePack })`, `applyStylePackToMaterialPaletteInputs({ inputs, stylePack })`, `applyStylePackToOptionScorerWeights({ weights, stylePack })` |
| `api/style-pack/extract.js`                                             | Vercel Function (Node, Fluid Compute). Accepts already-processed portfolio records (no raw uploads) + brief hints; returns Style Pack + provenance. Calls `extractStylePack`.    | default async handler                                                                                                                                                        |
| `src/__tests__/services/styleExtractor.test.js`                         | Jest tests for deterministic extraction.                                                                                                                                         | —                                                                                                                                                                            |
| `src/__tests__/services/styleConstraintApplier.test.js`                 | Jest tests for STEP 06 / STEP 11 constraint application.                                                                                                                         | —                                                                                                                                                                            |
| `src/__tests__/fixtures/stylePack/portfolio-textPDF.json`               | Pre-processed portfolio record fixture (PDF text bucketed) used by both tests; deterministic input.                                                                              | —                                                                                                                                                                            |
| `src/__tests__/fixtures/stylePack/expected-pack-portfolio-textPDF.json` | Expected pack output. Regenerated only via a documented script when extractor version bumps.                                                                                     | —                                                                                                                                                                            |
| `docs/style-pack/PLAN.md`                                               | This plan (final deliverable).                                                                                                                                                   | —                                                                                                                                                                            |
| `docs/style-pack/SCHEMA.md`                                             | Human-readable schema walkthrough (field meanings, ranges, examples).                                                                                                            | —                                                                                                                                                                            |

---

## 2. Files to modify

### 2a. `src/services/style/localStylePack.js`

**Why:** STEP 11 (materials) integration. `buildLocalStylePackV2` must accept an optional `stylePack`, thread `stylePack.materialFamilies` into the palette computation, and pin it in `style_provenance`.

```diff
-export function buildLocalStylePackV2({
-  brief, site, climate, jurisdictionPack = null,
-  createStableId, paletteSize = 6,
-} = {}) {
-  const blend = computeMaterialPalette({ brief, site, climate, jurisdictionPack, paletteSize });
+export function buildLocalStylePackV2({
+  brief, site, climate, jurisdictionPack = null,
+  stylePack = null,                              // NEW
+  createStableId, paletteSize = 6,
+} = {}) {
+  const blend = computeMaterialPalette({
+    brief, site, climate, jurisdictionPack, paletteSize,
+    stylePackMaterialFamilies: stylePack?.materialFamilies || null,   // NEW
+  });
   ...
   return {
     style_pack_id: ...,
+    portfolio_style_pack: stylePack || null,     // NEW (full pack snapshot for downstream provenance)
+    portfolio_style_pack_hash: stylePack ? computeStylePackHash(stylePack) : null,  // NEW (audit-only, NOT hashed into geometry)
     material_palette: blend.palette,
     ...
   };
 }
```

`computeMaterialPalette` gets `stylePackMaterialFamilies`: when non-null, the palette is **prefiltered** to entries whose material tokens intersect `primary ∪ secondary ∪ accents`, then re-ranked with weights `primary > secondary > accents > local`. When null, function returns today's output **byte-identical** (snapshot-pinned).

### 2b. `src/services/project/projectGraphVerticalSliceService.js`

**Why:** Orchestrate extraction and apply constraints **before** `buildProgramme` and **before** the deterministic geometry builder. Plumb the pack into `buildLocalStylePack`. Parameterize the floor-to-floor literal.

```diff
+import { extractStylePack, computeStylePackHash } from "../style/stylePackExtractor.js";
+import {
+  applyStylePackToBrief,
+  applyStylePackToOptionScorerWeights,
+} from "../style/stylePackConstraintApplier.js";

 // ...inside buildArchitectureProjectVerticalSlice, after brief normalization,
 //    before buildProgramme(...) at line ~14745:

+  const stylePack = process.env.STYLE_PACK_ENABLED !== "false"
+    ? extractStylePack({
+        portfolioFiles: input.portfolioFiles || [],
+        briefHints: { buildingType: brief.building_type, climate, jurisdictionPack },
+        extractorVersion: STYLE_PACK_VERSION,
+      })
+    : null;
+  const constrainedBrief = applyStylePackToBrief({ brief, stylePack });

-  const draftProgramme = buildProgramme({ brief, programSpaces });
+  const draftProgramme = buildProgramme({ brief: constrainedBrief, programSpaces });

   // ...where buildLocalStylePack is called (line ~14739):
-  const localStyle = buildLocalStylePack(brief, site, climate, jurisdictionPack);
+  const localStyle = buildLocalStylePack(
+    constrainedBrief, site, climate, jurisdictionPack, { stylePack }
+  );

   // ...in buildProjectGeometryFromProgramme (line ~5640), replace the literal:
-  elevation_m: levelIndex * 3.2,
+  elevation_m: levelIndex * (stylePack?.facadeModule?.floorHeightMm
+    ? stylePack.facadeModule.floorHeightMm / 1000
+    : 3.2),
```

Additional wiring (each is a small, surgical edit; full diffs in implementation phase):

- `roofPitchDistribution.dominant` → biases `roof.slope_deg` selection (currently `community ? 8 : 35` at line ~5690).
- `openingRhythm.{moduleMm, sillHeightMm, repetition}` → seeds `compileOpenings` defaults.
- `windowToWallRatio.{overall, byElevation}` → constrains opening total area per facade in the seed (clamp-to-pack after the existing climate/regs clamp).
- `massingTendency.aspectRatioRange` → clamps the bounding-box ratio in the massing seed before option generation.
- `massingTendency.floorCount.{min, mode, max}` → consumed by `applyStylePackToBrief` to clamp/bias `brief.target_storeys`.

### 2c. `src/services/design/optionGenerator.js`

**Why:** When the pack pins `massingTendency.form` and `layout_archetype`, generated candidates must include pack-aligned options. Currently archetype prepending uses `localStyle.style_provenance.layout_archetype`. Extend it to also read `stylePack.massingTendency.form` and `stylePack.layout_archetype`.

```diff
-  const archetype = localStyle?.style_provenance?.layout_archetype || null;
+  const archetype =
+    stylePack?.layout_archetype ||
+    localStyle?.style_provenance?.layout_archetype ||
+    null;
+  const massingForm = stylePack?.massingTendency?.form || null;
```

### 2d. `src/services/design/optionScorer.js`

**Why:** Plan agent flagged that the existing `+0.04` archetype bonus is too small — climate (0.20) can overrule a clear style intent. When a Style Pack is present, add a `styleAlignment` subscore so the pack carries first-class weight.

```diff
 const CATEGORY_WEIGHTS = {
   programmeFit: 0.25,
   climateFit: 0.20,
-  costFit: 0.15,
+  costFit: 0.15,
+  styleAlignment: 0.0,   // dormant unless Style Pack is active
   ...
 };

+export function scaleWeightsForStylePack(weights, stylePack) {
+  if (!stylePack) return weights;
+  // Reallocate 0.10 from climateFit and 0.05 from costFit into styleAlignment.
+  return { ...weights, climateFit: weights.climateFit - 0.10,
+           costFit: weights.costFit - 0.05, styleAlignment: 0.15 };
+}
```

`styleAlignment` score per candidate: fraction of `{archetype, form, aspectRatio∈range, roofPitch∈dominant bucket, floorCount∈[min,max]}` that match the pack. Pure function of geometry + pack — deterministic.

### 2e. `src/services/compiler/compiledProjectCompiler.js`

**Why:** Audit trail only. Carry `portfolio_style_pack_hash` on `compiledProject.metadata` so reviewers can trace a build back to its pack — **without** adding it to `buildGeometryHashPayload`.

```diff
   geometrySeed.metadata = deepMerge(geometrySeed.metadata || {}, {
     style_dna: styleDNA,
+    portfolio_style_pack_hash: styleDNA?.portfolio_style_pack_hash || null,
   });
   // buildGeometryHashPayload intentionally NOT modified — hash stays geometry-only.
```

A regression test (see §10) pins the no-pack reference hash so any accidental leak of `style_dna` into the hash payload trips immediately.

### 2f. `src/services/modelStepResolver.js`

**Why:** Add an entry for the style extractor model **only if** we later need LLM assist. For v1 (heuristic-only) no change is required. Skeleton entry pre-wired for future toggle:

```diff
+  STEP_05_STYLE_EXTRACT: {
+    envPrefix: "STEP_05_STYLE_EXTRACT",
+    baseKeys: ["STEP_05_STYLE_EXTRACT_MODEL", "OPENAI_REASONING_MODEL"],
+    fineTunedKey: "STEP_05_STYLE_EXTRACT_FT_MODEL",
+    provider: "openai",
+  },
```

(Dead code path until `STYLE_PACK_LLM_FALLBACK=true`. Plan agent recommendation: ship v1 with this commented out to avoid premature surface.)

### 2g. `src/hooks/useArchitectAIWorkflow.js`

**Why:** Pass-through. The hook already forwards `portfolioFiles` to the vertical-slice API; no UI change needed. Add `verticalSlice.style_pack` to the returned shape so the UI can display the pack (read-only) for transparency.

### 2h. `.env.example`

Add a clearly-grouped block (placement: after STEP_05_PROGRAMME):

```
# --- Portfolio Style Pack (parametric portfolio constraints, STEP 06 + STEP 11)
STYLE_PACK_ENABLED=true
# Optional: deterministic seed override; default = sha256(portfolio bytes)
STYLE_PACK_SEED=
# Future LLM-assisted extraction (v2). Keep false in v1.
STYLE_PACK_LLM_FALLBACK=false
# STEP_05_STYLE_EXTRACT_MODEL=          # uncomment when v2 lands
```

### 2i. `scripts/check-env.cjs`

**Why:** Add `STYLE_PACK_ENABLED` to the **optional flag** block (warnings only). **Do NOT** add it to the strict `REQUIRED` list — that would hard-fail every existing deployment that hasn't set it.

```diff
   // in the optional flag list (around the A1_RENDER_GEOMETRY_QA_ENABLED block):
+  { name: "STYLE_PACK_ENABLED", description: "Enables Style Pack extraction + STEP 06/11 constraints",
+    expected: "true|false", optional: true },
```

### 2j. `src/__tests__/services/projectGraphVerticalSliceService.test.js`

Extend (do not rewrite) with three new test cases — see §10.

### 2k. `src/__tests__/services/localStylePack.test.js`

Extend with stylePack-constrained palette tests — see §10.

---

## 3. Style Pack JSON schema (locked)

Schema lives at `src/schemas/stylePack.schema.json`. `STYLE_PACK_VERSION = "1.0.0"`. Bumping any field type/range bumps the major.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://architect-ai-platform/schemas/stylePack/1.0.0",
  "title": "StylePack",
  "type": "object",
  "required": [
    "version",
    "windowToWallRatio",
    "roofPitchDistribution",
    "openingRhythm",
    "materialFamilies",
    "massingTendency",
    "facadeModule",
    "layout_archetype",
    "provenance"
  ],
  "additionalProperties": false,
  "properties": {
    "version": { "const": "1.0.0" },
    "windowToWallRatio": {
      "type": "object",
      "required": ["overall", "byElevation"],
      "properties": {
        "overall": { "type": "number", "minimum": 0, "maximum": 0.95 },
        "byElevation": {
          "type": "object",
          "required": ["N", "S", "E", "W"],
          "properties": {
            "N": { "type": "number", "minimum": 0, "maximum": 0.95 },
            "S": { "type": "number", "minimum": 0, "maximum": 0.95 },
            "E": { "type": "number", "minimum": 0, "maximum": 0.95 },
            "W": { "type": "number", "minimum": 0, "maximum": 0.95 }
          }
        }
      }
    },
    "roofPitchDistribution": {
      "type": "object",
      "required": ["flatPct", "lowPct", "mediumPct", "steepPct", "dominant"],
      "properties": {
        "flatPct": { "type": "number", "minimum": 0, "maximum": 1 },
        "lowPct": { "type": "number", "minimum": 0, "maximum": 1 },
        "mediumPct": { "type": "number", "minimum": 0, "maximum": 1 },
        "steepPct": { "type": "number", "minimum": 0, "maximum": 1 },
        "dominant": { "enum": ["flat", "low", "medium", "steep"] }
      }
    },
    "openingRhythm": {
      "type": "object",
      "required": ["moduleMm", "repetition", "sillHeightMm"],
      "properties": {
        "moduleMm": { "type": "integer", "minimum": 600, "maximum": 6000 },
        "repetition": { "enum": ["regular", "asymmetric", "paired"] },
        "sillHeightMm": { "type": "integer", "minimum": 0, "maximum": 2200 }
      }
    },
    "materialFamilies": {
      "type": "object",
      "required": ["primary", "secondary", "accents"],
      "properties": {
        "primary": {
          "type": "array",
          "items": { "type": "string" },
          "minItems": 1,
          "maxItems": 4
        },
        "secondary": {
          "type": "array",
          "items": { "type": "string" },
          "maxItems": 6
        },
        "accents": {
          "type": "array",
          "items": { "type": "string" },
          "maxItems": 6
        }
      }
    },
    "massingTendency": {
      "type": "object",
      "required": ["form", "floorCount", "aspectRatioRange"],
      "properties": {
        "form": { "enum": ["compact", "L", "U", "courtyard", "articulated"] },
        "floorCount": {
          "type": "object",
          "required": ["min", "mode", "max"],
          "properties": {
            "min": { "type": "integer", "minimum": 1, "maximum": 12 },
            "mode": { "type": "integer", "minimum": 1, "maximum": 12 },
            "max": { "type": "integer", "minimum": 1, "maximum": 12 }
          }
        },
        "aspectRatioRange": {
          "type": "array",
          "items": { "type": "number", "minimum": 0.2, "maximum": 6 },
          "minItems": 2,
          "maxItems": 2
        }
      }
    },
    "facadeModule": {
      "type": "object",
      "required": ["baySpacingMm", "floorHeightMm"],
      "properties": {
        "baySpacingMm": { "type": "integer", "minimum": 1200, "maximum": 9000 },
        "floorHeightMm": { "type": "integer", "minimum": 2400, "maximum": 4500 }
      }
    },
    "layout_archetype": {
      "type": ["string", "null"],
      "description": "Optional alignment with the existing localStyle archetype vocabulary (e.g. terrace, bar, courtyard, pavilion). Null when portfolio is ambiguous."
    },
    "provenance": {
      "type": "object",
      "required": [
        "sourceFiles",
        "extractedAt",
        "extractorVersion",
        "confidence",
        "seed"
      ],
      "properties": {
        "sourceFiles": { "type": "array", "items": { "type": "string" } },
        "extractedAt": { "type": "string", "format": "date-time" },
        "extractorVersion": { "type": "string" },
        "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
        "seed": { "type": "string", "pattern": "^[a-f0-9]{64}$" },
        "evidence": {
          "type": "object",
          "additionalProperties": true,
          "description": "Per-field evidence breadcrumbs (which file / which keyword bucket drove which decision)."
        }
      }
    }
  }
}
```

Extensions beyond the minimum: `version`, `layout_archetype` (Plan-agent flag: strongest existing style→footprint lever), `provenance.seed`, `provenance.evidence`, `roofPitchDistribution.{flat,low,medium,steep}Pct` (full distribution, not just dominant) so the LLM-assist path in v2 has somewhere to put it without schema churn.

---

## 4. Extractor design

**Location:** `src/services/style/stylePackExtractor.js`. Pure function. No side effects, no network, no filesystem.

**Inputs:**

- `portfolioFiles`: array of records produced by `src/utils/portfolioFileProcessing.js` (each record already contains PDF text, page thumbnails as base64, `portfolioStyleEvidence.{materials, colours, styleKeywords, buildingTypes, drawingTypes}`).
- `briefHints`: `{ buildingType, climate, jurisdictionPack }` — used as priors when portfolio is ambiguous.
- `extractorVersion`: pinned by caller (`STYLE_PACK_VERSION` from `src/schemas/stylePack.js`).

**Output:** `StylePack` or `null` (when `portfolioFiles.length === 0`).

**Pipeline (deterministic, heuristic-only in v1):**

1. **Content hash → seed.** `seed = sha256(sortedByName(portfolioFiles).map(f => f.bytesOrTextDigest).join("|"))`. Becomes `provenance.seed`. All randomness in extraction (e.g. tie-breaks) seeds off it via a tiny xorshift.
2. **Keyword aggregation.** Already-bucketed PDF text via `extractPdfPortfolioEvidence` (existing). Tally `materials`, `colours`, `styleKeywords`, `buildingTypes` across all files. Apply a stopword + synonym map (`"red brick" → "brick"`).
3. **Material families.** `primary = top 3 by frequency in materials buckets, dedup by family`. `secondary = next 4`. `accents = colours and finishes`. Default fallback when nothing matched: `briefHints.buildingType` → look up `LOCAL_PALETTES_BY_TYPE` from `localStylePack.js:92` and use its top 3.
4. **Roof pitch distribution.** Histogram over keyword matches: `flat`/`parapet`/`green roof` → flatPct; `mansard`/`gambrel` → steepPct; `pitched`/`gable` → mediumPct; defaults to dominance derived from `briefHints.buildingType` and `jurisdictionPack` when unclear.
5. **Massing tendency.** Hash of `(form keywords, footprint shape mentions, aspect ratio hints in text)`. Defaults: `{ form: "compact", floorCount: {min:1, mode: briefHints.target_storeys || 2, max:6}, aspectRatioRange: [0.8, 2.5] }`.
6. **Opening rhythm + facade module.** Default `{ moduleMm: 1500, repetition: "regular", sillHeightMm: 900 }`, `{ baySpacingMm: 3000, floorHeightMm: 3000 }`. Heuristic overrides when keyword matches: "loft" → larger module, "terrace" → tighter bay, "Georgian" → paired repetition.
7. **Window-to-wall ratio.** Defaults `{ overall: 0.30, byElevation: { N:0.20, S:0.40, E:0.30, W:0.30 } }`. Bias by `colours` and `styleKeywords` (e.g. "glazed" → +0.10 overall, capped at 0.70).
8. **layout_archetype.** Mapped via the existing vernacular pack vocabulary (terrace, bar, courtyard, pavilion). `null` when ambiguous — the existing `style_provenance.layout_archetype` fallback in `localStylePack.js` then applies.
9. **Confidence.** `count(matched_evidence_buckets) / 7` clamped [0.2, 0.95]. Drives `provenance.confidence`.
10. **Schema validation** via `validateStylePack` before returning. Throw on validation failure (programmer error, not user error).

**No LLM in v1.** Plan-agent justification: heuristic-only is auditable, byte-deterministic across model fingerprint rotations, free, and removes the cache-drift attack surface. v2 may add `STYLE_PACK_LLM_FALLBACK=true` + `STEP_05_STYLE_EXTRACT_MODEL` (already plumbed in skeleton at §2f). v1 leaves both unused.

**Determinism guarantee.** Pure function of `(portfolioFiles bytes, briefHints, extractorVersion)`. The synonym map and bucket tables are frozen constants. Object key order is canonicalised (`JSON.stringify` with stable replacer) before hashing.

**`computeStylePackHash(pack)`** returns `sha256(canonicalJSON(pack without provenance.extractedAt))` — drops the timestamp so two runs of the same content hash identically.

---

## 5. STEP 06 integration (massing constraints)

STEP 06 in the active slice is **`buildProgramme` + deterministic massing seed**, not an LLM call. The Style Pack is applied via `applyStylePackToBrief` **before** `buildProgramme` runs.

**Signature:**

```js
applyStylePackToBrief({ brief, stylePack }): ConstrainedBrief
```

**Returns** a shallow-cloned brief with these clamps (each is a no-op when `stylePack` is null):

| Brief field                         | Clamp / bias                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `brief.target_storeys`              | clamp to `[stylePack.massingTendency.floorCount.min, max]`; if currently null, set to `mode`      |
| `brief.aspect_ratio_target`         | clamp to `stylePack.massingTendency.aspectRatioRange`; if absent, midpoint                        |
| `brief.massing_form_preference`     | set to `stylePack.massingTendency.form` when absent (does not overwrite explicit user preference) |
| `brief.facade_module_mm`            | set to `stylePack.facadeModule.baySpacingMm` when absent                                          |
| `brief.floor_height_mm`             | set to `stylePack.facadeModule.floorHeightMm` when absent — drives the `3.2`-literal fix in §2b   |
| `brief.window_to_wall_ratio_target` | merge with `stylePack.windowToWallRatio` (user fields win, missing fields filled from pack)       |
| `brief.opening_rhythm`              | merge with `stylePack.openingRhythm`                                                              |
| `brief.preferred_layout_archetype`  | set to `stylePack.layout_archetype` when absent and pack provides one                             |
| `brief.style_pack_hash`             | set to `computeStylePackHash(stylePack)` (audit only)                                             |

`brief.floorCountLocked` is honoured per existing memory: when locked, pack clamp is skipped for `target_storeys`. (See memory: floor-count auto-detect + manual override.)

Downstream consumers (`buildProgramme`, `buildProjectGeometryFromProgramme`) already read these brief fields where available; the only code change is in `buildProjectGeometryFromProgramme` to honour `brief.floor_height_mm` instead of the `3.2` literal at line 5640-5641. Roof pitch and opening rhythm consumption sites get one-line reads similarly.

---

## 6. STEP 11 integration (materials constraints)

STEP 11 (material/palette strategy) is currently realised by `buildLocalStylePackV2 → computeMaterialPalette`. The Style Pack constrains via a new optional parameter, **never** via a side-channel.

**Signature change** (re-listed from §2a):

```js
buildLocalStylePackV2({ brief, site, climate, jurisdictionPack, stylePack /* NEW */, ... })
```

`computeMaterialPalette` is extended to accept `stylePackMaterialFamilies`. When provided:

1. **Filter.** Drop palette candidates whose material token does NOT belong to `primary ∪ secondary ∪ accents`. If filtering would empty the palette (e.g. pack lists exotic materials inapplicable in the jurisdiction), skip filtering and emit a `style_pack_warning: "palette_disjoint"` into `style_provenance`.
2. **Re-rank.** Weight each surviving candidate `w_primary=1.0, w_secondary=0.5, w_accents=0.25`. Combine with existing `material_blend_weights`.
3. **Bias** `material_blend_weights.portfolio` upward by `+0.10` when pack confidence > 0.6, capped at the existing `[0.05, 0.25]` envelope at `localStylePack.js:72`. The portfolio share never exceeds the plan-mandated cap.

**Absence-of-pack invariant.** When `stylePack` is null, `buildLocalStylePackV2` returns **byte-identical** output to today. Pinned by a snapshot test on a fixture brief.

---

## 7. ProjectGraph contract (Style Pack upstream of STEP 07)

**Hash input set.** Computed in exactly one place: `buildGeometryHashPayload(compiledProject)` at `src/services/compiler/compiledProjectCompiler.js:1241`, invoked at line 1573. The payload contains: `footprint, envelope, levels, slabs, rooms, walls, openings, stairs, roof`. **Nothing else.** Verified by reading the function in full (§"Verified codebase facts").

**Style Pack does NOT enter the hash payload.** Adding `style_dna` or `stylePack` to the hash would break the "2D and 3D share the same `geometryHash`" contract: the hash represents geometry that must round-trip into both deterministic projections.

**Style Pack folds into the hash _indirectly_.** Sequence:

```
input.portfolioFiles
  → extractStylePack()                  (§4, deterministic, pure)
  → applyStylePackToBrief()             (§5)
  → buildProgramme(constrainedBrief)    (uses pack-derived floorCount, aspectRatio, ...)
  → buildProjectGeometryFromProgramme   (deterministic JS, honours brief.floor_height_mm, opening_rhythm, ...)
  → compileProject(geometrySeed)        (compiledProjectCompiler.js:1350)
  → buildGeometryHashPayload(compiledProject)   (geometry only — but the geometry IS pack-shaped now)
```

Result: pack content perturbs `floorCount` → `levels.length` changes → hash changes. Pack content perturbs `aspect_ratio_target` → `footprint.polygon` changes → hash changes. **Without** changing the hash payload schema.

**`portfolio_style_pack_hash` is carried in `compiledProject.metadata.portfolio_style_pack_hash`** (§2e) for audit. This field sits OUTSIDE `buildGeometryHashPayload`'s reads and is regression-pinned in §10.

**STEP 07 LLM safety.** `STEP_07_PROJECT_GRAPH_MODEL` is dormant in the active slice (Plan-agent confirmation). The slice is deterministic JS keyed off `brief.generation_seed`. Determinism contract is therefore satisfied today. Future LLM swap-in at STEP 07 must keep `temperature: 0` AND geometry must be **snapped/normalised** before hashing (e.g. round all coordinates to integer mm) to survive any LLM non-determinism. Out of scope for this plan but explicitly called out in §12.

---

## 8. Determinism plan

| Surface                      | Mechanism                                                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Extractor**                | Pure function of `(portfolioFiles bytes, briefHints, extractorVersion)`. Heuristic-only. Stable JSON canonicalisation before hashing.                                                             |
| **Style Pack hash**          | `computeStylePackHash(pack) = sha256(canonicalJSON(pack \ provenance.extractedAt))`. Recorded in `brief.style_pack_hash` and `compiledProject.metadata.portfolio_style_pack_hash`.                |
| **Seed threading**           | `provenance.seed` is the content hash of portfolio bytes. Becomes the default `brief.generation_seed` when the brief has none; pack provides reproducibility even when the UI doesn't pin a seed. |
| **Constraint applier**       | Pure brief transformer. No randomness.                                                                                                                                                            |
| **STEP 06 / programme**      | Deterministic JS today; pack just clamps inputs.                                                                                                                                                  |
| **STEP 07 / compileProject** | Pure deterministic JS. Hash payload unchanged.                                                                                                                                                    |
| **STEP 11 / palette**        | Pure transformer with stable sort (current behaviour preserved).                                                                                                                                  |
| **Test pins**                | Three hashes pinned: (a) reference no-pack hash, (b) fixture brief + fixture pack hash, (c) `computeStylePackHash` for the fixture pack.                                                          |

---

## 9. Env vars and config

**New entries to `.env.example` only** (never `.env`, `.env.local`, `.env.production`):

| Var                           | Default         | Notes                                                                                         |
| ----------------------------- | --------------- | --------------------------------------------------------------------------------------------- |
| `STYLE_PACK_ENABLED`          | `true`          | Master kill-switch. `false` → extractor returns null, applier no-ops, pipeline matches today. |
| `STYLE_PACK_SEED`             | empty           | Optional override for `provenance.seed`. Empty → seed = sha256(portfolio bytes).              |
| `STYLE_PACK_LLM_FALLBACK`     | `false`         | Reserved for v2. v1 ignores the flag.                                                         |
| `STEP_05_STYLE_EXTRACT_MODEL` | (commented out) | Reserved. Uncomment when v2 LLM-assist lands.                                                 |

**`scripts/check-env.cjs`:** add `STYLE_PACK_ENABLED` to the **optional flag** block only. Plan-agent flagged: adding to `REQUIRED` would hard-fail every existing deployment.

**Default behaviour with no portfolio.** `input.portfolioFiles?.length === 0` → `extractStylePack` returns `null` → `applyStylePackToBrief({ brief, stylePack: null })` returns the brief unchanged → `buildLocalStylePackV2` is called with `stylePack: null` and returns byte-identical output to today → `buildProgramme` and `buildProjectGeometryFromProgramme` see the same brief they see today → `compiledProject.geometryHash` matches the existing reference hash. Pinned in §10.

---

## 10. Tests to add

### `src/__tests__/services/styleExtractor.test.js`

| Case                                                                                          | Assertion                                                                                                     |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `extractStylePack({ portfolioFiles: [] })`                                                    | returns `null`                                                                                                |
| `extractStylePack` with fixture text-PDF record (`fixtures/stylePack/portfolio-textPDF.json`) | matches `fixtures/stylePack/expected-pack-portfolio-textPDF.json` exactly via `JSON.stringify` canonical form |
| Repeated extraction with the same fixture                                                     | byte-identical output (deep equal AND `computeStylePackHash` equal)                                           |
| Pack validates against `STYLE_PACK_SCHEMA`                                                    | `validateStylePack(pack) === { valid: true }`                                                                 |
| `STYLE_PACK_VERSION` mismatch on returned pack                                                | extractor throws — schema is locked                                                                           |
| Confidence bounded                                                                            | `0 ≤ provenance.confidence ≤ 1` for an empty-text fixture (low confidence allowed, not invalid)               |

### `src/__tests__/services/styleConstraintApplier.test.js`

| Case                                                | Assertion                                                                                                |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `applyStylePackToBrief({ brief, stylePack: null })` | returns brief unchanged (deep equal)                                                                     |
| `target_storeys` outside `floorCount` range         | clamped into range                                                                                       |
| `floorCountLocked: true`                            | clamp is skipped, original value preserved (honours existing memory)                                     |
| `aspect_ratio_target` clamped                       | within `aspectRatioRange`                                                                                |
| `applyStylePackToMaterialPaletteInputs` with pack   | resulting palette tokens ⊂ primary ∪ secondary ∪ accents OR `style_pack_warning: "palette_disjoint"` set |
| Pack absent                                         | palette identical to today's output (snapshot)                                                           |
| `applyStylePackToOptionScorerWeights`               | when pack present, `styleAlignment = 0.15`; when null, weights unchanged                                 |

### Extend `src/__tests__/services/projectGraphVerticalSliceService.test.js`

Three new test cases (uses existing `createReadingRoomBrief()` fixture):

| Case                         | Assertion                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| same brief + same pack twice | identical `verticalSlice.compiledProject.geometryHash`                                                                                                             |
| same brief + no pack         | `geometryHash` matches a **pinned reference constant** (regression — must not drift)                                                                               |
| same brief, pack vs no pack  | `geometryHash` **differs** (proves pack actually affects geometry)                                                                                                 |
| pack present                 | `compiledProject.metadata.portfolio_style_pack_hash` is set; pack hash NOT present in `buildGeometryHashPayload` output (guards against accidental leak into hash) |

### Extend `src/__tests__/services/localStylePack.test.js`

| Case                                                     | Assertion                                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `buildLocalStylePackV2({ ...args })` without `stylePack` | byte-identical to today (snapshot)                                                                           |
| `buildLocalStylePackV2({ ...args, stylePack: fixture })` | `material_palette` tokens ⊂ pack families; `portfolio_style_pack_hash` set; `blend_weights.portfolio` ≤ 0.25 |

---

## 11. Validation matrix

Run before declaring success:

```powershell
npm run check:env
npx react-scripts test --watchAll=false --runInBand --testPathIgnorePatterns=\.claude\ --runTestsByPath src/__tests__/services/modelStepResolver.test.js src/__tests__/services/projectGraphVerticalSliceService.test.js src/__tests__/services/styleExtractor.test.js src/__tests__/services/styleConstraintApplier.test.js
npm run check:contracts
npm run test:compose:routing
npm run build:active
npm run lint
```

Also run `npm run check:all` (≡ `check:env && check:contracts`) once; all six commands above must exit 0.

---

## 12. Risks and non-goals

**Non-goals (explicit):**

- **No LoRA, no fine-tuning of architect work** in v1. v2 may consider an LLM-assist extractor; no model training in either version.
- **No image-model involvement in technical drawings.** Style Pack constrains parametric inputs; plans, elevations, sections remain deterministic SVG/geometry outputs.
- **No change to SVG/DXF/IFC/PDF/XLSX exporters.** Geometry remains the single source of truth; exporters consume `compiledProject` unchanged.
- **No change to the STEP 13 QA report contract.** QA reads what it reads today; new pack-related fields are additive on `compiledProject.metadata` and ignored by the existing report builder.
- **No change to `multi_panel` mode.** All wiring guarded by the `project_graph` pipeline mode and by `STYLE_PACK_ENABLED`. `multi_panel` paths see no new code on hot path.
- **No edit of real `.env`, `.env.local`, `.env.production`.** `.env.example` only.

**Risks (Plan-agent flagged) and mitigations:**

| Risk                                                                       | Mitigation                                                                                                                                                     |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Future LLM at STEP 07 breaks "same pack → same hash"                       | Pin no-pack reference hash in test; if/when STEP 07 LLM is enabled, geometry must be snapped to integer mm before hashing. Out of this scope; called out here. |
| `style_dna` / pack hash accidentally leaks into `buildGeometryHashPayload` | Dedicated invariant test asserts the payload's keys exactly match the geometry-only set.                                                                       |
| Pack confidence drifts on PDF re-render                                    | Heuristic-only extractor → no model fingerprint dependency. Cache is content-hashed, so identical bytes → identical pack.                                      |
| Pack-aligned candidate loses to climate-aligned candidate at scoring       | New `styleAlignment` subscore at 0.15 weight (only when pack present); reallocates from climateFit/costFit. Tunable.                                           |
| Adding `STEP_05_STYLE_EXTRACT_MODEL` to REQUIRED hard-fails ops            | Not added to REQUIRED. Skeleton entry commented out until v2.                                                                                                  |
| User uploads zero portfolio files                                          | `extractStylePack` returns `null`; system runs as today. Snapshot test pins this.                                                                              |
| Pack lists materials with no jurisdictional match                          | Palette filter skipped; `style_pack_warning: "palette_disjoint"` in provenance. No crash.                                                                      |

---

## 13. Rollback plan

**Single env flag.** Set `STYLE_PACK_ENABLED=false` in the Vercel project's environment (preview or production), redeploy:

```
vercel env add STYLE_PACK_ENABLED preview     # then enter "false"
vercel env add STYLE_PACK_ENABLED production  # then enter "false"
vercel deploy --prod
```

Effect:

- `extractStylePack` is never called (guard in `projectGraphVerticalSliceService.js` §2b)
- `applyStylePackToBrief` is never called
- `buildLocalStylePackV2` is called without `stylePack`, returning today's output
- `compiledProject.metadata.portfolio_style_pack_hash` is `null`
- `geometryHash` reverts to the pinned reference hash (snapshot-tested)
- No code change required; no migration; no data backfill

**Code-level rollback** (full revert): the feature lives in self-contained new files plus surgical edits guarded by the env flag. Reverting the merge commit restores prior behaviour cleanly.

---

## Critical files referenced (paths only)

- `src/services/style/localStylePack.js`
- `src/services/project/projectGraphVerticalSliceService.js`
- `src/services/compiler/compiledProjectCompiler.js`
- `src/services/design/optionGenerator.js`
- `src/services/design/optionScorer.js`
- `src/utils/portfolioFileProcessing.js`
- `src/services/modelStepResolver.js`
- `scripts/check-env.cjs`
- `.env.example`
- `src/__tests__/services/projectGraphVerticalSliceService.test.js`
- `src/__tests__/services/localStylePack.test.js`
- `src/__tests__/services/modelStepResolver.test.js`

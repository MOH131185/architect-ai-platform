# Architect AI Platform — A1 SVG + Image2 Implementation Plan

Repository: `MOH131185/architect-ai-platform`  
Target branch: create a new branch from `main`, for example `feature/projectgraph-svg-image2-a1-lock`  
Primary goal: produce an A1 architecture sheet like the reference result: real SVG technical blueprint drawings plus axonometric, exterior perspective, and interior image2/OpenAI image-edit views that all belong to the same project.

---

## 1. Recommended implementation model

### Best choice: Codex as the primary implementer

Use **Codex** for the main implementation because this is a multi-file engineering task that needs patching, tests, and repeated repo-aware debugging. The work is not only prompt writing; it requires modifying routing, endpoints, feature gates, seed behaviour, validation, and A1 artifact composition.

### Use Claude as reviewer/planner, not the primary implementer

Claude can be useful to review architecture, check that the plan still makes sense, and critique the final pull request. But if you must choose one tool for implementation, choose **Codex** because the success criteria are code-level: patch files, run tests, inspect failures, and iterate.

Recommended workflow:

```text
Codex: implement patches + tests + run build/test loop.
Claude: review the plan or final PR for architectural consistency.
```

---

## 2. Product target

The platform should generate this type of output:

```text
A1 architecture sheet
  ├── Site plan / boundary plan — deterministic SVG
  ├── Ground floor plan — deterministic SVG
  ├── First floor plan — deterministic SVG
  ├── Elevations — deterministic SVG
  ├── Section A-A / B-B — deterministic SVG
  ├── Axonometric view — image2 edit from geometry control SVG/PNG
  ├── Exterior perspective / hero view — image2 edit from geometry control SVG/PNG
  ├── Interior view — image2 edit from geometry/interior control SVG/PNG
  ├── Material / notes / scale / title block — deterministic SVG
  └── QA metadata — same geometry hash and same visual identity hash
```

The core principle:

```text
ProjectGraph / compiled geometry = source of truth
SVG = technical drawing source of truth
image2 = presentation/rendering layer only
A1 composer = deterministic assembly layer
QA = hard export gate
```

Do **not** let an image model invent technical drawings or invent project geometry.

---

## 3. Current repo diagnosis

The repo already contains many correct pieces, but they are not enforced tightly enough.

### Good pieces already present

- `src/config/pipelineMode.js` defaults to `project_graph`.
- `api/project/generate-vertical-slice.js` exposes the ProjectGraph vertical-slice endpoint.
- `src/services/render/projectGraphImageRenderer.js` rasterises deterministic control SVGs to PNG and calls OpenAI image edits.
- `src/services/render/visualManifestService.js` builds a visual identity lock with `manifestHash`, `geometryHash`, storey count, materials, roof, glazing, entrance, climate, and style.
- `src/services/canonical/compiledProjectTechnicalPackBuilder.js` builds deterministic technical panels from compiled geometry.
- `src/services/drawing/svgPlanRenderer.js`, `svgElevationRenderer.js`, and `svgSectionRenderer.js` are the right path for technical SVG drawing.
- `src/services/validation/drawingConsistencyChecks.js` already contains cross-view checks, but many are warning-level.

### Main failure causes

1. `PROJECT_GRAPH_IMAGE_GEN_ENABLED=false` by default, so image2 panels silently become deterministic fallback placeholders.
2. `OPENAI_STRICT_IMAGE_GEN=false` allows fallback instead of making image failures visible.
3. `/api/openai-images.js` is text-to-image generation and should not be used for project panels.
4. `/api/openai-image-stylize.js` can fall back to image generation when `image` is missing.
5. Legacy `multi_panel` and `/api/models/*` routes still exist and may produce prompt-only 2D/3D if the UI or env routes to them.
6. Visual consistency is partly checked, but not always enforced as a hard export blocker.
7. Repeated tests can look too similar because the new-project seed is not always varied, while same-project consistency should be preserved.

---

## 4. Required environment settings

For production-like generation:

```env
PIPELINE_MODE=project_graph
REACT_APP_PIPELINE_MODE=project_graph

OPENAI_API_KEY=your_key_here
OPENAI_IMAGES_API_KEY=your_key_here
OPENAI_IMAGE_MODEL=gpt-image-2
STEP_10_IMAGE_MODEL=gpt-image-2

PROJECT_GRAPH_IMAGE_GEN_ENABLED=true
OPENAI_STRICT_IMAGE_GEN=true

PROJECT_GRAPH_REQUIRE_2D_3D_SAME_SOURCE=true
PROJECT_GRAPH_STRICT_VALIDATION=true
QA_FAIL_ON_2D_3D_MISMATCH=true
QA_FAIL_ON_PROGRAMME_AREA_MISMATCH=true
QA_FAIL_ON_SCHEMA_INVALID=true
```

Do not commit real keys.

For local deterministic smoke tests that should not call image2:

```env
PROJECT_GRAPH_IMAGE_GEN_ENABLED=false
OPENAI_STRICT_IMAGE_GEN=false
```

But the product path for the desired A1 result must run with image generation enabled and strict image generation enabled.

### OpenAI image-edit access preflight

Before running strict ProjectGraph A1 generation, run the image-edit access preflight:

```bash
npm run smoke:openai-image-edit-access
```

The preflight sends one tiny deterministic PNG reference to `/v1/images/edits`
using:

```text
OPENAI_IMAGES_API_KEY or OPENAI_API_KEY
STEP_10_IMAGE_MODEL or OPENAI_IMAGE_MODEL
```

It does not change `PROJECT_GRAPH_IMAGE_GEN_ENABLED` or
`OPENAI_STRICT_IMAGE_GEN`. It only checks whether the configured image-edit
model can be used by the configured key before the strict A1 run starts.

If OpenAI returns `401`, `403`, or model-access errors, the script exits
non-zero and prints the configured model, HTTP status, request id when
available, the exact provider message, and the suggested fix:

```text
Verify the OpenAI organization for this image model or choose an allowed
image-edit model.
```

This preflight is diagnostic only. It must not weaken strict ProjectGraph image
generation: with `OPENAI_STRICT_IMAGE_GEN=true`, missing access during the real
A1 run must still fail visibly instead of returning deterministic fallback as
fake OpenAI success.

---

## 5. Desired pipeline architecture

Implement and enforce this flow:

```text
User brief
  ↓
Programme / room schedule
  ↓
ProjectGraph / compiledProject
  ↓
Geometry hash generated
  ↓
Deterministic technical SVG pack
  ├── site plan
  ├── floor plans
  ├── elevations
  └── sections
  ↓
VisualManifest generated from the same compiledProject
  ↓
Deterministic 3D control SVGs generated from compiledProject
  ├── hero_3d_control.svg
  ├── exterior_render_control.svg
  ├── axonometric_control.svg
  └── interior_3d_control.svg
  ↓
Control SVGs rasterised to PNG
  ↓
OpenAI / image2 image-edit calls
  ├── hero_3d.png
  ├── exterior_render.png
  ├── axonometric.png
  └── interior_3d.png
  ↓
A1 composer embeds SVG technical panels + image2 PNG visual panels
  ↓
QA validates hash lock, panel presence, no placeholder/fallback, no text-only project panel generation
  ↓
Export final SVG / PNG / PDF
```

---

## 6. Files to inspect and modify

### Core project generation path

```text
api/project/generate-vertical-slice.js
src/services/project/projectGraphVerticalSliceService.js
src/hooks/useArchitectAIWorkflow.js
src/config/pipelineMode.js
```

Ensure the UI and server always use `/api/project/generate-vertical-slice` for production A1 generation.

### Technical SVG drawing path

```text
src/services/canonical/compiledProjectTechnicalPackBuilder.js
src/services/drawing/svgPlanRenderer.js
src/services/drawing/svgElevationRenderer.js
src/services/drawing/svgSectionRenderer.js
src/services/a1/composeCore.js
src/services/a1/materialTexturePatterns.js
src/services/project/compiledProjectExportService.js
```

Technical panels must remain deterministic SVG and must not route through image generation.

### Image2 / OpenAI visual path

```text
src/services/render/projectGraphImageRenderer.js
src/services/render/svgRasteriser.js
src/services/render/visualManifestService.js
api/openai-image-stylize.js
api/openai-images.js
src/services/ai/ImageStylerService.js
```

3D/perspective/interior/axonometric panels must use image edits with a control PNG, not text-only generations.

### QA / consistency path

```text
src/services/validation/drawingConsistencyChecks.js
src/services/validation/qaScorers/quantitativeScorer.js
src/services/validation/qaScorers/qualitativeScorer.js
scripts/smoke/runA1ConsistencySmoke.mjs
src/__tests__/services/projectGraphVerticalSliceService.test.js
src/__tests__/services/visualManifestService.test.js
src/__tests__/services/svgRendererPhase2.test.js
src/__tests__/services/axonometricCutawayPhase4.test.js
```

QA should block export when 2D and 3D do not share the same geometry authority.

---

## 7. Implementation changes

## Change 1 — force production UI to ProjectGraph only

Ensure production generation never falls back to legacy `multi_panel` or `/api/models/*` image-based drawing paths.

### Expected behaviour

```text
Production A1 generation:
  only /api/project/generate-vertical-slice

Legacy/debug generation:
  allowed only when explicitly enabled by env
```

### Suggested env flag

Add or use:

```env
ALLOW_LEGACY_GENERATION=false
```

### Server-side guard concept

In `server.cjs`, for legacy routes such as `/api/models/generate-project`, `/api/models/generate-drawings`, and `/api/models/generate-visual-package`, block them when production mode is ProjectGraph and legacy is disabled.

Pseudo-code:

```js
function rejectLegacyProjectPanelRoute(req, res, next) {
  const allowLegacy =
    String(process.env.ALLOW_LEGACY_GENERATION || "")
      .trim()
      .toLowerCase() === "true";
  const mode = getEffectivePipelineMode();

  if (mode === "project_graph" && !allowLegacy) {
    return res.status(410).json({
      error: "LEGACY_GENERATION_DISABLED",
      message:
        "Production A1 generation must use /api/project/generate-vertical-slice so all 2D and 3D panels share ProjectGraph geometry authority.",
    });
  }

  return next();
}
```

Apply this guard only to production project-generation legacy routes, not unrelated health/auth/export routes.

---

## Change 2 — patch `/api/openai-image-stylize.js` to fail closed

Current risk: if no `image` is supplied, the endpoint may call `/v1/images/generations`. For architectural panels, this creates unrelated 3D.

### Required behaviour

For these panel types, missing `image` must be a 422 error:

```text
hero_3d
exterior_render
interior_3d
axonometric
```

Also add `exterior_render` to valid panel types.

### Patch concept

In `api/openai-image-stylize.js`, replace/extend panel validation:

```js
const GEOMETRY_LOCKED_PANEL_TYPES = new Set([
  "hero_3d",
  "exterior_render",
  "interior_3d",
  "axonometric",
]);

const validPanelTypes = [...GEOMETRY_LOCKED_PANEL_TYPES];

if (panelType && !validPanelTypes.includes(panelType)) {
  return res.status(400).json({
    error: "INVALID_PANEL_TYPE",
    message: `Panel type must be one of: ${validPanelTypes.join(", ")}`,
    provided: panelType,
  });
}

if (GEOMETRY_LOCKED_PANEL_TYPES.has(panelType) && !image) {
  return res.status(422).json({
    error: "MISSING_GEOMETRY_CONTROL_IMAGE",
    message:
      "Geometry-locked architectural panels require a control image. Refusing text-to-image generation.",
    panelType,
  });
}
```

Then ensure:

```js
const useEdit = Boolean(image);
```

For geometry-locked panels, `useEdit` must always be true.

---

## Change 3 — block `/api/openai-images.js` for project panels

`/api/openai-images.js` is text-to-image generation. It can be kept for mood images or non-project marketing visuals, but not for controlled architectural project panels.

### Patch concept

In `api/openai-images.js`, read `panelType` from the body:

```js
const {
  prompt,
  size = "1024x1024",
  model,
  n = 1,
  panelType = null,
} = req.body || {};
```

Add:

```js
const PROJECT_PANEL_TYPES = new Set([
  "hero_3d",
  "exterior_render",
  "interior_3d",
  "axonometric",
  "floor_plan_ground",
  "floor_plan_first",
  "floor_plan_level2",
  "elevation_north",
  "elevation_south",
  "elevation_east",
  "elevation_west",
  "section_AA",
  "section_BB",
]);

if (PROJECT_PANEL_TYPES.has(panelType)) {
  return res.status(422).json({
    error: "PROJECT_PANEL_REQUIRES_GEOMETRY_LOCK",
    message:
      "Project panels must be generated from ProjectGraph control images, not text-only image generation.",
    panelType,
  });
}
```

This prevents accidental prompt-only generation for any project panel.

---

## Change 4 — enforce deterministic SVG for all technical panels

Technical panels must not use image2, FLUX, Together, DALL-E, or any other image model.

### Mandatory technical panel path

```text
compiledProject
  → compiledProjectTechnicalPackBuilder
  → svgPlanRenderer / svgElevationRenderer / svgSectionRenderer
  → A1 composer
```

### Required metadata per technical panel

Each technical panel should include:

```js
{
  panelType: "floor_plan_ground",
  source: "compiled_project",
  renderer: "deterministic_svg",
  geometryHash,
  svgHash,
  imageProviderUsed: "none",
  technicalDrawing: true,
  visualIdentityLocked: true
}
```

### QA blocker

Add a hard failure if any technical panel contains:

```text
providerUsed = openai / flux / together / image_model
imageProviderUsed != none
missing svgString
missing geometryHash
missing svgHash
placeholder status
```

---

## Change 5 — make all 3D visual panels use `renderProjectGraphPanelImage()`

All visual panels must use the same geometry-aware path:

```text
compiled 3D control SVG
  → rasteriseSvgToPng
  → OpenAI image edit
  → PNG artifact
```

### Panel types

```text
hero_3d
exterior_render
axonometric
interior_3d
```

### Required metadata per visual panel

Each visual panel should include:

```js
{
  panelType,
  provider: "openai",
  providerUsed: "openai",
  imageProviderUsed: "openai",
  imageRenderFallback: false,
  imageRenderFallbackReason: null,
  geometryHash,
  sourceGeometryHash: geometryHash,
  visualManifestHash,
  visualManifestId,
  visualIdentityLocked: true,
  referenceSource: "compiled_3d_control_svg",
  controlSvgHash,
  controlPngHash,
  requestId,
  model: "gpt-image-2"
}
```

### QA blocker

Block export if any required visual panel has:

```text
missing PNG
missing controlSvgHash
missing geometryHash
missing visualManifestHash
visualIdentityLocked !== true
providerUsed !== openai when image generation was enabled
imageRenderFallback === true when strict image generation is enabled
different geometryHash from technical panels
different visualManifestHash from sibling visual panels
```

---

## Change 6 — strengthen VisualManifest as a hard contract

`visualManifestService.js` is the right mechanism. Make it mandatory.

### Required sequence

```text
compiledProject generated
  → geometryHash generated
  → visualManifest generated
  → identity lock block prepended to every visual panel prompt
  → visualManifestHash attached to every visual artifact
```

### Prompt rule

Every 3D prompt should begin with:

```text
=== VISUAL IDENTITY LOCK ... ===
...
=== END IDENTITY LOCK ===
```

Then include the specific view instruction:

```text
View: front-left exterior perspective, eye level, overcast UK daylight
```

or:

```text
View: clean architectural axonometric from above, same roof, same footprint, same windows
```

or:

```text
View: interior kitchen/living view derived from the plan, same window positions and same material palette
```

### Negative constraints

Keep these constraints in every visual prompt:

```text
Do not add extra floors.
Do not move the entrance.
Do not change roof form or pitch.
Do not change facade material.
Do not invent extra windows.
Do not depict a different building.
Do not add neighbouring buildings.
Do not turn detached house into terrace/semi-detached/block.
```

---

## Change 7 — convert visual consistency warnings to blocking errors

`drawingConsistencyChecks.js` already detects some cross-view issues. Upgrade project-panel critical issues from warnings to errors.

### Add helper

Create a helper such as:

```js
function validateVisualPanelLocks({
  panels = [],
  expectedGeometryHash = null,
}) {
  const warnings = [];
  const errors = [];

  const required = ["hero_3d", "exterior_render", "axonometric", "interior_3d"];
  const byType = new Map(
    panels.map((panel) => [panel.panelType || panel.type, panel]),
  );

  for (const type of required) {
    if (!byType.has(type)) {
      errors.push(`VISUAL_PANEL_MISSING: ${type} is required.`);
    }
  }

  const hashes = panels
    .map((p) => p.metadata?.geometryHash || p.geometryHash)
    .filter(Boolean);
  const distinctGeometryHashes = [...new Set(hashes)];
  if (
    expectedGeometryHash &&
    distinctGeometryHashes.some((h) => h !== expectedGeometryHash)
  ) {
    errors.push(
      `VISUAL_GEOMETRY_HASH_MISMATCH: expected ${expectedGeometryHash}, got ${distinctGeometryHashes.join(", ")}.`,
    );
  }

  const manifestHashes = panels
    .map((p) => p.metadata?.visualManifestHash || p.visualManifestHash)
    .filter(Boolean);
  const distinctManifestHashes = [...new Set(manifestHashes)];
  if (distinctManifestHashes.length > 1) {
    errors.push(
      `VISUAL_MANIFEST_HASH_MISMATCH: visual panels carry ${distinctManifestHashes.length} manifest hashes.`,
    );
  }

  panels.forEach((panel) => {
    const type = panel.panelType || panel.type || "unknown";
    const meta = panel.metadata || panel.provenance || {};

    if (
      meta.visualIdentityLocked !== true &&
      panel.visualIdentityLocked !== true
    ) {
      errors.push(
        `VISUAL_IDENTITY_UNLOCKED: ${type} is not visualIdentityLocked.`,
      );
    }

    if (
      panel.imageRenderFallback === true ||
      meta.imageRenderFallback === true
    ) {
      errors.push(
        `VISUAL_IMAGE_FALLBACK: ${type} used fallback instead of image2 edit.`,
      );
    }

    if ((panel.providerUsed || meta.providerUsed) === "deterministic") {
      errors.push(
        `VISUAL_PROVIDER_DETERMINISTIC: ${type} is placeholder/fallback.`,
      );
    }
  });

  return { warnings, errors };
}
```

Call it inside the ProjectGraph vertical-slice QA path and/or `drawingConsistencyChecks.js`.

---

## Change 8 — final A1 composition must embed artifacts, not regenerate them

The final board must not redraw empty frames or ask an image model to create the whole A1 sheet.

### Correct final composition

```text
sheet SVG frame
  + embedded technical SVGs
  + embedded image2 PNGs
  + deterministic labels
  + deterministic title block
```

### Required export path

```text
sheetArtifact.svgString
  → final .svg
  → rasterised .png proof
  → .pdf export embedding rendered full sheet
```

### QA metadata

Attach render proof metadata:

```js
{
  sheetSvgHash,
  renderedPngHash,
  nonBackgroundPixelRatio,
  hasRequiredPanels: true,
  pdfEmbedsRenderedSheet: true
}
```

Block export if:

```text
sheetArtifact.svgString is missing
rendered PNG is blank
PDF contains only empty frames
required panels are missing
technical panel occupancy is too low
```

---

## Change 9 — fix repeated test variation while preserving project consistency

Do not remove consistency. Split variation into two levels:

```text
Across new tests/projects: vary seed.
Within the same project: keep seed and geometry hash stable.
```

### Add new seed creation

In the frontend request builder, add:

```js
function createRunSeed() {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    const arr = new Uint32Array(1);
    cryptoObj.getRandomValues(arr);
    return arr[0] % 2147483647;
  }
  return Math.floor(Math.random() * 2147483647);
}
```

When starting a new project:

```js
const seed = params.seed ?? params.baseSeed ?? createRunSeed();

request.baseSeed = seed;
request.seed = seed;
request.brief = {
  ...request.brief,
  generation_seed: seed,
};
```

When regenerating one panel or modifying style only:

```text
reuse the original seed
reuse the original compiledProject
reuse the original geometryHash
```

When modifying layout/rooms:

```text
create a new compiledProject
create a new geometryHash
regenerate all 2D and 3D panels from the new geometry
```

---

## Change 10 — add a golden A1 acceptance test

Create a deterministic fixture:

```text
Project: Contemporary two-storey UK detached house
Footprint: 8.4m × 7.2m
Roof: gable roof, ridge east-west, charcoal standing seam
Walls: buff brick
Windows: white frames
Entrance: timber entrance bay, front/north facade
Ground floor: hall, living, kitchen/dining, WC, utility
First floor: 3 bedrooms, bathroom, landing
```

### Test must assert

```text
A1 contains site plan
A1 contains ground floor plan
A1 contains first floor plan
A1 contains at least two elevations
A1 contains section A-A
A1 contains axonometric panel
A1 contains exterior perspective / hero panel
A1 contains interior panel
all technical panels are SVG
no technical panel uses image model
all visual panels use image edit, not text generation
all panels share geometryHash
all visual panels share visualManifestHash
no visual panel uses fallback when strict image generation is enabled
PDF/PNG export is not blank
```

---

## 8. Suggested Codex implementation prompts

Use these prompts one at a time. Do not ask Codex to do everything in a single pass unless the environment supports long-running multi-step coding.

### Codex prompt 1 — lock project generation path

```text
You are working in MOH131185/architect-ai-platform on branch feature/projectgraph-svg-image2-a1-lock.

Goal: make ProjectGraph vertical slice the only production path for A1 architecture generation.

Inspect:
- src/config/pipelineMode.js
- src/services/workflowRouter.js
- src/hooks/useArchitectAIWorkflow.js
- server.cjs
- api/project/generate-vertical-slice.js

Implement:
1. Ensure production A1 generation routes only through /api/project/generate-vertical-slice.
2. Add or use ALLOW_LEGACY_GENERATION=false to block legacy /api/models generation routes when PIPELINE_MODE=project_graph.
3. Keep legacy routes available only when ALLOW_LEGACY_GENERATION=true.
4. Add tests or update existing tests to verify legacy project-generation routes are blocked in project_graph mode.

Do not remove unrelated auth, billing, export, or health routes.
Run relevant tests and report changed files.
```

### Codex prompt 2 — fail closed on image generation

```text
Goal: prevent text-only image generation from being used for architecture project panels.

Inspect:
- api/openai-image-stylize.js
- api/openai-images.js
- src/services/ai/ImageStylerService.js
- src/services/render/projectGraphImageRenderer.js

Implement:
1. In api/openai-image-stylize.js, require a supplied image/control image for hero_3d, exterior_render, axonometric, and interior_3d.
2. Add exterior_render to validPanelTypes.
3. Return 422 MISSING_GEOMETRY_CONTROL_IMAGE if one of those panel types is requested without image.
4. In api/openai-images.js, block project panel types from text-only image generation with 422 PROJECT_PANEL_REQUIRES_GEOMETRY_LOCK.
5. Add tests for both endpoints.

The project panel types include all technical panel types and all 3D visual panel types.
Run tests and report changed files.
```

### Codex prompt 3 — enforce visual manifest and geometry hash lock

```text
Goal: every visual panel must share the same geometryHash and visualManifestHash.

Inspect:
- src/services/render/visualManifestService.js
- src/services/render/projectGraphImageRenderer.js
- src/services/project/projectGraphVerticalSliceService.js
- src/services/validation/drawingConsistencyChecks.js
- src/__tests__/services/visualManifestService.test.js
- src/__tests__/services/projectGraphVerticalSliceService.test.js

Implement:
1. Ensure the visual manifest is built once per compiledProject.
2. Ensure every visual panel prompt includes buildVisualIdentityLockBlock(manifest).
3. Attach visualManifestHash, visualManifestId, visualIdentityLocked=true, geometryHash, referenceSource, and controlSvgHash/controlPngHash to every visual panel artifact.
4. Add a QA helper that fails export if visual panels have missing/different geometryHash or visualManifestHash.
5. Make fallback visual panels blocking errors when OPENAI_STRICT_IMAGE_GEN=true.

Run tests and report changed files.
```

### Codex prompt 4 — ensure technical panels are deterministic SVG only

```text
Goal: technical architecture drawings must never route through image models.

Inspect:
- src/services/canonical/compiledProjectTechnicalPackBuilder.js
- src/services/drawing/svgPlanRenderer.js
- src/services/drawing/svgElevationRenderer.js
- src/services/drawing/svgSectionRenderer.js
- src/services/validation/drawingConsistencyChecks.js
- src/services/project/projectGraphVerticalSliceService.js

Implement:
1. Add metadata to technical panel artifacts: renderer=deterministic_svg, technicalDrawing=true, imageProviderUsed=none, geometryHash, svgHash.
2. Add QA failure if a technical panel has no svgString, no svgHash, no geometryHash, or an image provider.
3. Ensure A1 composition embeds these SVGs as final technical panels.
4. Add tests that floor plans/elevations/sections are SVG-only and never image-generated.

Run tests and report changed files.
```

### Codex prompt 5 — seed variation policy

```text
Goal: repeated new tests should vary, but same-project regeneration must remain consistent.

Inspect:
- src/hooks/useArchitectAIWorkflow.js
- src/services/project/projectGraphVerticalSliceService.js
- src/services/designHistoryRepository.js
- tests related to project graph payloads

Implement:
1. Add a createRunSeed() helper in the frontend/request-building path.
2. For new projects, create a new seed when params.seed/baseSeed is missing.
3. Attach seed/baseSeed/brief.generation_seed to the ProjectGraph vertical-slice request.
4. Preserve the original seed for same-project regeneration or style-only modification.
5. Add tests proving two new runs without explicit seed get different seeds, while regenerate keeps the original seed.

Run tests and report changed files.
```

### Codex prompt 6 — golden A1 acceptance test

```text
Goal: add a golden acceptance test for the target A1 result.

Create or update tests under src/__tests__ or scripts/smoke.

Fixture:
- two-storey UK detached house
- 8.4m x 7.2m footprint
- gable roof
- buff brick
- charcoal standing seam roof
- white frames
- timber entrance bay
- ground: hall, living, kitchen/dining, WC, utility
- first: 3 bedrooms, bathroom, landing

Assertions:
- A1 sheet contains site plan, ground floor plan, first floor plan, elevations, section A-A, axonometric, exterior/hero, interior.
- Technical panels are deterministic SVG only.
- Visual panels use image-edit path or mocked image-edit path, never text-only generation.
- All panels share geometryHash.
- Visual panels share visualManifestHash.
- No fallback visual panel is accepted when OPENAI_STRICT_IMAGE_GEN=true.
- Exported sheet is not blank.

Use mocks for OpenAI image edit calls where necessary. Do not require a real API key in CI.
Run tests and report changed files.
```

---

## 9. Suggested Claude review prompts

Use Claude after Codex has produced a patch.

### Claude prompt — architecture review

```text
Please review this PR for an architecture AI platform.

Goal: deterministic ProjectGraph/SVG technical drawings plus image2/OpenAI image-edit visual panels on the same A1 sheet.

Key rules:
1. Technical panels must be deterministic SVG only.
2. Visual 3D panels must use image-edit with a compiled geometry control image.
3. Text-only image generation must be blocked for project panels.
4. All panels must share geometryHash.
5. All visual panels must share visualManifestHash.
6. Fallback visual panels must block export when OPENAI_STRICT_IMAGE_GEN=true.
7. New project runs should vary seed; same-project regeneration should preserve seed and geometryHash.

Review for missed code paths, weak QA checks, and any route that could still produce bad 2D or unrelated 3D.
```

---

## 10. Test and validation commands

Run these after implementation:

```bash
npm run check:env
npm run check:contracts
npm run test:compose:routing
npm run lint
npm run build:active
```

Run focused tests:

```bash
npx react-scripts test --watchAll=false --runInBand --testPathIgnorePatterns=\.claude\ --runTestsByPath \
  src/__tests__/services/projectGraphVerticalSliceService.test.js \
  src/__tests__/services/visualManifestService.test.js \
  src/__tests__/services/svgRendererPhase2.test.js \
  src/__tests__/services/axonometricCutawayPhase4.test.js
```

Run smoke test if available:

```bash
node scripts/smoke/runA1ConsistencySmoke.mjs
```

---

## 11. Acceptance criteria for final PR

The PR is successful only when all of these are true:

```text
[ ] Production UI calls /api/project/generate-vertical-slice.
[ ] Legacy generation routes are blocked in project_graph production mode unless explicitly enabled.
[ ] /api/openai-images refuses project panel types.
[ ] /api/openai-image-stylize refuses geometry-locked panels without a control image.
[ ] exterior_render is supported as a geometry-locked visual panel type.
[ ] Technical drawings are SVG-only and have geometryHash + svgHash.
[ ] Visual panels use image edit from control SVG/PNG.
[ ] Every visual panel has geometryHash + visualManifestHash + visualIdentityLocked=true.
[ ] QA blocks geometry hash mismatch.
[ ] QA blocks visual manifest mismatch.
[ ] QA blocks placeholder/fallback 3D when strict image generation is enabled.
[ ] A1 composer embeds finished artifacts, not prompt-generated fake board images.
[ ] Exported SVG/PNG/PDF are not blank.
[ ] New test runs vary seed.
[ ] Same-project regeneration preserves seed and geometry hash.
[ ] Golden A1 acceptance test passes.
```

---

## 12. Final implementation principle

The platform should never ask image2 to create the architecture from scratch.

Correct:

```text
ProjectGraph → SVG/CAD geometry → control image → image2 edit → A1 composition
```

Incorrect:

```text
Prompt → image2 generation → hope it matches the plan
```

The first path produces a coherent A1 architecture sheet. The second path produces bad 2D and irrelevant 3D.

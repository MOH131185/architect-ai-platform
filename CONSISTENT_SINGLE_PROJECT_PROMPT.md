# Claude Code Prompt — Consistency Audit and Repair

You are auditing an existing Architect AI project and repairing any inconsistencies across floor plans, 3D views, technical drawings, and structure/MEP. Enforce single‑project coherence using deterministic identity, strict validators, and targeted regeneration. Do not leak secrets. Only output a single coherent package that passes all gates.

## Inputs
- project_root: path to assets directory
- manifest_path: existing JSON manifest path (optional)
- site_area_sqm, site_polygon (optional if already in manifest)
- program: list of spaces with areas (optional if in manifest)
- options: units (default metric), base scale, detail scale, required view set, token-saving toggles

## Scope
- Rebuild or load manifest; recompute project identity; validate all assets; regenerate and replace only failing items.
- Priorities: plans → 3D views → technical → structure → MEP → portfolio blend variants.

## Preflight
- Load manifest if provided; else scan `project_root` and infer assets by filename tags: plan/section/elevation/structure/mep/front/side/rear/axonometric/interior.
- Acquire/verify context:
  - Google + OpenWeather via server-side keys: build `location_context` and `climate_profile`.
  - Portfolio images (if any): extract `style_profile` (massing, facade rhythm, materials, palette, glazing ratio, climate adaptations).
  - Build `program_summary` from program or manifest.
- Compute `project_fingerprint = hash(location_context + climate_profile + style_profile + program_summary + site polygon hash)`.
- Set `seed = hash(project_fingerprint)`, lock units, north, origin, base scale.

## Floor Count Reasoning
- If explicit floors provided, respect it; else compute:
  - GFA = sum(program areas) × circulation factor (1.1–1.25)
  - coverage_ratio = 0.4–0.6 if zoning unknown
  - floors = clamp(ceil(GFA / (site_area × coverage_ratio)), 1..6), adjust for height/context
- Cardinality rule: Floors=1 → exactly one plan; Floors>1 → exactly one unique plan per level with labels Level 1..N.

## Validators
- Type Modality:
  - Technical/Structure/MEP: orthographic 2D only; no shading/perspective. Classifier orthographic_prob ≥ 0.9.
  - 3D views: perspective render; not line-only; correct camera tag.
- Style/Material Match:
  - OpenAI descriptors vs `style_profile` similarity ≥ 0.80.
- Consistency:
  - Image embedding cosine similarity to `project_fingerprint` ≥ 0.86 for all 3D views; ≥ 0.82 for 2D drawings.
- Geometry:
  - 3D silhouettes align to plan-derived controls (IoU ≥ 0.75); interiors match room geometry and orientation (door/window/core checks).
- Deduplication:
  - pHash similarity for plans < 0.95 across levels; exteriors are distinct cameras.

## Auto‑Fix Rules
- Plans:
  - If floor count ≠ computed floors: generate missing plans or remove extras.
  - If duplicates (pHash ≥ 0.95): regenerate duplicate with varied core/stacking prompts; keep seed; adjust control strength; retry ≤ 3.
- 3D Views:
  - If fingerprint similarity < 0.86 or style mismatch: regenerate using plan silhouettes (ControlNet), fixed seed, shared facade rhythm/materials/palette; retry camera ±5–10° yaw/pitch; ≤ 3 retries.
  - Axonometric must be rendered image, not sketch; reject sketches and regenerate.
- Technical Drawings:
  - If not orthographic linework or missing dims/north/scale: regenerate with “orthographic technical [plan|section|elevation], no shading, crisp line weights, include dimension strings, title, scale, north arrow”.
- Structure/MEP:
  - Reject any 3D/perspective; regenerate “orthographic line drawing only” with legends/symbols and line types.
- Portfolio Blend:
  - Create pixel-aligned baseline vs style-transferred variants using same seed/geometry for blend cursor.

## Replicate Orchestration
- Master prompt template fields:
  - Identity: project_id, location_context, climate_profile
  - Style: massing, facade rhythm, materials, palette, glazing ratio, shading devices
  - Geometry: plan-derived controls, consistent camera params, seed
  - Intent:
    - Technical/Structure/MEP: “orthographic technical [type], no shading/perspective, clear line weights, include dimensions/legends”
    - 3D views: “photo-real perspective [front|side|rear|axonometric|interior]”
  - Negative prompts:
    - “sketch, hand-drawn, wireframe, axonometric sketch, cartoon”
    - “different project, mismatched building, inconsistent style/materials, off-style palette”
    - “3D render for technical drawings, perspective for orthographic”
    - “2D plan for 3D views, interior from unrelated geometry”
- Always pass: seed, project_id, view_id, control_images (plan silhouettes), and consistent materials/palette.

## Detail & Token Controls
- `detail_scale: low|medium|high` controls prompt specificity and output resolution.
- Optional sets: allow skipping extra interiors/elevations to save tokens while preserving core set.

## Output Actions
- Update or create manifest with:
  - project: project_id, seed, units, base_scale, location_context, climate_profile, style_profile_summary
  - plans: list with level, scale, dims_included, phash, controls, checksum
  - technical_drawings: type, scale, orthographic, dims_included, checksum
  - structure_plans, mep_plans: level, orthographic, legend, checksum
  - views_3d: camera, seed, style_match_score, fingerprint_similarity, controls, checksum
  - assets: images with path/mime/size
  - logs: per-asset validator results, retries, model_versions, timestamps
- Replace only assets that failed; keep passing assets unchanged.

## Acceptance Criteria
- All assets share one project_id/seed and pass validators.
- Plans: correct count per floor reasoning; no duplicates; levels labeled.
- 3D views: consistent geometry/style/materials; pass fingerprint and geometry checks; non-sketch axonometric.
- Technical/Structure/MEP: orthographic 2D only with required annotations/legends.
- Manifest complete; checksums/hashes present; audit log shows zero outstanding failures.

## Safety & Hygiene
- Never log keys; redact secrets; run server-side only.
- Strip EXIF/metadata; sanitize filenames with project_id/view_id; enforce allowed CORS origins.


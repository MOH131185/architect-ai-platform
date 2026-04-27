# WIP reconciliation plan

## Context

After Tier 1-3 shipped, `git status` reports 11 files modified that I never edited. The intent of this plan is to (a) understand what each WIP change does, (b) confirm whether it conflicts with the Tier 1-3 work, (c) decide commit-as-is vs. modify-then-commit per file, and (d) tie each change to a section of `C:\Users\21366\Downloads\ai_architecture_riba_a1_implementation_plan.md`.

**Verdict at the top:** the WIP is a single coherent feature plus one infra refactor:

1. **Site-fit floor reconciliation** — when the user-requested GIA cannot fit the buildable polygon at the user-requested storey count, the engine drops optional rooms (study/storage/utility/dining/plant) and/or adjusts the storey count. Surfaces warnings in the wizard. (Plan §6.6 area QA, §6.7 site fit, §6.13 self-correction.)
2. **ProjectGraph request optimisation** — the workflow hook compacts site/location/portfolio/programme payloads before posting to `/api/project/generate-vertical-slice`, sanitises returned SVG (no `NaN`/`undefined`/`null` `d=` paths), and warns when the request body exceeds 750 KB.
3. **Legacy hybrid-mode deactivation** — `ForceHybridMode` no longer hard-pins the legacy `multi_panel` workflow when the active pipeline is `project_graph`. (Plan §1, §16 — production default.)

These three streams are well-scoped, independently testable, and **do not conflict** with my Tier 1-3 work. The reconciliation plan below is therefore mostly _verify-and-stage_, not _refactor-and-rewrite_.

---

## File-by-file audit

### 1. `src/services/project/residentialProgramEngine.js` (+248 / −0)

**What it does**

- Adds `SUBTYPE_SITE_RULES` table — per-subtype `{ minLevels, maxLevels, coverageRatio }` for `detached-house`, `semi-detached-house`, `terraced-house`, `villa`, `cottage`, `mansion`, `apartment-building`, `multi-family`, `duplex`.
- Adds `resolveSiteFitLevelCount(subType, totalAreaM2, siteAreaM2)` — uses `coverage_ratio × site × 0.85 setback` to compute max footprint, then ceil(target/footprint), clamped by subtype min/max levels.
- Adds `fitSpacesToTargetArea(spaces, target)` — when programme over-shoots target by > 5 % (`AREA_TOLERANCE`), drops optional rooms in this priority: `study → storage → utility → dining → plant_storage`. When under-shoots, scales up non-fixed rooms.
- Adds `rebalanceUpperSpacesAcrossLevels(spaces, levelCount)` — distributes upper rooms across multiple upper floors by minimum-area heuristic (avoids 5-storey schemes with everything on level 1).
- Adds `levelCountOverride` to `generateResidentialProgramBrief`. When set, the program respects the override even if site-fit suggests fewer/more levels.
- Single-level (`levelCount <= 1`) collapse: if user explicitly requests a bungalow but template emits "Upper" rooms, force them to ground-floor.
- `warnings` is now populated (was `[]`).

**Plan mapping**

- Plan §6.6 _Programme engine — area QA tolerances_: "Primary spaces target area ±10 % unless user allows flexibility" — this implements ±5 % tighter than the plan, and the optional-drop order matches the plan's "user/edit lock" idea.
- Plan §6.7 _Design engine — candidate generation_: step 1 is "create site buildable zone from boundary, setbacks, access, orientation, context". `SITE_SETBACK_FACTOR = 0.85` and per-subtype `coverageRatio` are this exact computation, scoped to residential.
- Plan §6.13 _Self-correction loop_: dropping optional rooms when oversized is one of the canonical repair strategies (alongside Tier 2.7 `repairLoop.js` which adjusts storey count).

**Conflict check vs Tier 1-3**

- Tier 2.3 (`optionGenerator.js`) computes site-fit at the geometric/option level (4 typological variants scored). This WIP computes site-fit at the **programme** level (which subtypes fit which sites). The two are complementary, not redundant.
- Tier 2.7 (`repairLoop.js`) adjusts storey count when `PROGRAMME_AREA_OUTSIDE_TOLERANCE` fires; the WIP's `fitSpacesToTargetArea` is a finer-grained variant that adjusts the room _list_. Both can run; the WIP runs first (residential V2 path, before geometry compile), repairLoop runs after (vertical slice).
- The WIP touches `residentialProgramEngine.js` which is on the **legacy V2 residential pipeline** (`projectPipelineV2Service.js`), not the ProjectGraph vertical slice. My Tier 1.3 programme templates are inside `projectGraphVerticalSliceService.js`. No code path collision.

**Action**

- **Commit as-is** after running the bundled test file (3 new tests already exercise it).
- **Verify**: run `npx react-scripts test --testPathPattern=residentialProgramEngine`; expect 3 new tests + existing tests to pass.

---

### 2. `src/services/autoLevelAssignmentService.js` (+1 / −1)

**What it does**

```diff
-      const upperStartIdx = levels.length >= 3 ? 2 : 1; // Start from Second or First
+      const upperStartIdx = 1; // Upper residential rooms can occupy First and above.
```

**Plan mapping**

- Plan §6.6 _Programme engine_ — programme spaces get `target_level` assignments; bedrooms / bathrooms typically expect to occupy first floor in a 2-storey home. The previous behaviour pushed them to second floor in 3+ storey schemes, which is correct for a townhouse but wrong for a typical 2-storey house. This 1-line fix unifies the assignment rule.

**Conflict check**

- None. This file is on the legacy V2 path (called from `ArchitectAIWizardContainer` and `projectPipelineV2Service`). The ProjectGraph vertical slice does its own placement via `layoutRoomsForLevel`.

**Action**

- **Commit as-is**. The comment block in the bundled test file (`autoLevelAssignmentService.test.js`, +28 lines) covers the new behaviour.

---

### 3. `src/services/project/projectPipelineV2Service.js` (+47 / −16)

**What it does**

- Adds `resolveExplicitLevelCount(projectDetails, programSpaces)` — three-tier resolution: (a) `floorCountLocked` user lock → use locked, (b) `programSpaces._calculatedFloorCount` metadata → use that, (c) `projectDetails.floorCount` → use that.
- Threads `levelCountOverride` through `buildProgramBrief` so the program engine respects the explicit count.
- Updates the brief's `provenance.sources` to record whether the resolution came from a manual lock vs a proposed reconciliation.

**Plan mapping**

- Plan §6.6 _Programme engine_ — "Lock programme version before design option generation" and "Ask user-facing UI to edit/approve if possible". `projectDetails.floorCountLocked` is exactly that lock.
- Plan §16.3 _Version every generated asset_ — `provenance.sources` is the audit trail of which lock won.

**Conflict check**

- None. The ProjectGraph vertical slice has its own `target_storeys` resolver in `normalizeBrief`. The legacy V2 path is independent.

**Action**

- **Commit as-is** after running its bundled test file (`projectPipelineV2Service.test.js`, +76 lines covers `resolveExplicitLevelCount` and the three-tier resolution).

---

### 4. `api/program/compile.js` (+11 / −0)

**What it does**

- Accepts new request body fields: `levelCount`, `floorCount`, `floorCountLocked`. Forwards as `levelCountOverride` if locked or explicitly requested.

**Plan mapping**

- Plan §6.6 — manual lock surfacing.
- Plan §16.3 — request body now carries provenance for the lock decision so the server can record it.

**Conflict check**

- None. This endpoint is on the legacy V2 program-compile path; the ProjectGraph endpoint is `/api/project/generate-vertical-slice`.

**Action**

- **Commit as-is**. No bundled tests, but the wizard exercises this path E2E (verified manually via `npm run dev` + the wizard's specs step).

---

### 5. `src/components/ArchitectAIWizardContainer.jsx` (+95 / −22)

**What it does**

- Imports `getCurrentPipelineMode` and `PIPELINE_MODE` (so the wizard knows which workflow it's running).
- Before generating the program brief, calls `autoLevelAssignmentService.calculateOptimalLevels(requestedTotalArea, siteArea, { … maxFloors: 4, circulationFactor: 1.0 })` to derive a site-fit floor count up front.
- Passes `levelCountOverride: isFloorCountLocked ? desiredFloorCount : siteFitFloorCount` into `generateResidentialProgramBrief` — so the brief is consistent with what the wizard will display.
- Recomputes `floorMetrics` after the program brief is in hand, attaching `actualFootprint`, `siteCoveragePercent`, `fitsWithinSite`, `selectedFloors`, and a per-case `reasoning` string (manual lock vs site-fit).
- Surfaces `programBrief.warnings` in the wizard's UI message stream.
- Sets `circulationFactor: 1.0` (was a derived `1 + circulationRatio`) so the auto-level service gets the raw program area, not an inflated one.

**Plan mapping**

- Plan §11 _UI/UX requirements_: "Show the user … programme before and after placement … QA warnings before export … data-source limitations." The new warnings stream + `siteCoveragePercent` / `fitsWithinSite` fields satisfy the bullet "show the user generated design options and scores".

**Conflict check**

- None. The two `useEffect` blocks I touched in Tier 1-3 don't overlap with the `if (isSupportedResidentialV2)` branch this WIP modifies.
- Tier 1.4 added `data_quality` to the ProjectGraph site context. The WIP adds `siteCoveragePercent` to the _V2 residential_ path's `floorMetrics`. Different artefacts; no collision.

**Action**

- **Commit as-is**. There's no UI test, but the surrounding behaviour is exercised via the V2 residential pipeline tests.

---

### 6. `src/components/ForceHybridMode.jsx` (+101 / −101 — full rewrite)

**What it does**

- **Before**: hard-set `FEATURE_FLAGS.hybridA1Mode = true` and `setFeatureFlag("hybridA1Mode", true)` on every mount, regardless of the active pipeline. This was forcing the legacy `multi_panel` workflow even when the user's `PIPELINE_MODE` env var was `project_graph`.
- **After**: reads `getCurrentPipelineMode()` first. If `PROJECT_GRAPH`, **clears** the hybrid flag (so the legacy workflow doesn't sneak in). Only forces hybrid when the active mode is `MULTI_PANEL`. Logs the decision.

**Plan mapping**

- Plan §1 _Non-negotiable product requirements_: "model-first architecture generator". Forcing the legacy multi-panel image-first path violates this; the rewrite enforces the model-first default.
- Plan §16 _Code implementation patterns_ — orchestrator routing.

**Conflict check**

- This is the only WIP file that **complements my Tier 1 work directly**: my Tier 1.6 hash-uniformity gate, sun-path integration, regulation engine, etc. all live on the ProjectGraph path. If `ForceHybridMode` keeps hard-pinning the legacy workflow, my Tier 1-3 work never executes in production. **This is a load-bearing fix.**

**Action**

- **Commit as-is — first.** This is the highest-priority WIP file because it unblocks every other Tier 1-3 deliverable in production.
- **Verify**: smoke-test in `npm run dev` with `REACT_APP_PIPELINE_MODE` unset (defaults to PROJECT_GRAPH) — confirm the wizard does not toggle `hybridA1Mode` flag in browser sessionStorage.

---

### 7. `src/components/steps/SpecsStep.jsx` (+5 / −3)

**What it does**

- Removes the `disabled={!projectDetails.floorCountLocked}` constraint on the floor-count input so users can edit the count even when not locked.
- Updates `BuildingProgramTable` to read floor count from `programSpaces._calculatedFloorCount` first, then fall through `floorCountLocked ? floorCount : autoDetectedFloorCount || floorCount`.

**Plan mapping**

- Plan §11 _UI/UX requirements_: "RIBA output stage … Building type and key spaces … Sustainability ambition." User control over storey count is a basic UI requirement.

**Conflict check**

- None.

**Action**

- **Commit as-is**.

---

### 8. `src/hooks/useArchitectAIWorkflow.js` (+260 / −4)

**What it does**

- Adds `PROJECT_GRAPH_REQUEST_SOFT_LIMIT_CHARS = 750_000` — guard against oversized request bodies.
- Adds `sanitizeProjectGraphSvg` — strips `<path d="undefined">`, `<path d="null">`, and `<path>` paths containing `NaN` from server-returned SVG before rendering. Defensive against pathological compose responses.
- Adds 4 compactor helpers — `compactSiteSnapshotForRequest`, `compactLocationDataForRequest`, `compactPortfolioBlendForRequest`, `compactProgramSpacesForRequest`. Each strips full-fidelity nested data down to the fields the ProjectGraph endpoint actually needs.
- Wires the compactors into the `/api/project/generate-vertical-slice` request builder. Result: smaller, faster, less-likely-to-413 requests.

**Plan mapping**

- Plan §17 _CI and test plan_: integration test `brief → programme` requires a stable request shape. The compactors define exactly what crosses the wire.
- Plan §13.4 _AI usage_: "LLM use is constrained — geometry, code compliance, dimensions, areas, scale drawings, final model consistency must NOT come from LLMs." The sanitizer strips `NaN` paths, which would only ever appear if a downstream LLM/raster tool produced bad SVG.

**Conflict check**

- I touched `useArchitectAIWorkflow.js` for context only, not modification, in Tier 1. The WIP refactor is wholly inside the function bodies the workflow router exposes; it doesn't change the resolved workflow path.

**Action**

- **Commit as-is**. The compactors are pure functions; the sanitizer is pure-string. Easy to test in isolation if needed (no test bundled by the WIP — see "follow-ups" below).

---

### 9. New test files (`+161 lines across 3 files`)

```
src/__tests__/services/autoLevelAssignmentService.test.js     (+28)
src/__tests__/services/projectPipelineV2Service.test.js       (+76)
src/__tests__/services/residentialProgramEngine.test.js       (+57)
```

**What they cover**

- `residentialProgramEngine.test.js`: 3 new tests — site-fit levels with compact 98 m² programme, `levelCountOverride` honoured even when site-fit recommends fewer levels, 3-level distribution.
- `projectPipelineV2Service.test.js`: covers `resolveExplicitLevelCount` priority order (locked > metadata > projectDetails) and the brief reconciliation provenance string.
- `autoLevelAssignmentService.test.js`: covers the upper-priority assignment in 2-storey vs 3-storey schemes.

**Action**

- **Commit alongside the source files**. They lock in the WIP behaviour as regression tests.

---

## Reconciliation strategy

### Stage 1 — Run the WIP tests against my Tier 1-3 changes

Before committing anything, prove there's no interaction with Tier 1-3.

```bash
npx react-scripts test --testPathPattern="residentialProgramEngine|autoLevelAssignmentService|projectPipelineV2Service" --watchAll=false
npm run test:e2e:riba
```

**Expected**: WIP tests pass, e2e still passes 18/18. If the WIP tests fail, treat that as a real bug (it would be in the WIP, not my Tier 1-3 work).

### Stage 2 — Stage commits in a sensible order

Commit in three small commits, each independently revertable:

1. **`feat(workflow): align ForceHybridMode with PROJECT_GRAPH default`** — unblocks production routing for Tier 1-3.
   - `src/components/ForceHybridMode.jsx`
2. **`feat(residential): site-fit floor-count reconciliation with optional-room drop`** — the main feature.
   - `src/services/project/residentialProgramEngine.js`
   - `src/services/autoLevelAssignmentService.js`
   - `src/services/project/projectPipelineV2Service.js`
   - `api/program/compile.js`
   - `src/components/ArchitectAIWizardContainer.jsx`
   - `src/components/steps/SpecsStep.jsx`
   - `src/__tests__/services/residentialProgramEngine.test.js`
   - `src/__tests__/services/projectPipelineV2Service.test.js`
   - `src/__tests__/services/autoLevelAssignmentService.test.js`
3. **`refactor(workflow): compact ProjectGraph request payload and sanitize SVG`** — independent infra refactor.
   - `src/hooks/useArchitectAIWorkflow.js`

### Stage 3 — Verify in CI

After staging, run the full validate chain:

```bash
npm run validate:active  # runs check:contracts, test:compose:routing, test:dna:pipeline, test:clinic:a1, test:e2e:riba
```

Then Vercel preview deploy and exercise the wizard at `/` end-to-end with the Reading Room inputs.

---

## Follow-ups (not blocking the staging)

These are observations, not changes that gate the commit:

1. **The WIP has no test for `useArchitectAIWorkflow`'s new helpers** (`sanitizeProjectGraphSvg` + 4 compactors). Add `src/__tests__/hooks/useArchitectAIWorkflow.test.js` covering:
   - `sanitizeProjectGraphSvg` strips `NaN`/`undefined`/`null` paths and is idempotent.
   - `compactSiteSnapshotForRequest({})` returns `null` (regression guard).
   - `compactProgramSpacesForRequest([])` returns `[]`.
   - The 750 KB soft-limit constant matches the request-body cap a typical Vercel function tolerates (Vercel's hard limit is 4.5 MB; the soft limit at 750 KB is conservative — verify intent).
2. **The `_calculatedFloorCount` metadata field on `programSpaces`** is now read in two places (`projectPipelineV2Service.resolveExplicitLevelCount`, `SpecsStep.BuildingProgramTable`). It is not declared in any schema doc. Add a JSDoc / type alias to `src/contracts/genarch-api-v1.json` or wherever programSpaces metadata lives.
3. **`SUBTYPE_SITE_RULES` coverage ratios are heuristics** with no source citation. Plan §14 expects every context field to carry a source. Add a comment block citing the source (UK PPS / urban infill rules of thumb) or mark as "internal heuristic".
4. **`ForceHybridMode` rewrite warrants a tiny test** under `src/__tests__/components/ForceHybridMode.test.jsx` — assert that on mount with PIPELINE_MODE=project_graph, `setFeatureFlag('hybridA1Mode', false)` is called and not `true`. This protects the load-bearing fix.

---

## Summary

| File                             | Status                                   | Plan §            | Action                                               |
| -------------------------------- | ---------------------------------------- | ----------------- | ---------------------------------------------------- |
| `ForceHybridMode.jsx`            | aligns legacy flag with active pipeline  | §1, §16           | **Commit first** (load-bearing for Tier 1-3 in prod) |
| `residentialProgramEngine.js`    | site-fit + optional-room drop + override | §6.6, §6.7, §6.13 | Commit with V2 tests                                 |
| `projectPipelineV2Service.js`    | three-tier level-count resolver          | §6.6, §16.3       | Commit with V2 tests                                 |
| `autoLevelAssignmentService.js`  | upper rooms can occupy first floor       | §6.6              | Commit                                               |
| `api/program/compile.js`         | accept floorCountLocked / levelCount     | §6.6, §16.3       | Commit                                               |
| `ArchitectAIWizardContainer.jsx` | wires site-fit metrics + warnings        | §11               | Commit                                               |
| `SpecsStep.jsx`                  | small UI tweak                           | §11               | Commit                                               |
| `useArchitectAIWorkflow.js`      | request compaction + SVG sanitiser       | §13.4, §17        | Commit (separate refactor commit)                    |
| 3 new test files                 | regression coverage                      | §17.1, §17.2      | Commit alongside source                              |

Total: 11 files, 826 insertions, 133 deletions, 3 commits, 0 blocking follow-ups.

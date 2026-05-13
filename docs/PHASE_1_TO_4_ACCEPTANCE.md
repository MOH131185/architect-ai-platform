# Phase 1–4 acceptance summary

Single document capturing the commit range, the verification commands,
expected outcomes, and known caveats for the A1 export-fix stack. Pair
with `DEPLOYMENT_CHECKLIST.md` for the operational promotion path.

---

## Commit range

| Phase / step                                            | Commit SHA    |
| ------------------------------------------------------- | ------------- |
| Phase 1 — initial compact-reference route + magic bytes | `2bde2eb`     |
| Phase 1 — reviewer fix-ups                              | `10b8560`     |
| Phase 1 polish — PDF-smuggled-as-SVG test               | `6636d74`     |
| Phase 2 — engineering bundle hydration                  | `bded132`     |
| Phase 2 amendment — restored-history gate               | `d80c684`     |
| Phase 3 — A1 safe band + QA blocking                    | `af2a2c3`     |
| Phase 3 fix-up — FLOOR_ROW_DESCRIPTORS safe band        | `74e5b54`     |
| Phase 4 — 2D/3D consistency gate                        | `db091d3`     |
| Phase 4 fix-up — stamp live panel metadata              | `3adb316`     |
| Phase 5 — production-readiness smoke + docs             | _this commit_ |

Branch: `claude/relaxed-sinoussi-72f712`.

---

## Required commands

Run from the repo root (or any worktree).

```sh
# Phase 1–4 + S3 production-readiness smoke (mock mode — default)
npm run smoke:production-readiness

# Same smoke, real mode — enforces S3 env vars + provider preflight
npm run smoke:production-readiness -- --mode real

# Targeted unit suites (Phase 1 + 2 + 3 + 4)
npx react-scripts test --watchAll=false --runInBand \
  --testMatch="**/src/__tests__/services/validation/panelGeometryConsistencyChecks.test.js" \
  --testMatch="**/src/__tests__/services/a1/a1ExportGatePanelConsistency.test.js" \
  --testMatch="**/src/__tests__/services/a1/composeCoreLayoutResolveLayout.test.js" \
  --testMatch="**/src/__tests__/services/a1/composeCoreLayoutConstants.test.js" \
  --testMatch="**/src/__tests__/services/exportServiceA1QaBlocking.test.js" \
  --testMatch="**/src/__tests__/components/exportPanelInlineBlockedReason.test.js" \
  --testMatch="**/src/__tests__/services/exportManifestRestoredHistoryGate.test.js" \
  --testMatch="**/src/__tests__/services/designHistoryEngineeringRoundTrip.test.js" \
  --testMatch="**/src/__tests__/hooks/useArchitectAIWorkflowEngineeringAttach.test.js" \
  --testMatch="**/src/__tests__/api/a1Export.handler.test.js" \
  --testMatch="**/src/__tests__/services/exportServiceA1Export.test.js" \
  --testMatch="**/src/__tests__/services/exportServicePngValidation.test.js" \
  --testMatch="**/src/__tests__/services/artifactStorageBlobArtifact.test.js" \
  --testMatch="**/src/__tests__/components/architectAIWizardHandleExportRethrow.test.js" \
  --testMatch="**/src/__tests__/api/generateVerticalSlicePersistMasterSvg.test.js" \
  --testMatch="**/src/__tests__/services/a1FinalExportContract.test.js"

# Repo-wide gates
npm run check:contracts
npm run test:compose:routing
npm run lint
npm run build:active
```

---

## Expected outcomes

| Command                                             | Expected outcome                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `npm run smoke:production-readiness`                | 22 passed / 0 failed / 1 skipped (PROVIDER_PREFLIGHT skips in mock mode). Total time < 1 s. |
| `npm run smoke:production-readiness -- --mode real` | 23/23 pass when S3 env vars + OpenAI keys present. Use only with real preview/prod env.     |
| Targeted Phase 1–4 unit suite                       | **265 / 265 pass** across 16 files. Total time ~16 s under `react-scripts test`.            |
| `npm run check:contracts`                           | "Contract check PASSED" (Design DNA contracts).                                             |
| `npm run test:compose:routing`                      | 22 / 22 passed.                                                                             |
| `npm run lint`                                      | Clean — no eslint output.                                                                   |
| `npm run build:active`                              | Webpack build completes; bundle written under `build_active_*`.                             |

### Phase-by-phase user-facing outcomes

| Phase | Behaviour change                                                                                                                                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | A1 PNG / PDF / SVG exports route through `/api/a1/export` with compact-reference body. No more `/api/sheet` 413; no more SVG bytes saved as `.png`.                                                                                        |
| 2     | DXF / IFC / JSON / XLSX engineering rows in `ExportPanel` are ready when `compiledProject` carries the right inputs. Restored-history designs get the `REGENERATE_REQUIRED_FOR_ENGINEERING_EXPORT` reason inline.                          |
| 3     | A1 sheet keeps a 6 mm safe band below the title bar. QA-failed sheets surface a red banner + disable PNG/PDF/SVG rows. `exportService.exportSheet` throws on programmatic calls when `a1ExportQa.status === "blocked"`.                    |
| 4     | A 2D/3D mismatch (geometry hash, visual manifest, palette, floor count, roof, entrance, openings, primary material) folds into the same `a1ExportQa` blocker stream that Phase 3 surfaces. UI banner + service throw are reused unchanged. |

---

## Regression matrix (Phase 5 smoke checks)

The single `npm run smoke:production-readiness` covers:

| Phase   | Check name                             | Asserts                                                                                                                                                                 |
| ------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 | `PHASE1_EXPORT_HANDLER_HELPERS`        | `classifyArtifactKind` + `sanitizeInlineSvg` still recognise PNG/PDF/SVG/HTML + reject `<script>`.                                                                      |
| Phase 1 | `PHASE1_EXPORT_SERVICE_CONTRACT`       | `basenameFromPath` + magic-byte validators + `EXPORT_REQUEST_INLINE_BUDGET_BYTES` exported. PNG validator rejects SVG-as-PNG masquerade.                                |
| Phase 2 | `PHASE2_ENGINEERING_MANIFEST_CONTRACT` | `buildClientExportManifest` readiness + `buildCompiledProjectExportSummary` round-trip + `applyHistoryRestoreGate` forces engineering rows off + reason code preserved. |
| Phase 3 | `PHASE3_LAYOUT_CONSTANTS`              | `A1_CONTENT_TOP_MM = 16`; `resolveLayout("presentation-v3")` for floorCount 1/2/3 keeps every `floor_plan_*` slot at or below the safe-band floor.                      |
| Phase 3 | `PHASE3_QA_BLOCKS_SHEET_EXPORT`        | `exportService.exportSheet` throws "A1 export blocked …" for PNG / PDF / SVG when `a1ExportQa.status === "blocked"`.                                                    |
| Phase 4 | `PHASE4_PANEL_CONSISTENCY_VALIDATOR`   | `runPanelGeometryConsistencyChecks` returns `pass` on a same-source fixture and `blocked` + `PANEL_GEOMETRY_HASH_MISMATCH` on a stale fixture.                          |
| Phase 4 | `PHASE4_GATE_FOLDS_PANEL_CONSISTENCY`  | `evaluateFinalA1ExportGate` with a stale 3D `geometryHash` returns `status: "blocked"`, `allowed: false`, and surfaces the block in `evidence.panelConsistencyStatus`.  |
| S3      | `S3_STORAGE_DURABILITY_ADVISORY`       | Reports the active adapter. In `--mode real` enforces `ARTIFACT_STORAGE_PROVIDER=s3` + bucket + access key + secret.                                                    |

In addition to the eight new checks, the pre-existing 14 smoke checks (jurisdiction packs, style-blend determinism, technical SVG authority, CAD/DXF determinism, opt-in disciplines, artifact package + storage round-trip, no fake DWG/IFC, secret leakage) continue to run.

---

## Known caveats

1. **Pre-existing test failure**: `src/__tests__/services/composeCoreTechnicalFirstLayout.test.js` line 104 (`thresholdSquarePlan toBe(0.58)`) fails on `db091d3` and earlier. Phase 3 does not touch `getDefaultMinSlotOccupancy` — this is not a Phase 1–4 regression. Flagged for separate cleanup.

2. **`check:env` failures**: 14 pre-existing failures (`OPENAI_API_KEY`, `STEP_*`, etc.) because `.env` is gitignored. Run-time pipeline behaviour is unaffected; the smoke suite does not depend on these env vars.

3. **Storage adapter durability**: when `ARTIFACT_STORAGE_PROVIDER` is unset or set to `memory` / `filesystem`, the slice handler still produces the SVG artifact + sets `metadata.svgOutputFile` for same-instance reads, but the slice logs `[generate-vertical-slice] storage adapter is not production-durable …` and refuses to advertise `svgArtifactRef.available: true`. Production rollout requires S3 (see `DEPLOYMENT_CHECKLIST.md`).

4. **No new feature behavior in Phase 5**: this phase added one smoke script + two docs only. The smoke imports existing exports and exercises their contracts — no production code was modified.

5. **Re-exporting engineering formats from a history-restored design** is not supported by design (Phase 2 trade-off — `compiledProject` would blow the localStorage budget). The manifest reports `REGENERATE_REQUIRED_FOR_ENGINEERING_EXPORT` so the UI is honest about it.

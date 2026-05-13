# Deployment checklist — A1 export-fix stack (Phases 1–5)

Operational checklist for promoting the Phase 1–4 export-fix work to
Vercel Preview + Production. Pair with `PHASE_1_TO_4_ACCEPTANCE.md` for
the full commit range + test-output summary.

Phase 5 (this PR) consolidates the regression matrix into
`scripts/smoke/run-production-readiness-smoke.mjs` and adds these docs.
No new feature behavior was introduced in Phase 5.

---

## 1. Required Vercel environment variables

The durable artifact path that Phase 1's `/api/a1/export` and Phase 4's
panel-consistency gate both depend on is backed by the configurable
artifact storage adapter. **Production and Preview both require S3.**

| Variable                             | Required for         | Notes                                                          |
| ------------------------------------ | -------------------- | -------------------------------------------------------------- |
| `ARTIFACT_STORAGE_PROVIDER`          | Production + Preview | Must be `s3`. Default fallback is in-memory (not durable).     |
| `ARTIFACT_STORAGE_BUCKET`            | Production + Preview | S3 bucket name that holds the prebaked artifact zips + blobs.  |
| `ARTIFACT_STORAGE_REGION`            | Production + Preview | e.g. `eu-west-2`. Defaults to `us-east-1` when unset.          |
| `ARTIFACT_STORAGE_ACCESS_KEY_ID`     | Production + Preview | IAM access key.                                                |
| `ARTIFACT_STORAGE_SECRET_ACCESS_KEY` | Production + Preview | IAM secret. NEVER commit; manage via Vercel CLI / dashboard.   |
| `ARTIFACT_STORAGE_SESSION_TOKEN`     | Optional             | Required only if the IAM principal uses temporary creds (STS). |
| `ARTIFACT_STORAGE_ENDPOINT`          | Optional             | Override for S3-compatible providers (R2, MinIO, etc.).        |
| `ARTIFACT_STORAGE_PUBLIC_BASE_URL`   | Optional             | Public download base; falls back to S3 host.                   |
| `ARTIFACT_PACKAGE_SIGNING_SECRET`    | Optional             | HMAC secret for signed-URL artifact-package downloads.         |

> **Memory + filesystem adapters are dev / same-instance only.** Both
> `provider=memory` (default) and `provider=filesystem` (with `rootDir`
> set) work on a single warm Vercel function but are NOT durable across
> cold starts. The slice handler logs an explicit warning and refuses
> to advertise `svgArtifactRef.available: true` for these adapters
> (`src/services/project/projectGraphVerticalSliceService.js`).

---

## 2. Setting Vercel env vars

### Production (CLI)

```sh
vercel env add ARTIFACT_STORAGE_PROVIDER production
# → enter: s3
vercel env add ARTIFACT_STORAGE_BUCKET production
vercel env add ARTIFACT_STORAGE_REGION production
vercel env add ARTIFACT_STORAGE_ACCESS_KEY_ID production
vercel env add ARTIFACT_STORAGE_SECRET_ACCESS_KEY production
```

### Preview (CLI)

```sh
vercel env add ARTIFACT_STORAGE_PROVIDER preview
# (repeat for each key)
```

Or via the dashboard: Project → Settings → Environment Variables. Set
the Environment scope to **Production** and **Preview** (separately, or
both) for each key.

### `.env` for local dev

Add the eight keys to `.env` (gitignored). The repo's `scripts/check-env.cjs`
contract does NOT yet enforce these — they're additive over the existing
contract. The export route + slice handler tolerate their absence in
dev because the in-memory / filesystem adapters take over silently and
the workflow falls back to `svgOutputFile` / inline data URLs.

---

## 3. Token + key rotation

After landing this work:

1. **Revoke or shorten the PAT** used to write Preview env vars via the
   Vercel REST API (issued at <https://vercel.com/account/tokens>).
   Long-lived PATs are not required after the env keys are stored.
2. **Rotate AWS access keys** in IAM if any access key/secret was ever
   pasted into a shared transcript or chat tool. Replace the four
   `ARTIFACT_STORAGE_*` keys in Vercel after rotation.
3. **Audit IAM scope**: the smoke + production paths only need
   `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, and optionally
   `s3:ListBucket` (for the artifact-history listing endpoint).
   Tighten the IAM policy to the single bucket.

---

## 4. Promote + smoke-test order

```
1. Merge PR into main (or your release branch).
2. Wait for Vercel Preview deployment to build + finish.
3. Run smoke against the Preview URL:
     npm run smoke:production-readiness
     npm run smoke:production-readiness -- --mode real
   (--mode real enforces the S3 env contract + provider preflight.)
4. Manually exercise Generate → Export PNG, PDF, SVG against Preview:
     a. Project must generate end-to-end.
     b. Each format downloads + opens cleanly.
     c. DevTools Network: POST body to /api/a1/export ≤ 256 KB,
        response Content-Type matches the format, X-A1-Export-Builder
        header recorded.
     d. On a deliberately QA-failed generation (force a title-overlap
        or text-size violation), PNG/PDF/SVG rows render the red
        "A1 export blocked …" banner and clicking throws the same
        message from exportService.
     e. Generate → Reload from history → confirm DXF/IFC/JSON/XLSX
        engineering rows show the "Regenerate required — compiled
        project was not persisted in history" inline reason.
5. Promote Preview → Production via the Vercel dashboard / CLI once
   the smoke is green and the export matrix above passes manually.
6. Re-run the same export matrix against Production immediately after
   promotion to confirm the production env vars were picked up.
```

> **Existing deployments do NOT auto-pick up new env vars.** A redeploy
> (Preview or Production) is required only if you want to switch the
> bucket immediately on a pre-existing build. New deploys after the
> env vars are saved will inherit them automatically.

---

## 5. Quick reference — what gates what

| Surface                          | Phase | Gate / contract                                                                                    |
| -------------------------------- | ----- | -------------------------------------------------------------------------------------------------- |
| `/api/a1/export`                 | 1     | 256 KB body cap, magic-byte classification, inline-SVG denylist, path traversal guard.             |
| `exportService.exportSheet`      | 1, 3  | Compact-reference body; refuses sheet exports when `sheet.a1ExportQa.status === "blocked"`.        |
| `useArchitectAIWorkflow` result  | 2, 3  | Attaches `compiledProject`, `projectQuantityTakeoff`, `exportManifest`, `a1ExportQa` top-level.    |
| `designHistoryRepository` save   | 2     | Persists `exportManifest` + `compiledProjectExportSummary` (~80 B) — not the full compiledProject. |
| `designHistoryResultHydrator`    | 2     | Restores manifest; rebuilds from summary when persisted manifest absent.                           |
| `ExportPanel`                    | 2, 3  | Inline blocked reasons; restored-history gate; A1 QA banner; sheet-format helpers.                 |
| `composeCore` + `resolveLayout`  | 3     | `A1_CONTENT_TOP_MM = 16` safe band; presentation-v3 floor plans respect it for floorCount 1/2/3.   |
| `a1FinalExportContract`          | 3, 4  | `evaluateFinalA1ExportGate` folds panel-consistency + cross-view + visual manifest evidence.       |
| `panelGeometryConsistencyChecks` | 4     | 2D/3D geometry hash, visual manifest hash, palette, floor count, roof, entrance, openings.         |
| Storage adapter                  | 1, 4  | `getArtifactStorageAdapterStatus` reports `productionDurable: true` only for S3.                   |

---

## 6. Known caveats

- `composeCoreTechnicalFirstLayout.test.js` line 104 (`thresholdSquarePlan toBe(0.58)`) is a pre-existing failure that pre-dates Phase 3. Phase 3 does not touch `getDefaultMinSlotOccupancy`; this isn't a regression. Flagged for separate cleanup.
- Pre-existing `check:env` failures from `OPENAI_*` / `STEP_*` / model env vars are environmental — `.env` is gitignored. They don't affect Phase 1–4 functionality.
- Vector PDF builder failures fall back to raster; logged via `X-A1-Export-Builder: raster_pdf_fallback`. If the SVG is below the final-A1 density gate, the route returns 422 `FINAL_A1_RASTER_TOO_SMALL` rather than a preview-density PDF.

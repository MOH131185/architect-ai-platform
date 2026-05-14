# Production runbook — architect-ai-platform

This runbook covers the operational scenarios that are most likely to page someone. Each entry has: **Symptom**, **Diagnose**, **Action**, **Verify**.

For env-variable definitions and the pre-deploy checklist, see [`docs/deployment/production-env.md`](../deployment/production-env.md).

## Quick links

- Provider health: `GET /api/admin/provider-health` (header `x-admin-token: $ADMIN_HEALTH_TOKEN`)
- Generation jobs: `GET /api/generation-jobs` (filter by projectId/userId)
- Artifact history: `GET /api/project/export/artifact-package/history?projectId=...`
- Vercel deployments: `vercel ls` then `vercel logs <deployment-url>`

---

## 1. OpenAI 429 / rate-limit storm

**Symptom**: `/api/generation-jobs` shows multiple jobs failing with `errorCode: STRICT_IMAGE2_FAIL_CLOSED` or `RATE_LIMITED`. Provider-health endpoint reports `degraded` for `openai-images`.

**Diagnose**:

```bash
curl -H "x-admin-token: $ADMIN_HEALTH_TOKEN" \
  https://<host>/api/admin/provider-health | jq '.providers.openaiImages'
```

Look for `lastError` containing `429` and `Retry-After` headers. Check `OPENAI_IMAGE_CONCURRENCY` env — if requests are arriving faster than the OpenAI account tier allows, the per-process semaphore is correctly throttling but the per-account quota is the bottleneck.

**Action**:

1. Lower `OPENAI_IMAGE_CONCURRENCY` (e.g. 4 → 2) to reduce burst rate. Redeploy.
2. If burst is one-time (queued backlog from an outage), do nothing — `retryWithBackoff` honours `Retry-After` automatically and the backlog drains.
3. If sustained, raise the OpenAI account tier OR cap `MAX_GLOBAL_ACTIVE_JOBS` so users see `GLOBAL_CAPACITY_FULL` immediately instead of jobs failing mid-run.

**DO NOT** weaken `STRICT_IMAGE2_FAIL_CLOSED`. That gate exists so authority artifacts are never image-generated when the model is unavailable. A 429 must be a fail, not a fallback to a fake render.

**Verify**:

- New jobs succeed.
- Provider-health rolls back to `ok`.
- No `sourceGap: STRICT_IMAGE2_FAIL_CLOSED` entries on subsequent packages.

---

## 2. OpenAI key rotation

**Symptom**: scheduled key rotation, or compromised key.

**Action**:

1. Generate the replacement key in the OpenAI dashboard (project-scoped).
2. In Vercel: Project Settings → Environment Variables → update `OPENAI_API_KEY` (or `OPENAI_REASONING_API_KEY` / `OPENAI_IMAGES_API_KEY` if you use the split variant). Mark for `Production` only.
3. Trigger a redeploy: `vercel deploy --prod` or push a no-op commit.
4. Once the new deploy is live and `provider-health` reports `ok`, revoke the old key in the OpenAI dashboard.

**DO NOT**:

- Set `REACT_APP_OPENAI_API_KEY`. Webpack inlines it into the bundle. `npm run check:env` (with `NODE_ENV=production`) rejects this; it is fatal by design.
- Commit keys to the repo — they live in Vercel's encrypted env panel.

**Verify**:

```bash
curl -H "x-admin-token: $ADMIN_HEALTH_TOKEN" \
  https://<host>/api/admin/provider-health | jq '.providers.openaiReasoning.status'
# expect: "ok"
```

The `keySource` field reports the env-name only (e.g. `OPENAI_REASONING_API_KEY`), never the value.

---

## 3. Storage adapter unreachable / S3 outage

**Symptom**: `/api/project/export/artifact-package/store` returns 500 / 503; provider-health reports `unavailable` for `artifactStorage`. Users see "Save Package failed" in the wizard.

**Diagnose**:

- Adapter type: check `ARTIFACT_STORAGE_PROVIDER` (`memory` / `filesystem` / `s3`).
- For S3: verify region, bucket, AWS credentials. Try a one-off:
  ```bash
  aws s3 ls "s3://$ARTIFACT_STORAGE_BUCKET" --region "$ARTIFACT_STORAGE_REGION"
  ```
- For filesystem: confirm `ARTIFACT_STORAGE_DIR` exists and is writable on the function instance (note: in serverless, only `/tmp` is writable; for persistence use S3).

**Action**:

1. **Short-term**: switch `ARTIFACT_STORAGE_PROVIDER=memory`. Save Package will work but packages are lost on function-instance recycle. Acceptable for an hour or two.
2. **Recovery**: once S3 is back, switch the provider env back to `s3` and redeploy.
3. **DO NOT** start a backfill / migration without validating the new adapter accepts writes (`putArtifactPackage`) and reads (`getArtifactPackage`) for the same packageId.

**Verify**:

- Save Package returns `200` with `packageId`.
- `GET /api/project/export/artifact-package/history?projectId=...` lists the new entry.
- `GET /api/project/export/artifact-package/<packageId>/download` returns the same bytes that the wizard generated.

---

## 4. Artifact retention / cleanup

**Symptom**: Storage cost growing. History shows packages older than the retention window (`ARTIFACT_PACKAGE_RETENTION_DAYS`, default per-adapter).

**Action**:

- The in-memory adapter has no automatic eviction — it relies on function-instance recycle. If running long-lived, restart the deployment.
- The S3 adapter relies on S3 lifecycle rules. Configure the bucket lifecycle to match `ARTIFACT_PACKAGE_RETENTION_DAYS` (e.g. expire objects under `artifact-packages/` prefix after N days).
- The filesystem adapter does not auto-clean. Run a cron / cleanup job that deletes files older than the retention window from `ARTIFACT_STORAGE_DIR`.

**DO NOT** manually `rm` from `ARTIFACT_STORAGE_DIR` while a deploy is live — concurrent reads will see `ARTIFACT_STORAGE_NOT_FOUND` mid-download. Stop traffic first or rotate the storage prefix.

**Verify**:

- Storage size stops growing.
- History API still serves recent packages.

---

## 5. Disabling image-2 safely (degraded mode)

**Symptom**: OpenAI image-edit access is broken or revoked for the production key. Reasoning still works.

**Action**:

1. Set `OPENAI_STRICT_IMAGE_GEN=true` (already the production default). This forces image-edit failures to fail closed instead of falling back to a placeholder.
2. Generated packages will now include `sourceGap: STRICT_IMAGE2_FAIL_CLOSED` entries on the visual panels. The A1 sheet still ships with the deterministic SVG drawings (geometry authority), just without the visual mood panels.
3. Communicate to users: technical drawings, schedules, and 3D model are unaffected — only the generative visual panels are temporarily unavailable.

**DO NOT**:

- Set `OPENAI_STRICT_IMAGE_GEN=false` to "make the panels work again" — that re-enables the placeholder fallback path which is not authoritative.
- Route technical drawings through any image model. Plans / elevations / sections / details are deterministic SVG only.

**Verify**:

- New packages succeed (no longer 500-ing on visual panel errors).
- Manifest `sourceGaps` lists the missing visual panels by name.

---

## 6. Recovering failed generation jobs

**Symptom**: Jobs in `FAILED` status piling up.

**Diagnose**:

```bash
curl https://<host>/api/generation-jobs | \
  jq '.jobs[] | select(.status == "FAILED") | {jobId, errorCode, errorMessage, projectId}'
```

Common error codes:

| Code                        | Meaning                                                                          |
| --------------------------- | -------------------------------------------------------------------------------- |
| `STRICT_IMAGE2_FAIL_CLOSED` | Image edit unavailable; see runbook entry 5                                      |
| `RATE_LIMITED`              | OpenAI 429; should auto-retry — if persistent, see entry 1                       |
| `USER_QUOTA_EXCEEDED`       | User has too many active jobs; not a bug. They wait, then re-submit.             |
| `GLOBAL_CAPACITY_FULL`      | Whole platform is at the cap (`MAX_GLOBAL_ACTIVE_JOBS`); raise the env if needed |
| `JURISDICTION_PACK_MISSING` | Brief pointed at a jurisdiction we don't have a pack for; not retryable          |
| `WORKER_ERROR`              | Unexpected throw in the slice; check the message + Vercel function logs          |
| `JOB_CANCELLED`             | User cancelled; not a failure                                                    |

**Action**:

1. Bulk failure caused by upstream provider issue (entry 1 or 5): users re-submit after the underlying issue is resolved. The job records do not auto-retry.
2. Single user jobs failing repeatedly: `GET /api/generation-jobs/<jobId>` for the manifest summary, then `vercel logs --since 1h` and grep for the jobId.
3. **DO NOT** retry by mutating the job record directly. The user should re-submit through the wizard so a fresh `inputHash` is computed.

**Verify**:

- New job for the same brief reaches `SUCCEEDED`.
- The matching artifact package shows up in history.

---

## 7. Load testing pre-release

Before raising tier limits or expecting a usage spike:

```bash
# Mock-mode (CI-safe; no real provider calls)
node scripts/load/artifact-package-load-test.mjs --users 100 --report ./load-pkg.json
node scripts/load/generation-job-load-test.mjs --users 50 --report ./load-jobs.json
```

Both write a JSON report. Look at `latencyMs.p95` and `responses.failed` / `jobs.failed`. The generation-job test uses a synthetic worker (50–250ms work) — production latency will be 30–90s real, but the **shape** of the queue (no jobs stuck, no error code surprises) is what the load test verifies.

For real-provider load testing, set the appropriate env keys and ensure you understand the cost. The default scripts do NOT call real providers.

---

## 8. Rolling back a bad deploy

```bash
# 1. Find the bad deploy
vercel ls

# 2. Promote the previous good deploy
vercel rollback <previous-deployment-url>

# Alternative: revert the commit on main
git revert <bad-commit-sha> --no-edit
git push origin main
# Vercel auto-deploys the revert.
```

Each PR is squash-merged so a revert is a single, surgical commit.

**DO NOT** `git push --force` to main. Branch protection should prevent this anyway, but never circumvent it.

**Verify**:

- `provider-health` reports `ok`.
- A test generation job succeeds end-to-end.
- Save Package + history work.

---

## 9. Branch protection / merge gate

A PR is safe to merge only when ALL pass:

1. Focused tests for the change: green.
2. `npm run lint`: clean.
3. `npm run check:env`: pass (production-strict for production envs).
4. `npm run check:contracts`: pass.
5. `npm run build:active`: pass.
6. GitHub `active-path`, `Vercel`, `Vercel Preview Comments` checks all pass.
7. Local blocker audit: no secrets in diff, no fake DWG/IFC outputs, no image-generated technical drawings, ProjectGraph / A1 / CAD authority gates untouched.

If any gate fails: fix in the same PR if small; otherwise stop and report.

---

## 10. What NOT to do

- Do not move OpenAI calls client-side via `REACT_APP_OPENAI_API_KEY`. The bundled JS leaks.
- Do not route technical drawings (plans / elevations / sections / details) through any image model. They are deterministic SVG by contract.
- Do not re-enable fake DWG / IFC outputs. Missing converter → manifest `sourceGap`, period.
- Do not raise body-parser limits to "fix" Save Package — PR #119–#125 made that path use compact refs (~134 bytes). If you see Save Package POSTs >2 KB hitting `/store`, the wizard isn't sending the prebake reference; fix the wizard, not the limit.
- Do not bypass branch protection. The merge gate exists because the production gates exist.

# Production environment configuration

This document is the source of truth for environment variables required to deploy the architect-ai-platform to production. The `npm run check:env` script validates the same surface — if it passes locally with `NODE_ENV=production`, the deployment env is well-formed.

## Quick start

```bash
# 1. Copy the template
cp .env.example .env.production

# 2. Fill in REQUIRED secrets (see table below)

# 3. Validate before deploy
NODE_ENV=production npm run check:env
```

If `check:env` exits non-zero, fix the reported errors before deploying. Production-strict errors are fatal because the bug they prevent (e.g. leaking the OpenAI key into the bundled JS) is unrecoverable once shipped.

## Required server-side keys

| Variable                      | Purpose                                                   | Notes                                                                |
| ----------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| `OPENAI_API_KEY`              | Generic fallback for reasoning + image clients            | Required if neither split key below is set.                          |
| `OPENAI_REASONING_API_KEY`    | Reasoning models (slice, programme compile, A1 stitching) | Preferred over `OPENAI_API_KEY` for split-billing setups.            |
| `OPENAI_IMAGES_API_KEY`       | Image edit (`gpt-image-2`) calls                          | Same key as reasoning is fine if your account has both entitlements. |
| `OPENAI_REASONING_MODEL`      | Reasoning model id                                        | Defaults to `gpt-5.4`.                                               |
| `OPENAI_IMAGE_MODEL`          | Image edit model id                                       | Defaults to `gpt-image-2`. Health check probes model entitlement.    |
| `STEP_07_PROJECT_GRAPH_MODEL` | ProjectGraph reasoning model override                     | Optional; falls back to `OPENAI_REASONING_MODEL`.                    |
| `STEP_08_2D_LABEL_MODEL`      | 2D drawing label model                                    | Optional.                                                            |
| `STEP_09_3D_QA_MODEL`         | 3D QA reasoning model                                     | Optional.                                                            |
| `STEP_12_A1_SHEET_MODEL`      | A1 sheet stitching model                                  | Optional.                                                            |
| `STEP_13_QA_MODEL`            | Final QA model                                            | Optional.                                                            |

## Forbidden in production

| Variable                                      | Reason                                                                                                                                                                                                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REACT_APP_OPENAI_API_KEY`                    | **Fatal**. Any `REACT_APP_*` env is inlined into the React bundle by webpack, so this key would ship to every browser. The OpenAI proxy is server-only — clients call `/api/openai-reasoning`, never OpenAI directly. `check:env` rejects this in production. |
| `REACT_APP_USE_TOGETHER=true` (in production) | Re-enables the legacy Together AI provider that returns 409 in production by design. Use `false` or unset.                                                                                                                                                    |

## Storage (artifact packages)

| Variable                          | Required when            | Default                          |
| --------------------------------- | ------------------------ | -------------------------------- |
| `ARTIFACT_STORAGE_PROVIDER`       | always (recommended)     | `memory`                         |
| `ARTIFACT_STORAGE_DIR`            | provider=`filesystem`    | —                                |
| `ARTIFACT_STORAGE_BUCKET`         | provider=`s3`            | —                                |
| `ARTIFACT_STORAGE_REGION`         | provider=`s3`            | —                                |
| `AWS_ACCESS_KEY_ID`               | provider=`s3`            | —                                |
| `AWS_SECRET_ACCESS_KEY`           | provider=`s3`            | —                                |
| `ARTIFACT_PACKAGE_SIGNING_SECRET` | optional but recommended | unset → direct download fallback |
| `ARTIFACT_PACKAGE_RETENTION_DAYS` | optional                 | adapter default                  |
| `ARTIFACT_SIGNED_URL_TTL_SECONDS` | optional                 | 900 (15 minutes)                 |

> **Renamed since Phase 5**: `ARTIFACT_STORAGE_BUCKET` / `ARTIFACT_STORAGE_REGION` replaced the older `ARTIFACT_STORAGE_S3_BUCKET` / `ARTIFACT_STORAGE_S3_REGION` names. The runtime S3 adapter reads only the new names (see [src/services/export/artifactStorageService.js](../../src/services/export/artifactStorageService.js)). If you predate Phase 5, update Vercel env before the next deploy.

**Recommended for production**: `ARTIFACT_STORAGE_PROVIDER=s3` + signing secret + 30-day retention. The in-memory adapter loses all packages on function-instance recycle.

## Generation queue + concurrency (Phases B + C)

All optional. Defaults work for a single Vercel function instance with moderate OpenAI quota. Raise for higher tiers, lower for tight budgets.

| Variable                        | Default | Purpose                                                          |
| ------------------------------- | ------- | ---------------------------------------------------------------- |
| `GENERATION_WORKER_CONCURRENCY` | 4       | Per-process slice runs in flight at once                         |
| `OPENAI_IMAGE_CONCURRENCY`      | 4       | Per-process image-edit calls in flight                           |
| `OPENAI_REASONING_CONCURRENCY`  | 8       | Per-process reasoning calls in flight                            |
| `MAX_ACTIVE_JOBS_PER_USER`      | 3       | Per-user active job cap; blocks 4th with `USER_QUOTA_EXCEEDED`   |
| `MAX_GLOBAL_ACTIVE_JOBS`        | 50      | Global active job cap; blocks excess with `GLOBAL_CAPACITY_FULL` |

`check:env` validates that any value set parses to a positive integer.

## Admin endpoint (Phase D)

| Variable             | Required when | Notes                                                                                                                      |
| -------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ADMIN_HEALTH_TOKEN` | production    | Enables `GET /api/admin/provider-health`. Without it, the endpoint returns 503 in production. Required for ops dashboards. |

## Other / optional

| Variable                              | Purpose                                                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `CONTEXT_PROVIDERS_ENABLED`           | UK context aggregator. `true`/`false`/unset (auto-on in production).                                                        |
| `ARTIFACT_ACCESS_CONTROL_STRICT=true` | Force strict access policy regardless of NODE_ENV / storage provider.                                                       |
| `DWG_CONVERTER_URL` / `LIBREDWG_PATH` | DWG converter location. Without these, DWG output is reported as a `sourceGap` in the manifest (no fake DWG ever produced). |
| `IFC_ENGINE_URL` / `IFC_OPENBIM_PATH` | IFC engine location. Same posture — `sourceGap` if absent.                                                                  |

## Staging vs production keys

Use **separate OpenAI keys** for staging and production:

- Staging: low-quota project-scoped key. Used by preview deploys + `check:env` smoke runs.
- Production: full-quota key. Never used outside the production Vercel env.

Rotate at least quarterly. The OpenAI proxy logs `keySource` (header name only, never the value) so audits can trace which key was active without exposing it.

## Pre-deploy checklist

```bash
# 1. Validate env
NODE_ENV=production npm run check:env

# 2. Run the focused test suite (any failure blocks deploy)
npm run test:ci

# 3. Build a production bundle locally
npm run build:active

# 4. Trigger preview deploy (Vercel)
git push origin <branch>
# Vercel auto-deploys; check the preview URL.

# 5. Verify the admin health endpoint on the preview
curl -H "X-Admin-Token: <staging-token>" \
  https://<preview-url>/api/admin/provider-health
# Expect status: ok or degraded with no `unavailable`.

# 6. Promote the preview to production
vercel promote <preview-url>
```

## Rollback plan

Each squash-merged PR is a single commit on `main`. To revert:

```bash
git revert <bad-commit-sha> --no-edit
git push origin main
# Vercel auto-deploys the revert.
```

Production secrets are stored in Vercel's encrypted env panel (project settings → environment variables). They are not in this repo.

## What NOT to do

- Do not move OpenAI calls client-side via `REACT_APP_OPENAI_API_KEY`. The bundled JS leaks.
- Do not set `PIPELINE_MODE=multi_panel` in production unless you explicitly want the legacy Together AI path. Use `project_graph` (default).
- Do not commit `.env`, `.env.production`, or `.claude/settings.local.json`.
- Do not bypass the admin token gate by setting `NODE_ENV=development` on a production deployment.
- Do not raise body-parser limits to "fix" Save Package — PR #119–#125 made that path use compact refs (~134 bytes). If you see Save Package POSTs >2 KB hitting `/store`, the wizard isn't sending the prebake reference.

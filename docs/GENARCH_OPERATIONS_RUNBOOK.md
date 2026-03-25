# Genarch Operations Runbook

This runbook covers the supported genarch production surface in this repository.

## Supported Surface

- `genarch` is a separate backend deployment boundary.
- The supported access path is `browser -> Vercel/Express proxy -> genarch backend`.
- `GENARCH_API_KEY` must stay server-side only.
- There is no supported browser genarch UI flow in the current React app.
- `src/_legacy/genarchPipelineService.js` is a dormant prototype, not a supported product path.

## Contract Signals

- Source of truth: `src/contracts/genarch-api-v1.json`
- Frontend/server adapters:
  - `src/services/genarch/genarchContract.js`
  - `server/genarch/genarchContract.cjs`
- Response field: `contractVersion`
- Header: `X-Genarch-Contract-Version`

## Health Checks

Check both health surfaces after deploy:

```bash
curl -s https://your-app.vercel.app/api/health
curl -i https://your-app.vercel.app/api/genarch/jobs
```

Expected signals:

- `/api/health` includes `contracts.genarchApi`
- `/api/health` includes `productSurface.genarchApi=backend-only`
- `/api/health` includes `productSurface.genarchFrontend=dormant-legacy`
- `/api/genarch/*` responses include `X-Genarch-Contract-Version`

## Canonical Validation

Run these checks before promoting a genarch-related change:

```bash
npm run check:genarch-contracts
npm run check:contracts
npm run build:active
```

For backend-only contract validation, also verify:

```bash
node --check server.cjs
```

## Auth Rotation

- Rotate `GENARCH_API_KEY` on the backend host and in Vercel server-side env vars together.
- Do not place the key in any `REACT_APP_*` variable.
- After rotation, verify:
  - `/api/health`
  - `POST /api/genarch/jobs`
  - artifact download through `/api/genarch/runs/...`

## Artifact and Retention Notes

- Genarch artifacts are served from the backend deployment, not generated in the browser.
- Keep retention and cleanup policies on the backend host aligned with storage capacity.
- Confirm old runs are pruned by the backend cleanup job before increasing retention windows.

## Troubleshooting

### `401 Unauthorized`

- Check `GENARCH_API_KEY` matches between the backend host and Vercel server-side env vars.
- Confirm requests are going through the proxy, not a browser-exposed direct client.

### `503 RUNPOD_NOT_CONFIGURED`

- Check `RUNPOD_GENARCH_URL` is configured in Vercel.
- Check the backend service is reachable and healthy.

### Contract drift

- Run `npm run check:genarch-contracts`.
- Verify `genarch/docs/GENARCH_API.md` still matches the shared contract.
- Verify proxy responses still forward `X-Genarch-Contract-Version`.

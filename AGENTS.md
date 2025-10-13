# Repository Guidelines

Concise guide for contributors to the Architect AI Platform. Follow the structure and commands below to stay consistent and productive.

## Project Structure & Module Organization
- `src/`: React app (components, services, utils, styles). Example: `src/components/AIMVP.js`, `src/services/openaiService.js`, `src/utils/logger.js`.
- `api/`: Vercel serverless endpoints (e.g., `api/openai-chat.js`, `api/replicate-predictions.js`).
- `server.js`: Local Express proxy for OpenAI/Replicate to avoid CORS during development.
- `public/`: Static assets for CRA.
- Config: `tailwind.config.js`, `postcss.config.js`.
- Env: `.env.example`, `env.template` (copy to `.env`). Never commit secrets.

## Architecture Overview
- Client (SPA): React (CRA) under `src/`. UI components (e.g., `src/components/AIMVP.js`) call domain services in `src/services/*` (OpenAI, Replicate, maps, weather). Utilities in `src/utils/*` centralize logging and validation.
- API Gateway:
  - Development: `server.js` (Express) proxies `/api/openai/*` and `/api/replicate/*` to vendors; avoids CORS and hides keys.
  - Production: Vercel serverless functions in `api/` (e.g., `api/openai-chat.js`, `api/replicate-predictions.js`, `api/health.js`). CORS is restricted to known origins.
- Data Flow: Component -> service (`src/services/...`) -> proxy/API (`server.js` or `api/*`) -> external providers (OpenAI/Replicate/Google/Weather) -> response -> state/UI.
- Config: `.env` supplies `REACT_APP_*` vars for the client; Vercel uses `OPENAI_API_KEY` / `REPLICATE_API_TOKEN` on the server side.

## Build, Test, and Development Commands
- `npm install`: Install dependencies.
- `npm run dev`: Run proxy (`server.js`) and CRA dev server together.
- `npm start`: Start React dev server only (port 3000).
- `npm run server`: Start API proxy only (port 3001).
- `npm run build`: Production build to `build/`.
- `npm test`: Jest runner (via react-scripts). Add `-- --coverage` for coverage.

## Coding Style & Naming Conventions
- JavaScript/React with 2-space indentation; ESLint extends `react-app`.
- Components: PascalCase (`ArchitectAIEnhanced.js`). Utilities/services: camelCase file names; constants in `UPPER_SNAKE_CASE`.
- Prefer function components + hooks; keep side-effects in services under `src/services/` (e.g., `replicateService.js`).
- Use `src/utils/logger.js` (or `productionLogger`) instead of raw `console.*`, especially in production.

## Testing Guidelines
- Framework: Jest + React Testing Library (via `react-scripts`).
- Location: Place tests near code as `*.test.js` (e.g., `src/components/AIMVP.test.js`).
- Run: `npm test` (watch mode) or `npm test -- --watchAll=false` in CI. Aim to cover critical services and UI flows.

## Commit & Pull Request Guidelines
- Commits: Follow Conventional Commits (e.g., `feat: ...`, `fix: ...`, `docs: ...`, `perf: ...`, `chore: ...`). Use imperative, concise subjects.
- PRs: Include clear description, linked issues, screenshots/GIFs for UI changes, and note env/config changes. Ensure `npm run build` passes and tests are green.

## Security & Configuration Tips
- Required envs: `REACT_APP_OPENAI_API_KEY`, `REACT_APP_REPLICATE_API_KEY`, `REACT_APP_GOOGLE_MAPS_API_KEY`, `REACT_APP_OPENWEATHER_API_KEY`. On Vercel, use `OPENAI_API_KEY` and `REPLICATE_API_TOKEN`.
- Verify setup via `GET /api/health` (local proxy) or `api/health` (Vercel). Avoid logging secrets and never commit `.env`.

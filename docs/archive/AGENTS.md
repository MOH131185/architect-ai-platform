# Repository Guidelines

## Project Structure & Module Organization
- `src/`: React app code.
  - `components/` (UI, PascalCase), `services/` (business logic, camelCase), `config/`, `hooks/`, `utils/`, `styles/`, `types/`.
  - Entry: `src/index.js` → `src/App.js` → `src/ArchitectAIEnhanced.js`.
- `server.js`: Express API proxy (Together.ai primary; OpenAI fallback) running on `:3001`.
- `scripts/`: Validation utilities (`check-env.js`, `check-contracts.js`).
- `tests/`: Jest tests (e.g., `api.test.js`). Root-level `test-*.js` are ad‑hoc smoke/e2e scripts runnable with Node.
- `public/`: Static assets.

## Build, Test, and Development Commands
- `npm run dev`: Run React app and API proxy together (ports 3000/3001).
- `npm start`: React dev server only.
- `npm run server`: Express proxy only.
- `npm run build`: Production build (CRA).
- `npm test`: Jest runner (interactive). For CI parity: `npm test -- --watchAll=false --coverage`.
- `node test-*.js`: Run ad‑hoc smoke tests (e.g., `node test-a1-only-generation.js`).
- `npm run check:env` / `check:contracts` / `check:all`: Environment and contract checks (run before build).

## Coding Style & Naming Conventions
- Language: JavaScript (ES2020+) with CRA; selective `.ts` utilities.
- Indentation: 2 spaces; semicolons; single quotes.
- Components: PascalCase (`A1SheetViewer.jsx`); services/utils: camelCase (`togetherAIService.js`).
- Linting: CRA’s built‑in ESLint (`react-app`). Follow existing patterns; avoid introducing new TypeScript without need.

## Testing Guidelines
- Framework: Jest via `react-scripts`.
- Location: place unit tests as `*.test.js` (e.g., `tests/api.test.js`).
- Smoke/E2E: run root `test-*.js` scripts with Node.
- Coverage: `npm test -- --coverage`; prioritize core services (`services/`) and API client logic. Mock network calls.

## Commit & Pull Request Guidelines
- Commits: Conventional Commits (e.g., `feat: ...`, `fix: ...`, `docs: ...`, `test: ...`; optional scopes like `feat(M7-M8): ...`).
- PRs: concise description, linked issues, screenshots for UI changes, updated docs, and passing CI (env/contract checks, tests, build).
- Keep changes scoped; include reproduction steps for bug fixes.

## Security & Configuration Tips
- Never commit secrets. Copy `.env.example` → `.env` and fill required keys: `TOGETHER_API_KEY`, `REACT_APP_GOOGLE_MAPS_API_KEY`, `REACT_APP_OPENWEATHER_API_KEY`.
- Optional: `ALLOWED_ORIGINS`, `REACT_APP_API_PROXY_URL`.
- Use server routes (`/api/together/chat`, `/api/together/image`, `/api/proxy/image`)—do not call third‑party APIs directly from the client.

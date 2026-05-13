# Frontend bundle plan

## Goal

Shrink the JavaScript downloaded on first paint of the landing page, without
changing product behaviour, generation logic, authority gates, or artifact
determinism (per [CLAUDE.md](../../CLAUDE.md) and the original PR brief).

Two techniques only, no bundler config changes (Create React App 5 / plain
`react-scripts`):

1. **`React.lazy` + `<Suspense>`** for wizard step components and full-page
   modal views.
2. **Dynamic `import()` at call site** for heavy third-party libraries that
   are only needed inside `async` service functions.

## Baseline (before this PR)

Production build with source maps. Measured via the new `npm run analyze`
script (`source-map-explorer`).

| Chunk                                |     Raw |        Gzip |
| ------------------------------------ | ------: | ----------: |
| `main.js` (initial bundle)           | 3.85 MB | **1.05 MB** |
| `238.chunk.js` (xlsx, lazy)          |  418 KB |      138 KB |
| `762.chunk.js` (lazy)                |  347 KB |      111 KB |
| `228.chunk.js` (lazy)                |  176 KB |       49 KB |
| `435.chunk.js` (three.core.js, lazy) |  182 KB |       48 KB |
| `239.chunk.js` (html2canvas, lazy)   |  203 KB |       46 KB |
| `455.chunk.js` (lazy)                |  138 KB |       43 KB |

CRA flagged the initial bundle as "significantly larger than recommended"
(~244 KB gzip target). Top groups inside `main.js`:

|    KB raw | % main.js | Group                                    |
| --------: | --------: | ---------------------------------------- |
|     416.6 |     10.8% | `lucide-react`                           |
| **415.3** | **10.8%** | **`pdfjs-dist`** (via `pdfToImages.js`)  |
|     126.7 |      3.3% | `react-dom`                              |
|      98.4 |      2.6% | `motion-dom` (framer-motion)             |
|      88.2 |      2.3% | `@clerk/clerk-react`                     |
|      70.8 |      1.8% | `services/dnaWorkflowOrchestrator.js`    |
|      67.5 |      1.8% | `services/drawing/svgSectionRenderer.js` |
|      62.5 |      1.6% | `crypto-js`                              |

## Changes shipped

### Wizard step lazy-loading

Static imports → `React.lazy` in
[ArchitectAIWizardContainer.jsx](../../src/components/ArchitectAIWizardContainer.jsx):

- `LocationStep`, `IntelligenceStep`, `PortfolioStep`, `SpecsStep`,
  `GenerateStep`, `ResultsStep`, `PricingPage`.
- `LandingPage` and `DesignHistoryMenu` stay eager (rendered on first paint).
- Each step gets a stable `webpackChunkName` (`step-location`, etc.).
- `renderStep()` now wraps its content in a single `<Suspense>` with the new
  [StepLoadingSkeleton](../../src/components/StepLoadingSkeleton.jsx) as the
  fallback; the case-6 inner Suspense is gone (one boundary covers every
  lazy case).
- `PricingPage` render site has its own `<Suspense>`.
- On `currentStep === 0` the container schedules a `requestIdleCallback`
  prefetch of `step-location` (with a 1.5 s `setTimeout` fallback) so the
  click-to-step-1 transition feels instant on warm networks.

### Heavy library imports → dynamic `import()` at call site

Each file moves the heavy `import` out of the module top level and into a
cached async loader called from the `async` function that needs it. The
public function signatures are unchanged; only load timing shifts.

| Library       | File                                                                                                         | New chunk name |
| ------------- | ------------------------------------------------------------------------------------------------------------ | -------------- |
| `pdfjs-dist`  | [src/utils/pdfToImages.js](../../src/utils/pdfToImages.js)                                                   | `pdfjs-dist`   |
| `html2canvas` | [src/services/siteMapCapture.js](../../src/services/siteMapCapture.js)                                       | `html2canvas`  |
| `pdf-lib`     | [src/services/a1/composeRuntime.js](../../src/services/a1/composeRuntime.js)                                 | `pdf-lib`      |
| `pdf-lib`     | [src/services/render/buildVectorPdfFromSheetSvg.js](../../src/services/render/buildVectorPdfFromSheetSvg.js) | `pdf-lib`      |

The loader is the same pattern in every file:

```js
let _libPromise = null;
async function loadLib() {
  if (!_libPromise) {
    _libPromise = import(/* webpackChunkName: "lib" */ "lib");
  }
  return _libPromise;
}
```

This preserves determinism: nothing about the artifact pipeline's ordering
changes — the same `async` calls happen at the same point, with one extra
`await` for the (cached) module fetch.

### Skipped on purpose

- **xlsx** — already isolated as `238.chunk.js` (pure xlsx). `ProgramImportExportService` is already dynamically imported by the container, so the chunk only loads when a user imports/exports a program.
- **three.js** — already isolated as `435.chunk.js` (100% `three.core.js`). Webpack's default `splitChunks` already gave it its own chunk; per-caller dynamic imports would not improve the graph.
- **@turf/turf** — 31 synchronous call sites in [boundaryGeometry.js](../../src/components/map/boundaryGeometry.js); converting cascades through every consumer and is too invasive for a perf-only PR.
- **jspdf** — not imported anywhere in `src/`.
- **`svgToPdfWalker.js`** — its `pdf-lib` imports (`rgb`, `degrees`) are called from synchronous `parseSvgColor` helper. The walker is only reached through the (lazy) export flow, so it stays eager inside its lazy chunk.
- **`projectGraphVerticalSliceService.js`** — listed in [CLAUDE.md](../../CLAUDE.md) as a key entrypoint; left untouched.

### Bundle analysis tooling

New `devDependency`: `source-map-explorer ^2.5.3`. Two scripts in
[package.json](../../package.json):

- `npm run build:analyze` — production build with `GENERATE_SOURCEMAP=true`
- `npm run analyze` — opens `bundle-report.html` from
  `source-map-explorer` against the latest `build/`

`bundle-report.html` is added to [.gitignore](../../.gitignore).

### Base64 in React state (audit only)

`ExportPanel.jsx` line 54 passes `panel.base64` as a **prop**, not state, so
no large base64 lives in `useState`. No refactor needed — and the artifact
flow is out of scope per CLAUDE.md.

## After this PR

Same `build:analyze` + `analyze` pipeline, post-changes:

| Chunk                                      |         Raw |       Gzip | Loads when              |
| ------------------------------------------ | ----------: | ---------: | ----------------------- |
| **`main.js`** (initial)                    | **2.73 MB** | **736 KB** | First paint             |
| `463.chunk.js` (lucide-react, shared)      |      561 KB |     138 KB | First step / lazy chunk |
| `238.chunk.js` (xlsx)                      |      418 KB |     137 KB | Program import/export   |
| **`pdfjs-dist.chunk.js`** (new, named)     |      482 KB | **129 KB** | Portfolio PDF upload    |
| `435.chunk.js` (three)                     |      182 KB |      48 KB | 3D preview              |
| `239.chunk.js` (html2canvas in lazy graph) |      203 KB |      46 KB | Site-map capture        |
| `step-location.chunk.js`                   |       85 KB |      22 KB | Step 1 navigation       |
| `step-results.chunk.js`                    |       75 KB |      20 KB | Step 6 navigation       |
| `step-specs.chunk.js`                      |       45 KB |      13 KB | Step 4 navigation       |
| `step-generate.chunk.js`                   |       19 KB |       6 KB | Step 5 navigation       |
| `step-portfolio.chunk.js`                  |       18 KB |       6 KB | Step 3 navigation       |
| `step-intelligence.chunk.js`               |       12 KB |       4 KB | Step 2 navigation       |
| `page-pricing.chunk.js`                    |       11 KB |       4 KB | Pricing view            |

`build/index.html` still references only `main.js` — everything else is
on-demand.

### main.js delta vs. baseline

|      | Baseline |   After |                  Δ |
| ---- | -------: | ------: | -----------------: |
| Raw  |  3.85 MB | 2.73 MB |       **−1.12 MB** |
| Gzip |  1.05 MB |  736 KB | **−330 KB (−31%)** |

Top groups inside `main.js` after the change (pdfjs-dist is gone):

| KB raw | % main.js | Group                                         |
| -----: | --------: | --------------------------------------------- |
|  126.7 |      4.8% | `react-dom` (required)                        |
|   97.3 |      3.7% | `motion-dom` (LandingPage uses framer-motion) |
|   88.3 |      3.3% | `@clerk/clerk-react` (auth on landing)        |
|   70.8 |      2.7% | `services/dnaWorkflowOrchestrator.js`         |
|   67.5 |      2.5% | `services/drawing/svgSectionRenderer.js`      |
|   62.5 |      2.3% | `crypto-js` (follow-up candidate)             |
|   55.1 |      2.1% | `ArchitectAIWizardContainer.jsx`              |

## Remaining risks / follow-ups (not in this PR)

1. **Tree-shake `lucide-react` icons.** ~400 KB raw across the lazy chunks
   (notably `463.chunk.js`). Migrate barrel imports
   (`import { X } from "lucide-react"`) to specific-icon imports
   (`import X from "lucide-react/dist/esm/icons/x"`) to shrink the shared
   lucide chunk.
2. **Tree-shake `crypto-js`** (62.5 KB in main.js). The codebase likely only
   needs `crypto-js/sha256` or similar; barrel imports pull the whole lib.
3. **Lazy-load `useArchitectAIWorkflow.js`.** This hook (46 KB) + its
   transitive imports (DNA orchestrator, drawing renderers, project pipeline
   V2) are the next-largest tranche in `main.js`. They're only needed once
   the user starts working in step 1+, but the container imports them
   eagerly. Moving them behind a per-step or per-action lazy load requires
   restructuring the workflow hook and was deemed out of scope here.
4. **`@turf/turf` boundary geometry.** 31 synchronous call sites in
   `boundaryGeometry.js`. To defer turf, the helper exports would need to
   become async and propagate through `SiteBoundaryEditorV2` / boundary
   policy modules.
5. **Verify `pdfjs-dist` worker still resolves.** The lazy loader sets
   `GlobalWorkerOptions.workerSrc = ${origin}/pdf.worker.min.mjs` on first
   import. The worker file is shipped at `/public/pdf.worker.min.mjs` and
   must remain at that path for the lazy loader to find it.

## How to re-run the analysis

```powershell
# 1. Produce a build with source maps
npm run build:analyze

# 2. Generate bundle-report.html (auto-opens in browser)
npm run analyze
```

For a comparison run during development, keep two `build/` snapshots and run
`source-map-explorer "<dir>/static/js/main.*.js" --json out.json` against
each.

# Structured Style Pack — Implementation Prompts

Feature: extend `portfolioFileProcessing.js` to emit a per-architect **Style Pack** JSON, and consume it as parametric constraints inside **STEP 06** (concept/massing) and **STEP 11** (materials). The Style Pack must influence ProjectGraph parameters, never bypass them. No image models for technical drawings. Determinism preserved (same inputs + seed → same `geometryHash`).

Workflow:

1. Run **PROMPT 1** in Claude Code → produces `docs/style-pack/PLAN.md`.
2. Run **PROMPT 2** in Codex GPT-5.5 with `PLAN.md` attached → produces the diff + tests.
3. Run **PROMPT 3** in a fresh Claude Code session → produces `docs/style-pack/AUDIT.md`.
4. Address audit findings. Repeat 2 + 3 if needed.

---

## PROMPT 1 — Plan (run in Claude Code)

You are working in the `architect-ai-platform` repository. Read `CLAUDE.md` and `AGENTS.md` first and treat them as binding. Do not write any code yet — your only deliverable is a precise implementation plan.

**Feature to plan:** "Structured Style Pack from portfolio uploads, consumed by STEP 06 and STEP 11 as parametric constraints."

**Background you must verify by reading the code, not assume:**

- The pipeline runs steps 01–13, resolved via `src/services/modelStepResolver.js`.
- Portfolio uploads are currently parsed in `src/services/.../portfolioFileProcessing.js` (find the exact path).
- Style is currently blended via `localStylePack.js` with portfolio weighted ~15%. Confirm the actual weighting code path.
- STEP 06 produces concept narrative + massing JSON. STEP 11 produces material/palette strategy. Find the exact entry points and the shape of the data they currently emit.
- `ProjectGraph` (STEP 07) is the single geometry authority. 2D and 3D share a `geometryHash`. The Style Pack must influence parameters that _feed into_ ProjectGraph, not anything downstream of it — otherwise the hash will desync.
- Output formats: SVG (deterministic), PDF, DXF, IFC, XLSX. None of these may regress.

**What the Style Pack must contain (minimum):**

- `windowToWallRatio`: `{ overall: number, byElevation: { N, S, E, W } }`
- `roofPitchDistribution`: `{ flatPct, lowPct, mediumPct, steepPct, dominant: 'flat'|'low'|'medium'|'steep' }`
- `openingRhythm`: `{ moduleMm: number, repetition: 'regular'|'asymmetric'|'paired', sillHeightMm: number }`
- `materialFamilies`: `{ primary: string[], secondary: string[], accents: string[] }` (e.g., `['brick','stone','timber']`)
- `massingTendency`: `{ form: 'compact'|'L'|'U'|'courtyard'|'articulated', floorCount: { min, mode, max }, aspectRatioRange: [min, max] }`
- `facadeModule`: `{ baySpacingMm: number, floorHeightMm: number }`
- `provenance`: `{ sourceFiles: string[], extractedAt: ISOString, extractorVersion: string, confidence: number }`

**Required deliverable — write to `docs/style-pack/PLAN.md` with these sections:**

1. **Files to create.** Full path, purpose, exported symbols.
2. **Files to modify.** For each: file path, function or section to change, why, and a 5–15 line illustrative diff (pseudo-diff is fine).
3. **Style Pack JSON schema.** Final, locked schema (extend the minimum above where the codebase suggests it). Include a JSON Schema fragment.
4. **Extractor design.** How `portfolioFileProcessing.js` will turn N PDFs/images into one Style Pack. Where heuristics live, where LLM-assisted extraction is acceptable, and which model env var (`STEP_*_MODEL`) it should resolve through. Must be deterministic given the same inputs.
5. **STEP 06 integration.** Exactly how the Style Pack constrains massing JSON (e.g., clamps `aspectRatioRange`, biases `floorCount`, restricts roof pitch). Show the function signature change.
6. **STEP 11 integration.** Exactly how `materialFamilies` becomes a parametric constraint on the materials/palette strategy.
7. **ProjectGraph contract.** Confirm the Style Pack is consumed _upstream_ of STEP 07 so it folds into the `geometryHash`. List every place the hash input set is computed, and confirm Style Pack is included.
8. **Determinism plan.** How seeded runs stay reproducible. Where the Style Pack is hashed and threaded.
9. **Env vars and config.** Any new entries for `.env.example`, plus updates to `scripts/check-env.cjs` if needed. Default behavior when no portfolio is uploaded (system must work as today).
10. **Tests to add.** List Jest test files and the cases each must cover. At minimum:
    - `src/__tests__/services/styleExtractor.test.js` — extractor produces stable schema; deterministic given fixed inputs.
    - `src/__tests__/services/styleConstraintApplier.test.js` — STEP 06 and STEP 11 honor constraints; absence of pack falls back to current behavior.
    - Extend `src/__tests__/services/projectGraphVerticalSliceService.test.js` to cover: same brief + pack → same hash; same brief + no pack → existing hash unchanged.
11. **Validation matrix.** The exact commands to run before declaring success:
    ```powershell
    npm run check:env
    npx react-scripts test --watchAll=false --runInBand --testPathIgnorePatterns=\.claude\ --runTestsByPath src/__tests__/services/modelStepResolver.test.js src/__tests__/services/projectGraphVerticalSliceService.test.js src/__tests__/services/styleExtractor.test.js src/__tests__/services/styleConstraintApplier.test.js
    npm run check:contracts
    npm run test:compose:routing
    npm run build:active
    npm run lint
    ```
12. **Risks and non-goals.** Explicitly call out: no LoRA, no fine-tuning of architect work, no image-model involvement in technical drawings, no change to SVG/DXF/IFC exporters, no change to the QA report contract at STEP 13.
13. **Rollback plan.** How to disable the feature via env flag (e.g., `STYLE_PACK_ENABLED=false`) without touching code.

Constraints you must not violate:

- Never route plans, elevations, sections, or geometry authority through image models.
- Do not edit real `.env`, `.env.local`, or `.env.production`.
- 2D and 3D must continue to share the same `geometryHash`.
- `multi_panel` mode must remain untouched.

When `PLAN.md` is written, stop. Do not begin implementation.

---

## PROMPT 2 — Implementation (run in Codex GPT-5.5)

You are implementing a feature in the `architect-ai-platform` repository. The complete plan is in `docs/style-pack/PLAN.md` — read it first and treat it as the contract. Also read `CLAUDE.md` and `AGENTS.md` and treat them as binding architectural constraints.

**Your job:** implement the plan exactly as written. Do not invent new files, do not change function signatures the plan didn't authorize, and do not refactor adjacent code. If the plan is ambiguous on a point, prefer the option that minimizes blast radius and add a `// PLAN-AMBIGUITY:` comment with one sentence explaining the call you made.

**Hard rules — violating any of these is a failed implementation:**

1. Style Pack data flows into STEP 06 and STEP 11 _before_ STEP 07 (ProjectGraph) computes its geometry. The `geometryHash` input set must include the Style Pack hash.
2. With no portfolio uploaded, every existing test must still pass and every existing output (SVG, PDF, DXF, IFC, XLSX) must be byte-identical to today's output for the same brief and seed.
3. No image-model code path may be added or touched for technical drawings (STEP 08 / STEP 09).
4. Determinism: same brief + same portfolio + same seed → same Style Pack JSON → same `geometryHash`. Use stable JSON serialization (sorted keys) where you hash.
5. Add a feature flag `STYLE_PACK_ENABLED` (default `true` in dev, false-safe in prod per the plan). When false, the extractor short-circuits and STEP 06 / STEP 11 see no pack.
6. Do not edit `.env`, `.env.local`, or `.env.production`. Only update `.env.example` and `scripts/check-env.cjs`.

**Deliverables, in this order:**

1. New file: the Style Pack extractor (path per plan).
2. New file: the Style Pack constraint applier (path per plan).
3. Edits to STEP 06 entry point.
4. Edits to STEP 11 entry point.
5. Edits to `projectGraphVerticalSliceService.js` to thread the pack and include it in the hash input.
6. Edits to `modelStepResolver.js` if a new model resolution is required.
7. New `.env.example` entries and `scripts/check-env.cjs` updates.
8. Jest tests listed in the plan, all green.
9. A short `IMPLEMENTATION_NOTES.md` in `docs/style-pack/` describing any `PLAN-AMBIGUITY` decisions.

**Validation — run all of these and paste the output in your final message:**

```powershell
npm run check:env
npx react-scripts test --watchAll=false --runInBand --testPathIgnorePatterns=\.claude\ --runTestsByPath src/__tests__/services/modelStepResolver.test.js src/__tests__/services/projectGraphVerticalSliceService.test.js src/__tests__/services/styleExtractor.test.js src/__tests__/services/styleConstraintApplier.test.js
npm run check:contracts
npm run test:compose:routing
npm run build:active
npm run lint
```

If any command fails, fix the cause and re-run. Do not silence errors. Do not mark the work done with red tests.

When complete, your final message must contain: (a) a list of files created and modified with short rationale per file, (b) the full validation command output, (c) the contents of `IMPLEMENTATION_NOTES.md`.

---

## PROMPT 3 — Audit (run in a fresh Claude Code session)

You are an independent reviewer. You did not write this code and you have no context from the implementation session. Read these documents in order before looking at any diff:

1. `CLAUDE.md`
2. `AGENTS.md`
3. `docs/style-pack/PLAN.md`
4. `docs/style-pack/IMPLEMENTATION_NOTES.md`

Then audit the implementation. Use `git diff main...HEAD` (or the equivalent) to see exactly what changed.

**Your audit must answer each of these questions with a verdict (PASS / FAIL / PARTIAL) and the specific file:line evidence:**

1. **Plan adherence.** Does every file the plan said to create or modify exist and match the plan's intent? Are there extra files or extra edits the plan did not authorize?
2. **Geometry authority preserved.** Is the Style Pack consumed strictly upstream of STEP 07? Trace the data flow from extractor → STEP 06 → STEP 11 → STEP 07. Confirm the `geometryHash` input set now includes the Style Pack hash and is stably serialized.
3. **No image-model regression.** Confirm STEP 08 (2D drawings) and STEP 09 (3D validation) were not modified to depend on image models. Confirm `multi_panel` mode is untouched.
4. **Backward compatibility.** With `STYLE_PACK_ENABLED=false` or with no portfolio uploaded, do existing tests pass and does the pipeline produce byte-identical output to pre-change for at least one canonical brief? If a regression test was not added for this, that itself is a FAIL.
5. **Determinism.** Same brief + same portfolio + same seed: does the new code paths produce a stable Style Pack JSON (stable key order, no timestamps inside the hashed payload)? Where is the hash computed, and is the input canonicalized?
6. **Schema correctness.** Does the emitted Style Pack JSON match the schema in `PLAN.md` exactly? Are all fields present, typed, and within reasonable ranges? Is `provenance` populated?
7. **Test coverage.** Were the test files listed in the plan added? Do they actually exercise the constraint logic (not just snapshot the schema)? Run them.
8. **Validation matrix.** Run every command in the plan's validation matrix yourself. All must pass. Paste output.
9. **Env contract.** Is `.env.example` updated? Does `scripts/check-env.cjs` know about new variables? Were real `.env*` files left alone?
10. **CAD/IFC/PDF integrity.** Diff a generated DXF and IFC pre/post change for the no-portfolio case. They must be identical (or differ only in timestamp metadata). Document what you compared.
11. **Architectural rule violations.** List any place the diff bends or breaks rules from `CLAUDE.md` or `AGENTS.md`, even if subtle. Be picky.
12. **Hidden coupling.** Did the implementation introduce a dependency from a downstream step (08/09/12/13) back into the Style Pack? It should not.

**Deliverable:** write `docs/style-pack/AUDIT.md` containing:

- Per-question verdict table (PASS/FAIL/PARTIAL + evidence).
- A "Must-fix before merge" list (only the FAILs).
- A "Should-fix soon" list (the PARTIALs).
- A final overall verdict: APPROVE / REQUEST CHANGES / REJECT.

Be honest. If the implementation is good, say so plainly. If it's broken, say exactly where. Do not soften findings.

---

## PROMPT 2.1 — Hardened re-implementation (run in Codex CLI after a phantom-completion failure)

**Context:** a previous Codex run produced a completion report describing files and tests that did not exist on disk. This run must prove every claim with evidence. Reports without evidence will be rejected.

You are implementing the Style Pack feature in the `architect-ai-platform` repository. Read `docs/style-pack/PLAN.md`, `CLAUDE.md`, and `AGENTS.md` first and treat them as binding. Implement strictly to the plan; same hard rules as the original PROMPT 2 apply (geometry authority, no image models for technical drawings, `STYLE_PACK_ENABLED` flag, no edits to real `.env*`, byte-identical output with no portfolio).

**Mandatory verification gates — your work is incomplete until every gate passes:**

### Gate 0 — Confirm working directory and branch

Before doing anything else, run and paste the output of:

```powershell
Get-Location
git rev-parse --show-toplevel
git status
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
```

If `Get-Location` is not inside `C:\Users\21366\OneDrive\Documents\GitHub\architect-ai-platform`, STOP and report the mismatch. Do not proceed.

### Gate 1 — After every file write, prove the file exists

After creating or modifying any file, immediately run:

```powershell
Get-Item <path> | Select-Object FullName, Length, LastWriteTime
Get-FileHash <path> -Algorithm SHA256
```

Paste both lines into your output. If the file does not appear, the write failed — re-attempt and re-verify before moving on.

### Gate 2 — Don't trust your memory; query the filesystem

At any point where you would say "I created X" or "I modified Y", run `Get-ChildItem <path>` first. If the file is not there, do not claim it.

### Gate 3 — Run the validation matrix and capture exit codes

Run each command separately, paste full output, and on the next line paste `$LASTEXITCODE`:

```powershell
npm run check:env;            "EXIT=$LASTEXITCODE"
npx react-scripts test --watchAll=false --runInBand --testPathIgnorePatterns=\.claude\ --runTestsByPath src/__tests__/services/modelStepResolver.test.js src/__tests__/services/projectGraphVerticalSliceService.test.js src/__tests__/services/styleExtractor.test.js src/__tests__/services/styleConstraintApplier.test.js; "EXIT=$LASTEXITCODE"
npm run check:contracts;      "EXIT=$LASTEXITCODE"
npm run test:compose:routing; "EXIT=$LASTEXITCODE"
npm run build:active;         "EXIT=$LASTEXITCODE"
npm run lint;                 "EXIT=$LASTEXITCODE"
```

Every `EXIT` must be `0`. Do not summarize, paraphrase, or skip. If a test file referenced in the Jest command does not exist on disk, that is a Gate 1 failure — create the file, do not silently drop it from the command.

### Gate 4 — Commit and prove the commit landed

After the matrix is green:

```powershell
git add -A
git status
git commit -m "feat(style-pack): structured Style Pack extractor and STEP 06/11 integration"
git log -1 --stat
git rev-parse HEAD
git diff --stat HEAD~1..HEAD
```

The `git log -1 --stat` and `git diff --stat` output must list every file you claim to have touched. If a claimed file is missing from this list, it was never written — return to Gate 1.

### Gate 5 — Self-verification script

Before declaring done, write and run this exact script (place it at `scripts/verify-style-pack.ps1`), pasting its output:

```powershell
$expected = @(
  # Replace with the actual paths from PLAN.md "Files to create" + "Files to modify"
  "src/services/style/stylePackExtractor.js",
  "src/services/style/stylePackConstraintApplier.js",
  "src/schemas/stylePack.schema.json",
  "src/__tests__/services/styleExtractor.test.js",
  "src/__tests__/services/styleConstraintApplier.test.js",
  "docs/style-pack/IMPLEMENTATION_NOTES.md"
)
$missing = @()
foreach ($p in $expected) {
  if (-not (Test-Path $p)) { $missing += $p }
}
if ($missing.Count -gt 0) {
  Write-Host "MISSING FILES:" -ForegroundColor Red
  $missing | ForEach-Object { Write-Host "  $_" }
  exit 1
}
$flagHits = (Select-String -Path ".env.example","scripts/check-env.cjs" -Pattern "STYLE_PACK_ENABLED" -SimpleMatch).Count
if ($flagHits -lt 2) {
  Write-Host "FAIL: STYLE_PACK_ENABLED not wired into env.example + check-env.cjs (hits=$flagHits)" -ForegroundColor Red
  exit 1
}
Write-Host "OK: all expected files present, flag wired." -ForegroundColor Green
```

If this script exits non-zero, the run failed — fix and re-run from Gate 1.

### Final report — paste verbatim, no summary

Your final message must contain, in this order:

1. Gate 0 output.
2. For each file created/modified: path, SHA-256, line count.
3. Gate 3 output (every command, every `EXIT`).
4. Gate 4 output (`git log -1 --stat`, the new commit SHA, `git diff --stat`).
5. Gate 5 script output ending in `OK: all expected files present, flag wired.`
6. Contents of `docs/style-pack/IMPLEMENTATION_NOTES.md`.

Reports missing any of these sections will be rejected as phantom completions, the way the previous run was.

---

## PROMPT 3.1 — Re-audit after PROMPT 2.1 (run in a fresh Claude Code session)

Use **PROMPT 3** above, but before answering any of its 12 questions, run this pre-flight and abort with `REJECT — PHANTOM COMPLETION` if any check fails:

```powershell
git rev-list --count origin/main..HEAD
git diff --stat origin/main..HEAD
git log origin/main..HEAD --oneline
Test-Path src/services/style/stylePackExtractor.js
Test-Path src/services/style/stylePackConstraintApplier.js
Test-Path docs/style-pack/IMPLEMENTATION_NOTES.md
Select-String -Path ".env.example" -Pattern "STYLE_PACK_ENABLED"
Select-String -Path "scripts/check-env.cjs" -Pattern "STYLE_PACK_ENABLED"
```

If `git rev-list --count origin/main..HEAD` is `0`, or any `Test-Path` returns `False`, or either `Select-String` returns nothing, stop the audit immediately and write `docs/style-pack/AUDIT.md` with a single section: **REJECT — PHANTOM COMPLETION**, listing exactly which preflight check failed. Do not proceed to the 12 questions.

Only if every preflight check passes, continue with the full audit per PROMPT 3.

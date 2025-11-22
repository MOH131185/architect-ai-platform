<!-- 5c2aa7db-9750-445f-901b-b98e74a5c096 356b272e-693f-4a0f-8bf1-28cd088b1670 -->
# A1 Sheet Quality, Reasoning, And Consistency Upgrade

## Goals

- Ensure every design is **site-aware**: real boundary, shape, area, orientation, and constraints are respected in DNA and in the A1 sheet.
- Ensure **materials, style, climate, and portfolio** all feed into DNA and the A1 prompt in a traceable way.
- Guarantee the A1 sheet is a **complete UK RIBA-style board** (site map, 2D/3D, technical drawings, floor plans, sections, title block, data panels).
- Maximize **rendering quality** (given Together AI limits) and **architectural reasoning quality**.
- Provide a robust **AI Modify** flow that regenerates the A1 sheet with changes while preserving the original design (same building, new deltas).

## Phase 1 – Strengthen Site-Aware DNA And Boundary Handling

- Wire site metrics and constraints end-to-end:
- In `ArchitectAIEnhanced.js` and `useGeneration.js`, ensure `projectContext` passed to services includes `sitePolygon`, `siteMetrics`, `siteAnalysis`, and `ukLocationData` consistently.
- In `enhancedDNAGenerator.js`, verify and, if needed, refine how `siteMetrics`, `siteAnalysis`, and zoning data are converted into `masterDNA.siteConstraints` and `boundaryValidation` inputs.
- Validate boundary constraints before prompt generation:
- In `siteValidationService.js` and `enhancedDNAGenerator.js`, confirm `validateDesignAgainstSite()` is called, and that its results (validated footprint, setbacks, compliance score) are written to `masterDNA.boundaryValidation`.
- Add clear error/warning flows if the requested area cannot reasonably fit the site (e.g., log and clamp to maximum feasible footprint/floor count).
- Ensure A1 prompts and reasoning use the same boundary data:
- In `a1SheetPromptGenerator.buildA1SheetPrompt()` and `buildKontextA1Prompt()`, verify they read `masterDNA.siteConstraints` and `masterDNA.boundaryValidation`, not ad‑hoc site info.
- Trim boundary text to an essential but compact form to reduce prompt length while keeping constraints explicit.

## Phase 2 – Fully Integrate Materials, Style, Climate, And Portfolio Into DNA

- Enrich the reasoning/DNA inputs:
- In the step where `generateArchitecturalReasoning()` and `enhancedDNAGenerator.generateMasterDesignDNA()` are called (e.g., `dnaWorkflowOrchestrator.runA1SheetWorkflow`), ensure `projectContext` includes:
- `buildingProgram` and structured `programSpaces` with areas and counts.
- `blendedStyle` (portfolio + local styles), including `colorPalette` and `materials`.
- `locationData` including climate (`climate.type`, seasonal info) and zoning.
- Tighten DNA structure for style and materials:
- In `enhancedDNAGenerator.js`, make sure the LLM prompt explicitly asks for:
- A structured materials object (exterior, roof, secondary, window/door specs) with hex colors.
- Style weights (`styleWeights`) and `materialPriority` that match portfolio vs local context.
- Climate-responsive features (orientation, shading, ventilation) encoded in DNA.
- Update `dnaValidator.js` to validate these fields and auto-correct obvious inconsistencies (missing hex, impossible U-values, etc.).
- Propagate style/climate/portfolio into A1 prompts:
- In `buildA1SheetPrompt()`, ensure it always uses `blendedStyle`, `materialPriority`, and climate data where available, and degrades gracefully to sensible defaults when not.
- Simplify repeated prose while keeping key style/climate constraints (to keep prompts strong but not bloated).

## Phase 3 – Make The A1 Sheet Complete And High-Quality

- Enforce RIBA-style completeness before calling the image model:
- In `a1SheetValidator.validateA1TemplateCompleteness()` and `dnaWorkflowOrchestrator.js`, double-check that `requiredSections` includes all mandatory panels (site plan, floor plans, four elevations, two sections, 3D views, material, environmental, data, title block).
- Ensure `requiredSections` is passed into `buildA1SheetPrompt()` / `buildKontextA1Prompt()` and into any modify prompts.
- If the template validation score is below a threshold (e.g., < 95%), log a strong warning and optionally regenerate the prompt with more explicit section instructions.
- Optimize model and quality settings for the initial A1 sheet:
- Keep using `getOptimalQualitySettings(..., 'initial')` to drive `generateA1SheetImage()` with:
- Model: `black-forest-labs/FLUX.1-dev` (or feature-flag `kontext` if experiments show better layouts).
- Resolution: `1792×1269` landscape.
- Steps: ~48–50, guidance ~7.5–8.5.
- In `generateA1SheetImage()`, keep landscape lock and log effective DPI; consider tuning guidance slightly per empirical tests if the board is too noisy or too literal.
- Add an optional upscaling path for downloads:
- Implement an “upscale on download” flow (client or server) that uses the `upscale` settings from `getOptimalQualitySettings('upscale')` to go from 1792×1269 to ~9933×7016 for PDFs/exports.
- Wire this into the export/download functions in `ArchitectAIEnhanced.js` so users see crisp A1 sheets when exporting, while the live preview stays lighter.

## Phase 4 – Strengthen Reasoning Quality And Design Coherence

- Improve the reasoning prompt for Qwen 2.5 72B:
- In `generateArchitecturalReasoning()` and/or `enhancedDNAGenerator.generateMasterDesignDNA()`, refine the system/user prompts to:
- Emphasize adjacency diagrams, circulation logic, daylighting, and structural grids.
- Request explicit cross-view consistency rules (already partially present) as a numbered list that can be stored into `masterDNA.consistencyRules`.
- Close the loop between reasoning and DNA validation:
- After DNA generation and validation, add a short “self-check” Qwen call (optional feature flag) to review the DNA and highlight major conflicts or missing program elements.
- Optionally surface a short “design rationale” summary to the UI so users can understand the architectural logic behind the sheet.

## Phase 5 – Make AI Modify Robust And Truly Consistent

- Use img2img with seed locking for modifications:
- In `aiModificationService.modifyA1Sheet()` and `generateA1SheetImage()`:
- Always load the original A1 sheet as `initImage` for modify runs.
- Always reuse the original `seed` and `model` used for the baseline sheet.
- Use low `imageStrength` (~0.15–0.2) for typical modifications (color/material changes, adding details) so composition and geometry stay fixed.
- Apply strong consistency-lock prompts for modify:
- Use `withConsistencyLock()` or `withConsistencyLockCompact()` to build modify prompts that:
- Explicitly freeze project type, dimensions, massing, room layout, and site plan.
- Express the user’s delta (“yellow house → red house”, “add section labels”, etc.) in a short, focused way.
- Ensure the modify UI (`AIModifyPanel.jsx`) sends concise delta prompts rather than full freeform essays.
- Preserve and compare versions for consistency:
- In `designHistoryService.js`, confirm that each A1 generation (baseline and modify) saves: URL, seed, base prompt, delta prompt, and DNA snapshot.
- Use `sheetConsistencyGuard` to compute pHash/SSIM between old and new sheets and:
- If the consistency score drops below a threshold (e.g., 92%), automatically retry with a stronger consistency lock or lower `imageStrength`.
- UX for modification:
- In `AIModifyPanel.jsx` / `ArchitectAIEnhanced.js`, ensure the user can:
- See a clear “original vs modified” toggle or history list.
- Apply simple prompts like “make facade brick red instead of yellow” and see only the requested change while the building and site stay the same.

## Phase 6 – Testing And Quality Assurance

- Update or add targeted tests:
- Extend `test-clinic-a1-generation.js` and `test-a1-sheet-complete.js` to assert:
- All required sections are present in the A1 prompt and metadata.
- Non-residential projects never default to house typologies.
- Add a test for site integration (e.g., a small test harness that feeds synthetic `siteMetrics` and checks that `masterDNA.boundaryValidation` and the A1 prompt reference them correctly).
- Test modify-consistency end-to-end:
- Use `test-a1-modify-consistency.js` and `test-modify-seed-consistency.js` to confirm:
- The same seed is reused for modify runs.
- pHash/SSIM thresholds are honored and retries work.
- Add a focused test where the only requested change is a material color (e.g., yellow → red) and verify that most of the image remains unchanged.

If you accept this plan, the next step will be to implement it step by step in the listed files, starting with site-aware DNA and A1 prompt wiring, then tuning the modify pipeline for img2img + consistency locks.

### To-dos

- [ ] Wire site metrics, constraints, and boundary validation through enhancedDNAGenerator, siteValidationService, and a1SheetPromptGenerator to ensure designs respect real site shape and area.
- [ ] Ensure materials, style, climate, and portfolio data are fully integrated into Master DNA and validated, then propagated into A1 sheet prompts.
- [ ] Enforce A1 RIBA template completeness and optimize model/quality settings (resolution, steps, guidance) plus add an upscaling path for high-DPI exports.
- [ ] Refine Qwen-based reasoning prompts and optional self-checks to improve architectural design logic and cross-view consistency rules.
- [ ] Strengthen the AI Modify workflow with img2img + seed locking, strong consistency-lock prompts, history storage, and SSIM/pHash validation to keep modified A1 sheets visually consistent with the original.
- [ ] Extend and add tests to cover A1 completeness, site integration, and modify consistency, ensuring the upgraded pipeline remains stable.
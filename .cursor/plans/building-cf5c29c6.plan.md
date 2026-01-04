<!-- cf5c29c6-305a-49cd-841f-1c4a895ed206 d23e5773-2b34-410d-aa26-0f9fe9adaadf -->
# UI/UX Upgrade Implementation Plan

## Architecture Overview

- Maintain existing React/CRA structure; focus on enhancing `src/components`, `src/styles`, and map utilities without altering deterministic backend logic.
- Introduce a shared animation/background system (React components + CSS/Framer motion) consumed by each wizard step.
- Refactor SiteBoundaryEditor into modular sub-components (Map canvas, Controls, Metrics) with synchronized state.
- Add new visual layers (compass overlay, program review cards) while keeping data flow via `ArchitectAIWizardContainer`.

## Component Tree (Key Additions/Refactors)

- `ArchitectAIWizardContainer`
- `LandingStep`
 - `AnimatedBackground` (new)
- `LocationStep`
 - `SiteBoundaryEditor`
 - `MapCanvas`
 - `PolygonControls`
 - `SegmentEditor`
 - `MetricsPanel`
 - `EntranceCompassOverlay` (new overlay)
- `SpecsStep`
 - `BuildingTypeSelector`
 - `EntranceDirectionSelector`
 - `ProgramControls`
 - `ProgramTable`
 - `ProgramReviewCards` (new)
- `IntelligenceStep`/`PortfolioStep`/`GenerateStep`
 - Each wrapped with `StepContainer` providing animation + background

## File-Level Diff Plan

1. `src/styles/animations.js`

- Add shared animation variants (parallax, zoom, fade layers)

2. `src/components/layout/AnimatedBackground.jsx` (new)

- Handles gradient layers, parallax scroll, zoom transitions

3. `src/components/layout/StepContainer.jsx` (new)

- Wraps each wizard step, injects background + shared padding

4. `src/components/map/SiteBoundaryEditor.jsx`

- Major refactor: split logic, add segment editor, manual length/angle inputs, fit/reset/export buttons, optional manual drawing toggle, invalid angle auto-fix
- Integrate Google Maps polygon handles + new overlay components

5. `src/components/map/EntranceCompassOverlay.jsx` (new)

- Renders visual compass + entrance arrow atop map, synced with state

6. `src/components/steps/SpecsStep.jsx`

- Layout redesign to Deepgram-style; incorporate Program Review cards and reorganized controls

7. `src/components/specs/ProgramReviewCards.jsx` (new)

- Visual card layout summarizing program spaces

8. `src/styles/siteBoundaryEditor.css` (new or expanded)

- Dedicated styling for map controls, metrics, segment editing

9. `src/components/steps/*` (Landing, Location, Intelligence, Portfolio, Generate, Results)

- Update to use `StepContainer`, apply consistent typography/spacing

10. `src/utils/sitePolygonUtils.js` (new helper)

 - Shared functions for angle/length calculations, auto-fix logic

## Animation Plan

- **AnimatedBackground**: multi-layer gradient with slow zoom + parallax responding to pointer movement.
- **Step transitions**: use Framer Motion to fade/slide content while background persists.
- **Map overlays**: entrance compass uses subtle rotation/fade when direction changes.
- **Program Review cards**: staggered fade-in/up when program list updates.
- **Buttons/inputs**: hover/press states aligned with Deepgram style (scale + glow).

## Coding Sequence for Claude Sonnet

1. **Foundation**

- Create `StepContainer` and `AnimatedBackground` components + base styles.
- Wrap all wizard steps with `StepContainer` to confirm no regressions.

2. **Animations/Global Polish**

- Update `src/styles/animations.js` with new variants.
- Apply consistent typography/padding across steps.

3. **SiteBoundaryEditor Overhaul**

- Extract helper utilities (`sitePolygonUtils.js`).
- Implement draggable handles + manual length/angle editors with bi-directional sync.
- Add fit/reset/export buttons and manual drawing mode toggle.
- Integrate invalid-angle auto-fix routine.

4. **Map Compass Overlay**

- Build `EntranceCompassOverlay.jsx`, overlay onto Google Map, sync with entrance direction.

5. **Specs Step Redesign**

- Reorganize layout to match Deepgram UI.
- Introduce `ProgramReviewCards.jsx` and integrate with program state.

6. **Animated Background Integration**

- Tune parallax/zoom transitions per step, add background assets if needed.

7. **QA & Backward Compatibility**

- Ensure deterministic pipeline unchanged (only UI layer touched).
- Verify all steps render correctly, SiteBoundaryEditor fully functional.
- Update docs/screenshots as needed.

## Backward Compatibility

- All data/state flows remain intact in `ArchitectAIWizardContainer`.
- Deterministic workflow (DNA generation, prompts, history) untouched.
- Map enhancements only augment UI; polygon data format unchanged.
- Program Review cards read existing `programSpaces`; no schema changes.

This plan delivers the requested Deepgram-level polish, advanced map editing, compass overlay, enhanced Specs layout, program review UX, and a clear coding roadmap for Claude to implement without affecting the backend pipeline.

### To-dos

- [ ] Scan repo to map existing building specs flow
- [ ] Draft refactor & feature integration plan
- [ ] Update schemas & services for building taxonomy
- [ ] Refactor SpecsStep with new selectors/table
- [ ] Implement entrance orientation detection & compass
- [ ] Wire new fields through DNA & A1 prompt builders
- [ ] Add ProgramImportExportService w/ xlsx support
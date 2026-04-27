# ProjectGraph A1 Recovery Plan

## Summary

The failed A1 output is primarily an export and artifact-routing failure. The
sheet SVG can contain useful panels, but the PDF export must render that SVG
instead of redrawing empty frames. The ProjectGraph vertical slice must also
surface a real site-map panel and three compiled-geometry 3D views before QA can
pass.

## Implementation Priorities

1. Render `sheetArtifact.svgString` into the A1 PDF using the existing
   Sharp-based SVG rasteriser, then embed that rendered sheet image with
   `pdf-lib`.
2. Build `site_context` from a supplied or Google Static Maps site snapshot
   when available, with deterministic SVG fallback explicitly flagged.
3. Build `hero_3d`, `axonometric`, and `interior_3d` panels from compiled
   ProjectGraph geometry using `compiledProjectRenderInputs`.
4. Fail or warn QA on missing panels, placeholder 3D, blank rendered export,
   bad SVG content, weak technical drawing occupancy, and geometry hash drift.
5. Expose the final sheet, site map, and 3D panels in the UI gallery with
   geometry authority metadata.

## Acceptance Criteria

- The exported PDF includes a rendered full A1 sheet image, not empty frames.
- The PDF artifact includes render proof metadata with a rendered PNG hash and
  non-background pixel ratio.
- A site-map artifact is present. If no Google/provided map is available, QA
  includes `SITE_MAP_FALLBACK_USED` and the panel is not labeled as Google.
- `hero_3d`, `axonometric`, and `interior_3d` artifacts exist and share the same
  geometry hash as the technical drawings.
- QA fails for missing required 3D panels, blank rendered PDF, missing technical
  panels, invalid section/elevation SVG, or 2D/3D geometry mismatch.
- Browser panel previews use `object-contain` and include authority/source
  metadata.

## Validation

```powershell
npm run check:env
npx react-scripts test --watchAll=false --runInBand --testPathIgnorePatterns=\.claude\ --runTestsByPath src/__tests__/services/projectGraphVerticalSliceService.test.js src/__tests__/services/drawingBlueprintRendererRegression.test.js
npm run check:contracts
npm run test:compose:routing
npm run lint
npm run build:active
```

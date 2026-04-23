# Phase 21: True Geometric Sectioning And Drafting-Grade Section Truth

## What changed

Phase 21 upgrades the section pipeline from Phase 20's near-boolean sectioning into true geometric cut-face and cut-profile construction truth for supported primitives (walls, openings, stairs, slabs, roofs, foundations).

The main backend additions are:

- a new section-face extraction service that lifts real cut-faces and cut-profiles from canonical geometry
- a truth-kind classifier (`cut_face`, `cut_profile`, `contextual_profile`, `derived_profile`, `unsupported`) that replaces weighted-fallback interpretation with explicit geometric truth
- a face credibility score and quality tier (`verified` / `weak` / `blocked`) derived from real cut-face and cut-profile counts
- stronger construction semantics, section-truth model, and ranking that read directly from the face bundle
- drafting-grade section graphics that visibly reward true cut-faces (higher opacity, thicker outlines, added cut-face reveal rects)
- Phase 21 credibility propagation into A1 technical scoring, regression, credibility, publishability, panel quality, and verification bundle services

## How true geometric sectioning works

For each supported canonical primitive the section clipper now:

- extracts the true cut-face polygon (height-extruded polygon with bottom/top from level profiles) when the cut intersects a solid face
- extracts the true cut-profile segments when the cut grazes the primitive
- classifies each hit with a `truthKind` based on band coverage ratio, exact profile clip count, profile continuity, near-boolean clip state, direct band hit, and midpoint-inside-polygon test
- aggregates per-kind totals (wall, opening, stair, slab, roof, foundation) into a face bundle with a credibility score and quality tier

Profile continuity is a new Phase 21 metric that measures orth overlap between adjacent profile segments. It penalizes disjoint speckled profiles and rewards coherent drafting-grade profiles.

## Truth kinds

The centralized face bundle classifies each section hit into one of:

- `cut_face`: an exact clipped cut-face polygon exists (solid section cut)
- `cut_profile`: exact clipped profile segments exist (near-boolean cut line)
- `contextual_profile`: the cut is near useful geometry but without strong exact clip support
- `derived_profile`: truth depends on derived roof/foundation profile fallback
- `unsupported`: no canonical cut support

Face credibility quality tiers:

- `verified` at score ≥ 0.72 (strong cut-face and/or cut-profile truth)
- `weak` at score ≥ 0.44 (some cut-profile truth or mixed truth)
- `blocked` otherwise (too thin to claim cut-face credibility)

## Drafting-grade section graphics changes

Phase 21 section graphics remain deterministic and honest, and now visibly differentiate true cut-face truth from everything else.

When Phase 21 graphics are active:

- cut-face walls render with 0.96 poche opacity, 1.22× cut-outline weight, no dash, higher interior hatch opacity, and an added cut-face reveal rect at the top of the wall
- cut-face openings render with 1.2× frame weight, cut-face sill and head reveal rects, stronger jamb/center opacities, and a second horizontal guide for nearBoolean/cutFace cases
- cut-face stairs render with stronger tread weights, darker tread strokes, explicit risers, escalated outline weight/opacity, and shifted text fill
- cut-face lineweights include a `faceBoost` (up to +0.16) and a `faceQualityMultiplier` (up to 1.04 for verified) applied to poche, outline, primary, secondary, tertiary, and hatch weights
- `cutFaceCount` and `cutProfileCount` are propagated from every cut-face detail service back to the section renderer for downstream credibility checks

Contextual and derived profile truth remain visibly thinner to avoid implying construction truth the section does not actually carry.

## Section ranking changes

Phase 21 section ranking promotes true cut-face construction truth ahead of all prior ranking heuristics.

The new Phase 21 sort precedence runs in this order (before falling through to Phase 20 precedence):

1. cut-face construction truth count
2. direct evidence score
3. cut-profile construction truth count
4. face credibility score
5. Phase 20 centralized direct-truth score
6. profile continuity

The Phase 21 usefulness bonus adds up to:

- +0.18 from cut-face count
- +0.08 from cut-profile count
- +0.08 from profile continuity
- +0.08 from face credibility score

The Phase 21 penalty removes credit when face credibility is blocked/weak, when cut-face and cut-profile truth are both absent, and when derived profile truth dominates. The section candidate quality gate now also downgrades any candidate whose face credibility is `blocked` or whose cut-face and cut-profile truth counts are both zero.

Rejected alternatives now explain Phase 21 differentials directly: "Rejected because its true cut-face construction truth was thinner or its section-face credibility was weaker."

## Credibility propagation

Phase 21 face credibility and cut-face/cut-profile counts flow through:

- `drawingFragmentQualityService` (per-panel propagation + Phase 21 version tag)
- `technicalPanelScoringService` (Phase 21 credibility gate blockers and warnings, richer section usefulness, Phase 21 version tag)
- `a1TechnicalPanelRegressionService` (face credibility aggregate, Phase 21 normalizeStatus branch, Phase 21 version tag)
- `a1TechnicalCredibilityService` (Phase 21 blockers/warnings, summary fields, Phase 21 version tag)
- `a1PublishabilityService` (Phase 21 evidenceProfile fields, post-compose warning filter, Phase 21 version tag)
- `a1PanelQualityChecks` (Phase 21 fields in output, Phase 21 version tag)
- `a1VerificationBundleService` (Phase 21 canonical verification fields, Phase 21 version tag)

## Route and flag surface

Phase 21 adds five feature flags, all default on:

- `useTrueGeometricSectioningPhase21`
- `useCentralizedSectionTruthModelPhase21`
- `useDraftingGradeSectionGraphicsPhase21`
- `useConstructionTruthDrivenSectionRankingPhase21`
- `useSectionConstructionCredibilityGatePhase21`

The `/api/models/project-readiness`, `/api/models/plan-a1-panels`, and `/api/models/project-health` routes now advertise the Phase 14 through Phase 21 flag surface.

## What is now guaranteed

- Phase 21 does not silently promote cut-profile truth into cut-face truth, nor derived profile truth into cut-profile truth.
- Section graphics visibly reward true cut-face truth and visibly degrade when only cut-profile or contextual/derived truth is available.
- Section ranking and rejection reasons explicitly cite cut-face, cut-profile, and face credibility differentials.
- Credibility propagation preserves Phase 12–20 contracts; Phase 21 adds additive fields and version tags without replacing earlier phases.
- All Phase 21 additions are gated behind Phase 21 feature flags; when flags are off, Phase 20 behavior is fully preserved.

## What remains heuristic

- Section-face extraction still leans on canonical geometry quality; it does not replace missing upstream primitives.
- True cut-face extraction is only as strong as the canonical primitive inputs. For thin upstream canonical roof/foundation geometry, face truth degrades honestly to `contextual_profile` or `derived_profile`.
- Sectioning is not full solid-model boolean sectioning; it is deterministic geometric cut-face and cut-profile reasoning.

## Phase 22 priority

Phase 22 should focus on deeper upstream canonical geometry (full solid wall/opening/stair/slab/roof/foundation primitives with complete top/bottom/level bounds) so Phase 21's cut-face extraction can claim `cut_face` truth on more primitives without relying on `cut_profile` or `contextual_profile` fallback.

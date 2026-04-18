# Phase 7: Technical Drawing Execution

## Scope

Phase 7 moves the backend from planning-heavy orchestration into minimum-scope execution for technical package recovery. Canonical geometry remains the source of truth. No technical panel truth is delegated to image generation.

## New backend capabilities

- Entity-aware dependency tracking now resolves impacts for rooms, walls, openings, stairs, facade components, section cuts, and panel candidates.
- Approved minimum-scope regeneration can now execute against technical drawings, facade sides, and visual package views.
- Technical drawing generation now adds deterministic annotation layout metadata, section markers, section semantics, and technical scoring-ready output.
- A1 readiness can now expose executable recovery suggestions through the recovery bridge.

## Technical quality guarantees in Phase 7

The backend can now guarantee:

- deterministic SVG generation from canonical geometry
- deterministic section candidate selection
- deterministic annotation placement rules and fallback metadata
- explicit technical panel scores and thresholds
- explicit stale/missing fragment tracking after executed regeneration

The backend still cannot guarantee:

- browser-perfect font rendering across environments
- perfect annotation collision avoidance for all unusual plans
- globally optimal repair or regeneration scope
- engineering-grade section logic beyond concept-level technical communication

## Annotation and text honesty

Phase 7 adds:

- fallback text when backend payloads are empty or invalid
- annotation placement validation
- explicit warnings for empty, broken, `undefined`, or `NaN` text/render payloads

This improves backend honesty. It does not claim full control of downstream browser font metrics.

## A1 technical panel gating

Technical panels can now be blocked for:

- stale source fragments
- missing source fragments
- annotation reliability failures
- technical score below blocking threshold
- weak section usefulness or label presence

The A1 bridge can translate blocked panels into exact regeneration suggestions. Execution remains opt-in.

## Deterministic vs heuristic

Deterministic:

- entity dependency graph
- entity impact resolution
- section candidate ordering
- annotation placement order and fallback order
- technical panel scoring thresholds
- minimum-scope regeneration execution plan application

Still heuristic:

- annotation collision avoidance
- section usefulness scoring
- elevation clarity scoring
- irregular-site fallback and partitioning
- repair search quality beyond the current constrained strategy set

## Phase 8

Phase 8 should focus on:

- stronger wall/opening-level technical regeneration
- section cuts tied more directly to actual cut geometry and occlusion logic
- auto-approved recovery execution flows with stronger safeguards
- broader drawing semantics for dimensions, tags, and schedules
- more reliable persisted technical package history and rollback

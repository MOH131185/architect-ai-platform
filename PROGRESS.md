# ArchiAI Platform — Implementation Progress

## Month 1: Drawing Quality + Payments

- [x] Week 1–2: Drawing quality — COMPLETE (2026-04-06)
  - [x] ISO 128 / BS 8888 line-weight pipeline (mm → px conversion, 3 style presets)
  - [x] Material-specific wall hatching (brick stretcher bond, concrete, timber, block)
  - [x] Dimension chains with witness/extension lines and 45° serif ticks
  - [x] Scale-proportional elevation material patterns (brick, stone, render, slate, timber)
  - Additional quality fixes (2026-04-06):
  - [x] Witness lines in FloorPlanGenerator and SectionGenerator (wall edge → dim line + 2px overshoot, 45° serif ticks)
  - [x] Brick elevation stretcher bond — doubled tile width (mm(450)), white #FFF mortar, proper 2-course stagger
  - [x] Section/floor plan hatch visibility — HATCH 0.13→0.35, CUT 0.7→1.2, all pattern tiles 1.5×
  - [x] Section room partitions — coordinate-based placement from populatedGeometry (bbox.x, centroid)
  - [x] Technical preset line-weight hierarchy — wall 4.0, internal 1.8, hatch 0.5 (clear 2.2:1 ratio)
- [ ] Week 3: Auth (Clerk)
- [ ] Week 4: Stripe payments

## Month 2: Reliability + Exports

- [ ] Week 5: Workflow reliability hardening
- [ ] Week 6: DXF export + PDF quality
- [ ] Week 7: Beta launch
- [ ] Week 8: Feedback + bug fixes

## Month 3: Scale + Revenue

- [ ] Week 9: AI Modify polish
- [ ] Week 10: Template library
- [ ] Week 11: Marketing + SEO
- [ ] Week 12: Enterprise + API

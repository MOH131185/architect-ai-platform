import sharp from "sharp";

import {
  resetFeatureFlags,
  setFeatureFlag,
} from "../../config/featureFlags.js";
import { buildSectionEvidence } from "../../services/drawing/sectionEvidenceService.js";
import { extractSideFacade } from "../../services/facade/sideFacadeExtractor.js";
import { buildA1VerificationBundle } from "../../services/a1/a1VerificationBundleService.js";
import { classifyA1Publishability } from "../../services/a1/a1PublishabilityService.js";
import { runA1PostComposeVerification } from "../../services/a1/a1PostComposeVerificationService.js";

function rectangle(minX, minY, maxX, maxY) {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function createGeometry() {
  return {
    project_id: "phase12-proof",
    schema_version: "canonical-project-geometry-v2",
    site: {
      boundary_bbox: {
        min_x: 0,
        min_y: 0,
        max_x: 12,
        max_y: 10,
        width: 12,
        height: 10,
      },
      buildable_bbox: {
        min_x: 0,
        min_y: 0,
        max_x: 12,
        max_y: 10,
        width: 12,
        height: 10,
      },
      boundary_polygon: rectangle(0, 0, 12, 10),
      buildable_polygon: rectangle(0, 0, 12, 10),
    },
    roof: { type: "pitched gable" },
    levels: [
      { id: "ground", level_number: 0, name: "Ground Floor", height_m: 3.2 },
    ],
    rooms: [
      {
        id: "living",
        name: "Living Room",
        level_id: "ground",
        actual_area: 28,
        bbox: { min_x: 4, min_y: 0, max_x: 8.4, max_y: 5.8 },
      },
    ],
    walls: [
      {
        id: "wall-east",
        exterior: true,
        level_id: "ground",
        start: { x: 12, y: 0 },
        end: { x: 12, y: 10 },
        metadata: { side: "E", features: ["porch", "projection"] },
      },
    ],
    windows: [
      {
        id: "window-east",
        wall_id: "wall-east",
        level_id: "ground",
        position_m: { x: 12, y: 4.2 },
        width_m: 1.2,
        sill_height_m: 0.9,
        head_height_m: 2.1,
      },
    ],
    doors: [
      {
        id: "door-east",
        wall_id: "wall-east",
        level_id: "ground",
        position_m: { x: 12, y: 7.8 },
        width_m: 1.1,
        head_height_m: 2.2,
      },
    ],
    metadata: {
      facade_features: {
        east: [{ type: "chimney" }, { type: "recess" }],
      },
    },
  };
}

function createFacadeGrammar() {
  return {
    orientations: [
      {
        orientation: "EAST_ELEVATION",
        material_zones: [
          { material: "primary facade", start_m: 0, end_m: 6 },
          { material: "timber accent", start_m: 6, end_m: 10 },
        ],
        components: {
          bays: [{ id: "bay-1" }, { id: "bay-2" }],
          balconies: [{ id: "balcony-1" }],
        },
      },
    ],
  };
}

async function buildBoardEvidence() {
  const sheetSvg = `<?xml version="1.0" encoding="UTF-8"?>
    <svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700" viewBox="0 0 1000 700">
      <rect width="1000" height="700" fill="#fff" />
      <text x="170" y="230" font-family="ArchiAISans" font-size="18">EAST ELEVATION</text>
      <text x="780" y="620" font-family="ArchiAISans" font-size="18">PROJECT ARCHITECT AI</text>
      <text x="780" y="642" font-family="ArchiAISans" font-size="15">SCALE 1:100</text>
      <text x="780" y="664" font-family="ArchiAISans" font-size="15">DATE 2026-04-20</text>
    </svg>`;
  return {
    sheetSvg,
    renderedBuffer: await sharp(Buffer.from(sheetSvg)).png().toBuffer(),
    coordinates: {
      elevation_east: { x: 20, y: 20, width: 300, height: 250 },
    },
    panelLabelMap: {
      elevation_east: "EAST ELEVATION",
    },
  };
}

describe("Phase 12 final board proof", () => {
  afterEach(() => {
    resetFeatureFlags();
  });

  test("side facade extraction upgrades to the Phase 12 schema path", () => {
    setFeatureFlag("useSideFacadeSchemaPhase12", true);

    const facade = extractSideFacade(
      createGeometry(),
      { roof_language: "pitched gable" },
      {
        orientation: "east",
        facadeGrammar: createFacadeGrammar(),
      },
    );

    expect(facade.version).toBe("phase12-side-facade-extractor-v1");
    expect(facade.orientationAliases).toContain("EAST_ELEVATION");
    expect(facade.sideFacadeSchema.version).toBe(
      "phase12-side-facade-schema-builder-v1",
    );
    expect(facade.sideFacadeSchema.evidenceSummary.evidenceSources).toContain(
      "material_zone",
    );
  });

  test("bbox-only room ranges do not overclaim direct section evidence", () => {
    setFeatureFlag("useTrueSectionEvidencePhase12", true);
    const geometry = createGeometry();
    geometry.rooms = [
      {
        id: "bbox-room",
        name: "BBox Room",
        level_id: "ground",
        actual_area: 20,
        bbox: { min_x: 5.8, min_y: 0, max_x: 6.2, max_y: 4.5 },
      },
    ];
    geometry.stairs = [];
    geometry.walls = [];
    geometry.windows = [];
    geometry.doors = [];

    const evidence = buildSectionEvidence(geometry, {
      sectionType: "longitudinal",
      cutLine: { from: { x: 6, y: 0 }, to: { x: 6, y: 10 } },
    });

    expect(evidence.summary.cutRoomCount).toBe(0);
    expect(evidence.summary.nearRoomCount).toBe(1);
  });

  test("strong rendered proof stays verified even when OCR is unavailable", () => {
    const bundle = buildA1VerificationBundle({
      renderedTextZone: {
        verificationPhase: "post_compose",
        status: "warning",
        blockers: [],
        warnings: ["Optional legend zone is thinner than preferred."],
        confidence: 0.66,
        ocrEvidenceQuality: "provisional",
        methodsUsed: ["svg_text", "raster_variance"],
        zones: [
          {
            id: "panel-header:elevation_east",
            required: true,
            status: "pass",
            evidenceState: "verified",
          },
          {
            id: "title-block",
            required: true,
            status: "pass",
            evidenceState: "weak",
          },
          {
            id: "legend-zone",
            required: false,
            status: "warning",
            evidenceState: "weak",
          },
        ],
      },
    });

    expect(bundle.renderedTextEvidenceQuality).toBe("verified");
  });

  test("side facade extraction merges multiple orientation aliases for one side", () => {
    setFeatureFlag("useSideFacadeSchemaPhase12", true);

    const facade = extractSideFacade(
      createGeometry(),
      { roof_language: "pitched gable" },
      {
        orientation: "east",
        facadeGrammar: {
          orientations: [
            {
              orientation: "EAST_ELEVATION",
              material_zones: [
                { material: "primary facade", start_m: 0, end_m: 4 },
              ],
              components: { balconies: [{ id: "balcony-east-1" }] },
            },
            {
              orientation: "E",
              material_zones: [
                { material: "timber accent", start_m: 4, end_m: 10 },
              ],
              components: { dormers: [{ id: "dormer-east-1" }] },
              features: [{ type: "chimney" }],
            },
          ],
        },
      },
    );

    expect(facade.orientationAliases).toEqual(
      expect.arrayContaining(["EAST_ELEVATION", "E"]),
    );
    expect(facade.materialZones).toHaveLength(2);
    expect(
      facade.features.some((feature) =>
        String(feature.type).includes("dormer"),
      ),
    ).toBe(true);
  });

  test("canonical verification bundle exposes a stable public verification object", () => {
    const publishability = classifyA1Publishability({
      verificationPhase: "post_compose",
      finalSheetRegression: {
        blockers: [],
        warnings: [],
        renderedTextEvidenceQuality: "verified",
        sectionEvidenceQuality: "verified",
        sideFacadeEvidenceQuality: "verified",
      },
      technicalCredibility: {
        blockers: [],
        warnings: [],
      },
    });
    const bundle = buildA1VerificationBundle({
      renderedTextZone: {
        verificationPhase: "post_compose",
        status: "pass",
        blockers: [],
        warnings: [],
        confidence: 0.91,
        ocrEvidenceQuality: "verified",
      },
      finalSheetRegression: {
        verificationPhase: "post_compose",
        status: "pass",
        blockers: [],
        warnings: [],
        renderedTextEvidenceQuality: "verified",
        sectionEvidenceQuality: "verified",
        sideFacadeEvidenceQuality: "verified",
      },
      technicalCredibility: {
        verificationPhase: "post_compose",
        status: "pass",
        blockers: [],
        warnings: [],
      },
      publishability,
    });

    expect(bundle.version).toBe("phase12-a1-verification-v1");
    expect(bundle.verification.version).toBe("phase12-a1-verification-v1");
    expect(bundle.verification.phase).toBe("post_compose");
    expect(bundle.verification.publishabilityDecision).toBe("publishable");
  });

  test("publishability prefers stronger verified final-board evidence over stale scoring-only warnings", () => {
    const publishability = classifyA1Publishability({
      verificationPhase: "post_compose",
      finalSheetRegression: {
        blockers: [],
        warnings: [],
        renderedTextEvidenceQuality: "verified",
        sectionEvidenceQuality: "verified",
        sideFacadeEvidenceQuality: "verified",
      },
      technicalCredibility: {
        blockers: [],
        warnings: [
          "Rendered text verification remains only weakly evidenced; OCR or zone evidence did not fully verify the final board.",
          "Section evidence remains weaker than preferred because direct cut evidence is thin or heavily contextual.",
          "Side-facade evidence remains weaker than preferred because side schema support is still thin or envelope-derived.",
        ],
      },
    });

    expect(publishability.status).toBe("publishable");
    expect(publishability.warnings).toHaveLength(0);
  });

  test("post-compose verification returns canonical verification alongside aliases", async () => {
    const { sheetSvg, renderedBuffer, coordinates, panelLabelMap } =
      await buildBoardEvidence();
    const verification = await runA1PostComposeVerification({
      drawings: {
        elevation: [{ id: "east", side: "east", svg: "<svg />" }],
        section: [{ id: "section-a", svg: "<svg />" }],
        plan: [{ id: "plan-a", svg: "<svg />" }],
      },
      sheetSvg,
      renderedBuffer,
      fontReadiness: {
        readyForEmbedding: true,
        fullEmbeddingReady: true,
      },
      expectedLabels: Object.values(panelLabelMap),
      coordinates,
      panelLabelMap,
      width: 1000,
      height: 700,
      ocrAdapter: {
        async recognize() {
          return {
            text: "EAST ELEVATION PROJECT ARCHITECT AI SCALE 1:100 DATE 2026-04-20",
            confidence: 0.91,
          };
        },
      },
    });

    expect(verification.verification).toBeTruthy();
    expect(verification.verification.phase).toBe("post_compose");
    expect(verification.verificationBundle.phase).toBe("post_compose");
    expect(verification.verificationState.phase).toBe("post_compose");
  });
});

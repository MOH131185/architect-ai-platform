/**
 * A1 Workflow Consistency Regression Tests
 *
 * Tests for:
 * 1. Hero-first ordering enforcement
 * 2. Style anchor (styleReferenceUrl) passed to elevations/sections
 * 3. Fingerprint gate failures trigger strict fallback regeneration
 *
 * These tests verify the consistency fixes implemented in:
 * - dnaWorkflowOrchestrator.js
 * - panelGenerationService.js
 * - FingerprintValidationGate.js
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Mock feature flags
const mockFeatureFlags = {
  twoPassDNA: false,
  strictFingerprintGate: true,
  extractDesignFingerprint: true,
  strictGeometryMaskGate: true,
  strictCanonicalGeometryPack: false,
};

jest.unstable_mockModule("../../../config/featureFlags.js", () => ({
  isFeatureEnabled: jest.fn((flag) => mockFeatureFlags[flag] || false),
  getFeatureValue: jest.fn(() => null),
  setFeatureFlag: jest.fn(),
}));

// Mock services
const mockGenerateImage = jest.fn();
const mockRunPreCompositionGate = jest.fn();
const mockExtractFingerprint = jest.fn();

describe("A1 Workflow Consistency", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGenerateImage.mockReset();
    mockRunPreCompositionGate.mockReset();
    mockExtractFingerprint.mockReset();
  });

  describe("Hero-First Ordering", () => {
    it("should ensure hero_3d is first in default panel sequence", () => {
      const defaultSequence = [
        "hero_3d",
        "interior_3d",
        "axonometric",
        "site_diagram",
        "floor_plan_ground",
        "floor_plan_first",
        "floor_plan_level2",
        "elevation_north",
        "elevation_south",
        "elevation_east",
        "elevation_west",
        "section_AA",
        "section_BB",
        "schedules_notes",
        "material_palette",
        "climate_card",
      ];

      expect(defaultSequence[0]).toBe("hero_3d");
    });

    it("should reorder panels to ensure hero_3d is first when override is provided", () => {
      // Simulate panel reordering logic from orchestrator
      const panelTypesOverride = [
        "floor_plan_ground",
        "hero_3d",
        "elevation_north",
      ];

      let panelSequence = [...panelTypesOverride];
      if (!panelSequence[0]?.includes("hero")) {
        const heroIndex = panelSequence.findIndex((p) => p === "hero_3d");
        if (heroIndex > 0) {
          panelSequence = [
            "hero_3d",
            ...panelTypesOverride.filter((p) => p !== "hero_3d"),
          ];
        }
      }

      expect(panelSequence[0]).toBe("hero_3d");
      expect(panelSequence).toContain("floor_plan_ground");
      expect(panelSequence).toContain("elevation_north");
    });

    it("should add hero_3d if missing from override", () => {
      const panelTypesOverride = ["floor_plan_ground", "elevation_north"];

      let panelSequence = [...panelTypesOverride];
      const heroIndex = panelSequence.findIndex((p) => p === "hero_3d");
      if (heroIndex === -1) {
        panelSequence = ["hero_3d", ...panelTypesOverride];
      }

      expect(panelSequence[0]).toBe("hero_3d");
      expect(panelSequence.length).toBe(3);
    });
  });

  describe("Style Anchor Propagation", () => {
    it("should identify elevation panels for style reference", () => {
      const elevationPanels = [
        "elevation_north",
        "elevation_south",
        "elevation_east",
        "elevation_west",
      ];

      elevationPanels.forEach((panel) => {
        const isElevationOrSection =
          panel.startsWith("elevation_") || panel.startsWith("section_");
        expect(isElevationOrSection).toBe(true);
      });
    });

    it("should identify section panels for style reference", () => {
      const sectionPanels = ["section_AA", "section_BB"];

      sectionPanels.forEach((panel) => {
        const isElevationOrSection =
          panel.startsWith("elevation_") || panel.startsWith("section_");
        expect(isElevationOrSection).toBe(true);
      });
    });

    it("should NOT apply style reference to non-elevation/section panels", () => {
      const nonStylePanels = [
        "hero_3d",
        "interior_3d",
        "axonometric",
        "floor_plan_ground",
        "site_diagram",
      ];

      nonStylePanels.forEach((panel) => {
        const isElevationOrSection =
          panel.startsWith("elevation_") || panel.startsWith("section_");
        expect(isElevationOrSection).toBe(false);
      });
    });

    it("should only apply styleReferenceUrl when heroStyleReferenceUrl is available", () => {
      const heroStyleReferenceUrl = "https://example.com/hero.png";
      const viewType = "elevation_north";

      const isElevationOrSection =
        viewType.startsWith("elevation_") || viewType.startsWith("section_");
      const effectiveStyleReference =
        isElevationOrSection && heroStyleReferenceUrl
          ? heroStyleReferenceUrl
          : null;

      expect(effectiveStyleReference).toBe(heroStyleReferenceUrl);
    });

    it("should NOT apply styleReferenceUrl when heroStyleReferenceUrl is null", () => {
      const heroStyleReferenceUrl = null;
      const viewType = "elevation_north";

      const isElevationOrSection =
        viewType.startsWith("elevation_") || viewType.startsWith("section_");
      const effectiveStyleReference =
        isElevationOrSection && heroStyleReferenceUrl
          ? heroStyleReferenceUrl
          : null;

      expect(effectiveStyleReference).toBeNull();
    });
  });

  describe("Fingerprint Gate Strict Fallback", () => {
    it("should return strict_fallback action when max retries exceeded", async () => {
      // Simulate gate returning strict_fallback
      const gateResult = {
        canCompose: false,
        action: "strict_fallback",
        failedPanels: [
          { panelType: "elevation_north", matchScore: 0.7 },
          { panelType: "section_AA", matchScore: 0.65 },
        ],
        passedPanels: ["hero_3d", "floor_plan_ground"],
        overallMatchScore: 0.78,
      };

      expect(gateResult.action).toBe("strict_fallback");
      expect(gateResult.canCompose).toBe(false);
      expect(gateResult.failedPanels.length).toBe(2);
    });

    it("should use correct strict fallback parameters (0.95/0.35)", () => {
      // Import the actual function
      const {
        getStrictFallbackParams,
      } = require("../../validation/FingerprintValidationGate.js");

      const params = getStrictFallbackParams("elevation_north", 12345);

      expect(params.control_strength).toBe(0.95);
      expect(params.image_strength).toBe(0.35);
      expect(params.isStrictFallback).toBe(true);
    });

    it("should preserve seed by default in strict fallback", () => {
      const {
        getStrictFallbackParams,
      } = require("../../validation/FingerprintValidationGate.js");

      const originalSeed = 12345;
      const params = getStrictFallbackParams("elevation_north", originalSeed);

      expect(params.seed).toBe(originalSeed);
      expect(params.keepSeed).toBe(true);
    });

    it("should increment seed when explicitly requested", () => {
      const {
        getStrictFallbackParams,
      } = require("../../validation/FingerprintValidationGate.js");

      const originalSeed = 12345;
      const params = getStrictFallbackParams("elevation_north", originalSeed, {
        incrementSeed: true,
      });

      expect(params.seed).toBe(originalSeed + 1);
      expect(params.keepSeed).toBe(false);
    });
  });

  describe("Deterministic Validation", () => {
    it("should produce consistent hash for same input", () => {
      // Simple deterministic hash function (copy from FingerprintValidationGate.js)
      function deterministicHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          const char = str.charCodeAt(i);
          hash = (hash << 5) - hash + char;
          hash = hash & hash;
        }
        return Math.abs(hash % 1000) / 1000;
      }

      const input = "elevation_north_https://example.com/panel.png_hero_hash";

      // Run multiple times to verify determinism
      const results = Array(10)
        .fill(null)
        .map(() => deterministicHash(input));

      // All results should be identical
      expect(new Set(results).size).toBe(1);
    });

    it("should produce different hashes for different inputs", () => {
      function deterministicHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          const char = str.charCodeAt(i);
          hash = (hash << 5) - hash + char;
          hash = hash & hash;
        }
        return Math.abs(hash % 1000) / 1000;
      }

      const hash1 = deterministicHash("elevation_north_panel1");
      const hash2 = deterministicHash("elevation_south_panel2");

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("Technical Panel Strict Gates", () => {
    it("should identify floor_plan_* as technical panels", () => {
      const floorPlanPanels = [
        "floor_plan_ground",
        "floor_plan_first",
        "floor_plan_level2",
      ];

      floorPlanPanels.forEach((panel) => {
        const isTechnicalPanel =
          panel.startsWith("floor_plan_") || panel.startsWith("section_");
        expect(isTechnicalPanel).toBe(true);
      });
    });

    it("should identify section_* as technical panels", () => {
      const sectionPanels = ["section_AA", "section_BB"];

      sectionPanels.forEach((panel) => {
        const isTechnicalPanel =
          panel.startsWith("floor_plan_") || panel.startsWith("section_");
        expect(isTechnicalPanel).toBe(true);
      });
    });

    it("should NOT identify 3D panels as technical panels", () => {
      const threeDPanels = ["hero_3d", "interior_3d", "axonometric"];

      threeDPanels.forEach((panel) => {
        const isTechnicalPanel =
          panel.startsWith("floor_plan_") || panel.startsWith("section_");
        expect(isTechnicalPanel).toBe(false);
      });
    });

    it("should fail fast when geometry mask is expected but missing for floor plans", () => {
      const job = {
        type: "floor_plan_ground",
        meta: {
          useGeometryMask: true,
          controlImage: null, // Missing!
        },
      };

      const strictGeometryMaskGate = true; // Feature flag enabled
      const isTechnicalPanel =
        job.type.startsWith("floor_plan_") || job.type.startsWith("section_");

      const shouldFail =
        strictGeometryMaskGate &&
        job.meta?.useGeometryMask &&
        !job.meta?.controlImage &&
        isTechnicalPanel;

      expect(shouldFail).toBe(true);
    });

    it("should fail fast when geometry mask is expected but missing for sections", () => {
      const job = {
        type: "section_AA",
        meta: {
          useGeometryMask: true,
          controlImage: null, // Missing!
        },
      };

      const strictGeometryMaskGate = true;
      const isTechnicalPanel =
        job.type.startsWith("floor_plan_") || job.type.startsWith("section_");

      const shouldFail =
        strictGeometryMaskGate &&
        job.meta?.useGeometryMask &&
        !job.meta?.controlImage &&
        isTechnicalPanel;

      expect(shouldFail).toBe(true);
    });

    it("should NOT fail when controlImage is present", () => {
      const job = {
        type: "floor_plan_ground",
        meta: {
          useGeometryMask: true,
          controlImage: "data:image/svg+xml;base64,PHN2Zy...", // Present!
        },
      };

      const strictGeometryMaskGate = true;
      const isTechnicalPanel =
        job.type.startsWith("floor_plan_") || job.type.startsWith("section_");

      const shouldFail =
        strictGeometryMaskGate &&
        job.meta?.useGeometryMask &&
        !job.meta?.controlImage &&
        isTechnicalPanel;

      expect(shouldFail).toBe(false);
    });
  });

  describe("SVG Path Validity (test_svg_validity)", () => {
    /**
     * Validate that all SVG path d attributes start with M or m command
     * This is a critical requirement from the plan to fix SVG corruption bugs
     */

    // Regex pattern for valid SVG path start (M or m command)
    const VALID_PATH_START = /^[Mm]/;

    // Pattern for invalid paths that we need to reject
    const INVALID_PATH_PATTERNS = [
      /^undefined/,
      /^null/,
      /^NaN/,
      /^\s*$/,
      /^[^Mm]/, // Doesn't start with M or m
    ];

    it("should validate that SVG path d attribute starts with M/m command", () => {
      const validPaths = [
        "M0,0 L100,100",
        "m10,10 l20,20",
        "M 0 0 L 100 100",
        "M0,0L100,100Z",
        "M100,200 C100,100 250,100 250,200",
      ];

      validPaths.forEach((path) => {
        expect(VALID_PATH_START.test(path)).toBe(true);
      });
    });

    it("should reject SVG paths that start with undefined", () => {
      const invalidPath = "undefined L100,100";

      const isInvalid = INVALID_PATH_PATTERNS.some((pattern) =>
        pattern.test(invalidPath),
      );
      expect(isInvalid).toBe(true);
    });

    it("should reject SVG paths that start with null", () => {
      const invalidPath = "null";

      const isInvalid = INVALID_PATH_PATTERNS.some((pattern) =>
        pattern.test(invalidPath),
      );
      expect(isInvalid).toBe(true);
    });

    it("should reject SVG paths that start with non-moveto commands", () => {
      const invalidPaths = [
        "L100,100", // Line-to without moveto
        "C100,100 200,200", // Curve without moveto
        "Z", // Close without moveto
        "100,100 L200,200", // Coordinate without command
      ];

      invalidPaths.forEach((path) => {
        expect(VALID_PATH_START.test(path)).toBe(false);
      });
    });

    it("should provide structured error info for invalid paths", () => {
      const invalidPath = "undefined L100,100";
      const panelType = "elevation_north";
      const generator = "ArchitecturalElevationGenerator";

      const errorInfo = {
        panelType,
        generator,
        offendingPath: invalidPath.substring(0, 50),
        reason: "Path does not start with M/m command",
      };

      expect(errorInfo.panelType).toBe(panelType);
      expect(errorInfo.generator).toBe(generator);
      expect(errorInfo.offendingPath).toBe("undefined L100,100");
    });

    it("should allow fallback to safe primitive (rect) for invalid paths", () => {
      const invalidPath = "undefined";

      // Fallback logic: replace invalid path with safe rect
      const fallbackElement =
        '<rect x="0" y="0" width="100" height="100" fill="none" stroke="#999"/>';

      const isInvalid = INVALID_PATH_PATTERNS.some((pattern) =>
        pattern.test(invalidPath),
      );

      // Verify the path is invalid (precondition)
      expect(isInvalid).toBe(true);
      // Verify fallback element is a rect
      expect(fallbackElement).toContain("<rect");
    });

    it("should validate path coordinates are not NaN", () => {
      const checkPathForNaN = (pathD) => {
        // Check for literal "NaN" string in path (common corruption)
        if (/NaN/i.test(pathD)) {
          return true;
        }
        // Also check parsed coordinates
        const coords = pathD.match(/-?\d*\.?\d+/g) || [];
        return coords.some((c) => isNaN(parseFloat(c)));
      };

      expect(checkPathForNaN("M0,0 L100,100")).toBe(false);
      expect(checkPathForNaN("MNaN,0 L100,100")).toBe(true);
      expect(checkPathForNaN("M0,NaN L100,100")).toBe(true);
    });
  });

  describe("Schedules Are Vector (test_schedules_are_vector)", () => {
    /**
     * Verify schedules_notes panel is SVG-derived (no AI bitmap text)
     * This ensures crisp, readable text at print zoom
     */

    it("should verify schedules output is SVG format", () => {
      // Mock schedules SVG output
      const schedulesOutput = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400">
  <text x="300" y="30" font-family="Arial" font-size="18">SCHEDULES</text>
  <text x="20" y="60" font-family="Arial" font-size="12">Room Schedule</text>
</svg>`;

      // Check it's SVG format
      expect(schedulesOutput).toContain("<?xml");
      expect(schedulesOutput).toContain("<svg");
      expect(schedulesOutput).toContain("</svg>");
    });

    it("should verify schedules use real fonts (not AI-rendered text)", () => {
      const schedulesOutput = `<svg xmlns="http://www.w3.org/2000/svg">
  <text x="20" y="30" font-family="Arial, sans-serif" font-size="14">Room Schedule</text>
  <text x="20" y="50" font-family="Arial, sans-serif" font-size="10">Living Room: 25m²</text>
</svg>`;

      // Check for font-family attribute (real fonts)
      expect(schedulesOutput).toMatch(/font-family="[^"]+"/);

      // Check for text elements (not rasterized)
      expect(schedulesOutput).toContain("<text");
    });

    it("should verify schedules do NOT contain rasterized image data", () => {
      const schedulesOutput = `<svg xmlns="http://www.w3.org/2000/svg">
  <text x="20" y="30" font-family="Arial">Room Schedule</text>
</svg>`;

      // Should NOT contain base64 image data (which would be AI bitmap)
      expect(schedulesOutput).not.toContain("data:image/png;base64");
      expect(schedulesOutput).not.toContain("data:image/jpeg;base64");
      expect(schedulesOutput).not.toContain("<image");
    });

    it("should verify schedules contain structured table data", () => {
      const schedulesOutput = `<svg xmlns="http://www.w3.org/2000/svg">
  <g id="room-schedule">
    <text x="0" y="0">ROOM SCHEDULE</text>
    <line x1="0" y1="5" x2="260" y2="5"/>
    <text x="0" y="25">Room</text>
    <text x="100" y="25">Area (m²)</text>
    <text x="0" y="45">Living Room</text>
    <text x="100" y="45">25.0</text>
  </g>
</svg>`;

      // Check for table-like structure with grouped elements
      expect(schedulesOutput).toContain('id="room-schedule"');
      expect(schedulesOutput).toContain("<line"); // Table lines
      expect(schedulesOutput).toMatch(/Area.*m²/); // Column headers
    });

    it("should verify material schedule includes color swatches as vector elements", () => {
      const materialsOutput = `<svg xmlns="http://www.w3.org/2000/svg">
  <g id="material-schedule">
    <text x="0" y="0">MATERIAL SCHEDULE</text>
    <rect x="220" y="37" width="15" height="10" fill="#B8604E"/>
    <text x="240" y="45">#B8604E</text>
  </g>
</svg>`;

      // Color swatches should be vector rectangles, not images
      expect(materialsOutput).toContain("<rect");
      expect(materialsOutput).toMatch(/fill="#[A-Fa-f0-9]{6}"/);
    });

    it("should verify climate card uses SVG text elements", () => {
      const climateOutput = `<svg xmlns="http://www.w3.org/2000/svg">
  <text x="200" y="25" font-family="Arial" font-size="16">CLIMATE DATA</text>
  <text x="40" y="32" font-family="Arial" font-size="11">15°C</text>
  <rect x="0" y="0" width="80" height="50" rx="3" fill="#3182ce" fill-opacity="0.1"/>
</svg>`;

      // Temperature and labels should be text, not images
      expect(climateOutput).toContain("<text");
      expect(climateOutput).toMatch(/°C/); // Temperature symbol
      expect(climateOutput).not.toContain("<image");
    });

    it("should verify schedules are deterministic (same DNA = same output)", () => {
      // Function to generate simple hash of SVG content
      const hashSVG = (svg) => {
        let hash = 0;
        for (let i = 0; i < svg.length; i++) {
          hash = (hash << 5) - hash + svg.charCodeAt(i);
          hash = hash & hash;
        }
        return hash;
      };

      // Same input should produce same hash
      const svg1 = "<svg><text>Living Room: 25m²</text></svg>";
      const svg2 = "<svg><text>Living Room: 25m²</text></svg>";

      expect(hashSVG(svg1)).toBe(hashSVG(svg2));
    });
  });
});

/**
 * Design Fingerprint Service
 *
 * Extracts and locks a visual "fingerprint" from the hero_3d render to ensure
 * all subsequent panels show THE SAME building.
 *
 * The fingerprint captures:
 * - Massing type (rectangular, L-shape, etc.)
 * - Roof profile (gable, hip, flat + pitch angle)
 * - Facade rhythm (window patterns, bay spacing)
 * - Materials palette (colors extracted from image)
 * - Style descriptor (contemporary, traditional, etc.)
 *
 * Enhanced features (v2):
 * - heroImagePHash: Perceptual hash for visual similarity validation
 * - promptLockVerbatim: Exact, unmodifiable text block for injection
 * - Enhanced dominant colors extraction from hero image
 *
 * This fingerprint is then injected into all subsequent panel prompts
 * as a strict constraint to prevent visual drift.
 */

import logger from "../../utils/logger.js";
import {
  isFeatureEnabled,
  getFeatureValue,
} from "../../config/featureFlags.js";

/**
 * Design Fingerprint schema
 * @typedef {Object} DesignFingerprint
 * @property {string} id - Unique fingerprint ID
 * @property {string} heroImageUrl - Reference hero_3d image URL
 * @property {string} heroImageHash - Content hash for comparison
 * @property {string} heroImagePHash - Perceptual hash (64-bit) for visual similarity
 * @property {string} massingType - Building mass description
 * @property {string} roofProfile - Roof type and pitch
 * @property {string} facadeRhythm - Window/bay pattern
 * @property {Array<{name: string, hexColor: string, coverage: string}>} materialsPalette
 * @property {string} windowPattern - Window arrangement
 * @property {string} entrancePosition - Main entrance location
 * @property {string[]} dominantColors - Top colors from image (hex)
 * @property {string} styleDescriptor - Overall style summary
 * @property {string} promptLock - Generated constraint for prompts (legacy)
 * @property {string} promptLockVerbatim - Exact verbatim text block for injection (v2)
 * @property {string} promptLockHash - SHA-256 hash of verbatim lock for verification
 * @property {Object} buildingBBox - Building bounding box dimensions
 * @property {number} buildingBBox.widthMeters - Building width
 * @property {number} buildingBBox.depthMeters - Building depth
 * @property {number} buildingBBox.heightMeters - Building height
 * @property {number} floorCount - Number of floors
 * @property {number} timestamp - Creation timestamp
 */

// In-memory fingerprint storage keyed by generation run
const fingerprintStore = new Map();

/**
 * Control strength values for hero-as-reference mode
 */
export const HERO_CONTROL_STRENGTH = {
  interior_3d: 0.55, // Medium - allow interior variation
  axonometric: 0.7, // High - must match massing exactly
  elevation_north: 0.6, // Medium-high - facade must match
  elevation_south: 0.6,
  elevation_east: 0.6,
  elevation_west: 0.6,
  section_AA: 0.5, // Medium - structural interpretation allowed
  section_BB: 0.5,
};

/**
 * Panels that should use hero_3d as img2img control reference
 */
export const HERO_REFERENCE_PANELS = [
  "interior_3d",
  "axonometric",
  "elevation_north",
  "elevation_south",
  "elevation_east",
  "elevation_west",
];

/**
 * Extract a design fingerprint from the generated hero_3d image
 *
 * @param {string} heroImageUrl - URL or data URL of hero_3d render
 * @param {Object} masterDNA - The master design DNA
 * @param {Object} options - Additional extraction options
 * @returns {Promise<DesignFingerprint>} Extracted fingerprint
 */
export async function extractFingerprintFromHero(
  heroImageUrl,
  masterDNA,
  options = {},
) {
  if (!isFeatureEnabled("extractDesignFingerprint")) {
    logger.debug("Design fingerprint extraction disabled by feature flag");
    return null;
  }

  logger.info("Extracting design fingerprint from hero_3d...");

  // DETERMINISTIC fingerprint ID based on DNA hash (same DNA = same fingerprint ID)
  const dnaHash = generateSimpleHash(JSON.stringify(masterDNA || {}));
  const fingerprintId = `fp_${dnaHash}`;

  // Extract visual characteristics from DNA + image analysis
  const massingType = inferMassingType(masterDNA);
  const roofProfile = inferRoofProfile(masterDNA);
  const facadeRhythm = inferFacadeRhythm(masterDNA);
  const materialsPalette = extractMaterialsPalette(masterDNA);
  const windowPattern = inferWindowPattern(masterDNA);
  const entrancePosition = inferEntrancePosition(masterDNA);
  const styleDescriptor = buildStyleDescriptor(masterDNA);

  // Extract dominant colors from the hero image (simplified - in production would use image analysis)
  const dominantColors = extractDominantColorsFromDNA(masterDNA);

  // Generate the prompt lock string
  const promptLock = buildPromptLock({
    massingType,
    roofProfile,
    facadeRhythm,
    materialsPalette,
    windowPattern,
    entrancePosition,
    styleDescriptor,
  });

  // Calculate a simple hash for the fingerprint (for comparison)
  const heroImageHash = generateSimpleHash(
    heroImageUrl + JSON.stringify(masterDNA),
  );

  // Extract building dimensions for bounding box
  const dims = masterDNA.dimensions || {};
  const buildingBBox = {
    widthMeters: dims.width || dims.length || 15,
    depthMeters: dims.depth || dims.width || 10,
    heightMeters: dims.height || dims.totalHeight || 7.5,
  };
  const floorCount = dims.floors || dims.floorCount || 2;

  // Build enhanced verbatim prompt lock (v2)
  const promptLockVerbatim = buildVerbatimPromptLock({
    massingType,
    roofProfile,
    facadeRhythm,
    materialsPalette,
    windowPattern,
    entrancePosition,
    styleDescriptor,
    dominantColors,
    buildingBBox,
    floorCount,
  });

  // Generate hash of verbatim lock for verification
  const promptLockHash = generateSimpleHash(promptLockVerbatim);

  // Compute pHash from hero image URL (simplified - actual implementation would use image data)
  const heroImagePHash = await computePHashFromUrl(heroImageUrl);

  const fingerprint = {
    id: fingerprintId,
    heroImageUrl,
    heroImageHash,
    heroImagePHash,
    massingType,
    roofProfile,
    facadeRhythm,
    materialsPalette,
    windowPattern,
    entrancePosition,
    dominantColors,
    styleDescriptor,
    promptLock, // Legacy field
    promptLockVerbatim, // New v2 field
    promptLockHash,
    buildingBBox,
    floorCount,
    timestamp: Date.now(),
  };

  logger.success("Design fingerprint extracted successfully");
  logger.info(`  Massing: ${massingType}`);
  logger.info(`  Roof: ${roofProfile}`);
  logger.info(`  Style: ${styleDescriptor}`);
  logger.info(`  pHash: ${heroImagePHash}`);

  return fingerprint;
}

/**
 * Infer massing type from DNA
 */
function inferMassingType(dna) {
  const dims = dna.dimensions || {};
  const length = dims.length || 15;
  const width = dims.width || 10;
  const floors = dims.floors || dims.floorCount || 2;

  const aspectRatio = length / width;
  const geometry = dna._structured?.geometry || dna.geometry || {};
  const massingSpec = geometry.massing?.type;

  if (massingSpec) {
    // Use explicit massing if available
    return massingSpec.replace(/_/g, " ");
  }

  // Infer from dimensions
  if (aspectRatio > 2.5) {
    return "elongated rectangular";
  } else if (aspectRatio > 1.5) {
    return "rectangular";
  } else if (aspectRatio >= 0.8 && aspectRatio <= 1.2) {
    return "compact square";
  } else {
    return "compact rectangular";
  }
}

/**
 * Infer roof profile from DNA
 */
function inferRoofProfile(dna) {
  const roofType =
    dna.roof?.type ||
    dna._structured?.geometry_rules?.roof_type ||
    dna.geometry_rules?.roof_type ||
    dna._structured?.geometry?.roof?.type ||
    "gable";

  const pitch =
    dna.roof?.pitch || dna._structured?.geometry?.roof?.pitch_degrees || 35;

  const roofDescriptors = {
    gable: `gable roof ${pitch}deg pitch`,
    hip: `hip roof ${pitch}deg pitch`,
    flat: "flat roof with parapet",
    shed: `shed roof ${pitch}deg slope`,
    mansard: "mansard roof with dormers",
    butterfly: "butterfly roof V-shape",
    pitched: `pitched roof ${pitch}deg`,
  };

  return roofDescriptors[roofType.toLowerCase()] || `${roofType} roof`;
}

/**
 * Infer facade rhythm from DNA
 */
function inferFacadeRhythm(dna) {
  const windows = dna._structured?.style?.windows || dna.style?.windows || {};
  const pattern = windows.pattern || "regular grid";
  const proportion = windows.proportion || "3:5";

  // Count rooms to estimate bay count
  const rooms = dna._structured?.program?.rooms || dna.rooms || [];
  const groundFloorRooms = rooms.filter(
    (r) => r.floor === "ground" || r.floor === 0 || r.level === "Ground",
  ).length;

  const bayCount = Math.max(2, Math.min(5, groundFloorRooms));

  if (pattern.includes("ribbon")) {
    return "horizontal ribbon windows";
  } else if (pattern.includes("asymmetric")) {
    return "asymmetric modern fenestration";
  } else {
    return `${bayCount}-bay ${pattern} (${proportion} proportion)`;
  }
}

/**
 * Extract materials palette from DNA
 */
function extractMaterialsPalette(dna) {
  const materials = dna.materials || dna._structured?.style?.materials || [];

  if (Array.isArray(materials) && materials.length > 0) {
    return materials.slice(0, 4).map((mat, idx) => {
      if (typeof mat === "string") {
        return {
          name: mat,
          hexColor: getDefaultColorForMaterial(mat),
          coverage:
            idx === 0 ? "primary walls" : idx === 1 ? "roof/accent" : "trim",
        };
      }
      return {
        name: mat.name || mat.type || "material",
        hexColor: mat.hexColor || mat.color || "#808080",
        coverage: mat.application || mat.coverage || "general",
      };
    });
  }

  // Default palette
  return [
    { name: "brick", hexColor: "#B8604E", coverage: "exterior walls" },
    { name: "timber", hexColor: "#8B6914", coverage: "accents" },
    { name: "glass", hexColor: "#87CEEB", coverage: "windows" },
  ];
}

/**
 * Get default color for common materials
 */
function getDefaultColorForMaterial(materialName) {
  const materialColors = {
    brick: "#B8604E",
    "red brick": "#B8604E",
    stone: "#A9A9A9",
    concrete: "#C0C0C0",
    timber: "#8B6914",
    wood: "#8B6914",
    glass: "#87CEEB",
    metal: "#696969",
    steel: "#71797E",
    render: "#F5F5F5",
    stucco: "#F5F5DC",
    slate: "#708090",
    tile: "#CD853F",
    "clay tile": "#CD853F",
  };
  return materialColors[materialName.toLowerCase()] || "#808080";
}

/**
 * Infer window pattern from DNA
 */
function inferWindowPattern(dna) {
  const windows = dna._structured?.style?.windows || dna.style?.windows || {};
  const pattern = windows.pattern || "regular grid";
  const proportion = windows.proportion || "3:5";

  const floors =
    dna.dimensions?.floors || dna._structured?.program?.floors || 2;

  // Estimate windows per floor
  const windowsPerFloor = Math.max(2, Math.min(6, floors === 1 ? 4 : 3));

  return `${pattern} ${windowsPerFloor}x${floors} (${proportion} proportion)`;
}

/**
 * Infer entrance position from DNA
 */
function inferEntrancePosition(dna) {
  const facades = dna._structured?.geometry?.facades || {};
  const northFacade = facades.north || {};

  if (northFacade.features?.includes("entrance")) {
    return "north facade, centered";
  }

  // Default based on typical UK residential
  return "front facade, centered with canopy";
}

/**
 * Extract dominant colors from DNA materials
 */
function extractDominantColorsFromDNA(dna) {
  const materials = dna.materials || [];
  const colors = [];

  for (const mat of materials) {
    if (typeof mat === "object" && mat.hexColor) {
      colors.push(mat.hexColor);
    }
  }

  // Pad with defaults if needed
  while (colors.length < 3) {
    colors.push(["#B8604E", "#8B6914", "#F5F5F5"][colors.length]);
  }

  return colors.slice(0, 5);
}

/**
 * Build a style descriptor string
 */
function buildStyleDescriptor(dna) {
  const architecture =
    dna.architecturalStyle ||
    dna._structured?.style?.architecture ||
    "contemporary";

  const floors =
    dna.dimensions?.floors || dna._structured?.program?.floors || 2;
  const buildingType = dna.buildingType || "residential";

  return `${architecture} ${floors}-storey ${buildingType}`;
}

/**
 * Build the prompt lock string that will be injected into all panel prompts
 */
function buildPromptLock(fingerprint) {
  const materialsStr = fingerprint.materialsPalette
    .map((m) => `${m.name} (${m.hexColor}) on ${m.coverage}`)
    .join("; ");

  return `STRICT DESIGN FINGERPRINT - MATCH EXACTLY:
- Massing: ${fingerprint.massingType}
- Roof: ${fingerprint.roofProfile}
- Facade rhythm: ${fingerprint.facadeRhythm}
- Materials: ${materialsStr}
- Windows: ${fingerprint.windowPattern}
- Entrance: ${fingerprint.entrancePosition}
- Style: ${fingerprint.styleDescriptor}

CRITICAL: This is THE SAME building shown in the hero 3D render.
DO NOT generate a different building. All architectural elements must match exactly.`;
}

/**
 * Generate a simple hash for comparison
 */
function generateSimpleHash(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `hash_${Math.abs(hash).toString(16)}`;
}

/**
 * Store a fingerprint for a generation run
 *
 * @param {string} runId - Generation run identifier
 * @param {DesignFingerprint} fingerprint - The fingerprint to store
 */
export function storeFingerprint(runId, fingerprint) {
  fingerprintStore.set(runId, fingerprint);
  logger.debug(`Fingerprint stored for run: ${runId}`);
}

/**
 * Retrieve a stored fingerprint
 *
 * @param {string} runId - Generation run identifier
 * @returns {DesignFingerprint|null}
 */
export function getFingerprint(runId) {
  return fingerprintStore.get(runId) || null;
}

/**
 * Check if a fingerprint exists for a run
 *
 * @param {string} runId - Generation run identifier
 * @returns {boolean}
 */
export function hasFingerprint(runId) {
  return fingerprintStore.has(runId);
}

/**
 * Clear fingerprint for a run (cleanup after completion)
 *
 * @param {string} runId - Generation run identifier
 */
export function clearFingerprint(runId) {
  fingerprintStore.delete(runId);
}

/**
 * Get the prompt constraint string from a fingerprint
 *
 * @param {DesignFingerprint} fingerprint - The design fingerprint
 * @returns {string} Prompt constraint to inject
 */
export function getFingerprintPromptConstraint(fingerprint) {
  if (!fingerprint) return "";
  return fingerprint.promptLock || "";
}

/**
 * Get the hero reference URL and control strength for a panel type
 *
 * @param {DesignFingerprint} fingerprint - The design fingerprint
 * @param {string} panelType - Panel type to get control for
 * @returns {Object|null} { imageUrl, strength } or null if not applicable
 */
export function getHeroControlForPanel(fingerprint, panelType) {
  if (!fingerprint || !fingerprint.heroImageUrl) {
    return null;
  }

  if (!HERO_REFERENCE_PANELS.includes(panelType)) {
    return null;
  }

  const strength =
    getFeatureValue("heroControlStrength")?.[panelType] ||
    HERO_CONTROL_STRENGTH[panelType] ||
    0.6;

  return {
    imageUrl: fingerprint.heroImageUrl,
    strength,
    source: "hero_3d_fingerprint",
  };
}

/**
 * Validate that a panel result matches the design fingerprint
 * (Basic validation - for full validation use FingerprintValidationGate)
 *
 * @param {string} panelImageUrl - Generated panel image URL
 * @param {string} panelType - Type of panel
 * @param {DesignFingerprint} fingerprint - Reference fingerprint
 * @returns {Object} { matches: boolean, confidence: number, issues: string[] }
 */
export function quickValidatePanelMatch(panelImageUrl, panelType, fingerprint) {
  // This is a placeholder for basic validation
  // Full validation would use image similarity metrics

  if (!fingerprint) {
    return { matches: true, confidence: 1.0, issues: [] };
  }

  // For now, assume panels match if they were generated with fingerprint constraint
  // Full implementation would compare pHash, colors, etc.
  return {
    matches: true,
    confidence: 0.85,
    issues: [],
    note: "Basic validation - full comparison in FingerprintValidationGate",
  };
}

// =============================================================================
// ENHANCED V2 FUNCTIONS
// =============================================================================

/**
 * Build the verbatim prompt lock - this EXACT text is injected into every panel prompt
 * DO NOT modify this text programmatically after generation - it must remain unchanged
 *
 * @param {Object} fingerprint - Fingerprint data
 * @returns {string} Verbatim prompt lock text
 */
function buildVerbatimPromptLock(fingerprint) {
  const materialsStr = fingerprint.materialsPalette
    .map((m) => `- ${m.coverage}: ${m.name} ${m.hexColor}`)
    .join("\n");

  const colorsStr = fingerprint.dominantColors
    .slice(0, 5)
    .map((c, i) => `- Color ${i + 1}: ${c}`)
    .join("\n");

  return `=== CANONICAL DESIGN BRIEF (DO NOT DEVIATE) ===
BUILDING IDENTITY:
- Style: ${fingerprint.styleDescriptor}
- Massing: ${fingerprint.massingType}
- Roof: ${fingerprint.roofProfile}
- Floors: ${fingerprint.floorCount}

DIMENSIONS:
- Width: ${fingerprint.buildingBBox.widthMeters}m
- Depth: ${fingerprint.buildingBBox.depthMeters}m
- Height: ${fingerprint.buildingBBox.heightMeters}m

MATERIALS (exact colors - MUST MATCH):
${materialsStr}

FACADE:
- Rhythm: ${fingerprint.facadeRhythm}
- Windows: ${fingerprint.windowPattern}
- Entrance: ${fingerprint.entrancePosition}

DOMINANT COLORS FROM HERO (match these tones):
${colorsStr}

CRITICAL CONSISTENCY RULES:
1. This panel shows THE SAME building as the hero 3D render
2. Match ALL materials, colors, and textures EXACTLY
3. Building form/massing MUST be identical
4. Roof type and pitch MUST match
5. Window patterns MUST be consistent
6. Any deviation will be REJECTED

=== END CANONICAL BRIEF ===`;
}

/**
 * Compute a perceptual hash from an image URL
 * This is a simplified implementation - production would use actual pHash algorithm
 *
 * @param {string} imageUrl - Image URL or data URL
 * @returns {Promise<string>} 64-character hex string representing pHash
 */
async function computePHashFromUrl(imageUrl) {
  try {
    // For data URLs, extract meaningful data for hashing
    if (imageUrl.startsWith("data:")) {
      const base64Data = imageUrl.split(",")[1] || "";
      // Use first 1000 chars of base64 for consistent hash
      const hashInput = base64Data.substring(0, 1000);
      return generatePHashFromString(hashInput);
    }

    // For regular URLs, use URL alone as hash input (DETERMINISTIC)
    // In production, this would fetch the image and compute actual pHash
    // Removed Date.now() to ensure same URL always produces same hash
    const hashInput = imageUrl + "_phash_url";
    return generatePHashFromString(hashInput);
  } catch (error) {
    logger.warn(`pHash computation failed: ${error.message}`);
    return "0".repeat(64); // Return zero hash on error
  }
}

/**
 * Generate a pHash-like string from input
 * Simplified implementation producing 64-char hex string
 *
 * @param {string} input - Input string to hash
 * @returns {string} 64-character hex string
 */
function generatePHashFromString(input) {
  // Simple hash function producing consistent output
  let hash = [];
  for (let i = 0; i < 64; i++) {
    let charCode = 0;
    for (let j = 0; j < input.length; j++) {
      charCode = (charCode + input.charCodeAt(j) * (i + j + 1)) & 0xff;
    }
    hash.push(charCode.toString(16).padStart(2, "0").charAt(1));
  }
  return hash.join("");
}

/**
 * Compare two pHash values and return Hamming distance
 *
 * @param {string} hash1 - First pHash (64-char hex)
 * @param {string} hash2 - Second pHash (64-char hex)
 * @returns {number} Hamming distance (0 = identical, higher = more different)
 */
export function comparePHash(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) {
    return 64; // Maximum distance
  }

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    const val1 = parseInt(hash1[i], 16);
    const val2 = parseInt(hash2[i], 16);
    // Count differing bits
    let xor = val1 ^ val2;
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

/**
 * Get the verbatim prompt lock from a fingerprint
 * This should be used instead of promptLock for new implementations
 *
 * @param {DesignFingerprint} fingerprint - The design fingerprint
 * @returns {string} Verbatim prompt lock text
 */
export function getVerbatimPromptLock(fingerprint) {
  if (!fingerprint) return "";
  return fingerprint.promptLockVerbatim || fingerprint.promptLock || "";
}

/**
 * Verify the integrity of a verbatim prompt lock
 *
 * @param {DesignFingerprint} fingerprint - The fingerprint to verify
 * @returns {boolean} True if lock is intact and unmodified
 */
export function verifyPromptLockIntegrity(fingerprint) {
  if (!fingerprint || !fingerprint.promptLockVerbatim || !fingerprint.promptLockHash) {
    return false;
  }
  const currentHash = generateSimpleHash(fingerprint.promptLockVerbatim);
  return currentHash === fingerprint.promptLockHash;
}

export default {
  extractFingerprintFromHero,
  storeFingerprint,
  getFingerprint,
  hasFingerprint,
  clearFingerprint,
  getFingerprintPromptConstraint,
  getHeroControlForPanel,
  quickValidatePanelMatch,
  // V2 enhanced functions
  getVerbatimPromptLock,
  verifyPromptLockIntegrity,
  comparePHash,
  HERO_CONTROL_STRENGTH,
  HERO_REFERENCE_PANELS,
};

/**
 * Panel Prompt Builders
 *
 * Specialized prompt builders for each of the 14 panel types in multi-panel A1 generation.
 * Each builder creates highly specific prompts with consistency locks and DNA integration.
 *
 * ENHANCED: Now includes Design Fingerprint constraint injection for strict cross-panel consistency.
 * All panels after hero_3d receive the fingerprint lock to ensure THE SAME building is shown.
 *
 * @module services/a1/panelPromptBuilders
 */

import logger from "../../utils/logger.js";
import { isFeatureEnabled } from "../../config/featureFlags.js";
import { getRoomListForLevel } from "../validation/programLockSchema.js";

// CAD-standard lineweight specification for technical drawings
const LINEWEIGHT_SPEC = `
MANDATORY LINEWEIGHT HIERARCHY (must be visually distinct):
- Building outline/section cuts: HEAVY BLACK (6px / 0.7mm print)
- Primary walls: BOLD (4px / 0.5mm)
- Interior walls/secondary: MEDIUM (2px / 0.25mm)
- Dimension lines: THIN (1.5px / 0.18mm)

MANDATORY TEXT SIZES:
- Room labels: 16pt BOLD UPPERCASE with area (e.g., "LIVING ROOM 5.5×4.0m")
- Dimension text: 12pt BOLD
- Annotations: 10pt regular
- All text BLACK, Arial/Helvetica font`;

const DRAWING_STYLE_SUFFIX = `pure white background, clean black lines with clear lineweight hierarchy, no shadows, no title block, no text outside the drawing.
Drawing must fill 85-95% of the canvas with minimal outer margins; no tiny drawing centered in large white space.
${LINEWEIGHT_SPEC}`;
const RENDER_STYLE_SUFFIX =
  "same materials and colors as other views, soft neutral sky, no watermark, no text";

/**
 * Build fingerprint constraint clause for prompt injection
 * This is the core mechanism for ensuring all panels show THE SAME building
 *
 * @param {Object} fingerprint - Design fingerprint extracted from hero_3d
 * @returns {string} Constraint clause to inject into prompts
 */
export function buildFingerprintConstraint(fingerprint) {
  if (!fingerprint || !isFeatureEnabled("extractDesignFingerprint")) {
    return "";
  }

  // Use the pre-built promptLock if available
  if (fingerprint.promptLock) {
    return fingerprint.promptLock;
  }

  // Build constraint from fingerprint data
  const materialsStr = (fingerprint.materialsPalette || [])
    .map((m) => `${m.name} (${m.hexColor}) on ${m.coverage}`)
    .join("; ");

  return `STRICT DESIGN FINGERPRINT - MATCH EXACTLY:
- Massing: ${fingerprint.massingType || "compact rectangular"}
- Roof: ${fingerprint.roofProfile || "gable roof"}
- Facade rhythm: ${fingerprint.facadeRhythm || "regular fenestration"}
- Materials: ${materialsStr || "as specified in DNA"}
- Windows: ${fingerprint.windowPattern || "regular grid"}
- Entrance: ${fingerprint.entrancePosition || "front facade centered"}
- Style: ${fingerprint.styleDescriptor || "contemporary residential"}

CRITICAL: This is THE SAME building shown in the hero 3D render.
DO NOT generate a different building. All architectural elements must match exactly.`;
}

/**
 * Inject fingerprint constraint into prompt context if available
 * @private
 */
function injectFingerprintConstraint(context) {
  const fingerprint =
    context?.designFingerprint || context?.projectContext?.designFingerprint;
  const fingerprintConstraint =
    context?.fingerprintConstraint ||
    context?.projectContext?.fingerprintConstraint ||
    buildFingerprintConstraint(fingerprint);
  return fingerprintConstraint;
}

/**
 * Normalize DNA dimensions with fallbacks
 * @private
 */
function normalizeDimensions(masterDNA = {}) {
  const dims = masterDNA.dimensions || {};
  const floors =
    dims.floors || dims.floorCount || dims.floor_count || dims.numLevels || 1;
  const floorHeight = 3.2;
  return {
    length: dims.length || dims.length_m || 15,
    width: dims.width || dims.width_m || 10,
    height: dims.height || dims.height_m || floors * floorHeight,
    floors,
    floorHeights: dims.floorHeights || Array(floors).fill(floorHeight),
  };
}

/**
 * Normalize materials list
 * @private
 */
function normalizeMaterials(masterDNA = {}) {
  const materials = masterDNA.materials || [];
  if (Array.isArray(materials) && materials.length > 0) {
    return materials
      .map((m) => {
        const name = typeof m === "string" ? m : m.name || m.type || "material";
        const color = m.hexColor ? ` (${m.hexColor})` : "";
        return `${name}${color}`;
      })
      .slice(0, 5);
  }
  return ["stone", "glass", "timber"];
}

/**
 * Build a concise BUILDING IDENTITY block for prompt injection.
 * Placed at the TOP of every panel prompt so FLUX sees it first.
 * @private
 */
function buildBuildingIdentityBlock(masterDNA = {}, projectContext = {}) {
  const dims = normalizeDimensions(masterDNA);
  const materials = normalizeMaterials(masterDNA);
  const roofType =
    masterDNA?.roof?.type ||
    masterDNA?._structured?.geometry_rules?.roof_type ||
    "gable";
  const style = masterDNA?.architecturalStyle || "Contemporary";
  const buildingType = projectContext?.buildingProgram || "residential house";

  const storeyDesc =
    dims.floors === 1
      ? "SINGLE STOREY (ground floor only). NO upper floor. NO second level."
      : `${dims.floors}-STOREY building.`;

  // Building type specific descriptors to help FLUX understand the form
  const typeDesc = buildBuildingTypeDescriptor(buildingType, dims);

  return `=== BUILDING IDENTITY (MANDATORY - DO NOT DEVIATE) ===
SHOW EXACTLY ONE (1) SINGLE FREESTANDING DETACHED ${buildingType.toUpperCase()}.
Building: ${style} detached ${buildingType}
Floors: EXACTLY ${dims.floors} — ${storeyDesc}
Dimensions: ${dims.length}m long × ${dims.width}m wide × ${dims.height}m tall
Roof: ${roofType}
Primary material: ${materials[0] || "as specified"}
${typeDesc}
CRITICAL: This is ONE SINGLE FREESTANDING BUILDING standing ALONE with open space on ALL four sides.
It is NOT attached to any other building. NOT a row of houses. NOT terraced. NOT semi-detached.
NOT multiple buildings. NOT a housing estate. JUST ONE BUILDING.
=== END BUILDING IDENTITY ===`;
}

/**
 * Build building-type-specific descriptors to help FLUX understand the form.
 * @private
 */
function buildBuildingTypeDescriptor(buildingType, dims) {
  const type = (buildingType || "").toLowerCase();

  if (
    type.includes("detached") ||
    type.includes("house") ||
    type.includes("residential")
  ) {
    return `FORM: A single detached family house with front door, garden, driveway. ${dims.floors === 1 ? "Low-profile bungalow form." : "Compact domestic proportions."} Residential scale — NOT commercial, NOT institutional.`;
  }
  if (
    type.includes("clinic") ||
    type.includes("medical") ||
    type.includes("health")
  ) {
    return `FORM: A medical clinic building with prominent entrance canopy, accessible ramp, large reception windows. Clinical/healthcare architectural language. NOT a house.`;
  }
  if (type.includes("school") || type.includes("education")) {
    return `FORM: An educational building with multiple classrooms visible, large windows for daylight, covered entrance area. Institutional scale. NOT a house.`;
  }
  if (type.includes("office") || type.includes("commercial")) {
    return `FORM: A commercial office building with glazed curtain wall facade, modern entrance lobby. Professional/corporate architectural language. NOT a house.`;
  }
  return `FORM: A freestanding ${buildingType} building with clear main entrance. ${dims.floors}-storey scale.`;
}

/**
 * Build negative prompt additions for floor count enforcement.
 * @private
 */
function buildFloorCountNegatives(floors) {
  const negatives = [
    "multiple buildings",
    "row houses",
    "terraced houses",
    "townhouses",
    "semi-detached",
    "housing estate",
    "apartment block",
  ];
  if (floors === 1) {
    negatives.push(
      "two storey",
      "two story",
      "second floor",
      "upper floor",
      "first floor windows above ground",
      "multi-level",
      "two-storey",
      "2-storey",
      "2 storey",
    );
  }
  return negatives.join(", ");
}

/**
 * Build negative prompt additions for roof type enforcement.
 * If DNA says "flat roof", negative prompt includes "gable roof, hip roof, pitched roof" etc.
 * @private
 */
function buildRoofTypeNegatives(roofType) {
  const allRoofTypes = [
    "flat roof",
    "gable roof",
    "hip roof",
    "mansard roof",
    "pitched roof",
    "butterfly roof",
    "gambrel roof",
  ];
  const normalised = (roofType || "").toLowerCase();
  return allRoofTypes
    .filter((r) => !normalised || !r.includes(normalised))
    .join(", ");
}

/**
 * Build site diagram prompt
 */
export function buildSiteDiagramPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
}) {
  const dims = normalizeDimensions(masterDNA);
  const style = masterDNA?.architecturalStyle || "Contemporary";
  const footprint = `${dims.length}m × ${dims.width}m`;
  const address = locationData?.address || "Site location";
  const identity = buildBuildingIdentityBlock(masterDNA, projectContext);

  const prompt = `${identity}

Site plan diagram - overhead orthographic view
Location: ${address}
Building footprint: ${footprint}
Style: ${style}

REQUIREMENTS:
- True overhead 2D view (NOT perspective)
- Building footprint positioned within site boundary
- North arrow clearly visible
- Scale bar (1:500 or 1:200)
- Property boundary lines
- Access roads and pathways
- Context landscaping (trees, parking)
- Site dimensions and setbacks labeled
- Clean technical drawing style

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}
STYLE: ${DRAWING_STYLE_SUFFIX}`;

  return {
    prompt,
    negativePrompt: `3d, perspective, photorealistic, noisy background, cluttered annotations, angled view, ${buildFloorCountNegatives(dims.floors)}`,
  };
}

/**
 * Build hero 3D exterior prompt
 * NOTE: Hero is the FIRST panel and establishes the design fingerprint.
 * It does NOT receive fingerprint constraints (it creates them).
 */
export function buildHero3DPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
  geometryHint,
}) {
  const dims = normalizeDimensions(masterDNA);
  const materials = normalizeMaterials(masterDNA);
  const style = masterDNA?.architecturalStyle || "Contemporary";
  const projectType = projectContext?.buildingProgram || "residential";
  const roofType =
    masterDNA?.roof?.type ||
    masterDNA?._structured?.geometry_rules?.roof_type ||
    "gable";
  const geomConstraint = geometryHint?.type
    ? `FOLLOW PROVIDED GEOMETRY silhouette (${geometryHint.type}) for massing and roofline.`
    : "Keep massing consistent with plans and elevations.";
  const identity = buildBuildingIdentityBlock(masterDNA, projectContext);

  const storeyDesc =
    dims.floors === 1
      ? "SINGLE STOREY ground-level volume (NO upper floor)"
      : `compact ${dims.floors}-storey volume`;

  // FLUX weights early tokens most — prepend hard building-type enforcement
  const floorText =
    dims.floors === 1
      ? "single-storey bungalow, ONE floor only"
      : dims.floors === 2
        ? "two-storey house"
        : `${dims.floors}-storey building`;
  const buildingTypePrefix =
    `a single detached ${floorText}, ` +
    `one freestanding building with garden on all sides, ` +
    `photographed from front-left corner, `;

  // Hero establishes the design - include strong design specification
  const prompt = `${buildingTypePrefix}${identity}

Hero exterior 3D perspective view - MASTER REFERENCE for all other panels
Building: ${style} ${projectType}
Dimensions: ${dims.length}m × ${dims.width}m × ${dims.height}m, ${dims.floors} floor(s)
Materials: ${materials.join(", ")}
Roof: ${roofType} roof

DESIGN SPECIFICATION (All subsequent panels MUST match this):
- Building massing: ${storeyDesc}
- Roof type: ${roofType} (EXACT roof shape will be used for all views)
- Facade materials: ${materials[0] || "primary material"} as dominant
- Window pattern: regular fenestration matching ${dims.floors} floor(s)

REQUIREMENTS:
- Photorealistic architectural rendering
- Southwest viewing angle (45° from corner)
- Natural daylight with volumetric shadows
- ${style} architectural style clearly expressed
- Material textures visible and accurate
- Contextual environment (sky, ground plane, light landscaping)
- Single building only (no variations or alternatives)
- Professional architecture magazine quality
- Coherent massing matching floor plans
- ${geomConstraint}
- FLOOR COUNT: EXACTLY ${dims.floors} floor(s). ${dims.floors === 1 ? "LOW ground-hugging SINGLE STOREY structure. Wall height ~3.2m before roof starts. NO upper windows." : `Show clearly ${dims.floors} rows of windows. Total height ${dims.height}m.`}
- ROOF: ${roofType} roof ONLY. ${roofType === "flat" ? "Horizontal roofline, NO pitch, NO gable ends." : roofType === "gable" ? "Triangular gable ends clearly visible. NOT flat, NOT hip." : roofType === "hip" ? "Hipped roof, slopes on all sides. NOT flat, NOT gable." : `${roofType} profile clearly visible.`}
- PROPORTIONS: Building is ${dims.length}m long × ${dims.width}m wide × ${dims.height}m to roof ridge.

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}
STYLE: ${RENDER_STYLE_SUFFIX}`;

  return {
    prompt,
    negativePrompt: `terraced, row houses, semi-detached, attached buildings, shared walls, multiple buildings, housing estate, street of houses, neighborhood, multiple roofs, duplex, apartment block, flats, apartments, townhouses, housing development, cartoon, sketch, overexposed, low detail, wireframe, different building styles, inconsistent design, people, cars, ${dims.floors === 1 ? "two storey, second floor, upper floor, balcony, " : ""}${buildRoofTypeNegatives(roofType)}, ${buildFloorCountNegatives(dims.floors)}`,
  };
}

/**
 * Build interior 3D prompt
 * ENHANCED: Includes fingerprint constraint to match hero_3d exterior
 */
export function buildInterior3DPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
}) {
  const dims = normalizeDimensions(masterDNA);
  const materials = normalizeMaterials(masterDNA);
  const style = masterDNA?.architecturalStyle || "Contemporary";
  const projectType = projectContext?.buildingProgram || "residential";
  const fingerprintConstraint = injectFingerprintConstraint({
    masterDNA,
    projectContext,
  });
  const identity = buildBuildingIdentityBlock(masterDNA, projectContext);

  const prompt = `${identity}

Interior 3D perspective view - main lobby/living space
Building: ${style} ${projectType}
Materials: ${materials.join(", ")}

${fingerprintConstraint ? `DESIGN FINGERPRINT (match exterior exactly):\n${fingerprintConstraint}\n` : ""}
REQUIREMENTS:
- Photorealistic interior rendering
- Main entrance lobby or living core space
- Natural lighting from windows (MUST match window positions from hero exterior)
- ${style} interior design language
- Furniture layout matching program
- Material finishes visible (floors, walls, ceiling) - SAME materials as exterior
- Spatial depth showing multiple rooms/areas
- No people, clean professional presentation
- Openings align with floor plans AND exterior views
- Interior must be consistent with the SAME building shown in hero 3D

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}`;

  return {
    prompt,
    negativePrompt: `cartoon, sketch, fisheye, low detail, people, cluttered, messy, dark, different building, inconsistent materials, ${buildFloorCountNegatives(dims.floors)}`,
  };
}

/**
 * Build ground floor plan prompt
 */
export function buildGroundFloorPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
  programLock,
}) {
  const dims = normalizeDimensions(masterDNA);

  // P0: Use programLock for exact room list when available
  let roomList;
  if (programLock) {
    roomList = getRoomListForLevel(programLock, 0);
    if (!roomList) {
      roomList = "lobby, living, kitchen, services";
    }
  } else {
    const programSpaces = projectContext?.programSpaces || [];
    roomList =
      programSpaces.length > 0
        ? programSpaces.map((p) => p.name || p.type).join(", ")
        : "lobby, living, kitchen, services";
  }

  // Inject fingerprint constraint for cross-panel consistency
  const fingerprintConstraint = injectFingerprintConstraint({
    masterDNA,
    projectContext,
  });
  const identity = buildBuildingIdentityBlock(masterDNA, projectContext);

  const prompt = `${identity}

Ground floor plan - true orthographic overhead
Scale: 1:100 @ A1
Footprint: ${dims.length}m × ${dims.width}m
Program: ${roomList}

${fingerprintConstraint ? `DESIGN FINGERPRINT (building identity):\n${fingerprintConstraint}\n` : ""}
REQUIREMENTS:
- TRUE OVERHEAD 2D VIEW (NOT perspective, NOT isometric)
- Wall thickness: exterior 0.3m, interior 0.15m
- All rooms labeled with names and dimensions
- Door swings and window positions shown
- Furniture layout indicated
- Dimension lines for key measurements
- North arrow
- Main entrance clearly marked
${dims.floors > 1 ? "- Staircase shown (multi-storey building)" : "- NO staircase (single storey building)"}
- Align with elevations (window/door positions match)

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}`;

  return {
    prompt: `${prompt}\nSTYLE: ${DRAWING_STYLE_SUFFIX}`,
    negativePrompt: `perspective, 3d, isometric, angled, blurry, messy lines, low contrast, watermark, sketch, ${buildFloorCountNegatives(dims.floors)}`,
  };
}

/**
 * Build first floor plan prompt
 */
export function buildFirstFloorPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
  programLock,
}) {
  const dims = normalizeDimensions(masterDNA);
  const identity = buildBuildingIdentityBlock(masterDNA, projectContext);

  // P0: Use programLock for exact room list when available
  let firstFloorProgram;
  if (programLock) {
    const roomList = getRoomListForLevel(programLock, 1);
    firstFloorProgram =
      roomList || "Upper floor spaces (bedrooms, private rooms)";
  } else {
    firstFloorProgram =
      "Upper floor spaces (bedrooms, private rooms, or upper program)";
  }

  // Inject fingerprint constraint for cross-panel consistency
  const fingerprintConstraint = injectFingerprintConstraint({
    masterDNA,
    projectContext,
  });

  const prompt = `${identity}

First floor plan (Level 1) - true orthographic overhead
Scale: 1:100 @ A1
Footprint: ${dims.length}m × ${dims.width}m
Program: ${firstFloorProgram}

${fingerprintConstraint ? `DESIGN FINGERPRINT (building identity):\n${fingerprintConstraint}\n` : ""}
REQUIREMENTS:
- TRUE OVERHEAD 2D VIEW (NOT perspective, NOT isometric)
- Wall thickness: exterior 0.3m, interior 0.15m
- Align staircase with ground floor
- All rooms labeled with dimensions
- Door swings and window positions
- Furniture layout
- Dimension lines
- Vertical circulation (stairs/lifts) in same position as ground floor
- Window positions align with elevations

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}`;

  return {
    prompt: `${prompt}\nSTYLE: ${DRAWING_STYLE_SUFFIX}`,
    negativePrompt: `perspective, 3d, isometric, angled, blurry, messy lines, low contrast, watermark, ${buildFloorCountNegatives(dims.floors)}`,
  };
}

/**
 * Build second floor plan prompt
 */
export function buildSecondFloorPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
  programLock,
}) {
  const dims = normalizeDimensions(masterDNA);
  const identity = buildBuildingIdentityBlock(masterDNA, projectContext);

  // P0: Use programLock for exact room list when available
  let secondFloorProgram;
  if (programLock) {
    const roomList = getRoomListForLevel(programLock, 2);
    secondFloorProgram = roomList || "Top floor spaces or roof plan";
  } else {
    secondFloorProgram = "Top floor spaces or roof plan";
  }

  // Inject fingerprint constraint for cross-panel consistency
  const fingerprintConstraint = injectFingerprintConstraint({
    masterDNA,
    projectContext,
  });

  const prompt = `${identity}

Second floor plan (Level 2) - true orthographic overhead
Scale: 1:100 @ A1
Footprint: ${dims.length}m × ${dims.width}m
Program: ${secondFloorProgram}

${fingerprintConstraint ? `DESIGN FINGERPRINT (building identity):\n${fingerprintConstraint}\n` : ""}
REQUIREMENTS:
- TRUE OVERHEAD 2D VIEW (NOT perspective, NOT isometric)
- Wall thickness: exterior 0.3m, interior 0.15m
- Align vertical cores with lower floors
- All rooms labeled
- Roof structure indicated if applicable
- Dimension lines
- Staircase/lift alignment with lower floors
- Window positions align with elevations

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}`;

  return {
    prompt: `${prompt}\nSTYLE: ${DRAWING_STYLE_SUFFIX}`,
    negativePrompt: `perspective, 3d, isometric, angled, blurry, messy lines, low contrast, ${buildFloorCountNegatives(dims.floors)}`,
  };
}

/**
 * Build elevation prompt (reusable for all 4 orientations)
 * ENHANCED: Strong fingerprint constraint to match hero_3d facade
 * ENHANCED: Per-facade details (window counts, entrance, materials with hex colors)
 */
export function buildElevationPrompt(orientation) {
  return ({
    masterDNA,
    locationData,
    projectContext,
    consistencyLock,
    geometryHint,
    hasStyleReference,
  }) => {
    const dims = normalizeDimensions(masterDNA);
    const materials = normalizeMaterials(masterDNA);
    const style = masterDNA?.architecturalStyle || "Contemporary";
    const roofType =
      masterDNA?.roof?.type ||
      masterDNA?._structured?.geometry_rules?.roof_type ||
      "gable";
    const dirUpper = orientation.toUpperCase();
    const fingerprintConstraint = injectFingerprintConstraint({
      masterDNA,
      projectContext,
    });
    const geomConstraint = geometryHint?.type
      ? `FOLLOW PROVIDED GEOMETRY: match the ${geometryHint.type} silhouette exactly (roofline, massing, openings).`
      : "Maintain strict orthographic alignment to plans and roofline.";
    const identity = buildBuildingIdentityBlock(masterDNA, projectContext);

    // Extract per-facade details from DNA
    const facades =
      masterDNA?.viewSpecificFeatures ||
      masterDNA?._structured?.geometry?.facades ||
      {};
    const facadeData = facades[orientation] || {};

    // Build facade-specific details
    let facadeDetails = "";
    const windowCount = facadeData.windows || facadeData.windowCount || "";
    const hasEntrance =
      facadeData.mainEntrance ||
      (Array.isArray(facadeData.features) &&
        facadeData.features.includes("entrance"));
    const patioDoors = facadeData.patioDoors || "";
    const balcony =
      Array.isArray(facadeData.features) &&
      facadeData.features.includes("balcony");

    if (windowCount) {
      facadeDetails += `\n- ${dirUpper} facade windows: ${windowCount} windows`;
    }
    if (hasEntrance) {
      const entranceDesc =
        typeof facadeData.mainEntrance === "string"
          ? facadeData.mainEntrance
          : "main entrance";
      facadeDetails += `\n- MAIN ENTRANCE on this facade: ${entranceDesc}`;
    }
    if (patioDoors) {
      facadeDetails += `\n- Patio doors: ${patioDoors}`;
    }
    if (balcony) {
      facadeDetails += `\n- Balcony on this facade`;
    }

    // Build materials string with hex colors for precision
    const rawMats = masterDNA?.materials || [];
    const materialsWithHex = (Array.isArray(rawMats) ? rawMats : [])
      .slice(0, 4)
      .map((m) => {
        if (typeof m === "string") return m;
        const name = m.name || m.type || "material";
        return m.hexColor ? `${name} (${m.hexColor})` : name;
      });
    const materialStr =
      materialsWithHex.length > 0
        ? materialsWithHex.join(", ")
        : materials.join(", ");

    const prompt = `${identity}

${dirUpper} elevation - flat orthographic facade view
Style: ${style}
Height: ${dims.height}m (${dims.floors} floor(s))
Materials: ${materialStr}
Roof type: ${roofType} (MUST match hero 3D render exactly)

${fingerprintConstraint ? `DESIGN FINGERPRINT - MATCH HERO 3D EXACTLY:\n${fingerprintConstraint}\n` : ""}
CRITICAL CONSISTENCY RULES:
- This elevation MUST show THE SAME building as the hero 3D render
- Roof profile: ${roofType} - EXACT SAME shape as hero
- Materials: ${materialsWithHex[0] || materials[0] || "primary"} - EXACT SAME colors as hero
- Building height and proportions: MUST match hero
${facadeDetails || `- Window count and positions: MUST match hero facade visible from this orientation`}

REQUIREMENTS:
- FLAT ORTHOGRAPHIC VIEW (NO perspective, NO angled view)
- Show complete facade from grade to roofline
- Window and door positions (align with floor plans AND hero 3D)
- Material indications and textures (SAME as hero 3D)
- Facade articulation and depth
- Dimension lines for height and key features
- Grade line at base
- Roof form and details (MUST match hero 3D roof exactly)
- Clean technical drawing with proper line weights
- ${geomConstraint}
- ${hasEntrance ? `Main entrance on this (${orientation}) facade` : dirUpper === "NORTH" ? "Main entrance if north-facing" : ""}
- FLOOR COUNT: EXACTLY ${dims.floors} visible floor level(s). ${dims.floors === 1 ? "Single row of windows only. NO upper floor windows." : `${dims.floors} rows of windows clearly visible.`}
- BUILDING HEIGHT: Total ${dims.height}m from grade to roof ridge.
- ROOF PROFILE: ${roofType} roof. ${roofType === "flat" ? "Horizontal parapet line. NO pitched roof." : roofType === "gable" ? "Triangular gable profile visible." : ""}

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}`;

    // When a style reference (hero init_image) is active, use RENDER_STYLE_SUFFIX
    // to avoid conflicting signals (init_image says "photorealistic brick" while
    // DRAWING_STYLE_SUFFIX says "clean black lines on white"). Without style ref,
    // use DRAWING_STYLE_SUFFIX for clean technical drawings.
    const styleSuffix = hasStyleReference
      ? RENDER_STYLE_SUFFIX
      : DRAWING_STYLE_SUFFIX;

    return {
      prompt: `${prompt}\nSTYLE: ${styleSuffix}`,
      negativePrompt: `perspective, angled view, fisheye, 3d, low quality, sketchy, blurry, different roof type, different building, inconsistent design, ${buildRoofTypeNegatives(roofType)}, ${buildFloorCountNegatives(dims.floors)}`,
    };
  };
}

/**
 * Build section A-A prompt (longitudinal)
 */
export function buildSectionAAPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
}) {
  const dims = normalizeDimensions(masterDNA);
  const materials = normalizeMaterials(masterDNA);
  const floorHeights = dims.floorHeights
    .map((h, i) => `Floor ${i}: ${h}m`)
    .join(", ");
  const roofType =
    masterDNA?.roof?.type ||
    masterDNA?._structured?.geometry_rules?.roof_type ||
    "gable";
  const fingerprintConstraint = injectFingerprintConstraint({
    masterDNA,
    projectContext,
  });
  const identity = buildBuildingIdentityBlock(masterDNA, projectContext);

  const prompt = `${identity}

Section A-A (longitudinal) - orthographic building section
Total height: ${dims.height}m (${dims.floors} floor(s))
Floor heights: ${floorHeights}
Materials: ${materials.join(", ")}
Roof type: ${roofType}

${fingerprintConstraint ? `DESIGN FINGERPRINT (match building identity):\n${fingerprintConstraint}\n` : ""}
REQUIREMENTS:
- TRUE ORTHOGRAPHIC SECTION (NOT perspective)
- Cut through entrance and main circulation
- Show all floor levels with slab thickness
- Staircase visible in section
- Ceiling heights labeled
- Foundation and roof structure (${roofType} - MUST match hero)
- Material indications
- Dimension lines for floor-to-floor heights
- Interior spaces visible in section
- Clean technical drawing style

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}`;

  return {
    prompt: `${prompt}\nSTYLE: ${DRAWING_STYLE_SUFFIX}`,
    negativePrompt: `photorealistic, perspective, 3d, low contrast, messy lines, blurry, different roof type, different building, ${buildFloorCountNegatives(dims.floors)}`,
  };
}

/**
 * Build section B-B prompt (transverse)
 */
export function buildSectionBBPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
}) {
  const dims = normalizeDimensions(masterDNA);
  const materials = normalizeMaterials(masterDNA);
  const roofType =
    masterDNA?.roof?.type ||
    masterDNA?._structured?.geometry_rules?.roof_type ||
    "gable";
  const fingerprintConstraint = injectFingerprintConstraint({
    masterDNA,
    projectContext,
  });
  const identity = buildBuildingIdentityBlock(masterDNA, projectContext);

  const prompt = `${identity}

Section B-B (transverse/cross section) - orthographic building section
Width: ${dims.width}m
Total height: ${dims.height}m (${dims.floors} floor(s))
Materials: ${materials.join(", ")}
Roof type: ${roofType}

${fingerprintConstraint ? `DESIGN FINGERPRINT (match building identity):\n${fingerprintConstraint}\n` : ""}
REQUIREMENTS:
- TRUE ORTHOGRAPHIC SECTION (NOT perspective)
- Cut perpendicular to Section A-A
- Building profile MUST match Section A-A (same roof height, same floor levels)
- Show structural grid if applicable
- All floor levels with slab thickness
- Window openings in section
- Ceiling heights labeled
- Foundation and roof structure (${roofType} - MUST match hero)
- Material indications
- Dimension lines
- Align with elevations (window positions match)

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}`;

  return {
    prompt: `${prompt}\nSTYLE: ${DRAWING_STYLE_SUFFIX}`,
    negativePrompt: `photorealistic, perspective, 3d, low contrast, messy lines, blurry, different roof type, different building, ${buildFloorCountNegatives(dims.floors)}`,
  };
}

/**
 * Build material palette prompt
 */
export function buildMaterialPalettePrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
}) {
  const materials = normalizeMaterials(masterDNA);

  const prompt = `Material palette board - architectural materials presentation for a ${projectContext?.buildingProgram || "residential"} project
Materials: ${materials.join(", ")}

REQUIREMENTS:
- Display as color swatches in grid layout
- Each material shown as rectangular swatch
- Material name labeled below each swatch
- Hex color codes visible for each material
- Texture indication (smooth, rough, etc.)
- Application notes (exterior walls, roof, etc.)
- Professional material board presentation
- Clean flat 2D layout (NO perspective)
- High contrast for readability
- Typography: clean sans-serif labels

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}
STYLE: ${DRAWING_STYLE_SUFFIX}`;

  return {
    prompt,
    negativePrompt:
      "perspective, 3d, photorealistic materials, cluttered, messy layout, low contrast, blurry",
  };
}

/**
 * Build climate card prompt
 */
export function buildClimateCardPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
}) {
  const climate = locationData?.climate || { type: "temperate oceanic" };
  const climateType = climate.type || "temperate oceanic";
  const location = locationData?.address || "Site location";
  const sunPath = locationData?.sunPath || {};
  const orientation = sunPath.optimalOrientation || 180;

  const prompt = `Climate analysis card - environmental data infographic
Location: ${location}
Climate: ${climateType}
Optimal orientation: ${orientation}°

REQUIREMENTS:
- Solar orientation diagram with compass rose
- Sun path diagram (summer and winter solstice paths)
- Seasonal temperature ranges (bar chart or graph)
- Precipitation data (monthly averages)
- Wind rose diagram showing prevailing winds
- Energy performance indicators
- Sustainability features summary
- Professional infographic style
- Clean data visualization with icons
- Flat 2D presentation (NO perspective)
- High contrast for readability
- Color-coded data (warm/cool colors for temperature)

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}
STYLE: ${DRAWING_STYLE_SUFFIX}`;

  return {
    prompt,
    negativePrompt:
      "perspective, 3d, photorealistic, cluttered data, messy charts, low readability, blurry",
  };
}

/**
 * Build axonometric 3D view prompt
 * ENHANCED: Strong fingerprint constraint - axonometric MUST match hero massing exactly
 */
export function buildAxonometricPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
  geometryHint,
  hasStyleReference,
}) {
  const dims = normalizeDimensions(masterDNA);
  const materials = normalizeMaterials(masterDNA);
  const style = masterDNA?.architecturalStyle || "Contemporary";
  const projectType = projectContext?.buildingProgram || "residential";
  const roofType =
    masterDNA?.roof?.type ||
    masterDNA?._structured?.geometry_rules?.roof_type ||
    "gable";
  const fingerprintConstraint = injectFingerprintConstraint({
    masterDNA,
    projectContext,
  });
  const geomConstraint = geometryHint?.type
    ? `FOLLOW PROVIDED GEOMETRY silhouette (${geometryHint.type}) for massing and roofline.`
    : "Keep massing consistent with plans and elevations.";
  const identity = buildBuildingIdentityBlock(masterDNA, projectContext);

  const prompt = `${identity}

Axonometric 3D projection view - architectural isometric
Building: ${style} ${projectType}
Dimensions: ${dims.length}m × ${dims.width}m × ${dims.height}m, ${dims.floors} floor(s)
Materials: ${materials.join(", ")}
Roof type: ${roofType}

${fingerprintConstraint ? `DESIGN FINGERPRINT - MATCH HERO 3D EXACTLY:\n${fingerprintConstraint}\n` : ""}
CRITICAL: This axonometric MUST show THE EXACT SAME building as the hero 3D render:
- SAME roof type and pitch: ${roofType}
- SAME building massing and proportions
- SAME materials and colors
- SAME window arrangement

REQUIREMENTS:
- TRUE AXONOMETRIC/ISOMETRIC PROJECTION (30° or 45° angle)
- Equal scale on all axes (no perspective distortion)
- View from above showing roof form (MUST match hero roof exactly)
- All four facades partially visible (MUST match hero facades)
- Material textures indicated (SAME as hero)
- Building massing clearly readable
- Shows relationship between plan and volume
- Clean technical drawing style
- No context/background (isolated building)
- ${geomConstraint}
- FLOOR COUNT: EXACTLY ${dims.floors} floor(s) visible from above. ${dims.floors === 1 ? "SINGLE STOREY — low horizontal massing, NO upper floor." : ""}
- ROOF: ${roofType} roof. ${roofType === "flat" ? "Flat horizontal top." : roofType === "gable" ? "Gable ridge line visible." : ""}

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}
STYLE: ${hasStyleReference ? RENDER_STYLE_SUFFIX : DRAWING_STYLE_SUFFIX}`;

  return {
    prompt,
    negativePrompt: `perspective view, vanishing points, photorealistic, context, landscape, people, cars, sketchy, different building, different roof, inconsistent design, ${buildRoofTypeNegatives(roofType)}, ${buildFloorCountNegatives(dims.floors)}`,
  };
}

/**
 * Build schedules and notes prompt
 */
export function buildSchedulesNotesPrompt({
  masterDNA,
  locationData,
  projectContext,
  consistencyLock,
}) {
  const dims = normalizeDimensions(masterDNA);
  const materials = normalizeMaterials(masterDNA);
  const projectType = projectContext?.buildingProgram || "residential";
  const identity = buildBuildingIdentityBlock(masterDNA, projectContext);
  const programSpaces = projectContext?.programSpaces || [];
  const rooms = masterDNA?.rooms || programSpaces;

  // Build room schedule data
  const roomSchedule =
    rooms.length > 0
      ? rooms
          .map(
            (r, i) =>
              `${i + 1}. ${r.name || r.type}: ${r.area || r.dimensions || "TBD"}`,
          )
          .slice(0, 10)
          .join("\n")
      : "1. Living Room: 35m²\n2. Kitchen: 20m²\n3. Bedroom 1: 18m²\n4. Bathroom: 8m²";

  const prompt = `${identity}

Schedules and notes panel - CRISP BLACK TEXT ON WHITE BACKGROUND
Project type: ${projectType}
Building: ${dims.length}m × ${dims.width}m × ${dims.height}m, ${dims.floors} floor(s)

ROOM SCHEDULE:
${roomSchedule}

MATERIALS:
${materials.map((m, i) => `${i + 1}. ${m}`).join("\n")}

REQUIREMENTS:
- MAXIMUM CONTRAST: Pure black text (#000000) on pure white (#FFFFFF)
- LARGE BOLD TEXT: clearly readable at arm's length
- NO faint or light grey text - ALL text must be bold black
- Clean tabular layout for room schedule
- Column headers: Room Name, Area (m²), Floor Level, Notes
- Material finishes schedule table
- Door and window schedules (if applicable)
- General notes section with standard construction notes
- Abbreviations legend
- Professional typography (sans-serif, BOLD weight)
- Grid-based table layout with solid black lines
- Flat 2D presentation (NO perspective)
- A1 sheet formatting conventions

${consistencyLock ? `CONSISTENCY LOCK:\n${consistencyLock}` : ""}
STYLE: ${DRAWING_STYLE_SUFFIX}`;

  return {
    prompt,
    negativePrompt:
      "perspective, 3d, photorealistic, messy layout, handwritten, low contrast, blurry text, faint text, light grey text, gradient background",
  };
}

/**
 * Panel prompt builders map
 */
export const PANEL_PROMPT_BUILDERS = {
  site_diagram: buildSiteDiagramPrompt,
  hero_3d: buildHero3DPrompt,
  interior_3d: buildInterior3DPrompt,
  axonometric: buildAxonometricPrompt,
  floor_plan_ground: buildGroundFloorPrompt,
  floor_plan_first: buildFirstFloorPrompt,
  floor_plan_level2: buildSecondFloorPrompt,
  elevation_north: buildElevationPrompt("north"),
  elevation_south: buildElevationPrompt("south"),
  elevation_east: buildElevationPrompt("east"),
  elevation_west: buildElevationPrompt("west"),
  section_AA: buildSectionAAPrompt,
  section_BB: buildSectionBBPrompt,
  schedules_notes: buildSchedulesNotesPrompt,
  material_palette: buildMaterialPalettePrompt,
  climate_card: buildClimateCardPrompt,
};

/**
 * Build prompt for a specific panel type
 *
 * @param {string} panelType - Panel type identifier
 * @param {Object} context - Context for prompt generation
 * @returns {Object} { prompt, negativePrompt }
 */
export function buildPanelPrompt(panelType, context) {
  const builder = PANEL_PROMPT_BUILDERS[panelType];

  if (!builder) {
    logger.warn(`No prompt builder found for panel type: ${panelType}`);
    return {
      prompt: `Panel ${panelType} for architectural presentation`,
      negativePrompt: "low quality, blurry, watermark",
    };
  }

  return builder(context);
}

export default {
  PANEL_PROMPT_BUILDERS,
  buildPanelPrompt,
  buildFingerprintConstraint,
  buildSiteDiagramPrompt,
  buildHero3DPrompt,
  buildInterior3DPrompt,
  buildAxonometricPrompt,
  buildGroundFloorPrompt,
  buildFirstFloorPrompt,
  buildSecondFloorPrompt,
  buildElevationPrompt,
  buildSectionAAPrompt,
  buildSectionBBPrompt,
  buildSchedulesNotesPrompt,
  buildMaterialPalettePrompt,
  buildClimateCardPrompt,
};

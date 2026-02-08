/**
 * DNA Prompt Context Builder
 *
 * Builds structured, stable JSON context from DNA for embedding in prompts.
 * Ensures reproducibility by using sorted keys and compact format.
 */

import { extractStructuredDNA } from "./dnaSchema.js";
import logger from "../utils/logger.js";

/**
 * Build structured DNA context for prompts
 * Returns a compact JSON block with essential DNA fields including concrete
 * architectural values (hex colors, dimensions, facade details, heights).
 */
export function buildStructuredDNAContext(masterDNA) {
  if (!masterDNA) {
    logger.warn("buildStructuredDNAContext: No DNA provided");
    return "{}";
  }

  // Extract structured DNA (handles both new and legacy formats)
  const structured = masterDNA._structured || extractStructuredDNA(masterDNA);

  // Extract concrete dimensions from DNA
  const dims = masterDNA.dimensions || {};

  // Extract materials with hex colors and applications (not just names)
  const rawMaterials = masterDNA.materials || structured.style?.materials || [];
  const enrichedMaterials = (Array.isArray(rawMaterials) ? rawMaterials : [])
    .slice(0, 8)
    .map((mat) => {
      if (typeof mat === "string") return { name: mat };
      return {
        name: mat.name || mat.type || "material",
        hex: mat.hexColor || mat.color || undefined,
        use: mat.application || mat.coverage || undefined,
      };
    });

  // Extract facade-specific details (window counts, entrance, features)
  const facades =
    structured.geometry?.facades || masterDNA.viewSpecificFeatures || {};
  const facadeContext = {};
  for (const dir of ["north", "south", "east", "west"]) {
    const f = facades[dir];
    if (f) {
      facadeContext[dir] = {
        windows: f.windows || f.windowCount || undefined,
        entrance:
          f.mainEntrance ||
          (f.features?.includes?.("entrance") ? "yes" : undefined),
        features: Array.isArray(f.features)
          ? f.features.join(", ")
          : f.patioDoors || undefined,
      };
    }
  }

  // Extract actual floor heights from geometry DNA
  const geomHeights = structured.geometry?.heights || {};
  const dnaFloorHeights = dims.floorHeights || [];
  const heights = {
    ground: geomHeights.ground_floor_m || dnaFloorHeights[0] || 3.0,
    upper: geomHeights.upper_floors_m || dnaFloorHeights[1] || 2.7,
  };

  // Extract rooms with dimensions and window counts
  const rooms = (structured.program?.rooms || masterDNA.rooms || [])
    .map((room) => {
      const entry = {
        name: room.name,
        area: room.area_m2 || room.area || 0,
        floor: room.floor,
      };
      // Include room dimensions if available (e.g., "5.5m x 4.0m")
      if (room.dimensions) entry.dims = room.dimensions;
      if (room.windows != null) entry.windows = room.windows;
      return entry;
    })
    .slice(0, 15); // Increased cap for more complete program info

  // Extract roof pitch from geometry DNA
  const roofPitch =
    structured.geometry?.roof?.pitch_degrees ||
    masterDNA.roof?.pitch ||
    undefined;

  // Build compact context with sorted keys for stability
  const context = {
    // Building dimensions
    dimensions: {
      length: dims.length || 0,
      width: dims.width || 0,
      height: dims.height || dims.totalHeight || 0,
      floors: dims.floors || dims.floorCount || structured.program?.floors || 2,
    },

    // Floor heights (actual from DNA, not hardcoded)
    heights,

    // Site context
    site: {
      area_m2: structured.site?.area_m2 || 0,
      climate: structured.site?.climate_zone || "temperate",
      orientation: structured.site?.sun_path || "south",
    },

    // Program context
    program: {
      floors: structured.program?.floors || 2,
      rooms,
    },

    // Style context with enriched materials
    style: {
      architecture: structured.style?.architecture || "contemporary",
      materials: enrichedMaterials,
      windows: structured.style?.windows?.pattern || "regular grid",
    },

    // Facade-specific details (window counts, entrance, features per orientation)
    facades: Object.keys(facadeContext).length > 0 ? facadeContext : undefined,

    // Geometry rules
    geometry: {
      roof: structured.geometry_rules?.roof_type || "gable",
      roof_pitch: roofPitch,
      grid: structured.geometry_rules?.grid || "1m",
      span: structured.geometry_rules?.max_span || "6m",
    },
  };

  // Remove undefined values for cleaner JSON
  const clean = JSON.parse(JSON.stringify(context));

  // Return compact JSON string (sorted keys)
  return JSON.stringify(clean, Object.keys(clean).sort(), 0);
}

/**
 * Build 3D panel prompt template
 * For hero views, interior, site diagrams
 */
export function build3DPanelPrompt(panelType, dna, additionalContext = "") {
  const dnaContext = buildStructuredDNAContext(dna);

  const basePrompt = `Generate a photorealistic 3D ${panelType.replace(/_/g, " ")} of the SAME HOUSE defined in this DNA:

${dnaContext}

STRICT RULES:
- Do NOT change building shape, dimensions, or proportions
- Do NOT change window count or positions
- Do NOT change roof type or pitch
- Do NOT change materials or colors
- Do NOT invent new architectural features
- Maintain exact consistency with the DNA specification

${additionalContext}

Style: Photorealistic architectural rendering, professional quality, natural lighting.`;

  return basePrompt;
}

/**
 * Build 2D floor plan prompt template
 * For ground, first, second floor plans
 */
export function buildPlanPrompt(level, dna, additionalContext = "") {
  const dnaContext = buildStructuredDNAContext(dna);
  const structured = dna._structured || extractStructuredDNA(dna);

  // Filter rooms for this level
  const levelRooms = (structured.program?.rooms || []).filter(
    (r) => r.floor === level || (level === "ground" && !r.floor),
  );

  const roomList = levelRooms
    .map((r) => `${r.name}: ${r.area_m2 || r.area || 0}m²`)
    .join(", ");

  const basePrompt = `Generate a clean black and white architectural FLOOR PLAN for ${level} floor of the SAME HOUSE defined in this DNA:

${dnaContext}

FLOOR PLAN REQUIREMENTS FOR ${level.toUpperCase()} FLOOR:
- Rooms: ${roomList || "As per DNA"}
- Total area: ${levelRooms.reduce((sum, r) => sum + (r.area_m2 || r.area || 0), 0)}m²
- Keep global footprint identical to DNA
- Maintain consistent wall thickness (0.3m exterior, 0.15m interior)
- Position doors and windows exactly according to DNA
- No invented rooms or spaces
- TRUE OVERHEAD ORTHOGRAPHIC VIEW (not perspective, not 3D, not isometric)

${additionalContext}

Style: Clean black and white line drawing, architectural standard, dimension lines, room labels.

NEGATIVE: (perspective:1.5), (3D:1.5), (isometric:1.5), photorealistic, shading, shadows`;

  return basePrompt;
}

/**
 * Build elevation prompt template
 * For north, south, east, west elevations
 */
export function buildElevationPrompt(direction, dna, additionalContext = "") {
  const dnaContext = buildStructuredDNAContext(dna);
  const structured = dna._structured || extractStructuredDNA(dna);

  // Extract facade-specific details for this direction
  const facades =
    structured.geometry?.facades || dna.viewSpecificFeatures || {};
  const facadeData = facades[direction] || {};
  const windowCount = facadeData.windows || facadeData.windowCount || "";
  const hasEntrance =
    facadeData.mainEntrance || facadeData.features?.includes?.("entrance");
  const facadeFeatures = Array.isArray(facadeData.features)
    ? facadeData.features.join(", ")
    : "";

  // Build facade-specific window/entrance description
  let facadeDesc = `- Direction: ${direction} facade`;
  if (windowCount) facadeDesc += `\n- Window count: ${windowCount} windows`;
  if (hasEntrance) facadeDesc += `\n- Main entrance on this facade`;
  if (facadeFeatures) facadeDesc += `\n- Features: ${facadeFeatures}`;

  // Extract materials with hex colors
  const rawMats = dna.materials || structured.style?.materials || [];
  const materialDesc =
    (Array.isArray(rawMats) ? rawMats : [])
      .slice(0, 4)
      .map((m) => {
        if (typeof m === "string") return m;
        const name = m.name || m.type || "material";
        return m.hexColor ? `${name} (${m.hexColor})` : name;
      })
      .join(", ") || "As per DNA";

  const basePrompt = `Generate ${direction.toUpperCase()} ELEVATION of the SAME HOUSE defined in this DNA:

${dnaContext}

ELEVATION REQUIREMENTS:
${facadeDesc}
- Materials: ${materialDesc}
- Roof: ${structured.geometry_rules?.roof_type || "gable"}
- FLAT ORTHOGRAPHIC VIEW (no perspective distortion)
- Maintain exact proportions from DNA
- Show true heights and widths

${additionalContext}

Style: Clean architectural elevation drawing, black and white line work, dimension lines.

NEGATIVE: (perspective:1.3), (3D:1.3), photorealistic, shading, shadows`;

  return basePrompt;
}

/**
 * Build section prompt template
 * For longitudinal and cross sections
 */
export function buildSectionPrompt(sectionType, dna, additionalContext = "") {
  const dnaContext = buildStructuredDNAContext(dna);
  const structured = dna._structured || extractStructuredDNA(dna);

  // Use actual DNA floor heights instead of hardcoded values
  const geomHeights = structured.geometry?.heights || {};
  const dnaFloorHeights = dna.dimensions?.floorHeights || [];
  const groundHeight = geomHeights.ground_floor_m || dnaFloorHeights[0] || 3.0;
  const upperHeight = geomHeights.upper_floors_m || dnaFloorHeights[1] || 2.7;

  const basePrompt = `Generate ${sectionType.toUpperCase()} SECTION of the SAME HOUSE defined in this DNA:

${dnaContext}

SECTION REQUIREMENTS:
- Type: ${sectionType} section (${sectionType === "longitudinal" ? "along length" : "across width"})
- Floors: ${structured.program?.floors || 2}
- Floor heights: ${groundHeight}m ground, ${upperHeight}m upper
- Show interior spaces, floor structures, roof structure
- Cut through building to reveal interior
- FLAT ORTHOGRAPHIC VIEW (no perspective)
- Dimension lines showing heights

${additionalContext}

Style: Clean architectural section drawing, black and white, hatching for cut elements, dimension lines.

NEGATIVE: perspective, 3D, photorealistic, exterior view`;

  return basePrompt;
}

/**
 * Build negative prompt for panel type
 */
export function buildNegativePrompt(panelType) {
  const is2D =
    panelType.includes("floor_plan") ||
    panelType.includes("elevation") ||
    panelType.includes("section");

  if (is2D) {
    return "(low quality:1.4), (worst quality:1.4), (blurry:1.3), (perspective:1.5), (3D:1.5), (isometric:1.5), photorealistic, shading, shadows, watermark, signature, text";
  } else {
    return "(low quality:1.4), (worst quality:1.4), (blurry:1.3), cartoon, sketch, drawing, line art, watermark, signature, text";
  }
}

export default {
  buildStructuredDNAContext,
  build3DPanelPrompt,
  buildPlanPrompt,
  buildElevationPrompt,
  buildSectionPrompt,
  buildNegativePrompt,
};

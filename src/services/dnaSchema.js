/**
 * DNA Schema Definition
 *
 * Defines the structured JSON schema for Master Design DNA.
 * All DNA must conform to this schema with four top-level keys:
 * - site: Site context (polygon, area, orientation, climate, sun path, wind)
 * - program: Building program (floors, rooms with dimensions and orientation)
 * - style: Architectural style (architecture type, materials, windows)
 * - geometry_rules: Geometric constraints (grid, max span, roof type)
 */

import logger from "../utils/logger.js";
import { computeCDSHashSync } from "./validation/cdsHash.js";

/**
 * Build DNA request payload for Qwen
 * Converts raw project inputs into structured JSON format
 */
export function buildDNARequestPayload(
  locationData,
  siteMetrics,
  programSpec,
  portfolioSummary,
) {
  const normalizeRoomFloor = (room) => {
    const rawFloor =
      room?.floor ??
      room?.level ??
      room?.levelName ??
      room?.storey ??
      room?.storeyName;
    if (typeof rawFloor === "number" && Number.isFinite(rawFloor)) {
      if (rawFloor <= -1) return "basement";
      if (rawFloor === 0) return "ground";
      if (rawFloor === 1) return "first";
      if (rawFloor === 2) return "second";
      if (rawFloor === 3) return "third";
      return `${rawFloor}th`;
    }

    const normalized = String(rawFloor || "")
      .trim()
      .toLowerCase();
    if (!normalized) return "ground";

    if (normalized === "g" || normalized.startsWith("ground")) return "ground";
    if (
      normalized === "b" ||
      normalized.includes("basement") ||
      normalized.includes("lower")
    )
      return "basement";
    if (
      normalized === "1" ||
      normalized === "1st" ||
      normalized.startsWith("first")
    )
      return "first";
    if (
      normalized === "2" ||
      normalized === "2nd" ||
      normalized.startsWith("second")
    )
      return "second";
    if (
      normalized === "3" ||
      normalized === "3rd" ||
      normalized.startsWith("third")
    )
      return "third";

    return normalized;
  };

  const parsePositiveNumber = (value, fallback = 0) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  const expandProgramRooms = (spaces = []) => {
    const rooms = [];

    for (const raw of spaces) {
      const baseName =
        String(raw?.name || raw?.type || "Room").trim() || "Room";
      const parsedCount = parseInt(raw?.count, 10);
      const count =
        Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 1;
      const area = parsePositiveNumber(
        raw?.area ?? raw?.area_m2 ?? raw?.targetAreaM2,
        20,
      );
      const floor = normalizeRoomFloor(raw);
      const orientation = String(
        raw?.preferredOrientation || raw?.orientation || "any",
      );
      const hasNumericSuffix = /\d+$/.test(baseName);

      for (let i = 0; i < count; i++) {
        const name =
          count > 1 && !hasNumericSuffix ? `${baseName} ${i + 1}` : baseName;
        rooms.push({
          name,
          area_m2: area,
          floor,
          orientation,
        });
      }
    }

    return rooms;
  };

  const expandedProgramRooms = expandProgramRooms(
    programSpec?.programSpaces || [],
  );

  const payload = {
    site: {
      polygon: siteMetrics?.sitePolygon || [],
      area_m2: siteMetrics?.areaM2 || 0,
      orientation: siteMetrics?.orientationDeg || 0,
      climate_zone: locationData?.climate?.type || "temperate",
      sun_path: locationData?.sunPath?.optimalOrientation || "south",
      wind_profile: locationData?.climate?.seasonal?.winter?.wind || "moderate",
    },
    program: {
      floors: programSpec?.floors || 2,
      rooms: expandedProgramRooms,
    },
    style: {
      architecture:
        portfolioSummary?.dominantStyle ||
        locationData?.recommendedStyle ||
        "contemporary",
      materials: portfolioSummary?.materials ||
        locationData?.localStyles?.[0]?.materials || ["brick", "wood", "glass"],
      windows: {
        pattern: "regular grid",
        proportion: "3:5",
      },
    },
    geometry_rules: {
      grid: "1m grid",
      max_span: "6m",
      roof_type: "gable",
    },
    // NEW: Geometry volume section for 3D massing
    geometry: {
      massing: {
        type: "single_volume", // single_volume, multi_wing, courtyard, etc.
        footprint_shape: "rectangular",
        floor_stacking: "uniform", // uniform, setback, cantilever
      },
      roof: {
        type: "gable", // gable, hip, flat, shed, etc.
        pitch_degrees: 35,
        overhang_m: 0.5,
      },
      facades: {
        north: { type: "primary", features: ["entrance", "windows"] },
        south: { type: "secondary", features: ["windows", "balcony"] },
        east: { type: "side", features: ["windows"] },
        west: { type: "side", features: ["windows"] },
      },
      heights: {
        ground_floor_m: 3.0,
        upper_floors_m: 2.7,
        parapet_m: 0.3,
      },
    },
  };

  return payload;
}

/**
 * Normalize raw DNA from Qwen response
 * Ensures all required fields exist and are properly typed
 */
export function normalizeRawDNA(rawDNA) {
  if (!rawDNA || typeof rawDNA !== "object") {
    throw new Error("Invalid DNA: must be an object");
  }

  // Determine schema version: v2 if explicitly set, or if rawDNA already has dnaHash/instanceId markers
  const schemaVersion =
    rawDNA._schemaVersion ||
    (rawDNA.dnaHash || rawDNA.program?.rooms?.some((r) => r.instanceId)
      ? "2.0"
      : "2.0");

  // Floor abbreviation map for instance ID generation
  const FLOOR_ABBREV = {
    basement: "bs",
    ground: "gf",
    first: "ff",
    second: "sf",
    third: "tf",
  };

  // Track per-floor sequence counters for deterministic room instance IDs
  const floorSeqCounters = {};

  const normalized = {
    // Schema version
    version: schemaVersion,

    // Site section
    site: {
      polygon: Array.isArray(rawDNA.site?.polygon) ? rawDNA.site.polygon : [],
      area_m2: parseFloat(rawDNA.site?.area_m2) || 0,
      orientation: parseFloat(rawDNA.site?.orientation) || 0,
      climate_zone: String(rawDNA.site?.climate_zone || "temperate"),
      sun_path: String(rawDNA.site?.sun_path || "south"),
      wind_profile: String(rawDNA.site?.wind_profile || "moderate"),
    },

    // Program section
    program: {
      floors: parseInt(rawDNA.program?.floors) || 2,
      rooms: Array.isArray(rawDNA.program?.rooms)
        ? rawDNA.program.rooms.map((room) => {
            const name = String(room.name || "Room");
            const area_m2 = parseFloat(room.area_m2 || room.area || 20);
            const floor = String(room.floor || "ground");
            const orientation = String(room.orientation || "any");

            // Generate deterministic instance ID: room_{floorAbbrev}_{seq}
            const floorAbbrev = FLOOR_ABBREV[floor] || floor.substring(0, 2);
            const seqKey = floorAbbrev;
            floorSeqCounters[seqKey] = (floorSeqCounters[seqKey] || 0) + 1;
            const seq = String(floorSeqCounters[seqKey]).padStart(3, "0");
            const instanceId = room.instanceId || `room_${floorAbbrev}_${seq}`;

            // Compute per-room hash
            const roomHash = computeCDSHashSync({ name, area_m2, floor });

            return { name, area_m2, floor, orientation, instanceId, roomHash };
          })
        : [],
    },

    // Style section
    style: {
      architecture: String(rawDNA.style?.architecture || "contemporary"),
      materials: Array.isArray(rawDNA.style?.materials)
        ? rawDNA.style.materials
        : ["brick", "wood"],
      windows: {
        pattern: String(rawDNA.style?.windows?.pattern || "regular grid"),
        proportion: String(rawDNA.style?.windows?.proportion || "3:5"),
      },
    },

    // Geometry rules section
    geometry_rules: {
      grid: String(rawDNA.geometry_rules?.grid || "1m grid"),
      max_span: String(rawDNA.geometry_rules?.max_span || "6m"),
      roof_type: String(rawDNA.geometry_rules?.roof_type || "gable"),
    },

    // NEW: Geometry volume section (optional, for 3D massing)
    geometry: rawDNA.geometry
      ? {
          massing: {
            type: String(rawDNA.geometry.massing?.type || "single_volume"),
            footprint_shape: String(
              rawDNA.geometry.massing?.footprint_shape || "rectangular",
            ),
            floor_stacking: String(
              rawDNA.geometry.massing?.floor_stacking || "uniform",
            ),
          },
          roof: {
            type: String(
              rawDNA.geometry.roof?.type ||
                rawDNA.geometry_rules?.roof_type ||
                "gable",
            ),
            pitch_degrees:
              parseFloat(rawDNA.geometry.roof?.pitch_degrees) || 35,
            overhang_m: parseFloat(rawDNA.geometry.roof?.overhang_m) || 0.5,
          },
          facades: {
            north: rawDNA.geometry.facades?.north || {
              type: "primary",
              features: ["entrance", "windows"],
            },
            south: rawDNA.geometry.facades?.south || {
              type: "secondary",
              features: ["windows"],
            },
            east: rawDNA.geometry.facades?.east || {
              type: "side",
              features: ["windows"],
            },
            west: rawDNA.geometry.facades?.west || {
              type: "side",
              features: ["windows"],
            },
          },
          heights: {
            ground_floor_m:
              parseFloat(rawDNA.geometry.heights?.ground_floor_m) || 3.0,
            upper_floors_m:
              parseFloat(rawDNA.geometry.heights?.upper_floors_m) || 2.7,
            parapet_m: parseFloat(rawDNA.geometry.heights?.parapet_m) || 0.3,
          },
        }
      : undefined,
  };

  // Compute top-level DNA hash from the complete normalized object
  normalized.dnaHash = computeCDSHashSync(normalized);

  return normalized;
}

/**
 * Deep-freeze a DNA object to prevent mutation after normalization.
 * Returns the same object (frozen in place).
 *
 * @param {Object} dna - Normalized DNA object
 * @returns {Object} The same object, now deeply frozen
 */
export function freezeDNA(dna) {
  if (!dna || typeof dna !== "object") return dna;
  Object.freeze(dna);
  Object.keys(dna).forEach((key) => {
    const val = dna[key];
    if (val && typeof val === "object" && !Object.isFrozen(val)) {
      freezeDNA(val);
    }
  });
  return dna;
}

/**
 * House type maximum floor limits (UK typical)
 */
const HOUSE_TYPE_MAX_FLOORS = {
  "detached-house": 3,
  "semi-detached-house": 3,
  "terraced-house": 4,
  villa: 3,
  cottage: 2,
  mansion: 3,
  "multi-family": 6,
  duplex: 3,
};

/**
 * Validate DNA schema structure
 * Returns { valid: boolean, missing: string[], errors: string[], warnings: string[] }
 */
export function validateDNASchema(dna) {
  const missing = [];
  const errors = [];
  const warnings = [];

  // Check top-level keys
  const requiredKeys = ["site", "program", "style", "geometry_rules"];
  for (const key of requiredKeys) {
    if (!dna[key]) {
      missing.push(key);
    }
  }

  // Check site fields
  if (dna.site) {
    if (!Array.isArray(dna.site.polygon)) {
      errors.push("site.polygon must be an array");
    }
    if (typeof dna.site.area_m2 !== "number" || dna.site.area_m2 <= 0) {
      errors.push("site.area_m2 must be a positive number");
    }
  }

  // Check program fields
  if (dna.program) {
    if (typeof dna.program.floors !== "number" || dna.program.floors < 1) {
      errors.push("program.floors must be a positive integer");
    }
    if (!Array.isArray(dna.program.rooms) || dna.program.rooms.length === 0) {
      errors.push("program.rooms must be a non-empty array");
    }

    // Validate floor count against house type constraints
    const houseType = dna.program.houseType || dna.program.buildingType;
    if (houseType && HOUSE_TYPE_MAX_FLOORS[houseType]) {
      const maxFloors = HOUSE_TYPE_MAX_FLOORS[houseType];
      if (dna.program.floors > maxFloors) {
        warnings.push(
          `Floor count ${dna.program.floors} exceeds typical max ${maxFloors} for ${houseType}`,
        );
      }
    }
  }

  // Check style fields
  if (dna.style) {
    if (!dna.style.architecture) {
      errors.push("style.architecture is required");
    }
    if (
      !Array.isArray(dna.style.materials) ||
      dna.style.materials.length === 0
    ) {
      errors.push("style.materials must be a non-empty array");
    }
  }

  // Check geometry_rules fields
  if (dna.geometry_rules) {
    if (!dna.geometry_rules.roof_type) {
      errors.push("geometry_rules.roof_type is required");
    }
  }

  const valid = missing.length === 0 && errors.length === 0;

  if (!valid) {
    logger.warn("DNA schema validation failed", { missing, errors, warnings });
  } else if (warnings.length > 0) {
    logger.info("DNA schema validation passed with warnings", { warnings });
  }

  return { valid, missing, errors, warnings };
}

/**
 * Convert structured DNA to legacy format
 * For backwards compatibility with existing code
 */
export function convertToLegacyDNA(structuredDNA) {
  // Compute building footprint dimensions from room areas and floor count
  const floorCount = structuredDNA.program.floors || 1;
  const totalRoomArea = (structuredDNA.program.rooms || []).reduce(
    (sum, r) => sum + (r.area_m2 || 20),
    0,
  );
  // Add ~15% circulation factor to get gross floor area
  const grossFloorArea = totalRoomArea * 1.15;
  const footprintArea = grossFloorArea / floorCount;
  // Use 1.5:1 aspect ratio (facade width : depth) for typical buildings
  const aspectRatio = 1.5;
  const computedLength =
    Math.round(Math.sqrt(footprintArea * aspectRatio) * 10) / 10;
  const computedWidth = Math.round((footprintArea / computedLength) * 10) / 10;

  const legacy = {
    // Dimensions computed from program room areas
    dimensions: {
      length: computedLength,
      width: computedWidth,
      height: floorCount * 3.2,
      floors: floorCount,
      totalHeight: floorCount * 3.2,
      floorCount: floorCount,
    },

    // Materials from style
    materials: structuredDNA.style.materials.map((mat, idx) => ({
      name: mat,
      hexColor: idx === 0 ? "#B8604E" : idx === 1 ? "#8B4513" : "#CCCCCC",
      application: idx === 0 ? "exterior walls" : idx === 1 ? "roof" : "trim",
    })),

    // Roof from geometry_rules
    roof: {
      type: structuredDNA.geometry_rules.roof_type,
      pitch: 35,
      material: structuredDNA.style.materials[1] || "tiles",
    },

    // Rooms from program (strip v2-only fields for legacy compat)
    rooms: structuredDNA.program.rooms.map((r) => ({
      name: r.name,
      area_m2: r.area_m2,
      floor: r.floor,
      orientation: r.orientation,
      ...(r.instanceId ? { instanceId: r.instanceId } : {}),
    })),

    // Architecture style
    architecturalStyle: structuredDNA.style.architecture,

    // Site context
    locationContext: `${structuredDNA.site.climate_zone} climate, ${structuredDNA.site.sun_path} orientation`,

    // Climate design
    climateDesign: {
      zone: structuredDNA.site.climate_zone,
      orientation: structuredDNA.site.sun_path,
    },

    // Store structured version
    _structured: structuredDNA,
  };

  return legacy;
}

/**
 * Extract structured DNA from legacy format
 * For reading existing designs
 */
export function extractStructuredDNA(legacyDNA) {
  // If already has _structured, return it
  if (legacyDNA._structured) {
    return legacyDNA._structured;
  }

  // Otherwise, convert from legacy format
  const structured = {
    site: {
      polygon: [],
      area_m2:
        (legacyDNA.dimensions?.length || 15) *
        (legacyDNA.dimensions?.width || 10),
      orientation: 0,
      climate_zone: legacyDNA.climateDesign?.zone || "temperate",
      sun_path: legacyDNA.climateDesign?.orientation || "south",
      wind_profile: "moderate",
    },
    program: {
      floors:
        legacyDNA.dimensions?.floors || legacyDNA.dimensions?.floorCount || 2,
      rooms: legacyDNA.rooms || [],
    },
    style: {
      architecture: legacyDNA.architecturalStyle || "contemporary",
      materials: (legacyDNA.materials || []).map((m) => m.name || m),
      windows: {
        pattern: "regular grid",
        proportion: "3:5",
      },
    },
    geometry_rules: {
      grid: "1m grid",
      max_span: "6m",
      roof_type: legacyDNA.roof?.type || "gable",
    },
  };

  return structured;
}

export default {
  buildDNARequestPayload,
  normalizeRawDNA,
  validateDNASchema,
  convertToLegacyDNA,
  extractStructuredDNA,
  freezeDNA,
};

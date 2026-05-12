/**
 * Auto Level Assignment Service
 *
 * Automatically calculates optimal number of levels and assigns program spaces
 * based on the proportion between total program area and site area.
 *
 * Key Logic:
 * 1. Calculate optimal floor count: totalProgramArea / (siteArea × coverageRatio)
 * 2. Distribute spaces across floors based on architectural principles
 * 3. Ensure ground floor has public/accessible spaces
 * 4. Ensure upper floors have private/specialized spaces
 */

import logger from "../utils/logger.js";
import { resolveResidentialFloorCountPolicy } from "./project/residentialFloorPolicy.js";

/**
 * Sub-type specific coverage ratios
 * These ratios reflect typical site coverage for each house/building type
 */
const SUBTYPE_COVERAGE_RATIOS = {
  // Residential
  "detached-house": 0.35, // More garden space typical
  "semi-detached-house": 0.4, // Moderate coverage
  "terraced-house": 0.5, // Higher coverage, narrower plots
  villa: 0.3, // Large grounds
  cottage: 0.25, // Rural setting
  mansion: 0.3, // Large grounds
  "multi-family": 0.55, // Higher density
  duplex: 0.45, // Moderate coverage
  "apartment-building": 0.6, // Urban higher density
  condominium: 0.55, // Mid-density
  "residential-tower": 0.4, // Small footprint, tall

  // Healthcare
  clinic: 0.5, // Needs parking + accessibility
  "dental-clinic": 0.5,
  "health-center": 0.55,
  hospital: 0.45, // Large campus, lower coverage
  pharmacy: 0.6, // Retail-like

  // Commercial
  office: 0.55, // Typical office coverage
  coworking: 0.55,
  retail: 0.65, // High coverage
  "shopping-center": 0.6,
  restaurant: 0.6,
  cafe: 0.6,

  // Educational
  school: 0.4, // Needs playgrounds/sports fields
  kindergarten: 0.35, // Outdoor play areas essential
  "training-center": 0.5,
  library: 0.5,

  // Hospitality
  hotel: 0.5,
  hostel: 0.55,
  "bed-breakfast": 0.4,

  // Industrial
  warehouse: 0.7, // Maximum coverage
  factory: 0.65,
  workshop: 0.6,
  "logistics-center": 0.65,

  // Cultural & Public
  museum: 0.45,
  gallery: 0.5,
  theater: 0.55,
  "community-center": 0.5,

  // Sports & Recreation
  gym: 0.6,
  "sports-hall": 0.5,
  "swimming-pool": 0.55,

  // Religious
  church: 0.4,
  mosque: 0.45,
  temple: 0.4,
};

/**
 * Sub-type specific setback reductions
 * Fraction of the coverage-allowed footprint that survives after typical
 * front/side/rear setbacks for each sub-type. Lower = more land lost to
 * setbacks. Terraced and warehouse plots lose almost nothing because the
 * party walls / industrial yards run to the boundary; detached, villa and
 * kindergarten plots lose 25–30% to garden / play / shadow setbacks.
 */
const SUBTYPE_SETBACK_REDUCTION = {
  // Residential
  "detached-house": 0.75,
  "semi-detached-house": 0.85,
  "terraced-house": 0.95,
  villa: 0.7,
  cottage: 0.8,
  mansion: 0.7,
  "multi-family": 0.85,
  duplex: 0.85,
  "apartment-building": 0.85,
  condominium: 0.85,
  "residential-tower": 0.8,

  // Healthcare
  clinic: 0.85,
  "dental-clinic": 0.85,
  "health-center": 0.85,
  hospital: 0.8,
  pharmacy: 0.9,

  // Commercial
  office: 0.85,
  coworking: 0.85,
  retail: 0.95,
  "shopping-center": 0.85,
  restaurant: 0.9,
  cafe: 0.9,

  // Educational
  school: 0.8,
  kindergarten: 0.75,
  "training-center": 0.85,
  library: 0.85,

  // Hospitality
  hotel: 0.85,
  hostel: 0.85,
  "bed-breakfast": 0.85,

  // Industrial
  warehouse: 0.95,
  factory: 0.9,
  workshop: 0.9,
  "logistics-center": 0.9,

  // Cultural & Public
  museum: 0.85,
  gallery: 0.85,
  theater: 0.85,
  "community-center": 0.85,

  // Sports & Recreation
  gym: 0.85,
  "sports-hall": 0.85,
  "swimming-pool": 0.85,

  // Religious
  church: 0.85,
  mosque: 0.85,
  temple: 0.85,
};

const DEFAULT_SETBACK_REDUCTION = 0.85;

/**
 * Sub-type specific maximum floor limits (UK typical)
 */
const SUBTYPE_MAX_FLOORS = {
  // Residential
  "detached-house": 3,
  "semi-detached-house": 3,
  "terraced-house": 4,
  villa: 3,
  cottage: 2,
  mansion: 3,
  "multi-family": 6,
  duplex: 3,
  "apartment-building": 8,
  condominium: 10,
  "residential-tower": 20,

  // Healthcare
  clinic: 3,
  "dental-clinic": 2,
  "health-center": 3,
  hospital: 12,
  pharmacy: 2,

  // Commercial
  office: 10,
  coworking: 6,
  retail: 3,
  "shopping-center": 4,
  restaurant: 2,
  cafe: 2,

  // Educational
  school: 4,
  kindergarten: 2,
  "training-center": 4,
  library: 4,

  // Hospitality
  hotel: 15,
  hostel: 6,
  "bed-breakfast": 3,

  // Industrial
  warehouse: 2,
  factory: 3,
  workshop: 2,
  "logistics-center": 2,

  // Cultural & Public
  museum: 4,
  gallery: 3,
  theater: 3,
  "community-center": 3,

  // Sports & Recreation
  gym: 3,
  "sports-hall": 2,
  "swimming-pool": 2,

  // Religious
  church: 2,
  mosque: 2,
  temple: 2,
};

class AutoLevelAssignmentService {
  constructor() {
    logger.info("🏢 Auto Level Assignment Service initialized");
  }

  _getSpaceName(space) {
    if (!space || typeof space !== "object") return "";
    const candidate =
      space.name ||
      space.label ||
      space.roomName ||
      space.spaceName ||
      space.spaceType ||
      space.type ||
      "";
    return String(candidate || "").trim();
  }

  /**
   * Calculate optimal number of levels based on program area and site area.
   *
   * Returned `floorMetrics` shape (stable contract for callers):
   *   - optimalFloors          number|null  null when site area is missing
   *   - fallbackReason         string|null  "no-site-area" when guarded out
   *   - programToSiteRatio     number|null  totalProgramArea / siteArea
   *   - effectiveCoverage      number|null  coverage × setbackReduction
   *   - setbackReduction       number|null  the value actually used
   *   - exceedsSubtypeCap      boolean      true when programme demanded
   *                                          more floors than subtype/maxFloors cap
   *   - subtypeMaxFloors       number|null  the subtype cap when known
   *   - reasoning              string       human-readable explanation
   *   - (legacy)               minFloorsNeeded, maxFloorsAllowed,
   *                            actualFootprint, maxFootprintArea,
   *                            siteCoveragePercent, fitsWithinSite,
   *                            floorHeight, totalHeight, coverageRatio,
   *                            subType, floorPolicy
   *
   * @param {number} totalProgramArea - Total area of all program spaces (m²)
   * @param {number} siteArea - Site area from location (m²)
   * @param {Object} options - Optional parameters
   * @param {string} options.subType - Specific sub-type ID (e.g., 'detached-house')
   * @returns {Object} Floor count and metrics
   */
  calculateOptimalLevels(totalProgramArea, siteArea, options = {}) {
    const {
      buildingType = "mixed-use",
      subType = null, // Specific sub-type ID for precise ratios
      maxHeight = Infinity,
      maxFloors = null, // null = let subtype table decide; falls back to 10
      minFloorHeight = 2.7, // meters
      typicalFloorHeight = 3.0, // meters
      coverageRatio = 0.6, // 60% default site coverage
      circulationFactor = 1.15, // 15% circulation allowance
    } = options;

    const numericProgramArea = Number(totalProgramArea);
    const numericSiteArea = Number(siteArea);
    const safeProgramArea = Number.isFinite(numericProgramArea)
      ? Math.max(0, numericProgramArea)
      : 0;
    const safeSiteArea = Number.isFinite(numericSiteArea) ? numericSiteArea : 0;

    logger.info(
      "Calculating optimal floor count",
      {
        programArea: safeProgramArea,
        siteArea: safeSiteArea,
        buildingType,
        subType,
      },
      "🏢",
    );

    // Guard: without a positive site area the program/site ratio is undefined.
    // Returning a null shape avoids the previous Infinity → silent clamp at
    // maxFloors pattern. Callers must skip writing autoDetectedFloorCount.
    if (!(safeSiteArea > 0)) {
      logger.warn(
        "Skipping floor auto-detect: site area is missing or non-positive",
        { siteArea: safeSiteArea },
      );
      return {
        optimalFloors: null,
        fallbackReason: "no-site-area",
        programToSiteRatio: null,
        effectiveCoverage: null,
        setbackReduction: null,
        exceedsSubtypeCap: false,
        subtypeMaxFloors:
          subType && SUBTYPE_MAX_FLOORS[subType]
            ? SUBTYPE_MAX_FLOORS[subType]
            : null,
        minFloorsNeeded: null,
        maxFloorsAllowed: null,
        actualFootprint: null,
        maxFootprintArea: null,
        siteCoveragePercent: null,
        fitsWithinSite: false,
        floorHeight: typicalFloorHeight,
        totalHeight: null,
        coverageRatio: null,
        subType,
        floorPolicy: null,
        reasoning:
          "Site area unknown — auto floor detection skipped. Provide a site location to enable proportion-based level recommendation.",
      };
    }

    // Step 1: Adjust coverage ratio - prioritize sub-type specific ratio
    let adjustedCoverage = coverageRatio;

    // First check sub-type specific coverage (most accurate)
    if (subType && SUBTYPE_COVERAGE_RATIOS[subType]) {
      adjustedCoverage = SUBTYPE_COVERAGE_RATIOS[subType];
      logger.info(
        `   Using sub-type specific coverage: ${subType} = ${(adjustedCoverage * 100).toFixed(0)}%`,
      );
    }
    // Fallback to keyword matching for building type
    else if (
      buildingType.toLowerCase().includes("house") ||
      buildingType.toLowerCase().includes("villa")
    ) {
      adjustedCoverage = 0.4; // 40% for low-density residential
    } else if (
      buildingType.toLowerCase().includes("retail") ||
      buildingType.toLowerCase().includes("commercial")
    ) {
      adjustedCoverage = 0.7; // 70% for commercial
    } else if (
      buildingType.toLowerCase().includes("apartment") ||
      buildingType.toLowerCase().includes("office")
    ) {
      adjustedCoverage = 0.65; // 65% for medium-density
    }

    // Step 2: Calculate buildable footprint with subtype-aware setback
    const setbackReduction =
      subType && SUBTYPE_SETBACK_REDUCTION[subType]
        ? SUBTYPE_SETBACK_REDUCTION[subType]
        : DEFAULT_SETBACK_REDUCTION;
    const effectiveCoverage = adjustedCoverage * setbackReduction;
    const maxFootprintArea = safeSiteArea * effectiveCoverage;

    logger.info(`   Site area: ${safeSiteArea.toFixed(0)}m²`);
    logger.info(`   Coverage ratio: ${(adjustedCoverage * 100).toFixed(0)}%`);
    logger.info(
      `   Setback reduction: ${(setbackReduction * 100).toFixed(0)}%`,
    );
    logger.info(
      `   Effective coverage: ${(effectiveCoverage * 100).toFixed(0)}%`,
    );
    logger.info(`   Max footprint: ${maxFootprintArea.toFixed(0)}m²`);

    // Step 3: Account for circulation
    const totalAreaWithCirculation = safeProgramArea * circulationFactor;
    const programToSiteRatio = safeProgramArea / safeSiteArea;

    logger.info(`   Program area: ${safeProgramArea.toFixed(0)}m²`);
    logger.info(
      `   With circulation: ${totalAreaWithCirculation.toFixed(0)}m²`,
    );
    logger.info(`   Program/site ratio: ${programToSiteRatio.toFixed(2)}`);

    // Step 4: Calculate minimum floors needed. If maxFootprintArea is 0
    // (impossible coverage), treat minFloors as 1 to avoid Infinity. The
    // siteArea guard above already covers the common no-site case.
    const minFloorsNeeded =
      maxFootprintArea > 0
        ? Math.ceil(totalAreaWithCirculation / maxFootprintArea)
        : 1;

    logger.info(`   Min floors needed: ${minFloorsNeeded}`);

    // Step 5: Check height restrictions and sub-type limits
    const callerMaxFloors =
      Number.isFinite(Number(maxFloors)) && Number(maxFloors) > 0
        ? Math.max(1, Math.floor(Number(maxFloors)))
        : 10;
    let maxFloorsAllowed = callerMaxFloors;

    // Subtype-specific max floors (UK typical limits)
    const subtypeMaxFloors =
      subType && SUBTYPE_MAX_FLOORS[subType]
        ? SUBTYPE_MAX_FLOORS[subType]
        : null;
    if (subtypeMaxFloors !== null) {
      maxFloorsAllowed = Math.min(maxFloorsAllowed, subtypeMaxFloors);
      logger.info(`   Max floors (sub-type ${subType}): ${maxFloorsAllowed}`);
    }

    // Then apply height restrictions if specified
    if (maxHeight !== Infinity) {
      const heightBasedMax = Math.floor(maxHeight / typicalFloorHeight);
      maxFloorsAllowed = Math.min(maxFloorsAllowed, heightBasedMax);
      logger.info(`   Max floors allowed (height): ${maxFloorsAllowed}`);
    }

    // Step 6: Determine optimal floor count. The clamp is the policy
    // (subtype cap wins over demand), but we record exceedsSubtypeCap so
    // the UI can surface a warning instead of silently capping.
    const demandFloors = Math.max(minFloorsNeeded, 1);
    const exceedsSubtypeCap = demandFloors > maxFloorsAllowed;
    let optimalFloors = Math.min(demandFloors, maxFloorsAllowed);
    const floorPolicy = resolveResidentialFloorCountPolicy(
      {
        buildingType,
        subType,
        area: safeProgramArea,
        targetAreaM2: safeProgramArea,
        floorCountLocked: options.floorCountLocked === true,
      },
      optimalFloors,
      { maxFloors: maxFloorsAllowed },
    );
    if (floorPolicy.applied) {
      optimalFloors = floorPolicy.floorCount;
      logger.info(
        `   Residential floor policy: ${floorPolicy.reason} -> ${optimalFloors} floors`,
      );
    }

    // Step 7: Calculate actual footprint needed
    const actualFootprint = totalAreaWithCirculation / optimalFloors;

    // Step 8: Check if fits within site
    const fitsWithinSite = actualFootprint <= maxFootprintArea;
    const siteCoveragePercent = (actualFootprint / safeSiteArea) * 100;

    logger.info(`   Optimal floors: ${optimalFloors}`);
    logger.info(`   Actual footprint: ${actualFootprint.toFixed(0)}m²`);
    logger.info(`   Site coverage: ${siteCoveragePercent.toFixed(1)}%`);
    logger.info(`   Fits within site: ${fitsWithinSite ? "YES ✅" : "NO ❌"}`);
    if (exceedsSubtypeCap) {
      logger.warn(
        `   Programme demands ${demandFloors} storeys but ${subType || buildingType} caps at ${maxFloorsAllowed} — clamped to ${optimalFloors} with exceedsSubtypeCap=true`,
      );
    }

    return {
      optimalFloors,
      fallbackReason: null,
      minFloorsNeeded,
      maxFloorsAllowed,
      demandFloors,
      actualFootprint,
      maxFootprintArea,
      siteCoveragePercent,
      fitsWithinSite,
      floorHeight: typicalFloorHeight,
      totalHeight: optimalFloors * typicalFloorHeight,
      coverageRatio: adjustedCoverage,
      effectiveCoverage,
      setbackReduction,
      programToSiteRatio,
      exceedsSubtypeCap,
      subtypeMaxFloors,
      subType,
      floorPolicy,
      reasoning: this._generateFloorCountReasoning({
        floors: optimalFloors,
        programArea: safeProgramArea,
        siteArea: safeSiteArea,
        circulationFactor,
        adjustedCoverage,
        setbackReduction,
        programToSiteRatio,
        demandFloors,
        maxFloorsAllowed,
        subtypeMaxFloors,
        exceedsSubtypeCap,
        buildingType,
        subType,
      }),
    };
  }

  /**
   * Generate reasoning for floor count decision. Signature is an options
   * object so callers can pass the ratio + setback + cap context.
   * @private
   */
  _generateFloorCountReasoning({
    floors,
    programArea,
    siteArea,
    circulationFactor,
    adjustedCoverage,
    setbackReduction,
    programToSiteRatio,
    demandFloors,
    maxFloorsAllowed,
    subtypeMaxFloors,
    exceedsSubtypeCap,
    subType,
  } = {}) {
    const reasons = [];

    const ratioText =
      Number.isFinite(programToSiteRatio) && programToSiteRatio > 0
        ? programToSiteRatio.toFixed(2)
        : "n/a";
    const coveragePct = Number.isFinite(adjustedCoverage)
      ? Math.round(adjustedCoverage * 100)
      : null;
    const setbackPct = Number.isFinite(setbackReduction)
      ? Math.round(setbackReduction * 100)
      : null;

    reasons.push(
      `Programme ${programArea.toFixed(0)}m² × ${circulationFactor.toFixed(2)} circulation ÷ (site ${siteArea.toFixed(0)}m² × ${coveragePct}% coverage × ${setbackPct}% setback) ⇒ ratio ${ratioText} ⇒ ${demandFloors} storey${demandFloors === 1 ? "" : "s"} required`,
    );

    if (exceedsSubtypeCap) {
      const capLabel = subType ? `${subType} cap` : "subtype cap";
      reasons.push(
        `Clamped to ${floors} storey${floors === 1 ? "" : "s"} (${capLabel} ${maxFloorsAllowed}) — consider trimming programme or picking a denser subtype`,
      );
    } else if (subtypeMaxFloors && demandFloors === maxFloorsAllowed) {
      reasons.push(`At subtype cap ${maxFloorsAllowed}`);
    }

    if (floors === 1) {
      reasons.push("Single-storey: accessible, horizontal circulation only");
    } else if (floors === 2) {
      reasons.push("Two-storey: compact, accessible with one stair core");
    } else if (floors >= 3) {
      reasons.push(
        `${floors}-storey: vertical circulation (stairs/lift) required`,
      );
    }

    return reasons.join(". ");
  }

  /**
   * Automatically assign program spaces to levels based on architectural principles
   * @param {Array} programSpaces - Array of program space objects
   * @param {number} optimalFloors - Calculated optimal floor count
   * @param {string} buildingType - Type of building
   * @returns {Array} Program spaces with level assignments
   */
  autoAssignSpacesToLevels(
    programSpaces,
    optimalFloors,
    buildingType = "mixed-use",
  ) {
    if (!programSpaces || programSpaces.length === 0) {
      logger.warn("No program spaces to assign");
      return [];
    }

    logger.info(
      "Auto-assigning spaces to levels",
      {
        spaceCount: programSpaces.length,
        floors: optimalFloors,
        buildingType,
      },
      "🏢",
    );

    // Step 1: Categorize spaces by priority
    const categorized = this._categorizeSpacesByPriority(
      programSpaces,
      buildingType,
    );

    // Step 2: Calculate area per floor
    const totalArea = programSpaces.reduce(
      (sum, space) => sum + parseFloat(space.area || 0) * (space.count || 1),
      0,
    );
    const targetAreaPerFloor = totalArea / optimalFloors;

    logger.info(`   Target area per floor: ${targetAreaPerFloor.toFixed(0)}m²`);

    // Step 3: Assign spaces to levels
    const levels = this._generateLevelNames(optimalFloors);
    const assignedSpaces = this._distributeSpacesAcrossLevels(
      categorized,
      levels,
      targetAreaPerFloor,
      buildingType,
    );

    // Step 4: Log distribution
    levels.forEach((level, idx) => {
      const spacesOnLevel = assignedSpaces.filter((s) => s.level === level);
      const areaOnLevel = spacesOnLevel.reduce(
        (sum, s) => sum + parseFloat(s.area || 0) * (s.count || 1),
        0,
      );
      logger.info(
        `   ${level}: ${spacesOnLevel.length} spaces, ${areaOnLevel.toFixed(0)}m²`,
      );
    });

    return assignedSpaces;
  }

  /**
   * Categorize spaces by priority (ground vs upper floors)
   * @private
   */
  _categorizeSpacesByPriority(spaces, buildingType) {
    const categories = {
      groundPriority: [], // Must be on ground floor
      firstPriority: [], // Prefer first floor
      upperPriority: [], // Prefer upper floors
      flexible: [], // Can be on any floor
    };

    spaces.forEach((space) => {
      const name = this._getSpaceName(space).toLowerCase();
      const type = buildingType.toLowerCase();

      // Ground floor priorities (PUBLIC ACCESS, ACCESSIBILITY, HEAVY SERVICES)
      if (
        name.includes("reception") ||
        name.includes("waiting") ||
        name.includes("lobby") ||
        name.includes("entrance") ||
        name.includes("foyer") ||
        name.includes("sales") ||
        name.includes("retail") ||
        name.includes("shop") ||
        name.includes("restaurant") ||
        name.includes("cafe") ||
        name.includes("dining") ||
        name.includes("kitchen") ||
        name.includes("laboratory") ||
        name.includes("lab") ||
        name.includes("treatment") ||
        name.includes("consultation") ||
        name.includes("medical") ||
        name.includes("pharmacy") ||
        name.includes("emergency") ||
        name.includes("gym") ||
        name.includes("gymnasium") ||
        name.includes("cafeteria") ||
        name.includes("library") ||
        (name.includes("toilet") && !name.includes("staff"))
      ) {
        categories.groundPriority.push(space);
      }
      // First floor priorities (SEMI-PRIVATE, ADMINISTRATION)
      else if (
        name.includes("office") ||
        name.includes("admin") ||
        name.includes("staff room") ||
        name.includes("meeting") ||
        name.includes("conference") ||
        name.includes("records") ||
        name.includes("archive") ||
        name.includes("classroom") ||
        name.includes("study")
      ) {
        categories.firstPriority.push(space);
      }
      // Upper floor priorities (PRIVATE, RESIDENTIAL)
      else if (
        name.includes("bedroom") ||
        name.includes("bathroom") ||
        name.includes("ensuite") ||
        name.includes("master") ||
        name.includes("private") ||
        name.includes("study") ||
        name.includes("den") ||
        name.includes("loft") ||
        name.includes("roof") ||
        name.includes("terrace") ||
        name.includes("balcony")
      ) {
        categories.upperPriority.push(space);
      }
      // Building type specific
      else if (
        type.includes("house") ||
        type.includes("villa") ||
        type.includes("residential")
      ) {
        // Residential: Living spaces ground, bedrooms upper
        if (
          name.includes("living") ||
          name.includes("lounge") ||
          name.includes("wc")
        ) {
          categories.groundPriority.push(space);
        } else if (name.includes("bed") || name.includes("bath")) {
          categories.upperPriority.push(space);
        } else {
          categories.flexible.push(space);
        }
      } else if (
        type.includes("clinic") ||
        type.includes("hospital") ||
        type.includes("medical")
      ) {
        // Healthcare: Treatment ground, admin upper
        if (name.includes("patient") || name.includes("ward")) {
          categories.groundPriority.push(space);
        } else {
          categories.flexible.push(space);
        }
      } else {
        categories.flexible.push(space);
      }
    });

    logger.info("   Categorized spaces:");
    logger.info(`     Ground priority: ${categories.groundPriority.length}`);
    logger.info(`     First priority: ${categories.firstPriority.length}`);
    logger.info(`     Upper priority: ${categories.upperPriority.length}`);
    logger.info(`     Flexible: ${categories.flexible.length}`);

    return categories;
  }

  /**
   * Generate level names based on floor count
   * @private
   */
  _generateLevelNames(floorCount) {
    const levels = ["Ground"];

    if (floorCount >= 2) {
      levels.push("First");
    }
    if (floorCount >= 3) {
      levels.push("Second");
    }
    if (floorCount >= 4) {
      levels.push("Third");
    }
    if (floorCount >= 5) {
      for (let i = 5; i <= floorCount; i++) {
        levels.push(`${i - 1}th`);
      }
    }

    return levels;
  }

  /**
   * Distribute spaces across levels to balance area
   * @private
   */
  _distributeSpacesAcrossLevels(
    categorized,
    levels,
    targetAreaPerFloor,
    buildingType,
  ) {
    const assigned = [];
    const floorAreas = levels.map(() => 0);
    const levelIndexMap = new Map(levels.map((level, index) => [level, index]));

    // Helper to calculate space area
    const getSpaceArea = (space) =>
      parseFloat(space.area || 0) * (space.count || 1);
    const assignToLevel = (space, level) => ({
      ...space,
      level,
      levelIndex: levelIndexMap.has(level) ? levelIndexMap.get(level) : 0,
    });

    // Step 1: Assign ground priority spaces to ground floor
    categorized.groundPriority.forEach((space) => {
      assigned.push(assignToLevel(space, "Ground"));
      floorAreas[0] += getSpaceArea(space);
    });

    // Step 2: Assign first priority spaces to first floor (if exists)
    if (levels.length >= 2) {
      categorized.firstPriority.forEach((space) => {
        assigned.push(assignToLevel(space, "First"));
        floorAreas[1] += getSpaceArea(space);
      });
    } else {
      // If only 1 floor, add to ground
      categorized.firstPriority.forEach((space) => {
        assigned.push(assignToLevel(space, "Ground"));
        floorAreas[0] += getSpaceArea(space);
      });
    }

    // Step 3: Assign upper priority spaces to upper floors
    if (levels.length >= 2) {
      const upperStartIdx = 1; // Upper residential rooms can occupy First and above.
      let upperIdx = upperStartIdx;

      categorized.upperPriority.forEach((space) => {
        assigned.push(assignToLevel(space, levels[upperIdx]));
        floorAreas[upperIdx] += getSpaceArea(space);

        // Rotate through upper floors to balance
        upperIdx =
          ((upperIdx + 1 - upperStartIdx) % (levels.length - upperStartIdx)) +
          upperStartIdx;
      });
    } else {
      // If only 1 floor, add to ground
      categorized.upperPriority.forEach((space) => {
        assigned.push(assignToLevel(space, "Ground"));
        floorAreas[0] += getSpaceArea(space);
      });
    }

    // Step 4: Distribute flexible spaces to balance floor areas
    categorized.flexible.forEach((space) => {
      // Find floor with least area
      const minAreaIdx = floorAreas.indexOf(Math.min(...floorAreas));
      assigned.push(assignToLevel(space, levels[minAreaIdx]));
      floorAreas[minAreaIdx] += getSpaceArea(space);
    });

    // Step 5: Add circulation spaces if needed
    levels.forEach((level, idx) => {
      const hasStaircase = assigned.some((s) => {
        if (s.level !== level) return false;
        const name = this._getSpaceName(s).toLowerCase();
        return name.includes("stair") || name.includes("circulation");
      });

      if (!hasStaircase && levels.length > 1) {
        // Add staircase/circulation
        const circulationArea = Math.max(8, floorAreas[idx] * 0.15); // 15% or 8m² minimum
        assigned.push({
          name: idx === 0 ? "Staircase & Circulation" : "Circulation",
          area: circulationArea.toFixed(0),
          count: 1,
          level,
          levelIndex: idx,
        });
      }
    });

    return assigned;
  }

  /**
   * Complete auto-assignment: calculate levels AND assign spaces
   * @param {Array} programSpaces - Program spaces to assign
   * @param {number} siteArea - Site area in m²
   * @param {string} buildingType - Building type
   * @param {Object} constraints - Optional constraints (maxHeight, maxFloors)
   * @returns {Object} Result with assigned spaces and metrics
   */
  autoAssignComplete(
    programSpaces,
    siteArea,
    buildingType = "mixed-use",
    constraints = {},
  ) {
    logger.info(
      "🤖 AUTO-ASSIGNMENT: Starting complete auto-level assignment",
      null,
      "🏢",
    );

    // Step 1: Calculate total program area
    const totalProgramArea = programSpaces.reduce(
      (sum, space) => sum + parseFloat(space.area || 0) * (space.count || 1),
      0,
    );

    // Step 2: Calculate optimal floor count
    const floorCalc = this.calculateOptimalLevels(totalProgramArea, siteArea, {
      buildingType,
      ...constraints,
    });

    // Step 2b: If site area was missing, the service returns optimalFloors=null.
    // Pass spaces through unchanged so callers can fall back to their own count
    // (locked, manual, or fallback) without crashing autoAssignSpacesToLevels.
    if (floorCalc.optimalFloors == null) {
      logger.warn(
        "AUTO-ASSIGNMENT: skipped (no site area). Passing spaces through.",
      );
      return {
        success: false,
        fallbackReason: floorCalc.fallbackReason || "no-site-area",
        assignedSpaces: programSpaces,
        floorCount: null,
        floorMetrics: floorCalc,
        summary: {
          totalSpaces: programSpaces.length,
          totalArea: totalProgramArea,
          siteArea,
          floors: null,
          footprint: null,
          siteCoverage: null,
          reasoning: floorCalc.reasoning,
        },
      };
    }

    // Step 3: Auto-assign spaces to levels
    const assignedSpaces = this.autoAssignSpacesToLevels(
      programSpaces,
      floorCalc.optimalFloors,
      buildingType,
    );

    logger.info("✅ AUTO-ASSIGNMENT: Complete", null, "🏢");

    return {
      success: true,
      assignedSpaces,
      floorCount: floorCalc.optimalFloors,
      floorMetrics: floorCalc,
      summary: {
        totalSpaces: assignedSpaces.length,
        totalArea: totalProgramArea,
        siteArea,
        floors: floorCalc.optimalFloors,
        footprint: floorCalc.actualFootprint,
        siteCoverage: floorCalc.siteCoveragePercent,
        reasoning: floorCalc.reasoning,
      },
    };
  }
}

// Export singleton
const autoLevelAssignmentService = new AutoLevelAssignmentService();
export default autoLevelAssignmentService;

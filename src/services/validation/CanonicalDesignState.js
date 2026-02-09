/**
 * Canonical Design State (CDS)
 *
 * Single Source of Truth for a design run. Built once from validated DNA
 * and ProgramLock, then threaded immutably through the entire pipeline.
 *
 * The CDS hash changes if and only if the design intent changes.
 * Gates compare CDS hashes to detect drift.
 */

import { computeCDSHash, computeCDSHashSync } from "./cdsHash.js";

/**
 * @typedef {Object} CanonicalDesignState
 * @property {string} version       - Schema version
 * @property {string} designId      - Unique design identifier
 * @property {number} seed          - Base seed for reproducibility
 * @property {Object} site          - Site data (polygon, orientation, climate)
 * @property {Object} program       - Program data from ProgramLock
 * @property {Object} geometry      - Geometry constraints (grid, spans, roof)
 * @property {Object} style         - Style data (materials, colors, arch type)
 * @property {Object} constraints   - Hard constraints (max height, setbacks)
 * @property {string} hash          - SHA-256 of canonical JSON (excl. hash)
 */

/**
 * Build a CDS from validated masterDNA and programLock.
 *
 * @param {Object} params
 * @param {string} params.designId
 * @param {number} params.seed
 * @param {Object} params.masterDNA     - Validated master DNA
 * @param {Object} params.programLock   - Built ProgramSpacesLock
 * @param {Object} [params.locationData] - Location/site data
 * @returns {Promise<CanonicalDesignState>}
 */
export async function buildCDS({
  designId,
  seed,
  masterDNA,
  programLock,
  locationData,
}) {
  if (!masterDNA) {
    throw new CDSError("masterDNA is required to build CDS");
  }
  if (!programLock) {
    throw new CDSError("programLock is required to build CDS");
  }

  const cds = {
    version: "1.0.0",
    designId: designId || `design_${Date.now()}`,
    seed: seed || 0,

    site: extractSite(masterDNA, locationData),
    program: extractProgram(masterDNA, programLock),
    geometry: extractGeometry(masterDNA),
    style: extractStyle(masterDNA),
    constraints: extractConstraints(masterDNA, locationData),
  };

  cds.hash = await computeCDSHash(cds);
  return cds;
}

/**
 * Synchronous CDS build (uses non-crypto hash).
 */
export function buildCDSSync({
  designId,
  seed,
  masterDNA,
  programLock,
  locationData,
}) {
  if (!masterDNA) {
    throw new CDSError("masterDNA is required to build CDS");
  }
  if (!programLock) {
    throw new CDSError("programLock is required to build CDS");
  }

  const cds = {
    version: "1.0.0",
    designId: designId || `design_${Date.now()}`,
    seed: seed || 0,

    site: extractSite(masterDNA, locationData),
    program: extractProgram(masterDNA, programLock),
    geometry: extractGeometry(masterDNA),
    style: extractStyle(masterDNA),
    constraints: extractConstraints(masterDNA, locationData),
  };

  cds.hash = computeCDSHashSync(cds);
  return cds;
}

function extractSite(dna, locationData) {
  return {
    polygon: locationData?.sitePolygon || dna?.site?.polygon || null,
    area: locationData?.siteMetrics?.area || dna?.site?.area || null,
    orientation:
      dna?.site?.orientation ||
      locationData?.sunPath?.optimalOrientation ||
      null,
    climate: locationData?.climate?.type || dna?.site?.climate || null,
    address: locationData?.address || null,
  };
}

function extractProgram(dna, programLock) {
  return {
    levelCount: programLock.levelCount,
    levels: buildLevelsFromLock(programLock),
    totalAreaM2: programLock.spaces.reduce(
      (sum, s) => sum + s.targetAreaM2 * s.count,
      0,
    ),
    lockHash: programLock.hash,
  };
}

function buildLevelsFromLock(programLock) {
  const levelMap = new Map();
  for (const space of programLock.spaces) {
    if (!levelMap.has(space.lockedLevel)) {
      levelMap.set(space.lockedLevel, {
        index: space.lockedLevel,
        name: levelName(space.lockedLevel),
        spaces: [],
      });
    }
    levelMap.get(space.lockedLevel).spaces.push({
      id: space.spaceId,
      name: space.name,
      targetAreaM2: space.targetAreaM2,
      lockedLevel: space.lockedLevel,
      count: space.count,
    });
  }

  return Array.from(levelMap.values()).sort((a, b) => a.index - b.index);
}

function levelName(index) {
  if (index === -1) return "Basement";
  if (index === 0) return "Ground Floor";
  if (index === 1) return "First Floor";
  if (index === 2) return "Second Floor";
  return `Level ${index}`;
}

function extractGeometry(dna) {
  const dims = dna?.dimensions || {};
  const rules = dna?.geometry_rules || {};
  return {
    footprintLength: dims.length || null,
    footprintWidth: dims.width || dims.depth || null,
    totalHeight: dims.height || dims.totalHeight || null,
    floorHeights: dims.floorHeights || null,
    floorCount: dims.floors || dims.floorCount || null,
    gridModule: rules.grid || null,
    maxSpan: rules.max_span || null,
    roofType: rules.roof_type || dna?.roof?.type || null,
    roofPitch: dna?.roof?.pitch || null,
  };
}

function extractStyle(dna) {
  const materials = dna?.materials || dna?.style?.materials || [];
  return {
    architectureType:
      dna?.style?.architecture_type || dna?.architecturalStyle || null,
    materials: Array.isArray(materials)
      ? materials.map((m) => ({
          name: typeof m === "string" ? m : m.name,
          hexColor: m.hexColor || null,
          application: m.application || null,
        }))
      : [],
    colorPalette: dna?.colorPalette || null,
    windowPattern:
      dna?.style?.window_pattern || dna?.viewSpecificFeatures || null,
  };
}

function extractConstraints(dna, locationData) {
  return {
    maxHeight: locationData?.zoning?.maxHeight || null,
    setbacks: locationData?.zoning?.setbacks || null,
    density: locationData?.zoning?.density || null,
    zoningType: locationData?.zoning?.type || null,
  };
}

/**
 * Verify CDS integrity (hash matches content).
 */
export async function verifyCDS(cds) {
  if (!cds || !cds.hash) return false;
  const recomputed = await computeCDSHash(cds);
  return recomputed === cds.hash;
}

export function verifyCDSSync(cds) {
  if (!cds || !cds.hash) return false;
  const recomputed = computeCDSHashSync(cds);
  return recomputed === cds.hash;
}

export class CDSError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "CDSError";
    this.details = details;
  }
}

export default {
  buildCDS,
  buildCDSSync,
  verifyCDS,
  verifyCDSSync,
  CDSError,
};

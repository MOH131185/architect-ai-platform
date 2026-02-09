/**
 * Shared Type Schemas
 *
 * Central type definitions for:
 * - DNA (Master Design DNA)
 * - SheetDescriptor (Sheet configuration)
 * - SheetResult (Generated sheet output)
 * - OverlayDescriptor (Overlay metadata)
 * - ModifyRequest (Modification request)
 *
 * Used across orchestrator, prompt builder, AI calls, viewer, and export.
 */

import { PIPELINE_MODE } from "../config/pipelineMode.js";

/**
 * @typedef {Object} DNA
 * @property {Object} dimensions - Building dimensions
 * @property {number} dimensions.length - Length in meters
 * @property {number} dimensions.width - Width in meters
 * @property {number} dimensions.height - Height in meters
 * @property {number} dimensions.floors - Number of floors
 * @property {Array<number>} dimensions.floorHeights - Height of each floor
 * @property {number} dimensions.totalArea - Total floor area (GIFA) in m²
 * @property {Array<Material>} materials - Building materials
 * @property {Array<Room>} rooms - Room specifications
 * @property {Object} viewSpecificFeatures - Features per view (north, south, east, west)
 * @property {Array<string>} consistencyRules - Rules for cross-view consistency
 * @property {string} architecturalStyle - Architectural style name
 * @property {GeometryDNA} geometry - Geometry/volume DNA (massing-level data)
 * @property {string} projectType - Project type (residential, clinic, etc.)
 * @property {string} buildingCategory - Building category (residential, commercial, etc.)
 * @property {string} buildingSubType - Building sub-type (single-family, clinic, etc.)
 * @property {string} buildingNotes - Custom building notes
 * @property {string} entranceDirection - Main entrance direction (N, S, E, W, NE, NW, SE, SW)
 * @property {Array<ProgramSpace>} programSpaces - Program spaces with areas and levels
 * @property {Object} environmental - Environmental performance data
 * @property {Object} environmental.uValues - U-values for building elements
 * @property {number} environmental.uValues.wall - Wall U-value (W/m²K)
 * @property {number} environmental.uValues.roof - Roof U-value (W/m²K)
 * @property {number} environmental.uValues.glazing - Glazing U-value (W/m²K)
 * @property {number} environmental.uValues.floor - Floor U-value (W/m²K)
 * @property {string} environmental.epcRating - EPC rating (A-G)
 * @property {number} environmental.epcScore - EPC score (0-100)
 * @property {string} environmental.ventilation - Ventilation type
 * @property {number} environmental.sunOrientation - Optimal sun orientation (degrees)
 * @property {number} environmental.airTightness - Air tightness (m³/h/m² @ 50Pa)
 * @property {string} environmental.renewableEnergy - Renewable energy systems
 * @property {Object} boundaryValidation - Site boundary validation results
 * @property {Object} siteConstraints - Site constraints (setbacks, orientation)
 * @property {string} version - DNA schema version
 */

/**
 * @typedef {Object} GeometryVolume
 * @property {string} id - Unique volume id
 * @property {string} roofType - Roof type (gable, hip, flat, shed, butterfly, sawtooth)
 * @property {number} height - Height in meters
 * @property {number} levels - Number of levels within this volume
 * @property {Object} footprint - Footprint polygon or bbox
 * @property {Array<Object>} footprint.vertices - Vertices of footprint polygon
 */

/**
 * @typedef {Object} GeometryFacade
 * @property {string} orientation - north|south|east|west
 * @property {Array<Object>} segments - Segmentation data for facade bands/strips
 * @property {Array<Object>} openings - Openings (windows/doors) with positions/sizes
 * @property {string} roofEdge - Roof interaction at this facade (eave, parapet, gable-end)
 */

/**
 * @typedef {Object} GeometryDNA
 * @property {string} roofType - Primary roof type
 * @property {Array<string>} wings - Wing descriptors (e.g., 'L-shape', 'courtyard')
 * @property {Array<number>} floorHeights - Heights per floor
 * @property {Array<GeometryVolume>} volumes - Massing volumes
 * @property {Array<GeometryFacade>} facades - Facade/tagged orientations
 * @property {string} stackingStrategy - How floors/volumes stack
 * @property {Object} facadeOrientation - Mapping of orientation->notes
 * @property {Object} segmentation - Facade segmentation rules
 * @property {Object} geometryRules - Derived/extended geometry rules
 * @property {Object} metadata - Extra metadata (sources, reasoning hash)
 */

/**
 * @typedef {Object} GeometryRender
 * @property {string} type - render type (orthographic_north, orthographic_south, orthographic_east, orthographic_west, axonometric, perspective_hero)
 * @property {string} url - Image URL (neutral/grayscale)
 * @property {Object} camera - Camera metadata (position, target, fov/ortho size)
 * @property {string} model - Render backend/model used
 */

/**
 * @typedef {Object} GeometryBaseline
 * @property {GeometryDNA} geometryDNA - Geometry/volume DNA
 * @property {Array<GeometryRender>} renders - Rendered neutral images for geometry
 * @property {Object} scene - Serialized scene/specification
 */

/**
 * @typedef {Object} Material
 * @property {string} name - Material name
 * @property {string} hexColor - Hex color code
 * @property {string} application - Where material is applied
 */

/**
 * @typedef {Object} Room
 * @property {string} name - Room name
 * @property {string} dimensions - Room dimensions (e.g., "5.5m × 4.0m")
 * @property {string} floor - Floor level (ground, upper, etc.)
 * @property {Array<string>} features - Room features
 */

/**
 * @typedef {Object} ProgramSpace
 * @property {string} id - Unique space ID
 * @property {string} spaceType - Space type identifier
 * @property {string} label - Display label
 * @property {number} area - Area in square meters
 * @property {number} count - Number of identical spaces
 * @property {string} level - Floor level (ground, first, second, etc.)
 * @property {string} notes - Additional notes
 */

/**
 * @typedef {Object} SiteSnapshot
 * @property {string} address - Full address
 * @property {Object} coordinates - Lat/lng coordinates
 * @property {number} coordinates.lat - Latitude
 * @property {number} coordinates.lng - Longitude
 * @property {Array<Object>} sitePolygon - Site boundary polygon
 * @property {Object} climate - Climate data
 * @property {Object} zoning - Zoning information
 * @property {string} dataUrl - Site map image data URL
 * @property {Object} metadata - Additional metadata
 */

/**
 * @typedef {Object} SheetConfig
 * @property {string} size - Sheet size (A1, A0, etc.)
 * @property {string} orientation - Orientation (landscape, portrait)
 * @property {number} dpi - Target DPI
 * @property {string} format - Output format (PNG, PDF, SVG)
 */

/**
 * @typedef {Object} SheetDescriptor
 * @property {string} sheetType - Sheet type (ARCH, STRUCTURE, MEP)
 * @property {string} sheetId - Unique sheet ID
 * @property {string} sheetGroupId - Group ID for multi-sheet packages
 * @property {SheetConfig} config - Sheet configuration
 * @property {DNA} dna - Master DNA
 * @property {SiteSnapshot} siteSnapshot - Site snapshot
 * @property {Array<OverlayDescriptor>} overlays - Overlay descriptors
 * @property {Object} layout - Panel layout metadata
 * @property {number} seed - Generation seed
 * @property {string} basePrompt - Base generation prompt
 */

/**
 * @typedef {Object} SheetMetadata
 * @property {string} format - Sheet format (A1, etc.)
 * @property {string} orientation - Orientation (landscape, portrait)
 * @property {Object} dimensions - Dimensions in various units
 * @property {Object} dimensions.mm - Millimeters
 * @property {Object} dimensions.px - Pixels
 * @property {number} dimensions.dpi - DPI
 * @property {number} dimensions.ratio - Aspect ratio
 * @property {boolean} dimensions.isLandscape - Is landscape
 * @property {string} generatedAt - ISO timestamp
 * @property {string} dnaVersion - DNA version
 * @property {number} portfolioBlend - Portfolio blend percentage
 * @property {string} location - Location string
 * @property {string} style - Architectural style
 * @property {string} buildingCategory - Building category
 * @property {string} buildingSubType - Building sub-type
 * @property {string} entranceOrientation - Main entrance orientation
 * @property {boolean} hasSitePlan - Has site plan
 * @property {string} sitePlanPolicy - Site plan policy (embed, placeholder, overlay)
 * @property {Array<PanelMetadata>} panels - Panel metadata
 * @property {Object} panelMap - Panel map (for hybrid mode)
 * @property {string} model - AI model used
 * @property {number} width - Width in pixels
 * @property {number} height - Height in pixels
 * @property {string} a1LayoutKey - Layout key (uk-riba-standard, etc.)
 */

/**
 * @typedef {Object} PanelMetadata
 * @property {string} id - Panel ID
 * @property {string} name - Panel name
 * @property {string} view - View type
 * @property {string} status - Status (rendered, missing, etc.)
 * @property {Array<string>} keywords - Keywords for validation
 * @property {number} minCount - Minimum count
 * @property {number} idealCount - Ideal count
 * @property {Object} position - Position on sheet
 */

/**
 * @typedef {Object} SheetResult
 * @property {string} url - Sheet image URL
 * @property {string} originalUrl - Original URL (before proxy)
 * @property {number} seed - Seed used
 * @property {string} prompt - Generation prompt
 * @property {string} negativePrompt - Negative prompt
 * @property {SheetMetadata} metadata - Sheet metadata
 * @property {DNA} dna - Master DNA
 * @property {Object} validation - Validation results
 * @property {number} consistencyScore - Consistency score
 * @property {string} workflow - Workflow type (PIPELINE_MODE.MULTI_PANEL or legacy label)
 */

/**
 * @typedef {Object} OverlayDescriptor
 * @property {string} id - Overlay ID
 * @property {string} type - Overlay type (site-boundary, zoning, climate, annotation)
 * @property {string} dataUrl - Overlay image data URL
 * @property {Object} position - Position on sheet
 * @property {number} position.x - X position (0-1 normalized)
 * @property {number} position.y - Y position (0-1 normalized)
 * @property {number} position.width - Width (0-1 normalized)
 * @property {number} position.height - Height (0-1 normalized)
 * @property {Object} metadata - Additional metadata
 * @property {number} zIndex - Z-index for layering
 */

/**
 * @typedef {Object} ModifyRequest
 * @property {string} designId - Design ID to modify
 * @property {string} sheetId - Sheet ID to modify
 * @property {string} versionId - Base version ID
 * @property {Object} quickToggles - Quick toggle flags
 * @property {boolean} quickToggles.addSections - Add sections
 * @property {boolean} quickToggles.add3DView - Add 3D views
 * @property {boolean} quickToggles.addInterior3D - Add interior 3D
 * @property {boolean} quickToggles.addDetails - Add details
 * @property {boolean} quickToggles.addFloorPlans - Add floor plans
 * @property {boolean} quickToggles.addSitePlan - Add site plan
 * @property {string} customPrompt - Custom modification prompt
 * @property {Array<string>} targetPanels - Specific panels to modify
 * @property {boolean} strictLock - Use strict consistency lock
 * @property {number} imageStrength - Image-to-image strength (0.08-0.22)
 */

/**
 * @typedef {Object} ModifyResult
 * @property {boolean} success - Success status
 * @property {SheetResult} sheet - Modified sheet result
 * @property {string} versionId - New version ID
 * @property {number} driftScore - Drift score vs baseline
 * @property {Object} consistencyDetails - Consistency validation details
 * @property {Object} versionMetadata - Version metadata
 * @property {string} baseDesignId - Base design ID
 * @property {string} baseSheetId - Base sheet ID
 * @property {Array<string>} modifiedPanels - Panels that were modified
 */

/**
 * @typedef {Object} PanelArtifact
 * @property {string} imageUrl - Panel image URL
 * @property {number} seed - Panel generation seed
 * @property {string} prompt - Panel generation prompt
 * @property {string} negativePrompt - Panel negative prompt
 * @property {number} width - Panel width in pixels
 * @property {number} height - Panel height in pixels
 * @property {Object} coordinates - Panel coordinates on sheet
 * @property {number} coordinates.x - X position in pixels
 * @property {number} coordinates.y - Y position in pixels
 * @property {number} coordinates.w - Width in pixels
 * @property {number} coordinates.h - Height in pixels
 * @property {Object} metadata - Additional panel metadata
 */

/**
 * @typedef {Object} BaselineArtifactBundle
 * @property {string} designId - Design ID
 * @property {string} sheetId - Sheet ID
 * @property {string} baselineImageUrl - Baseline image URL (composed sheet)
 * @property {string} siteSnapshotUrl - Site snapshot URL
 * @property {DNA} baselineDNA - Baseline DNA
 * @property {Object} baselineLayout - Panel coordinates
 * @property {Array<Object>} baselineLayout.panelCoordinates - Panel coordinate array
 * @property {string} baselineLayout.layoutKey - Layout key (e.g., 'uk-riba-standard')
 * @property {number} baselineLayout.sheetWidth - Sheet width in pixels
 * @property {number} baselineLayout.sheetHeight - Sheet height in pixels
 * @property {Object.<string, PanelArtifact>} panels - Multi-panel artifacts (panelType -> artifact)
 * @property {Object} metadata - Metadata (seed, model, hashes)
 * @property {number} metadata.seed - Base generation seed
 * @property {string} metadata.model - AI model used
 * @property {string} metadata.dnaHash - DNA hash for validation
 * @property {string} metadata.layoutHash - Layout hash for validation
 * @property {number} metadata.width - Sheet width in pixels
 * @property {number} metadata.height - Sheet height in pixels
 * @property {string} metadata.a1LayoutKey - A1 layout key
 * @property {string} metadata.generatedAt - Generation timestamp
 * @property {string} metadata.workflow - Workflow type (PIPELINE_MODE.MULTI_PANEL)
 * @property {number} metadata.consistencyScore - Consistency score
 * @property {number} metadata.panelCount - Number of panels
 * @property {Object} seeds - Seed mapping
 * @property {number} seeds.base - Base seed
 * @property {string} seeds.derivationMethod - Derivation method (hash-derived, offset)
 * @property {Object.<string, number>} seeds.panelSeeds - Panel-specific seeds (panelType -> seed)
 * @property {string} basePrompt - Base generation prompt
 * @property {Array<Object>} consistencyLocks - Consistency locks for modifications
 */

/**
 * @typedef {Object} WorkflowParams
 * @property {Object} env - Environment adapter
 * @property {SiteSnapshot} siteSnapshot - Site snapshot
 * @property {Object} designSpec - Design specifications
 * @property {Object} featureFlags - Feature flags
 * @property {number} seed - Generation seed
 * @property {string} sheetType - Sheet type (ARCH, STRUCTURE, MEP)
 * @property {Array<OverlayDescriptor>} overlays - Overlays
 * @property {string} mode - Mode (generate, modify)
 * @property {Object} hooks - Injected hooks for composition/export
 */

/**
 * Normalize DNA to canonical format
 * @param {Object} dna - Raw DNA
 * @returns {DNA} Normalized DNA
 */
export function normalizeDNA(dna) {
  if (!dna || typeof dna !== "object") {
    return null;
  }

  return {
    dimensions: dna.dimensions || {},
    materials: Array.isArray(dna.materials) ? dna.materials : [],
    rooms: Array.isArray(dna.rooms) ? dna.rooms : [],
    viewSpecificFeatures: dna.viewSpecificFeatures || {},
    consistencyRules: Array.isArray(dna.consistencyRules)
      ? dna.consistencyRules
      : [],
    architecturalStyle:
      dna.architecturalStyle || dna.architectural_style?.name || "Contemporary",
    geometry: dna.geometry || dna.geometryDNA || null,
    projectType: dna.projectType || dna.buildingProgram || "residential",
    buildingCategory: dna.buildingCategory || null,
    buildingSubType: dna.buildingSubType || null,
    buildingNotes: dna.buildingNotes || "",
    entranceDirection: dna.entranceDirection || "N",
    programSpaces: Array.isArray(dna.programSpaces) ? dna.programSpaces : [],
    environmental: dna.environmental || {
      uValues: {
        wall: 0.18,
        roof: 0.13,
        glazing: 1.4,
        floor: 0.15,
      },
      epcRating: "B",
      epcScore: 85,
      ventilation: "Natural cross-ventilation",
      sunOrientation: 180,
      airTightness: 5.0,
      renewableEnergy: null,
    },
    boundaryValidation: dna.boundaryValidation || null,
    siteConstraints: dna.siteConstraints || null,
    version: dna.version || "1.0",
  };
}

/**
 * Normalize site snapshot to canonical format
 * @param {Object} snapshot - Raw site snapshot
 * @returns {SiteSnapshot} Normalized site snapshot
 */
export function normalizeSiteSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return null;
  }

  return {
    address: snapshot.address || "",
    coordinates: snapshot.coordinates || snapshot.center || { lat: 0, lng: 0 },
    sitePolygon: Array.isArray(snapshot.sitePolygon)
      ? snapshot.sitePolygon
      : Array.isArray(snapshot.polygon)
        ? snapshot.polygon
        : [],
    climate: snapshot.climate || {},
    zoning: snapshot.zoning || {},
    dataUrl: snapshot.dataUrl || null,
    metadata: snapshot.metadata || {},
  };
}

/**
 * Normalize sheet metadata to canonical format
 * @param {Object} metadata - Raw metadata
 * @returns {SheetMetadata} Normalized metadata
 */
export function normalizeSheetMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const panelArray = Array.isArray(metadata.panels) ? metadata.panels : [];
  const panelMap =
    metadata.panelMap ||
    (!Array.isArray(metadata.panels) &&
    metadata.panels &&
    typeof metadata.panels === "object"
      ? metadata.panels
      : null);

  return {
    format: metadata.format || "A1",
    orientation: metadata.orientation || "landscape",
    dimensions: metadata.dimensions || {},
    coordinates: metadata.coordinates || metadata.panelCoordinates || null,
    generatedAt: metadata.generatedAt || new Date().toISOString(),
    dnaVersion: metadata.dnaVersion || "1.0",
    portfolioBlend: metadata.portfolioBlend || 70,
    location: metadata.location || "",
    style: metadata.style || "Contemporary",
    buildingCategory: metadata.buildingCategory || null,
    buildingSubType: metadata.buildingSubType || null,
    entranceOrientation: metadata.entranceOrientation || "N",
    hasSitePlan: metadata.hasSitePlan || false,
    sitePlanPolicy: metadata.sitePlanPolicy || "placeholder",
    panels: panelArray,
    panelMap,
    model: metadata.model || "FLUX.1-dev",
    width: metadata.width || 1792,
    height: metadata.height || 1269,
    a1LayoutKey: metadata.a1LayoutKey || "uk-riba-standard",
    workflow: metadata.workflow || undefined,
  };
}

/**
 * Create sheet descriptor
 * @param {Object} params - Parameters
 * @returns {SheetDescriptor} Sheet descriptor
 */
export function createSheetDescriptor(params) {
  return {
    sheetType: params.sheetType || "ARCH",
    sheetId: params.sheetId || `sheet_${Date.now()}`,
    sheetGroupId: params.sheetGroupId || null,
    config: params.config || {
      size: "A1",
      orientation: "landscape",
      dpi: 300,
      format: "PNG",
    },
    dna: normalizeDNA(params.dna),
    siteSnapshot: normalizeSiteSnapshot(params.siteSnapshot),
    overlays: Array.isArray(params.overlays) ? params.overlays : [],
    layout: params.layout || null,
    seed: params.seed || Date.now(),
    basePrompt: params.basePrompt || "",
  };
}

/**
 * Create sheet result
 * @param {Object} params - Parameters
 * @returns {SheetResult} Sheet result
 */
export function createSheetResult(params) {
  return {
    url: params.url || params.composedSheetUrl || "",
    composedSheetUrl: params.composedSheetUrl || params.url || "",
    originalUrl:
      params.originalUrl || params.url || params.composedSheetUrl || "",
    seed: params.seed || 0,
    prompt: params.prompt || "",
    negativePrompt: params.negativePrompt || "",
    metadata: normalizeSheetMetadata(params.metadata),
    dna: normalizeDNA(params.dna),
    validation: params.validation || null,
    consistencyScore: params.consistencyScore || null,
    workflow: params.workflow || PIPELINE_MODE.MULTI_PANEL,
  };
}

/**
 * Normalize multi-panel A1 result structure from orchestrator/backend
 * @param {Object} raw - Raw result from runMultiPanelA1Workflow
 * @returns {Object|null} Normalized result
 */
export function normalizeMultiPanelResult(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const panelMap =
    raw.panelMap ||
    raw.panels ||
    raw.metadata?.panels ||
    raw.a1Sheet?.panelMap ||
    raw.a1Sheet?.panels ||
    {};
  const geometryDNA =
    raw.geometryDNA || raw.geometry || raw.a1Sheet?.geometryDNA || null;
  const geometryRenders =
    raw.geometryRenders || raw.a1Sheet?.geometryRenders || null;
  const coordinates =
    raw.panelCoordinates ||
    raw.coordinates ||
    raw.metadata?.coordinates ||
    raw.a1Sheet?.coordinates ||
    raw.a1Sheet?.metadata?.coordinates ||
    raw.metadata?.panelCoordinates ||
    null;
  const composedSheetUrl =
    raw.composedSheetUrl ||
    raw.url ||
    raw.resultUrl ||
    raw.a1Sheet?.url ||
    raw.a1Sheet?.composedSheetUrl ||
    raw.a1SheetUrl ||
    null;

  const normalizedMetadata = normalizeSheetMetadata({
    ...raw.metadata,
    workflow:
      raw.metadata?.workflow || raw.workflow || PIPELINE_MODE.MULTI_PANEL,
    panelCount:
      raw.metadata?.panelCount || (panelMap ? Object.keys(panelMap).length : 0),
    panels: panelMap,
    coordinates,
  });

  const normalized = {
    success: raw.success !== false,
    url: composedSheetUrl,
    composedSheetUrl,
    resultUrl: composedSheetUrl,
    masterDNA: raw.masterDNA || raw.dna,
    dna: raw.masterDNA || raw.dna,
    seed: raw.metadata?.baseSeed || raw.seed || raw.seeds?.base || Date.now(),
    prompt: raw.prompt || raw.mainPrompt || "Multi-panel A1 generation",
    metadata: normalizedMetadata,
    panelCoordinates: coordinates,
    coordinates,
    panels: panelMap,
    panelMap,
    consistencyReport: raw.consistencyReport,
    baselineBundle: raw.baselineBundle,
    seeds: raw.seeds,
    projectContext: raw.projectContext,
    locationData: raw.locationData,
    geometryDNA,
    geometryRenders,
  };

  normalized.a1Sheet = {
    ...(raw.a1Sheet || {}),
    url: composedSheetUrl,
    composedSheetUrl,
    metadata: normalizedMetadata,
    panels: panelMap,
    panelMap,
    coordinates,
    geometryDNA,
    geometryRenders,
  };

  return normalized;
}

/**
 * Create overlay descriptor
 * @param {Object} params - Parameters
 * @returns {OverlayDescriptor} Overlay descriptor
 */
export function createOverlayDescriptor(params) {
  return {
    id: params.id || `overlay_${Date.now()}`,
    type: params.type || "annotation",
    dataUrl: params.dataUrl || null,
    position: {
      x: params.position?.x || 0,
      y: params.position?.y || 0,
      width: params.position?.width || 1,
      height: params.position?.height || 1,
    },
    metadata: params.metadata || {},
    zIndex: params.zIndex || 0,
  };
}

/**
 * Create modify request
 * @param {Object} params - Parameters
 * @returns {ModifyRequest} Modify request
 */
export function createModifyRequest(params) {
  return {
    designId: params.designId || "",
    sheetId: params.sheetId || "",
    versionId: params.versionId || "base",
    quickToggles: {
      addSections: params.quickToggles?.addSections || false,
      add3DView: params.quickToggles?.add3DView || false,
      addInterior3D: params.quickToggles?.addInterior3D || false,
      addDetails: params.quickToggles?.addDetails || false,
      addFloorPlans: params.quickToggles?.addFloorPlans || false,
      addSitePlan: params.quickToggles?.addSitePlan || false,
    },
    customPrompt: params.customPrompt || "",
    targetPanels: Array.isArray(params.targetPanels) ? params.targetPanels : [],
    strictLock: params.strictLock !== false,
    imageStrength: params.imageStrength || null,
  };
}

/**
 * Create baseline artifact bundle
 * @param {Object} params - Parameters
 * @returns {BaselineArtifactBundle} Baseline artifact bundle
 */
export function createBaselineArtifactBundle(params) {
  const workflow =
    params.workflow || params.metadata?.workflow || PIPELINE_MODE.MULTI_PANEL;
  const panelCount = params.panels ? Object.keys(params.panels).length : 0;

  return {
    designId: params.designId || "",
    sheetId: params.sheetId || "",
    baselineImageUrl: params.baselineImageUrl || "",
    siteSnapshotUrl: params.siteSnapshotUrl || null,
    baselineDNA: normalizeDNA(params.baselineDNA),
    baselineLayout: {
      panelCoordinates:
        params.baselineLayout?.panelCoordinates ||
        params.panelCoordinates ||
        [],
      layoutKey:
        params.baselineLayout?.layoutKey ||
        params.a1LayoutKey ||
        "uk-riba-standard",
      sheetWidth: params.baselineLayout?.sheetWidth || params.width || 1792,
      sheetHeight: params.baselineLayout?.sheetHeight || params.height || 1269,
    },
    geometryBaseline: params.geometryBaseline || null,
    panels: params.panels || {},
    metadata: {
      seed: params.seed || 0,
      model: params.model || "FLUX.1-dev",
      dnaHash: params.dnaHash || "",
      layoutHash: params.layoutHash || "",
      width: params.width || 1792,
      height: params.height || 1269,
      a1LayoutKey: params.a1LayoutKey || "uk-riba-standard",
      generatedAt: params.generatedAt || new Date().toISOString(),
      workflow: workflow,
      consistencyScore: params.consistencyScore || null,
      panelCount: panelCount,
      geometryHash: params.geometryHash || "",
      ...params.metadata,
    },
    seeds: {
      base: params.seeds?.base || params.seed || 0,
      derivationMethod: params.seeds?.derivationMethod || "hash-derived",
      panelSeeds: params.seeds?.panelSeeds || {},
    },
    basePrompt: params.basePrompt || "",
    consistencyLocks: params.consistencyLocks || [],
  };
}

/**
 * Create workflow params
 * @param {Object} params - Parameters
 * @returns {WorkflowParams} Workflow params
 */
export function createWorkflowParams(params) {
  return {
    env: params.env || {},
    siteSnapshot: normalizeSiteSnapshot(params.siteSnapshot),
    designSpec: params.designSpec || {},
    featureFlags: params.featureFlags || {},
    seed: params.seed || Date.now(),
    sheetType: params.sheetType || "ARCH",
    overlays: Array.isArray(params.overlays) ? params.overlays : [],
    mode: params.mode || "generate",
    hooks: params.hooks || {},
  };
}

// Export types for JSDoc
export default {
  normalizeDNA,
  normalizeSiteSnapshot,
  normalizeSheetMetadata,
  createSheetDescriptor,
  createSheetResult,
  createOverlayDescriptor,
  createModifyRequest,
  createBaselineArtifactBundle,
  createWorkflowParams,
  normalizeMultiPanelResult,
};

/**
 * Design History Repository — CANONICAL PERSISTED STORE
 *
 * Single source of truth for persisted design records, versions, and metadata.
 * All active flows (generation, modification, retrieval) MUST read/write through
 * this repository. Other history services are adapters or ephemeral helpers.
 *
 * Backend: localStorage via storageManager (key: "design_history")
 * Schema version: 2
 *
 * Encapsulates persistence of design history using pluggable storage backends.
 * Applies aggressive sanitization to avoid localStorage quota errors.
 */

import storageManager from "../utils/storageManager.js";
import { deleteSiteSnapshot } from "../utils/siteSnapshotStore.js";
import logger from "../utils/logger.js";
import { PIPELINE_MODE } from "../config/pipelineMode.js";
import {
  stripDataUrl,
  compressMasterDNA,
  sanitizeSheetMetadata,
  sanitizePanelMap,
  stripDataUrlsDeep,
} from "../utils/designHistorySanitizer.js";
import baselineArtifactStore from "./baselineArtifactStore.js";
import designHistoryArtifactStore, {
  isDesignHistoryArtifactUrl,
  isStorableDataUrl,
} from "./designHistoryArtifactStore.js";

const MAX_DESIGNS = 2;
const MAX_VERSIONS_PER_DESIGN = 3;
const MAX_PAYLOAD_BYTES = 4.5 * 1024 * 1024;
const MAX_HISTORY_BYTES = 4.5 * 1024 * 1024;
const MAX_PORTFOLIO_FILES = 10;

/**
 * Storage backend interface
 */
class StorageBackend {
  async save(key, data) {
    throw new Error("Not implemented");
  }

  async get(key) {
    throw new Error("Not implemented");
  }

  async list() {
    throw new Error("Not implemented");
  }

  async delete(key) {
    throw new Error("Not implemented");
  }
}

/**
 * LocalStorage backend (uses storageManager)
 */
class LocalStorageBackend extends StorageBackend {
  constructor(storageKey = "design_history") {
    super();
    this.storageKey = storageKey;
  }

  async save(key, data) {
    const all = await this.list();
    const index = all.findIndex((d) => (d.id || d.designId) === key);

    if (index >= 0) {
      all[index] = data;
    } else {
      all.push(data);
    }

    return storageManager.setItem(this.storageKey, all);
  }

  async setAll(data) {
    return storageManager.setItem(this.storageKey, data);
  }

  async get(key) {
    const all = await this.list();
    return all.find((d) => (d.id || d.designId) === key) || null;
  }

  async list() {
    // Migration: Check for old double-prefixed key
    try {
      const oldKey = "archiAI_design_history"; // Will become archiAI_archiAI_design_history with old prefix
      const oldData = localStorage.getItem("archiAI_" + oldKey);
      if (oldData) {
        logger.info("Migrating from old double-prefixed storage key...");
        const parsed = JSON.parse(oldData);
        const data = parsed._data || parsed;
        if (Array.isArray(data) && data.length > 0) {
          // Save to new key (without double prefix)
          await storageManager.setItem(this.storageKey, data);
          // Remove old key
          localStorage.removeItem("archiAI_" + oldKey);
          logger.success("Migration complete, old storage cleaned up");
          return data;
        }
      }
    } catch (migrationError) {
      logger.warn("Migration check failed, continuing...", migrationError);
    }

    const stored = await storageManager.getItem(this.storageKey, []);

    // Handle array format
    if (Array.isArray(stored)) {
      return stored;
    }

    // Handle corrupted object format (migration)
    if (stored && typeof stored === "object") {
      const keys = Object.keys(stored)
        .filter((k) => /^\d+$/.test(k))
        .sort((a, b) => Number(a) - Number(b));

      if (keys.length > 0) {
        const repaired = keys.map((k) => stored[k]);
        // Re-save with correct format
        await storageManager.setItem(this.storageKey, repaired);
        return repaired;
      }
    }

    return [];
  }

  async delete(key) {
    const all = await this.list();
    const filtered = all.filter((d) => (d.id || d.designId) !== key);
    return storageManager.setItem(this.storageKey, filtered);
  }
}

/**
 * IndexedDB backend (future implementation)
 */
class IndexedDBBackend extends StorageBackend {
  constructor(dbName = "archiAI", storeName = "designs") {
    super();
    this.dbName = dbName;
    this.storeName = storeName;
    this.db = null;
  }

  async init() {
    // TODO: Implement IndexedDB initialization
    // For now, fallback to localStorage
    this.fallback = this.fallback || new LocalStorageBackend();
  }

  async save(key, data) {
    if (!this.fallback) await this.init();
    return this.fallback.save(key, data);
  }

  async get(key) {
    if (!this.fallback) await this.init();
    return this.fallback.get(key);
  }

  async list() {
    if (!this.fallback) await this.init();
    return this.fallback.list();
  }

  async delete(key) {
    if (!this.fallback) await this.init();
    return this.fallback.delete(key);
  }
}

function cloneData(value) {
  if (value === null || value === undefined) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    logger.warn("Failed to deep-clone design history payload", error);
    return value;
  }
}

function estimateSize(value) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch (error) {
    logger.warn("Failed to estimate payload size", error);
    return Number.POSITIVE_INFINITY;
  }
}

function sanitizeSiteSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") {
    return snapshot || null;
  }

  const sanitized = cloneData(snapshot) || {};
  stripDataUrlsDeep(sanitized);

  if (sanitized.dataUrl) {
    sanitized.dataUrl = stripDataUrl(sanitized.dataUrl);
  }

  if (sanitized.metadata && typeof sanitized.metadata === "object") {
    sanitized.metadata = compactSiteSnapshotMetadata(sanitized.metadata);
  }

  return sanitized;
}

function compactPortfolioFiles(files = []) {
  if (!Array.isArray(files)) {
    return [];
  }

  return files.slice(0, MAX_PORTFOLIO_FILES).map((file) => ({
    name: file?.name || null,
    size: file?.size || null,
    type: file?.type || null,
    convertedFromPdf: Boolean(file?.convertedFromPdf),
  }));
}

function compactPortfolioBlend(blend = {}) {
  if (!blend || typeof blend !== "object") {
    return blend || null;
  }

  const compacted = {
    materialWeight: blend.materialWeight ?? null,
    characteristicWeight: blend.characteristicWeight ?? null,
    localStyle: blend.localStyle ?? null,
    climateStyle: blend.climateStyle ?? null,
  };

  const portfolioFiles = compactPortfolioFiles(blend.portfolioFiles);
  if (portfolioFiles.length > 0) {
    compacted.portfolioFiles = portfolioFiles;
    compacted.portfolioCount = Array.isArray(blend.portfolioFiles)
      ? blend.portfolioFiles.length
      : portfolioFiles.length;
  }

  return compacted;
}

function compactLocationData(locationData = {}) {
  if (!locationData || typeof locationData !== "object") {
    return locationData || {};
  }

  const sanitized = cloneData(locationData) || {};
  stripDataUrlsDeep(sanitized);

  delete sanitized.siteAnalysis;
  delete sanitized.siteDNA;
  delete sanitized.mapImageUrl;
  delete sanitized.siteMapUrl;
  delete sanitized.streetViewUrl;
  delete sanitized.nearbyPlaces;
  delete sanitized.rawApiResponse;

  return sanitized;
}

function compactProjectContext(projectContext = {}) {
  if (!projectContext || typeof projectContext !== "object") {
    return projectContext || {};
  }

  const sanitized = cloneData(projectContext) || {};
  stripDataUrlsDeep(sanitized);

  if (sanitized.portfolioBlend) {
    sanitized.portfolioBlend = compactPortfolioBlend(sanitized.portfolioBlend);
  }

  if (sanitized.location && typeof sanitized.location === "object") {
    sanitized.location = compactLocationData(sanitized.location);
  }

  delete sanitized.siteAnalysis;
  delete sanitized.siteDNA;

  return sanitized;
}

function compactSiteSnapshotMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== "object") {
    return metadata || {};
  }

  const sanitized = cloneData(metadata) || {};
  stripDataUrlsDeep(sanitized);

  return {
    siteMetrics: sanitized.siteMetrics || null,
    climateSummary: sanitized.climateSummary || null,
    center: sanitized.center || null,
    zoom: sanitized.zoom || null,
    mapType: sanitized.mapType || null,
    size: sanitized.size || null,
    polygonStyle: sanitized.polygonStyle || null,
    capturedAt: sanitized.capturedAt || null,
  };
}

function createA1ArtifactManifest(designId) {
  return {
    schema_version: "a1-artifact-url-manifest-v1",
    designId,
    storage: "design_history_artifact_store",
    artifacts: {
      sheet: null,
      pdf: null,
      panels: {},
    },
    createdAt: new Date().toISOString(),
  };
}

function addArtifactManifestEntry(manifest, slot, entry, panelKey = null) {
  if (!manifest || !entry) {
    return;
  }

  const lightweight = {
    artifactId: entry.artifactId,
    artifactUrl: entry.artifactUrl,
    artifactType: entry.artifactType,
    mimeType: entry.mimeType,
    extension: entry.extension,
    byteLength: entry.byteLength,
    contentHash: entry.contentHash,
    storage: entry.storage,
    metadata: entry.metadata || {},
  };

  if (slot === "panels" && panelKey) {
    manifest.artifacts.panels[panelKey] = {
      ...(manifest.artifacts.panels[panelKey] || {}),
      [entry.artifactType]: lightweight,
    };
    return;
  }

  manifest.artifacts[slot] = lightweight;
}

function manifestHasArtifacts(manifest) {
  return Boolean(
    manifest?.artifacts?.sheet ||
    manifest?.artifacts?.pdf ||
    Object.keys(manifest?.artifacts?.panels || {}).length > 0,
  );
}

function attachA1ArtifactManifest(design, manifest) {
  if (!manifestHasArtifacts(manifest)) {
    return design;
  }

  design.a1ArtifactManifest = manifest;
  design.artifactManifest = manifest;
  design.sheetMetadata = {
    ...(design.sheetMetadata || design.a1Sheet?.metadata || {}),
    artifactManifest: manifest,
  };
  design.a1Sheet = {
    ...(design.a1Sheet || {}),
    artifactManifest: manifest,
    metadata: {
      ...(design.a1Sheet?.metadata || design.sheetMetadata || {}),
      artifactManifest: manifest,
    },
  };
  return design;
}

function deleteStoredArtifactsForDesign(designId) {
  if (!designId) {
    return;
  }

  designHistoryArtifactStore
    .deleteArtifactsForDesign(designId)
    .catch((error) => {
      logger.warn("Failed to delete design history artifacts", {
        designId,
        error: error?.message || String(error),
      });
    });
}

function compactA1SheetForHistory(sheet = {}) {
  if (!sheet || typeof sheet !== "object") {
    return {};
  }

  const compacted = cloneData(sheet) || {};
  delete compacted.dataUrl;
  delete compacted.svgString;
  delete compacted.svg;
  delete compacted.pdfDataUrl;
  delete compacted.compiledProject;
  delete compacted.projectGraph;
  delete compacted.projectGeometry;
  delete compacted.projectQuantityTakeoff;
  delete compacted.artifacts;
  delete compacted.trace;
  delete compacted.reasoningChain;

  return compacted;
}

async function persistArtifactPayload({
  designId,
  artifactType,
  payload,
  payloadKind,
  mimeType,
  metadata,
  manifest,
  manifestSlot,
  panelKey,
  cache,
}) {
  if (isDesignHistoryArtifactUrl(payload)) {
    return payload;
  }

  if (typeof payload !== "string" || payload.length === 0) {
    return payload;
  }

  const cacheKey = `${artifactType}:${payloadKind}:${payload}`;
  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    addArtifactManifestEntry(manifest, manifestSlot, cached, panelKey);
    return cached.artifactUrl;
  }

  try {
    const artifact = await designHistoryArtifactStore.saveArtifact({
      designId,
      artifactType,
      payload,
      payloadKind,
      mimeType,
      metadata,
    });
    if (!artifact) {
      return payload;
    }
    cache.set(cacheKey, artifact);
    addArtifactManifestEntry(manifest, manifestSlot, artifact, panelKey);
    return artifact.artifactUrl;
  } catch (error) {
    logger.warn("Failed to persist design history artifact", {
      designId,
      artifactType,
      error: error?.message || String(error),
    });
    return payload;
  }
}

async function materializeUrlField({
  target,
  key,
  designId,
  artifactType,
  manifest,
  manifestSlot,
  panelKey = null,
  metadata = {},
  cache,
}) {
  if (!target || typeof target !== "object") {
    return;
  }

  const value = target[key];
  if (!isStorableDataUrl(value)) {
    return;
  }

  target[key] = await persistArtifactPayload({
    designId,
    artifactType,
    payload: value,
    payloadKind: "data_url",
    metadata,
    manifest,
    manifestSlot,
    panelKey,
    cache,
  });
}

async function materializePanelArtifacts({
  panel,
  panelKey,
  designId,
  manifest,
  cache,
}) {
  if (!panel || typeof panel !== "object") {
    return null;
  }

  const metadata = {
    panelKey,
    panelType: panel.panelType || panel.panel_type || panel.type || panelKey,
    width: panel.width || panel.metadata?.width || null,
    height: panel.height || panel.metadata?.height || null,
    geometryHash: panel.geometryHash || panel.metadata?.geometryHash || null,
    sourceModelHash:
      panel.source_model_hash || panel.metadata?.sourceModelHash || null,
    svgHash: panel.svgHash || panel.metadata?.svgHash || null,
  };

  for (const key of ["imageUrl", "url", "previewUrl", "dataUrl"]) {
    await materializeUrlField({
      target: panel,
      key,
      designId,
      artifactType: "a1_panel_raster_or_svg",
      manifest,
      manifestSlot: "panels",
      panelKey,
      metadata,
      cache,
    });
  }

  if (isDesignHistoryArtifactUrl(panel.dataUrl)) {
    panel.artifactUrl = panel.dataUrl;
  }

  if (!panel.url && panel.artifactUrl) {
    panel.url = panel.artifactUrl;
  }

  if (typeof panel.svgString === "string" && panel.svgString.trim()) {
    const svgArtifactUrl = await persistArtifactPayload({
      designId,
      artifactType: "a1_panel_svg",
      payload: panel.svgString,
      payloadKind: "text",
      mimeType: "image/svg+xml",
      metadata,
      manifest,
      manifestSlot: "panels",
      panelKey,
      cache,
    });
    panel.svgArtifactUrl = svgArtifactUrl;
    panel.svgHash = panel.svgHash || computeStringHash(panel.svgString);
    if (!panel.url && isDesignHistoryArtifactUrl(svgArtifactUrl)) {
      panel.url = svgArtifactUrl;
    }
    delete panel.svgString;
  }

  if (typeof panel.svg === "string" && panel.svg.trim()) {
    const svgArtifactUrl = await persistArtifactPayload({
      designId,
      artifactType: "a1_panel_svg",
      payload: panel.svg,
      payloadKind: "text",
      mimeType: "image/svg+xml",
      metadata,
      manifest,
      manifestSlot: "panels",
      panelKey,
      cache,
    });
    panel.svgArtifactUrl = panel.svgArtifactUrl || svgArtifactUrl;
    if (!panel.url && isDesignHistoryArtifactUrl(svgArtifactUrl)) {
      panel.url = svgArtifactUrl;
    }
    delete panel.svg;
  }

  delete panel.dataUrl;
  return panel;
}

function computeStringHash(value = "") {
  let hash = 0x811c9dc5;
  const input = String(value || "");
  for (let i = 0; i < input.length; i += 1) {
    hash = Math.imul(hash ^ input.charCodeAt(i), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function materializePanelMapArtifacts(panelMap, options) {
  if (!panelMap || typeof panelMap !== "object") {
    return panelMap || null;
  }

  if (Array.isArray(panelMap)) {
    for (let index = 0; index < panelMap.length; index += 1) {
      await materializePanelArtifacts({
        panel: panelMap[index],
        panelKey:
          panelMap[index]?.panelType || panelMap[index]?.type || `${index}`,
        ...options,
      });
    }
    return panelMap;
  }

  const entries = Object.entries(panelMap);
  for (const [panelKey, panel] of entries) {
    await materializePanelArtifacts({
      panel,
      panelKey,
      ...options,
    });
  }
  return panelMap;
}

async function prepareDesignArtifactsForHistory(design, designId) {
  const prepared = cloneData(design) || {};
  const manifest = createA1ArtifactManifest(designId);
  const cache = new Map();
  const sheetMetadata = {
    ...(prepared.sheetMetadata || prepared.a1Sheet?.metadata || {}),
  };
  const sheetArtifactMetadata = {
    sheetId: prepared.sheetId || prepared.a1Sheet?.sheetId || "default",
    width: sheetMetadata.width || prepared.a1Sheet?.width || null,
    height: sheetMetadata.height || prepared.a1Sheet?.height || null,
    sheetSizeMm:
      sheetMetadata.sheetSizeMm || prepared.a1Sheet?.sheet_size_mm || null,
    geometryHash:
      sheetMetadata.geometryHash ||
      prepared.geometryHash ||
      prepared.a1Sheet?.metadata?.geometryHash ||
      null,
    exportGate:
      sheetMetadata.exportGate ||
      sheetMetadata.sheetArtifactManifest?.exportGate ||
      null,
  };

  for (const target of [prepared, prepared.a1Sheet].filter(Boolean)) {
    await materializeUrlField({
      target,
      key: "resultUrl",
      designId,
      artifactType: "a1_sheet",
      manifest,
      manifestSlot: "sheet",
      metadata: sheetArtifactMetadata,
      cache,
    });
    await materializeUrlField({
      target,
      key: "composedSheetUrl",
      designId,
      artifactType: "a1_sheet",
      manifest,
      manifestSlot: "sheet",
      metadata: sheetArtifactMetadata,
      cache,
    });
    await materializeUrlField({
      target,
      key: "url",
      designId,
      artifactType: "a1_sheet",
      manifest,
      manifestSlot: "sheet",
      metadata: sheetArtifactMetadata,
      cache,
    });
    await materializeUrlField({
      target,
      key: "a1SheetUrl",
      designId,
      artifactType: "a1_sheet",
      manifest,
      manifestSlot: "sheet",
      metadata: sheetArtifactMetadata,
      cache,
    });
    await materializeUrlField({
      target,
      key: "pdfUrl",
      designId,
      artifactType: "a1_pdf",
      manifest,
      manifestSlot: "pdf",
      metadata: sheetArtifactMetadata,
      cache,
    });
  }

  await materializePanelMapArtifacts(prepared.panelMap, {
    designId,
    manifest,
    cache,
  });
  await materializePanelMapArtifacts(prepared.panels, {
    designId,
    manifest,
    cache,
  });
  await materializePanelMapArtifacts(prepared.a1Sheet?.panelMap, {
    designId,
    manifest,
    cache,
  });
  await materializePanelMapArtifacts(prepared.a1Sheet?.panels, {
    designId,
    manifest,
    cache,
  });
  await materializePanelMapArtifacts(prepared.sheetMetadata?.panelMap, {
    designId,
    manifest,
    cache,
  });
  await materializePanelMapArtifacts(prepared.a1Sheet?.metadata?.panelMap, {
    designId,
    manifest,
    cache,
  });

  return attachA1ArtifactManifest(prepared, manifest);
}

const VERSION_METADATA_KEYS = [
  "width",
  "height",
  "model",
  "a1LayoutKey",
  "workflow",
  "panelCount",
  "seed",
  "layout",
  "panelCoordinates",
  "coordinates",
  "dpi",
  "transport",
  "durationMs",
  "traceId",
  "runId",
  "manifestUrl",
  "manifestFile",
  "outputFile",
  "pdfOutputFile",
  "pdfUrl",
  "qaAllPassed",
  "critiqueOverallPass",
  "hashValidation",
  "qualityScore",
  "qualityGrade",
  "qualityEvaluation",
];

function sanitizeVersionMetadata(metadata = {}) {
  const base = sanitizeSheetMetadata(metadata);
  const lightweight = {};

  VERSION_METADATA_KEYS.forEach((key) => {
    if (base[key] !== undefined) {
      lightweight[key] = base[key];
    }
  });

  const sanitizedPanelMap = sanitizePanelMap(base.panelMap);
  if (sanitizedPanelMap) {
    lightweight.panelMap = sanitizedPanelMap;
  }

  return lightweight;
}

function sanitizeVersionEntry(versionData = {}) {
  const sanitized = cloneData(versionData) || {};

  if (sanitized.resultUrl) {
    sanitized.resultUrl = stripDataUrl(sanitized.resultUrl);
  }

  if (sanitized.composedSheetUrl) {
    sanitized.composedSheetUrl = stripDataUrl(sanitized.composedSheetUrl);
  }

  if (sanitized.previewUrl) {
    sanitized.previewUrl = stripDataUrl(sanitized.previewUrl);
  }

  if (sanitized.panelMap) {
    sanitized.panelMap = sanitizePanelMap(sanitized.panelMap);
  }

  if (sanitized.panels) {
    sanitized.panels = sanitizePanelMap(sanitized.panels);
  }

  if (sanitized.geometryRenders && Array.isArray(sanitized.geometryRenders)) {
    sanitized.geometryRenders = sanitized.geometryRenders
      .map((render) => {
        if (!render || typeof render !== "object") return null;
        const cleaned = { ...render };
        if (cleaned.url) {
          cleaned.url = stripDataUrl(cleaned.url);
        }
        return cleaned;
      })
      .filter(Boolean);
  }

  if (sanitized.imageUrl) {
    sanitized.imageUrl = stripDataUrl(sanitized.imageUrl);
  }

  const metadata = versionData.metadata
    ? sanitizeVersionMetadata(versionData.metadata)
    : null;

  if (metadata && Object.keys(metadata).length > 0) {
    sanitized.metadata = metadata;
  } else {
    delete sanitized.metadata;
  }

  if (versionData.panelMap) {
    sanitized.panelMap = sanitizePanelMap(versionData.panelMap);
  }

  stripDataUrlsDeep(sanitized);

  return sanitized;
}

function trimVersionsForStorage(versions = []) {
  const sanitized = (versions || [])
    .map((entry) => sanitizeVersionEntry(entry))
    .filter(Boolean);

  sanitized.sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0),
  );

  return sanitized.slice(0, MAX_VERSIONS_PER_DESIGN);
}

function buildDesignPayload(design, existingDesign = null) {
  const designId = design.id || design.designId || `design_${Date.now()}`;

  const canonicalDNA = cloneData(design.dna || design.masterDNA || {}) || {};
  stripDataUrlsDeep(canonicalDNA);
  const compressedDNA = compressMasterDNA(canonicalDNA);
  const sheetUrl = stripDataUrl(
    design.resultUrl ||
      design.a1SheetUrl ||
      design.a1Sheet?.composedSheetUrl ||
      design.a1Sheet?.url ||
      design.composedSheetUrl ||
      null,
  );
  const pdfUrl = stripDataUrl(
    design.pdfUrl || design.a1Sheet?.pdfUrl || existingDesign?.a1Sheet?.pdfUrl,
  );
  const artifactManifest =
    design.a1ArtifactManifest ||
    design.artifactManifest ||
    design.a1Sheet?.artifactManifest ||
    design.sheetMetadata?.artifactManifest ||
    existingDesign?.a1ArtifactManifest ||
    null;
  const panelMapInput =
    design.panelMap ||
    design.panels ||
    design.a1Sheet?.panelMap ||
    design.a1Sheet?.panels ||
    design.sheetMetadata?.panelMap ||
    design.metadata?.panels ||
    {};

  const sheetMetadata = sanitizeSheetMetadata(
    design.sheetMetadata || design.a1Sheet?.metadata || {},
  );

  let geometryRenders =
    design.geometryRenders || design.a1Sheet?.geometryRenders || null;
  if (Array.isArray(geometryRenders)) {
    geometryRenders = geometryRenders
      .map((render) => {
        if (!render || typeof render !== "object") return null;
        const cleaned = { ...render };
        if (cleaned.url) {
          cleaned.url = stripDataUrl(cleaned.url);
        }
        return cleaned;
      })
      .filter(Boolean);
  }

  let resolvedPanelMap = sanitizePanelMap(
    panelMapInput || sheetMetadata.panelMap,
  );
  if (resolvedPanelMap && Object.keys(resolvedPanelMap).length === 0) {
    resolvedPanelMap = null;
  }

  if (resolvedPanelMap) {
    sheetMetadata.panelMap = resolvedPanelMap;
  } else if (sheetMetadata.panelMap) {
    delete sheetMetadata.panelMap;
  }

  const versions = trimVersionsForStorage(
    design.versions || existingDesign?.versions || [],
  );
  const panelCoordinates =
    design.panelCoordinates ||
    design.coordinates ||
    design.a1Sheet?.coordinates ||
    sheetMetadata.coordinates ||
    sheetMetadata.panelCoordinates ||
    null;

  const sanitizedProjectContext = compactProjectContext(design.projectContext);

  const sanitizedLocationData = compactLocationData(design.locationData);

  const sanitizedOverlays = cloneData(design.overlays) || [];
  stripDataUrlsDeep(sanitizedOverlays);

  const sanitizedBlendedStyle = cloneData(design.blendedStyle) || null;
  stripDataUrlsDeep(sanitizedBlendedStyle);

  const clonedA1Sheet = compactA1SheetForHistory(design.a1Sheet);
  stripDataUrlsDeep(clonedA1Sheet);
  if (
    clonedA1Sheet &&
    typeof clonedA1Sheet === "object" &&
    clonedA1Sheet.dataUrl
  ) {
    delete clonedA1Sheet.dataUrl;
  }

  const payload = {
    id: designId,
    designId,
    projectId: design.projectId || designId,
    sheetId: design.sheetId || design.a1Sheet?.sheetId || "default",
    dna: compressedDNA,
    masterDNA: compressedDNA,
    masterDNAFull: canonicalDNA,
    geometryDNA:
      design.geometryDNA ||
      canonicalDNA.geometry ||
      canonicalDNA.geometryDNA ||
      null,
    geometryRenders: geometryRenders || null,
    basePrompt: design.basePrompt || design.mainPrompt || "",
    seed: design.seed || Date.now(),
    sheetType: design.sheetType || "ARCH",
    sheetMetadata,
    overlays: sanitizedOverlays,
    createdAt:
      design.createdAt || existingDesign?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    versions,
    projectContext: sanitizedProjectContext,
    locationData: sanitizedLocationData,
    siteSnapshot: sanitizeSiteSnapshot(
      design.siteSnapshot || existingDesign?.siteSnapshot,
    ),
    blendedStyle: sanitizedBlendedStyle,
    composedSheetUrl: sheetUrl,
    resultUrl: sheetUrl,
    pdfUrl,
    a1ArtifactManifest: artifactManifest,
    artifactManifest,
    a1Sheet: {
      ...(clonedA1Sheet || {}),
      sheetId: design.sheetId || clonedA1Sheet?.sheetId || "default",
      url: sheetUrl,
      composedSheetUrl: sheetUrl,
      pdfUrl,
      artifactManifest,
      metadata: sheetMetadata,
      panelMap: resolvedPanelMap || null,
      panels: resolvedPanelMap || null,
      coordinates: panelCoordinates,
      geometryRenders: geometryRenders || null,
      geometryDNA:
        design.geometryDNA ||
        canonicalDNA.geometry ||
        canonicalDNA.geometryDNA ||
        null,
    },
    panelMap: resolvedPanelMap || null,
    panels: resolvedPanelMap || null,
    panelCoordinates,
    a1SheetUrl: sheetUrl,
    _schemaVersion: 2,
  };

  return payload;
}

function enforceDesignSize(design) {
  let payload = design;
  let size = estimateSize(payload);

  if (size <= MAX_PAYLOAD_BYTES) {
    return payload;
  }

  if (payload.masterDNAFull) {
    const { masterDNAFull, ...rest } = payload;
    payload = rest;
    size = estimateSize(payload);
  }

  if (size <= MAX_PAYLOAD_BYTES) {
    return payload;
  }

  if (payload.a1Sheet?.panelMap || payload.panelMap) {
    const { a1Sheet, ...rest } = payload;
    const nextSheet = a1Sheet ? { ...a1Sheet } : null;
    if (nextSheet) {
      nextSheet.panelMap = null;
      nextSheet.panels = null;
      nextSheet.geometryRenders = nextSheet.geometryRenders || null;
      if (nextSheet.metadata) {
        const metadata = { ...nextSheet.metadata };
        delete metadata.panelMap;
        nextSheet.metadata = metadata;
      }
    }

    payload = {
      ...rest,
      a1Sheet: nextSheet,
      panelMap: null,
      panels: null,
      panelCoordinates: null,
      geometryRenders: payload.geometryRenders || null,
    };
    size = estimateSize(payload);
  }

  if (size <= MAX_PAYLOAD_BYTES) {
    return payload;
  }

  if (Array.isArray(payload.versions) && payload.versions.length > 1) {
    payload = { ...payload, versions: payload.versions.slice(0, 1) };
    size = estimateSize(payload);
  }

  if (size > MAX_PAYLOAD_BYTES) {
    logger.warn("Design payload still exceeds size budget after trimming", {
      designId: payload.designId,
      sizeKB: (size / 1024).toFixed(2),
    });
  }

  return payload;
}

function enforceHistoryCap(designs = []) {
  const sorted = [...designs].sort(
    (a, b) =>
      new Date(b.updatedAt || b.createdAt || 0) -
      new Date(a.updatedAt || a.createdAt || 0),
  );

  if (sorted.length <= MAX_DESIGNS) {
    return sorted;
  }

  const trimmed = sorted.slice(0, MAX_DESIGNS);
  const removed = sorted.slice(MAX_DESIGNS);

  removed.forEach((entry) => {
    if (entry?.siteSnapshot?.key) {
      deleteSiteSnapshot(entry.siteSnapshot.key);
    }
    deleteStoredArtifactsForDesign(entry?.designId || entry?.id);
  });

  logger.warn(`History exceeds ${MAX_DESIGNS} designs, removing oldest...`);

  return trimmed;
}

function getEntryTimestamp(entry) {
  const raw = entry?.updatedAt || entry?.createdAt || null;
  const parsed = raw ? new Date(raw).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function removePanelMapsFromEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return entry;
  }

  const next = { ...entry };

  if ("panelMap" in next) next.panelMap = null;
  if ("panels" in next) next.panels = null;
  if ("panelCoordinates" in next) next.panelCoordinates = null;

  if (next.sheetMetadata && typeof next.sheetMetadata === "object") {
    const metadata = { ...next.sheetMetadata };
    delete metadata.panelMap;
    delete metadata.panels;
    delete metadata.panelLayout;
    delete metadata.panelsArray;
    next.sheetMetadata = metadata;
  }

  if (next.a1Sheet && typeof next.a1Sheet === "object") {
    const nextA1 = { ...next.a1Sheet };
    if ("panelMap" in nextA1) nextA1.panelMap = null;
    if ("panels" in nextA1) nextA1.panels = null;
    if ("coordinates" in nextA1) nextA1.coordinates = null;
    if ("geometryRenders" in nextA1) nextA1.geometryRenders = null;

    if (nextA1.metadata && typeof nextA1.metadata === "object") {
      const metadata = { ...nextA1.metadata };
      delete metadata.panelMap;
      delete metadata.panels;
      delete metadata.panelLayout;
      delete metadata.panelsArray;
      delete metadata.coordinates;
      delete metadata.panelCoordinates;
      nextA1.metadata = metadata;
    }

    next.a1Sheet = nextA1;
  }

  return next;
}

function trimHistoryForStorage(history, maxBytes = MAX_HISTORY_BYTES) {
  if (!Array.isArray(history)) {
    return history;
  }

  let candidate = history;
  const originalBytes = estimateSize(candidate);
  if (originalBytes <= maxBytes) {
    return candidate;
  }

  const applied = [];

  const apply = (label, transform) => {
    if (estimateSize(candidate) <= maxBytes) {
      return;
    }

    candidate = transform(candidate);
    applied.push(label);
  };

  apply("drop masterDNAFull", (items) =>
    items.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      if (!("masterDNAFull" in entry)) return entry;
      const { masterDNAFull, ...rest } = entry;
      return rest;
    }),
  );

  apply("compact projectContext", (items) =>
    items.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      return {
        ...entry,
        projectContext: compactProjectContext(entry.projectContext),
      };
    }),
  );

  apply("compact locationData", (items) =>
    items.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      return {
        ...entry,
        locationData: compactLocationData(entry.locationData),
      };
    }),
  );

  apply("compact siteSnapshot metadata", (items) =>
    items.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      if (!entry.siteSnapshot || typeof entry.siteSnapshot !== "object") {
        return entry;
      }

      return {
        ...entry,
        siteSnapshot: sanitizeSiteSnapshot(entry.siteSnapshot),
      };
    }),
  );

  apply("drop blendedStyle", (items) =>
    items.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      return { ...entry, blendedStyle: null };
    }),
  );

  apply("cap versions to 1", (items) =>
    items.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      if (!Array.isArray(entry.versions) || entry.versions.length <= 1) {
        return entry;
      }
      return { ...entry, versions: entry.versions.slice(0, 1) };
    }),
  );

  apply("remove panel maps", (items) => items.map(removePanelMapsFromEntry));

  apply("drop projectContext", (items) =>
    items.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      return { ...entry, projectContext: {} };
    }),
  );

  apply("drop locationData", (items) =>
    items.map((entry) => {
      if (!entry || typeof entry !== "object") return entry;
      return { ...entry, locationData: {} };
    }),
  );

  if (estimateSize(candidate) > maxBytes) {
    const designEntries = candidate.filter(
      (entry) =>
        entry && typeof entry === "object" && (entry.designId || entry.id),
    );

    if (designEntries.length > 1) {
      const newest = [...designEntries].sort(
        (a, b) => getEntryTimestamp(b) - getEntryTimestamp(a),
      )[0];
      const removed = designEntries.filter((entry) => entry !== newest);

      removed.forEach((entry) => {
        if (entry?.siteSnapshot?.key) {
          deleteSiteSnapshot(entry.siteSnapshot.key);
        }
        deleteStoredArtifactsForDesign(entry?.designId || entry?.id);
      });

      candidate = candidate.filter(
        (entry) =>
          !(entry && typeof entry === "object" && (entry.designId || entry.id)),
      );
      candidate.push(newest);
      applied.push("keep only most recent design");
    }
  }

  const finalBytes = estimateSize(candidate);
  logger.warn("Trimmed design history to fit storage budget", {
    originalKB: (originalBytes / 1024).toFixed(2),
    finalKB: (finalBytes / 1024).toFixed(2),
    maxKB: (maxBytes / 1024).toFixed(2),
    applied,
  });

  return candidate;
}

/**
 * Design History Repository
 */
class DesignHistoryRepository {
  constructor(backend = null) {
    this.backend = backend || new LocalStorageBackend();
  }

  /**
   * Generate deterministic design ID
   * @param {Object} dna - Master DNA
   * @param {Object} siteSnapshot - Site snapshot
   * @param {number} seed - Generation seed
   * @returns {string} Design ID
   */
  generateDesignId(dna = null, siteSnapshot = null, seed = null) {
    // If we have DNA + site + seed, generate hash-based ID
    if (dna && seed) {
      const hashInput = JSON.stringify({
        dimensions: dna.dimensions,
        materials: dna.materials?.slice(0, 3),
        seed,
        siteHash: siteSnapshot?.sha256 || null,
      });

      // Simple hash function (for deterministic IDs)
      let hash = 0;
      for (let i = 0; i < hashInput.length; i++) {
        const char = hashInput.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32bit integer
      }

      return `design_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
    }

    // Fallback: UUID-like ID
    return `design_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  async persistDesigns(designs = []) {
    if (typeof this.backend.setAll === "function") {
      return this.backend.setAll(designs);
    }

    if (this.backend instanceof LocalStorageBackend) {
      return storageManager.setItem(this.backend.storageKey, designs);
    }

    await Promise.all(
      designs.map((entry) =>
        this.backend.save(entry.id || entry.designId, entry),
      ),
    );
    return true;
  }

  /**
   * Save design
   * @param {Object} design - Design object
   * @returns {Promise<string>} Design ID
   */
  async saveDesign(design) {
    const designId =
      design.id ||
      design.designId ||
      this.generateDesignId(
        design.dna || design.masterDNA,
        design.siteSnapshot,
        design.seed,
      );

    const allDesigns = await this.backend.list();
    const existingIndex = allDesigns.findIndex(
      (d) => (d.id || d.designId) === designId,
    );
    const existingDesign =
      existingIndex >= 0 ? allDesigns[existingIndex] : null;

    const storagePreparedDesign = await prepareDesignArtifactsForHistory(
      { ...design, designId },
      designId,
    );
    const sanitizedDesign = enforceDesignSize(
      buildDesignPayload(storagePreparedDesign, existingDesign),
    );

    const updatedDesigns = [...allDesigns];

    if (existingIndex >= 0) {
      const mergedDesign = {
        ...existingDesign,
        ...sanitizedDesign,
        createdAt: existingDesign.createdAt || sanitizedDesign.createdAt,
        versions: sanitizedDesign.versions,
      };
      updatedDesigns[existingIndex] = mergedDesign;
    } else {
      updatedDesigns.push(sanitizedDesign);
    }

    const cappedDesigns = enforceHistoryCap(updatedDesigns);
    const storageReadyDesigns = trimHistoryForStorage(cappedDesigns);
    const saved = await this.persistDesigns(storageReadyDesigns);

    if (!saved) {
      const usage = await storageManager.getStorageUsage();
      throw new Error(
        `Failed to save design to storage. Storage usage: ${usage}%`,
      );
    }

    // Persist geometry baseline separately if available
    if (design.baselineBundle || design.geometryDNA || design.geometryRenders) {
      try {
        const baselineBundle = design.baselineBundle || {
          designId,
          sheetId: design.sheetId || design.a1Sheet?.sheetId || "default",
          baselineImageUrl:
            storagePreparedDesign.resultUrl ||
            storagePreparedDesign.composedSheetUrl ||
            storagePreparedDesign.a1Sheet?.url ||
            "",
          baselineDNA: design.masterDNA || design.dna || {},
          geometryBaseline: {
            geometryDNA:
              design.geometryDNA ||
              design.masterDNA?.geometry ||
              design.dna?.geometry ||
              null,
            renders:
              design.geometryRenders || design.a1Sheet?.geometryRenders || null,
          },
          metadata: {
            seed: design.seed || Date.now(),
            model:
              design.sheetMetadata?.model ||
              design.a1Sheet?.metadata?.model ||
              "FLUX.1-schnell",
            width:
              design.sheetMetadata?.width ||
              design.a1Sheet?.metadata?.width ||
              1792,
            height:
              design.sheetMetadata?.height ||
              design.a1Sheet?.metadata?.height ||
              1269,
            a1LayoutKey:
              design.sheetMetadata?.a1LayoutKey ||
              design.a1Sheet?.metadata?.a1LayoutKey ||
              "uk-riba-standard",
            workflow: PIPELINE_MODE.MULTI_PANEL,
          },
        };
        await baselineArtifactStore.saveBaselineArtifacts({
          designId,
          sheetId: baselineBundle.sheetId || "default",
          bundle: baselineBundle,
        });
      } catch {
        // Ignore baseline save errors
      }
    }

    return designId;
  }

  /**
   * Update design version
   * @param {string} designId - Design ID
   * @param {Object} versionData - Version data
   * @returns {Promise<string>} Version ID
   */
  async updateDesignVersion(designId, versionData) {
    const allDesigns = await this.backend.list();
    const index = allDesigns.findIndex(
      (d) => (d.id || d.designId) === designId,
    );

    if (index === -1) {
      throw new Error(`Design ${designId} not found`);
    }

    const design = allDesigns[index];

    const versionId = `v${(design.versions?.length || 0) + 1}`;
    const storagePreparedVersion = await prepareDesignArtifactsForHistory(
      {
        ...versionData,
        designId,
      },
      designId,
    );
    const sanitizedVersion = sanitizeVersionEntry({
      ...versionData,
      ...storagePreparedVersion,
      versionId,
      createdAt: new Date().toISOString(),
    });

    const versions = trimVersionsForStorage([
      sanitizedVersion,
      ...(design.versions || []),
    ]);

    const updatedDesign = enforceDesignSize(
      buildDesignPayload({ ...design, designId, versions }, design),
    );

    const cappedDesigns = enforceHistoryCap([
      ...allDesigns.slice(0, index),
      updatedDesign,
      ...allDesigns.slice(index + 1),
    ]);

    const storageReadyDesigns = trimHistoryForStorage(cappedDesigns);
    const saved = await this.persistDesigns(storageReadyDesigns);
    if (!saved) {
      const usage = await storageManager.getStorageUsage();
      throw new Error(
        `Failed to save version to storage. Storage usage: ${usage}%`,
      );
    }
    return versionId;
  }

  /**
   * Get design by ID
   * @param {string} designId - Design ID
   * @returns {Promise<Object|null>} Design object or null
   */
  async getDesignById(designId) {
    return this.backend.get(designId);
  }

  /**
   * List all designs
   * @returns {Promise<Array>} Array of design summaries
   */
  async listDesigns() {
    const all = await this.backend.list();
    return all.map((d) => ({
      id: d.id || d.designId,
      designId: d.id || d.designId,
      projectId: d.projectId,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      versionCount: d.versions?.length || 0,
      sheetType: d.sheetType || "ARCH",
      hasA1Sheet: !!(
        d.resultUrl ||
        d.composedSheetUrl ||
        d.a1Sheet?.url ||
        d.a1Sheet?.composedSheetUrl
      ),
      hasGeometryBaseline: !!(d.geometryDNA || d.geometryRenders),
    }));
  }

  /**
   * Delete design
   * @param {string} designId - Design ID
   * @returns {Promise<boolean>} Success
   */
  async deleteDesign(designId) {
    const allDesigns = await this.backend.list();
    const filtered = allDesigns.filter(
      (d) => (d.id || d.designId) !== designId,
    );

    const removed = allDesigns.find((d) => (d.id || d.designId) === designId);
    if (removed?.siteSnapshot?.key) {
      await deleteSiteSnapshot(removed.siteSnapshot.key);
    }
    await designHistoryArtifactStore.deleteArtifactsForDesign(designId);

    return this.persistDesigns(filtered);
  }

  async clearAllDesigns() {
    await designHistoryArtifactStore.clearAllArtifacts();
    if (typeof this.backend.setAll === "function") {
      await this.backend.setAll([]);
      return true;
    }

    if (this.backend instanceof LocalStorageBackend) {
      await storageManager.setItem(this.backend.storageKey, []);
      return true;
    }

    return true;
  }

  /**
   * Migrate from legacy storage format
   * @param {string} legacyKey - Legacy storage key
   * @returns {Promise<number>} Number of designs migrated
   */
  async migrateFromLegacyStorage(legacyKey = "design_history") {
    const legacy = await storageManager.getItem(legacyKey, []);
    if (!Array.isArray(legacy) || legacy.length === 0) {
      return 0;
    }

    let migrated = 0;
    for (const oldDesign of legacy) {
      try {
        const legacyPanelMap =
          oldDesign.panelMap ||
          oldDesign.a1Sheet?.panelMap ||
          oldDesign.a1Sheet?.panels ||
          null;
        const composedUrl =
          oldDesign.a1Sheet?.composedSheetUrl ||
          oldDesign.a1Sheet?.url ||
          oldDesign.resultUrl ||
          oldDesign.a1SheetUrl ||
          oldDesign.floorPlanUrl;
        // Map old format to new format
        const newDesign = {
          id: oldDesign.designId || oldDesign.projectId,
          dna: oldDesign.masterDNA || oldDesign.buildingDNA || {},
          geometryDNA: oldDesign.geometryDNA || oldDesign.geometry || null,
          geometryRenders:
            oldDesign.geometryRenders ||
            oldDesign.a1Sheet?.geometryRenders ||
            null,
          basePrompt:
            oldDesign.mainPrompt ||
            oldDesign.prompt ||
            oldDesign.basePrompt ||
            "",
          seed: oldDesign.seed,
          sheetType: "ARCH",
          sheetMetadata: oldDesign.a1Sheet?.metadata || {},
          overlays: [],
          createdAt: oldDesign.createdAt || oldDesign.timestamp,
          versions: oldDesign.versions || [],
          projectContext: oldDesign.projectContext || oldDesign.metadata || {},
          locationData: oldDesign.locationData || oldDesign.location || {},
          siteSnapshot: oldDesign.siteSnapshot,
          blendedStyle: oldDesign.blendedStyle,
          resultUrl: composedUrl,
          composedSheetUrl: composedUrl,
          panelMap: legacyPanelMap,
          panels: legacyPanelMap,
          panelCoordinates:
            oldDesign.panelCoordinates ||
            oldDesign.a1Sheet?.coordinates ||
            null,
          a1Sheet: {
            ...(oldDesign.a1Sheet || {}),
            composedSheetUrl: composedUrl,
            panels: legacyPanelMap,
            panelMap: legacyPanelMap,
            coordinates:
              oldDesign.panelCoordinates ||
              oldDesign.a1Sheet?.coordinates ||
              null,
          },
        };

        await this.saveDesign(newDesign);
        migrated++;
      } catch (error) {
        logger.warn(`Failed to migrate design ${oldDesign.designId}:`, error);
      }
    }

    logger.success(`Migrated ${migrated} designs from legacy storage`);
    return migrated;
  }
}

// Export singleton instance with localStorage backend
const repository = new DesignHistoryRepository();
export default repository;

// Export classes for testing/custom backends
export { DesignHistoryRepository, LocalStorageBackend, IndexedDBBackend };

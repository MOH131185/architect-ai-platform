import { computeCDSHashSync } from "../validation/cdsHash.js";
import {
  FINAL_A1_RENDER_INTENT,
  buildSheetTextContract,
} from "../a1/a1FinalExportContract.js";

function normalizeMaterials(dna) {
  if (!dna) return [];

  const candidates = [
    dna.materials,
    dna.style?.materials,
    dna._structured?.style?.materials,
  ];

  for (const mats of candidates) {
    if (Array.isArray(mats) && mats.length > 0) {
      return mats.map((m) => ({
        name: typeof m === "string" ? m : m.name || m.type || "material",
        hexColor: m.hexColor || m.color_hex || "#808080",
        application: m.application || m.use || "",
      }));
    }
  }

  if (
    dna.materials &&
    typeof dna.materials === "object" &&
    !Array.isArray(dna.materials)
  ) {
    return Object.entries(dna.materials)
      .filter(([, value]) => value && typeof value === "object")
      .map(([key, value]) => ({
        name: value.name || value.material || key,
        hexColor: value.hexColor || value.color_hex || "#808080",
        application: value.application || key,
      }));
  }

  return [];
}

function buildSiteOverlay(siteSnapshot, logger) {
  if (!siteSnapshot?.dataUrl) {
    return null;
  }

  const dataUrlBytes = siteSnapshot.dataUrl.length;
  if (dataUrlBytes < 2_000_000) {
    return { imageUrl: siteSnapshot.dataUrl };
  }

  logger?.warn(
    `⚠️ Site snapshot too large (${(dataUrlBytes / 1_000_000).toFixed(1)}MB) – omitting from compose payload`,
  );
  return null;
}

async function validateComposeGate({
  canonicalDesignState,
  canonicalPack,
  generatedPanels,
  logger,
  programLock,
  strictCanonicalPack,
}) {
  const { validateBeforeCompose } =
    await import("../validation/ComposeGate.js");
  const composeGateResult = validateBeforeCompose(
    generatedPanels,
    canonicalDesignState,
    programLock,
    canonicalPack,
    { strict: strictCanonicalPack },
  );

  if (composeGateResult.valid) {
    logger?.info("✅ ComposeGate passed");
    return;
  }

  logger?.error(`❌ ComposeGate: ${composeGateResult.errors.length} error(s)`);
  for (const err of composeGateResult.errors) {
    logger?.error(`   ${err}`);
  }

  throw new Error(`Composition blocked: ${composeGateResult.errors[0]}`);
}

function decodePanelImageUrl(imageUrl, svg) {
  const isSvgDataUrl =
    typeof imageUrl === "string" && imageUrl.startsWith("data:image/svg");

  if (isSvgDataUrl && svg) {
    return svg;
  }

  if (!isSvgDataUrl) {
    return imageUrl;
  }

  try {
    const b64 = imageUrl.replace(/^data:image\/svg\+xml;base64,/, "");
    return decodeURIComponent(escape(atob(b64)));
  } catch {
    return imageUrl;
  }
}

const COMPOSE_META_KEYS = [
  "geometryHash",
  "geometry_hash",
  "cdsHash",
  "cds_hash",
  "runId",
  "roomCount",
  "wallCount",
  "openingCount",
  "svgHash",
  "authorityUsed",
  "authoritySource",
  "panelAuthorityReason",
  "generatorUsed",
  "sourceType",
  "compiledProjectSchemaVersion",
  "hadCanonicalControl",
  "hadGeometryControl",
  "model",
  "tier",
  "isDataPanel",
];

function isNonEmptyObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasDrawingEvidence(drawings) {
  return Boolean(
    drawings &&
      ((Array.isArray(drawings.plan) && drawings.plan.length > 0) ||
        (Array.isArray(drawings.elevation) && drawings.elevation.length > 0) ||
        (Array.isArray(drawings.section) && drawings.section.length > 0)),
  );
}

function withPanelDefaults(entry, panelType) {
  return {
    ...(entry && typeof entry === "object" ? entry : {}),
    panel_type: entry?.panel_type || panelType,
    title: entry?.title || panelType.toUpperCase().replace(/_/g, " "),
  };
}

function normalizeDrawingsShape(drawings = null) {
  if (!isNonEmptyObject(drawings)) {
    return null;
  }

  const normalized = {
    plan: Array.isArray(drawings.plan) ? [...drawings.plan] : [],
    elevation: Array.isArray(drawings.elevation) ? [...drawings.elevation] : [],
    section: Array.isArray(drawings.section) ? [...drawings.section] : [],
  };

  Object.entries(drawings).forEach(([panelType, entry]) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return;
    }

    if (panelType.startsWith("floor_plan_")) {
      normalized.plan.push({
        ...withPanelDefaults(entry, panelType),
        level_id:
          entry.level_id ||
          entry.levelId ||
          panelType.replace(/^floor_plan_/, ""),
      });
      return;
    }

    if (panelType.startsWith("elevation_")) {
      normalized.elevation.push({
        ...withPanelDefaults(entry, panelType),
        orientation:
          entry.orientation || panelType.replace(/^elevation_/, "").toLowerCase(),
      });
      return;
    }

    if (panelType.startsWith("section_")) {
      normalized.section.push({
        ...withPanelDefaults(entry, panelType),
        section_type: entry.section_type || sectionTypeFromPanelType(panelType),
      });
    }
  });

  return hasDrawingEvidence(normalized) ? normalized : null;
}

function getDrawingIdentity(family, entry = {}) {
  if (family === "elevation") {
    return `elevation:${String(entry.orientation || entry.panel_type || entry.id || "").toLowerCase()}`;
  }
  if (family === "section") {
    return `section:${String(entry.section_type || entry.panel_type || entry.id || "").toLowerCase()}`;
  }
  return `plan:${String(entry.level_id || entry.levelId || entry.panel_type || entry.id || "").toLowerCase()}`;
}

function mergeDrawingEvidence(preferred = null, supplemental = null) {
  const preferredDrawings = normalizeDrawingsShape(preferred);
  const supplementalDrawings = normalizeDrawingsShape(supplemental);

  if (!preferredDrawings && !supplementalDrawings) {
    return null;
  }

  const merged = { plan: [], elevation: [], section: [] };
  ["plan", "elevation", "section"].forEach((family) => {
    const seen = new Set();
    [
      ...(preferredDrawings?.[family] || []),
      ...(supplementalDrawings?.[family] || []),
    ].forEach((entry) => {
      const identity = getDrawingIdentity(family, entry);
      if (!identity || seen.has(identity)) {
        return;
      }
      seen.add(identity);
      merged[family].push(entry);
    });
  });

  return hasDrawingEvidence(merged) ? merged : null;
}

function getPanelTechnicalMetadata(panel = {}) {
  return (
    panel.technicalQualityMetadata ||
    panel.technical_quality_metadata ||
    panel.metadata?.technicalQualityMetadata ||
    panel.metadata?.technical_quality_metadata ||
    {}
  );
}

function buildCanonicalDrawingEntry(panelType, panel = {}, canonicalPack = {}) {
  const technicalMetadata = getPanelTechnicalMetadata(panel);
  return {
    id: `canonical:${panelType}`,
    panel_type: panelType,
    title: panel.title || panelType.toUpperCase().replace(/_/g, " "),
    svg: panel.svgString || panel.svg || null,
    status: panel.status || "ready",
    geometryHash:
      panel.geometryHash ||
      panel.metadata?.geometryHash ||
      canonicalPack.geometryHash ||
      null,
    svgHash: panel.svgHash || panel.metadata?.svgHash || null,
    source: "compiled_project_canonical_pack",
    technical_quality_metadata: technicalMetadata,
    annotation_validation:
      panel.annotation_validation || technicalMetadata.annotation_validation || null,
    blocking_reasons: panel.blocking_reasons || panel.blockingReasons || [],
  };
}

function sectionTypeFromPanelType(panelType = "") {
  const normalized = String(panelType || "").toLowerCase();
  if (normalized.includes("bb") || normalized.includes("b_b")) {
    return "transverse";
  }
  return "longitudinal";
}

function deriveDrawingsFromCanonicalPack(canonicalPack = null) {
  const panels = canonicalPack?.panels;
  if (!isNonEmptyObject(panels)) {
    return null;
  }

  const drawings = {
    plan: [],
    elevation: [],
    section: [],
  };

  Object.entries(panels).forEach(([panelType, panel]) => {
    if (!panel || typeof panel !== "object") {
      return;
    }
    const entry = buildCanonicalDrawingEntry(panelType, panel, canonicalPack);

    if (panelType.startsWith("floor_plan_")) {
      drawings.plan.push({
        ...entry,
        level_id:
          panel.metadata?.levelId ||
          panel.metadata?.level_id ||
          panelType.replace(/^floor_plan_/, ""),
      });
      return;
    }

    if (panelType.startsWith("elevation_")) {
      drawings.elevation.push({
        ...entry,
        orientation: panelType.replace(/^elevation_/, "").toLowerCase(),
      });
      return;
    }

    if (panelType.startsWith("section_")) {
      const technicalMetadata = entry.technical_quality_metadata || {};
      drawings.section.push({
        ...entry,
        section_type: sectionTypeFromPanelType(panelType),
        section_profile:
          panel.section_profile ||
          technicalMetadata.section_profile ||
          (technicalMetadata.section_strategy_id
            ? {
                strategyId: technicalMetadata.section_strategy_id,
                strategyName: technicalMetadata.section_strategy_name || null,
                sectionCandidateQuality:
                  technicalMetadata.section_evidence_quality || null,
              }
            : null),
      });
    }
  });

  return hasDrawingEvidence(drawings) ? drawings : null;
}

function resolveComposeDrawings(projectContext = {}, canonicalPackDrawings = null) {
  const upstreamDrawings = [
    projectContext?.drawings,
    projectContext?.technicalDrawings,
    projectContext?.compiledProject?.drawings,
  ].reduce(
    (resolved, candidate) => mergeDrawingEvidence(resolved, candidate),
    null,
  );

  return canonicalPackDrawings
    ? mergeDrawingEvidence(canonicalPackDrawings, upstreamDrawings)
    : upstreamDrawings;
}

function pickComposeMeta(rawMeta = {}) {
  const meta = {};
  COMPOSE_META_KEYS.forEach((key) => {
    if (rawMeta[key] !== undefined && rawMeta[key] !== null) {
      meta[key] = rawMeta[key];
    }
  });
  return meta;
}

function buildComposePanels(
  generatedPanels,
  dnaRooms,
  { projectContext = {}, canonicalPack = null } = {},
) {
  const compiledProjectSchemaVersion =
    projectContext?.compiledProject?.compiledProjectSchemaVersion ||
    projectContext?.compiledProject?.schema_version ||
    projectContext?.authorityReadiness?.compiledProjectSchemaVersion ||
    null;
  const authoritySource =
    projectContext?.authorityReadiness?.authoritySource ||
    projectContext?.compiledProject?.authoritySource ||
    canonicalPack?.metadata?.authoritySource ||
    (canonicalPack?.geometryHash ? "compiled_project" : null);

  return generatedPanels.map((panel) => {
    const rawMeta = panel.meta || {};
    const meta = pickComposeMeta({
      ...rawMeta,
      geometryHash:
        rawMeta.geometryHash || panel.geometryHash || panel.geometry_hash,
      geometry_hash:
        rawMeta.geometry_hash || panel.geometry_hash || panel.geometryHash,
      cdsHash: rawMeta.cdsHash || panel.cdsHash,
      cds_hash: rawMeta.cds_hash || panel.cds_hash,
      runId: rawMeta.runId || panel.runId,
      svgHash: rawMeta.svgHash || panel.svgHash,
      sourceType: rawMeta.sourceType || panel.sourceType || panel.category,
      authoritySource:
        rawMeta.authoritySource ||
        (rawMeta.authorityUsed?.startsWith("compiled_project")
          ? "compiled_project"
          : authoritySource),
      compiledProjectSchemaVersion:
        rawMeta.compiledProjectSchemaVersion || compiledProjectSchemaVersion,
    });

    if (panel.type?.includes("floor_plan") && !meta.roomCount) {
      const floorIndex =
        panel.type === "floor_plan_ground"
          ? 0
          : panel.type === "floor_plan_first"
            ? 1
            : 2;
      const floorRooms = dnaRooms.filter((room) => {
        const level = room.floor ?? room.level ?? 0;
        return level === floorIndex;
      });
      meta.roomCount = floorRooms.length || dnaRooms.length || 1;
      meta.wallCount = meta.roomCount * 4;
    }

    return {
      type: panel.type,
      imageUrl: decodePanelImageUrl(panel.imageUrl, panel.svg),
      label: panel.label || panel.type.toUpperCase().replace(/_/g, " "),
      drawingNumber: panel.drawingNumber || rawMeta.drawingNumber || null,
      runId: meta.runId || panel.runId || null,
      geometryHash: meta.geometryHash || meta.geometry_hash || null,
      svgHash: meta.svgHash || null,
      authorityUsed: meta.authorityUsed || null,
      authoritySource: meta.authoritySource || null,
      sourceType: meta.sourceType || null,
      meta,
      ...(panel.svgPanel ? { svgPanel: true } : {}),
    };
  });
}

export function buildComposePayload({
  canonicalPack,
  designId,
  floorCount,
  generatedPanels,
  locationData,
  masterDNA,
  programLock,
  projectContext,
  runId,
}) {
  const safeGeneratedPanels = Array.isArray(generatedPanels)
    ? generatedPanels
    : [];
  const dnaRooms = masterDNA?.rooms || masterDNA?.program?.rooms || [];
  const panelFingerprint =
    masterDNA?.designFingerprint ||
    safeGeneratedPanels[0]?.meta?.designFingerprint ||
    designId;
  const composePanels = buildComposePanels(safeGeneratedPanels, dnaRooms, {
    projectContext,
    canonicalPack,
  });
  const sheetTextContract = buildSheetTextContract({
    panels: composePanels,
    titleBlock: projectContext?.titleBlock || projectContext?.title_block,
    masterDNA,
    projectContext,
    renderIntent: FINAL_A1_RENDER_INTENT,
  });
  const canonicalPackDrawings = deriveDrawingsFromCanonicalPack(canonicalPack);
  const drawings = resolveComposeDrawings(projectContext, canonicalPackDrawings);
  const technicalPanelQuality =
    projectContext?.technicalPanelQuality ||
    projectContext?.technicalPack?.technicalPanelQuality ||
    projectContext?.compiledProject?.technicalPanelQuality ||
    null;
  const finalSheetSvg =
    typeof projectContext?.finalSheetSvg === "string"
      ? projectContext.finalSheetSvg
      : typeof projectContext?.sheetSvg === "string"
        ? projectContext.sheetSvg
        : "";

  return {
    designId,
    runId: runId || null,
    renderIntent: FINAL_A1_RENDER_INTENT,
    printMaster: true,
    highRes: true,
    enforcePreComposeVerification: true,
    enforcePostComposeVerification: true,
    enforceRenderedText: true,
    sheetTextContract,
    drawings,
    technicalPanelQuality,
    finalSheetSvg,
    designFingerprint: panelFingerprint,
    floorCount,
    dnaHash: masterDNA?.dnaHash || computeCDSHashSync(masterDNA || {}),
    geometryHash: canonicalPack?.geometryHash || null,
    programHash: programLock?.hash || null,
    panels: composePanels,
    siteOverlay: null,
    layoutConfig: "uk-riba-standard",
    masterDNA: {
      rooms: dnaRooms,
      materials: normalizeMaterials(masterDNA),
      dimensions: masterDNA?.dimensions || {},
      architecturalStyle: masterDNA?.architecturalStyle,
      roof: masterDNA?.roof,
    },
    projectContext: {
      programSpaces: projectContext?.programSpaces || [],
      buildingProgram: projectContext?.buildingProgram,
      buildingCategory: projectContext?.buildingCategory || null,
      buildingSubType: projectContext?.buildingSubType || null,
      floorCount: projectContext?.floorCount || floorCount || null,
      geometryHash:
        canonicalPack?.geometryHash ||
        projectContext?.compiledProject?.geometryHash ||
        null,
      compiledProjectSchemaVersion:
        projectContext?.compiledProject?.compiledProjectSchemaVersion ||
        projectContext?.compiledProject?.schema_version ||
        null,
      technicalAuthority: projectContext?.technicalAuthority || null,
      authorityReadiness: projectContext?.authorityReadiness || null,
      deliveryStages: projectContext?.deliveryStages || null,
      exportManifest: projectContext?.exportManifest || null,
      reviewSurface: projectContext?.reviewSurface || null,
    },
    locationData: {
      climate: locationData?.climate || {},
      sunPath: locationData?.sunPath || {},
      address: locationData?.address || projectContext?.address || "",
      coordinates: locationData?.coordinates || null,
      zoning: locationData?.zoning || {},
    },
  };
}

function hydrateComposeTrace(result, response) {
  const traceId =
    result?.trace?.traceId ||
    response.headers?.get("X-Compose-Trace-Id") ||
    null;
  const runId =
    result?.trace?.runId || response.headers?.get("X-Compose-Run-Id") || null;
  const manifestUrl =
    result?.trace?.manifestUrl || result?.metadata?.manifestUrl || null;

  return {
    ...(result || {}),
    trace: {
      ...(result?.trace || {}),
      traceId,
      runId,
      manifestUrl,
    },
    metadata: {
      ...(result?.metadata || {}),
      traceId,
      runId,
      manifestUrl,
    },
  };
}

function logComposePayloadSize(composePayload, logger) {
  const composeBody = JSON.stringify(composePayload);
  const bodyMB = composeBody.length / 1_000_000;

  logger?.info(`📦 Compose payload size: ${bodyMB.toFixed(2)}MB`);

  if (bodyMB <= 3.5) {
    return composeBody;
  }

  logger?.warn(`⚠️ Compose payload large (${bodyMB.toFixed(2)}MB). Breakdown:`);
  for (const panel of composePayload.panels) {
    const imageKB = ((panel.imageUrl || "").length / 1000).toFixed(1);
    const metaKB = (JSON.stringify(panel.meta || {}).length / 1000).toFixed(1);
    logger?.warn(`   ${panel.type}: imageUrl=${imageKB}KB meta=${metaKB}KB`);
  }
  logger?.warn(
    `   masterDNA: ${(JSON.stringify(composePayload.masterDNA).length / 1000).toFixed(1)}KB`,
  );
  logger?.warn(
    `   siteOverlay: ${(JSON.stringify(composePayload.siteOverlay || null).length / 1000).toFixed(1)}KB`,
  );

  if (bodyMB >= 4.4) {
    logger?.error(
      `❌ Compose payload too large (${bodyMB.toFixed(2)}MB) – Vercel will reject it`,
    );
    throw new Error(
      `Compose payload too large: ${bodyMB.toFixed(2)}MB exceeds 4.4MB safety limit`,
    );
  }

  return composeBody;
}

function logComposeQuality(compositionResult, logger) {
  if (compositionResult.qa) {
    const qa = compositionResult.qa;
    if (qa.allPassed) {
      logger?.success(
        `✅ QA gates: ${qa.summary?.passed}/${qa.summary?.total} passed`,
      );
    } else if (qa.error) {
      logger?.warn(`⚠️  QA gates skipped: ${qa.error}`);
    } else {
      logger?.warn(
        `⚠️  QA gates: ${qa.summary?.passed}/${qa.summary?.total} passed, ${qa.failures?.length || 0} failures`,
      );
    }
  }

  if (compositionResult.critique) {
    const critique = compositionResult.critique;
    if (critique.overallPass) {
      logger?.success(
        `✅ Vision QA (Opus Critic): PASSED — visual score: ${critique.visualScore?.overall_presentation || "N/A"}/10`,
      );
    } else if (critique.error) {
      logger?.warn(`⚠️  Vision QA skipped: ${critique.error}`);
    } else {
      logger?.warn(
        `⚠️  Vision QA: ISSUES FOUND — ${critique.layoutIssues?.length || 0} layout, ${critique.regeneratePanels?.length || 0} regen needed`,
      );
    }
  }
}

/**
 * Canonical compose handoff for dnaWorkflowOrchestrator.
 * Owns request shaping, payload-size checks, HTTP transport, and QA logging.
 */
export async function composeA1Sheet({
  apiBaseUrl,
  canonicalDesignState,
  canonicalPack,
  designId,
  fetchImpl,
  floorCount,
  generatedPanels,
  locationData,
  logger,
  masterDNA,
  programLock,
  projectContext,
  runId,
  siteSnapshot,
  strictCanonicalPack = false,
}) {
  if (!fetchImpl) {
    throw new Error(
      "Fetch API is not available and no composeClient override was provided",
    );
  }

  const siteOverlay = buildSiteOverlay(siteSnapshot, logger);

  await validateComposeGate({
    canonicalDesignState,
    canonicalPack,
    generatedPanels,
    logger,
    programLock,
    strictCanonicalPack,
  });

  const composePayload = buildComposePayload({
    canonicalPack,
    designId,
    floorCount,
    generatedPanels,
    locationData,
    masterDNA,
    programLock,
    projectContext,
    runId,
  });
  composePayload.siteOverlay = siteOverlay;

  const composeBody = logComposePayloadSize(composePayload, logger);
  const composeResponse = await fetchImpl(`${apiBaseUrl}/api/a1/compose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: composeBody,
  });

  if (!composeResponse.ok) {
    let errorDetail = "";
    try {
      const errorBody = await composeResponse.json();
      errorDetail =
        errorBody.message || errorBody.error || JSON.stringify(errorBody);
      logger?.error(`❌ Compose API error: ${errorDetail}`);
    } catch {
      // Ignore response parse failures and preserve the original status error.
    }

    throw new Error(
      `Composition failed: ${composeResponse.status} – ${errorDetail}`,
    );
  }

  const compositionBody = await composeResponse.json();
  const compositionResult = hydrateComposeTrace(
    compositionBody,
    composeResponse,
  );
  logger?.success("✅ A1 sheet composed successfully");
  if (
    compositionResult.trace?.traceId ||
    compositionResult.trace?.manifestUrl
  ) {
    logger?.info("🧾 Compose trace received", {
      traceId: compositionResult.trace?.traceId || null,
      runId: compositionResult.trace?.runId || null,
      manifestUrl: compositionResult.trace?.manifestUrl || null,
    });
  }
  logComposeQuality(compositionResult, logger);

  return compositionResult;
}

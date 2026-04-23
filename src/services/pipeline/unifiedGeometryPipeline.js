/**
 * Unified Geometry Pipeline
 *
 * Geometry authority is resolved from a compiled project, canonical pack,
 * deterministic GLB render, or equivalent compiled render inputs.
 * Meshy may supply optional reference assets, but it is never the canonical
 * geometry source for blueprint consistency.
 *
 * Technical drawings remain deterministic and must never route through image
 * models. AI stylization is limited to image-edit passes on top of fixed
 * geometry renders for 3D panels.
 *
 * @module services/pipeline/unifiedGeometryPipeline
 */

import { isFeatureEnabled } from "../../config/featureFlags.js";
import logger from "../../utils/logger.js";
import { computeCDSHashSync } from "../validation/cdsHash.js";
import {
  buildHeroGenerationBlockMessage,
  resolveHeroGenerationDependencies,
} from "../design/heroDesignAuthorityService.js";

const DEFAULT_VIEWS = [
  "elevation_north",
  "elevation_south",
  "elevation_east",
  "elevation_west",
  "hero_3d",
  "axonometric",
];

const TECHNICAL_DRAWING_VIEWS = new Set([
  "floor_plan_ground",
  "floor_plan_first",
  "floor_plan_level2",
  "floor_plan_level3",
  "elevation_north",
  "elevation_south",
  "elevation_east",
  "elevation_west",
  "section_AA",
  "section_BB",
]);

const COMPILED_3D_VIEWS = new Set(["hero_3d", "interior_3d", "axonometric"]);

const PIPELINE_CONFIG = {
  meshy: {
    mode: "refine",
    artStyle: "realistic",
    textureRichness: "high",
    timeout: 300000,
  },
  flux: {
    hero3d: {
      model: "black-forest-labs/FLUX.1-kontext-max",
      steps: 45,
      guidance: 7.8,
      strength: 0.3,
      style: "photorealistic",
    },
    interior: {
      model: "black-forest-labs/FLUX.1-kontext-max",
      steps: 45,
      guidance: 7.5,
      strength: 0.25,
      style: "photorealistic_interior",
    },
    axonometric: {
      model: "black-forest-labs/FLUX.1-schnell",
      steps: 40,
      guidance: 7.2,
      strength: 0.22,
      style: "architectural_render",
    },
  },
  cameras: {
    elevation_north: { azimuth: 0, elevation: 0, ortho: true },
    elevation_south: { azimuth: 180, elevation: 0, ortho: true },
    elevation_east: { azimuth: 90, elevation: 0, ortho: true },
    elevation_west: { azimuth: 270, elevation: 0, ortho: true },
    hero_3d: { azimuth: 135, elevation: 25, ortho: false },
    interior_3d: { azimuth: 45, elevation: 15, ortho: false, interior: true },
    axonometric: { azimuth: 45, elevation: 35, ortho: true },
  },
};

let canonicalPackModulePromise = null;

async function getCanonicalPackModule() {
  if (!canonicalPackModulePromise) {
    canonicalPackModulePromise =
      import("../canonical/CanonicalGeometryPackService.js");
  }
  return canonicalPackModulePromise;
}

function normalizeHashValue(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalString(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function isDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:");
}

function normalizeRenderInput(
  entry,
  panelType,
  defaultSourceType = "compiled_render_input",
) {
  if (!entry) return null;

  if (typeof entry === "string") {
    return {
      panelType,
      viewType: panelType,
      dataUrl: isDataUrl(entry) ? entry : null,
      url: isDataUrl(entry) ? null : entry,
      sourceType: defaultSourceType,
    };
  }

  if (typeof entry !== "object") return null;

  const imageValue =
    entry.dataUrl ||
    entry.url ||
    entry.imageUrl ||
    entry.init_image ||
    entry.controlImage ||
    entry.renderInput ||
    null;

  return {
    ...entry,
    panelType: entry.panelType || entry.viewType || panelType,
    viewType: entry.viewType || panelType,
    dataUrl: entry.dataUrl || (isDataUrl(imageValue) ? imageValue : null),
    url:
      entry.url ||
      entry.imageUrl ||
      (isDataUrl(imageValue) ? null : imageValue),
    width: entry.width || null,
    height: entry.height || null,
    svgString: entry.svgString || entry.svg || null,
    sourceType: entry.sourceType || entry.source || defaultSourceType,
  };
}

function extractCompiledRenderInputs(compiledProject = {}) {
  const renderMaps = [
    compiledProject.renderInputs,
    compiledProject.renderedViews,
    compiledProject.controlImages,
    compiledProject.views,
    compiledProject.panels,
    compiledProject.renders,
  ].filter(Boolean);

  const inputs = {};
  renderMaps.forEach((renderMap) => {
    Object.entries(renderMap).forEach(([panelType, entry]) => {
      const normalized = normalizeRenderInput(
        entry,
        panelType,
        "compiled_render_input",
      );
      if (normalized) {
        inputs[panelType] = normalized;
      }
    });
  });

  return inputs;
}

function computeRenderInputGeometryHash(renderInputs = {}) {
  const serialized = Object.entries(renderInputs)
    .sort(([left], [right]) => left.localeCompare(right))
    .reduce((acc, [panelType, entry]) => {
      const payload = entry?.svgString || entry?.dataUrl || entry?.url || null;
      if (!payload) return acc;
      acc[panelType] = computeCDSHashSync({
        panelType,
        payload,
      });
      return acc;
    }, {});

  return Object.keys(serialized).length > 0
    ? computeCDSHashSync(serialized)
    : null;
}

function resolveCompiledModelUrl(compiledProject = {}) {
  return (
    compiledProject.modelUrl ||
    compiledProject.glbUrl ||
    compiledProject.modelGlb ||
    compiledProject?.artifacts?.modelGlb?.url ||
    compiledProject?.artifacts?.model_glb?.url ||
    null
  );
}

function buildSourceMetadata(authority, panelType, sourceType, overrides = {}) {
  return {
    authority: "compiled_geometry",
    authorityType:
      overrides.authorityType || authority?.authorityType || "compiled_project",
    sourceType: sourceType || overrides.sourceType || "compiled_render_input",
    panelType,
    geometryHash:
      overrides.geometryHash ||
      authority?.geometryHash ||
      authority?.sourceMetadata?.geometryHash ||
      null,
    cdsHash: overrides.cdsHash || authority?.cdsHash || null,
    designFingerprint:
      overrides.designFingerprint ||
      authority?.designFingerprint ||
      authority?.sourceMetadata?.designFingerprint ||
      null,
    projectId: overrides.projectId || authority?.projectId || null,
    compiledProjectId:
      overrides.compiledProjectId ||
      authority?.compiledProjectId ||
      authority?.projectId ||
      null,
    canonicalGeometry:
      overrides.canonicalGeometry ?? Boolean(authority?.canonicalPack),
    deterministic: overrides.deterministic ?? true,
    technicalDrawing: isTechnicalDrawingView(panelType),
    heroDesignFinalized:
      overrides.heroDesignFinalized ??
      authority?.heroFinalization?.heroReady ??
      null,
    stylizationMode: overrides.stylizationMode || null,
    meshyRole: overrides.meshyRole || null,
  };
}

export function attachGeometryAuthority(
  entry = {},
  authority = {},
  panelType,
  overrides = {},
) {
  const normalizedPanelType =
    panelType || entry.panelType || entry.viewType || "unknown";
  const geometryHash =
    normalizeHashValue(
      overrides.geometryHash ||
        entry.geometryHash ||
        entry.meta?.geometryHash ||
        authority?.geometryHash,
    ) || null;
  const cdsHash =
    normalizeHashValue(
      overrides.cdsHash ||
        entry.cdsHash ||
        entry.meta?.cdsHash ||
        authority?.cdsHash,
    ) || null;
  const sourceType =
    overrides.sourceType ||
    entry.sourceMetadata?.sourceType ||
    entry.sourceType ||
    entry.source ||
    authority?.defaultSourceType ||
    "compiled_render_input";
  const sourceMetadata = buildSourceMetadata(
    authority,
    normalizedPanelType,
    sourceType,
    {
      ...overrides,
      geometryHash,
      cdsHash,
    },
  );

  return {
    ...entry,
    panelType: entry.panelType || entry.viewType || normalizedPanelType,
    viewType: entry.viewType || normalizedPanelType,
    source: entry.source || sourceType,
    sourceType,
    geometryHash,
    cdsHash,
    sourceMetadata,
    meta: {
      ...(entry.meta || {}),
      geometryHash,
      ...(cdsHash ? { cdsHash } : {}),
      controlSource: sourceType,
      sourceMetadata,
    },
  };
}

export function isTechnicalDrawingView(viewType) {
  return TECHNICAL_DRAWING_VIEWS.has(viewType);
}

export function assertSourceMetadata(entry, panelType = null) {
  const resolvedPanelType =
    panelType || entry?.panelType || entry?.viewType || "unknown";
  const sourceMetadata =
    entry?.sourceMetadata || entry?.meta?.sourceMetadata || null;

  if (!sourceMetadata) {
    throw new Error(`Missing source metadata for ${resolvedPanelType}`);
  }
  if (!sourceMetadata.authorityType) {
    throw new Error(
      `Missing authorityType in source metadata for ${resolvedPanelType}`,
    );
  }
  if (!sourceMetadata.sourceType) {
    throw new Error(
      `Missing sourceType in source metadata for ${resolvedPanelType}`,
    );
  }

  const geometryHash =
    normalizeHashValue(
      entry?.geometryHash ||
        entry?.meta?.geometryHash ||
        sourceMetadata.geometryHash,
    ) || null;
  if (!geometryHash) {
    throw new Error(
      `Missing geometryHash in source metadata for ${resolvedPanelType}`,
    );
  }

  return true;
}

export function assertGeometryHashContinuity(
  entries,
  expectedGeometryHash,
  context = "geometry continuity",
) {
  const normalizedExpected = normalizeHashValue(expectedGeometryHash);
  if (!normalizedExpected) {
    throw new Error(`Missing expected geometryHash for ${context}`);
  }

  const values = Array.isArray(entries)
    ? entries
    : entries && typeof entries === "object"
      ? Object.values(entries)
      : [];

  const mismatches = values
    .filter(Boolean)
    .map((entry) => ({
      panelType: entry.panelType || entry.viewType || "unknown",
      geometryHash: normalizeHashValue(
        entry.geometryHash || entry.meta?.geometryHash || null,
      ),
    }))
    .filter(
      (entry) =>
        entry.geometryHash && entry.geometryHash !== normalizedExpected,
    );

  if (mismatches.length > 0) {
    throw new Error(
      `${context} failed: ${mismatches
        .map((entry) => `${entry.panelType}=${entry.geometryHash}`)
        .join(", ")}`,
    );
  }

  return true;
}

async function resolveCanonicalPackCandidate(
  dna,
  options = {},
  compiledProject = null,
) {
  const projectContext = options.projectContext || {};
  const directPack =
    options.canonicalPack ||
    projectContext.canonicalPack ||
    dna?.canonicalPack ||
    compiledProject?.canonicalPack ||
    null;

  if (directPack?.geometryHash && directPack?.panels) {
    return directPack;
  }

  let canonicalPackModule = null;
  try {
    canonicalPackModule = await getCanonicalPackModule();
  } catch (error) {
    logger.warn(
      `[UnifiedPipeline] Canonical pack module unavailable: ${error.message}`,
    );
    return null;
  }

  const lookupKey =
    options.designFingerprint ||
    projectContext.designFingerprint ||
    dna?.designFingerprint ||
    dna?.designId ||
    compiledProject?.designFingerprint ||
    compiledProject?.designId ||
    null;

  if (lookupKey) {
    const cachedPack = canonicalPackModule.getCanonicalPack(lookupKey);
    if (cachedPack?.geometryHash && cachedPack?.panels) {
      return cachedPack;
    }
  }

  const cdsSource =
    options.canonicalDesignState ||
    projectContext.canonicalDesignState ||
    dna?.canonicalDesignState ||
    dna?.cds ||
    compiledProject?.canonicalDesignState ||
    null;

  if (!cdsSource) {
    return null;
  }

  try {
    return canonicalPackModule.buildCanonicalPack(cdsSource, {
      designFingerprint:
        lookupKey || cdsSource.designFingerprint || cdsSource.designId || null,
    });
  } catch (error) {
    logger.warn(
      `[UnifiedPipeline] Failed to build canonical pack: ${error.message}`,
    );
    return null;
  }
}

function buildAuthorityFromCanonicalPack(pack, compiledProject = null) {
  if (!pack?.geometryHash || !pack?.panels) return null;

  const compiledInputs = extractCompiledRenderInputs(compiledProject || {});
  const compiledGeometryHash = normalizeHashValue(
    compiledProject?.geometryHash,
  );

  if (compiledGeometryHash && compiledGeometryHash !== pack.geometryHash) {
    throw new Error(
      `Compiled project geometryHash (${compiledGeometryHash}) does not match canonical pack geometryHash (${pack.geometryHash})`,
    );
  }

  const renderInputs = {};
  Object.entries(pack.panels).forEach(([panelType, entry]) => {
    if (compiledProject && COMPILED_3D_VIEWS.has(panelType)) {
      return;
    }
    renderInputs[panelType] = normalizeRenderInput(
      {
        dataUrl: entry?.dataUrl || null,
        svgString: entry?.svgString || null,
        width: entry?.width || null,
        height: entry?.height || null,
        svgHash: entry?.svgHash || null,
      },
      panelType,
      "canonical_pack",
    );
  });

  Object.entries(compiledInputs).forEach(([panelType, entry]) => {
    renderInputs[panelType] = entry;
  });

  const heroFinalization = resolveHeroGenerationDependencies({
    compiledProject: compiledProject || {},
  });

  return {
    authorityType: compiledProject ? "compiled_project" : "canonical_pack",
    defaultSourceType: compiledProject
      ? "compiled_render_input"
      : "canonical_pack",
    geometryHash: pack.geometryHash,
    cdsHash: pack.cdsHash || null,
    designFingerprint:
      compiledProject?.designFingerprint ||
      pack.designFingerprint ||
      compiledProject?.designId ||
      null,
    projectId:
      compiledProject?.projectId ||
      compiledProject?.designId ||
      pack.designId ||
      null,
    compiledProjectId:
      compiledProject?.compiledProjectId ||
      compiledProject?.projectId ||
      compiledProject?.designId ||
      pack.designId ||
      null,
    modelUrl: resolveCompiledModelUrl(compiledProject || {}),
    renderInputs,
    canonicalPack: pack,
    compiledProject: compiledProject || null,
    heroFinalization,
    sourceMetadata: {
      geometryHash: pack.geometryHash,
      cdsHash: pack.cdsHash || null,
      designFingerprint:
        compiledProject?.designFingerprint ||
        pack.designFingerprint ||
        compiledProject?.designId ||
        null,
    },
  };
}

function buildAuthorityFromCompiledProject(
  compiledProject = null,
  fallback = {},
) {
  if (!compiledProject) return null;

  const renderInputs = extractCompiledRenderInputs(compiledProject);
  const modelUrl = resolveCompiledModelUrl(compiledProject);
  if (!modelUrl && Object.keys(renderInputs).length === 0) {
    return null;
  }

  const geometryHash =
    normalizeHashValue(compiledProject.geometryHash) ||
    normalizeHashValue(compiledProject.meta?.geometryHash) ||
    normalizeHashValue(fallback.geometryHash) ||
    computeRenderInputGeometryHash(renderInputs);

  const heroFinalization = resolveHeroGenerationDependencies({
    compiledProject,
  });

  return {
    authorityType: "compiled_project",
    defaultSourceType: "compiled_render_input",
    geometryHash,
    cdsHash:
      normalizeHashValue(compiledProject.cdsHash) ||
      normalizeHashValue(compiledProject.meta?.cdsHash) ||
      normalizeHashValue(fallback.cdsHash) ||
      null,
    designFingerprint:
      compiledProject.designFingerprint ||
      compiledProject.designId ||
      fallback.designFingerprint ||
      null,
    projectId:
      compiledProject.projectId ||
      compiledProject.designId ||
      fallback.projectId ||
      null,
    compiledProjectId:
      compiledProject.compiledProjectId ||
      compiledProject.projectId ||
      compiledProject.designId ||
      fallback.projectId ||
      null,
    modelUrl,
    renderInputs,
    canonicalPack: null,
    compiledProject,
    heroFinalization,
    sourceMetadata: {
      geometryHash,
      cdsHash:
        normalizeHashValue(compiledProject.cdsHash) ||
        normalizeHashValue(compiledProject.meta?.cdsHash) ||
        normalizeHashValue(fallback.cdsHash) ||
        null,
      designFingerprint:
        compiledProject.designFingerprint ||
        compiledProject.designId ||
        fallback.designFingerprint ||
        null,
    },
  };
}

export async function resolveCompiledGeometryAuthority(dna, options = {}) {
  const projectContext = options.projectContext || {};
  const compiledProject =
    options.compiledProject ||
    projectContext.compiledProject ||
    dna?.compiledProject ||
    null;
  const fallbackGeometryHash =
    normalizeHashValue(options.geometryHash) ||
    normalizeHashValue(projectContext.geometryHash) ||
    normalizeHashValue(dna?.geometryHash) ||
    null;
  const fallbackCdsHash =
    normalizeHashValue(options.cdsHash) ||
    normalizeHashValue(projectContext.cdsHash) ||
    normalizeHashValue(dna?.cdsHash) ||
    null;
  const fallbackDesignFingerprint =
    options.designFingerprint ||
    projectContext.designFingerprint ||
    dna?.designFingerprint ||
    null;

  const canonicalPack = await resolveCanonicalPackCandidate(
    dna,
    options,
    compiledProject,
  );
  if (canonicalPack) {
    const authority = buildAuthorityFromCanonicalPack(
      canonicalPack,
      compiledProject,
    );
    if (authority?.geometryHash) {
      return authority;
    }
  }

  const compiledAuthority = buildAuthorityFromCompiledProject(compiledProject, {
    geometryHash: fallbackGeometryHash,
    cdsHash: fallbackCdsHash,
    designFingerprint: fallbackDesignFingerprint,
    projectId: projectContext.projectId || dna?.designId || null,
  });
  if (compiledAuthority?.geometryHash) {
    return compiledAuthority;
  }

  throw new Error(
    "Compiled geometry authority is required. Provide a CompiledProject, canonical pack, or deterministic compiled render input with geometryHash.",
  );
}

export async function requestCompiledModelRenders(
  modelUrl,
  views,
  authority = null,
) {
  const renders = {};

  for (const viewType of views) {
    const camera = PIPELINE_CONFIG.cameras[viewType];
    if (!camera) {
      logger.warn(`[UnifiedPipeline] Unknown view type: ${viewType}`);
      continue;
    }

    try {
      const render = await renderCompiledModelView(modelUrl, camera, viewType);
      renders[viewType] = attachGeometryAuthority(render, authority, viewType, {
        sourceType: "compiled_model_render",
        stylizationMode: isTechnicalDrawingView(viewType)
          ? "deterministic_passthrough"
          : null,
      });
      logger.info(
        `[UnifiedPipeline] Rendered ${viewType} from compiled model (${camera.ortho ? "orthographic" : "perspective"})`,
      );
    } catch (error) {
      logger.warn(
        `[UnifiedPipeline] Failed to render ${viewType}: ${error.message}`,
      );
      renders[viewType] = null;
    }
  }

  return renders;
}

export async function requestMeshyRenders(modelUrl, views, authority = null) {
  return requestCompiledModelRenders(modelUrl, views, authority);
}

async function renderCompiledModelView(modelUrl, camera, viewType) {
  if (typeof window !== "undefined") {
    return renderWithThreeJS(modelUrl, camera, viewType);
  }
  return renderServerSide(modelUrl, camera, viewType);
}

async function renderWithThreeJS(modelUrl, camera, viewType) {
  const THREE = await import("three");
  const { GLTFLoader } =
    await import("three/examples/jsm/loaders/GLTFLoader.js");

  return new Promise((resolve, reject) => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    let cam;
    if (camera.ortho) {
      cam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 1000);
    } else {
      cam = new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 1000);
    }

    const distance = 30;
    const azimuthRad = (camera.azimuth * Math.PI) / 180;
    const elevationRad = (camera.elevation * Math.PI) / 180;

    cam.position.x = distance * Math.cos(elevationRad) * Math.sin(azimuthRad);
    cam.position.y = distance * Math.sin(elevationRad);
    cam.position.z = distance * Math.cos(elevationRad) * Math.cos(azimuthRad);
    cam.lookAt(0, 3, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(2048, 1536);
    renderer.setClearColor(0xffffff, 1);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        scene.add(gltf.scene);
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const center = box.getCenter(new THREE.Vector3());
        gltf.scene.position.sub(center);

        renderer.render(scene, cam);
        const dataUrl = renderer.domElement.toDataURL("image/png");
        renderer.dispose();

        resolve({
          dataUrl,
          width: 2048,
          height: 1536,
          viewType,
          camera,
        });
      },
      undefined,
      (error) => reject(new Error(`Failed to load GLB: ${error.message}`)),
    );
  });
}

async function renderServerSide(modelUrl, camera, viewType) {
  const response = await fetch("/api/render-glb", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modelUrl,
      camera,
      viewType,
      width: 2048,
      height: 1536,
    }),
  });

  if (!response.ok) {
    throw new Error(`Server render failed: ${response.status}`);
  }

  return response.json();
}

function getFluxConfigForView(viewType) {
  if (viewType === "hero_3d") {
    return PIPELINE_CONFIG.flux.hero3d;
  }
  if (viewType === "interior_3d") {
    return PIPELINE_CONFIG.flux.interior;
  }
  if (viewType === "axonometric") {
    return PIPELINE_CONFIG.flux.axonometric;
  }
  return PIPELINE_CONFIG.flux.hero3d;
}

function buildStylizationPrompt(dna, viewType, styleType) {
  const style = dna?.style || {};
  const materials = style.materials || [];
  const architecture =
    style.architecture || style.primaryStyle || "contemporary";
  const materialList =
    materials
      .slice(0, 3)
      .map((material) => material.name || material.material)
      .filter(Boolean)
      .join(", ") || "brick, glass, zinc";

  const geometryLock = [
    "image edit only on the provided geometry render",
    "preserve exact silhouette",
    "preserve roof lines",
    "preserve all openings",
    "preserve massing",
    "preserve camera framing",
    "do not add or remove floors",
  ].join(", ");

  if (styleType === "photorealistic") {
    return [
      "photorealistic architectural exterior visualization",
      `${architecture} architecture`,
      `materials: ${materialList}`,
      "high-end real estate rendering",
      "natural lighting",
      geometryLock,
    ].join(", ");
  }

  if (styleType === "photorealistic_interior") {
    return [
      "photorealistic architectural interior visualization",
      `${architecture} interior`,
      `materials: ${materialList}`,
      "editorial architectural photography",
      geometryLock,
    ].join(", ");
  }

  return [
    "architectural axonometric render",
    `${architecture} building`,
    `materials: ${materialList}`,
    "clean presentation background",
    geometryLock,
  ].join(", ");
}

function buildNegativePrompt(viewType) {
  const common = [
    "low quality",
    "blurry",
    "distorted",
    "watermark",
    "text overlay",
    "changed silhouette",
    "altered roof line",
    "extra openings",
    "missing openings",
    "changed massing",
    "extra floor",
    "different proportions",
  ];

  if (viewType === "hero_3d") {
    common.push("partial building", "cropped facade");
  }
  if (viewType === "interior_3d") {
    common.push("exterior view", "facade only");
  }
  if (viewType === "axonometric") {
    common.push("perspective distortion", "people", "cars");
  }

  return common.join(", ");
}

export async function stylizeWithFlux(
  baseRender,
  dna,
  viewType,
  authority = null,
) {
  const authoritativeBase = attachGeometryAuthority(
    baseRender,
    authority,
    viewType,
    {
      sourceType:
        baseRender?.sourceType || baseRender?.source || "compiled_render_input",
    },
  );

  if (isTechnicalDrawingView(viewType)) {
    return attachGeometryAuthority(authoritativeBase, authority, viewType, {
      sourceType: authoritativeBase.sourceType || "compiled_render_input",
      stylizationMode: "deterministic_passthrough",
    });
  }

  const initImage = authoritativeBase.dataUrl || authoritativeBase.url || null;
  if (!initImage) {
    throw new Error(
      `Cannot stylize ${viewType}: missing compiled geometry render input`,
    );
  }
  if (viewType === "hero_3d") {
    const heroFinalization =
      authority?.heroFinalization ||
      resolveHeroGenerationDependencies({
        compiledProject: authority?.compiledProject || {},
      });
    if (heroFinalization.heroReady !== true) {
      throw new Error(buildHeroGenerationBlockMessage(heroFinalization));
    }
  }

  const config = getFluxConfigForView(viewType);
  const prompt = buildStylizationPrompt(dna, viewType, config.style);
  const negativePrompt = buildNegativePrompt(viewType);

  logger.info(
    `[UnifiedPipeline] Stylizing ${viewType} via image-edit on compiled geometry (strength=${config.strength})`,
  );

  try {
    const response = await fetch("/api/together/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        prompt,
        negative_prompt: negativePrompt,
        width: authoritativeBase.width || 2048,
        height: authoritativeBase.height || 1536,
        steps: config.steps,
        guidance_scale: config.guidance,
        init_image: initImage,
        strength: config.strength,
      }),
    });

    if (!response.ok) {
      throw new Error(`FLUX stylization failed: ${response.status}`);
    }

    const result = await response.json();
    return attachGeometryAuthority(
      {
        ...authoritativeBase,
        dataUrl:
          result.data?.[0]?.url ||
          result.url ||
          authoritativeBase.dataUrl ||
          null,
        prompt,
        config,
        baseImage:
          authoritativeBase.sourceMetadata?.sourceType ||
          authoritativeBase.source,
      },
      authority,
      viewType,
      {
        sourceType: "flux_image_edit",
        stylizationMode: "image_edit_locked",
      },
    );
  } catch (error) {
    logger.warn(
      `[UnifiedPipeline] Stylization failed for ${viewType}: ${error.message}`,
    );
    return attachGeometryAuthority(
      {
        ...authoritativeBase,
        stylizationError: error.message,
      },
      authority,
      viewType,
      {
        sourceType:
          authoritativeBase.sourceType ||
          authoritativeBase.source ||
          "compiled_render_input",
        stylizationMode: "image_edit_failed_passthrough",
      },
    );
  }
}

async function generateMeshyModel(dna, existingTaskId = null) {
  try {
    const meshy3DService = (await import("../geometry/meshy3DService.js"))
      .default;
    if (!meshy3DService?.isAvailable || !meshy3DService.isAvailable()) {
      return { success: false, error: "Meshy service not available" };
    }

    if (existingTaskId) {
      const status = await meshy3DService.getTaskStatus(existingTaskId);
      if (status?.status === "SUCCEEDED") {
        return {
          success: true,
          taskId: existingTaskId,
          modelUrl: status.model_urls?.glb || null,
          thumbnailUrl: status.thumbnail_url || null,
          isCanonical: false,
        };
      }
    }

    const geometry = dna?.geometry_rules || {};
    const program = dna?.program || {};
    const volumeSpec = {
      dimensions: {
        length: geometry.footprint_length || 12,
        width: geometry.footprint_width || 10,
        height: (program.floors || 2) * 3,
      },
      floors: program.floors || 2,
      roof: {
        type: geometry.roof_type || "gable",
        pitch: geometry.roof_pitch || 35,
      },
    };

    const result = await meshy3DService.generate3DFromDNA(dna, volumeSpec);
    return {
      ...result,
      isCanonical: false,
    };
  } catch (error) {
    logger.warn(`[UnifiedPipeline] Meshy service error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

export async function runUnifiedPipeline(dna, options = {}) {
  const {
    views = DEFAULT_VIEWS,
    skipStylization = false,
    meshyTaskId = null,
    compiledProject = null,
    projectContext = {},
    useMeshy = isFeatureEnabled("meshy3DMode"),
  } = options;

  logger.group("UNIFIED GEOMETRY PIPELINE");

  const results = {
    geometryAuthority: null,
    compiledRenders: {},
    stylizedViews: {},
    controlImages: {},
    meshyModel: null,
    meshyRenders: {},
    metadata: {
      timestamp: new Date().toISOString(),
      pipeline: "unified_compiled_geometry_first",
      views,
      steps: [],
      geometryHash: null,
      missingViews: [],
    },
  };

  try {
    const authority = await resolveCompiledGeometryAuthority(dna, {
      ...options,
      compiledProject,
      projectContext,
      views,
    });
    results.geometryAuthority = {
      authorityType: authority.authorityType,
      geometryHash: authority.geometryHash,
      cdsHash: authority.cdsHash || null,
      designFingerprint: authority.designFingerprint || null,
      projectId: authority.projectId || null,
      compiledProjectId: authority.compiledProjectId || null,
    };
    results.metadata.geometryHash = authority.geometryHash;
    results.metadata.steps.push("compiled-geometry-authority");

    Object.entries(authority.renderInputs || {}).forEach(
      ([panelType, entry]) => {
        if (!views.includes(panelType)) return;
        results.compiledRenders[panelType] = attachGeometryAuthority(
          entry,
          authority,
          panelType,
          {
            sourceType: entry.sourceType || authority.defaultSourceType,
            stylizationMode: isTechnicalDrawingView(panelType)
              ? "deterministic_passthrough"
              : null,
          },
        );
      },
    );

    const missingViews = views.filter(
      (viewType) => !results.compiledRenders[viewType],
    );
    if (missingViews.length > 0 && authority.modelUrl) {
      const modelRenders = await requestCompiledModelRenders(
        authority.modelUrl,
        missingViews,
        authority,
      );
      Object.entries(modelRenders).forEach(([panelType, entry]) => {
        if (entry) {
          results.compiledRenders[panelType] = entry;
        }
      });
    }

    results.metadata.missingViews = views.filter(
      (viewType) => !results.compiledRenders[viewType],
    );
    results.metadata.steps.push("compiled-geometry-renders");

    Object.entries(results.compiledRenders).forEach(([panelType, entry]) => {
      results.controlImages[panelType] = attachGeometryAuthority(
        entry,
        authority,
        panelType,
        {
          sourceType: entry.sourceType || authority.defaultSourceType,
          stylizationMode: isTechnicalDrawingView(panelType)
            ? "deterministic_passthrough"
            : null,
        },
      );
      assertSourceMetadata(results.controlImages[panelType], panelType);
    });
    assertGeometryHashContinuity(
      results.controlImages,
      authority.geometryHash,
      "unified control image continuity",
    );

    if (useMeshy) {
      const meshyResult = await generateMeshyModel(dna, meshyTaskId);
      if (meshyResult?.success) {
        results.meshyModel = {
          ...meshyResult,
          sourceMetadata: buildSourceMetadata(
            authority,
            "meshy_reference",
            "meshy_reference",
            {
              stylizationMode: "reference_only",
              meshyRole: "optional_reference",
            },
          ),
        };
        results.metadata.steps.push("meshy-reference");
      }
    }

    if (skipStylization) {
      views.forEach((viewType) => {
        const baseRender = results.controlImages[viewType];
        if (!baseRender) return;
        results.stylizedViews[viewType] = attachGeometryAuthority(
          baseRender,
          authority,
          viewType,
          {
            sourceType: baseRender.sourceType || authority.defaultSourceType,
            stylizationMode: isTechnicalDrawingView(viewType)
              ? "deterministic_passthrough"
              : "stylization_skipped",
          },
        );
      });
    } else {
      for (const viewType of views) {
        const baseRender = results.controlImages[viewType];
        if (!baseRender) {
          logger.warn(
            `[UnifiedPipeline] Missing compiled render input for ${viewType}`,
          );
          continue;
        }
        results.stylizedViews[viewType] = await stylizeWithFlux(
          baseRender,
          dna,
          viewType,
          authority,
        );
      }
    }

    Object.entries(results.stylizedViews).forEach(([panelType, entry]) => {
      assertSourceMetadata(entry, panelType);
    });
    assertGeometryHashContinuity(
      results.stylizedViews,
      authority.geometryHash,
      "unified stylized view continuity",
    );
    results.metadata.steps.push("view-output");

    logger.success("[UnifiedPipeline] Complete");
    logger.groupEnd();
    return {
      success: true,
      results,
    };
  } catch (error) {
    logger.error(`[UnifiedPipeline] Failed: ${error.message}`);
    logger.groupEnd();
    return {
      success: false,
      error: error.message,
      results,
    };
  }
}

const unifiedGeometryPipeline = {
  runUnifiedPipeline,
  requestCompiledModelRenders,
  requestMeshyRenders,
  stylizeWithFlux,
  resolveCompiledGeometryAuthority,
  attachGeometryAuthority,
  assertGeometryHashContinuity,
  assertSourceMetadata,
  isTechnicalDrawingView,
  PIPELINE_CONFIG,
};

export default unifiedGeometryPipeline;

export { PIPELINE_CONFIG };

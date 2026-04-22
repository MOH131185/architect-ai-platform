const BLUEPRINT_LIKE_PANELS = new Set(["site_diagram", "site_plan"]);

export function getCanonicalPackSource(canonicalPack) {
  return (
    canonicalPack?.metadata?.source ||
    canonicalPack?.meta?.source ||
    canonicalPack?.source ||
    null
  );
}

export function isCompiledProjectCanonicalPack(canonicalPack) {
  const source = getCanonicalPackSource(canonicalPack);
  const authoritySource = canonicalPack?.metadata?.authoritySource || null;
  const schemaVersion = String(
    canonicalPack?.metadata?.compiledProjectSchemaVersion || "",
  )
    .trim()
    .toLowerCase();

  if (source !== "compiled_project" || authoritySource !== "compiled_project") {
    return false;
  }

  return !schemaVersion || schemaVersion.startsWith("compiled-project");
}

export function isTechnicalPanel(panelType) {
  if (typeof panelType !== "string" || panelType.length === 0) {
    return false;
  }

  return (
    panelType.startsWith("floor_plan_") ||
    panelType.startsWith("elevation_") ||
    panelType === "section_AA" ||
    panelType === "section_BB" ||
    panelType.startsWith("section_")
  );
}

export function isBlueprintLikePanel(panelType) {
  return BLUEPRINT_LIKE_PANELS.has(panelType);
}

export function isDirectDeterministicPanel(panelType) {
  return isTechnicalPanel(panelType) || isBlueprintLikePanel(panelType);
}

export function resolveDirectPanelRoute(
  panelType,
  { canonicalPack = null, hasCompiledCanonicalAsset = false } = {},
) {
  const packSource = getCanonicalPackSource(canonicalPack);

  if (!isDirectDeterministicPanel(panelType)) {
    return {
      direct: false,
      useFlux: true,
      authority: "flux_candidate",
      packSource,
      reason: "panel is not deterministic-only",
    };
  }

  if (
    isTechnicalPanel(panelType) &&
    isCompiledProjectCanonicalPack(canonicalPack) &&
    hasCompiledCanonicalAsset
  ) {
    return {
      direct: true,
      useFlux: false,
      authority: "compiled_project_canonical_pack",
      useCompiledCanonicalAsset: true,
      packSource,
      reason:
        "compiled-project canonical SVG is authoritative for technical panels",
    };
  }

  if (isTechnicalPanel(panelType)) {
    return {
      direct: true,
      useFlux: false,
      authority: "deterministic_svg",
      useCompiledCanonicalAsset: false,
      packSource,
      reason: packSource
        ? `technical panel ignores non-compiled canonical pack source "${packSource}"`
        : "technical panel has no canonical pack authority",
    };
  }

  return {
    direct: true,
    useFlux: false,
    authority: "deterministic_svg",
    useCompiledCanonicalAsset: false,
    packSource,
    reason: "blueprint-like panels stay on deterministic SVG generation",
  };
}

export function resolveVisualPanelAuthority(
  panelType,
  { canonicalPack = null, geometryRender = null } = {},
) {
  const packSource = getCanonicalPackSource(canonicalPack);

  if (isDirectDeterministicPanel(panelType)) {
    return {
      route: "direct_svg",
      authority: "deterministic_svg",
      packSource,
      reason: "technical and blueprint-like panels bypass image generation",
    };
  }

  if (
    geometryRender?.type === "compiled_project_canonical_pack" &&
    isCompiledProjectCanonicalPack(canonicalPack)
  ) {
    return {
      route: "flux",
      authority: "compiled_project_canonical_pack",
      packSource,
      reason: "using compiled-project canonical control render",
    };
  }

  if (geometryRender?.url) {
    return {
      route: "flux",
      authority: `geometry_derived:${geometryRender.type || "unknown"}`,
      packSource,
      reason: "using geometry-derived control render",
    };
  }

  if (packSource && !isCompiledProjectCanonicalPack(canonicalPack)) {
    return {
      route: "flux",
      authority: "prompt_only",
      packSource,
      reason: `legacy canonical pack source "${packSource}" is ignored for visual control authority`,
    };
  }

  return {
    route: "flux",
    authority: "prompt_only",
    packSource,
    reason: "no compiled-project or geometry-derived control is available",
  };
}

export default {
  getCanonicalPackSource,
  isCompiledProjectCanonicalPack,
  isTechnicalPanel,
  isBlueprintLikePanel,
  isDirectDeterministicPanel,
  resolveDirectPanelRoute,
  resolveVisualPanelAuthority,
};

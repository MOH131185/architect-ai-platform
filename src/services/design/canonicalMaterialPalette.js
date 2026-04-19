import { isFeatureEnabled } from "../../config/featureFlags.js";

const MATERIAL_LIBRARY = {
  brick: {
    name: "Brick",
    hexColor: "#B55D4C",
    hatch: "brick",
    label: "Masonry brickwork",
  },
  stone: {
    name: "Stone",
    hexColor: "#B8B2A7",
    hatch: "stone",
    label: "Natural stone cladding",
  },
  render: {
    name: "Render",
    hexColor: "#E8E0D2",
    hatch: "render",
    label: "Smooth rendered finish",
  },
  timber: {
    name: "Timber",
    hexColor: "#9A6A3A",
    hatch: "timber",
    label: "Vertical timber boarding",
  },
  clapboard: {
    name: "Clapboard",
    hexColor: "#D8C4AE",
    hatch: "clapboard",
    label: "Horizontal weatherboarding",
  },
  concrete: {
    name: "Concrete",
    hexColor: "#B9BCC1",
    hatch: "concrete",
    label: "Cast concrete",
  },
  metal: {
    name: "Metal",
    hexColor: "#7A8088",
    hatch: "metal",
    label: "Standing seam metal",
  },
  zinc: {
    name: "Zinc",
    hexColor: "#707884",
    hatch: "metal",
    label: "Zinc sheet cladding",
  },
  slate: {
    name: "Slate",
    hexColor: "#5F6670",
    hatch: "slate",
    label: "Slate roofing",
  },
  tile: {
    name: "Clay Tile",
    hexColor: "#A95C45",
    hatch: "tile",
    label: "Clay roof tiles",
  },
  glass: {
    name: "Glass",
    hexColor: "#9BC7D8",
    hatch: "glass",
    label: "Clear glazing",
  },
  plaster: {
    name: "Plaster",
    hexColor: "#F2EDE4",
    hatch: "render",
    label: "Internal plaster",
  },
};

function fallbackMaterial(role = "primary") {
  if (role === "roof") return "slate";
  if (role === "glazing") return "glass";
  if (role === "trim") return "metal";
  if (role === "secondary") return "timber";
  return "brick";
}

function cleanText(value) {
  return String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function titleCase(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function detectMaterialKey(...candidates) {
  const haystack = candidates
    .flat(Infinity)
    .filter(Boolean)
    .map((entry) => cleanText(entry).toLowerCase())
    .join(" ");

  if (!haystack) {
    return null;
  }

  const rules = [
    ["clapboard", ["clapboard", "weatherboard", "weather boarding"]],
    ["brick", ["brick", "masonry"]],
    ["stone", ["stone", "limestone", "granite"]],
    ["render", ["render", "stucco", "plaster"]],
    ["timber", ["timber", "wood", "cedar", "oak"]],
    ["concrete", ["concrete", "precast"]],
    ["zinc", ["zinc"]],
    ["metal", ["metal", "aluminium", "aluminum", "steel"]],
    ["slate", ["slate"]],
    ["tile", ["tile", "terracotta", "clay"]],
    ["glass", ["glass", "glazing"]],
  ];

  for (const [materialKey, tokens] of rules) {
    if (tokens.some((token) => haystack.includes(token))) {
      return materialKey;
    }
  }

  return null;
}

function createMaterialEntry(role, materialKey, input = {}) {
  const libraryEntry = MATERIAL_LIBRARY[materialKey] || MATERIAL_LIBRARY.brick;
  const rawName =
    input.name || input.type || input.material || libraryEntry.name;

  return {
    role,
    key: materialKey,
    name: titleCase(rawName),
    hexColor: input.hexColor || input.color || libraryEntry.hexColor,
    hatch: input.hatch || libraryEntry.hatch,
    application: input.application || input.coverage || role,
    label: input.label || libraryEntry.label,
    source:
      input.source ||
      (Array.isArray(input._sourceHints) ? input._sourceHints[0] : "default"),
  };
}

function normalizeMaterialInputs(
  dna = {},
  projectGeometry = {},
  facadeGrammar = {},
) {
  const dnaMaterials = Array.isArray(dna?.materials)
    ? dna.materials
    : Object.values(dna?.materials || {});
  const facadeMaterialZones = [
    ...(facadeGrammar?.material_zones || []),
    ...((facadeGrammar?.orientations || []).flatMap(
      (orientation) => orientation?.material_zones || [],
    ) || []),
  ];
  const geometryMaterials = [
    ...(projectGeometry?.metadata?.material_palette?.entries || []),
    ...(projectGeometry?.metadata?.materialPalette?.entries || []),
    ...(projectGeometry?.metadata?.facade_materials || []),
  ];

  return [...dnaMaterials, ...facadeMaterialZones, ...geometryMaterials]
    .filter(Boolean)
    .map((entry) =>
      typeof entry === "string"
        ? {
            name: entry,
            source: "dna",
          }
        : entry,
    );
}

function findMaterialForRole(inputs = [], role = "primary") {
  const roleTokens = {
    primary: ["primary", "facade", "wall", "exterior", "cladding"],
    secondary: ["secondary", "accent", "feature", "screen", "porch"],
    roof: ["roof", "parapet"],
    trim: ["trim", "frame", "sill", "lintel", "balcony"],
    glazing: ["glazing", "glass", "window"],
  };

  const preferred = inputs.find((entry) => {
    const haystack = cleanText(
      [
        entry?.role,
        entry?.application,
        entry?.coverage,
        entry?.name,
        entry?.type,
      ].join(" "),
    ).toLowerCase();
    return roleTokens[role].some((token) => haystack.includes(token));
  });

  const fallback =
    preferred ||
    inputs.find((entry) => detectMaterialKey(entry?.name, entry?.type));
  const materialKey =
    detectMaterialKey(
      preferred?.name,
      preferred?.type,
      preferred?.application,
      preferred?.coverage,
    ) ||
    detectMaterialKey(
      fallback?.name,
      fallback?.type,
      fallback?.application,
      fallback?.coverage,
    ) ||
    fallbackMaterial(role);

  return createMaterialEntry(role, materialKey, {
    ...(preferred || fallback || {}),
    _sourceHints: [preferred?.source, fallback?.source].filter(Boolean),
  });
}

function deriveFacadeLanguage(dna = {}, facadeGrammar = {}) {
  return (
    facadeGrammar?.style_bridge?.facade_language ||
    dna?.facade_language ||
    dna?._structured?.style?.facade_language ||
    "ordered facade articulation"
  );
}

export function getCanonicalMaterialPalette({
  dna = {},
  projectGeometry = {},
  facadeGrammar = {},
} = {}) {
  const inputs = normalizeMaterialInputs(dna, projectGeometry, facadeGrammar);
  const entries = [
    findMaterialForRole(inputs, "primary"),
    findMaterialForRole(inputs, "secondary"),
    findMaterialForRole(inputs, "roof"),
    findMaterialForRole(inputs, "trim"),
    findMaterialForRole(inputs, "glazing"),
  ];

  return {
    version: "phase8-canonical-material-palette-v1",
    enabled: isFeatureEnabled("useCanonicalMaterialPaletteSSOT"),
    entries,
    primary: entries[0],
    secondary: entries[1],
    roof: entries[2],
    trim: entries[3],
    glazing: entries[4],
    facadeLanguage: deriveFacadeLanguage(dna, facadeGrammar),
    summary: entries
      .map(
        (entry) =>
          `${entry.role}: ${entry.name} ${entry.hexColor} (${entry.application})`,
      )
      .join("; "),
  };
}

export function buildMaterialSpecSheet({
  dna = {},
  projectGeometry = {},
  facadeGrammar = {},
} = {}) {
  const palette = getCanonicalMaterialPalette({
    dna,
    projectGeometry,
    facadeGrammar,
  });

  return {
    version: "phase8-material-spec-sheet-v1",
    palette,
    lines: palette.entries.map(
      (entry) =>
        `${entry.role.toUpperCase()}: ${entry.name} ${entry.hexColor} — ${entry.label}`,
    ),
    swatches: palette.entries.map((entry) => ({
      role: entry.role,
      name: entry.name,
      hexColor: entry.hexColor,
      hatch: entry.hatch,
      application: entry.application,
    })),
  };
}

export default {
  getCanonicalMaterialPalette,
  buildMaterialSpecSheet,
};

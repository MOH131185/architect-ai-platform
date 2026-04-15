export const FACADE_COMPONENT_LIBRARY = {
  default: {
    bay_family: "regular-bay",
    opening_family: "single-opening",
    shading_family: "slender-overhang",
    frame_family: "feature-frame",
    balcony_family: "balcony-placeholder",
    parapet_family: "plain-parapet",
  },
  rhythmic_openings_with_solid_masonry: {
    bay_family: "masonry-bay",
    opening_family: "paired-opening",
    shading_family: "deep-reveal",
    frame_family: "recessed-frame",
    balcony_family: "loggia-placeholder",
    parapet_family: "masonry-parapet",
  },
  climate_screened_modern: {
    bay_family: "screened-bay",
    opening_family: "grouped-horizontal",
    shading_family: "vertical-fins",
    frame_family: "thin-frame",
    balcony_family: "pergola-placeholder",
    parapet_family: "thin-metal-parapet",
  },
};

function normalizeKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function resolveFacadeComponentFamily(
  styleDNA = {},
  facadeOrientation = {},
) {
  const facadeLanguage = normalizeKey(
    styleDNA.facade_language || facadeOrientation.roofline_language || "",
  );
  return (
    FACADE_COMPONENT_LIBRARY[facadeLanguage] || FACADE_COMPONENT_LIBRARY.default
  );
}

export default {
  FACADE_COMPONENT_LIBRARY,
  resolveFacadeComponentFamily,
};

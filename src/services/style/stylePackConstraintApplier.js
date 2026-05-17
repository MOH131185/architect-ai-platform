import { computeStylePackHash } from "./stylePackExtractor.js";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBlank(value) {
  return value === null || value === undefined || value === "";
}

function round(value, precision = 4) {
  const factor = 10 ** precision;
  return Math.round(Number(value) * factor) / factor;
}

function clamp(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function mergeWindowToWallRatio(current, fromPack) {
  if (!isObject(fromPack)) return current;
  if (!isObject(current)) return { ...fromPack };
  return {
    overall: isBlank(current.overall) ? fromPack.overall : current.overall,
    byElevation: {
      ...(fromPack.byElevation || {}),
      ...(isObject(current.byElevation) ? current.byElevation : {}),
    },
  };
}

function mergeOpeningRhythm(current, fromPack) {
  if (!isObject(fromPack)) return current;
  return {
    ...fromPack,
    ...(isObject(current) ? current : {}),
  };
}

export function applyStylePackToBrief({ brief, stylePack } = {}) {
  if (!stylePack) return brief;
  const next = { ...(brief || {}) };
  const floorCount = stylePack.massingTendency?.floorCount || {};
  const floorCountLocked =
    next.floorCountLocked === true ||
    next.floor_count_locked === true ||
    next.request_authority?.floorCountLocked === true;

  if (!floorCountLocked) {
    if (isBlank(next.target_storeys)) {
      next.target_storeys = floorCount.mode;
    } else {
      next.target_storeys = Math.round(
        clamp(next.target_storeys, floorCount.min, floorCount.max),
      );
    }
  }

  const aspectRange = stylePack.massingTendency?.aspectRatioRange;
  if (Array.isArray(aspectRange) && aspectRange.length === 2) {
    if (isBlank(next.aspect_ratio_target)) {
      next.aspect_ratio_target = round(
        (aspectRange[0] + aspectRange[1]) / 2,
        3,
      );
    } else {
      next.aspect_ratio_target = round(
        clamp(next.aspect_ratio_target, aspectRange[0], aspectRange[1]),
        3,
      );
    }
  }

  if (isBlank(next.massing_form_preference)) {
    next.massing_form_preference = stylePack.massingTendency?.form || null;
  }
  if (isBlank(next.facade_module_mm)) {
    next.facade_module_mm = stylePack.facadeModule?.baySpacingMm || null;
  }
  if (isBlank(next.floor_height_mm)) {
    next.floor_height_mm = stylePack.facadeModule?.floorHeightMm || null;
  }
  if (isBlank(next.roof_pitch_dominant)) {
    next.roof_pitch_dominant =
      stylePack.roofPitchDistribution?.dominant || null;
  }
  next.window_to_wall_ratio_target = mergeWindowToWallRatio(
    next.window_to_wall_ratio_target,
    stylePack.windowToWallRatio,
  );
  next.opening_rhythm = mergeOpeningRhythm(
    next.opening_rhythm,
    stylePack.openingRhythm,
  );
  if (isBlank(next.preferred_layout_archetype) && stylePack.layout_archetype) {
    next.preferred_layout_archetype = stylePack.layout_archetype;
  }
  next.style_pack_hash = computeStylePackHash(stylePack);
  return next;
}

export function applyStylePackToMaterialPaletteInputs({
  inputs,
  stylePack,
} = {}) {
  if (!stylePack) return inputs;
  return {
    ...(inputs || {}),
    stylePackMaterialFamilies: stylePack.materialFamilies || null,
    stylePackConfidence: stylePack.provenance?.confidence ?? null,
  };
}

export function applyStylePackToOptionScorerWeights({
  weights,
  stylePack,
} = {}) {
  if (!stylePack) return weights;
  const next = { ...(weights || {}) };
  const climateDelta = Math.min(0.1, Number(next.climateFit || 0));
  const secondaryKey = Object.prototype.hasOwnProperty.call(next, "costFit")
    ? "costFit"
    : "regulationRisk";
  const secondaryDelta = Math.min(0.05, Number(next[secondaryKey] || 0));
  next.climateFit = round(Number(next.climateFit || 0) - climateDelta);
  next[secondaryKey] = round(Number(next[secondaryKey] || 0) - secondaryDelta);
  next.styleAlignment = round(
    Number(next.styleAlignment || 0) + climateDelta + secondaryDelta,
  );
  return next;
}

export default {
  applyStylePackToBrief,
  applyStylePackToMaterialPaletteInputs,
  applyStylePackToOptionScorerWeights,
};

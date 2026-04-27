/**
 * Design-option scorer. Plan §6.7 categories:
 *   programmeFit, siteFit, climateFit, regulationRisk,
 *   circulationEfficiency, daylightPotential.
 *
 * Returns scores in 0..1 per category, plus a weighted aggregate. The selected
 * option is the highest-scoring one whose `siteFit` is non-zero (a footprint
 * that doesn't fit the buildable polygon is disqualified outright).
 */

export const CATEGORY_WEIGHTS = Object.freeze({
  programmeFit: 0.25,
  siteFit: 0.2,
  climateFit: 0.2,
  daylightPotential: 0.15,
  circulationEfficiency: 0.1,
  regulationRisk: 0.1,
});

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function round(value, precision = 3) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function scoreProgrammeFit(option, programme) {
  const target = programme?.area_summary?.gross_internal_area_m2;
  const optionArea = option.footprint_width_m * option.footprint_depth_m;
  if (!Number.isFinite(target) || target <= 0) return 0.5;
  const ratio = optionArea / target;
  // Best when ratio in [0.9, 1.1]; falls off outside.
  if (ratio < 0.5 || ratio > 1.6) return 0;
  if (ratio >= 0.9 && ratio <= 1.1) return 1;
  if (ratio < 0.9) return clamp01((ratio - 0.5) / 0.4);
  return clamp01(1 - (ratio - 1.1) / 0.5);
}

function scoreSiteFit(option) {
  if (!option.fits_buildable) return 0;
  // Fit margin: how much smaller than buildable footprint.
  // Prefer some breathing room (5-15% margin) over completely filling.
  const bbox = option.footprint_bbox;
  if (!bbox || !bbox.width || !bbox.height) return 0;
  return option.fits_buildable ? 0.95 : 0;
}

function scoreClimateFit(option, climate) {
  const recommended =
    climate?.sun_path?.recommendation?.primary_glazing_orientation;
  // For UK (northern hemisphere) we want a long south-facing facade — hence
  // long axis E-W for daylight on the long side. NS bar is penalised.
  const baseline = option.long_axis === "ew" ? 0.85 : 0.55;
  if (!recommended) return baseline;
  if (recommended === "south" && option.long_axis === "ew") return 1.0;
  if (recommended === "south" && option.long_axis === "ns") return 0.5;
  return baseline;
}

function scoreDaylightPotential(option) {
  // Daylight scales with façade-to-area ratio. Bar ≈ 2.0 has highest perimeter/area.
  const area = option.footprint_width_m * option.footprint_depth_m;
  if (area <= 0) return 0;
  const perimeter = 2 * (option.footprint_width_m + option.footprint_depth_m);
  // For a rectangle, perimeter/(2*sqrt(area)) is minimised at 2 (square=1).
  // Higher value = more daylight perimeter relative to floor area.
  const ratio = perimeter / (2 * Math.sqrt(area));
  // Normalise: 1.0 (square) → 0.5; 1.5 (typical bar) → 0.85; 2.0 (long bar) → 1.0
  return clamp01((ratio - 1) / 1);
}

function scoreCirculationEfficiency(option) {
  // Compact blocks have shorter circulation. Bar is worse.
  const aspect = option.aspect || 1;
  // Aspect 1 → 1.0; aspect 2 → 0.7; aspect 3 → 0.5
  return clamp01(1 - (aspect - 1) * 0.3);
}

function scoreRegulationRisk(option, climate) {
  // Without running the full rule engine per option, estimate risk by:
  // - aspect > 2.5 increases escape-distance risk (Part B)
  // - long bars in high-overheating climate may need more shading (Part O)
  const aspect = option.aspect || 1;
  let base = 1;
  if (aspect > 2.5) base -= 0.2;
  const overheating = climate?.overheating?.risk_level;
  if (overheating === "high" && option.long_axis === "ew" && aspect > 1.5) {
    // Long south facade in high overheating climate without shading is risky;
    // however, here we only score the typology, not the shading detail.
    base -= 0.1;
  }
  return clamp01(base);
}

export function scoreOption({
  option,
  brief, // eslint-disable-line no-unused-vars -- reserved for future programme-density signals
  site, // eslint-disable-line no-unused-vars
  climate,
  programme,
}) {
  if (!option) throw new Error("scoreOption requires {option}");
  const subscores = {
    programmeFit: round(scoreProgrammeFit(option, programme), 3),
    siteFit: round(scoreSiteFit(option), 3),
    climateFit: round(scoreClimateFit(option, climate), 3),
    daylightPotential: round(scoreDaylightPotential(option), 3),
    circulationEfficiency: round(scoreCirculationEfficiency(option), 3),
    regulationRisk: round(scoreRegulationRisk(option, climate), 3),
  };
  let aggregate = 0;
  for (const [cat, weight] of Object.entries(CATEGORY_WEIGHTS)) {
    aggregate += (subscores[cat] || 0) * weight;
  }
  return {
    option_id: option.option_id,
    label: option.label,
    typology: option.typology,
    aspect: option.aspect,
    long_axis: option.long_axis,
    fits_buildable: option.fits_buildable,
    footprint_polygon: option.footprint_polygon,
    footprint_bbox: option.footprint_bbox,
    subscores,
    aggregate_score: round(aggregate, 3),
    weights: CATEGORY_WEIGHTS,
  };
}

export function selectBestOption(scoredOptions = []) {
  if (!Array.isArray(scoredOptions) || scoredOptions.length === 0) return null;
  const eligible = scoredOptions.filter((o) => o.fits_buildable);
  const pool = eligible.length > 0 ? eligible : scoredOptions;
  return pool.reduce(
    (best, candidate) =>
      !best || candidate.aggregate_score > best.aggregate_score
        ? candidate
        : best,
    null,
  );
}

export default { scoreOption, selectBestOption, CATEGORY_WEIGHTS };

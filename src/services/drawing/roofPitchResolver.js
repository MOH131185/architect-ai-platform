function finitePositive(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function firstArray(...candidates) {
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) {
      return candidate;
    }
  }
  return [];
}

function pitchFromEntry(entry = {}, sourcePrefix = "roof") {
  const fields = [
    ["slope_deg", entry.slope_deg],
    ["slopeDeg", entry.slopeDeg],
    ["pitch_deg", entry.pitch_deg],
    ["pitchDegrees", entry.pitchDegrees],
    ["pitch_degrees", entry.pitch_degrees],
  ];
  for (const [field, value] of fields) {
    const pitchDeg = finitePositive(value);
    if (pitchDeg != null) {
      return {
        pitchDeg,
        source: `${sourcePrefix}.${field}`,
        status: "resolved",
      };
    }
  }
  return null;
}

export function isFlatRoofLanguage(roofLanguage = "") {
  const normalized = String(roofLanguage || "").toLowerCase();
  return normalized.includes("flat") || normalized.includes("parapet");
}

export function computeRoofRiseMeters(spanM, pitchDeg) {
  const numericSpan = Number(spanM);
  const numericPitch = Number(pitchDeg);
  if (
    !Number.isFinite(numericSpan) ||
    numericSpan <= 0 ||
    !Number.isFinite(numericPitch) ||
    numericPitch <= 0
  ) {
    return null;
  }
  return (numericSpan / 2) * Math.tan((numericPitch * Math.PI) / 180);
}

export function resolveCanonicalRoofPitch(geometry = {}, options = {}) {
  if (isFlatRoofLanguage(options.roofLanguage)) {
    return {
      pitchDeg: null,
      source: null,
      status: "flat",
    };
  }

  const roofPrimitives = firstArray(
    geometry.roof_primitives,
    geometry.roofPrimitives,
    geometry.roofElements,
  );
  for (const primitive of roofPrimitives) {
    const resolved = pitchFromEntry(primitive, "roof_primitives");
    if (resolved) return resolved;
  }

  const roofPlanes = firstArray(
    geometry.roof?.planes,
    geometry.roof?.roofPlanes,
  );
  for (const plane of roofPlanes) {
    const resolved = pitchFromEntry(plane, "roof.planes");
    if (resolved) return resolved;
  }

  const geometryRulesPitch = finitePositive(
    geometry.metadata?.geometry_rules?.roof_pitch_degrees,
  );
  if (geometryRulesPitch != null) {
    return {
      pitchDeg: geometryRulesPitch,
      source: "metadata.geometry_rules.roof_pitch_degrees",
      status: "resolved",
    };
  }

  const canonicalRoof = geometry.metadata?.canonical_construction_truth?.roof;
  const canonicalPitch = finitePositive(
    canonicalRoof?.pitch_deg ??
      canonicalRoof?.pitch_degrees ??
      canonicalRoof?.slope_deg,
  );
  if (canonicalPitch != null) {
    return {
      pitchDeg: canonicalPitch,
      source: "metadata.canonical_construction_truth.roof",
      status: "resolved",
    };
  }

  const explicitRoofPitch = finitePositive(
    geometry.roof?.pitch_deg ?? geometry.roof?.pitchDegrees,
  );
  if (explicitRoofPitch != null) {
    return {
      pitchDeg: explicitRoofPitch,
      source: "roof.pitch_deg",
      status: "resolved",
    };
  }

  return {
    pitchDeg: null,
    source: null,
    status: "missing",
  };
}

export function buildCanonicalRoofPitchInfo(geometry = {}, options = {}) {
  const resolved = resolveCanonicalRoofPitch(geometry, options);
  const spanM = Number(options.spanM);
  const riseM = computeRoofRiseMeters(spanM, resolved.pitchDeg);
  return {
    ...resolved,
    spanM: Number.isFinite(spanM) && spanM > 0 ? spanM : null,
    riseM,
  };
}

import stylePackSchemaJson from "./stylePack.schema.json" with { type: "json" };

export const STYLE_PACK_SCHEMA = Object.freeze(stylePackSchemaJson);
export const STYLE_PACK_VERSION = "1.0.0";
export const EMPTY_STYLE_PACK = null;

const TOP_LEVEL_KEYS = new Set([
  "version",
  "windowToWallRatio",
  "roofPitchDistribution",
  "openingRhythm",
  "materialFamilies",
  "massingTendency",
  "facadeModule",
  "layout_archetype",
  "provenance",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addError(errors, path, message) {
  errors.push({ path, message });
}

function validateNumber(errors, path, value, min, max, integer = false) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addError(errors, path, "must be a finite number");
    return;
  }
  if (integer && !Number.isInteger(value)) {
    addError(errors, path, "must be an integer");
  }
  if (value < min || value > max) {
    addError(errors, path, `must be between ${min} and ${max}`);
  }
}

function validateStringArray(errors, path, value, { min = 0, max = Infinity }) {
  if (!Array.isArray(value)) {
    addError(errors, path, "must be an array");
    return;
  }
  if (value.length < min || value.length > max) {
    addError(errors, path, `must contain between ${min} and ${max} items`);
  }
  value.forEach((entry, index) => {
    if (typeof entry !== "string") {
      addError(errors, `${path}/${index}`, "must be a string");
    }
  });
}

function validateEnum(errors, path, value, allowed) {
  if (!allowed.includes(value)) {
    addError(errors, path, `must be one of ${allowed.join(", ")}`);
  }
}

export function validateStylePack(pack) {
  const errors = [];
  if (!isObject(pack)) {
    return {
      valid: false,
      errors: [{ path: "", message: "Style Pack must be an object" }],
    };
  }

  for (const key of Object.keys(pack)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      addError(errors, `/${key}`, "is not allowed");
    }
  }
  for (const key of TOP_LEVEL_KEYS) {
    if (!(key in pack)) {
      addError(errors, `/${key}`, "is required");
    }
  }

  if (pack.version !== STYLE_PACK_VERSION) {
    addError(errors, "/version", `must be ${STYLE_PACK_VERSION}`);
  }

  const wwr = pack.windowToWallRatio;
  if (!isObject(wwr)) {
    addError(errors, "/windowToWallRatio", "must be an object");
  } else {
    validateNumber(errors, "/windowToWallRatio/overall", wwr.overall, 0, 0.95);
    const byElevation = wwr.byElevation;
    if (!isObject(byElevation)) {
      addError(errors, "/windowToWallRatio/byElevation", "must be an object");
    } else {
      ["N", "S", "E", "W"].forEach((key) =>
        validateNumber(
          errors,
          `/windowToWallRatio/byElevation/${key}`,
          byElevation[key],
          0,
          0.95,
        ),
      );
    }
  }

  const roof = pack.roofPitchDistribution;
  if (!isObject(roof)) {
    addError(errors, "/roofPitchDistribution", "must be an object");
  } else {
    ["flatPct", "lowPct", "mediumPct", "steepPct"].forEach((key) =>
      validateNumber(errors, `/roofPitchDistribution/${key}`, roof[key], 0, 1),
    );
    validateEnum(errors, "/roofPitchDistribution/dominant", roof.dominant, [
      "flat",
      "low",
      "medium",
      "steep",
    ]);
  }

  const rhythm = pack.openingRhythm;
  if (!isObject(rhythm)) {
    addError(errors, "/openingRhythm", "must be an object");
  } else {
    validateNumber(
      errors,
      "/openingRhythm/moduleMm",
      rhythm.moduleMm,
      600,
      6000,
      true,
    );
    validateEnum(errors, "/openingRhythm/repetition", rhythm.repetition, [
      "regular",
      "asymmetric",
      "paired",
    ]);
    validateNumber(
      errors,
      "/openingRhythm/sillHeightMm",
      rhythm.sillHeightMm,
      0,
      2200,
      true,
    );
  }

  const materials = pack.materialFamilies;
  if (!isObject(materials)) {
    addError(errors, "/materialFamilies", "must be an object");
  } else {
    validateStringArray(
      errors,
      "/materialFamilies/primary",
      materials.primary,
      {
        min: 1,
        max: 4,
      },
    );
    validateStringArray(
      errors,
      "/materialFamilies/secondary",
      materials.secondary,
      { max: 6 },
    );
    validateStringArray(
      errors,
      "/materialFamilies/accents",
      materials.accents,
      {
        max: 6,
      },
    );
  }

  const massing = pack.massingTendency;
  if (!isObject(massing)) {
    addError(errors, "/massingTendency", "must be an object");
  } else {
    validateEnum(errors, "/massingTendency/form", massing.form, [
      "compact",
      "L",
      "U",
      "courtyard",
      "articulated",
    ]);
    const floorCount = massing.floorCount;
    if (!isObject(floorCount)) {
      addError(errors, "/massingTendency/floorCount", "must be an object");
    } else {
      ["min", "mode", "max"].forEach((key) =>
        validateNumber(
          errors,
          `/massingTendency/floorCount/${key}`,
          floorCount[key],
          1,
          12,
          true,
        ),
      );
      if (
        Number.isInteger(floorCount.min) &&
        Number.isInteger(floorCount.mode) &&
        Number.isInteger(floorCount.max) &&
        !(
          floorCount.min <= floorCount.mode && floorCount.mode <= floorCount.max
        )
      ) {
        addError(
          errors,
          "/massingTendency/floorCount",
          "must satisfy min <= mode <= max",
        );
      }
    }
    const range = massing.aspectRatioRange;
    if (!Array.isArray(range) || range.length !== 2) {
      addError(
        errors,
        "/massingTendency/aspectRatioRange",
        "must contain two numbers",
      );
    } else {
      validateNumber(
        errors,
        "/massingTendency/aspectRatioRange/0",
        range[0],
        0.2,
        6,
      );
      validateNumber(
        errors,
        "/massingTendency/aspectRatioRange/1",
        range[1],
        0.2,
        6,
      );
      if (Number(range[0]) > Number(range[1])) {
        addError(
          errors,
          "/massingTendency/aspectRatioRange",
          "must be ascending",
        );
      }
    }
  }

  const facade = pack.facadeModule;
  if (!isObject(facade)) {
    addError(errors, "/facadeModule", "must be an object");
  } else {
    validateNumber(
      errors,
      "/facadeModule/baySpacingMm",
      facade.baySpacingMm,
      1200,
      9000,
      true,
    );
    validateNumber(
      errors,
      "/facadeModule/floorHeightMm",
      facade.floorHeightMm,
      2400,
      4500,
      true,
    );
  }

  if (
    pack.layout_archetype !== null &&
    typeof pack.layout_archetype !== "string"
  ) {
    addError(errors, "/layout_archetype", "must be a string or null");
  }

  const provenance = pack.provenance;
  if (!isObject(provenance)) {
    addError(errors, "/provenance", "must be an object");
  } else {
    validateStringArray(
      errors,
      "/provenance/sourceFiles",
      provenance.sourceFiles,
      {
        max: Infinity,
      },
    );
    if (
      typeof provenance.extractedAt !== "string" ||
      Number.isNaN(Date.parse(provenance.extractedAt))
    ) {
      addError(
        errors,
        "/provenance/extractedAt",
        "must be an ISO date-time string",
      );
    }
    if (typeof provenance.extractorVersion !== "string") {
      addError(errors, "/provenance/extractorVersion", "must be a string");
    }
    validateNumber(
      errors,
      "/provenance/confidence",
      provenance.confidence,
      0,
      1,
    );
    if (
      typeof provenance.seed !== "string" ||
      !/^[a-f0-9]{64}$/.test(provenance.seed)
    ) {
      addError(
        errors,
        "/provenance/seed",
        "must be a 64-character lowercase hex SHA-256",
      );
    }
    if (provenance.evidence !== undefined && !isObject(provenance.evidence)) {
      addError(errors, "/provenance/evidence", "must be an object");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  STYLE_PACK_SCHEMA,
  STYLE_PACK_VERSION,
  EMPTY_STYLE_PACK,
  validateStylePack,
};

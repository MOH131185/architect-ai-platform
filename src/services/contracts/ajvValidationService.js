import {
  getJsonSchemaRegistration,
  listRegisteredSchemas,
} from "./jsonSchemaRegistry.js";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function escapeJsonPointerSegment(value = "") {
  return String(value).replaceAll("~", "~0").replaceAll("/", "~1");
}

function joinInstancePath(base, segment) {
  return `${base}/${escapeJsonPointerSegment(segment)}`;
}

function joinSchemaPath(base, segment) {
  return `${base}/${escapeJsonPointerSegment(segment)}`;
}

function valueMatchesType(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return isPlainObject(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number")
    return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  return typeof value === type;
}

function pushError(
  errors,
  instancePath,
  schemaPath,
  keyword,
  message,
  params = {},
) {
  errors.push({
    instancePath,
    schemaPath,
    keyword,
    params,
    message,
  });
}

function validateRequired(schema, value, instancePath, schemaPath, errors) {
  if (!isPlainObject(value) || !Array.isArray(schema.required)) return;
  schema.required.forEach((property) => {
    if (value[property] === undefined) {
      pushError(
        errors,
        instancePath,
        joinSchemaPath(schemaPath, "required"),
        "required",
        `must have required property "${property}"`,
        { missingProperty: property },
      );
    }
  });
}

function validateString(schema, value, instancePath, schemaPath, errors) {
  if (typeof value !== "string") return;
  if (
    Number.isFinite(schema.minLength) &&
    value.length < Number(schema.minLength)
  ) {
    pushError(
      errors,
      instancePath,
      joinSchemaPath(schemaPath, "minLength"),
      "minLength",
      `must NOT have fewer than ${schema.minLength} characters`,
      { limit: schema.minLength },
    );
  }
  if (
    Number.isFinite(schema.maxLength) &&
    value.length > Number(schema.maxLength)
  ) {
    pushError(
      errors,
      instancePath,
      joinSchemaPath(schemaPath, "maxLength"),
      "maxLength",
      `must NOT have more than ${schema.maxLength} characters`,
      { limit: schema.maxLength },
    );
  }
  if (schema.pattern) {
    const regex = new RegExp(schema.pattern);
    if (!regex.test(value)) {
      pushError(
        errors,
        instancePath,
        joinSchemaPath(schemaPath, "pattern"),
        "pattern",
        `must match pattern "${schema.pattern}"`,
        { pattern: schema.pattern },
      );
    }
  }
}

function validateNumber(schema, value, instancePath, schemaPath, errors) {
  if (typeof value !== "number" || !Number.isFinite(value)) return;
  if (Number.isFinite(schema.minimum) && value < Number(schema.minimum)) {
    pushError(
      errors,
      instancePath,
      joinSchemaPath(schemaPath, "minimum"),
      "minimum",
      `must be >= ${schema.minimum}`,
      { comparison: ">=", limit: schema.minimum },
    );
  }
  if (Number.isFinite(schema.maximum) && value > Number(schema.maximum)) {
    pushError(
      errors,
      instancePath,
      joinSchemaPath(schemaPath, "maximum"),
      "maximum",
      `must be <= ${schema.maximum}`,
      { comparison: "<=", limit: schema.maximum },
    );
  }
}

function validateArray(schema, value, instancePath, schemaPath, errors, state) {
  if (!Array.isArray(value)) return;
  if (
    Number.isFinite(schema.minItems) &&
    value.length < Number(schema.minItems)
  ) {
    pushError(
      errors,
      instancePath,
      joinSchemaPath(schemaPath, "minItems"),
      "minItems",
      `must NOT have fewer than ${schema.minItems} items`,
      { limit: schema.minItems },
    );
  }
  if (
    Number.isFinite(schema.maxItems) &&
    value.length > Number(schema.maxItems)
  ) {
    pushError(
      errors,
      instancePath,
      joinSchemaPath(schemaPath, "maxItems"),
      "maxItems",
      `must NOT have more than ${schema.maxItems} items`,
      { limit: schema.maxItems },
    );
  }
  value.forEach((item, index) => {
    validateSchemaNode(
      schema.items,
      item,
      joinInstancePath(instancePath, index),
      joinSchemaPath(schemaPath, "items"),
      errors,
      state,
    );
  });
}

function validateAdditionalProperties(
  schema,
  value,
  instancePath,
  schemaPath,
  errors,
  state,
) {
  if (!isPlainObject(value) || schema.additionalProperties !== false) {
    return;
  }
  const knownProperties = new Set(Object.keys(schema.properties || {}));
  Object.keys(value).forEach((property) => {
    if (knownProperties.has(property)) return;
    pushError(
      errors,
      joinInstancePath(instancePath, property),
      joinSchemaPath(schemaPath, "additionalProperties"),
      "additionalProperties",
      "must NOT have additional properties",
      { additionalProperty: property },
    );
  });
}

function validateObject(
  schema,
  value,
  instancePath,
  schemaPath,
  errors,
  state,
) {
  if (!isPlainObject(value)) return;
  if (
    Number.isFinite(schema.minProperties) &&
    Object.keys(value).length < Number(schema.minProperties)
  ) {
    pushError(
      errors,
      instancePath,
      joinSchemaPath(schemaPath, "minProperties"),
      "minProperties",
      `must NOT have fewer than ${schema.minProperties} properties`,
      { limit: schema.minProperties },
    );
  }
  validateRequired(schema, value, instancePath, schemaPath, errors);
  Object.entries(schema.properties || {}).forEach(
    ([property, propertySchema]) => {
      if (value[property] === undefined) return;
      validateSchemaNode(
        propertySchema,
        value[property],
        joinInstancePath(instancePath, property),
        joinSchemaPath(schemaPath, `properties/${property}`),
        errors,
        state,
      );
    },
  );
  validateAdditionalProperties(
    schema,
    value,
    instancePath,
    schemaPath,
    errors,
    state,
  );
}

function validateCombinators(
  schema,
  value,
  instancePath,
  schemaPath,
  errors,
  state,
) {
  if (Array.isArray(schema.allOf)) {
    schema.allOf.forEach((entry, index) => {
      validateSchemaNode(
        entry,
        value,
        instancePath,
        joinSchemaPath(schemaPath, `allOf/${index}`),
        errors,
        state,
      );
    });
  }

  if (Array.isArray(schema.anyOf)) {
    let bestNestedErrors = null;
    const passing = schema.anyOf.some((entry, index) => {
      const nestedErrors = [];
      validateSchemaNode(
        entry,
        value,
        instancePath,
        joinSchemaPath(schemaPath, `anyOf/${index}`),
        nestedErrors,
        state,
      );
      if (!bestNestedErrors || nestedErrors.length < bestNestedErrors.length) {
        bestNestedErrors = nestedErrors;
      }
      return nestedErrors.length === 0;
    });
    if (!passing) {
      pushError(
        errors,
        instancePath,
        joinSchemaPath(schemaPath, "anyOf"),
        "anyOf",
        "must match at least one allowed schema",
      );
      (bestNestedErrors || []).forEach((entry) => {
        errors.push(entry);
      });
    }
  }

  if (Array.isArray(schema.oneOf)) {
    let passingCount = 0;
    let bestNestedErrors = null;
    schema.oneOf.forEach((entry, index) => {
      const nestedErrors = [];
      validateSchemaNode(
        entry,
        value,
        instancePath,
        joinSchemaPath(schemaPath, `oneOf/${index}`),
        nestedErrors,
        state,
      );
      if (!bestNestedErrors || nestedErrors.length < bestNestedErrors.length) {
        bestNestedErrors = nestedErrors;
      }
      if (!nestedErrors.length) {
        passingCount += 1;
      }
    });
    if (passingCount !== 1) {
      pushError(
        errors,
        instancePath,
        joinSchemaPath(schemaPath, "oneOf"),
        "oneOf",
        "must match exactly one allowed schema",
        { passingSchemas: passingCount },
      );
      if (passingCount === 0) {
        (bestNestedErrors || []).forEach((entry) => {
          errors.push(entry);
        });
      }
    }
  }
}

function dedupeErrors(errors = []) {
  const seen = new Set();
  return errors.filter((entry) => {
    const key = JSON.stringify([
      entry.instancePath,
      entry.schemaPath,
      entry.keyword,
      entry.message,
    ]);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function validateType(schema, value, instancePath, schemaPath, errors) {
  if (!schema.type) return true;
  const allowedTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
  const matches = allowedTypes.some((type) => valueMatchesType(value, type));
  if (!matches) {
    pushError(
      errors,
      instancePath,
      joinSchemaPath(schemaPath, "type"),
      "type",
      `must be ${allowedTypes.join(" or ")}`,
      { type: allowedTypes },
    );
  }
  return matches;
}

function validateEnumConst(schema, value, instancePath, schemaPath, errors) {
  if (schema.const !== undefined && value !== schema.const) {
    pushError(
      errors,
      instancePath,
      joinSchemaPath(schemaPath, "const"),
      "const",
      `must be equal to constant "${schema.const}"`,
      { allowedValue: schema.const },
    );
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    pushError(
      errors,
      instancePath,
      joinSchemaPath(schemaPath, "enum"),
      "enum",
      `must be equal to one of the allowed values`,
      { allowedValues: schema.enum },
    );
  }
}

function validateSchemaNode(
  schema,
  value,
  instancePath,
  schemaPath,
  errors,
  state,
) {
  if (!schema) return;
  validateCombinators(schema, value, instancePath, schemaPath, errors, state);
  validateEnumConst(schema, value, instancePath, schemaPath, errors);
  const typeMatches = validateType(
    schema,
    value,
    instancePath,
    schemaPath,
    errors,
  );
  if (schema.type && !typeMatches) {
    return;
  }
  validateObject(schema, value, instancePath, schemaPath, errors, state);
  validateArray(schema, value, instancePath, schemaPath, errors, state);
  validateString(schema, value, instancePath, schemaPath, errors);
  validateNumber(schema, value, instancePath, schemaPath, errors);
}

function collectDeprecationWarnings(registration, payload) {
  if (!isPlainObject(payload)) return [];
  return Object.entries(registration?.deprecatedProperties || {})
    .filter(([alias]) => Object.prototype.hasOwnProperty.call(payload, alias))
    .map(
      ([alias, canonical]) =>
        `"${alias}" is deprecated; use "${canonical}" instead.`,
    );
}

export function validateRegisteredSchema(schemaName, payload, options = {}) {
  const registration = getJsonSchemaRegistration(schemaName);
  if (!registration) {
    return {
      valid: false,
      errors: [
        {
          instancePath: "",
          schemaPath: "#/schema",
          keyword: "schema",
          params: { schemaName },
          message: `Unknown schema "${schemaName}"`,
        },
      ],
      warnings: [],
      schemaName,
      schemaVersion: null,
      publicApiVersion: null,
      schemaEngineVersion: null,
    };
  }

  const errors = [];
  validateSchemaNode(registration.schema, payload, "", "#", errors, {
    options,
  });

  const dedupedErrors = dedupeErrors(errors);

  return {
    valid: dedupedErrors.length === 0,
    errors: dedupedErrors,
    warnings: collectDeprecationWarnings(registration, payload),
    schemaName,
    schemaVersion: registration.schemaVersion,
    publicApiVersion: registration.publicApiVersion,
    schemaEngineVersion: registration.schemaEngineVersion,
  };
}

export function formatAjvStyleErrors(validation = {}) {
  return (validation.errors || []).map((entry) =>
    entry.instancePath
      ? `${entry.instancePath} ${entry.message}`.trim()
      : entry.message,
  );
}

export function getFormalSchemaValidationStatus() {
  return {
    version: "phase5-json-schema-validation-v1",
    schemaEngineVersion:
      getJsonSchemaRegistration("canonicalProjectGeometry")
        ?.schemaEngineVersion || null,
    schemas: listRegisteredSchemas(),
  };
}

export default {
  validateRegisteredSchema,
  formatAjvStyleErrors,
  getFormalSchemaValidationStatus,
};

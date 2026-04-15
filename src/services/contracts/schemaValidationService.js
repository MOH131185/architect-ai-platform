import {
  formatAjvStyleErrors,
  getFormalSchemaValidationStatus,
  validateRegisteredSchema,
} from "./ajvValidationService.js";

export function validateNamedSchema(schemaName, payload) {
  const validation = validateRegisteredSchema(schemaName, payload);
  return {
    valid: validation.valid,
    errors: formatAjvStyleErrors(validation),
    warnings: validation.warnings || [],
    schemaName: validation.schemaName,
    schemaVersion: validation.schemaVersion,
    publicApiVersion: validation.publicApiVersion,
    schemaEngineVersion: validation.schemaEngineVersion,
    issues: validation.errors || [],
  };
}

export function getSchemaValidationStatus() {
  return getFormalSchemaValidationStatus();
}

export default {
  validateNamedSchema,
  getSchemaValidationStatus,
};

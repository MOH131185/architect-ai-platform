/**
 * Design DNA Validators
 *
 * Provides runtime validation for Design DNA data structures.
 * Ensures data integrity and provides clear error messages.
 *
 * Version: 1.0.0
 * Last Updated: 2025-10-25
 *
 * @module domain/validators
 */

import { DNA_VERSION } from './dna.js';

/**
 * Validation result structure
 *
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {string[]} errors - Array of validation error messages
 * @property {string[]} warnings - Array of validation warnings
 */

/* ============================================================================
 * CORE VALIDATION UTILITIES
 * ========================================================================== */

/**
 * Check if a value exists (not null, not undefined)
 *
 * @param {*} value - Value to check
 * @returns {boolean}
 */
function exists(value) {
  return value !== null && value !== undefined;
}

/**
 * Check if a value is a non-empty string
 *
 * @param {*} value - Value to check
 * @returns {boolean}
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Check if a value is a number
 *
 * @param {*} value - Value to check
 * @returns {boolean}
 */
function isNumber(value) {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Check if a value is a boolean
 *
 * @param {*} value - Value to check
 * @returns {boolean}
 */
function isBoolean(value) {
  return typeof value === 'boolean';
}

/**
 * Check if a value is an object (not null, not array)
 *
 * @param {*} value - Value to check
 * @returns {boolean}
 */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if a value is an array
 *
 * @param {*} value - Value to check
 * @returns {boolean}
 */
// eslint-disable-next-line no-unused-vars
function isArray(value) {
  return Array.isArray(value);
}

/**
 * Check if a value is a valid ISO 8601 timestamp
 *
 * @param {*} value - Value to check
 * @returns {boolean}
 */
function isISOTimestamp(value) {
  if (!isNonEmptyString(value)) return false;
  const date = new Date(value);
  return !isNaN(date.getTime()) && value === date.toISOString();
}

/**
 * Create a validation result
 *
 * @param {boolean} valid - Whether validation passed
 * @param {string[]} errors - Validation errors
 * @param {string[]} warnings - Validation warnings
 * @returns {ValidationResult}
 */
function createValidationResult(valid, errors = [], warnings = []) {
  return { valid, errors, warnings };
}

/* ============================================================================
 * ENSURE GUARDS (THROW ON INVALID)
 * ========================================================================== */

/**
 * Ensure a condition is true, throw descriptive error if not
 *
 * @param {boolean} condition - Condition to check
 * @param {string} message - Error message if condition is false
 * @param {string} [code] - Error code (defaults to 'VALIDATION_ERROR')
 * @throws {Error} If condition is false
 */
export function ensure(condition, message, code = 'VALIDATION_ERROR') {
  if (!condition) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }
}

/**
 * Ensure a value exists (not null, not undefined)
 *
 * @param {*} value - Value to check
 * @param {string} fieldName - Field name for error message
 * @throws {Error} If value doesn't exist
 */
export function ensureExists(value, fieldName) {
  ensure(
    exists(value),
    `${fieldName} is required but was ${value === null ? 'null' : 'undefined'}`,
    'MISSING_REQUIRED_FIELD'
  );
}

/**
 * Ensure a value is a non-empty string
 *
 * @param {*} value - Value to check
 * @param {string} fieldName - Field name for error message
 * @throws {Error} If value is not a non-empty string
 */
export function ensureNonEmptyString(value, fieldName) {
  ensure(
    isNonEmptyString(value),
    `${fieldName} must be a non-empty string, got: ${typeof value}`,
    'INVALID_TYPE'
  );
}

/**
 * Ensure a value is a number
 *
 * @param {*} value - Value to check
 * @param {string} fieldName - Field name for error message
 * @throws {Error} If value is not a number
 */
export function ensureNumber(value, fieldName) {
  ensure(
    isNumber(value),
    `${fieldName} must be a number, got: ${typeof value}`,
    'INVALID_TYPE'
  );
}

/**
 * Ensure a value is an object
 *
 * @param {*} value - Value to check
 * @param {string} fieldName - Field name for error message
 * @throws {Error} If value is not an object
 */
export function ensureObject(value, fieldName) {
  ensure(
    isObject(value),
    `${fieldName} must be an object, got: ${typeof value}`,
    'INVALID_TYPE'
  );
}

/* ============================================================================
 * META & TELEMETRY VALIDATORS
 * ========================================================================== */

/**
 * Validate Meta object
 *
 * @param {*} meta - Meta object to validate
 * @param {string} [context] - Context for error messages
 * @returns {ValidationResult}
 */
export function validateMeta(meta, context = 'meta') {
  const errors = [];
  const warnings = [];

  if (!exists(meta)) {
    errors.push(`${context} is required`);
    return createValidationResult(false, errors, warnings);
  }

  if (!isObject(meta)) {
    errors.push(`${context} must be an object`);
    return createValidationResult(false, errors, warnings);
  }

  // Required fields
  if (!isNonEmptyString(meta.source)) {
    errors.push(`${context}.source must be a non-empty string`);
  }

  if (!isNumber(meta.latencyMs) || meta.latencyMs < 0) {
    errors.push(`${context}.latencyMs must be a non-negative number`);
  }

  if (!isISOTimestamp(meta.timestamp)) {
    errors.push(`${context}.timestamp must be a valid ISO 8601 timestamp`);
  }

  if (!isNonEmptyString(meta.dnaVersion)) {
    errors.push(`${context}.dnaVersion must be a non-empty string`);
  } else if (meta.dnaVersion !== DNA_VERSION) {
    warnings.push(`${context}.dnaVersion is ${meta.dnaVersion}, expected ${DNA_VERSION}`);
  }

  // Optional fields (validate if present)
  if (exists(meta.model) && !isNonEmptyString(meta.model)) {
    errors.push(`${context}.model must be a non-empty string if provided`);
  }

  if (exists(meta.costUsd) && (!isNumber(meta.costUsd) || meta.costUsd < 0)) {
    errors.push(`${context}.costUsd must be a non-negative number if provided`);
  }

  if (exists(meta.tokenUsage)) {
    if (!isObject(meta.tokenUsage)) {
      errors.push(`${context}.tokenUsage must be an object if provided`);
    } else {
      if (!isNumber(meta.tokenUsage.prompt) || meta.tokenUsage.prompt < 0) {
        errors.push(`${context}.tokenUsage.prompt must be a non-negative number`);
      }
      if (!isNumber(meta.tokenUsage.completion) || meta.tokenUsage.completion < 0) {
        errors.push(`${context}.tokenUsage.completion must be a non-negative number`);
      }
      if (!isNumber(meta.tokenUsage.total) || meta.tokenUsage.total < 0) {
        errors.push(`${context}.tokenUsage.total must be a non-negative number`);
      }
    }
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

/* ============================================================================
 * LOCATION PROFILE VALIDATORS
 * ========================================================================== */

/**
 * Validate Coordinates object
 *
 * @param {*} coords - Coordinates to validate
 * @param {string} [context] - Context for error messages
 * @returns {ValidationResult}
 */
export function validateCoordinates(coords, context = 'coordinates') {
  const errors = [];
  const warnings = [];

  if (!isObject(coords)) {
    errors.push(`${context} must be an object`);
    return createValidationResult(false, errors, warnings);
  }

  if (!isNumber(coords.lat) || coords.lat < -90 || coords.lat > 90) {
    errors.push(`${context}.lat must be a number between -90 and 90`);
  }

  if (!isNumber(coords.lng) || coords.lng < -180 || coords.lng > 180) {
    errors.push(`${context}.lng must be a number between -180 and 180`);
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

/**
 * Validate LocationProfile object
 *
 * @param {*} location - Location profile to validate
 * @returns {ValidationResult}
 */
export function validateLocationProfile(location) {
  const errors = [];
  const warnings = [];

  if (!isObject(location)) {
    errors.push('LocationProfile must be an object');
    return createValidationResult(false, errors, warnings);
  }

  // Required fields
  if (!isNonEmptyString(location.address)) {
    errors.push('LocationProfile.address must be a non-empty string');
  }

  // Validate nested coordinates
  const coordsResult = validateCoordinates(location.coordinates, 'LocationProfile.coordinates');
  errors.push(...coordsResult.errors);
  warnings.push(...coordsResult.warnings);

  // Climate and zoning are complex objects, just check they exist
  if (!isObject(location.climate)) {
    errors.push('LocationProfile.climate must be an object');
  }

  if (!isObject(location.zoning)) {
    errors.push('LocationProfile.zoning must be an object');
  }

  // Meta validation
  if (exists(location.meta)) {
    const metaResult = validateMeta(location.meta, 'LocationProfile.meta');
    errors.push(...metaResult.errors);
    warnings.push(...metaResult.warnings);
  }

  // isFallback flag
  if (!isBoolean(location.isFallback)) {
    warnings.push('LocationProfile.isFallback should be a boolean');
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

/* ============================================================================
 * DESIGN REASONING VALIDATORS
 * ========================================================================== */

/**
 * Validate DesignReasoning object
 *
 * @param {*} reasoning - Design reasoning to validate
 * @returns {ValidationResult}
 */
export function validateDesignReasoning(reasoning) {
  const errors = [];
  const warnings = [];

  if (!isObject(reasoning)) {
    errors.push('DesignReasoning must be an object');
    return createValidationResult(false, errors, warnings);
  }

  // Required fields (can be string or object, but must exist)
  if (!exists(reasoning.designPhilosophy)) {
    errors.push('DesignReasoning.designPhilosophy is required');
  }

  if (!exists(reasoning.spatialOrganization)) {
    errors.push('DesignReasoning.spatialOrganization is required');
  }

  if (!exists(reasoning.materialRecommendations)) {
    errors.push('DesignReasoning.materialRecommendations is required');
  }

  if (!exists(reasoning.environmentalConsiderations)) {
    errors.push('DesignReasoning.environmentalConsiderations is required');
  }

  // Meta validation
  if (exists(reasoning.meta)) {
    const metaResult = validateMeta(reasoning.meta, 'DesignReasoning.meta');
    errors.push(...metaResult.errors);
    warnings.push(...metaResult.warnings);
  } else {
    warnings.push('DesignReasoning.meta is recommended for telemetry tracking');
  }

  // isFallback flag
  if (!isBoolean(reasoning.isFallback)) {
    warnings.push('DesignReasoning.isFallback should be a boolean');
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

/* ============================================================================
 * VISUALIZATION VALIDATORS
 * ========================================================================== */

/**
 * Validate GeneratedImage object
 *
 * @param {*} image - Generated image to validate
 * @param {string} [context] - Context for error messages
 * @returns {ValidationResult}
 */
export function validateGeneratedImage(image, context = 'GeneratedImage') {
  const errors = [];
  const warnings = [];

  if (!isObject(image)) {
    errors.push(`${context} must be an object`);
    return createValidationResult(false, errors, warnings);
  }

  // Required: url
  if (!isNonEmptyString(image.url)) {
    errors.push(`${context}.url must be a non-empty string`);
  }

  // Recommended: viewType
  if (!isNonEmptyString(image.viewType)) {
    warnings.push(`${context}.viewType is recommended for identifying view`);
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

/**
 * Validate VisualizationResult object
 *
 * @param {*} visualizations - Visualization result to validate
 * @returns {ValidationResult}
 */
export function validateVisualizationResult(visualizations) {
  const errors = [];
  const warnings = [];

  if (!isObject(visualizations)) {
    errors.push('VisualizationResult must be an object');
    return createValidationResult(false, errors, warnings);
  }

  // Required: views object
  if (!isObject(visualizations.views)) {
    errors.push('VisualizationResult.views must be an object');
  } else {
    // Validate at least one view exists
    const viewCount = Object.keys(visualizations.views).length;
    if (viewCount === 0) {
      warnings.push('VisualizationResult.views is empty, expected at least one view');
    }

    // Validate each view image
    for (const [viewName, viewImage] of Object.entries(visualizations.views)) {
      if (exists(viewImage)) {
        const imageResult = validateGeneratedImage(
          viewImage,
          `VisualizationResult.views.${viewName}`
        );
        errors.push(...imageResult.errors);
        warnings.push(...imageResult.warnings);
      }
    }
  }

  // Meta validation
  if (exists(visualizations.meta)) {
    const metaResult = validateMeta(visualizations.meta, 'VisualizationResult.meta');
    errors.push(...metaResult.errors);
    warnings.push(...metaResult.warnings);
  } else {
    warnings.push('VisualizationResult.meta is recommended for telemetry tracking');
  }

  // isFallback flag
  if (!isBoolean(visualizations.isFallback)) {
    warnings.push('VisualizationResult.isFallback should be a boolean');
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

/* ============================================================================
 * DESIGN RESULT VALIDATORS
 * ========================================================================== */

/**
 * Validate complete DesignResult object
 *
 * @param {*} result - Design result to validate
 * @returns {ValidationResult}
 */
export function validateDesignResult(result) {
  const errors = [];
  const warnings = [];

  if (!isObject(result)) {
    errors.push('DesignResult must be an object');
    return createValidationResult(false, errors, warnings);
  }

  // Required: success flag
  if (!isBoolean(result.success)) {
    errors.push('DesignResult.success must be a boolean');
  }

  // If success is true, require reasoning and visualizations
  if (result.success === true) {
    if (!exists(result.reasoning)) {
      errors.push('DesignResult.reasoning is required when success is true');
    } else {
      const reasoningResult = validateDesignReasoning(result.reasoning);
      errors.push(...reasoningResult.errors);
      warnings.push(...reasoningResult.warnings);
    }

    if (!exists(result.visualizations)) {
      errors.push('DesignResult.visualizations is required when success is true');
    } else {
      const visResult = validateVisualizationResult(result.visualizations);
      errors.push(...visResult.errors);
      warnings.push(...visResult.warnings);
    }

    // Alternatives and feasibility are optional but recommended
    if (!exists(result.alternatives)) {
      warnings.push('DesignResult.alternatives is recommended for complete designs');
    }

    if (!exists(result.feasibility)) {
      warnings.push('DesignResult.feasibility is recommended for complete designs');
    }
  }

  // If success is false, require error
  if (result.success === false && !exists(result.error)) {
    warnings.push('DesignResult.error is recommended when success is false');
  }

  // Meta validation
  if (exists(result.meta)) {
    const metaResult = validateMeta(result.meta, 'DesignResult.meta');
    errors.push(...metaResult.errors);
    warnings.push(...metaResult.warnings);
  } else {
    warnings.push('DesignResult.meta is recommended for telemetry tracking');
  }

  // Workflow type
  if (exists(result.workflow) && !['complete', 'quick'].includes(result.workflow)) {
    errors.push('DesignResult.workflow must be "complete" or "quick" if provided');
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

/* ============================================================================
 * PROJECT CONTEXT VALIDATORS
 * ========================================================================== */

/**
 * Validate ProjectContext object
 *
 * @param {*} context - Project context to validate
 * @returns {ValidationResult}
 */
export function validateProjectContext(context) {
  const errors = [];
  const warnings = [];

  if (!isObject(context)) {
    errors.push('ProjectContext must be an object');
    return createValidationResult(false, errors, warnings);
  }

  // Required fields
  if (!isNonEmptyString(context.buildingProgram)) {
    errors.push('ProjectContext.buildingProgram must be a non-empty string');
  }

  if (!isNumber(context.floorArea) || context.floorArea <= 0) {
    errors.push('ProjectContext.floorArea must be a positive number');
  }

  // Location is required
  if (!exists(context.location)) {
    errors.push('ProjectContext.location is required');
  } else if (isObject(context.location)) {
    const locationResult = validateLocationProfile(context.location);
    errors.push(...locationResult.errors);
    warnings.push(...locationResult.warnings);
  }

  // Optional but recommended: buildingDNA for consistency
  if (!exists(context.buildingDNA)) {
    warnings.push('ProjectContext.buildingDNA is recommended for multi-view consistency');
  }

  return createValidationResult(errors.length === 0, errors, warnings);
}

/* ============================================================================
 * VALIDATION HELPERS
 * ========================================================================== */

/**
 * Validate and throw on error (for use in ensure() patterns)
 *
 * @param {Function} validator - Validator function
 * @param {*} data - Data to validate
 * @param {string} [dataName] - Name of data for error message
 * @throws {Error} If validation fails
 */
export function validateOrThrow(validator, data, dataName = 'data') {
  const result = validator(data);

  if (!result.valid) {
    const errorMessage = `${dataName} validation failed:\n  - ${result.errors.join('\n  - ')}`;
    const error = new Error(errorMessage);
    error.code = 'VALIDATION_FAILED';
    error.validationErrors = result.errors;
    error.validationWarnings = result.warnings;
    throw error;
  }

  // Log warnings to console
  if (result.warnings.length > 0) {
    console.warn(`${dataName} validation warnings:\n  - ${result.warnings.join('\n  - ')}`);
  }
}

/**
 * Validate and return detailed result (for non-critical validation)
 *
 * @param {Function} validator - Validator function
 * @param {*} data - Data to validate
 * @param {Object} [options] - Options
 * @param {boolean} [options.logWarnings] - Whether to log warnings to console
 * @returns {ValidationResult}
 */
export function validateSafe(validator, data, options = {}) {
  const result = validator(data);

  if (options.logWarnings && result.warnings.length > 0) {
    console.warn(`Validation warnings:\n  - ${result.warnings.join('\n  - ')}`);
  }

  return result;
}

/* ============================================================================
 * EXPORTS
 * ========================================================================== */

const validators = {
  // Core utilities
  ensure,
  ensureExists,
  ensureNonEmptyString,
  ensureNumber,
  ensureObject,

  // Validators
  validateMeta,
  validateCoordinates,
  validateLocationProfile,
  validateDesignReasoning,
  validateGeneratedImage,
  validateVisualizationResult,
  validateDesignResult,
  validateProjectContext,

  // Helpers
  validateOrThrow,
  validateSafe
};

export default validators;

/**
 * Panel Validation Gate - Stub
 */

export class GeneratorMismatchError extends Error {}
export class LegacyGeneratorError extends Error {}

export function assertValidGenerator(generator) {
  return true;
}

export function confirmGenerator(generator) {
  return true;
}

export function getValidationGate() {
  return { validate: () => ({ valid: true }) };
}

export default {
  GeneratorMismatchError,
  LegacyGeneratorError,
  assertValidGenerator,
  confirmGenerator,
  getValidationGate,
};

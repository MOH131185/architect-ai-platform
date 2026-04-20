import { buildA1VerificationBundle } from "./a1VerificationBundleService.js";

export function buildA1VerificationStateBundle(input = {}) {
  return buildA1VerificationBundle(input);
}

export default {
  buildA1VerificationStateBundle,
};

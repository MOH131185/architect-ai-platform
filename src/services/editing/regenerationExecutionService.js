import { executeTargetedRegeneration } from "./targetedRegenerationExecutor.js";

export async function executeApprovedRegeneration(input = {}) {
  return executeTargetedRegeneration(input);
}

export default {
  executeApprovedRegeneration,
};

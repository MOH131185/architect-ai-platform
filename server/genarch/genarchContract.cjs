/**
 * Node adapter for the shared genarch API contract.
 *
 * Source of truth lives in src/contracts/genarch-api-v1.json.
 */

const contract = require("../../src/contracts/genarch-api-v1.json");

const STATUS = Object.freeze({
  QUEUED: contract.jobStatuses[0],
  RUNNING: contract.jobStatuses[1],
  COMPLETED: contract.jobStatuses[2],
  FAILED: contract.jobStatuses[3],
  CANCELLED: contract.jobStatuses[4],
});

module.exports = {
  GENARCH_CONTRACT: contract,
  CONTRACT_VERSION: contract.contractVersion,
  VERSION_HEADER_NAME: contract.versionHeader,
  RESPONSE_VERSION_FIELD: contract.responseVersionField,
  JOB_DEFAULTS: Object.freeze({ ...contract.jobDefaults }),
  ARTIFACT_SPECS: Object.freeze(
    contract.artifacts.map((artifact) => Object.freeze({ ...artifact })),
  ),
  STATUS,
};

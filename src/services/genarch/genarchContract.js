/**
 * Genarch API contract adapter for browser/ESM code.
 *
 * Source of truth lives in src/contracts/genarch-api-v1.json.
 * Keep this file aligned with that JSON contract. Drift is enforced by
 * scripts/check-genarch-contracts.cjs.
 */

export const GENARCH_CONTRACT = Object.freeze({
  name: "genarch-api",
  contractVersion: "1.0.0",
  responseVersionField: "contractVersion",
  versionHeader: "X-Genarch-Contract-Version",
  apiBasePath: "/api/genarch",
  separateDeploymentBoundary: true,
  jobStatuses: Object.freeze([
    "queued",
    "running",
    "completed",
    "failed",
    "cancelled",
  ]),
  jobDefaults: Object.freeze({
    skipPhase2: true,
    skipPhase3: true,
    skipPhase4: false,
    strict: false,
    driftThreshold: 0.15,
    waitForResult: false,
  }),
  artifacts: Object.freeze([
    Object.freeze({
      key: "planJson",
      relativePath: "plan.json",
      contentType: "application/json",
    }),
    Object.freeze({
      key: "planDxf",
      relativePath: "plan.dxf",
      contentType: "application/dxf",
    }),
    Object.freeze({
      key: "modelGlb",
      relativePath: "model.glb",
      contentType: "model/gltf-binary",
    }),
    Object.freeze({
      key: "modelObj",
      relativePath: "model.obj",
      contentType: "text/plain",
    }),
    Object.freeze({
      key: "runJson",
      relativePath: "run.json",
      contentType: "application/json",
    }),
    Object.freeze({
      key: "constraintsJson",
      relativePath: "constraints.json",
      contentType: "application/json",
    }),
    Object.freeze({
      key: "pipelineManifest",
      relativePath: "pipeline_manifest.json",
      contentType: "application/json",
    }),
    Object.freeze({
      key: "a1Sheet",
      relativePath: "phase4/A1_sheet.pdf",
      contentType: "application/pdf",
    }),
    Object.freeze({
      key: "sheetManifest",
      relativePath: "phase4/sheet_manifest.json",
      contentType: "application/json",
    }),
    Object.freeze({
      key: "assetReport",
      relativePath: "asset_report.json",
      contentType: "application/json",
    }),
    Object.freeze({
      key: "driftReport",
      relativePath: "drift_report.json",
      contentType: "application/json",
    }),
  ]),
  pipelineManifest: Object.freeze({
    requiredTopLevelKeys: Object.freeze([
      "version",
      "pipeline",
      "run_id",
      "started_at",
      "completed_at",
      "phases",
      "validation",
      "errors",
      "warnings",
      "outputs",
    ]),
    requiredOutputKeys: Object.freeze([
      "plan_json",
      "plan_dxf",
      "model_glb",
      "a1_sheet",
    ]),
  }),
});

export const GENARCH_CONTRACT_VERSION = GENARCH_CONTRACT.contractVersion;
export const GENARCH_VERSION_HEADER = GENARCH_CONTRACT.versionHeader;
export const GENARCH_RESPONSE_VERSION_FIELD =
  GENARCH_CONTRACT.responseVersionField;
export const GENARCH_API_BASE_PATH = GENARCH_CONTRACT.apiBasePath;
export const GENARCH_JOB_DEFAULTS = GENARCH_CONTRACT.jobDefaults;
export const GENARCH_ARTIFACT_SPECS = GENARCH_CONTRACT.artifacts;

export const GENARCH_JOB_STATUSES = Object.freeze({
  QUEUED: GENARCH_CONTRACT.jobStatuses[0],
  RUNNING: GENARCH_CONTRACT.jobStatuses[1],
  COMPLETED: GENARCH_CONTRACT.jobStatuses[2],
  FAILED: GENARCH_CONTRACT.jobStatuses[3],
  CANCELLED: GENARCH_CONTRACT.jobStatuses[4],
});

export default GENARCH_CONTRACT;

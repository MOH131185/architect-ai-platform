#!/usr/bin/env node
/**
 * Static compatibility check for the JS <-> genarch boundary.
 *
 * Validates that:
 * - the shared contract file is well-formed
 * - the frontend adapter matches the shared contract
 * - the Node server adapter matches the shared contract
 * - the Python pipeline still emits the artifact paths expected by the contract
 * - the API docs and proxy/server files still expose the contract version signal
 */

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const ROOT = path.resolve(__dirname, "..");
const CONTRACT_PATH = path.join(ROOT, "src", "contracts", "genarch-api-v1.json");
const FRONTEND_CONTRACT_PATH = path.join(
  ROOT,
  "src",
  "services",
  "genarch",
  "genarchContract.js",
);
const SERVER_CONTRACT_PATH = path.join(
  ROOT,
  "server",
  "genarch",
  "genarchContract.cjs",
);
const RUNNER_PATH = path.join(
  ROOT,
  "genarch",
  "genarch",
  "pipeline",
  "runner.py",
);
const API_DOC_PATH = path.join(ROOT, "genarch", "docs", "GENARCH_API.md");
const OPERATIONS_RUNBOOK_PATH = path.join(
  ROOT,
  "docs",
  "GENARCH_OPERATIONS_RUNBOOK.md",
);
const DEPLOY_README_PATH = path.join(ROOT, "deploy", "README.md");
const ENV_TEMPLATE_PATH = path.join(ROOT, "env.template");
const SERVER_PATH = path.join(ROOT, "server.cjs");
const API_HEALTH_PATH = path.join(ROOT, "api", "health.js");
const PROXY_FILES = [
  path.join(ROOT, "api", "genarch", "jobs", "index.js"),
  path.join(ROOT, "api", "genarch", "jobs", "[jobId].js"),
  path.join(ROOT, "api", "genarch", "runs", "[...params].js"),
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function compareJson(label, actual, expected) {
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} does not match shared contract`,
  );
}

async function main() {
  console.log("Checking genarch contract compatibility...\n");

  const sharedContract = require(CONTRACT_PATH);
  const serverContract = require(SERVER_CONTRACT_PATH);
  const frontendContractModule = await import(
    pathToFileURL(FRONTEND_CONTRACT_PATH).href
  );

  assert(
    typeof sharedContract.contractVersion === "string" &&
      sharedContract.contractVersion.length > 0,
    "Shared contract version is missing",
  );
  assert(
    Array.isArray(sharedContract.jobStatuses) &&
      sharedContract.jobStatuses.length === 5,
    "Shared contract job statuses are incomplete",
  );
  assert(
    Array.isArray(sharedContract.artifacts) && sharedContract.artifacts.length >= 5,
    "Shared contract artifact list is incomplete",
  );
  console.log(`  OK shared contract: ${sharedContract.contractVersion}`);

  compareJson(
    "Frontend contract adapter",
    frontendContractModule.GENARCH_CONTRACT,
    sharedContract,
  );
  compareJson(
    "Frontend job defaults",
    frontendContractModule.GENARCH_JOB_DEFAULTS,
    sharedContract.jobDefaults,
  );
  compareJson(
    "Frontend artifact specs",
    frontendContractModule.GENARCH_ARTIFACT_SPECS,
    sharedContract.artifacts,
  );
  assert(
    frontendContractModule.GENARCH_CONTRACT_VERSION ===
      sharedContract.contractVersion,
    "Frontend contract version does not match shared contract",
  );
  console.log("  OK frontend adapter");

  compareJson(
    "Server job defaults",
    serverContract.JOB_DEFAULTS,
    sharedContract.jobDefaults,
  );
  compareJson(
    "Server artifact specs",
    serverContract.ARTIFACT_SPECS,
    sharedContract.artifacts,
  );
  assert(
    serverContract.CONTRACT_VERSION === sharedContract.contractVersion,
    "Server contract version does not match shared contract",
  );
  assert(
    Object.values(serverContract.STATUS).join(",") ===
      sharedContract.jobStatuses.join(","),
    "Server statuses do not match shared contract",
  );
  console.log("  OK server adapter");

  const runnerPy = readText(RUNNER_PATH);
  for (const artifact of sharedContract.artifacts) {
    assert(
      runnerPy.includes(artifact.relativePath),
      `Python pipeline runner is missing artifact path: ${artifact.relativePath}`,
    );
  }
  for (const key of sharedContract.pipelineManifest.requiredOutputKeys) {
    assert(
      runnerPy.includes(`"${key}"`),
      `Python pipeline manifest outputs are missing key: ${key}`,
    );
  }
  console.log("  OK Python pipeline outputs");

  const apiDoc = readText(API_DOC_PATH);
  assert(
    apiDoc.includes(sharedContract.contractVersion),
    "GENARCH_API.md does not mention the shared contract version",
  );
  assert(
    apiDoc.includes("src/contracts/genarch-api-v1.json"),
    "GENARCH_API.md does not point to the shared contract file",
  );
  assert(
    apiDoc.includes(sharedContract.versionHeader),
    "GENARCH_API.md does not mention the contract version header",
  );
  console.log("  OK API documentation");

  const operationsRunbook = readText(OPERATIONS_RUNBOOK_PATH);
  assert(
    operationsRunbook.includes("backend-only"),
    "GENARCH operations runbook does not describe the backend-only surface",
  );
  assert(
    operationsRunbook.includes(sharedContract.versionHeader),
    "GENARCH operations runbook does not mention the contract version header",
  );
  console.log("  OK operations runbook");

  const deployReadme = readText(DEPLOY_README_PATH);
  assert(
    !deployReadme.includes("REACT_APP_GENARCH_API_KEY"),
    "deploy/README.md still advertises a browser genarch API key",
  );
  console.log("  OK deployment guide");

  const envTemplate = readText(ENV_TEMPLATE_PATH);
  assert(
    envTemplate.includes("# REACT_APP_GENARCH_API_KEY="),
    "env.template does not mark the browser genarch key as dormant/legacy",
  );
  console.log("  OK environment template");

  const serverSource = readText(SERVER_PATH);
  assert(
    serverSource.includes("sendGenarchJson") &&
      serverSource.includes("GENARCH_VERSION_HEADER"),
    "server.cjs is not exposing the genarch contract version consistently",
  );
  assert(
    serverSource.includes("productSurface") &&
      serverSource.includes("genarchApi: 'backend-only'"),
    "server.cjs health response does not describe the backend-only genarch surface",
  );
  console.log("  OK Express genarch responses");

  const apiHealthSource = readText(API_HEALTH_PATH);
  assert(
    apiHealthSource.includes("GENARCH_VERSION_HEADER") &&
      apiHealthSource.includes('genarchApi: "backend-only"'),
    "api/health.js does not expose the backend-only genarch health metadata",
  );
  console.log("  OK health endpoint metadata");

  for (const proxyFile of PROXY_FILES) {
    const source = readText(proxyFile);
    assert(
      source.toLowerCase().includes("x-genarch-contract-version"),
      `Proxy file is not forwarding the genarch contract header: ${path.relative(ROOT, proxyFile)}`,
    );
  }
  console.log("  OK Vercel proxy forwarding");

  console.log("\nGenarch contract check PASSED");
}

main().catch((error) => {
  console.error("\nGenarch contract check FAILED");
  console.error(error.message);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * CI smoke for the Phase F load-test scripts.
 *
 * Invokes each load test's exported runner with --users 5 (mock-mode,
 * no real providers, no network) and asserts the JSON report shape.
 * Exits 0 on success, non-zero with a clear message on any contract
 * violation.
 *
 * Used by .github/workflows/ci.yml — keep it dependency-free node so
 * it runs against the same Node version CI uses without extra setup.
 *
 * Usage:
 *   node scripts/load/run-smoke.mjs
 *   node scripts/load/run-smoke.mjs --users 10
 */

import { runArtifactPackageLoadTest } from "./artifact-package-load-test.mjs";
import { runGenerationJobLoadTest } from "./generation-job-load-test.mjs";

function parseUsers(argv) {
  const idx = argv.indexOf("--users");
  if (idx === -1 || idx === argv.length - 1) return 5;
  const n = Number(argv[idx + 1]);
  return Number.isFinite(n) && n >= 1 ? n : 5;
}

function assert(cond, message) {
  if (!cond) {
    throw new Error(`load smoke: ${message}`);
  }
}

function expectShape(actual, expected, prefix) {
  for (const [key, type] of Object.entries(expected)) {
    const value = actual[key];
    assert(value !== undefined, `${prefix}.${key} is undefined`);
    if (type === "number") {
      assert(
        typeof value === "number" && Number.isFinite(value),
        `${prefix}.${key} is not a finite number (got ${typeof value} ${value})`,
      );
    } else if (type === "string") {
      assert(
        typeof value === "string" && value.length > 0,
        `${prefix}.${key} is not a non-empty string`,
      );
    } else if (type === "object") {
      assert(
        value && typeof value === "object",
        `${prefix}.${key} is not an object`,
      );
    } else if (type === "array") {
      assert(Array.isArray(value), `${prefix}.${key} is not an array`);
    }
  }
}

function noSecretLeak(report, scenario) {
  const json = JSON.stringify(report);
  const NEEDLES = [
    "sk-",
    "Bearer ",
    "AWS_SECRET_ACCESS_KEY",
    "OPENAI_API_KEY",
    "Authorization",
  ];
  for (const needle of NEEDLES) {
    assert(
      !json.includes(needle),
      `${scenario} report leaks secret token "${needle}" in serialised JSON`,
    );
  }
}

async function smokeArtifactPackage(users) {
  const report = await runArtifactPackageLoadTest({ users });
  expectShape(
    report,
    {
      scenario: "string",
      mode: "string",
      users: "number",
      startedAt: "string",
      finishedAt: "string",
      totalDurationMs: "number",
      throughputReqPerSec: "number",
      responses: "object",
      latencyMs: "object",
    },
    "artifact-package",
  );
  assert(
    report.scenario === "artifact-package-store-compact-ref",
    `artifact-package.scenario expected "artifact-package-store-compact-ref", got "${report.scenario}"`,
  );
  assert(
    report.mode === "mock-providers",
    `artifact-package.mode expected "mock-providers", got "${report.mode}"`,
  );
  assert(
    report.responses.total === users,
    `artifact-package.responses.total expected ${users}, got ${report.responses.total}`,
  );
  assert(
    report.responses.failed === 0,
    `artifact-package.responses.failed expected 0, got ${report.responses.failed}`,
  );
  expectShape(
    report.latencyMs,
    { count: "number", min: "number", max: "number", p50: "number", p95: "number" },
    "artifact-package.latencyMs",
  );
  noSecretLeak(report, "artifact-package");
  return report;
}

async function smokeGenerationJob(users) {
  const report = await runGenerationJobLoadTest({
    users,
    minWorkMs: 20,
    maxWorkMs: 60,
  });
  expectShape(
    report,
    {
      scenario: "string",
      mode: "string",
      users: "number",
      startedAt: "string",
      finishedAt: "string",
      totalDurationMs: "number",
      jobs: "object",
      latencyMs: "object",
    },
    "generation-job",
  );
  assert(
    report.scenario === "generation-job-queue",
    `generation-job.scenario expected "generation-job-queue", got "${report.scenario}"`,
  );
  assert(
    report.mode === "mock-worker",
    `generation-job.mode expected "mock-worker", got "${report.mode}"`,
  );
  assert(
    report.jobs.total === users,
    `generation-job.jobs.total expected ${users}, got ${report.jobs.total}`,
  );
  assert(
    report.jobs.succeeded === users,
    `generation-job.jobs.succeeded expected ${users}, got ${report.jobs.succeeded}`,
  );
  assert(
    report.jobs.stuck === 0,
    `generation-job.jobs.stuck expected 0, got ${report.jobs.stuck}`,
  );
  noSecretLeak(report, "generation-job");
  return report;
}

async function main() {
  const users = parseUsers(process.argv);
  console.log(`load smoke: running with --users ${users} (mock-mode)`);

  const pkgReport = await smokeArtifactPackage(users);
  console.log(
    `  ✅ artifact-package: ${pkgReport.responses.succeeded}/${pkgReport.responses.total} ok, p95=${pkgReport.latencyMs.p95}ms`,
  );

  const jobReport = await smokeGenerationJob(users);
  console.log(
    `  ✅ generation-job: ${jobReport.jobs.succeeded}/${jobReport.jobs.total} ok, p95=${jobReport.latencyMs.p95}ms`,
  );

  console.log("load smoke: all checks passed.");
}

main().catch((err) => {
  console.error(`\n❌ load smoke failed: ${err.message}`);
  process.exit(1);
});

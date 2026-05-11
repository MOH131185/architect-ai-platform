#!/usr/bin/env node
/**
 * Artifact-package Save (compact-ref) load test.
 *
 * Pre-stores N synthetic packages through the in-memory storage adapter,
 * then fires N concurrent compact-ref POSTs at the /store handler with
 * mock req/res. Measures p50/p95/min/max/mean latency, success rate, and
 * error distribution. Writes a JSON report and a markdown summary.
 *
 * Mock-mode by default: no network calls, no providers, no real HTTP
 * server. Stress is on the storage adapter + history service + handler
 * code path — which is what Save Package actually exercises in
 * production once PR #119–#125's compact-ref architecture took effect.
 *
 * Usage:
 *   node scripts/load/artifact-package-load-test.mjs --users 100
 *   node scripts/load/artifact-package-load-test.mjs --users 5 --report ./out.json
 *
 * CI runs this with --users 5 and asserts the JSON shape; the script
 * itself does NOT call any external service.
 */

import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  getDefaultArtifactStorageAdapter,
  setDefaultArtifactStorageAdapter,
  createInMemoryArtifactStorageAdapter,
  clearInMemoryArtifactStorage,
} from "../../src/services/export/artifactStorageService.js";
import storeHandler from "../../api/project/export/artifact-package/store.js";

function parseArgs(argv) {
  const args = { users: 10, report: null, prefix: "load-pkg" };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--users" || arg === "-u") {
      args.users = Number(argv[i + 1]);
      i += 1;
    } else if (arg === "--report" || arg === "-r") {
      args.report = argv[i + 1];
      i += 1;
    } else if (arg === "--prefix" || arg === "-p") {
      args.prefix = argv[i + 1];
      i += 1;
    }
  }
  if (!Number.isFinite(args.users) || args.users < 1) {
    throw new Error("--users must be a positive integer");
  }
  return args;
}

function createMockReqRes(body) {
  const req = { method: "POST", headers: {}, body };
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
    end(payload) {
      if (payload !== undefined) this.body = payload;
      return this;
    },
  };
  return { req, res };
}

function syntheticManifest(packageId, projectId, idx) {
  return {
    packageId,
    packageHash: `hash-${packageId}`,
    projectId,
    projectGraphId: projectId,
    geometryHash: `g-${idx}`,
    visualManifestHash: `v-${idx}`,
    styleBlendManifestHash: `s-${idx}`,
    jurisdictionId: "uk_riba",
    countryCode: "GB",
    artifacts: [
      { kind: "a1Sheet", path: "a1.svg", byteLength: 1024 },
      { kind: "manifest", path: "manifest.json", byteLength: 256 },
    ],
    sourceGaps: [],
    qaSummary: { status: "ok", warnings: 0 },
  };
}

function syntheticZipBytes(idx) {
  // Tiny non-empty buffer so adapter records something realistic; the
  // load test isn't measuring zip throughput, just the store path.
  return Buffer.from(`PKload-test-${idx}`);
}

async function preStorePackages(adapter, users, prefix) {
  const ids = [];
  for (let i = 0; i < users; i += 1) {
    const packageId = `${prefix}-${Date.now()}-${i}`;
    const projectId = `proj-${prefix}-${i}`;
    await adapter.putArtifactPackage({
      packageId,
      zipBytes: syntheticZipBytes(i),
      manifest: syntheticManifest(packageId, projectId, i),
      metadata: { source: "load-test" },
    });
    ids.push({ packageId, projectId });
  }
  return ids;
}

function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return null;
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  const frac = rank - lo;
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * frac;
}

function summariseLatencies(latencies) {
  if (latencies.length === 0) {
    return { count: 0, min: null, max: null, mean: null, p50: null, p95: null };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    count: sorted.length,
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
    mean: round(sum / sorted.length),
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
  };
}

function round(n) {
  return n == null ? null : Math.round(n * 100) / 100;
}

async function runOneRequest({ packageId, projectId }) {
  const { req, res } = createMockReqRes({ packageId, projectId });
  const start = performance.now();
  let errorCode = null;
  let success = false;
  try {
    await storeHandler(req, res);
    success = res.statusCode >= 200 && res.statusCode < 300;
    if (!success) {
      errorCode =
        (res.body && (res.body.errorCode || res.body.error)) ||
        `HTTP_${res.statusCode}`;
    }
  } catch (err) {
    errorCode = err?.code || "EXCEPTION";
  }
  const elapsed = performance.now() - start;
  return { success, latencyMs: elapsed, errorCode, statusCode: res.statusCode };
}

export async function runArtifactPackageLoadTest({
  users = 10,
  prefix = "load-pkg",
} = {}) {
  if (!Number.isFinite(users) || users < 1) {
    throw new Error("users must be a positive integer");
  }
  // Force the in-memory adapter so the load test never accidentally talks
  // to S3/filesystem in CI. We replace it for the duration of this run.
  clearInMemoryArtifactStorage();
  const adapter = createInMemoryArtifactStorageAdapter();
  const previousAdapter = getDefaultArtifactStorageAdapter();
  setDefaultArtifactStorageAdapter(adapter);

  try {
    const startedAt = new Date().toISOString();
    const ids = await preStorePackages(adapter, users, prefix);

    const t0 = performance.now();
    const results = await Promise.all(ids.map(runOneRequest));
    const totalDurationMs = performance.now() - t0;

    const finishedAt = new Date().toISOString();
    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);
    const errorCodeCounts = failures.reduce((acc, r) => {
      const k = r.errorCode || "UNKNOWN";
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {});

    return {
      scenario: "artifact-package-store-compact-ref",
      mode: "mock-providers",
      users,
      startedAt,
      finishedAt,
      totalDurationMs: round(totalDurationMs),
      throughputReqPerSec: round((users / totalDurationMs) * 1000),
      responses: {
        total: results.length,
        succeeded: successes.length,
        failed: failures.length,
        errorCodes: errorCodeCounts,
      },
      latencyMs: summariseLatencies(results.map((r) => r.latencyMs)),
    };
  } finally {
    setDefaultArtifactStorageAdapter(previousAdapter);
    clearInMemoryArtifactStorage();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const report = await runArtifactPackageLoadTest({
    users: args.users,
    prefix: args.prefix,
  });
  if (args.report) {
    const reportPath = path.resolve(args.report);
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`Report written to ${reportPath}`);
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.responses.failed > 0) {
    console.error(
      `\n${report.responses.failed}/${report.responses.total} requests failed — see errorCodes above.`,
    );
    process.exit(2);
  }
}

const isDirectInvocation =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  /artifact-package-load-test\.mjs$/.test(process.argv[1].replace(/\\/g, "/"));

if (isDirectInvocation) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

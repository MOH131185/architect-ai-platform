#!/usr/bin/env node
/**
 * Generation-job queue load test.
 *
 * Fires N concurrent startJob() calls with an injected mock worker
 * (sleeps a randomised 50–250ms, returns a fake success result), then
 * polls until every job reaches a terminal status. Measures queue→done
 * wall-clock latency, per-job stage transitions, success rate, and
 * error code distribution.
 *
 * Mock-mode by default: NO real OpenAI calls, no real generation. The
 * worker is purely synthetic. CI runs this with --users 5 to validate
 * the JSON report shape.
 *
 * Usage:
 *   node scripts/load/generation-job-load-test.mjs --users 50
 *   node scripts/load/generation-job-load-test.mjs --users 5 --report ./out.json
 */

import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  startJob,
  getJob,
  clearJobs,
  JOB_STATUS,
} from "../../src/services/generation/generationJobService.js";

const TERMINAL = new Set([
  JOB_STATUS.SUCCEEDED,
  JOB_STATUS.FAILED,
  JOB_STATUS.CANCELLED,
]);

function parseArgs(argv) {
  const args = {
    users: 10,
    report: null,
    minWorkMs: 50,
    maxWorkMs: 250,
    failureRate: 0,
    pollMs: 25,
    timeoutMs: 30000,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--users" || arg === "-u") {
      args.users = Number(next);
      i += 1;
    } else if (arg === "--report" || arg === "-r") {
      args.report = next;
      i += 1;
    } else if (arg === "--min-work") {
      args.minWorkMs = Number(next);
      i += 1;
    } else if (arg === "--max-work") {
      args.maxWorkMs = Number(next);
      i += 1;
    } else if (arg === "--failure-rate") {
      args.failureRate = Number(next);
      i += 1;
    } else if (arg === "--timeout") {
      args.timeoutMs = Number(next);
      i += 1;
    }
  }
  if (!Number.isFinite(args.users) || args.users < 1) {
    throw new Error("--users must be a positive integer");
  }
  if (args.failureRate < 0 || args.failureRate > 1) {
    throw new Error("--failure-rate must be between 0 and 1");
  }
  return args;
}

function makeMockWorker({ minWorkMs, maxWorkMs, failureRate }) {
  return async function mockWorker(payload, { signal, onProgress }) {
    const workMs =
      minWorkMs + Math.floor(Math.random() * Math.max(1, maxWorkMs - minWorkMs));
    const checkpoints = [25, 50, 75];
    const stepMs = workMs / (checkpoints.length + 1);
    for (let i = 0; i < checkpoints.length; i += 1) {
      if (signal?.aborted) {
        const err = new Error("aborted");
        err.code = "JOB_CANCELLED";
        throw err;
      }
      await new Promise((r) => setTimeout(r, stepMs));
      try {
        onProgress?.(checkpoints[i], "GENERATING");
      } catch {
        /* swallow — progress is best-effort */
      }
    }
    await new Promise((r) => setTimeout(r, stepMs));

    if (Math.random() < failureRate) {
      return {
        success: false,
        errorCode: "MOCK_FAILURE",
        error: "synthetic failure (load test)",
      };
    }
    const idHash = `${payload?.projectId || "p"}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    return {
      success: true,
      geometryHash: `g-${idHash}`,
      visualManifestHash: `v-${idHash}`,
      styleBlendManifestHash: `s-${idHash}`,
      package: {
        packageId: `pkg-${idHash}`,
        packageHash: `ph-${idHash}`,
        byteLength: 1024,
        downloadRoute: `/api/project/export/artifact-package/${idHash}/download`,
        signedUrlAvailable: false,
      },
      artifacts: [{ kind: "a1Sheet" }],
    };
  };
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

function round(n) {
  return n == null ? null : Math.round(n * 100) / 100;
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

async function pollUntilTerminal(jobIds, { pollMs, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  const finishedAt = new Map();
  while (Date.now() < deadline) {
    let stillRunning = 0;
    for (const jobId of jobIds) {
      if (finishedAt.has(jobId)) continue;
      const snap = getJob(jobId);
      if (snap && TERMINAL.has(snap.status)) {
        finishedAt.set(jobId, performance.now());
      } else {
        stillRunning += 1;
      }
    }
    if (stillRunning === 0) return finishedAt;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return finishedAt;
}

export async function runGenerationJobLoadTest({
  users = 10,
  minWorkMs = 50,
  maxWorkMs = 250,
  failureRate = 0,
  pollMs = 25,
  timeoutMs = 30000,
} = {}) {
  if (!Number.isFinite(users) || users < 1) {
    throw new Error("users must be a positive integer");
  }
  if (failureRate < 0 || failureRate > 1) {
    throw new Error("failureRate must be between 0 and 1");
  }

  // Defensive: don't pollute jobs from a prior run.
  clearJobs();

  const worker = makeMockWorker({ minWorkMs, maxWorkMs, failureRate });
  const startedAt = new Date().toISOString();
  const t0 = performance.now();

  const enqueued = [];
  for (let i = 0; i < users; i += 1) {
    const startedAtPerf = performance.now();
    const snapshot = startJob({
      payload: { projectId: `load-${i}`, idx: i },
      userId: `user-${i % Math.max(1, Math.ceil(users / 4))}`,
      projectId: `load-${i}`,
      worker,
    });
    enqueued.push({ jobId: snapshot.jobId, startedAtPerf });
  }

  const enqueueDoneMs = performance.now() - t0;

  const finishedAtMap = await pollUntilTerminal(
    enqueued.map((j) => j.jobId),
    { pollMs, timeoutMs },
  );

  const totalDurationMs = performance.now() - t0;
  const finishedAt = new Date().toISOString();

  const perJob = enqueued.map(({ jobId, startedAtPerf }) => {
    const snap = getJob(jobId);
    const finished = finishedAtMap.get(jobId) ?? null;
    return {
      jobId,
      status: snap?.status || "UNKNOWN",
      errorCode: snap?.errorCode || null,
      latencyMs: finished == null ? null : finished - startedAtPerf,
      progress: snap?.progress ?? null,
    };
  });

  const succeeded = perJob.filter((p) => p.status === JOB_STATUS.SUCCEEDED);
  const failed = perJob.filter((p) => p.status === JOB_STATUS.FAILED);
  const stuck = perJob.filter((p) => p.latencyMs == null);
  const errorCodes = failed.reduce((acc, p) => {
    const k = p.errorCode || "UNKNOWN";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const report = {
    scenario: "generation-job-queue",
    mode: "mock-worker",
    users,
    workMsRange: [minWorkMs, maxWorkMs],
    failureRate,
    startedAt,
    finishedAt,
    totalDurationMs: round(totalDurationMs),
    enqueueDurationMs: round(enqueueDoneMs),
    throughputJobsPerSec: round((users / totalDurationMs) * 1000),
    jobs: {
      total: perJob.length,
      succeeded: succeeded.length,
      failed: failed.length,
      stuck: stuck.length,
      errorCodes,
    },
    latencyMs: summariseLatencies(
      perJob.filter((p) => p.latencyMs != null).map((p) => p.latencyMs),
    ),
  };

  clearJobs();
  return report;
}

async function main() {
  const args = parseArgs(process.argv);
  const report = await runGenerationJobLoadTest(args);
  if (args.report) {
    const reportPath = path.resolve(args.report);
    await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`Report written to ${reportPath}`);
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.jobs.stuck > 0) {
    console.error(`\n${report.jobs.stuck} jobs still running at timeout.`);
    process.exit(2);
  }
}

const isDirectInvocation =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  /generation-job-load-test\.mjs$/.test(process.argv[1].replace(/\\/g, "/"));

if (isDirectInvocation) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

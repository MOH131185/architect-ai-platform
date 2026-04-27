/**
 * Read-only model route report for the ProjectGraph production pipeline.
 *
 * This reports model/provider/env variable names only. It never prints API key
 * values, even when those values are present in the process environment.
 */

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const rootDir = path.join(__dirname, "..");
const envPath = path.join(rootDir, ".env");

if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath, quiet: true });
}

const PRODUCTION_STEPS = [
  "ROUTER",
  "ORCHESTRATOR",
  "BRIEF",
  "SITE",
  "CLIMATE",
  "REGS",
  "PROGRAMME",
  "PROJECT_GRAPH",
  "DRAWING_2D",
  "MODEL_3D",
  "IMAGE",
  "MATERIALS",
  "A1_SHEET",
  "QA",
];

function formatBool(value) {
  return value ? "yes" : "no";
}

function buildRows(registry) {
  return PRODUCTION_STEPS.map((stepId) => registry[stepId])
    .filter(Boolean)
    .map((entry) => ({
      stepId: entry.stepId || entry.step,
      task: entry.label,
      provider: entry.provider,
      model: entry.model,
      apiKeyEnv: entry.apiKeyEnv,
      modelSource: entry.modelSource,
      modelEnv: entry.selectedEnvKey || "default",
      fallbackUsed: entry.fallbackUsed === true,
      fineTunedModelUsed: Boolean(entry.fineTunedModelUsed),
      deterministicGeometry: entry.deterministicGeometry === true,
    }));
}

function printTable(rows) {
  const headers = [
    "step",
    "task",
    "provider",
    "model",
    "api_key_env",
    "model_env",
    "fallback",
    "ft_used",
    "det_geom",
  ];
  const values = rows.map((row) => [
    row.stepId,
    row.task,
    row.provider,
    row.model,
    row.apiKeyEnv,
    row.modelEnv,
    formatBool(row.fallbackUsed),
    formatBool(row.fineTunedModelUsed),
    formatBool(row.deterministicGeometry),
  ]);
  const widths = headers.map((header, index) =>
    Math.max(
      header.length,
      ...values.map((row) => String(row[index] || "").length),
    ),
  );
  const formatRow = (row) =>
    row
      .map((cell, index) => String(cell || "").padEnd(widths[index], " "))
      .join("  ");

  console.log("ProjectGraph model route table");
  console.log("Secrets redacted: only env variable names are shown.");
  console.log(formatRow(headers));
  console.log(formatRow(widths.map((width) => "-".repeat(width))));
  values.forEach((row) => console.log(formatRow(row)));
}

async function main() {
  const resolverPath = path.join(
    rootDir,
    "src",
    "services",
    "modelStepResolver.js",
  );
  const { resolveArchitectureModelRegistry } = await import(
    pathToFileURL(resolverPath).href
  );
  const registry = resolveArchitectureModelRegistry({
    steps: PRODUCTION_STEPS,
  });
  const rows = buildRows(registry);

  if (process.argv.includes("--json")) {
    console.log(
      JSON.stringify({ pipelineMode: "project_graph", routes: rows }, null, 2),
    );
    return;
  }

  printTable(rows);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});

/**
 * Environment Variable Checker
 *
 * Validates the production environment expected by the RIBA A1 ProjectGraph
 * pipeline. Secrets are never printed; only variable names and status are
 * reported.
 */

const path = require("path");
const fs = require("fs");

const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
}

const REQUIRED = [
  {
    name: "OPENAI_API_KEY",
    description: "OpenAI API key for model-first pipeline steps",
    format: /^sk-(?:proj-)?[a-zA-Z0-9_-]{20,}$/,
  },
  {
    name: "OPENAI_REASONING_MODEL",
    description: "Base reasoning model used before fine-tunes exist",
  },
  {
    name: "OPENAI_FAST_MODEL",
    description: "Fast base model used for labels and brief parsing",
  },
  {
    name: "OPENAI_IMAGE_MODEL",
    description: "OpenAI image model for optional presentation imagery",
  },
  {
    name: "STEP_07_PROJECT_GRAPH_MODEL",
    description: "ProjectGraph synthesis model",
  },
  {
    name: "STEP_08_2D_LABEL_MODEL",
    description: "2D labels/legend model; geometry remains deterministic",
  },
  {
    name: "STEP_09_3D_QA_MODEL",
    description: "3D QA model; geometry remains deterministic",
  },
  {
    name: "STEP_12_A1_SHEET_MODEL",
    description: "A1 sheet narrative/layout support model",
  },
  {
    name: "STEP_13_QA_MODEL",
    description: "QA/evaluation model",
  },
  {
    name: "PROJECT_GRAPH_REQUIRE_2D_3D_SAME_SOURCE",
    description: "Blocks independent 2D/3D generation",
    expected: "true",
  },
  {
    name: "A1_SHEET_WIDTH_MM",
    description: "A1 landscape width",
    expected: "841",
  },
  {
    name: "A1_SHEET_HEIGHT_MM",
    description: "A1 landscape height",
    expected: "594",
  },
];

const CLIENT_REQUIRED = [
  {
    name: "REACT_APP_GOOGLE_MAPS_API_KEY",
    description: "Site lookup and map display",
  },
  {
    name: "REACT_APP_OPENWEATHER_API_KEY",
    description: "Climate fallback data",
  },
];

const OPTIONAL_DATA = [
  "OS_DATAHUB_API_KEY",
  "OS_MAPS_API_KEY",
  "OS_FEATURES_API_KEY",
  "OS_NGD_API_KEY",
  "METOFFICE_DATAHUB_API_KEY",
  "UKCP_API_KEY",
  "PLANNING_DATA_API_KEY",
  "ENVIRONMENT_AGENCY_API_KEY",
  "OPENAI_IMAGES_API_KEY",
];

const OPTIONAL_PRESENTATION = [
  {
    name: "PROJECT_GRAPH_IMAGE_GEN_ENABLED",
    description:
      "Set true to call OpenAI image generation for ProjectGraph visual panels",
  },
  {
    name: "OPENAI_STRICT_IMAGE_GEN",
    description:
      "Set true to fail visual panels instead of falling back after OpenAI image errors",
  },
  {
    name: "MATERIAL_TEXTURE_THUMBNAILS_ENABLED",
    description:
      "Optional material swatch thumbnails; separate from ProjectGraph visual panels",
  },
  {
    name: "OPENAI_ALLOW_REACT_APP_SERVER_KEY",
    description:
      "Local-dev only compatibility fallback for REACT_APP_OPENAI_API_KEY",
  },
];

const LEGACY_OPTIONAL = [
  "TOGETHER_API_KEY",
  "TOGETHER_FLUX_MODEL",
  "STABILITY_API_KEY",
  "REPLICATE_API_TOKEN",
  "RUNPOD_API_KEY",
];

function isSet(name) {
  return Boolean(String(process.env[name] || "").trim());
}

function checkGroup(title, entries, { required = true } = {}) {
  console.log(`\n${title}`);
  console.log("─".repeat(title.length));
  const missing = [];
  const invalid = [];

  for (const entry of entries) {
    const value = process.env[entry.name];
    if (!isSet(entry.name)) {
      console.log(`  ${required ? "❌" : "○"} ${entry.name}`);
      if (required) missing.push(entry.name);
      continue;
    }
    if (entry.expected && String(value).toLowerCase() !== entry.expected) {
      console.log(`  ⚠️  ${entry.name} must be ${entry.expected}`);
      invalid.push(entry.name);
      continue;
    }
    if (entry.format && !entry.format.test(value)) {
      console.log(`  ⚠️  ${entry.name} has unexpected format`);
      invalid.push(entry.name);
      continue;
    }
    console.log(`  ✅ ${entry.name}`);
  }

  return { missing, invalid };
}

function checkOptionalList(title, names) {
  console.log(`\n${title}`);
  console.log("─".repeat(title.length));
  for (const name of names) {
    console.log(`  ${isSet(name) ? "✅" : "○"} ${name}`);
  }
}

function main() {
  console.log("Environment Variable Validation: RIBA A1 ProjectGraph pipeline");
  console.log("Secrets are redacted by design.");

  if (!fs.existsSync(envPath)) {
    console.log("\n⚠️  No .env file found. Using process environment only.");
  }

  const core = checkGroup("Core model-first pipeline", REQUIRED);
  const client = checkGroup("Client/site services", CLIENT_REQUIRED);
  checkGroup("Optional ProjectGraph presentation image generation", OPTIONAL_PRESENTATION, {
    required: false,
  });
  checkOptionalList("Optional UK data providers", OPTIONAL_DATA);
  checkOptionalList("Legacy/optional image providers", LEGACY_OPTIONAL);

  const failures = [
    ...core.missing,
    ...core.invalid,
    ...client.missing,
    ...client.invalid,
  ];

  console.log("\nSummary");
  console.log("───────");
  if (failures.length) {
    console.log(
      `❌ Environment validation failed (${failures.length} issue(s)).`,
    );
    failures.forEach((name) => console.log(`  • ${name}`));
    process.exit(1);
  }

  if (isSet("TOGETHER_API_KEY")) {
    console.log(
      "⚠️  TOGETHER_API_KEY is set, but it is not required for the ProjectGraph vertical slice.",
    );
  }

  console.log("✅ Environment validation passed.");
}

main();

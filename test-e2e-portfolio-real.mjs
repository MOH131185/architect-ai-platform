#!/usr/bin/env node
/**
 * REAL Portfolio-Integrated A1 Sheet Generation Test
 *
 * Uses actual portfolio images from Rohan Thomas Mathew's BIM Workflow Portfolio
 * as style references (img2img) for FLUX panel generation.
 *
 * Portfolio source: D:/Training data AIARCHI/portfolio/0e7f1236-41db-422f-bfc0-aeef2452d9dd.pdf
 * Extracted images: portfolio_images/
 *
 * Key portfolio reference: page1_img16.jpg — Small Residence Project
 *   - 2-storey modern house, brick + white render, clean cubic volumes
 *   - Floor plans, elevations, and 3D renders visible
 *
 * Pipeline:
 *   1. Load portfolio reference images → base64
 *   2. DNA generation (two-pass via Qwen) with portfolio style emphasis
 *   3. Canonical geometry pack (SVG panels)
 *   4. Deterministic seed derivation
 *   5. FLUX panel generation with img2img style conditioning
 *   6. A1 sheet composition (Sharp-based)
 *   7. Save all outputs to e2e_portfolio_output/
 *
 * Prerequisites:
 *   npm run server   (Express proxy on port 3001)
 *
 * Usage:
 *   node test-e2e-portfolio-real.mjs              # Default (FLUX.1.1-pro)
 *   node test-e2e-portfolio-real.mjs --schnell    # Use free FLUX.1-schnell
 *   node test-e2e-portfolio-real.mjs --skip-flux  # Skip FLUX calls, SVG-only
 *   node test-e2e-portfolio-real.mjs --no-img2img # FLUX without style conditioning
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Configuration ───────────────────────────────────────────────────────────
const SERVER_URL = "http://localhost:3001";
const OUTPUT_DIR = join(__dirname, "e2e_portfolio_output");
const PORTFOLIO_DIR = join(__dirname, "portfolio_images");
const ARGS = process.argv.slice(2);
const USE_SCHNELL = ARGS.includes("--schnell");
const SKIP_FLUX = ARGS.includes("--skip-flux");
const NO_IMG2IMG = ARGS.includes("--no-img2img");

// Default to pro unless --schnell flag
const FLUX_MODEL = USE_SCHNELL
  ? "black-forest-labs/FLUX.1-schnell"
  : "black-forest-labs/FLUX.1.1-pro";
const FLUX_STEPS = USE_SCHNELL ? 12 : 28;
const QWEN_MODEL = "meta-llama/Llama-3.3-70B-Instruct-Turbo";

// A1 sheet dimensions (px) — landscape orientation
const A1_WIDTH = 1792;
const A1_HEIGHT = 1269;

// Panel generation delay (ms) — respect Together.ai rate limits
const PANEL_DELAY_MS = 7000;

// img2img strength: lower = more portfolio style, higher = more prompt adherence
const IMG2IMG_STRENGTH = 0.30; // 30% portfolio style blending

// Colours for console
const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
};

// ─── Portfolio Reference Images ──────────────────────────────────────────────
// Selected from Rohan Thomas Mathew's BIM Workflow Portfolio
// page1_img16.jpg: Small Residence Project — best match for detached house style
const PORTFOLIO_REFERENCES = {
  hero_3d: "page1_img16.jpg",      // Small residence 3D view + plans + elevations
  interior_3d: "page1_img6.jpg",   // Interior/rendered view
  axonometric: "page1_img16.jpg",  // Same residence project for axon consistency
  site_diagram: "page1_img16.jpg", // Site layout reference
};

// ─── Test Project Context ────────────────────────────────────────────────────
const PROJECT_CONTEXT = {
  buildingProgram: "residential",
  buildingType: "detached_house",
  area: 180,
  floorCount: 2,
  floors: 2,
  location: {
    address: "42 Maple Avenue, Richmond, London TW9 1AZ, United Kingdom",
    coordinates: { lat: 51.4613, lng: -0.3037 },
    climate: {
      type: "temperate maritime",
      seasonal: {
        winter: { avgTemp: 5, rainfall: 55 },
        spring: { avgTemp: 11, rainfall: 40 },
        summer: { avgTemp: 19, rainfall: 45 },
        fall: { avgTemp: 12, rainfall: 60 },
      },
    },
    zoning: {
      type: "residential_suburban",
      maxHeight: "10m",
      density: "low",
      setbacks: "1.5m sides, 3m front, 6m rear",
    },
    sunPath: {
      summer: "High arc NE to NW",
      winter: "Low arc SE to SW",
      optimalOrientation: "South-facing main living spaces",
    },
    recommendedStyle: "Modern Contemporary",
  },
  programSpaces: [
    { name: "Living Room", count: 1, area_m2: 28, floor: "ground", orientation: "south" },
    { name: "Kitchen-Dining", count: 1, area_m2: 24, floor: "ground", orientation: "south" },
    { name: "Study", count: 1, area_m2: 10, floor: "ground", orientation: "east" },
    { name: "WC", count: 1, area_m2: 3, floor: "ground", orientation: "any" },
    { name: "Utility", count: 1, area_m2: 6, floor: "ground", orientation: "north" },
    { name: "Entrance Hall", count: 1, area_m2: 8, floor: "ground", orientation: "any" },
    { name: "Master Bedroom", count: 1, area_m2: 18, floor: "first", orientation: "south" },
    { name: "Bedroom 2", count: 1, area_m2: 14, floor: "first", orientation: "east" },
    { name: "Bedroom 3", count: 1, area_m2: 12, floor: "first", orientation: "west" },
    { name: "Bedroom 4", count: 1, area_m2: 10, floor: "first", orientation: "north" },
    { name: "Family Bathroom", count: 1, area_m2: 7, floor: "first", orientation: "any" },
    { name: "En-Suite", count: 1, area_m2: 5, floor: "first", orientation: "any" },
    { name: "Landing", count: 1, area_m2: 6, floor: "first", orientation: "any" },
  ],
  siteMetrics: {
    polygonArea: 450,
    coverage: 0.4,
  },
  blendedStyle: {
    portfolio_weight: 0.7,
    local_weight: 0.3,
    description: "Modern contemporary with BIM-driven precision, brick and render material palette",
    materials: ["Red/brown brick (#B8604E)", "White render (#F5F5F0)", "Glass curtain wall", "Dark aluminium frames (#333333)"],
    formLanguage: "Clean cubic volumes, flat/low-pitch roofs, large window openings, expressed floor lines",
  },
};

// Enhanced portfolio style — more detailed for DNA generation
const PORTFOLIO_STYLE = `
Portfolio Analysis (Rohan Thomas Mathew - BIM Architect, PEMS Engineering Consultants):
- Architectural vocabulary: Modern contemporary UK residential, BIM-driven precision design
- Material palette: Red/brown brick (#B8604E) for ground floor, white smooth render (#F5F5F0) for upper floors, glass curtain wall elements
- Form language: Clean cubic volumes, flat or low-pitch roofs, strong horizontal banding at floor transitions
- Facade composition: Material change at floor line — brick below, render above — creating visual separation
- Window style: Large format rectangular windows, floor-to-ceiling where possible, dark aluminium frames (#333333)
- Roof: Flat roof with concealed parapet or very low-pitch mono-pitch, clean skyline
- Detailing: Expressed structural grid, deep window reveals, crisp material junctions
- Color temperature: Warm earth tones (brick, timber) contrasted with crisp white render and dark metal
- Landscape: Minimal, well-maintained front gardens with concrete/stone paths
- Interior quality: Open-plan living spaces, natural light emphasis, warm wood floors
- CRITICAL STYLE RULE: Ground floor = brick, Upper floor = white render, Roof = flat/concealed
`;

// ─── Timing & Cost Tracking ─────────────────────────────────────────────────
const timings = {};
const costs = { qwen: 0, flux: 0, total: 0 };
let totalTokens = 0;

function startTimer(name) {
  timings[name] = { start: Date.now() };
}
function endTimer(name) {
  if (timings[name]) {
    timings[name].end = Date.now();
    timings[name].duration = timings[name].end - timings[name].start;
  }
}

// ─── Utility Functions ──────────────────────────────────────────────────────
function log(msg) {
  console.log(`${C.dim}[${new Date().toISOString().slice(11, 19)}]${C.reset} ${msg}`);
}
function logSuccess(msg) {
  console.log(`${C.green}✅ ${msg}${C.reset}`);
}
function logError(msg) {
  console.log(`${C.red}❌ ${msg}${C.reset}`);
}
function logStep(step, msg) {
  console.log(`\n${C.bold}${C.cyan}═══ STEP ${step}: ${msg} ═══${C.reset}`);
}
function logSubStep(msg) {
  console.log(`   ${C.yellow}▸${C.reset} ${msg}`);
}
function logPortfolio(msg) {
  console.log(`   ${C.magenta}🎨${C.reset} ${msg}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDir(dir) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

function djb2Hash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0x7fffffff;
  }
  return hash;
}

function derivePanelSeed(baseSeed, panelKey) {
  const keyHash = djb2Hash(panelKey);
  return (baseSeed + keyHash) % 1000000;
}

function sanitizeJsonString(jsonStr) {
  if (!jsonStr) return jsonStr;
  let s = jsonStr.replace(/^\uFEFF/, "").replace(/[\u200B-\u200D\uFEFF]/g, "");
  s = s.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) => {
    return match
      .replace(/\r\n/g, "\\n")
      .replace(/\r/g, "\\n")
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t")
      .replace(/[\x00-\x1F\x7F]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  });
  s = s.replace(/,(\s*[}\]])/g, "$1");
  return s;
}

// ─── Portfolio Image Loading ─────────────────────────────────────────────────

async function loadPortfolioImages() {
  logStep("0", "Loading Portfolio Reference Images");
  startTimer("portfolio_load");

  const loadedRefs = {};

  for (const [panelType, filename] of Object.entries(PORTFOLIO_REFERENCES)) {
    const filePath = join(PORTFOLIO_DIR, filename);
    if (!existsSync(filePath)) {
      logError(`Portfolio image not found: ${filename}`);
      continue;
    }

    try {
      const sharp = require("sharp");
      const imageData = await readFile(filePath);

      // Resize to match panel dimensions for img2img
      let targetW = 1024, targetH = 1024;
      if (panelType === "hero_3d" || panelType === "interior_3d") {
        targetW = 1344; targetH = 768;
      }

      const resized = await sharp(imageData)
        .resize(targetW, targetH, { fit: "cover" })
        .jpeg({ quality: 85 })
        .toBuffer();

      const base64 = resized.toString("base64");
      loadedRefs[panelType] = {
        filename,
        base64,
        sizeKB: Math.round(resized.length / 1024),
        dimensions: `${targetW}×${targetH}`,
      };

      logPortfolio(`${panelType}: ${filename} → ${loadedRefs[panelType].sizeKB}KB (${targetW}×${targetH})`);
    } catch (e) {
      logError(`Failed to load ${filename}: ${e.message}`);
    }
  }

  endTimer("portfolio_load");
  logSuccess(`Portfolio: ${Object.keys(loadedRefs).length} reference images loaded in ${(timings.portfolio_load.duration / 1000).toFixed(1)}s`);
  return loadedRefs;
}

// ─── API Call Functions ─────────────────────────────────────────────────────

async function checkServerConnectivity() {
  try {
    const resp = await fetch(`${SERVER_URL}/api/health`, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) return true;
  } catch {}
  try {
    const resp = await fetch(SERVER_URL, { signal: AbortSignal.timeout(5000) });
    return resp.status < 500;
  } catch {
    return false;
  }
}

async function callQwen(messages, options = {}) {
  const body = {
    model: options.model || QWEN_MODEL,
    messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.max_tokens ?? 4096,
  };

  const resp = await fetch(`${SERVER_URL}/api/together/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Qwen API error ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const data = await resp.json();
  const usage = data.usage || {};
  totalTokens += (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
  costs.qwen += ((usage.prompt_tokens || 0) * 0.54 + (usage.completion_tokens || 0) * 0.54) / 1_000_000;
  return data;
}

async function callFlux(prompt, options = {}) {
  const body = {
    model: options.model || FLUX_MODEL,
    prompt,
    negative_prompt: options.negativePrompt || "",
    width: options.width || A1_WIDTH,
    height: options.height || A1_HEIGHT,
    num_inference_steps: options.steps || FLUX_STEPS,
    guidance_scale: options.guidanceScale || 7.8,
    seed: options.seed || Math.floor(Math.random() * 999999),
  };

  // img2img: use portfolio image as style reference
  if (options.initImage) {
    body.initImage = options.initImage;
    body.imageStrength = options.imageStrength || IMG2IMG_STRENGTH;
  }

  const resp = await fetch(`${SERVER_URL}/api/together/image`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`FLUX API error ${resp.status}: ${errText.slice(0, 500)}`);
  }

  const data = await resp.json();
  const megapixels = (body.width * body.height) / 1_000_000;
  costs.flux += USE_SCHNELL ? megapixels * 0.003 : megapixels * 0.04;

  // Normalize response format
  if (data.url && !data.data) {
    return { data: [{ url: data.url }], seed: data.seed, model: data.model };
  }
  return data;
}

// ─── DNA Generation ─────────────────────────────────────────────────────────

function buildProgramScheduleText(programSpaces) {
  return programSpaces
    .map(
      (room, i) =>
        `${i + 1}. ${room.name} | ${room.area_m2}m² | floor=${room.floor} | orientation=${room.orientation || "any"}`
    )
    .join("\n");
}

async function generateDNA() {
  logStep(1, "DNA Generation (Two-Pass via Qwen) — Portfolio-Enhanced");
  startTimer("dna_generation");

  const ctx = PROJECT_CONTEXT;
  const programSchedule = buildProgramScheduleText(ctx.programSpaces);

  // ─── Pass A: Author ───
  logSubStep("Pass A: Generating structured DNA with portfolio style emphasis...");

  const passAPrompt = `You are an expert UK residential architect. Generate a complete Master Design DNA in STRICT JSON format.

THIS DESIGN MUST MATCH THE FOLLOWING PORTFOLIO STYLE:
${PORTFOLIO_STYLE}

OUTPUT REQUIREMENTS:
- Return ONLY valid JSON (no markdown, no prose, no explanations)
- Follow this EXACT schema with all four top-level keys:

{
  "site": {
    "polygon": [[0,0],[20,0],[20,22],[0,22]],
    "area_m2": number,
    "orientation": number,
    "climate_zone": "string",
    "sun_path": "string",
    "wind_profile": "string"
  },
  "program": {
    "floors": number,
    "rooms": [
      {
        "name": "string",
        "area_m2": number,
        "floor": "ground|first",
        "orientation": "north|south|east|west|any"
      }
    ]
  },
  "style": {
    "architecture": "string",
    "materials": [
      {
        "name": "string",
        "hexColor": "#RRGGBB",
        "application": "string"
      }
    ],
    "windows": {
      "pattern": "string",
      "proportion": "string",
      "frameColor": "#RRGGBB"
    }
  },
  "geometry_rules": {
    "grid": "string",
    "max_span": "string",
    "roof_type": "flat",
    "roof_pitch": 0,
    "floor_to_floor_height": number,
    "wall_thickness": number
  }
}

PROJECT REQUIREMENTS:
- Building Type: 4-bedroom detached house (UK residential)
- Total Area: ${ctx.area}m²
- Floors: EXACTLY ${ctx.floorCount} (this is MANDATORY - do NOT change)
- Site Area: ${ctx.siteMetrics.polygonArea}m²
- Climate: ${ctx.location.climate.type}
- Location: ${ctx.location.address}

MANDATORY PROGRAM SCHEDULE (LOCKED - DO NOT ALTER):
${programSchedule}

CRITICAL STYLE RULES (FROM PORTFOLIO):
1. Roof MUST be FLAT (roof_type: "flat", roof_pitch: 0) — this is the portfolio signature
2. Ground floor walls: Red/brown brick (#B8604E)
3. First floor walls: White smooth render (#F5F5F0)
4. Material transition at first floor line — brick below, render above
5. Windows: Large rectangular, dark aluminium frames (#333333)
6. Include at minimum these 4 materials: brick, render, glass, dark aluminium
7. Floor-to-floor height: 2.8-3.0m
8. Clean cubic massing, minimal ornamentation
9. ALL rooms must fit within the total area (${ctx.area}m²)
10. program.rooms must include ALL and ONLY the locked schedule entries above
11. program.rooms length MUST be exactly ${ctx.programSpaces.length}

Generate the DNA now (JSON only):`;

  const passAResponse = await callQwen(
    [{ role: "user", content: passAPrompt }],
    { temperature: 0.3, max_tokens: 4096 }
  );

  let passAContent = passAResponse.choices?.[0]?.message?.content || "";
  let passAJson = passAContent.trim();
  if (passAJson.startsWith("```")) {
    const match = passAJson.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
    if (match) passAJson = match[1];
  }
  passAJson = sanitizeJsonString(passAJson);

  let rawDNA;
  try {
    rawDNA = JSON.parse(passAJson);
    logSuccess("Pass A: Raw DNA generated");
  } catch (e) {
    logError(`Pass A: JSON parse failed: ${e.message}`);
    const jsonMatch = passAJson.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      rawDNA = JSON.parse(sanitizeJsonString(jsonMatch[0]));
      logSuccess("Pass A: Extracted JSON from response");
    } else {
      throw new Error("Pass A failed: Could not parse DNA JSON");
    }
  }

  // ─── Pass B: Reviewer ───
  logSubStep("Pass B: Validating and repairing DNA (Reviewer)...");

  const required = ["site", "program", "style", "geometry_rules"];
  const missing = required.filter((k) => !rawDNA[k]);

  if (missing.length === 0 && rawDNA.program?.rooms?.length === ctx.programSpaces.length) {
    logSuccess("Pass B: DNA schema valid (no repair needed)");
  } else {
    log(`   Missing sections: ${missing.join(", ") || "none"}`);
    log(`   Room count: ${rawDNA.program?.rooms?.length || 0}/${ctx.programSpaces.length}`);

    const repairPrompt = `You are a DNA validator. The following DNA has validation issues. Fix them and return ONLY the corrected JSON.

VALIDATION ISSUES:
${missing.length > 0 ? `Missing sections: ${missing.join(", ")}` : "All sections present"}
${rawDNA.program?.rooms?.length !== ctx.programSpaces.length ? `Room count mismatch: got ${rawDNA.program?.rooms?.length || 0}, expected ${ctx.programSpaces.length}` : ""}

ORIGINAL DNA:
${JSON.stringify(rawDNA, null, 2)}

LOCKED PROGRAM SCHEDULE (DO NOT ALTER):
${programSchedule}

REQUIREMENTS:
1. Fix all validation issues
2. Ensure all four top-level keys exist: site, program, style, geometry_rules
3. Keep the building realistic and consistent
4. Preserve ALL locked program rooms exactly
5. FORCE roof_type to "flat" and roof_pitch to 0 (portfolio style requirement)
6. Return ONLY valid JSON (no markdown, no explanations)

Generate the corrected DNA now (JSON only):`;

    try {
      const passBResponse = await callQwen(
        [{ role: "user", content: repairPrompt }],
        { temperature: 0.1, max_tokens: 4096 }
      );

      let passBContent = passBResponse.choices?.[0]?.message?.content || "";
      let passBJson = passBContent.trim();
      if (passBJson.startsWith("```")) {
        const match = passBJson.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
        if (match) passBJson = match[1];
      }
      passBJson = sanitizeJsonString(passBJson);
      rawDNA = JSON.parse(passBJson);
      logSuccess("Pass B: DNA repaired");
    } catch (e) {
      log(`   Pass B AI repair failed (${e.message}), applying deterministic fixes...`);
      if (!rawDNA.site) rawDNA.site = { polygon: [[0,0],[20,0],[20,22],[0,22]], area_m2: 450, orientation: 180, climate_zone: "temperate maritime", sun_path: "South optimal", wind_profile: "Prevailing SW" };
      if (!rawDNA.program) rawDNA.program = { floors: ctx.floorCount, rooms: [] };
      if (!rawDNA.style) rawDNA.style = {
        architecture: "Modern Contemporary",
        materials: [
          { name: "Red brick", hexColor: "#B8604E", application: "ground floor exterior walls" },
          { name: "White render", hexColor: "#F5F5F0", application: "first floor exterior walls" },
          { name: "Glass curtain", hexColor: "#D4E8F7", application: "feature windows" },
          { name: "Dark aluminium", hexColor: "#333333", application: "window frames, fascias" },
        ],
        windows: { pattern: "regular large format", proportion: "1:1.6", frameColor: "#333333" },
      };
      if (!rawDNA.geometry_rules) rawDNA.geometry_rules = { grid: "1.2m", max_span: "6m", roof_type: "flat", roof_pitch: 0, floor_to_floor_height: 2.9, wall_thickness: 0.3 };
    }
  }

  // Enforce program schedule lock
  rawDNA.program = rawDNA.program || {};
  rawDNA.program.floors = ctx.floorCount;
  rawDNA.program.rooms = ctx.programSpaces.map((room) => ({
    name: room.name,
    area_m2: room.area_m2,
    floor: room.floor,
    orientation: room.orientation || "any",
  }));

  // Enforce portfolio style: flat roof
  if (rawDNA.geometry_rules) {
    rawDNA.geometry_rules.roof_type = "flat";
    rawDNA.geometry_rules.roof_pitch = 0;
  }

  // Ensure portfolio materials are present
  const matNames = (rawDNA.style?.materials || []).map(m => m.name?.toLowerCase() || "");
  if (!matNames.some(n => n.includes("brick"))) {
    rawDNA.style = rawDNA.style || {};
    rawDNA.style.materials = rawDNA.style.materials || [];
    rawDNA.style.materials.unshift({ name: "Red brick", hexColor: "#B8604E", application: "ground floor exterior walls" });
  }
  if (!matNames.some(n => n.includes("render"))) {
    rawDNA.style.materials.push({ name: "White render", hexColor: "#F5F5F0", application: "first floor exterior walls" });
  }

  endTimer("dna_generation");
  const elapsed = timings.dna_generation.duration;
  log(`   DNA generation took ${(elapsed / 1000).toFixed(1)}s`);
  log(`   Rooms: ${rawDNA.program.rooms.length}, Floors: ${rawDNA.program.floors}`);
  log(`   Style: ${rawDNA.style?.architecture || "N/A"}`);
  log(`   Roof: ${rawDNA.geometry_rules?.roof_type || "N/A"} (pitch: ${rawDNA.geometry_rules?.roof_pitch || 0}°)`);
  log(`   Materials: ${(rawDNA.style?.materials || []).map(m => `${m.name} ${m.hexColor}`).join(", ")}`);

  return rawDNA;
}

// ─── Seed Derivation ────────────────────────────────────────────────────────

function deriveSeeds(dna) {
  logStep(2, "Deterministic Seed Derivation");
  const dnaStr = JSON.stringify(dna);
  const baseSeed = djb2Hash(dnaStr) % 1000000;
  log(`   Base seed: ${baseSeed}`);

  const panelKeys = [
    "hero_3d", "interior_3d", "axonometric", "site_diagram",
    "floor_plan_ground", "floor_plan_first",
    "elevation_north", "elevation_south", "elevation_east", "elevation_west",
    "section_AA", "section_BB",
  ];

  const seedMap = {};
  for (const key of panelKeys) {
    seedMap[key] = derivePanelSeed(baseSeed, key);
  }

  log(`   Derived ${Object.keys(seedMap).length} panel seeds`);
  return { baseSeed, seedMap };
}

// ─── SVG Panel Generation (Canonical Geometry Pack) ─────────────────────────

function generateSVGFloorPlan(dna, floorName, floorIndex) {
  const rooms = (dna.program?.rooms || []).filter((r) => r.floor === floorName);
  const totalArea = rooms.reduce((s, r) => s + r.area_m2, 0);
  const circulationArea = totalArea * 0.15;
  const grossArea = totalArea + circulationArea;

  const aspectRatio = 1.25;
  const buildingDepth = Math.sqrt(grossArea / aspectRatio);
  const buildingWidth = grossArea / buildingDepth;
  const wallT = 0.3;

  const scale = 50;
  const svgW = Math.ceil(buildingWidth * scale) + 120;
  const svgH = Math.ceil(buildingDepth * scale) + 120;
  const ox = 60;
  const oy = 50;

  // Two-column layout
  const sorted = [...rooms].sort((a, b) => b.area_m2 - a.area_m2);
  const leftRooms = [];
  const rightRooms = [];
  let leftArea = 0, rightArea = 0;

  for (const room of sorted) {
    if (leftArea <= rightArea) {
      leftRooms.push(room);
      leftArea += room.area_m2;
    } else {
      rightRooms.push(room);
      rightArea += room.area_m2;
    }
  }

  const leftW = buildingWidth * (leftArea / (leftArea + rightArea + circulationArea * 0.5)) - wallT;
  const corridorW = 1.2;
  const rightW = buildingWidth - leftW - corridorW - wallT * 3;

  const roomRects = [];

  let y = wallT;
  for (const room of leftRooms) {
    const h = room.area_m2 / leftW;
    roomRects.push({ ...room, x: wallT, y, w: leftW, h: Math.max(h, 2.0) });
    y += Math.max(h, 2.0) + wallT * 0.33;
  }

  y = wallT;
  const rightX = wallT + leftW + corridorW;
  for (const room of rightRooms) {
    const h = room.area_m2 / Math.max(rightW, 2);
    roomRects.push({ ...room, x: rightX, y, w: Math.max(rightW, 2), h: Math.max(h, 2.0) });
    y += Math.max(h, 2.0) + wallT * 0.33;
  }

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">
  <style>
    .wall { fill: none; stroke: #1a1a1a; stroke-width: 3; }
    .room-fill { fill: #f8f6f0; stroke: #999; stroke-width: 0.5; }
    .room-label { font-family: Arial, sans-serif; font-size: 10px; fill: #333; text-anchor: middle; }
    .dim-label { font-family: Arial, sans-serif; font-size: 8px; fill: #666; text-anchor: middle; }
    .title { font-family: Arial, sans-serif; font-size: 14px; fill: #1a1a1a; font-weight: bold; }
    .dim-line { stroke: #999; stroke-width: 0.5; marker-end: url(#arrowhead); marker-start: url(#arrowhead); }
    .section-line { stroke: #cc0000; stroke-width: 1.5; stroke-dasharray: 8,4; }
  </style>
  <defs>
    <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="3" refY="2" orient="auto">
      <polygon points="0 0, 6 2, 0 4" fill="#999"/>
    </marker>
  </defs>

  <text x="${svgW / 2}" y="20" class="title" text-anchor="middle">${floorName.charAt(0).toUpperCase() + floorName.slice(1)} Floor Plan</text>

  <rect x="${ox}" y="${oy}" width="${buildingWidth * scale}" height="${buildingDepth * scale}" class="wall" stroke-width="6"/>
  <rect x="${ox + 1}" y="${oy + 1}" width="${buildingWidth * scale - 2}" height="${buildingDepth * scale - 2}" fill="#f0ede5" stroke="none"/>
`;

  for (const r of roomRects) {
    const rx = ox + r.x * scale;
    const ry = oy + r.y * scale;
    const rw = r.w * scale;
    const rh = r.h * scale;

    svg += `  <rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" class="room-fill"/>
  <rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" class="wall" stroke-width="2"/>
  <text x="${rx + rw / 2}" y="${ry + rh / 2 - 5}" class="room-label">${r.name}</text>
  <text x="${rx + rw / 2}" y="${ry + rh / 2 + 10}" class="dim-label">${r.w.toFixed(1)}×${r.h.toFixed(1)}m (${r.area_m2}m²)</text>
`;
  }

  svg += `  <line x1="${ox}" y1="${oy + buildingDepth * scale + 20}" x2="${ox + buildingWidth * scale}" y2="${oy + buildingDepth * scale + 20}" class="dim-line"/>
  <text x="${ox + (buildingWidth * scale) / 2}" y="${oy + buildingDepth * scale + 35}" class="dim-label">${buildingWidth.toFixed(1)}m</text>
  <line x1="${ox + buildingWidth * scale + 20}" y1="${oy}" x2="${ox + buildingWidth * scale + 20}" y2="${oy + buildingDepth * scale}" class="dim-line"/>
  <text x="${ox + buildingWidth * scale + 35}" y="${oy + (buildingDepth * scale) / 2}" class="dim-label" transform="rotate(90, ${ox + buildingWidth * scale + 35}, ${oy + (buildingDepth * scale) / 2})">${buildingDepth.toFixed(1)}m</text>

  <g transform="translate(${svgW - 40}, ${svgH - 40})">
    <polygon points="0,-15 5,5 -5,5" fill="#1a1a1a"/>
    <text x="0" y="15" class="dim-label" text-anchor="middle">N</text>
  </g>

  <line x1="${ox - 10}" y1="${oy + buildingDepth * scale * 0.5}" x2="${ox + buildingWidth * scale + 10}" y2="${oy + buildingDepth * scale * 0.5}" class="section-line"/>
  <text x="${ox - 15}" y="${oy + buildingDepth * scale * 0.5 + 4}" font-size="10" fill="#cc0000" font-weight="bold">A</text>
  <text x="${ox + buildingWidth * scale + 12}" y="${oy + buildingDepth * scale * 0.5 + 4}" font-size="10" fill="#cc0000" font-weight="bold">A</text>
</svg>`;
  return svg;
}

function generateSVGElevation(dna, orientation) {
  const buildingWidth = 15;
  const buildingHeight = 6.0; // flat roof = no roof overhang
  const groundFloorH = 3.0;
  const firstFloorH = 3.0;
  const scale = 50;
  const svgW = buildingWidth * scale + 100;
  const svgH = buildingHeight * scale + 100;
  const ox = 50;
  const oy = svgH - 50 - buildingHeight * scale;

  const materials = dna.style?.materials || [];
  const brickColor = materials.find((m) => m.application?.includes("ground"))?.hexColor || "#B8604E";
  const renderColor = materials.find((m) => m.application?.includes("first") || m.application?.includes("upper") || m.application?.includes("render"))?.hexColor || "#F5F5F0";
  const frameColor = dna.style?.windows?.frameColor || "#333333";

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">
  <style>
    .wall-outline { fill: none; stroke: #1a1a1a; stroke-width: 2; }
    .ground-level { stroke: #666; stroke-width: 1; stroke-dasharray: 4,2; }
    .window { fill: #b3d4fc; stroke: ${frameColor}; stroke-width: 2; }
    .door { fill: #8B6914; stroke: #333; stroke-width: 1.5; }
    .label { font-family: Arial, sans-serif; font-size: 10px; fill: #333; text-anchor: middle; }
    .title { font-family: Arial, sans-serif; font-size: 14px; fill: #1a1a1a; font-weight: bold; }
    .dim-label { font-family: Arial, sans-serif; font-size: 8px; fill: #666; text-anchor: middle; }
    .parapet { fill: #666; stroke: #333; stroke-width: 1; }
  </style>

  <text x="${svgW / 2}" y="20" class="title" text-anchor="middle">${orientation} Elevation</text>

  <line x1="0" y1="${oy + buildingHeight * scale}" x2="${svgW}" y2="${oy + buildingHeight * scale}" class="ground-level"/>

  <!-- Ground floor (brick) -->
  <rect x="${ox}" y="${oy + firstFloorH * scale}" width="${buildingWidth * scale}" height="${groundFloorH * scale}" fill="${brickColor}" class="wall-outline"/>

  <!-- First floor (white render) -->
  <rect x="${ox}" y="${oy}" width="${buildingWidth * scale}" height="${firstFloorH * scale}" fill="${renderColor}" class="wall-outline"/>

  <!-- Flat roof parapet -->
  <rect x="${ox - 3}" y="${oy - 8}" width="${buildingWidth * scale + 6}" height="10" class="parapet"/>

  <!-- Floor line (expressed transition) -->
  <line x1="${ox}" y1="${oy + firstFloorH * scale}" x2="${ox + buildingWidth * scale}" y2="${oy + firstFloorH * scale}" stroke="#555" stroke-width="3"/>
`;

  // Windows — large format, portfolio style
  const windowCount = orientation === "South" ? 5 : orientation === "North" ? 4 : 3;
  const windowW = 1.4 * scale; // larger windows per portfolio
  const windowH = 1.6 * scale;
  const spacing = (buildingWidth * scale) / (windowCount + 1);

  for (let i = 1; i <= windowCount; i++) {
    const wx = ox + spacing * i - windowW / 2;
    // Ground floor windows (in brick)
    svg += `  <rect x="${wx}" y="${oy + firstFloorH * scale + groundFloorH * scale * 0.2}" width="${windowW}" height="${windowH}" class="window"/>
`;
    // First floor windows (in render)
    svg += `  <rect x="${wx}" y="${oy + firstFloorH * scale * 0.15}" width="${windowW}" height="${windowH}" class="window"/>
`;
  }

  // Door (main entrance on North)
  if (orientation === "North") {
    const doorW = 1.2 * scale;
    const doorH = 2.4 * scale;
    svg += `  <rect x="${ox + (buildingWidth * scale) / 2 - doorW / 2}" y="${oy + buildingHeight * scale - doorH}" width="${doorW}" height="${doorH}" class="door"/>
`;
  }

  // South patio doors
  if (orientation === "South") {
    const patioDoorW = 3.0 * scale;
    const patioDoorH = 2.4 * scale;
    svg += `  <rect x="${ox + (buildingWidth * scale) / 2 - patioDoorW / 2}" y="${oy + buildingHeight * scale - patioDoorH}" width="${patioDoorW}" height="${patioDoorH}" fill="#b3d4fc" stroke="${frameColor}" stroke-width="2"/>
`;
  }

  svg += `
  <text x="${ox + (buildingWidth * scale) / 2}" y="${oy + buildingHeight * scale + 25}" class="dim-label">${buildingWidth.toFixed(1)}m</text>
  <text x="${ox - 25}" y="${oy + buildingHeight * scale / 2}" class="dim-label" transform="rotate(-90, ${ox - 25}, ${oy + buildingHeight * scale / 2})">${buildingHeight.toFixed(1)}m</text>
</svg>`;
  return svg;
}

function generateSVGSection(dna, sectionType) {
  const buildingWidth = sectionType === "longitudinal" ? 15 : 12;
  const buildingHeight = 6.0;
  const groundFloorH = 3.0;
  const firstFloorH = 3.0;
  const scale = 50;
  const svgW = buildingWidth * scale + 100;
  const svgH = buildingHeight * scale + 120;
  const ox = 50;
  const oy = svgH - 60 - buildingHeight * scale;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">
  <style>
    .cut-fill { fill: #e0d8c8; stroke: #1a1a1a; stroke-width: 2; }
    .slab { fill: #999; stroke: #1a1a1a; stroke-width: 1.5; }
    .ground { fill: #c8b896; }
    .label { font-family: Arial, sans-serif; font-size: 10px; fill: #333; text-anchor: middle; }
    .title { font-family: Arial, sans-serif; font-size: 14px; fill: #1a1a1a; font-weight: bold; }
    .dim-label { font-family: Arial, sans-serif; font-size: 8px; fill: #666; text-anchor: middle; }
    .flat-roof { fill: #888; stroke: #1a1a1a; stroke-width: 2; }
  </style>

  <text x="${svgW / 2}" y="20" class="title" text-anchor="middle">Section ${sectionType === "longitudinal" ? "A-A" : "B-B"} (${sectionType})</text>

  <!-- Ground -->
  <rect x="0" y="${oy + buildingHeight * scale}" width="${svgW}" height="40" class="ground"/>

  <!-- Foundation -->
  <rect x="${ox - 10}" y="${oy + buildingHeight * scale}" width="${buildingWidth * scale + 20}" height="20" class="slab"/>

  <!-- External walls (cut) -->
  <rect x="${ox}" y="${oy}" width="15" height="${buildingHeight * scale}" class="cut-fill"/>
  <rect x="${ox + buildingWidth * scale - 15}" y="${oy}" width="15" height="${buildingHeight * scale}" class="cut-fill"/>

  <!-- First floor slab -->
  <rect x="${ox}" y="${oy + firstFloorH * scale}" width="${buildingWidth * scale}" height="12" class="slab"/>

  <!-- Flat roof slab -->
  <rect x="${ox - 5}" y="${oy - 8}" width="${buildingWidth * scale + 10}" height="16" class="flat-roof"/>

  <!-- Room labels -->
  <text x="${ox + buildingWidth * scale * 0.3}" y="${oy + firstFloorH * scale + groundFloorH * scale * 0.5}" class="label">Living</text>
  <text x="${ox + buildingWidth * scale * 0.7}" y="${oy + firstFloorH * scale + groundFloorH * scale * 0.5}" class="label">Kitchen</text>
  <text x="${ox + buildingWidth * scale * 0.3}" y="${oy + firstFloorH * scale * 0.5}" class="label">Master Bed</text>
  <text x="${ox + buildingWidth * scale * 0.7}" y="${oy + firstFloorH * scale * 0.5}" class="label">Bedroom 2</text>

  <!-- Height dimensions -->
  <text x="${ox - 20}" y="${oy + firstFloorH * scale + groundFloorH * scale * 0.5}" class="dim-label" transform="rotate(-90, ${ox - 20}, ${oy + firstFloorH * scale + groundFloorH * scale * 0.5})">GF ${groundFloorH}m</text>
  <text x="${ox - 35}" y="${oy + firstFloorH * scale * 0.5}" class="dim-label" transform="rotate(-90, ${ox - 35}, ${oy + firstFloorH * scale * 0.5})">FF ${firstFloorH}m</text>
</svg>`;
  return svg;
}

async function generateCanonicalPack(dna) {
  logStep(3, "Canonical Geometry Pack (SVG Panels)");
  startTimer("canonical_pack");

  const svgDir = join(OUTPUT_DIR, "canonical_pack");
  await ensureDir(svgDir);

  const panels = {};

  logSubStep("Generating floor plan SVGs...");
  panels.floor_plan_ground = generateSVGFloorPlan(dna, "ground", 0);
  await writeFile(join(svgDir, "floor_plan_ground.svg"), panels.floor_plan_ground);
  panels.floor_plan_first = generateSVGFloorPlan(dna, "first", 1);
  await writeFile(join(svgDir, "floor_plan_first.svg"), panels.floor_plan_first);

  logSubStep("Generating elevation SVGs (flat roof, brick+render)...");
  for (const orient of ["North", "South", "East", "West"]) {
    const key = `elevation_${orient.toLowerCase()}`;
    panels[key] = generateSVGElevation(dna, orient);
    await writeFile(join(svgDir, `${key}.svg`), panels[key]);
  }

  logSubStep("Generating section SVGs (flat roof)...");
  panels.section_AA = generateSVGSection(dna, "longitudinal");
  await writeFile(join(svgDir, "section_AA.svg"), panels.section_AA);
  panels.section_BB = generateSVGSection(dna, "transverse");
  await writeFile(join(svgDir, "section_BB.svg"), panels.section_BB);

  endTimer("canonical_pack");
  logSuccess(`Canonical pack: ${Object.keys(panels).length} SVG panels in ${(timings.canonical_pack.duration / 1000).toFixed(1)}s`);
  return panels;
}

// ─── FLUX Panel Generation with Portfolio Style Conditioning ────────────────

function buildPanelPrompt(dna, panelType) {
  const style = dna.style || {};
  const materials = (style.materials || [])
    .map((m) => `${m.name} (${m.hexColor || "#888"}) on ${m.application || "surfaces"}`)
    .join(", ");
  const arch = style.architecture || "Modern Contemporary";
  const floors = dna.program?.floors || 2;
  const frameColor = style.windows?.frameColor || "#333333";

  const baseDesc = `A ${floors}-storey detached ${arch} house with FLAT ROOF and concealed parapet. Ground floor: red/brown BRICK walls (#B8604E). First floor: clean WHITE RENDER (#F5F5F0). Material change at floor line. Large rectangular windows with dark aluminium frames (${frameColor}). UK residential style, Richmond London. EXACTLY ${floors} storeys. Clean cubic massing.`;

  const prompts = {
    hero_3d: `Professional architectural exterior photograph of ${baseDesc} Photorealistic, golden hour lighting, front 3/4 perspective view showing main entrance and garden. Ground floor is warm red-brown brick, upper floor is crisp white render. Flat roof with clean parapet line. Large windows with dark frames. Crisp details, architectural photography quality. Canon EOS R5, 24mm lens. Landscaped front garden with stone path to entrance. Real building, not a render.`,

    interior_3d: `Professional architectural interior photograph of the open-plan living room inside ${baseDesc} South-facing floor-to-ceiling windows flooding the space with natural light. Warm oak engineered wood flooring, white plastered walls, minimalist modern furniture. Kitchen island visible in background. Double-height ceiling in living area. Photorealistic, architectural interior photography. Warm natural lighting.`,

    axonometric: `Clean architectural axonometric projection diagram of ${baseDesc} True isometric 30-degree view showing all four facades and FLAT roof. Ground floor brick, upper floor white render clearly differentiated. Technical drawing style with thin black outlines, material textures indicated. White background, no shadows. Professional architectural presentation quality. All windows shown.`,

    site_diagram: `Architectural site plan diagram showing ${baseDesc} viewed from above. Rectangular site boundary (450m²) shown as dashed line, building footprint as solid rectangle. Flat roof clearly shown from above. Garden layout with trees, driveway to north, patio to south. North arrow, scale bar. Clean technical drawing style, minimal colors. Professional quality site plan.`,
  };

  return prompts[panelType] || `Architectural view of ${baseDesc}`;
}

function buildNegativePrompt(panelType) {
  const base = "blurry, low quality, distorted, deformed, text overlay, watermark, signature, logo, multiple buildings, house catalog, collage, grid layout, placeholder, sketch, gable roof, pitched roof, sloped roof";

  const extras = {
    hero_3d: ", interior view, floor plan, diagram, aerial view, render wireframe",
    interior_3d: ", exterior view, floor plan, diagram, aerial view, construction site",
    axonometric: ", perspective view, photorealistic, shadows, people, cars",
    site_diagram: ", 3D view, perspective, photorealistic, interior, elevation",
  };

  return base + (extras[panelType] || "");
}

async function generateFluxPanels(dna, seedMap, portfolioRefs) {
  logStep(4, "FLUX Panel Generation (Portfolio Style-Conditioned)");

  if (SKIP_FLUX) {
    log("   --skip-flux flag set, skipping FLUX generation");
    return {};
  }

  startTimer("flux_panels");
  const fluxDir = join(OUTPUT_DIR, "flux_panels");
  await ensureDir(fluxDir);

  const fluxPanels = ["hero_3d", "axonometric", "interior_3d", "site_diagram"];
  const guidanceScales = {
    hero_3d: 5.0,
    interior_3d: 4.5,
    axonometric: 6.0,
    site_diagram: 6.5,
  };

  const results = {};
  const useImg2Img = !NO_IMG2IMG && Object.keys(portfolioRefs).length > 0;

  if (useImg2Img) {
    logPortfolio(`img2img ENABLED — strength: ${IMG2IMG_STRENGTH} (${Math.round(IMG2IMG_STRENGTH * 100)}% portfolio style blend)`);
  } else {
    log(`   img2img DISABLED — text-to-image only`);
  }

  for (const panelType of fluxPanels) {
    logSubStep(`Generating ${panelType}...`);
    const prompt = buildPanelPrompt(dna, panelType);
    const negPrompt = buildNegativePrompt(panelType);
    const seed = seedMap[panelType] || Math.floor(Math.random() * 999999);
    const guidance = guidanceScales[panelType] || 7.8;

    // Panel-specific dimensions
    let width = 1024, height = 1024;
    if (panelType === "hero_3d") { width = 1344; height = 768; }
    if (panelType === "interior_3d") { width = 1344; height = 768; }
    if (panelType === "axonometric") { width = 1024; height = 1024; }
    if (panelType === "site_diagram") { width = 1024; height = 1024; }

    // Build options
    const options = {
      negativePrompt: negPrompt,
      seed,
      guidanceScale: guidance,
      steps: FLUX_STEPS,
      width,
      height,
    };

    // Add portfolio style reference if available
    if (useImg2Img && portfolioRefs[panelType]) {
      options.initImage = portfolioRefs[panelType].base64;
      options.imageStrength = IMG2IMG_STRENGTH;
      logPortfolio(`  Using ${portfolioRefs[panelType].filename} as style ref (${portfolioRefs[panelType].sizeKB}KB)`);
    }

    try {
      const result = await callFlux(prompt, options);

      const imageUrl = result?.data?.[0]?.url || result?.data?.[0]?.b64_json;
      if (imageUrl) {
        let imageBuffer;
        if (imageUrl.startsWith("http")) {
          const imgResp = await fetch(imageUrl);
          imageBuffer = Buffer.from(await imgResp.arrayBuffer());
        } else {
          imageBuffer = Buffer.from(imageUrl, "base64");
        }

        const filePath = join(fluxDir, `${panelType}.png`);
        await writeFile(filePath, imageBuffer);
        results[panelType] = {
          buffer: imageBuffer,
          seed,
          model: FLUX_MODEL,
          img2img: useImg2Img && !!portfolioRefs[panelType],
          styleRef: portfolioRefs[panelType]?.filename || null,
        };
        logSuccess(`${panelType}: saved (${(imageBuffer.length / 1024).toFixed(0)}KB, seed=${seed}${results[panelType].img2img ? ", img2img" : ""})`);
      } else {
        logError(`${panelType}: No image URL in response`);
        results[panelType] = null;
      }
    } catch (e) {
      logError(`${panelType}: ${e.message}`);
      results[panelType] = null;

      if (e.message.includes("402") || e.message.includes("429") || e.message.includes("credit")) {
        log(`\n${C.red}${C.bold}⚠️  API CREDIT/RATE LIMIT REACHED ⚠️${C.reset}`);
        log(`   Please add credits at https://api.together.ai/settings/billing`);
        break;
      }
    }

    // Rate limit delay
    if (fluxPanels.indexOf(panelType) < fluxPanels.length - 1) {
      log(`   Waiting ${PANEL_DELAY_MS / 1000}s for rate limit...`);
      await delay(PANEL_DELAY_MS);
    }
  }

  endTimer("flux_panels");
  const generated = Object.values(results).filter(Boolean).length;
  const withStyle = Object.values(results).filter(r => r?.img2img).length;
  log(`   FLUX panels: ${generated}/${fluxPanels.length} generated (${withStyle} with portfolio style) in ${(timings.flux_panels.duration / 1000).toFixed(1)}s`);
  return results;
}

// ─── A1 Sheet Composition ───────────────────────────────────────────────────

async function composeA1Sheet(dna, svgPanels, fluxPanels) {
  logStep(5, "A1 Sheet Composition (Sharp)");
  startTimer("a1_compose");

  const sharp = require("sharp");

  const sheetW = A1_WIDTH;
  const sheetH = A1_HEIGHT;
  const margin = 20;
  const titleBlockH = 60;

  let canvas = sharp({
    create: {
      width: sheetW,
      height: sheetH,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  }).png();

  const composites = [];

  const topRowY = margin;
  const topRowH = Math.floor((sheetH - titleBlockH - margin * 4) * 0.40);
  const midRowY = topRowY + topRowH + margin;
  const midRowH = Math.floor((sheetH - titleBlockH - margin * 4) * 0.35);
  const botRowY = midRowY + midRowH + margin;
  const botRowH = sheetH - titleBlockH - botRowY - margin;

  async function svgToBuffer(svgStr, targetW, targetH) {
    try {
      const svgBuf = Buffer.from(svgStr);
      return await sharp(svgBuf)
        .resize(targetW, targetH, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toBuffer();
    } catch (e) {
      return await sharp({
        create: { width: targetW, height: targetH, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } },
      }).png().toBuffer();
    }
  }

  async function resizeBuffer(buf, targetW, targetH) {
    return await sharp(buf)
      .resize(targetW, targetH, { fit: "cover" })
      .png()
      .toBuffer();
  }

  // ─── TOP ROW: 3D Views ───
  const heroW = Math.floor((sheetW - margin * 4) * 0.45);
  if (fluxPanels.hero_3d?.buffer) {
    const buf = await resizeBuffer(fluxPanels.hero_3d.buffer, heroW, topRowH);
    composites.push({ input: buf, left: margin, top: topRowY });
  }

  const axonW = Math.floor((sheetW - margin * 4 - heroW) * 0.5);
  if (fluxPanels.axonometric?.buffer) {
    const buf = await resizeBuffer(fluxPanels.axonometric.buffer, axonW, topRowH);
    composites.push({ input: buf, left: margin * 2 + heroW, top: topRowY });
  }

  if (fluxPanels.interior_3d?.buffer) {
    const intW = sheetW - margin * 3 - heroW - axonW;
    const buf = await resizeBuffer(fluxPanels.interior_3d.buffer, intW, topRowH);
    composites.push({ input: buf, left: margin * 3 + heroW + axonW, top: topRowY });
  }

  // ─── MIDDLE ROW: Plans + Site ───
  const planW = Math.floor((sheetW - margin * 4) / 3);

  if (svgPanels.floor_plan_ground) {
    const buf = await svgToBuffer(svgPanels.floor_plan_ground, planW, midRowH);
    composites.push({ input: buf, left: margin, top: midRowY });
  }

  if (svgPanels.floor_plan_first) {
    const buf = await svgToBuffer(svgPanels.floor_plan_first, planW, midRowH);
    composites.push({ input: buf, left: margin * 2 + planW, top: midRowY });
  }

  if (fluxPanels.site_diagram?.buffer) {
    const siteW = sheetW - margin * 3 - planW * 2;
    const buf = await resizeBuffer(fluxPanels.site_diagram.buffer, siteW, midRowH);
    composites.push({ input: buf, left: margin * 3 + planW * 2, top: midRowY });
  }

  // ─── BOTTOM ROW: Elevations + Sections ───
  const elevCount = 4;
  const sectCount = 2;
  const totalBot = elevCount + sectCount;
  const botPanelW = Math.floor((sheetW - margin * (totalBot + 1)) / totalBot);

  const elevations = ["elevation_north", "elevation_south", "elevation_east", "elevation_west"];
  for (let i = 0; i < elevations.length; i++) {
    const key = elevations[i];
    if (svgPanels[key]) {
      const buf = await svgToBuffer(svgPanels[key], botPanelW, botRowH);
      composites.push({ input: buf, left: margin + (botPanelW + margin) * i, top: botRowY });
    }
  }

  const sections = ["section_AA", "section_BB"];
  for (let i = 0; i < sections.length; i++) {
    const key = sections[i];
    if (svgPanels[key]) {
      const buf = await svgToBuffer(svgPanels[key], botPanelW, botRowH);
      composites.push({ input: buf, left: margin + (botPanelW + margin) * (elevCount + i), top: botRowY });
    }
  }

  // ─── TITLE BLOCK ───
  const titleBlockY = sheetH - titleBlockH;
  const modelName = FLUX_MODEL.split("/").pop();
  const materialsList = (dna.style?.materials || []).slice(0, 5);

  const titleSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}" height="${titleBlockH}">
    <rect x="0" y="0" width="${sheetW}" height="${titleBlockH}" fill="#1a1a1a"/>
    <text x="20" y="25" font-family="Arial, sans-serif" font-size="16" fill="white" font-weight="bold">ArchiAI Platform — A1 Architectural Sheet (Portfolio Style: Rohan Thomas Mathew)</text>
    <text x="20" y="45" font-family="Arial, sans-serif" font-size="11" fill="#ccc">Project: 4-Bed Detached House | Location: Richmond, London TW9 | Area: 180m² | Style: ${dna.style?.architecture || "Modern Contemporary"} | Roof: Flat</text>
    <text x="${sheetW - 20}" y="25" font-family="Arial, sans-serif" font-size="10" fill="#888" text-anchor="end">Generated: ${new Date().toISOString().slice(0, 10)}</text>
    <text x="${sheetW - 20}" y="45" font-family="Arial, sans-serif" font-size="10" fill="#888" text-anchor="end">Model: ${modelName} | img2img: ${!NO_IMG2IMG ? "ON" : "OFF"} | Strength: ${IMG2IMG_STRENGTH}</text>

    <!-- Material palette swatches -->
    ${materialsList.map((m, i) => {
      const sx = sheetW / 2 - 100 + i * 45;
      return `<rect x="${sx}" y="8" width="20" height="20" fill="${m.hexColor || "#888"}" stroke="#fff" stroke-width="1" rx="2"/>
      <text x="${sx + 10}" y="42" font-family="Arial, sans-serif" font-size="7" fill="#aaa" text-anchor="middle">${(m.name || "").slice(0, 8)}</text>`;
    }).join("\n    ")}
  </svg>`;

  const titleBuf = await sharp(Buffer.from(titleSVG)).png().toBuffer();
  composites.push({ input: titleBuf, left: 0, top: titleBlockY });

  // ─── Panel Labels ───
  const labelSVG = (text, w = 200, h = 18) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect x="0" y="0" width="${w}" height="${h}" fill="rgba(0,0,0,0.6)" rx="2"/>
    <text x="5" y="13" font-family="Arial, sans-serif" font-size="10" fill="white">${text}</text>
  </svg>`;

  const labels = [
    { text: "01 — Exterior 3D (Portfolio Style)", x: margin + 5, y: topRowY + 5 },
    { text: "02 — Axonometric", x: margin * 2 + heroW + 5, y: topRowY + 5 },
    { text: "03 — Interior View", x: margin * 3 + heroW + axonW + 5, y: topRowY + 5 },
    { text: "04 — Ground Floor Plan", x: margin + 5, y: midRowY + 5 },
    { text: "05 — First Floor Plan", x: margin * 2 + planW + 5, y: midRowY + 5 },
    { text: "06 — Site Diagram", x: margin * 3 + planW * 2 + 5, y: midRowY + 5 },
  ];

  for (let i = 0; i < elevations.length; i++) {
    labels.push({
      text: `${String(7 + i).padStart(2, "0")} — ${elevations[i].replace("elevation_", "").replace(/^\w/, c => c.toUpperCase())} Elevation`,
      x: margin + (botPanelW + margin) * i + 5,
      y: botRowY + 5,
    });
  }
  for (let i = 0; i < sections.length; i++) {
    labels.push({
      text: `${String(11 + i).padStart(2, "0")} — Section ${sections[i].replace("section_", "")}`,
      x: margin + (botPanelW + margin) * (elevCount + i) + 5,
      y: botRowY + 5,
    });
  }

  for (const label of labels) {
    try {
      const buf = await sharp(Buffer.from(labelSVG(label.text))).png().toBuffer();
      composites.push({ input: buf, left: label.x, top: label.y });
    } catch {}
  }

  // ─── Compose final A1 sheet ───
  const a1Buffer = await canvas.composite(composites).toBuffer();
  const outPath = join(OUTPUT_DIR, "a1_sheet_portfolio.png");
  await writeFile(outPath, a1Buffer);

  endTimer("a1_compose");
  logSuccess(`A1 sheet composed: ${(a1Buffer.length / 1024 / 1024).toFixed(2)}MB → ${outPath}`);
  return a1Buffer;
}

// ─── Test Report ────────────────────────────────────────────────────────────

async function writeTestReport(dna, seedMap, fluxPanels) {
  costs.total = costs.qwen + costs.flux;

  const report = {
    testName: "Portfolio-Integrated A1 Sheet Generation (REAL TEST)",
    timestamp: new Date().toISOString(),
    config: {
      fluxModel: FLUX_MODEL,
      fluxSteps: FLUX_STEPS,
      img2img: !NO_IMG2IMG,
      img2imgStrength: IMG2IMG_STRENGTH,
      portfolioSource: "Rohan Thomas Mathew - BIM Workflow Portfolio",
      portfolioFile: "0e7f1236-41db-422f-bfc0-aeef2452d9dd.pdf",
    },
    dna: {
      style: dna.style?.architecture,
      roof: dna.geometry_rules?.roof_type,
      roofPitch: dna.geometry_rules?.roof_pitch,
      floors: dna.program?.floors,
      rooms: dna.program?.rooms?.length,
      materials: dna.style?.materials?.map(m => `${m.name} ${m.hexColor}`),
    },
    panels: {
      svg: 8,
      flux: Object.values(fluxPanels).filter(Boolean).length,
      fluxWithStyle: Object.values(fluxPanels).filter(r => r?.img2img).length,
    },
    timings: Object.fromEntries(
      Object.entries(timings).map(([k, v]) => [k, `${(v.duration / 1000).toFixed(1)}s`])
    ),
    costs: {
      qwen: `$${costs.qwen.toFixed(4)}`,
      flux: `$${costs.flux.toFixed(4)}`,
      total: `$${costs.total.toFixed(4)}`,
    },
    tokens: totalTokens,
    seeds: seedMap,
  };

  const reportPath = join(OUTPUT_DIR, "test_report_portfolio.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  logSuccess(`Test report: ${reportPath}`);
  return report;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${C.bold}${C.magenta}╔══════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.magenta}║  🎨 REAL PORTFOLIO A1 Sheet Generation Test                  ║${C.reset}`);
  console.log(`${C.bold}${C.magenta}║  Portfolio: Rohan Thomas Mathew — BIM Architect              ║${C.reset}`);
  console.log(`${C.bold}${C.magenta}║  Project: 4-Bed Detached House, Richmond London              ║${C.reset}`);
  console.log(`${C.bold}${C.magenta}║  Model: ${FLUX_MODEL.split("/").pop().padEnd(49)}║${C.reset}`);
  console.log(`${C.bold}${C.magenta}║  img2img: ${(!NO_IMG2IMG ? `ON (strength ${IMG2IMG_STRENGTH})` : "OFF").padEnd(47)}║${C.reset}`);
  console.log(`${C.bold}${C.magenta}╚══════════════════════════════════════════════════════════════╝${C.reset}\n`);

  startTimer("total");

  // Check server
  log("Checking server connectivity...");
  const serverOk = await checkServerConnectivity();
  if (!serverOk) {
    logError("Express server not reachable on port 3001. Run: node server.cjs");
    process.exit(1);
  }
  logSuccess("Server connected");

  // Create output directory
  await ensureDir(OUTPUT_DIR);

  // Step 0: Load portfolio images
  const portfolioRefs = await loadPortfolioImages();

  // Step 1: Generate DNA
  const dna = await generateDNA();
  await writeFile(join(OUTPUT_DIR, "masterDNA.json"), JSON.stringify(dna, null, 2));

  // Step 2: Derive seeds
  const { baseSeed, seedMap } = deriveSeeds(dna);

  // Step 3: Canonical geometry pack (SVGs)
  const svgPanels = await generateCanonicalPack(dna);

  // Step 4: FLUX panels with portfolio style
  const fluxPanels = await generateFluxPanels(dna, seedMap, portfolioRefs);

  // Step 5: A1 sheet composition
  const a1Buffer = await composeA1Sheet(dna, svgPanels, fluxPanels);

  // Step 6: Test report
  const report = await writeTestReport(dna, seedMap, fluxPanels);

  endTimer("total");

  // ─── Summary ───
  console.log(`\n${C.bold}${C.green}═══════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}${C.green}  ✅ PORTFOLIO REAL TEST COMPLETE${C.reset}`);
  console.log(`${C.green}  ─────────────────────────────────────────────────────${C.reset}`);
  console.log(`  📁 Output:   ${OUTPUT_DIR}`);
  console.log(`  🎨 Style:    ${dna.style?.architecture} (flat roof, brick+render)`);
  console.log(`  🏗️  Panels:   ${report.panels.svg} SVG + ${report.panels.flux} FLUX (${report.panels.fluxWithStyle} with portfolio style)`);
  console.log(`  ⏱️  Time:     ${(timings.total.duration / 1000).toFixed(1)}s total`);
  console.log(`  💰 Cost:     ${report.costs.total}`);
  console.log(`  🖼️  A1 Sheet: ${(a1Buffer.length / 1024 / 1024).toFixed(2)}MB`);
  console.log(`  📊 Model:    ${FLUX_MODEL.split("/").pop()}`);
  console.log(`  🎯 img2img:  ${!NO_IMG2IMG ? `ON (${IMG2IMG_STRENGTH})` : "OFF"}`);
  console.log(`${C.bold}${C.green}═══════════════════════════════════════════════════════${C.reset}\n`);
}

main().catch((e) => {
  logError(`Fatal: ${e.message}`);
  console.error(e);
  process.exit(1);
});

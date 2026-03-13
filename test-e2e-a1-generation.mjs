#!/usr/bin/env node
/**
 * End-to-End A1 Sheet Generation Test
 *
 * Runs the full multi-panel A1 generation pipeline headlessly:
 *   1. DNA generation (two-pass via Qwen)
 *   2. DNA validation
 *   3. Canonical geometry pack (SVG panels)
 *   4. Deterministic seed derivation
 *   5. FLUX panel generation (hero_3d, axonometric, interior_3d, site_diagram)
 *   6. A1 sheet composition (Sharp-based)
 *   7. Save all outputs to e2e_output/
 *
 * Prerequisites:
 *   npm run server   (Express proxy on port 3001)
 *
 * Usage:
 *   node test-e2e-a1-generation.mjs
 *   node test-e2e-a1-generation.mjs --schnell    # Use free FLUX.1-schnell (default)
 *   node test-e2e-a1-generation.mjs --pro        # Use FLUX.1.1-pro ($0.04/MP)
 *   node test-e2e-a1-generation.mjs --skip-flux  # Skip FLUX calls, SVG-only
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
const OUTPUT_DIR = join(__dirname, "e2e_output");
const ARGS = process.argv.slice(2);
const USE_PRO = ARGS.includes("--pro");
const SKIP_FLUX = ARGS.includes("--skip-flux");
const FLUX_MODEL = USE_PRO
  ? "black-forest-labs/FLUX.1.1-pro"
  : "black-forest-labs/FLUX.1-schnell";
const FLUX_STEPS = USE_PRO ? 28 : 12;
const QWEN_MODEL = "meta-llama/Llama-3.3-70B-Instruct-Turbo";

// A1 sheet dimensions (px) — landscape orientation
const A1_WIDTH = 1792;
const A1_HEIGHT = 1269;

// Panel generation delay (ms) — respect Together.ai rate limits
const PANEL_DELAY_MS = 6500;

// Colours for console
const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
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
    description: "Modern contemporary with BIM-driven precision",
    materials: ["Red/brown brick (#B8604E)", "White render (#F5F5F0)", "Glass curtain wall"],
    formLanguage: "Clean cubic volumes, flat/low-pitch roofs, large window openings",
  },
};

// Portfolio style hints (extracted from user's portfolio PDF)
const PORTFOLIO_STYLE = `
Portfolio Analysis (Rohan Thomas Mathew - BIM Architect):
- Architectural vocabulary: Modern contemporary, BIM-driven design
- Material palette: Red/brown brick (#B8604E), white render (#F5F5F0), glass curtain wall
- Form language: Clean cubic volumes, flat or low-pitch roofs, large window openings
- Detailing: Expressed structural grid, material transitions at floor lines
- Color temperature: Warm earth tones (brick, timber) with crisp white render accents
- Window style: Large format, floor-to-ceiling where possible, aluminium frames
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDir(dir) {
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

// Simple DJB2 hash for seed derivation
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

// ─── API Call Functions ─────────────────────────────────────────────────────

async function checkServerConnectivity() {
  try {
    const resp = await fetch(`${SERVER_URL}/api/health`, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) return true;
  } catch {}
  // Try a simple GET on the root
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

  if (options.initImage) {
    body.init_image = options.initImage;
    body.image_strength = options.imageStrength || 0.35;
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
  // Estimate FLUX cost
  const megapixels = (body.width * body.height) / 1_000_000;
  costs.flux += USE_PRO ? megapixels * 0.04 : megapixels * 0.003;

  // Normalize response format — server returns { url, model, seed } directly
  // but some paths return { data: [{ url }] }
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
  logStep(1, "DNA Generation (Two-Pass via Qwen)");
  startTimer("dna_generation");

  const ctx = PROJECT_CONTEXT;
  const programSchedule = buildProgramScheduleText(ctx.programSpaces);

  // ─── Pass A: Author ───
  logSubStep("Pass A: Generating structured DNA (Author)...");

  const passAPrompt = `You are an expert architect. Generate a complete Master Design DNA in STRICT JSON format.

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
        "floor": "ground|first|second|...",
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
    "roof_type": "gable|hip|flat|butterfly|mono-pitch",
    "roof_pitch": number,
    "floor_to_floor_height": number,
    "wall_thickness": number
  }
}

PROJECT REQUIREMENTS:
- Building Type: ${ctx.buildingProgram}
- Total Area: ${ctx.area}m²
- Floors: EXACTLY ${ctx.floorCount} (this is MANDATORY - do NOT change)
- Site Area: ${ctx.siteMetrics.polygonArea}m²
- Climate: ${ctx.location.climate.type}
- Location: ${ctx.location.address}
- Recommended Style: ${ctx.location.recommendedStyle}

${PORTFOLIO_STYLE}

MANDATORY PROGRAM SCHEDULE (LOCKED - DO NOT ALTER):
${programSchedule}

CRITICAL RULES:
1. ALL rooms must fit within the total area (${ctx.area}m²)
2. program.rooms must include ALL and ONLY the locked schedule entries above
3. Include circulation space (~15% of total area)
4. Respect site constraints (building must fit within ${ctx.siteMetrics.polygonArea}m² with setbacks)
5. Use materials appropriate for ${ctx.location.climate.type} climate
6. The building MUST have EXACTLY ${ctx.floorCount} floor(s)
7. Distribute rooms across ${ctx.floorCount} floors as specified in the schedule
8. Do NOT rename any room from the locked schedule
9. Do NOT change area_m2 values from the locked schedule
10. Do NOT change room floor assignments from the locked schedule
11. program.rooms length MUST be exactly ${ctx.programSpaces.length}
12. Include 3-5 materials with hex colors from the portfolio palette
13. Specify roof_type, roof_pitch, floor heights in geometry_rules

Generate the DNA now (JSON only):`;

  const passAResponse = await callQwen(
    [{ role: "user", content: passAPrompt }],
    { temperature: 0.3, max_tokens: 4096 }
  );

  let passAContent = passAResponse.choices?.[0]?.message?.content || "";
  let passAJson = passAContent.trim();
  // Strip markdown code fences
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
    // Try to extract JSON from the response
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

  // Basic validation
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
3. Ensure all required fields are present and correctly typed
4. Keep the building realistic and consistent
5. Preserve ALL locked program rooms exactly: same names, same area_m2, same floor assignments
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
      // Deterministic repair
      if (!rawDNA.site) rawDNA.site = { polygon: [[0,0],[20,0],[20,22],[0,22]], area_m2: 450, orientation: 180, climate_zone: "temperate maritime", sun_path: "South optimal", wind_profile: "Prevailing SW" };
      if (!rawDNA.program) rawDNA.program = { floors: ctx.floorCount, rooms: [] };
      if (!rawDNA.style) rawDNA.style = { architecture: "Modern Contemporary", materials: [{ name: "Red brick", hexColor: "#B8604E", application: "exterior walls" }, { name: "White render", hexColor: "#F5F5F0", application: "upper facade" }], windows: { pattern: "regular", proportion: "1:1.6", frameColor: "#333333" } };
      if (!rawDNA.geometry_rules) rawDNA.geometry_rules = { grid: "1.2m", max_span: "6m", roof_type: "gable", roof_pitch: 35, floor_to_floor_height: 2.8, wall_thickness: 0.3 };
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

  endTimer("dna_generation");
  const elapsed = timings.dna_generation.duration;
  log(`   DNA generation took ${(elapsed / 1000).toFixed(1)}s`);
  log(`   Rooms: ${rawDNA.program.rooms.length}, Floors: ${rawDNA.program.floors}`);
  log(`   Style: ${rawDNA.style?.architecture || "N/A"}`);
  log(`   Roof: ${rawDNA.geometry_rules?.roof_type || "N/A"}`);
  log(`   Materials: ${rawDNA.style?.materials?.length || 0}`);

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

  // Derive building envelope from gross area
  const aspectRatio = 1.25; // slightly rectangular
  const buildingDepth = Math.sqrt(grossArea / aspectRatio);
  const buildingWidth = grossArea / buildingDepth;
  const wallT = 0.3; // wall thickness in meters

  const scale = 50; // px per meter
  const svgW = Math.ceil(buildingWidth * scale) + 120;
  const svgH = Math.ceil(buildingDepth * scale) + 120;
  const ox = 60; // origin x offset
  const oy = 50; // origin y offset

  // Two-column room layout: left column (larger rooms) + right column (smaller)
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

  // Calculate column widths proportional to area
  const leftW = buildingWidth * (leftArea / (leftArea + rightArea + circulationArea * 0.5)) - wallT;
  const corridorW = 1.2; // 1.2m corridor
  const rightW = buildingWidth - leftW - corridorW - wallT * 3;

  const roomRects = [];

  // Place left column rooms
  let y = wallT;
  for (const room of leftRooms) {
    const h = room.area_m2 / leftW;
    roomRects.push({ ...room, x: wallT, y, w: leftW, h: Math.max(h, 2.0) });
    y += Math.max(h, 2.0) + wallT * 0.33;
  }

  // Place right column rooms
  y = wallT;
  const rightX = wallT + leftW + corridorW;
  for (const room of rightRooms) {
    const h = room.area_m2 / Math.max(rightW, 2);
    roomRects.push({ ...room, x: rightX, y, w: Math.max(rightW, 2), h: Math.max(h, 2.0) });
    y += Math.max(h, 2.0) + wallT * 0.33;
  }

  // Generate SVG
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">
  <style>
    .wall { fill: none; stroke: #1a1a1a; stroke-width: 3; }
    .wall-fill { fill: #2a2a2a; }
    .room-fill { fill: #f8f6f0; stroke: #999; stroke-width: 0.5; }
    .room-label { font-family: Arial, sans-serif; font-size: 10px; fill: #333; text-anchor: middle; }
    .dim-label { font-family: Arial, sans-serif; font-size: 8px; fill: #666; text-anchor: middle; }
    .title { font-family: Arial, sans-serif; font-size: 14px; fill: #1a1a1a; font-weight: bold; }
    .door { fill: none; stroke: #1a1a1a; stroke-width: 1.5; }
    .window { fill: #b3d4fc; stroke: #1a1a1a; stroke-width: 1; }
    .dim-line { stroke: #999; stroke-width: 0.5; marker-end: url(#arrowhead); marker-start: url(#arrowhead); }
    .north-arrow { fill: #1a1a1a; }
    .section-line { stroke: #cc0000; stroke-width: 1.5; stroke-dasharray: 8,4; }
  </style>
  <defs>
    <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="3" refY="2" orient="auto">
      <polygon points="0 0, 6 2, 0 4" fill="#999"/>
    </marker>
  </defs>

  <!-- Title -->
  <text x="${svgW / 2}" y="20" class="title" text-anchor="middle">${floorName.charAt(0).toUpperCase() + floorName.slice(1)} Floor Plan</text>

  <!-- Building outline (external walls) -->
  <rect x="${ox}" y="${oy}" width="${buildingWidth * scale}" height="${buildingDepth * scale}" class="wall" stroke-width="6"/>
  <rect x="${ox + 1}" y="${oy + 1}" width="${buildingWidth * scale - 2}" height="${buildingDepth * scale - 2}" fill="#f0ede5" stroke="none"/>
`;

  // Draw rooms
  for (const r of roomRects) {
    const rx = ox + r.x * scale;
    const ry = oy + r.y * scale;
    const rw = r.w * scale;
    const rh = r.h * scale;

    // Room fill
    svg += `  <!-- ${r.name} -->
  <rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" class="room-fill"/>
  <rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" class="wall" stroke-width="2"/>
  <text x="${rx + rw / 2}" y="${ry + rh / 2 - 5}" class="room-label">${r.name}</text>
  <text x="${rx + rw / 2}" y="${ry + rh / 2 + 10}" class="dim-label">${r.w.toFixed(1)}×${r.h.toFixed(1)}m (${r.area_m2}m²)</text>
`;
  }

  // External dimensions
  svg += `  <!-- Dimensions -->
  <line x1="${ox}" y1="${oy + buildingDepth * scale + 20}" x2="${ox + buildingWidth * scale}" y2="${oy + buildingDepth * scale + 20}" class="dim-line"/>
  <text x="${ox + (buildingWidth * scale) / 2}" y="${oy + buildingDepth * scale + 35}" class="dim-label">${buildingWidth.toFixed(1)}m</text>
  <line x1="${ox + buildingWidth * scale + 20}" y1="${oy}" x2="${ox + buildingWidth * scale + 20}" y2="${oy + buildingDepth * scale}" class="dim-line"/>
  <text x="${ox + buildingWidth * scale + 35}" y="${oy + (buildingDepth * scale) / 2}" class="dim-label" transform="rotate(90, ${ox + buildingWidth * scale + 35}, ${oy + (buildingDepth * scale) / 2})">${buildingDepth.toFixed(1)}m</text>

  <!-- North arrow -->
  <g transform="translate(${svgW - 40}, ${svgH - 40})">
    <polygon points="0,-15 5,5 -5,5" class="north-arrow"/>
    <text x="0" y="15" class="dim-label" text-anchor="middle">N</text>
  </g>

  <!-- Section cut lines -->
  <line x1="${ox - 10}" y1="${oy + buildingDepth * scale * 0.5}" x2="${ox + buildingWidth * scale + 10}" y2="${oy + buildingDepth * scale * 0.5}" class="section-line"/>
  <text x="${ox - 15}" y="${oy + buildingDepth * scale * 0.5 + 4}" font-size="10" fill="#cc0000" font-weight="bold">A</text>
  <text x="${ox + buildingWidth * scale + 12}" y="${oy + buildingDepth * scale * 0.5 + 4}" font-size="10" fill="#cc0000" font-weight="bold">A</text>
`;

  svg += `</svg>`;
  return svg;
}

function generateSVGElevation(dna, orientation) {
  const buildingWidth = 15;
  const buildingHeight = 7.4;
  const groundFloorH = 3.0;
  const firstFloorH = 2.8;
  const roofH = buildingHeight - groundFloorH - firstFloorH;
  const scale = 50;
  const svgW = buildingWidth * scale + 100;
  const svgH = buildingHeight * scale + 100;
  const ox = 50;
  const oy = svgH - 50 - buildingHeight * scale;

  const materials = dna.style?.materials || [];
  const brickColor = materials.find((m) => m.application?.includes("wall"))?.hexColor || "#B8604E";
  const renderColor = materials.find((m) => m.application?.includes("render") || m.application?.includes("upper"))?.hexColor || "#F5F5F0";
  const roofType = dna.geometry_rules?.roof_type || "gable";
  const roofPitch = dna.geometry_rules?.roof_pitch || 35;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">
  <style>
    .wall-outline { fill: none; stroke: #1a1a1a; stroke-width: 2; }
    .ground-level { stroke: #666; stroke-width: 1; stroke-dasharray: 4,2; }
    .window { fill: #b3d4fc; stroke: #333; stroke-width: 1.5; }
    .door { fill: #8B6914; stroke: #333; stroke-width: 1.5; }
    .label { font-family: Arial, sans-serif; font-size: 10px; fill: #333; text-anchor: middle; }
    .title { font-family: Arial, sans-serif; font-size: 14px; fill: #1a1a1a; font-weight: bold; }
    .dim-label { font-family: Arial, sans-serif; font-size: 8px; fill: #666; text-anchor: middle; }
  </style>

  <text x="${svgW / 2}" y="20" class="title" text-anchor="middle">${orientation} Elevation</text>

  <!-- Ground line -->
  <line x1="0" y1="${oy + buildingHeight * scale}" x2="${svgW}" y2="${oy + buildingHeight * scale}" class="ground-level"/>

  <!-- Ground floor (brick) -->
  <rect x="${ox}" y="${oy + (firstFloorH + roofH) * scale}" width="${buildingWidth * scale}" height="${groundFloorH * scale}" fill="${brickColor}" class="wall-outline"/>

  <!-- First floor (render) -->
  <rect x="${ox}" y="${oy + roofH * scale}" width="${buildingWidth * scale}" height="${firstFloorH * scale}" fill="${renderColor}" class="wall-outline"/>
`;

  // Roof
  if (roofType === "gable" || roofType === "pitched") {
    const peakY = oy;
    const baseY = oy + roofH * scale;
    if (orientation === "North" || orientation === "South") {
      svg += `  <polygon points="${ox},${baseY} ${ox + (buildingWidth * scale) / 2},${peakY} ${ox + buildingWidth * scale},${baseY}" fill="#8B7355" stroke="#333" stroke-width="2"/>`;
    } else {
      svg += `  <rect x="${ox}" y="${peakY}" width="${buildingWidth * scale}" height="${roofH * scale}" fill="#8B7355" stroke="#333" stroke-width="2"/>`;
    }
  } else if (roofType === "flat") {
    svg += `  <rect x="${ox - 5}" y="${oy + roofH * scale - 5}" width="${buildingWidth * scale + 10}" height="10" fill="#666" stroke="#333" stroke-width="1"/>`;
  } else {
    // hip roof
    const peakY = oy;
    const baseY = oy + roofH * scale;
    svg += `  <polygon points="${ox},${baseY} ${ox + (buildingWidth * scale) * 0.15},${peakY} ${ox + (buildingWidth * scale) * 0.85},${peakY} ${ox + buildingWidth * scale},${baseY}" fill="#8B7355" stroke="#333" stroke-width="2"/>`;
  }

  // Windows
  const windowCount = orientation === "South" ? 5 : orientation === "North" ? 4 : 3;
  const windowW = 1.2 * scale;
  const windowH = 1.4 * scale;
  const spacing = (buildingWidth * scale) / (windowCount + 1);

  for (let i = 1; i <= windowCount; i++) {
    const wx = ox + spacing * i - windowW / 2;
    // Ground floor windows
    svg += `  <rect x="${wx}" y="${oy + (firstFloorH + roofH) * scale + groundFloorH * scale * 0.25}" width="${windowW}" height="${windowH}" class="window"/>`;
    // First floor windows
    svg += `  <rect x="${wx}" y="${oy + roofH * scale + firstFloorH * scale * 0.2}" width="${windowW}" height="${windowH}" class="window"/>`;
  }

  // Door (main entrance on North)
  if (orientation === "North") {
    const doorW = 1.0 * scale;
    const doorH = 2.2 * scale;
    svg += `  <rect x="${ox + (buildingWidth * scale) / 2 - doorW / 2}" y="${oy + buildingHeight * scale - doorH}" width="${doorW}" height="${doorH}" class="door"/>`;
  }

  // Dimensions
  svg += `
  <text x="${ox + (buildingWidth * scale) / 2}" y="${oy + buildingHeight * scale + 25}" class="dim-label">${buildingWidth.toFixed(1)}m</text>
  <text x="${ox - 25}" y="${oy + buildingHeight * scale / 2}" class="dim-label" transform="rotate(-90, ${ox - 25}, ${oy + buildingHeight * scale / 2})">${buildingHeight.toFixed(1)}m</text>
`;

  svg += `</svg>`;
  return svg;
}

function generateSVGSection(dna, sectionType) {
  const buildingWidth = sectionType === "longitudinal" ? 15 : 12;
  const buildingHeight = 7.4;
  const groundFloorH = 3.0;
  const firstFloorH = 2.8;
  const roofH = buildingHeight - groundFloorH - firstFloorH;
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
    .hatch { stroke: #999; stroke-width: 0.5; }
  </style>

  <text x="${svgW / 2}" y="20" class="title" text-anchor="middle">Section ${sectionType === "longitudinal" ? "A-A" : "B-B"} (${sectionType})</text>

  <!-- Ground -->
  <rect x="0" y="${oy + buildingHeight * scale}" width="${svgW}" height="40" class="ground"/>

  <!-- Foundation -->
  <rect x="${ox - 10}" y="${oy + buildingHeight * scale}" width="${buildingWidth * scale + 20}" height="20" class="slab"/>

  <!-- External walls (cut) -->
  <rect x="${ox}" y="${oy + roofH * scale}" width="15" height="${(groundFloorH + firstFloorH) * scale}" class="cut-fill"/>
  <rect x="${ox + buildingWidth * scale - 15}" y="${oy + roofH * scale}" width="15" height="${(groundFloorH + firstFloorH) * scale}" class="cut-fill"/>

  <!-- Ground floor slab -->
  <rect x="${ox}" y="${oy + (roofH + firstFloorH) * scale}" width="${buildingWidth * scale}" height="12" class="slab"/>

  <!-- Ceiling/floor slab -->
  <rect x="${ox}" y="${oy + roofH * scale}" width="${buildingWidth * scale}" height="12" class="slab"/>

  <!-- Roof -->
  <polygon points="${ox},${oy + roofH * scale} ${ox + (buildingWidth * scale) / 2},${oy} ${ox + buildingWidth * scale},${oy + roofH * scale}" fill="none" stroke="#1a1a1a" stroke-width="2"/>

  <!-- Room labels -->
  <text x="${ox + buildingWidth * scale * 0.3}" y="${oy + (roofH + firstFloorH) * scale + groundFloorH * scale * 0.5}" class="label">Living</text>
  <text x="${ox + buildingWidth * scale * 0.7}" y="${oy + (roofH + firstFloorH) * scale + groundFloorH * scale * 0.5}" class="label">Kitchen</text>
  <text x="${ox + buildingWidth * scale * 0.3}" y="${oy + roofH * scale + firstFloorH * scale * 0.5}" class="label">Master Bed</text>
  <text x="${ox + buildingWidth * scale * 0.7}" y="${oy + roofH * scale + firstFloorH * scale * 0.5}" class="label">Bedroom 2</text>

  <!-- Height dimensions -->
  <text x="${ox - 20}" y="${oy + (roofH + firstFloorH) * scale + groundFloorH * scale * 0.5}" class="dim-label" transform="rotate(-90, ${ox - 20}, ${oy + (roofH + firstFloorH) * scale + groundFloorH * scale * 0.5})">GF ${groundFloorH}m</text>
  <text x="${ox - 35}" y="${oy + roofH * scale + firstFloorH * scale * 0.5}" class="dim-label" transform="rotate(-90, ${ox - 35}, ${oy + roofH * scale + firstFloorH * scale * 0.5})">FF ${firstFloorH}m</text>
`;

  svg += `</svg>`;
  return svg;
}

async function generateCanonicalPack(dna) {
  logStep(3, "Canonical Geometry Pack (SVG Panels)");
  startTimer("canonical_pack");

  const svgDir = join(OUTPUT_DIR, "canonical_pack");
  await ensureDir(svgDir);

  const panels = {};

  // Floor plans
  logSubStep("Generating floor plan SVGs...");
  panels.floor_plan_ground = generateSVGFloorPlan(dna, "ground", 0);
  await writeFile(join(svgDir, "floor_plan_ground.svg"), panels.floor_plan_ground);
  panels.floor_plan_first = generateSVGFloorPlan(dna, "first", 1);
  await writeFile(join(svgDir, "floor_plan_first.svg"), panels.floor_plan_first);

  // Elevations
  logSubStep("Generating elevation SVGs...");
  for (const orient of ["North", "South", "East", "West"]) {
    const key = `elevation_${orient.toLowerCase()}`;
    panels[key] = generateSVGElevation(dna, orient);
    await writeFile(join(svgDir, `${key}.svg`), panels[key]);
  }

  // Sections
  logSubStep("Generating section SVGs...");
  panels.section_AA = generateSVGSection(dna, "longitudinal");
  await writeFile(join(svgDir, "section_AA.svg"), panels.section_AA);
  panels.section_BB = generateSVGSection(dna, "transverse");
  await writeFile(join(svgDir, "section_BB.svg"), panels.section_BB);

  endTimer("canonical_pack");
  logSuccess(`Canonical pack: ${Object.keys(panels).length} SVG panels generated in ${(timings.canonical_pack.duration / 1000).toFixed(1)}s`);
  return panels;
}

// ─── FLUX Panel Generation ──────────────────────────────────────────────────

function buildPanelPrompt(dna, panelType) {
  const style = dna.style || {};
  const materials = (style.materials || [])
    .map((m) => `${m.name} (${m.hexColor || "#888"}) on ${m.application || "surfaces"}`)
    .join(", ");
  const roofType = dna.geometry_rules?.roof_type || "gable";
  const roofPitch = dna.geometry_rules?.roof_pitch || 35;
  const arch = style.architecture || "Modern Contemporary";
  const floors = dna.program?.floors || 2;

  const roofDesc = roofType === "flat" ? "flat roof with parapet edge" : `${roofType} roof (${roofPitch}°)`;
  const baseDesc = `A ${floors}-storey detached ${arch} house with ${roofDesc}. Materials: ${materials}. UK residential style, Richmond London. EXACTLY ${floors} storeys.`;

  const prompts = {
    hero_3d: `Professional architectural exterior photograph of ${baseDesc} Photorealistic, golden hour lighting, front 3/4 perspective view showing main entrance and garden. Crisp details, architectural photography quality. Canon EOS R5, 24mm lens. Clean landscaped front garden with path to entrance.`,

    interior_3d: `Professional architectural interior photograph of the living room inside ${baseDesc} Open-plan living-kitchen space with south-facing floor-to-ceiling windows, natural light flooding in. Modern furniture, warm wood flooring, clean minimalist interior. Photorealistic, architectural interior photography.`,

    axonometric: `Clean architectural axonometric projection diagram of ${baseDesc} True isometric 30-degree view showing all four facades and roof. Technical drawing style with thin black outlines, material textures indicated. White background, no shadows. Professional architectural presentation quality.`,

    site_diagram: `Architectural site plan diagram showing a ${baseDesc} viewed from above. Site boundary shown as dashed line, building footprint as solid. Garden layout with trees, driveway, north arrow, scale bar. Clean technical drawing style, minimal colors, professional quality.`,
  };

  return prompts[panelType] || `Architectural view of ${baseDesc}`;
}

function buildNegativePrompt(panelType) {
  const base = "blurry, low quality, distorted, deformed, text, watermark, signature, logo, multiple buildings, house catalog, collage, grid layout, placeholder, sketch";

  const extras = {
    hero_3d: ", interior view, floor plan, diagram, aerial view",
    interior_3d: ", exterior view, floor plan, diagram, aerial view",
    axonometric: ", perspective view, photorealistic, shadows, people",
    site_diagram: ", 3D view, perspective, photorealistic, interior",
  };

  return base + (extras[panelType] || "");
}

async function generateFluxPanels(dna, seedMap) {
  logStep(4, "FLUX Panel Generation");

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

  for (const panelType of fluxPanels) {
    logSubStep(`Generating ${panelType}...`);
    const prompt = buildPanelPrompt(dna, panelType);
    const negPrompt = buildNegativePrompt(panelType);
    const seed = seedMap[panelType] || Math.floor(Math.random() * 999999);
    const guidance = guidanceScales[panelType] || 7.8;

    // Adjust dimensions per panel type
    let width = 1024, height = 1024;
    if (panelType === "hero_3d") { width = 1344; height = 768; }
    if (panelType === "interior_3d") { width = 1344; height = 768; }
    if (panelType === "axonometric") { width = 1024; height = 1024; }
    if (panelType === "site_diagram") { width = 1024; height = 1024; }

    try {
      const result = await callFlux(prompt, {
        negativePrompt: negPrompt,
        seed,
        guidanceScale: guidance,
        steps: FLUX_STEPS,
        width,
        height,
      });

      const imageUrl = result?.data?.[0]?.url || result?.data?.[0]?.b64_json;
      if (imageUrl) {
        // Download the image
        let imageBuffer;
        if (imageUrl.startsWith("http")) {
          const imgResp = await fetch(imageUrl);
          imageBuffer = Buffer.from(await imgResp.arrayBuffer());
        } else {
          // base64
          imageBuffer = Buffer.from(imageUrl, "base64");
        }

        const filePath = join(fluxDir, `${panelType}.png`);
        await writeFile(filePath, imageBuffer);
        results[panelType] = { buffer: imageBuffer, seed, model: FLUX_MODEL };
        logSuccess(`${panelType}: saved (${(imageBuffer.length / 1024).toFixed(0)}KB, seed=${seed})`);
      } else {
        logError(`${panelType}: No image URL in response`);
        results[panelType] = null;
      }
    } catch (e) {
      logError(`${panelType}: ${e.message}`);
      results[panelType] = null;

      // Check for credit/rate limit errors
      if (e.message.includes("402") || e.message.includes("429") || e.message.includes("credit")) {
        log(`\n${C.red}${C.bold}⚠️  API CREDIT/RATE LIMIT REACHED ⚠️${C.reset}`);
        log(`   Please add credits at https://api.together.ai/settings/billing`);
        log(`   Or wait for rate limit to reset.\n`);
        break;
      }
    }

    // Rate limit delay between panels
    if (fluxPanels.indexOf(panelType) < fluxPanels.length - 1) {
      log(`   Waiting ${PANEL_DELAY_MS / 1000}s for rate limit...`);
      await delay(PANEL_DELAY_MS);
    }
  }

  endTimer("flux_panels");
  const generated = Object.values(results).filter(Boolean).length;
  log(`   FLUX panels: ${generated}/${fluxPanels.length} generated in ${(timings.flux_panels.duration / 1000).toFixed(1)}s`);
  return results;
}

// ─── A1 Sheet Composition ───────────────────────────────────────────────────

async function composeA1Sheet(dna, svgPanels, fluxPanels) {
  logStep(5, "A1 Sheet Composition (Sharp)");
  startTimer("a1_compose");

  const sharp = require("sharp");

  // A1 landscape dimensions
  const sheetW = A1_WIDTH;
  const sheetH = A1_HEIGHT;
  const margin = 20;
  const titleBlockH = 60;

  // Create base canvas (white background)
  let canvas = sharp({
    create: {
      width: sheetW,
      height: sheetH,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  }).png();

  const composites = [];

  // ─── Layout Grid ───
  // Row 1 (top): hero_3d (large left), axonometric + interior_3d (stacked right)
  // Row 2 (mid): ground plan, first plan, site diagram
  // Row 3 (bot): 4 elevations + 2 sections
  // Footer: title block + material palette

  const topRowY = margin;
  const topRowH = Math.floor((sheetH - titleBlockH - margin * 4) * 0.40);
  const midRowY = topRowY + topRowH + margin;
  const midRowH = Math.floor((sheetH - titleBlockH - margin * 4) * 0.35);
  const botRowY = midRowY + midRowH + margin;
  const botRowH = sheetH - titleBlockH - botRowY - margin;

  // Helper: convert SVG string to PNG buffer
  async function svgToBuffer(svgStr, targetW, targetH) {
    try {
      const svgBuf = Buffer.from(svgStr);
      return await sharp(svgBuf)
        .resize(targetW, targetH, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toBuffer();
    } catch (e) {
      // Create a placeholder
      return await sharp({
        create: { width: targetW, height: targetH, channels: 4, background: { r: 240, g: 240, b: 240, alpha: 1 } },
      }).png().toBuffer();
    }
  }

  // Helper: resize image buffer
  async function resizeBuffer(buf, targetW, targetH) {
    return await sharp(buf)
      .resize(targetW, targetH, { fit: "cover" })
      .png()
      .toBuffer();
  }

  // ─── TOP ROW: 3D Views ───
  const col3w = Math.floor((sheetW - margin * 4) / 3);

  // Hero 3D (left, larger)
  const heroW = Math.floor((sheetW - margin * 4) * 0.45);
  if (fluxPanels.hero_3d?.buffer) {
    const buf = await resizeBuffer(fluxPanels.hero_3d.buffer, heroW, topRowH);
    composites.push({ input: buf, left: margin, top: topRowY });
  }

  // Axonometric (middle)
  const axonW = Math.floor((sheetW - margin * 4 - heroW) * 0.5);
  if (fluxPanels.axonometric?.buffer) {
    const buf = await resizeBuffer(fluxPanels.axonometric.buffer, axonW, topRowH);
    composites.push({ input: buf, left: margin * 2 + heroW, top: topRowY });
  }

  // Interior 3D (right)
  if (fluxPanels.interior_3d?.buffer) {
    const intW = sheetW - margin * 3 - heroW - axonW;
    const buf = await resizeBuffer(fluxPanels.interior_3d.buffer, intW, topRowH);
    composites.push({ input: buf, left: margin * 3 + heroW + axonW, top: topRowY });
  }

  // ─── MIDDLE ROW: Plans + Site ───
  const planW = Math.floor((sheetW - margin * 4) / 3);

  // Ground floor plan
  if (svgPanels.floor_plan_ground) {
    const buf = await svgToBuffer(svgPanels.floor_plan_ground, planW, midRowH);
    composites.push({ input: buf, left: margin, top: midRowY });
  }

  // First floor plan
  if (svgPanels.floor_plan_first) {
    const buf = await svgToBuffer(svgPanels.floor_plan_first, planW, midRowH);
    composites.push({ input: buf, left: margin * 2 + planW, top: midRowY });
  }

  // Site diagram
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

  // ─── TITLE BLOCK (SVG overlay) ───
  const titleBlockY = sheetH - titleBlockH;
  const titleSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetW}" height="${titleBlockH}">
    <rect x="0" y="0" width="${sheetW}" height="${titleBlockH}" fill="#1a1a1a"/>
    <text x="20" y="25" font-family="Arial, sans-serif" font-size="16" fill="white" font-weight="bold">ArchiAI Platform — A1 Architectural Sheet</text>
    <text x="20" y="45" font-family="Arial, sans-serif" font-size="11" fill="#ccc">Project: 4-Bed Detached House | Location: Richmond, London TW9 | Area: 180m² | Floors: 2 | Style: ${dna.style?.architecture || "Modern Contemporary"}</text>
    <text x="${sheetW - 20}" y="25" font-family="Arial, sans-serif" font-size="10" fill="#888" text-anchor="end">Generated: ${new Date().toISOString().slice(0, 10)}</text>
    <text x="${sheetW - 20}" y="45" font-family="Arial, sans-serif" font-size="10" fill="#888" text-anchor="end">Model: ${FLUX_MODEL.split("/").pop()} | Roof: ${dna.geometry_rules?.roof_type || "gable"}</text>

    <!-- Material palette swatches -->
    ${(dna.style?.materials || []).slice(0, 5).map((m, i) => {
      const sx = sheetW / 2 - 100 + i * 45;
      return `<rect x="${sx}" y="8" width="20" height="20" fill="${m.hexColor || "#888"}" stroke="#fff" stroke-width="1" rx="2"/>
      <text x="${sx + 10}" y="42" font-family="Arial, sans-serif" font-size="7" fill="#aaa" text-anchor="middle">${(m.name || "").slice(0, 8)}</text>`;
    }).join("\n    ")}
  </svg>`;

  const titleBuf = await sharp(Buffer.from(titleSVG)).png().toBuffer();
  composites.push({ input: titleBuf, left: 0, top: titleBlockY });

  // ─── Panel Labels (SVG overlays) ───
  const labelSVG = (text, w = 200, h = 18) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect x="0" y="0" width="${w}" height="${h}" fill="rgba(0,0,0,0.6)" rx="2"/>
    <text x="5" y="13" font-family="Arial, sans-serif" font-size="10" fill="white">${text}</text>
  </svg>`;

  // Add labels for key panels
  const labels = [
    { text: "01 — Exterior 3D View", x: margin + 5, y: topRowY + 5 },
    { text: "02 — Axonometric", x: margin * 2 + heroW + 5, y: topRowY + 5 },
    { text: "03 — Interior View", x: margin * 3 + heroW + axonW + 5, y: topRowY + 5 },
    { text: "04 — Ground Floor Plan", x: margin + 5, y: midRowY + 5 },
    { text: "05 — First Floor Plan", x: margin * 2 + planW + 5, y: midRowY + 5 },
    { text: "06 — Site Plan", x: margin * 3 + planW * 2 + 5, y: midRowY + 5 },
  ];

  for (const lbl of labels) {
    try {
      const buf = await sharp(Buffer.from(labelSVG(lbl.text))).png().toBuffer();
      composites.push({ input: buf, left: lbl.x, top: lbl.y });
    } catch {}
  }

  // Compose all layers
  if (composites.length > 0) {
    const result = await canvas.composite(composites).png().toBuffer();
    const outputPath = join(OUTPUT_DIR, "a1_sheet.png");
    await writeFile(outputPath, result);

    endTimer("a1_compose");
    logSuccess(`A1 sheet composed: ${(result.length / 1024).toFixed(0)}KB, ${sheetW}×${sheetH}px`);
    log(`   Saved to: ${outputPath}`);
    log(`   Composited ${composites.length} layers in ${(timings.a1_compose.duration / 1000).toFixed(1)}s`);
    return outputPath;
  } else {
    endTimer("a1_compose");
    logError("No panels to compose!");
    return null;
  }
}

// ─── Test Report ────────────────────────────────────────────────────────────

async function writeTestReport(dna, seedMap, fluxResults, sheetPath) {
  logStep(6, "Test Report");

  costs.total = costs.qwen + costs.flux;

  const report = {
    timestamp: new Date().toISOString(),
    project: {
      type: PROJECT_CONTEXT.buildingProgram,
      area: PROJECT_CONTEXT.area,
      floors: PROJECT_CONTEXT.floorCount,
      location: PROJECT_CONTEXT.location.address,
    },
    model: {
      flux: FLUX_MODEL,
      qwen: QWEN_MODEL,
      fluxSteps: FLUX_STEPS,
    },
    timings: Object.fromEntries(
      Object.entries(timings).map(([k, v]) => [k, `${(v.duration / 1000).toFixed(1)}s`])
    ),
    totalDuration: `${((Date.now() - timings.total?.start || Date.now()) / 1000).toFixed(1)}s`,
    costs: {
      qwen: `$${costs.qwen.toFixed(4)}`,
      flux: `$${costs.flux.toFixed(4)}`,
      total: `$${costs.total.toFixed(4)}`,
    },
    tokens: totalTokens,
    panels: {
      svg: [
        "floor_plan_ground", "floor_plan_first",
        "elevation_north", "elevation_south", "elevation_east", "elevation_west",
        "section_AA", "section_BB",
      ],
      flux: Object.entries(fluxResults)
        .filter(([, v]) => v)
        .map(([k, v]) => ({ panel: k, seed: v.seed, model: v.model })),
      fluxFailed: Object.entries(fluxResults)
        .filter(([, v]) => !v)
        .map(([k]) => k),
    },
    dna: {
      style: dna.style?.architecture,
      roof: dna.geometry_rules?.roof_type,
      materials: (dna.style?.materials || []).length,
      rooms: (dna.program?.rooms || []).length,
      floors: dna.program?.floors,
    },
    seedMap,
    outputPath: sheetPath,
  };

  const reportPath = join(OUTPUT_DIR, "test_report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  log(`   Report saved to: ${reportPath}`);

  // Print summary
  console.log(`\n${C.bold}═══════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}                    E2E TEST SUMMARY${C.reset}`);
  console.log(`${C.bold}═══════════════════════════════════════════════════════════${C.reset}`);
  console.log(`  Model:     ${FLUX_MODEL.split("/").pop()}`);
  console.log(`  Steps:     ${FLUX_STEPS}`);
  console.log(`  SVG Panels: ${report.panels.svg.length}`);
  console.log(`  FLUX Panels: ${report.panels.flux.length}/${report.panels.flux.length + report.panels.fluxFailed.length}`);
  if (report.panels.fluxFailed.length > 0) {
    console.log(`  ${C.red}Failed:    ${report.panels.fluxFailed.join(", ")}${C.reset}`);
  }
  console.log(`  Cost:      ${report.costs.total}`);
  console.log(`  Tokens:    ${totalTokens}`);
  console.log(`  Duration:  ${report.totalDuration}`);
  console.log(`  Output:    ${sheetPath || "NONE"}`);
  console.log(`${C.bold}═══════════════════════════════════════════════════════════${C.reset}\n`);

  return report;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║       ArchiAI E2E A1 Sheet Generation Test               ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`  Model: ${FLUX_MODEL.split("/").pop()}`);
  console.log(`  Steps: ${FLUX_STEPS}`);
  console.log(`  Skip FLUX: ${SKIP_FLUX}`);
  console.log(`  Output: ${OUTPUT_DIR}\n`);

  startTimer("total");

  // Setup output directory
  await ensureDir(OUTPUT_DIR);
  await ensureDir(join(OUTPUT_DIR, "canonical_pack"));
  await ensureDir(join(OUTPUT_DIR, "flux_panels"));

  // Check server connectivity
  log("Checking Express server connectivity on port 3001...");
  const serverOk = await checkServerConnectivity();
  if (!serverOk) {
    logError("Express server not reachable on port 3001!");
    logError("Please start it with: npm run server");
    process.exit(1);
  }
  logSuccess("Express server is reachable");

  try {
    // Step 1: Generate DNA
    const dna = await generateDNA();
    await writeFile(join(OUTPUT_DIR, "masterDNA.json"), JSON.stringify(dna, null, 2));
    logSuccess("DNA saved to e2e_output/masterDNA.json");

    // Step 2: Derive seeds
    const { baseSeed, seedMap } = deriveSeeds(dna);

    // Step 3: Generate canonical geometry pack (SVG panels)
    const svgPanels = await generateCanonicalPack(dna);

    // Step 4: Generate FLUX panels
    const fluxPanels = await generateFluxPanels(dna, seedMap);

    // Step 5: Compose A1 sheet
    const sheetPath = await composeA1Sheet(dna, svgPanels, fluxPanels);

    // Step 6: Write test report
    endTimer("total");
    await writeTestReport(dna, seedMap, fluxPanels, sheetPath);

    // Open the output for visual inspection
    if (sheetPath) {
      log(`\nOpen the A1 sheet for inspection:`);
      log(`  ${sheetPath}`);
    }

  } catch (error) {
    endTimer("total");
    logError(`Pipeline failed: ${error.message}`);
    console.error(error.stack);

    // Still write partial report
    await writeTestReport({}, {}, {}, null);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});

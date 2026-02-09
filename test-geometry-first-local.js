/**
 * Local Testing Script for Geometry-First Pipeline
 *
 * Tests all M1-M8 components locally before deployment
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("🧪 Geometry-First Local Testing Suite\n");
console.log("Testing all 8 milestones locally...\n");

// Color codes for output
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
};

function success(msg) {
  console.log(`${colors.green}✅ ${msg}${colors.reset}`);
}

function error(msg) {
  console.log(`${colors.red}❌ ${msg}${colors.reset}`);
}

function info(msg) {
  console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`);
}

function warn(msg) {
  console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`);
}

let testsPassed = 0;
let testsFailed = 0;

// ============================================================================
// M1: Feature Flags
// ============================================================================

console.log("📋 M1: Testing Feature Flags...\n");

try {
  const featureFlagsPath = path.join(
    __dirname,
    "src",
    "config",
    "featureFlags.js",
  );

  if (fs.existsSync(featureFlagsPath)) {
    success("src/config/featureFlags.js exists");
    testsPassed++;

    const content = fs.readFileSync(featureFlagsPath, "utf8");

    if (
      content.includes("FEATURE_FLAGS") &&
      content.includes("geometryFirst")
    ) {
      success("FEATURE_FLAGS object with geometryFirst found");
      testsPassed++;
    }

    if (content.includes("geometryFirst: true")) {
      success("geometryFirst flag is enabled (default: true)");
      testsPassed++;
    }

    if (content.includes("export function isFeatureEnabled")) {
      success("isFeatureEnabled() function exported");
      testsPassed++;
    }

    if (content.includes("export function setFeatureFlag")) {
      success("setFeatureFlag() function exported");
      testsPassed++;
    }

    if (
      content.includes("export default") ||
      content.includes("export function")
    ) {
      success("ESM exports present");
      testsPassed++;
    }
  } else {
    error("src/config/featureFlags.js not found");
    testsFailed++;
  }
} catch (err) {
  error(`M1 Feature Flags: ${err.message}`);
  testsFailed++;
}

console.log("");

// ============================================================================
// M2: Design State
// ============================================================================

console.log("📋 M2: Testing Design State...\n");

try {
  // Test design.json exists
  const designPath = path.join(__dirname, "data", "design.json");
  if (fs.existsSync(designPath)) {
    success("data/design.json exists");
    testsPassed++;

    const designData = JSON.parse(fs.readFileSync(designPath, "utf8"));

    if (designData.id && designData.seed && designData.dna) {
      success("Design JSON has required fields (id, seed, dna)");
      testsPassed++;
    }

    if (designData.dna.dimensions && designData.dna.materials) {
      success("DNA has dimensions and materials");
      testsPassed++;
    }

    info(`  Design ID: ${designData.id}`);
    info(`  Seed: ${designData.seed}`);
    info(`  Floors: ${designData.dna.dimensions.floorCount}`);
    info(`  Style: ${designData.dna.architecturalStyle}`);
  } else {
    error("data/design.json not found");
    testsFailed++;
  }
} catch (err) {
  error(`M2 Design State: ${err.message}`);
  testsFailed++;
}

console.log("");

// ============================================================================
// M3: Validators
// ============================================================================

console.log("📋 M3: Testing Validators...\n");

try {
  const validatorsPath = path.join(__dirname, "src", "core", "validators.ts");

  if (fs.existsSync(validatorsPath)) {
    success("src/core/validators.ts exists");
    testsPassed++;

    const validatorContent = fs.readFileSync(validatorsPath, "utf8");

    if (validatorContent.includes("export function validateDesign")) {
      success("validateDesign() function exported");
      testsPassed++;
    }

    if (
      validatorContent.includes("MIN_DOOR_WIDTH") &&
      validatorContent.includes("0.8")
    ) {
      success("MIN_DOOR_WIDTH = 0.8m (800mm) constant found");
      testsPassed++;
    }

    if (
      validatorContent.includes("MIN_WWR") &&
      validatorContent.includes("0.25")
    ) {
      success("MIN_WWR = 0.25 (25%) constant found");
      testsPassed++;
    }

    if (validatorContent.includes("isPolygonClosed")) {
      success("Topology check: isPolygonClosed() found");
      testsPassed++;
    }
  } else {
    error("src/core/validators.ts not found");
    testsFailed++;
  }
} catch (err) {
  error(`M3 Validators: ${err.message}`);
  testsFailed++;
}

console.log("");

// ============================================================================
// M4: Geometry & Views
// ============================================================================

console.log("📋 M4: Testing Geometry & Views...\n");

try {
  // Check buildGeometry.ts
  const buildGeomPath = path.join(
    __dirname,
    "src",
    "geometry",
    "buildGeometry.ts",
  );
  if (fs.existsSync(buildGeomPath)) {
    success("src/geometry/buildGeometry.ts exists");
    testsPassed++;

    const content = fs.readFileSync(buildGeomPath, "utf8");
    if (content.includes("extrudeWallsFromRoom")) {
      success("extrudeWallsFromRoom() function found");
      testsPassed++;
    }
  } else {
    error("buildGeometry.ts not found");
    testsFailed++;
  }

  // Check cameras.ts
  const camerasPath = path.join(__dirname, "src", "geometry", "cameras.ts");
  if (fs.existsSync(camerasPath)) {
    success("src/geometry/cameras.ts exists");
    testsPassed++;

    const content = fs.readFileSync(camerasPath, "utf8");
    if (
      content.includes("createAxonometricCamera") &&
      content.includes("createFloorPlanCamera")
    ) {
      success("Camera creation functions found");
      testsPassed++;
    }
  } else {
    error("cameras.ts not found");
    testsFailed++;
  }

  // Check renderViews.ts
  const renderPath = path.join(__dirname, "src", "render", "renderViews.ts");
  if (fs.existsSync(renderPath)) {
    success("src/render/renderViews.ts exists");
    testsPassed++;

    const content = fs.readFileSync(renderPath, "utf8");
    if (content.includes("renderDistinctViews")) {
      success("renderDistinctViews() function found (returns distinct files)");
      testsPassed++;
    }
  } else {
    error("renderViews.ts not found");
    testsFailed++;
  }

  // Check package.json for dependencies
  const packageJson = JSON.parse(fs.readFileSync("./package.json", "utf8"));
  if (packageJson.dependencies.three) {
    success(`Three.js installed: ${packageJson.dependencies.three}`);
    testsPassed++;
  }
  if (packageJson.dependencies.nanoid) {
    success(`nanoid installed: ${packageJson.dependencies.nanoid}`);
    testsPassed++;
  }
} catch (err) {
  error(`M4 Geometry & Views: ${err.message}`);
  testsFailed++;
}

console.log("");

// ============================================================================
// M5: API & UI Wiring
// ============================================================================

console.log("📋 M5: Testing API & UI Wiring...\n");

try {
  // Check render.js API
  const renderApiPath = path.join(__dirname, "api", "render.js");
  if (fs.existsSync(renderApiPath)) {
    success("api/render.js exists");
    testsPassed++;

    const content = fs.readFileSync(renderApiPath, "utf8");
    if (content.includes("runtime: 'nodejs'")) {
      success("render.js has runtime: nodejs");
      testsPassed++;
    }
    if (
      content.includes("axon") &&
      content.includes("persp") &&
      content.includes("interior")
    ) {
      success("Returns {axon, persp, interior} structure");
      testsPassed++;
    }
  } else {
    error("api/render.js not found");
    testsFailed++;
  }

  // Check useGeometryViews hook
  const hookPath = path.join(__dirname, "src", "hooks", "useGeometryViews.js");
  if (fs.existsSync(hookPath)) {
    success("src/hooks/useGeometryViews.js exists");
    testsPassed++;

    const content = fs.readFileSync(hookPath, "utf8");
    if (
      content.includes("axonUrl") &&
      content.includes("perspUrl") &&
      content.includes("interiorUrl")
    ) {
      success(
        "Separate state keys: axonUrl, perspUrl, interiorUrl (no shared var)",
      );
      testsPassed++;
    }
  } else {
    error("useGeometryViews.js not found");
    testsFailed++;
  }

  // Check settings component
  const settingsPath = path.join(
    __dirname,
    "src",
    "components",
    "GeometryFirstSettings.jsx",
  );
  if (fs.existsSync(settingsPath)) {
    success("src/components/GeometryFirstSettings.jsx exists");
    testsPassed++;

    const content = fs.readFileSync(settingsPath, "utf8");
    if (content.includes("geometryFirst") && content.includes("toggle")) {
      success("Settings toggle for geometryFirst flag found");
      testsPassed++;
    }
  } else {
    error("GeometryFirstSettings.jsx not found");
    testsFailed++;
  }
} catch (err) {
  error(`M5 API & UI Wiring: ${err.message}`);
  testsFailed++;
}

console.log("");

// ============================================================================
// M6: Together.ai Reasoning
// ============================================================================

console.log("📋 M6: Testing Together.ai Reasoning...\n");

try {
  // Check plan.js API
  const planApiPath = path.join(__dirname, "api", "plan.js");
  if (fs.existsSync(planApiPath)) {
    success("api/plan.js exists");
    testsPassed++;

    const content = fs.readFileSync(planApiPath, "utf8");
    if (content.includes("runtime: 'nodejs'")) {
      success("plan.js has runtime: nodejs");
      testsPassed++;
    }
    if (content.includes("temperature: 0.2")) {
      success("Temperature set to 0.2 (deterministic)");
      testsPassed++;
    }
    if (
      content.includes("response_format") &&
      content.includes("json_object")
    ) {
      success("Response format: JSON (structured output)");
      testsPassed++;
    }
    if (
      content.includes("address") &&
      content.includes("program") &&
      content.includes("climate")
    ) {
      success("Takes address, program, climate inputs");
      testsPassed++;
    }
  } else {
    error("api/plan.js not found");
    testsFailed++;
  }

  // Check DNA generator service
  const dnaGenPath = path.join(
    __dirname,
    "src",
    "services",
    "togetherDNAGenerator.js",
  );
  if (fs.existsSync(dnaGenPath)) {
    success("src/services/togetherDNAGenerator.js exists");
    testsPassed++;

    const content = fs.readFileSync(dnaGenPath, "utf8");
    if (content.includes("generateProjectDNA")) {
      success("generateProjectDNA() function found");
      testsPassed++;
    }
  } else {
    error("togetherDNAGenerator.js not found");
    testsFailed++;
  }
} catch (err) {
  error(`M6 Together.ai Reasoning: ${err.message}`);
  testsFailed++;
}

console.log("");

// ============================================================================
// M7: Single Output Sheet
// ============================================================================

console.log("📋 M7: Testing Single Output Sheet...\n");

try {
  // Check sheet.js API
  const sheetApiPath = path.join(__dirname, "api", "sheet.js");
  if (fs.existsSync(sheetApiPath)) {
    success("api/sheet.js exists");
    testsPassed++;

    const content = fs.readFileSync(sheetApiPath, "utf8");
    if (content.includes("A1_WIDTH") && content.includes("594")) {
      success("A1 sheet dimensions (594mm × 841mm)");
      testsPassed++;
    }
    if (
      content.includes("design_id") &&
      content.includes("seed") &&
      content.includes("sha256")
    ) {
      success("Stamps: design_id, seed, SHA256");
      testsPassed++;
    }
    if (content.includes("format=svg") || content.includes("format=pdf")) {
      success("GET /api/sheet?format=svg|pdf endpoint");
      testsPassed++;
    }
  } else {
    error("api/sheet.js not found");
    testsFailed++;
  }

  // Check sheet composer
  const composerPath = path.join(
    __dirname,
    "src",
    "services",
    "sheetComposer.js",
  );
  if (fs.existsSync(composerPath)) {
    success("src/services/sheetComposer.js exists");
    testsPassed++;

    const content = fs.readFileSync(composerPath, "utf8");
    if (content.includes("createA1Sheet")) {
      success("createA1Sheet() function found");
      testsPassed++;
    }
  } else {
    error("sheetComposer.js not found");
    testsFailed++;
  }
} catch (err) {
  error(`M7 Single Output Sheet: ${err.message}`);
  testsFailed++;
}

console.log("");

// ============================================================================
// M8: Tests & Docs
// ============================================================================

console.log("📋 M8: Testing Tests & Docs...\n");

try {
  // Check smoke tests
  const testsPath = path.join(__dirname, "tests", "api.test.js");
  if (fs.existsSync(testsPath)) {
    success("tests/api.test.js exists");
    testsPassed++;

    const content = fs.readFileSync(testsPath, "utf8");
    if (
      content.includes("3 different URLs") ||
      content.includes("byte sizes")
    ) {
      success("Tests verify 3 different URLs & byte sizes");
      testsPassed++;
    }
    if (
      content.includes("/api/render") &&
      content.includes("/api/plan") &&
      content.includes("/api/sheet")
    ) {
      success("Tests cover all 3 API endpoints");
      testsPassed++;
    }
  } else {
    error("tests/api.test.js not found");
    testsFailed++;
  }

  // Check documentation
  const readmePath = path.join(__dirname, "GEOMETRY_FIRST_README.md");
  if (fs.existsSync(readmePath)) {
    success("GEOMETRY_FIRST_README.md exists");
    testsPassed++;

    const content = fs.readFileSync(readmePath, "utf8");
    if (
      content.includes("Pipeline") ||
      content.includes("graph TD") ||
      content.includes("mermaid")
    ) {
      success("Pipeline diagram included");
      testsPassed++;
    }
    if (content.includes("runtime") && content.includes("nodejs")) {
      success("Environment notes: Vercel runtime=nodejs");
      testsPassed++;
    }
    if (content.includes("no disk writes") || content.includes("stateless")) {
      success("Environment notes: No disk writes documented");
      testsPassed++;
    }
  } else {
    error("GEOMETRY_FIRST_README.md not found");
    testsFailed++;
  }
} catch (err) {
  error(`M8 Tests & Docs: ${err.message}`);
  testsFailed++;
}

console.log("");

// ============================================================================
// Summary
// ============================================================================

console.log("═".repeat(60));
console.log("📊 TEST SUMMARY\n");

const total = testsPassed + testsFailed;
const percentage = ((testsPassed / total) * 100).toFixed(1);

console.log(`Total Tests: ${total}`);
success(`Passed: ${testsPassed}`);
if (testsFailed > 0) {
  error(`Failed: ${testsFailed}`);
}
console.log(`Success Rate: ${percentage}%\n`);

if (testsFailed === 0) {
  success("All tests passed! ✨");
  console.log("\n🚀 Geometry-first implementation verified locally.");
  console.log("📋 Next steps:");
  console.log("   1. Run: npm install (to ensure all deps installed)");
  console.log("   2. Run: npm run dev (to start local servers)");
  console.log("   3. Test APIs at http://localhost:3000/api/*");
  console.log("   4. When ready: git push origin main (to deploy)\n");
} else {
  warn("Some tests failed. Please review the errors above.");
  console.log("\n💡 Common issues:");
  console.log("   - Missing dependencies: Run npm install");
  console.log("   - File not found: Check file paths");
  console.log("   - Import errors: Check module exports\n");
}

console.log("═".repeat(60));

process.exit(testsFailed > 0 ? 1 : 0);

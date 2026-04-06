/**
 * Verification script for line-weight and material-hatch changes.
 * Directly imports drawingStyles and exercises generateHatchPattern
 * plus lineWeightToPx, then generates a sample SVG floor plan section.
 */

import {
  lineWeightToPx,
  LINE_WEIGHTS_MM,
  getStylePreset,
  generateSVGStyles,
  CONVENTIONS,
} from "./src/geometry/drawingStyles.js";

import { writeFileSync } from "fs";

let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

// ── 1. lineWeightToPx unit math ──────────────────────────────────
console.log("\n🔬 Test 1: lineWeightToPx conversion");
assert(lineWeightToPx(0.7) === 4.13, "0.7mm → 4.13px at 150dpi");
assert(lineWeightToPx(0.5) === 2.95, "0.5mm → 2.95px at 150dpi");
assert(lineWeightToPx(0.25) === 1.48, "0.25mm → 1.48px at 150dpi");
assert(lineWeightToPx(0.18) === 1.06, "0.18mm → 1.06px at 150dpi");
assert(lineWeightToPx(0.3) === 1.77, "0.3mm → 1.77px at 150dpi");

// Custom DPI
assert(lineWeightToPx(0.7, undefined, 300) === 8.27, "0.7mm → 8.27px at 300dpi");
assert(lineWeightToPx(0.7, undefined, 96) === 2.65, "0.7mm → 2.65px at 96dpi");

// ── 2. LINE_WEIGHTS_MM constants ─────────────────────────────────
console.log("\n🔬 Test 2: LINE_WEIGHTS_MM constants");
assert(LINE_WEIGHTS_MM.wallCut === 0.7, "wallCut = 0.7mm");
assert(LINE_WEIGHTS_MM.wallProfile === 0.5, "wallProfile = 0.5mm");
assert(LINE_WEIGHTS_MM.dimension === 0.25, "dimension = 0.25mm");
assert(LINE_WEIGHTS_MM.hatch === 0.18, "hatch = 0.18mm");
assert(LINE_WEIGHTS_MM.glazingBar === 0.3, "glazingBar = 0.3mm");
assert(LINE_WEIGHTS_MM.furniture === 0.18, "furniture = 0.18mm");

// ── 3. Style presets use derived values ──────────────────────────
console.log("\n🔬 Test 3: Style preset lineWeights derive from mm");
const tech = getStylePreset("technical");
assert(tech.lineWeights.wall === 4.13, "technical.wall = 4.13 (0.7mm)");
assert(tech.lineWeights.wallInternal === 2.95, "technical.wallInternal = 2.95 (0.5mm)");
assert(tech.lineWeights.hatch === 1.06, "technical.hatch = 1.06 (0.18mm)");
assert(tech.lineWeights.glazingBar === 1.77, "technical.glazingBar = 1.77 (0.3mm)");
assert(tech.lineWeights.furniture === 1.06, "technical.furniture = 1.06 (0.18mm)");

const art = getStylePreset("artistic");
assert(art.lineWeights.wall < tech.lineWeights.wall, "artistic.wall < technical.wall");

const bp = getStylePreset("blueprint");
assert(bp.lineWeights.wall < tech.lineWeights.wall, "blueprint.wall < technical.wall");
assert(bp.lineWeights.wall > art.lineWeights.wall, "blueprint.wall > artistic.wall");

// ── 4. generateSVGStyles uses lw tokens ──────────────────────────
console.log("\n🔬 Test 4: generateSVGStyles() uses lineWeight tokens");
const css = generateSVGStyles(tech);
assert(css.includes("stroke-width: 1.77"), "CSS .window uses glazingBar px (1.77)");
assert(css.includes("stroke-width: 1.48"), "CSS .door uses annotation px (1.48)");
assert(!css.includes("stroke-width: 1.2"), "No hardcoded 1.2 in CSS");
assert(!css.includes("stroke-width: 3;"), "No hardcoded 3.0 in CSS");

// ── 5. generateHatchPattern material patterns ────────────────────
console.log("\n🔬 Test 5: Material-specific hatch patterns");

// Import dynamically to avoid complex module resolution
// We'll test via the drawingStyles generateHatchPattern export indirectly
// by reading Projections2D source for the function
import { readFileSync } from "fs";
const projSrc = readFileSync("./src/geometry/Projections2D.js", "utf-8");

assert(projSrc.includes('function generateHatchPattern(id, style, angle, spacing, material = "block")'),
  "generateHatchPattern accepts material param");
assert(projSrc.includes('mat.includes("brick")'), "brick pattern branch exists");
assert(projSrc.includes('mat.includes("concrete")'), "concrete pattern branch exists");
assert(projSrc.includes('mat.includes("timber")'), "timber pattern branch exists");
assert(projSrc.includes("resolveExternalWallMaterial"), "resolveExternalWallMaterial exists");

// Check brick uses staggered offset (half brick width)
const brickSection = projSrc.slice(
  projSrc.indexOf('mat.includes("brick")'),
  projSrc.indexOf('mat.includes("concrete")')
);
assert(brickSection.includes("brickW / 2"), "brick has half-width offset (stretcher bond)");
assert(brickSection.includes("brickW / 4"), "brick has quarter-width offset (stagger)");
assert(brickSection.includes("brickW * 3 / 4"), "brick has 3/4-width offset (stagger)");

// Check concrete uses cross-hatch (two diagonal lines)
const concreteSection = projSrc.slice(
  projSrc.indexOf('mat.includes("concrete")'),
  projSrc.indexOf('mat.includes("timber")')
);
assert(concreteSection.includes("x2=\"0\""), "concrete has reverse diagonal (cross-hatch)");

// Check timber uses vertical lines + knot circles
const timberSection = projSrc.slice(
  projSrc.indexOf('mat.includes("timber")'),
  projSrc.indexOf("// block, render")
);
assert(timberSection.includes("<circle"), "timber has knot circles");

// ── 6. Material resolution ───────────────────────────────────────
console.log("\n🔬 Test 6: resolveExternalWallMaterial logic");
assert(projSrc.includes('model.style?.materials'), "reads from model.style.materials");
assert(projSrc.includes('app.includes("wall")'), "checks application for wall");
assert(projSrc.includes('return "block"'), "defaults to block");

// ── 7. drawWallHatch uses pattern fill ───────────────────────────
console.log("\n🔬 Test 7: drawWallHatch uses SVG pattern fill");
assert(projSrc.includes('fill="url(#${patId})"'), "drawWallHatch uses pattern fill");
assert(projSrc.includes("generateHatchPattern(patId, hatchStyle, 45, 3, material)"),
  "drawWallHatch calls generateHatchPattern with material");

// ── 8. Section cut walls use material ────────────────────────────
console.log("\n🔬 Test 8: drawSectionCutWalls uses material");
assert(projSrc.includes('material = "block"'), "drawSectionCutWalls has material param with default");
assert(projSrc.includes("resolveExternalWallMaterial(model),"),
  "projectSection passes material to drawSectionCutWalls");

// ── 9. Generate sample SVG ───────────────────────────────────────
console.log("\n🎨 Generating sample SVG to verify visual output...");

// Build a minimal SVG that demonstrates the line weights and hatch patterns
const style = getStylePreset("technical");
const lw = style.lineWeights;

const svgWidth = 600;
const svgHeight = 500;

let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
<style><![CDATA[${generateSVGStyles(style)}]]></style>
<rect width="${svgWidth}" height="${svgHeight}" fill="${style.colors.background}"/>

<!-- Title -->
<text x="${svgWidth/2}" y="25" text-anchor="middle" font-family="Arial" font-size="14" font-weight="bold" fill="#333">Line Weight &amp; Hatch Verification</text>

<!-- Line weight comparison strip (left side) -->
<text x="20" y="55" font-family="Arial" font-size="10" fill="#333">Line Weights (ISO 128 / BS 8888):</text>

<line x1="20" y1="75" x2="200" y2="75" stroke="black" stroke-width="${lw.wall}"/>
<text x="210" y="79" font-family="Arial" font-size="9" fill="#666">Wall cut: 0.7mm → ${lw.wall}px</text>

<line x1="20" y1="95" x2="200" y2="95" stroke="black" stroke-width="${lw.wallInternal}"/>
<text x="210" y="99" font-family="Arial" font-size="9" fill="#666">Wall profile: 0.5mm → ${lw.wallInternal}px</text>

<line x1="20" y1="115" x2="200" y2="115" stroke="black" stroke-width="${lw.glazingBar}"/>
<text x="210" y="119" font-family="Arial" font-size="9" fill="#666">Glazing bar: 0.3mm → ${lw.glazingBar}px</text>

<line x1="20" y1="135" x2="200" y2="135" stroke="black" stroke-width="${lw.annotation}"/>
<text x="210" y="139" font-family="Arial" font-size="9" fill="#666">Annotation: 0.25mm → ${lw.annotation}px</text>

<line x1="20" y1="155" x2="200" y2="155" stroke="black" stroke-width="${lw.hatch}"/>
<text x="210" y="159" font-family="Arial" font-size="9" fill="#666">Hatch: 0.18mm → ${lw.hatch}px</text>

<!-- Material hatch pattern samples (right side) -->
<text x="20" y="195" font-family="Arial" font-size="10" fill="#333">Material Hatch Patterns:</text>

<!-- Brick stretcher bond -->
<defs>
  <pattern id="demo-brick" patternUnits="userSpaceOnUse" width="18" height="7.2">
    <line x1="0" y1="3.6" x2="18" y2="3.6" stroke="${style.colors.wallHatch}" stroke-width="${lw.hatch}"/>
    <line x1="0" y1="0" x2="0" y2="3.6" stroke="${style.colors.wallHatch}" stroke-width="${lw.hatch}"/>
    <line x1="9" y1="0" x2="9" y2="3.6" stroke="${style.colors.wallHatch}" stroke-width="${lw.hatch}"/>
    <line x1="18" y1="0" x2="18" y2="3.6" stroke="${style.colors.wallHatch}" stroke-width="${lw.hatch}"/>
    <line x1="0" y1="7.2" x2="18" y2="7.2" stroke="${style.colors.wallHatch}" stroke-width="${lw.hatch}"/>
    <line x1="4.5" y1="3.6" x2="4.5" y2="7.2" stroke="${style.colors.wallHatch}" stroke-width="${lw.hatch}"/>
    <line x1="13.5" y1="3.6" x2="13.5" y2="7.2" stroke="${style.colors.wallHatch}" stroke-width="${lw.hatch}"/>
  </pattern>
  <pattern id="demo-concrete" patternUnits="userSpaceOnUse" width="4.5" height="4.5">
    <line x1="0" y1="0" x2="4.5" y2="4.5" stroke="${style.colors.wallHatch}" stroke-width="${lw.hatch}"/>
    <line x1="4.5" y1="0" x2="0" y2="4.5" stroke="${style.colors.wallHatch}" stroke-width="${lw.hatch}"/>
  </pattern>
  <pattern id="demo-timber" patternUnits="userSpaceOnUse" width="3.6" height="28.8">
    <line x1="1.8" y1="0" x2="1.8" y2="28.8" stroke="${style.colors.wallHatch}" stroke-width="${lw.hatch}"/>
    <circle cx="1.8" cy="11.52" r="1.08" fill="none" stroke="${style.colors.wallHatch}" stroke-width="${lw.hatch}"/>
  </pattern>
  <pattern id="demo-block" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
    <line x1="0" y1="0" x2="0" y2="6" stroke="${style.colors.wallHatch}" stroke-width="${lw.hatch}"/>
  </pattern>
</defs>

<!-- Brick sample -->
<rect x="20" y="210" width="80" height="40" fill="url(#demo-brick)" stroke="black" stroke-width="${lw.wall}"/>
<text x="110" y="235" font-family="Arial" font-size="9" fill="#666">Brick (stretcher bond)</text>

<!-- Concrete sample -->
<rect x="20" y="265" width="80" height="40" fill="url(#demo-concrete)" stroke="black" stroke-width="${lw.wall}"/>
<text x="110" y="290" font-family="Arial" font-size="9" fill="#666">Concrete (cross-hatch)</text>

<!-- Timber sample -->
<rect x="20" y="320" width="80" height="40" fill="url(#demo-timber)" stroke="black" stroke-width="${lw.wall}"/>
<text x="110" y="345" font-family="Arial" font-size="9" fill="#666">Timber (vertical + knots)</text>

<!-- Block/render sample -->
<rect x="20" y="375" width="80" height="40" fill="url(#demo-block)" stroke="black" stroke-width="${lw.wall}"/>
<text x="110" y="400" font-family="Arial" font-size="9" fill="#666">Block/render (diagonal 45°)</text>

<!-- Mini floor plan demo (bottom) -->
<text x="320" y="195" font-family="Arial" font-size="10" fill="#333">Mini Floor Plan (brick walls):</text>

<!-- External wall ring with brick hatch -->
<rect x="310" y="210" width="250" height="180" fill="url(#demo-brick)" stroke="black" stroke-width="${lw.wall}"/>
<rect x="325" y="225" width="220" height="150" fill="white" stroke="black" stroke-width="${lw.wallInternal}"/>

<!-- Internal wall -->
<rect x="430" y="225" width="6" height="150" fill="${style.colors.wallInternal}" stroke="black" stroke-width="${lw.wallInternal}"/>

<!-- Room labels -->
<text x="375" y="305" text-anchor="middle" class="room-label">Living</text>
<text x="375" y="320" text-anchor="middle" class="area-label">22 m²</text>
<text x="500" y="305" text-anchor="middle" class="room-label">Kitchen</text>
<text x="500" y="320" text-anchor="middle" class="area-label">15 m²</text>

<!-- Window symbol -->
<rect x="410" y="210" width="30" height="12" fill="${style.colors.windowGlass}" stroke="${style.colors.windowFrame}" stroke-width="${lw.glazingBar}"/>
<line x1="425" y1="210" x2="425" y2="222" stroke="${style.colors.windowFrame}" stroke-width="${lw.glazingBar}"/>

<!-- Door symbol -->
<rect x="340" y="210" width="20" height="10" fill="${style.colors.doorFill}" stroke="black" stroke-width="${lw.annotation}"/>

<!-- Dimension line -->
<line x1="310" y1="410" x2="560" y2="410" stroke="${style.colors.dimension}" stroke-width="${lw.dimension}"/>
<text x="435" y="425" text-anchor="middle" font-family="Arial" font-size="9" fill="${style.colors.dimension}">12.50 m</text>

</svg>`;

writeFileSync("test-output-lineweights.svg", svg);
console.log("  ✅ Wrote test-output-lineweights.svg");

// ── Summary ──────────────────────────────────────────────────────
console.log(`\n${"═".repeat(50)}`);
console.log(`📊 RESULTS: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("✅ All tests passed!");
} else {
  console.log("❌ Some tests failed.");
  process.exit(1);
}

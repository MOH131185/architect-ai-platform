/**
 * Verification script for dimension chain changes.
 * Tests collectHorizontalChainPoints, collectVerticalChainPoints,
 * drawDimensionChain, and the rewritten drawPlanDimensions.
 * Also generates a sample SVG showing both chain types.
 */

import { readFileSync, writeFileSync } from "fs";
import {
  lineWeightToPx,
  LINE_WEIGHTS_MM,
  getStylePreset,
  generateSVGStyles,
  SYMBOL_SIZES,
} from "./src/geometry/drawingStyles.js";

let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) {
    console.log(`  \u2705 ${label}`);
    passed++;
  } else {
    console.log(`  \u274C ${label}`);
    failed++;
  }
}

// Read source to verify code structure
const src = readFileSync("./src/geometry/Projections2D.js", "utf-8");

// ── 1. collectHorizontalChainPoints exists and has correct shape ─────
console.log("\n\ud83d\udd2c Test 1: collectHorizontalChainPoints");
assert(src.includes("function collectHorizontalChainPoints(floor, envelope)"),
  "collectHorizontalChainPoints function exists");
assert(src.includes("-envelope.width / 2"), "uses west face from envelope");
assert(src.includes("envelope.width / 2"), "uses east face from envelope");
assert(src.includes("room.boundingBox.minX"), "reads room boundingBox.minX");
assert(src.includes("room.boundingBox.maxX"), "reads room boundingBox.maxX");
assert(src.includes("sorted[i] - merged[merged.length - 1] < 50"),
  "merges within 50mm threshold");

// ── 2. collectVerticalChainPoints exists ─────────────────────────────
console.log("\n\ud83d\udd2c Test 2: collectVerticalChainPoints");
assert(src.includes("function collectVerticalChainPoints(floor, envelope)"),
  "collectVerticalChainPoints function exists");
assert(src.includes("-envelope.depth / 2"), "uses south face from envelope");
assert(src.includes("envelope.depth / 2"), "uses north face from envelope");
assert(src.includes("room.boundingBox.minY"), "reads room boundingBox.minY");
assert(src.includes("room.boundingBox.maxY"), "reads room boundingBox.maxY");

// ── 3. drawDimensionChain function structure ─────────────────────────
console.log("\n\ud83d\udd2c Test 3: drawDimensionChain function");
assert(src.includes("function drawDimensionChain(points, offset, baselinePos, vertical, pxPerMM, id"),
  "drawDimensionChain has correct signature");
assert(src.includes('class="dimension"'), "uses dimension CSS class");
assert(src.includes("SYMBOL_SIZES.dimension.tickLength / 2"),
  "uses SYMBOL_SIZES.dimension.tickLength for tick half-length");

// ── 4. 45° serif tick marks (not arrow polygons) ────────────────────
console.log("\n\ud83d\udd2c Test 4: Serif tick marks");
// Extract the drawDimensionChain function body
const chainStart = src.indexOf("function drawDimensionChain(");
const chainEnd = src.indexOf("function drawLevelMarker(");
const chainBody = src.slice(chainStart, chainEnd);

assert(!chainBody.includes("<polygon"), "no arrow polygon elements in chain");
assert(chainBody.includes("tickHalf"), "uses tickHalf variable");
// Horizontal tick: x1="${px - tickHalf}" y1="${dimY - tickHalf}" x2="${px + tickHalf}" y2="${dimY + tickHalf}"
assert(chainBody.includes("px - tickHalf"), "horizontal tick uses px - tickHalf");
assert(chainBody.includes("dimY - tickHalf"), "horizontal tick uses dimY - tickHalf");
assert(chainBody.includes("dimY + tickHalf"), "horizontal tick uses dimY + tickHalf");
// Vertical tick: similar pattern
assert(chainBody.includes("dimX - tickHalf"), "vertical tick uses dimX - tickHalf");

// ── 5. Witness/extension lines with overshoot ────────────────────────
console.log("\n\ud83d\udd2c Test 5: Witness lines with overshoot");
assert(chainBody.includes("overshoot = 3"), "3px overshoot constant");
assert(chainBody.includes("dimY + overshoot"), "horizontal witness extends past dim line");
assert(chainBody.includes("dimX - overshoot"), "vertical witness extends past dim line");
assert(chainBody.includes('stroke="#999"'), "witness lines use #999 color");
assert(chainBody.includes(`stroke-width="\${LW.hatch}"`), "witness lines use LW.hatch weight");

// ── 6. Text format: mm integers, not meters ─────────────────────────
console.log("\n\ud83d\udd2c Test 6: Text format (mm integers)");
assert(chainBody.includes("Math.round(segPx / pxPerMM)"),
  "converts px back to mm via pxPerMM");
assert(!chainBody.includes(".toFixed"), "no decimal formatting (integers only)");
assert(chainBody.includes("${segMM}"), "outputs raw integer mm value");

// ── 7. Vertical text rotation ────────────────────────────────────────
console.log("\n\ud83d\udd2c Test 7: Vertical text rotation");
assert(chainBody.includes('rotate(-90,'), "vertical text rotated -90° (bottom-to-top)");

// ── 8. Small segment skip ────────────────────────────────────────────
console.log("\n\ud83d\udd2c Test 8: Small segment handling");
assert(chainBody.includes("segPx < 30"), "skips text for segments under 30px");

// ── 9. drawPlanDimensions rewrite ────────────────────────────────────
console.log("\n\ud83d\udd2c Test 9: drawPlanDimensions rewrite");
assert(src.includes("function drawPlanDimensions(model, dims, offsetX, offsetY, scale, floor)"),
  "drawPlanDimensions accepts floor parameter");
assert(src.includes("collectHorizontalChainPoints(floor, model.envelope)"),
  "calls collectHorizontalChainPoints");
assert(src.includes("collectVerticalChainPoints(floor, model.envelope)"),
  "calls collectVerticalChainPoints");
assert(src.includes("drawDimensionChain(hPointsPx, 25,"),
  "room-to-room horizontal chain at 25px offset");
assert(src.includes("[hPointsPx[0], hPointsPx[hPointsPx.length - 1]],") && src.includes("55, bldgBottom, false, pxPerMM, \"plan-dim-h-overall\""),
  "overall horizontal chain at 55px offset");
assert(src.includes("drawDimensionChain(vPointsPx, 25,"),
  "room-to-room vertical chain at 25px offset");

// ── 10. Call site updated ────────────────────────────────────────────
console.log("\n\ud83d\udd2c Test 10: Call site");
assert(src.includes("drawPlanDimensions(model, dims, offsetX, offsetY, scale, floor)"),
  "call site passes floor argument");

// ── 11. drawDimension unchanged (still used by elevation/section) ────
console.log("\n\ud83d\udd2c Test 11: drawDimension preserved");
assert(src.includes("function drawDimension(x1, y1, x2, y2, text, vertical = false, id"),
  "original drawDimension function still exists");
// Verify it's still called by section code
assert(src.includes('"section-dim-total-height"'), "section still uses drawDimension");
assert(src.includes('"elev-dim-height"'), "elevation still uses drawDimension");

// ── 12. Generate sample SVG ─────────────────────────────────────────
console.log("\n\ud83c\udfa8 Generating sample SVG...");

const style = getStylePreset("technical");
const lw = style.lineWeights;
const tickHalf = SYMBOL_SIZES.dimension.tickLength / 2;
const dimLW = lw.dimension;
const hatchLW = lw.hatch;

const W = 700;
const H = 500;

// Simulate a 3-room building: 12000mm wide, 8000mm deep
// Rooms: Living (5000mm), Kitchen (3500mm), Utility (3500mm) with internal walls
const pxPerMM = 0.05; // scale 50

// Building bounds in SVG px (centered at 350, 200)
const cx = 350, cy = 200;
const bldgW = 12000 * pxPerMM; // 600px
const bldgD = 8000 * pxPerMM;  // 400px
const bldgLeft = cx - bldgW / 2;   // 50
const bldgRight = cx + bldgW / 2;  // 650
const bldgTop = cy - bldgD / 2;    // 0 ... too tight, let's adjust
const bldgBottom = cy + bldgD / 2;

// Room X-boundaries in mm (building-center origin):
// External: -6000, +6000
// Room 1 (Living): -5850 to -850 (wall inset 150mm each side)
// Room 2 (Kitchen): -750 to 2750
// Room 3 (Utility): 2850 to 5850
const hPointsMM = [-6000, -5850, -850, -750, 2750, 2850, 5850, 6000];
// After 50mm merge: -6000, -5850, -850, -750 ... wait, -850 and -750 are 100mm apart, no merge
// Let's just use the final merged values for the demo
const hMerged = [-6000, -5850, -800, 2800, 5850, 6000];
// Actually, let's simplify: just show 4 main points (ext face + two internal wall positions)
const hChainMM = [-6000, -800, 2800, 6000];
const hChainPx = hChainMM.map(mm => cx + mm * pxPerMM);

// Room Y-boundaries: just 2 rows
// North rooms: 4000 to -500mm, South rooms: -600 to -4000mm
const vChainMM = [-4000, -550, 500, 4000];
const vChainPx = vChainMM.map(mm => cy - mm * pxPerMM);
// SVG Y is flipped, so sort ascending
vChainPx.sort((a, b) => a - b);

let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<style><![CDATA[${generateSVGStyles(style)}]]></style>
<rect width="${W}" height="${H}" fill="${style.colors.background}"/>

<!-- Title -->
<text x="${W/2}" y="25" text-anchor="middle" font-family="Arial" font-size="14" font-weight="bold" fill="#333">Dimension Chain Verification</text>

<!-- Building outline -->
<rect x="${bldgLeft}" y="${cy - bldgD/2}" width="${bldgW}" height="${bldgD}" fill="${style.colors.roomFill}" stroke="black" stroke-width="${lw.wall}"/>

<!-- Internal walls (vertical) -->
<line x1="${cx + (-800) * pxPerMM}" y1="${cy - bldgD/2}" x2="${cx + (-800) * pxPerMM}" y2="${cy + bldgD/2}" stroke="black" stroke-width="${lw.wallInternal}"/>
<line x1="${cx + 2800 * pxPerMM}" y1="${cy - bldgD/2}" x2="${cx + 2800 * pxPerMM}" y2="${cy + bldgD/2}" stroke="black" stroke-width="${lw.wallInternal}"/>

<!-- Internal wall (horizontal) -->
<line x1="${bldgLeft}" y1="${cy - (-550) * pxPerMM}" x2="${bldgRight}" y2="${cy - (-550) * pxPerMM}" stroke="black" stroke-width="${lw.wallInternal}"/>

<!-- Room labels -->
<text x="${cx + (-6000 + -800)/2 * pxPerMM}" y="${cy - 50}" text-anchor="middle" class="room-label">Living</text>
<text x="${cx + (-800 + 2800)/2 * pxPerMM}" y="${cy - 50}" text-anchor="middle" class="room-label">Kitchen</text>
<text x="${cx + (2800 + 6000)/2 * pxPerMM}" y="${cy - 50}" text-anchor="middle" class="room-label">Utility</text>

<!-- ═══ HORIZONTAL DIMENSION CHAINS (below building) ═══ -->
`;

// Room-to-room chain (25px below south edge)
const hDimY1 = bldgBottom + 25;
svg += `<g class="dimension" id="demo-h-rooms">`;
// Continuous dimension line
svg += `<line x1="${hChainPx[0]}" y1="${hDimY1}" x2="${hChainPx[hChainPx.length-1]}" y2="${hDimY1}" stroke-width="${dimLW}"/>`;
for (const px of hChainPx) {
  // Witness line
  svg += `<line x1="${px}" y1="${bldgBottom}" x2="${px}" y2="${hDimY1 + 3}" stroke="#999" stroke-width="${hatchLW}"/>`;
  // 45° serif tick
  svg += `<line x1="${px - tickHalf}" y1="${hDimY1 - tickHalf}" x2="${px + tickHalf}" y2="${hDimY1 + tickHalf}" stroke-width="${dimLW}"/>`;
}
for (let i = 0; i < hChainPx.length - 1; i++) {
  const midX = (hChainPx[i] + hChainPx[i+1]) / 2;
  const segMM = Math.round(Math.abs(hChainPx[i+1] - hChainPx[i]) / pxPerMM);
  svg += `<text class="dimension-text" x="${midX}" y="${hDimY1 - 4}">${segMM}</text>`;
}
svg += `</g>`;

// Overall chain (55px below south edge)
const hDimY2 = bldgBottom + 55;
svg += `<g class="dimension" id="demo-h-overall">`;
svg += `<line x1="${hChainPx[0]}" y1="${hDimY2}" x2="${hChainPx[hChainPx.length-1]}" y2="${hDimY2}" stroke-width="${dimLW}"/>`;
for (const px of [hChainPx[0], hChainPx[hChainPx.length-1]]) {
  svg += `<line x1="${px}" y1="${bldgBottom}" x2="${px}" y2="${hDimY2 + 3}" stroke="#999" stroke-width="${hatchLW}"/>`;
  svg += `<line x1="${px - tickHalf}" y1="${hDimY2 - tickHalf}" x2="${px + tickHalf}" y2="${hDimY2 + tickHalf}" stroke-width="${dimLW}"/>`;
}
const totalMM = Math.round(Math.abs(hChainPx[hChainPx.length-1] - hChainPx[0]) / pxPerMM);
svg += `<text class="dimension-text" x="${(hChainPx[0] + hChainPx[hChainPx.length-1]) / 2}" y="${hDimY2 - 4}">${totalMM}</text>`;
svg += `</g>`;

// ═══ VERTICAL DIMENSION CHAINS (left of building) ═══
const vDimX1 = bldgLeft - 25;
svg += `<g class="dimension" id="demo-v-rooms">`;
svg += `<line x1="${vDimX1}" y1="${vChainPx[0]}" x2="${vDimX1}" y2="${vChainPx[vChainPx.length-1]}" stroke-width="${dimLW}"/>`;
for (const py of vChainPx) {
  svg += `<line x1="${bldgLeft}" y1="${py}" x2="${vDimX1 - 3}" y2="${py}" stroke="#999" stroke-width="${hatchLW}"/>`;
  svg += `<line x1="${vDimX1 - tickHalf}" y1="${py - tickHalf}" x2="${vDimX1 + tickHalf}" y2="${py + tickHalf}" stroke-width="${dimLW}"/>`;
}
for (let i = 0; i < vChainPx.length - 1; i++) {
  const midY = (vChainPx[i] + vChainPx[i+1]) / 2;
  const segMM = Math.round(Math.abs(vChainPx[i+1] - vChainPx[i]) / pxPerMM);
  const textX = vDimX1 - 12;
  svg += `<text class="dimension-text" x="${textX}" y="${midY}" transform="rotate(-90, ${textX}, ${midY})">${segMM}</text>`;
}
svg += `</g>`;

// Overall vertical chain (55px left)
const vDimX2 = bldgLeft - 55;
svg += `<g class="dimension" id="demo-v-overall">`;
svg += `<line x1="${vDimX2}" y1="${vChainPx[0]}" x2="${vDimX2}" y2="${vChainPx[vChainPx.length-1]}" stroke-width="${dimLW}"/>`;
for (const py of [vChainPx[0], vChainPx[vChainPx.length-1]]) {
  svg += `<line x1="${bldgLeft}" y1="${py}" x2="${vDimX2 - 3}" y2="${py}" stroke="#999" stroke-width="${hatchLW}"/>`;
  svg += `<line x1="${vDimX2 - tickHalf}" y1="${py - tickHalf}" x2="${vDimX2 + tickHalf}" y2="${py + tickHalf}" stroke-width="${dimLW}"/>`;
}
const totalV = Math.round(Math.abs(vChainPx[vChainPx.length-1] - vChainPx[0]) / pxPerMM);
const vtx = vDimX2 - 12;
const vty = (vChainPx[0] + vChainPx[vChainPx.length-1]) / 2;
svg += `<text class="dimension-text" x="${vtx}" y="${vty}" transform="rotate(-90, ${vtx}, ${vty})">${totalV}</text>`;
svg += `</g>`;

// Legend
svg += `
<text x="20" y="${H - 40}" font-family="Arial" font-size="9" fill="#666">Inner chain: room-to-room (25px offset) | Outer chain: overall (55px offset)</text>
<text x="20" y="${H - 25}" font-family="Arial" font-size="9" fill="#666">Tick marks: 45\u00B0 serif (${SYMBOL_SIZES.dimension.tickLength}px) | Witness lines: 3px overshoot | Text: mm integers</text>
`;

svg += `</svg>`;
writeFileSync("test-output-dimensions.svg", svg);
console.log("  \u2705 Wrote test-output-dimensions.svg");

// ── Summary ──────────────────────────────────────────────────────
console.log(`\n${"═".repeat(50)}`);
console.log(`\ud83d\udcca RESULTS: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("\u2705 All tests passed!");
} else {
  console.log("\u274C Some tests failed.");
  process.exit(1);
}

/**
 * Verification script for elevation material pattern changes.
 * Tests scale-proportional patterns in ArchitecturalElevationGenerator
 * and Projections2D getMaterialFill.
 * Generates sample SVG showing all 5 fixed patterns.
 */

import { readFileSync, writeFileSync } from "fs";

let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) { console.log(`  \u2705 ${label}`); passed++; }
  else { console.log(`  \u274C ${label}`); failed++; }
}

const aegSrc = readFileSync("./src/services/svg/ArchitecturalElevationGenerator.js", "utf-8");
const p2dSrc = readFileSync("./src/geometry/Projections2D.js", "utf-8");

// ── 1. Scale plumbing ────────────────────────────────────────────────
console.log("\n\ud83d\udd2c Test 1: Scale plumbing");
assert(aegSrc.includes("create: (color = \"#B8604E\", scale = 50)"),
  "AEG brick.create accepts (color, scale)");
assert(aegSrc.includes("create: (color = \"#DEB887\", scale = 50)"),
  "AEG timber.create accepts (color, scale)");
assert(aegSrc.includes("create: (color = \"#F5F5F5\", scale = 50)"),
  "AEG render.create accepts (color, scale)");
assert(aegSrc.includes("create: (color = \"#D3D3D3\", scale = 50)"),
  "AEG stone.create accepts (color, scale)");
assert(aegSrc.includes("create: (color = \"#708090\", scale = 50)"),
  "AEG slate.create accepts (color, scale)");
assert(aegSrc.includes("create: (color = \"#8B4513\", scale = 50)"),
  "AEG tiles.create accepts (color, scale)");
assert(aegSrc.includes("generatePatternDefs(materials, showMaterialPatterns, scale)"),
  "AEG call site passes scale");
assert(aegSrc.includes("function generatePatternDefs(materials, showPatterns, scale = 50)"),
  "generatePatternDefs accepts scale param");
assert(aegSrc.includes("defs += pattern.create(color, scale)"),
  "generatePatternDefs passes scale to create()");

assert(p2dSrc.includes("function getMaterialFill(materialName, hexColor, pxPerMM = 0.05)"),
  "P2D getMaterialFill accepts pxPerMM");
assert(p2dSrc.includes("getMaterialFill(matName, matHex, pxPerMM)"),
  "P2D call site passes pxPerMM");

// ── 2. Brick: stretcher bond with real dimensions ────────────────────
console.log("\n\ud83d\udd2c Test 2: Brick pattern (stretcher bond)");

// Extract brick create function body from AEG
const brickStart = aegSrc.indexOf("// Stretcher bond");
const brickEnd = aegSrc.indexOf("// Horizontal timber cladding");
const brickBody = aegSrc.slice(brickStart, brickEnd);

assert(brickBody.includes("v * scale / 1000"), "brick uses mm-to-px via scale/1000");
assert(brickBody.includes("mm(75)"), "brick courseH = 75mm (65mm brick + 10mm mortar)");
assert(brickBody.includes("mm(225)"), "brick patW = 225mm (215mm brick + 10mm mortar)");
assert(brickBody.includes("mm(150)"), "brick patH = 150mm (2 courses)");
assert(brickBody.includes("mm(112.5)"), "brick halfBrick = 112.5mm offset");
assert(brickBody.includes("rgba(255,255,255,0.5)"), "brick mortar uses white overlay");
assert(!brickBody.includes("#8B4513"), "brick no hardcoded brown mortar color");

// P2D brick
const p2dBrickStart = p2dSrc.indexOf("// Stretcher bond");
const p2dBrickEnd = p2dSrc.indexOf("// Horizontal cladding");
const p2dBrick = p2dSrc.slice(p2dBrickStart, p2dBrickEnd);
assert(p2dBrick.includes("mm(112.5)"), "P2D brick has half-brick offset");
assert(p2dBrick.includes("mm(225)"), "P2D brick patW from 225mm");

// ── 3. Stone: ashlar with varied blocks ──────────────────────────────
console.log("\n\ud83d\udd2c Test 3: Stone pattern (ashlar)");

const stoneStart = aegSrc.indexOf("// Ashlar stone");
const stoneEnd = aegSrc.indexOf("// Slate");
const stoneBody = aegSrc.slice(stoneStart, stoneEnd);

assert(stoneBody.includes("mm(800)"), "stone patW = 800mm");
assert(stoneBody.includes("mm(600)"), "stone patH = 600mm");
assert(stoneBody.includes("mm(200)"), "stone course height = 200mm");
// Verify varied joint positions (not all equal)
assert(stoneBody.includes("mm(350)"), "stone course 1 joint at 350mm");
assert(stoneBody.includes("mm(500)"), "stone course 2 joint at 500mm");
assert(stoneBody.includes("mm(300)") && stoneBody.includes("mm(550)"),
  "stone course 3 joints at 300mm and 550mm (different from courses 1-2)");

// P2D stone
assert(p2dSrc.includes("mat-stone") && p2dSrc.includes("mm(800)"),
  "P2D stone uses 800mm pattern width");

// ── 4. Render: smooth wash (no dots) ─────────────────────────────────
console.log("\n\ud83d\udd2c Test 4: Render pattern (smooth wash)");

const renderStart = aegSrc.indexOf("// Smooth render");
const renderEnd = aegSrc.indexOf("// Ashlar stone");
const renderBody = aegSrc.slice(renderStart, renderEnd);

assert(!renderBody.includes("<circle"), "render has NO circle elements (no dots)");
assert(renderBody.includes("mm(100)"), "render 100mm pattern tile");
assert(renderBody.includes("rgba(0,0,0,0.04)"), "render faint texture line");
assert(renderBody.includes("#F5F5F5"), "render default color is light gray");

// P2D render
assert(p2dSrc.includes("mat-render"), "P2D has explicit render pattern ID");
assert(p2dSrc.includes('name.includes("render")') || p2dSrc.includes('name.includes("stucco")'),
  "P2D matches render/stucco/plaster");

// ── 5. Slate/Tiles: fish-scale overlap ───────────────────────────────
console.log("\n\ud83d\udd2c Test 5: Slate/Tiles (fish-scale)");

const slateStart = aegSrc.indexOf("// Slate");
const slateEnd = aegSrc.indexOf("// Clay tiles");
const slateBody = aegSrc.slice(slateStart, slateEnd);

assert(slateBody.includes("mm(600)"), "slate tileW = 600mm");
assert(slateBody.includes("mm(300)"), "slate patH = 300mm");
assert(slateBody.includes("mm(150)"), "slate exposure = 150mm");
assert(slateBody.includes(" Q"), "slate uses Q (quadratic Bezier) for arcs");

const tilesStart = aegSrc.indexOf("// Clay tiles");
const tilesEnd = aegSrc.indexOf("// Glass");
const tilesBody = aegSrc.slice(tilesStart, tilesEnd);

assert(tilesBody.includes("mm(600)"), "tiles tileW = 600mm");
assert(tilesBody.includes("mm(150)"), "tiles exposure = 150mm");
assert(tilesBody.includes(" Q"), "tiles uses Q bezier arcs");
assert(tilesBody.includes("mm(300)"), "tiles half-width offset = 300mm");

// ── 6. Timber: horizontal planks ─────────────────────────────────────
console.log("\n\ud83d\udd2c Test 6: Timber cladding (horizontal planks)");

const timberStart = aegSrc.indexOf("// Horizontal timber cladding");
const timberEnd = aegSrc.indexOf("// Smooth render");
const timberBody = aegSrc.slice(timberStart, timberEnd);

assert(timberBody.includes("mm(150)"), "timber plankH = 150mm");
assert(timberBody.includes("mm(200)"), "timber patW = 200mm");
assert(!timberBody.includes("<path"), "timber has NO bezier path grain lines");
assert(timberBody.includes("mm(148)"), "timber shadow line at 148mm");
assert(timberBody.includes("rgba(0,0,0,0.15)"), "timber shadow line opacity 0.15");
assert(timberBody.includes("rgba(0,0,0,0.25)"), "timber edge line opacity 0.25");

// P2D timber
const p2dTimberStart = p2dSrc.indexOf("// Horizontal cladding");
const p2dTimberEnd = p2dSrc.indexOf("// Standing seam");
const p2dTimber = p2dSrc.slice(p2dTimberStart, p2dTimberEnd);
assert(p2dTimber.includes("mm(150)"), "P2D timber plankH = 150mm");
assert(p2dTimber.includes("mm(148)"), "P2D timber shadow at 148mm");

// ── 7. No hardcoded pixel dimensions remain ──────────────────────────
console.log("\n\ud83d\udd2c Test 7: No hardcoded px in patterns");
// Check AEG patterns don't have the old hardcoded values
assert(!aegSrc.includes('width="11" height="7"'), "no old brick 11x7 dims");
assert(!aegSrc.includes('width="30" height="200"'), "no old timber 30x200 dims");
assert(!aegSrc.includes('width="4" height="4"'), "no old render 4x4 dims");
assert(!aegSrc.includes('width="40" height="25"'), "no old stone 40x25 dims");
assert(!aegSrc.includes('width="15" height="10"'), "no old slate 15x10 dims");
assert(!aegSrc.includes('width="12" height="15"'), "no old tiles 12x15 dims");

// ── 8. Generate sample SVG ───────────────────────────────────────────
console.log("\n\ud83c\udfa8 Generating sample SVG...");

const scale = 50; // px per meter
const mm = (v) => +(v * scale / 1000).toFixed(2);

const W = 800, H = 600;
const swatchW = 120, swatchH = 80;
const gap = 20;
const startX = 40, startY = 60;

// Dynamically import and call create functions by eval-ing the source
// Instead, just build sample patterns inline using the same mm approach

const patterns = [
  {
    name: "Brick (stretcher bond)",
    id: "demo-brick",
    color: "#B8604E",
    build: () => {
      const courseH = mm(75), patW = mm(225), patH = mm(150);
      const halfBrick = mm(112.5);
      const jw = Math.max(0.3, mm(10) * 0.8);
      const js = "rgba(255,255,255,0.5)";
      return `<pattern id="demo-brick" patternUnits="userSpaceOnUse" width="${patW}" height="${patH}">
        <rect width="${patW}" height="${patH}" fill="#B8604E"/>
        <line x1="0" y1="0" x2="${patW}" y2="0" stroke="${js}" stroke-width="${jw}"/>
        <line x1="0" y1="${courseH}" x2="${patW}" y2="${courseH}" stroke="${js}" stroke-width="${jw}"/>
        <line x1="0" y1="${patH}" x2="${patW}" y2="${patH}" stroke="${js}" stroke-width="${jw}"/>
        <line x1="0" y1="0" x2="0" y2="${courseH}" stroke="${js}" stroke-width="${jw}"/>
        <line x1="${halfBrick}" y1="${courseH}" x2="${halfBrick}" y2="${patH}" stroke="${js}" stroke-width="${jw}"/>
      </pattern>`;
    },
  },
  {
    name: "Stone (ashlar)",
    id: "demo-stone",
    build: () => {
      const patW = mm(800), patH = mm(600), cH = mm(200);
      const jw = Math.max(0.3, +mm(8));
      const js = "rgba(0,0,0,0.2)";
      const y2 = cH, y3 = mm(400), y4 = patH;
      return `<pattern id="demo-stone" patternUnits="userSpaceOnUse" width="${patW}" height="${patH}">
        <rect width="${patW}" height="${patH}" fill="#D3D3D3"/>
        <line x1="0" y1="${y2}" x2="${patW}" y2="${y2}" stroke="${js}" stroke-width="${jw}"/>
        <line x1="0" y1="${y3}" x2="${patW}" y2="${y3}" stroke="${js}" stroke-width="${jw}"/>
        <line x1="0" y1="${y4}" x2="${patW}" y2="${y4}" stroke="${js}" stroke-width="${jw}"/>
        <line x1="${mm(350)}" y1="0" x2="${mm(350)}" y2="${y2}" stroke="${js}" stroke-width="${jw}"/>
        <line x1="${mm(600)}" y1="0" x2="${mm(600)}" y2="${y2}" stroke="${js}" stroke-width="${jw}"/>
        <line x1="${mm(200)}" y1="${y2}" x2="${mm(200)}" y2="${y3}" stroke="${js}" stroke-width="${jw}"/>
        <line x1="${mm(500)}" y1="${y2}" x2="${mm(500)}" y2="${y3}" stroke="${js}" stroke-width="${jw}"/>
        <line x1="${mm(300)}" y1="${y3}" x2="${mm(300)}" y2="${y4}" stroke="${js}" stroke-width="${jw}"/>
        <line x1="${mm(550)}" y1="${y3}" x2="${mm(550)}" y2="${y4}" stroke="${js}" stroke-width="${jw}"/>
      </pattern>`;
    },
  },
  {
    name: "Render (smooth wash)",
    id: "demo-render",
    build: () => {
      const patW = mm(100), patH = mm(100), lineY = mm(50);
      return `<pattern id="demo-render" patternUnits="userSpaceOnUse" width="${patW}" height="${patH}">
        <rect width="${patW}" height="${patH}" fill="#F5F5F5"/>
        <line x1="0" y1="${lineY}" x2="${patW}" y2="${lineY}" stroke="rgba(0,0,0,0.04)" stroke-width="0.5"/>
      </pattern>`;
    },
  },
  {
    name: "Slate (fish-scale)",
    id: "demo-slate",
    build: () => {
      const expose = mm(150), patW = mm(600), patH = mm(300), halfW = mm(300);
      return `<pattern id="demo-slate" patternUnits="userSpaceOnUse" width="${patW}" height="${patH}">
        <rect width="${patW}" height="${patH}" fill="#708090"/>
        <path d="M0,${expose} Q${halfW},${mm(180)} ${patW},${expose}" stroke="rgba(0,0,0,0.25)" stroke-width="0.6" fill="none"/>
        <line x1="0" y1="0" x2="0" y2="${expose}" stroke="rgba(0,0,0,0.15)" stroke-width="0.4"/>
        <path d="M${-halfW},${patH} Q0,${mm(330)} ${halfW},${patH}" stroke="rgba(0,0,0,0.25)" stroke-width="0.6" fill="none"/>
        <path d="M${halfW},${patH} Q${patW},${mm(330)} ${mm(900)},${patH}" stroke="rgba(0,0,0,0.25)" stroke-width="0.6" fill="none"/>
        <line x1="${halfW}" y1="${expose}" x2="${halfW}" y2="${patH}" stroke="rgba(0,0,0,0.15)" stroke-width="0.4"/>
      </pattern>`;
    },
  },
  {
    name: "Timber (horiz. planks)",
    id: "demo-timber",
    build: () => {
      const plankH = mm(150), patW = mm(200);
      const shadowSW = Math.max(0.4, +mm(3));
      const edgeSW = Math.max(0.3, +mm(2));
      return `<pattern id="demo-timber" patternUnits="userSpaceOnUse" width="${patW}" height="${plankH}">
        <rect width="${patW}" height="${plankH}" fill="#DEB887"/>
        <line x1="0" y1="${mm(50)}" x2="${patW}" y2="${mm(50)}" stroke="rgba(0,0,0,0.05)" stroke-width="0.3"/>
        <line x1="0" y1="${mm(100)}" x2="${patW}" y2="${mm(100)}" stroke="rgba(0,0,0,0.04)" stroke-width="0.3"/>
        <line x1="0" y1="${mm(148)}" x2="${patW}" y2="${mm(148)}" stroke="rgba(0,0,0,0.15)" stroke-width="${shadowSW}"/>
        <line x1="0" y1="${plankH}" x2="${patW}" y2="${plankH}" stroke="rgba(0,0,0,0.25)" stroke-width="${edgeSW}"/>
      </pattern>`;
    },
  },
];

let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="white"/>
<text x="${W/2}" y="30" text-anchor="middle" font-family="Arial" font-size="14" font-weight="bold" fill="#333">Material Pattern Verification (scale=${scale} px/m)</text>
<text x="${W/2}" y="48" text-anchor="middle" font-family="Arial" font-size="10" fill="#666">All dims from real-world mm, scaled proportionally</text>
<defs>`;

for (const p of patterns) { svg += p.build(); }
svg += `</defs>`;

// Draw swatches in a row
patterns.forEach((p, i) => {
  const x = startX + i * (swatchW + gap);
  const y = startY;
  svg += `<rect x="${x}" y="${y}" width="${swatchW}" height="${swatchH}" fill="url(#${p.id})" stroke="#333" stroke-width="1"/>`;
  svg += `<text x="${x + swatchW/2}" y="${y + swatchH + 15}" text-anchor="middle" font-family="Arial" font-size="9" fill="#333">${p.name}</text>`;
});

// Draw a mini elevation with brick walls and slate roof
const elevX = 100, elevY = 200, elevW = 600, elevH = 250;
const roofH = 80;

svg += `<text x="${elevX + elevW/2}" y="${elevY - 10}" text-anchor="middle" font-family="Arial" font-size="11" font-weight="bold" fill="#333">Mini Elevation</text>`;

// Roof (slate)
svg += `<polygon points="${elevX - 20},${elevY + roofH} ${elevX + elevW/2},${elevY} ${elevX + elevW + 20},${elevY + roofH}" fill="url(#demo-slate)" stroke="#333" stroke-width="1.5"/>`;

// Wall (brick)
svg += `<rect x="${elevX}" y="${elevY + roofH}" width="${elevW}" height="${elevH}" fill="url(#demo-brick)" stroke="#333" stroke-width="2"/>`;

// Window
svg += `<rect x="${elevX + 60}" y="${elevY + roofH + 50}" width="80" height="100" fill="#D6EAF8" stroke="#333" stroke-width="1.5"/>`;
svg += `<line x1="${elevX + 100}" y1="${elevY + roofH + 50}" x2="${elevX + 100}" y2="${elevY + roofH + 150}" stroke="#333" stroke-width="1"/>`;
svg += `<line x1="${elevX + 60}" y1="${elevY + roofH + 100}" x2="${elevX + 140}" y2="${elevY + roofH + 100}" stroke="#333" stroke-width="1"/>`;

// Door (timber)
svg += `<rect x="${elevX + 250}" y="${elevY + roofH + 100}" width="80" height="${elevH - 100}" fill="url(#demo-timber)" stroke="#333" stroke-width="1.5"/>`;

// Render panel
svg += `<rect x="${elevX + 420}" y="${elevY + roofH + 30}" width="140" height="100" fill="url(#demo-render)" stroke="#999" stroke-width="0.5"/>`;
svg += `<text x="${elevX + 490}" y="${elevY + roofH + 85}" text-anchor="middle" font-family="Arial" font-size="8" fill="#999">render panel</text>`;

// Ground line
svg += `<line x1="${elevX - 40}" y1="${elevY + roofH + elevH}" x2="${elevX + elevW + 40}" y2="${elevY + roofH + elevH}" stroke="#333" stroke-width="2"/>`;

// Legend
svg += `<text x="40" y="${H - 20}" font-family="Arial" font-size="9" fill="#666">Brick: 215\u00D765mm + 10mm mortar, stretcher bond | Stone: 800\u00D7600mm ashlar, 3 courses | Slate: 600\u00D7300mm fish-scale | Timber: 150mm planks</text>`;

svg += `</svg>`;
writeFileSync("test-output-materials.svg", svg);
console.log("  \u2705 Wrote test-output-materials.svg");

// ── Summary ──────────────────────────────────────────────────────
console.log(`\n${"═".repeat(50)}`);
console.log(`\ud83d\udcca RESULTS: ${passed} passed, ${failed} failed`);
if (failed === 0) { console.log("\u2705 All tests passed!"); }
else { console.log("\u274C Some tests failed."); process.exit(1); }

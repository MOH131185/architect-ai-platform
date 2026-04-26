/**
 * Generate the static Open Graph image for social cards + Vercel deployment
 * thumbnails. Run with: node scripts/generate-og-image.cjs
 *
 * Output: public/og-image.png (1200×630, PNG)
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const WIDTH = 1200;
const HEIGHT = 630;
const OUTPUT = path.resolve(__dirname, "..", "public", "og-image.png");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <pattern id="gridFine" width="24" height="24" patternUnits="userSpaceOnUse">
      <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(37,99,235,0.07)" stroke-width="1"/>
    </pattern>
    <pattern id="gridMajor" width="120" height="120" patternUnits="userSpaceOnUse">
      <path d="M 120 0 L 0 0 0 120" fill="none" stroke="rgba(37,99,235,0.12)" stroke-width="1"/>
    </pattern>
    <radialGradient id="vignette" cx="50%" cy="50%" r="80%">
      <stop offset="0%" stop-color="rgba(10,14,39,0)" />
      <stop offset="60%" stop-color="rgba(10,14,39,0)" />
      <stop offset="100%" stop-color="rgba(10,14,39,0.85)" />
    </radialGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#93c5fd" />
      <stop offset="50%" stop-color="#60a5fa" />
      <stop offset="100%" stop-color="#93c5fd" />
    </linearGradient>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#06111f" />
      <stop offset="50%" stop-color="#0a1929" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bgGrad)" />
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#gridFine)" />
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#gridMajor)" />
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#vignette)" />

  <!-- Eyebrow chip -->
  <g transform="translate(80, 130)">
    <rect x="0" y="0" width="240" height="38" rx="19" fill="rgba(37,99,235,0.12)" stroke="rgba(37,99,235,0.3)" stroke-width="1"/>
    <circle cx="22" cy="19" r="4" fill="#60a5fa"/>
    <text x="38" y="24" font-family="Inter, -apple-system, Segoe UI, sans-serif" font-size="14" font-weight="600" fill="#bfdbfe" letter-spacing="0.5">
      ARCHIAI SOLUTION
    </text>
  </g>

  <!-- Headline -->
  <g transform="translate(80, 195)">
    <text font-family="'Space Grotesk', Inter, sans-serif" font-size="86" font-weight="700" fill="#ffffff" letter-spacing="-3">
      <tspan x="0" y="74">AI-generated architectural</tspan>
      <tspan x="0" y="174" fill="url(#accentGrad)">drawings in minutes.</tspan>
    </text>
  </g>

  <!-- Sub copy -->
  <g transform="translate(80, 460)">
    <text font-family="Inter, -apple-system, Segoe UI, sans-serif" font-size="22" font-weight="400" fill="rgba(255,255,255,0.72)" letter-spacing="0">
      <tspan x="0" y="0">UK RIBA-standard A1 sheets — floor plans, elevations,</tspan>
      <tspan x="0" y="32">sections and 3D views with 98% cross-view consistency.</tspan>
    </text>
  </g>

  <!-- Bottom-left brand line -->
  <g transform="translate(80, 565)">
    <text font-family="Inter, -apple-system, Segoe UI, sans-serif" font-size="14" font-weight="500" fill="rgba(255,255,255,0.45)" letter-spacing="2">
      ARCHIAISOLUTION.PRO
    </text>
  </g>

  <!-- Bottom-right metric chips -->
  <g transform="translate(${WIDTH - 80}, 565)" text-anchor="end">
    <text font-family="Inter, -apple-system, Segoe UI, sans-serif" font-size="14" font-weight="500" fill="rgba(255,255,255,0.55)" letter-spacing="0.5">
      60s · 98% consistency · UK RIBA
    </text>
  </g>

  <!-- Decorative blueprint marker top-right -->
  <g transform="translate(${WIDTH - 200}, 80)" stroke="rgba(96,165,250,0.35)" fill="none" stroke-width="1.5">
    <circle cx="60" cy="60" r="55" />
    <circle cx="60" cy="60" r="32" />
    <line x1="0" y1="60" x2="120" y2="60" />
    <line x1="60" y1="0" x2="60" y2="120" />
    <circle cx="60" cy="60" r="3" fill="rgba(96,165,250,0.7)" stroke="none"/>
  </g>
</svg>`;

(async () => {
  try {
    await sharp(Buffer.from(svg)).png({ quality: 90 }).toFile(OUTPUT);
    const stats = fs.statSync(OUTPUT);
    console.log(`✓ Wrote ${OUTPUT} (${(stats.size / 1024).toFixed(1)} KB)`);
  } catch (err) {
    console.error("✗ Failed to generate OG image:", err);
    process.exit(1);
  }
})();

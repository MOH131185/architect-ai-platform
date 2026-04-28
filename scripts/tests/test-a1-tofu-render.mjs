#!/usr/bin/env node
/**
 * Phase A4 — A1 tofu render smoke test.
 *
 * Generates two synthetic PNGs via Sharp (one with real text,
 * one with tofu-style solid rectangles) and verifies that
 * detectA1RasterGlyphIntegrity classifies them correctly.
 *
 * This exercises the real Sharp module end-to-end (no mocks),
 * which is the same module used by the production compose flow.
 *
 * Usage: node scripts/tests/test-a1-tofu-render.mjs
 */

import { detectA1RasterGlyphIntegrity } from "../../src/services/a1/a1FinalExportContract.js";

async function loadSharp() {
  try {
    const mod = await import("sharp");
    return mod.default || mod;
  } catch (err) {
    throw new Error(
      `sharp module not available; cannot run tofu render smoke: ${err?.message}`,
    );
  }
}

async function buildRealTextPng(sharp, width, height) {
  // Use the embedded NotoSans font via Sharp's text input. NotoSans-Regular
  // is bundled in public/fonts/ and loaded by the upstream embedder; here we
  // synthesise a label band directly with Sharp's SVG-text path.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <text x="20" y="${Math.round(height * 0.65)}" font-size="${Math.round(
      height * 0.45,
    )}" font-family="DejaVu Sans, Arial, sans-serif" fill="#101010">SITE PLAN</text>
  </svg>`;
  return await sharp(Buffer.from(svg)).png().toBuffer();
}

async function buildTofuLikePng(sharp, width, height) {
  // Simulate librsvg's .notdef rendering for a label like "GROUND FLOOR PLAN"
  // that failed @font-face resolution: ~14 evenly-spaced solid filled
  // rectangles spanning most of the band, each acting as a missing-glyph box.
  const charCount = 14;
  const rectWidth = Math.round(height * 0.45);
  const gap = Math.round(height * 0.12);
  const stride = rectWidth + gap;
  const startX = Math.max(8, Math.round((width - charCount * stride) / 2));
  const rectHeight = Math.round(height * 0.6);
  const yTop = Math.round(height * 0.18);
  let rects = "";
  for (let i = 0; i < charCount; i++) {
    const x = startX + i * stride;
    if (x + rectWidth >= width - 4) break;
    rects += `<rect x="${x}" y="${yTop}" width="${rectWidth}" height="${rectHeight}" fill="#101010"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    ${rects}
  </svg>`;
  return await sharp(Buffer.from(svg)).png().toBuffer();
}

async function buildBlankPng(sharp, width, height) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#ffffff"/>
  </svg>`;
  return await sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  const sharp = await loadSharp();
  const width = 320;
  const height = 64;

  const failures = [];

  // Real-text fixture should pass.
  {
    const png = await buildRealTextPng(sharp, width, height);
    const result = await detectA1RasterGlyphIntegrity({
      pngBuffer: png,
      sharp,
      panelLabelCoordinates: {
        site_plan: { x: 0, y: 0, width, height, labelHeight: height },
      },
    });
    if (result.status !== "pass") {
      failures.push(
        `real-text fixture should pass; got status=${result.status} suspectZones=${JSON.stringify(
          result.suspectZones,
        )}`,
      );
    }
  }

  // Tofu fixture should block.
  {
    const png = await buildTofuLikePng(sharp, width, height);
    const result = await detectA1RasterGlyphIntegrity({
      pngBuffer: png,
      sharp,
      panelLabelCoordinates: {
        site_plan: { x: 0, y: 0, width, height, labelHeight: height },
      },
    });
    if (result.status !== "blocked") {
      failures.push(
        `tofu fixture should block; got status=${result.status} suspectZones=${JSON.stringify(
          result.suspectZones,
        )}`,
      );
    }
  }

  // Blank fixture should warn (not block). Blank panel bands are
  // legitimate when a panel has no caption; only tofu hard-blocks.
  {
    const png = await buildBlankPng(sharp, width, height);
    const result = await detectA1RasterGlyphIntegrity({
      pngBuffer: png,
      sharp,
      panelLabelCoordinates: {
        site_plan: { x: 0, y: 0, width, height, labelHeight: height },
      },
    });
    if (result.status !== "warning") {
      failures.push(
        `blank fixture should warn; got status=${result.status} warnings=${JSON.stringify(
          result.warnings,
        )} blockers=${JSON.stringify(result.blockers)}`,
      );
    }
  }

  if (failures.length > 0) {
    console.error("[test-a1-tofu-render] FAILED");
    for (const message of failures) console.error("  -", message);
    process.exitCode = 1;
    return;
  }

  console.log("[test-a1-tofu-render] PASS");
}

main().catch((err) => {
  console.error("[test-a1-tofu-render] threw:", err);
  process.exitCode = 1;
});

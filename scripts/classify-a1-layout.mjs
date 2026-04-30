/**
 * Classify which presentation-v3 layout (v2 vs v3 closeout) was used
 * by inspecting white-vs-ink density in known signature regions of
 * the rendered A1 PNG.
 *
 * v2 (row 1 = 188mm tall): floor plans extend from y=10..198mm.
 * v3 (row 1 = 130mm for 3-storey): floor plans only extend y=10..140mm.
 *
 * The tell: at y ≈ 145..195mm in the plans column, v2 has drawing
 * pixels (varied), v3 has the white inter-row gap.
 */
import { readFile } from "fs/promises";
import sharp from "sharp";

const [, , pngPath] = process.argv;
if (!pngPath) {
  console.error("Usage: node classify-a1-layout.mjs <png>");
  process.exit(2);
}

const PX_PER_MM = 9933 / 841; // ~11.81

async function bandStats(image, xMm, yMm, wMm, hMm, label) {
  const x = Math.round(xMm * PX_PER_MM);
  const y = Math.round(yMm * PX_PER_MM);
  const width = Math.round(wMm * PX_PER_MM);
  const height = Math.round(hMm * PX_PER_MM);
  const region = await sharp(pngPath)
    .extract({ left: x, top: y, width, height })
    .greyscale()
    .raw()
    .toBuffer();
  let darkPixels = 0;
  let totalIntensity = 0;
  for (const v of region) {
    totalIntensity += v;
    if (v < 200) darkPixels += 1;
  }
  const total = region.length;
  const meanIntensity = totalIntensity / total;
  const darkRatio = darkPixels / total;
  console.log(
    `${label.padEnd(38)} (${x},${y} ${width}×${height})  meanGrey=${meanIntensity.toFixed(1)} darkRatio=${(darkRatio * 100).toFixed(2)}%`,
  );
  return { darkRatio, meanIntensity };
}

const meta = await sharp(pngPath).metadata();
console.log(`Image: ${meta.width}×${meta.height}\n`);

console.log("--- Plans column signature (x=200..570 mm, plans extent) ---");
const plansBandV2 = await bandStats(
  await sharp(pngPath),
  200,
  150,
  370,
  45,
  "Plans column @ y=150..195mm",
);

console.log("\n--- Elevation column signature (x=580..831 mm) ---");
const elevTopV2 = await bandStats(
  await sharp(pngPath),
  580,
  10,
  251,
  92,
  "Elev row1 @ y=10..102mm  (v2 N elev)",
);
const elevTopV3 = await bandStats(
  await sharp(pngPath),
  580,
  10,
  251,
  62,
  "Elev row1 @ y=10..72mm   (v3 N elev)",
);
const elevGapV3 = await bandStats(
  await sharp(pngPath),
  580,
  72,
  251,
  6,
  "Elev row1 gap @ y=72..78mm (v3 only)",
);
const elevBotV2 = await bandStats(
  await sharp(pngPath),
  580,
  106,
  251,
  92,
  "Elev row1 lower @ y=106..198mm (v2 S elev)",
);
const elevBotV3 = await bandStats(
  await sharp(pngPath),
  580,
  78,
  251,
  62,
  "Elev row1 lower @ y=78..140mm  (v3 S elev)",
);

console.log("\n--- Row 2 top signature (just below row 1) ---");
const row2TopV2 = await bandStats(
  await sharp(pngPath),
  10,
  208,
  180,
  10,
  "Row2 top @ y=208..218mm  (v2 row2 starts)",
);
const row2TopV3 = await bandStats(
  await sharp(pngPath),
  10,
  150,
  180,
  10,
  "Row2 top @ y=150..160mm  (v3 row2 starts)",
);

console.log("\n--- Floor plan height signature ---");
// In v2, row 1 plans extend to y≈198. So y=170..195 is bottom of plans area (drawing pixels).
// In v3, row 1 plans only go to y=140. So y=145..198 is BLANK.
const planBottomV2 = await bandStats(
  await sharp(pngPath),
  210,
  170,
  350,
  25,
  "Plans bottom @ y=170..195mm  (v2 draws here)",
);
const planBottomV3Gap = await bandStats(
  await sharp(pngPath),
  210,
  142,
  350,
  6,
  "Plans→Row2 gap @ y=142..148mm (v3 white gap)",
);

console.log("\n=== Conclusion ===");
const isV3 =
  planBottomV2.darkRatio < 0.02 &&
  planBottomV3Gap.darkRatio < 0.02 &&
  elevGapV3.darkRatio < 0.02;
const isV2 =
  planBottomV2.darkRatio > 0.05 &&
  elevBotV2.darkRatio > 0.05 &&
  elevGapV3.darkRatio > 0.02;
if (isV3) {
  console.log("Detected layout: presentation-v3 (Phase B closeout v3)");
} else if (isV2) {
  console.log("Detected layout: presentation-v3 v2 (row 1 = 188mm)");
} else {
  console.log("Detected layout: AMBIGUOUS — inspect the regions above manually");
}

/**
 * Measure how much each technical panel slot is filled with drawing
 * pixels (i.e. non-white). Reports per-panel slot occupancy so we can
 * verify the v3 reshape actually moved the needle.
 *
 * Slot definitions follow buildPresentationV3SheetPanelSpecs for
 * 3-storey residential (row 1 = 130mm, plans 163.33×130mm landscape).
 */
import sharp from "sharp";

const [, , pngPath] = process.argv;
if (!pngPath) {
  console.error("Usage: node measure-plan-fill.mjs <png>");
  process.exit(2);
}

const PX_PER_MM = 9933 / 841; // 11.81

const slots = [
  { name: "site_context",      x: 10,  y: 10,  w: 140, h: 130 },
  { name: "floor_plan_ground", x: 160, y: 10,  w: 163, h: 130 },
  { name: "floor_plan_first",  x: 333, y: 10,  w: 163, h: 130 },
  { name: "floor_plan_level2", x: 506, y: 10,  w: 163, h: 130 },
  { name: "elevation_north",   x: 680, y: 10,  w: 151, h: 62  },
  { name: "elevation_south",   x: 680, y: 78,  w: 151, h: 62  },
  { name: "section_AA",        x: 10,  y: 150, w: 180, h: 246 },
  { name: "section_BB",        x: 200, y: 150, w: 180, h: 246 },
  { name: "axonometric",       x: 390, y: 150, w: 180, h: 246 },
  { name: "elevation_east",    x: 580, y: 150, w: 251, h: 121 },
  { name: "elevation_west",    x: 580, y: 275, w: 251, h: 121 },
  { name: "hero_3d",           x: 10,  y: 406, w: 200, h: 178 },
  { name: "interior_3d",       x: 220, y: 406, w: 200, h: 178 },
  { name: "material_palette",  x: 430, y: 406, w: 140, h: 178 },
  { name: "key_notes",         x: 580, y: 406, w: 110, h: 178 },
  { name: "title_block",       x: 700, y: 406, w: 131, h: 178 },
];

console.log(`${"Panel".padEnd(22)}  ${"slot mm".padEnd(15)} aspect  innerFill%  insetFill% (interior excludes 14mm caption + 6mm border)`);
for (const s of slots) {
  // Count dark pixels in two regions:
  //  full slot (gives "fillRatio" — drawing inside slot rectangle)
  //  content area (slot minus 4mm horizontal + 14mm top + 6mm bottom for caption)
  const slotPx = {
    left: Math.round(s.x * PX_PER_MM),
    top: Math.round(s.y * PX_PER_MM),
    width: Math.round(s.w * PX_PER_MM),
    height: Math.round(s.h * PX_PER_MM),
  };
  const innerPx = {
    left: Math.round((s.x + 4) * PX_PER_MM),
    top: Math.round((s.y + 14) * PX_PER_MM),
    width: Math.round((s.w - 8) * PX_PER_MM),
    height: Math.round((s.h - 20) * PX_PER_MM),
  };

  async function dark(region) {
    const buf = await sharp(pngPath)
      .extract(region)
      .greyscale()
      .raw()
      .toBuffer();
    let darkCount = 0;
    for (const v of buf) if (v < 230) darkCount += 1;
    return darkCount / buf.length;
  }

  const slotDark = await dark(slotPx);
  const innerDark = await dark(innerPx);
  const aspect = (s.w / s.h).toFixed(2);
  console.log(
    `${s.name.padEnd(22)}  ${`${s.w}×${s.h}`.padEnd(15)} ${aspect.padStart(5)}  ${(slotDark * 100).toFixed(1).padStart(7)}%  ${(innerDark * 100).toFixed(1).padStart(7)}%`,
  );
}

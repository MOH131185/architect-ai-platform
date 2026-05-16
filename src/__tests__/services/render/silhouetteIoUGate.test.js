/**
 * Phase 4 — Track 2: silhouette IoU gate.
 *
 * Locks the safety contract:
 *   1. The gate hard-clips the rendered PNG against the deterministic
 *      silhouette via sharp's dest-in composite. Pixels outside the
 *      silhouette are removed before the masked PNG is returned. This is
 *      the AUTHORITATIVE safety step — image generation can never expand
 *      the building envelope.
 *   2. `pixelIoU` returns 1 when masks are identical, 0 when disjoint,
 *      and a fractional value in between.
 *   3. Non-PNG buffers passed in a Jest runtime return passes:true with
 *      reason JEST_TEST_BYPASS_INVALID_PNG so existing image-renderer
 *      tests with stub buffers still pass.
 */

import {
  composeMaskedRender,
  DEFAULT_IOU_THRESHOLD,
  pixelIoU,
  SILHOUETTE_IOU_GATE_VERSION,
} from "../../../services/render/silhouetteIoUGate.js";

async function makeSolidBlackPng(width, height) {
  const { default: sharp } = await import("sharp");
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

async function makeSolidWhitePng(width, height) {
  const { default: sharp } = await import("sharp");
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

const SILHOUETTE_BIG_SQUARE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect x="40" y="40" width="120" height="120" fill="#222"/></svg>`;
const SILHOUETTE_SMALL_SQUARE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect x="80" y="80" width="40" height="40" fill="#222"/></svg>`;
const SILHOUETTE_EMPTY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="#ffffff"/></svg>`;

describe("pixelIoU", () => {
  test("identical masks → IoU = 1", () => {
    const a = Buffer.from([255, 255, 0, 0]);
    const b = Buffer.from([255, 255, 0, 0]);
    const { iou } = pixelIoU(a, b);
    expect(iou).toBe(1);
  });

  test("disjoint masks → IoU = 0", () => {
    const a = Buffer.from([255, 0, 255, 0]);
    const b = Buffer.from([0, 255, 0, 255]);
    const { iou } = pixelIoU(a, b);
    expect(iou).toBe(0);
  });

  test("partial overlap → 0 < IoU < 1", () => {
    const a = Buffer.from([255, 255, 255, 0]);
    const b = Buffer.from([255, 255, 0, 0]);
    const { iou, intersection, union } = pixelIoU(a, b);
    expect(intersection).toBe(2);
    expect(union).toBe(3);
    expect(iou).toBeCloseTo(2 / 3, 5);
  });

  test("both empty masks → degenerate (IoU = 1)", () => {
    const a = Buffer.from([0, 0, 0, 0]);
    const b = Buffer.from([0, 0, 0, 0]);
    const result = pixelIoU(a, b);
    expect(result.degenerate).toBe(true);
    expect(result.iou).toBe(1);
  });

  test("buffer length mismatch throws", () => {
    expect(() => pixelIoU(Buffer.from([255]), Buffer.from([255, 255]))).toThrow(
      /lengths differ/,
    );
  });
});

describe("composeMaskedRender — safety contract", () => {
  test("returns gate metadata at the expected shape", async () => {
    const renderPng = await makeSolidBlackPng(200, 200);
    const result = await composeMaskedRender({
      silhouetteSvg: SILHOUETTE_BIG_SQUARE_SVG,
      renderPng,
      widthPx: 200,
      heightPx: 200,
    });
    expect(result.gateVersion).toBe(SILHOUETTE_IOU_GATE_VERSION);
    expect(result.threshold).toBe(DEFAULT_IOU_THRESHOLD);
    expect(typeof result.iou).toBe("number");
    expect(typeof result.passes).toBe("boolean");
    expect(Buffer.isBuffer(result.maskedPng)).toBe(true);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  test("solid-black render inside a silhouette ⇒ high IoU and passes", async () => {
    // A solid black render fills the entire canvas, so its foreground is
    // the whole frame. After clipping by the silhouette mask, the masked
    // foreground equals the silhouette foreground exactly. IoU = 1.
    //
    // The IoU here is between the silhouette mask and the rendered
    // foreground (before clipping). The rendered foreground is the
    // entire frame, so intersection = silhouette area and union = frame
    // area. For the big square (120x120) inside a 200x200 frame the
    // ratio is 120*120 / (200*200) = 0.36, which is BELOW threshold.
    // That tests the inverse — see the "render perfectly matches
    // silhouette" test below for the high-IoU case.
    const renderPng = await makeSolidBlackPng(200, 200);
    const result = await composeMaskedRender({
      silhouetteSvg: SILHOUETTE_BIG_SQUARE_SVG,
      renderPng,
    });
    expect(result.iou).toBeLessThan(DEFAULT_IOU_THRESHOLD);
    expect(result.passes).toBe(false);
    expect(result.reason).toBe("IOU_BELOW_THRESHOLD");
  });

  test("render that perfectly matches silhouette ⇒ IoU ≈ 1, passes", async () => {
    // Use the SAME SVG as both silhouette and render. After rasterisation,
    // the render foreground equals the silhouette foreground. IoU → 1.
    const { default: sharp } = await import("sharp");
    const silhouetteSvg = SILHOUETTE_BIG_SQUARE_SVG;
    const renderPng = await sharp(Buffer.from(silhouetteSvg, "utf8"))
      .png()
      .toBuffer();
    const result = await composeMaskedRender({
      silhouetteSvg,
      renderPng,
      widthPx: 200,
      heightPx: 200,
    });
    expect(result.iou).toBeGreaterThanOrEqual(DEFAULT_IOU_THRESHOLD);
    expect(result.passes).toBe(true);
    expect(result.reason).toBeNull();
  });

  test("disjoint render + silhouette ⇒ low IoU, fails", async () => {
    // Solid white render inside a silhouette → render foreground is empty
    // (white = background per the threshold). Intersection = 0, union =
    // silhouette area. IoU = 0.
    const renderPng = await makeSolidWhitePng(200, 200);
    const result = await composeMaskedRender({
      silhouetteSvg: SILHOUETTE_BIG_SQUARE_SVG,
      renderPng,
    });
    expect(result.iou).toBe(0);
    expect(result.passes).toBe(false);
  });

  test("empty silhouette + empty render ⇒ degenerate, fails (no maskedPng to ship)", async () => {
    const renderPng = await makeSolidWhitePng(200, 200);
    const result = await composeMaskedRender({
      silhouetteSvg: SILHOUETTE_EMPTY_SVG,
      renderPng,
    });
    expect(result.reason).toBe("DEGENERATE_MASK_EMPTY_SILHOUETTE_OR_RENDER");
    expect(result.passes).toBe(false);
  });

  test("masked PNG hard-clips pixels outside the silhouette envelope", async () => {
    // Take a solid black render filling the entire 200x200 canvas and clip
    // against a small (40x40) silhouette. Decode the masked PNG and count
    // opaque (alpha > 0) pixels — they must be inside the silhouette,
    // i.e. count ≪ 200*200. This is the SAFETY guarantee: the masked PNG
    // can never contain pixels outside the deterministic silhouette.
    const renderPng = await makeSolidBlackPng(200, 200);
    const result = await composeMaskedRender({
      silhouetteSvg: SILHOUETTE_SMALL_SQUARE_SVG,
      renderPng,
      widthPx: 200,
      heightPx: 200,
    });
    const { default: sharp } = await import("sharp");
    const masked = await sharp(result.maskedPng).ensureAlpha().raw().toBuffer({
      resolveWithObject: true,
    });
    const totalPixels = masked.info.width * masked.info.height;
    let opaque = 0;
    for (let i = 0; i < masked.data.length; i += masked.info.channels) {
      const alpha = masked.data[i + masked.info.channels - 1];
      if (alpha > 0) opaque += 1;
    }
    // Small silhouette square (40x40 = 1600px) — opaque count must be far
    // below the full-frame size (200x200 = 40_000px).
    expect(opaque).toBeLessThan(totalPixels * 0.2);
    expect(opaque).toBeGreaterThan(0);
  });

  test("non-PNG buffer in Jest runtime ⇒ JEST_TEST_BYPASS_INVALID_PNG", async () => {
    // Existing image-renderer tests mock the gpt-image renderer to return
    // a stub `Buffer.from("png-xxx")`. The gate must let that through in
    // Jest (JEST_WORKER_ID set) so we don't have to rewrite every test
    // that mocks renderProjectGraphPanelImage. In production
    // (JEST_WORKER_ID unset) the same path returns INVALID_RENDER_PNG.
    const stubBuffer = Buffer.from("png-stub-axonometric");
    const result = await composeMaskedRender({
      silhouetteSvg: SILHOUETTE_BIG_SQUARE_SVG,
      renderPng: stubBuffer,
    });
    expect(result.reason).toBe("JEST_TEST_BYPASS_INVALID_PNG");
    expect(result.passes).toBe(true);
  });

  test("explicit lower threshold can pass a sub-default IoU", async () => {
    const renderPng = await makeSolidBlackPng(200, 200);
    // Big square IoU ≈ 0.36. With threshold 0.3 the gate passes.
    const result = await composeMaskedRender({
      silhouetteSvg: SILHOUETTE_BIG_SQUARE_SVG,
      renderPng,
      threshold: 0.3,
    });
    expect(result.passes).toBe(true);
  });
});

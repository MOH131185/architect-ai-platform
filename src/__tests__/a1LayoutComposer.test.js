import sharp from 'sharp';

describe('a1LayoutComposer', () => {
  test('composes panels into A1 canvas with coordinates', async () => {
    const { composeA1Sheet } = await import('../services/a1LayoutComposer.js');

    const red = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 255, g: 0, b: 0 } }
    }).png().toBuffer();

    const blue = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 0, g: 0, b: 255 } }
    }).png().toBuffer();

    const { buffer, coordinates } = await composeA1Sheet({
      panels: [
        { id: 'hero', type: 'hero_3d', buffer: red },
        { id: 'plan', type: 'floor_plan_ground', buffer: blue }
      ],
      siteOverlay: null
    });

    const meta = await sharp(buffer).metadata();
    expect(meta.width).toBe(9933);
    expect(meta.height).toBe(7016);
    expect(coordinates.hero).toBeDefined();
    expect(coordinates.plan).toBeDefined();
  });
});

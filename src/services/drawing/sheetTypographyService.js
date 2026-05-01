/**
 * Sheet Typography Service
 *
 * Returns font/stroke multipliers for SVG drawing renderers so technical
 * drawings remain legible when rasterised to A1 print resolution
 * (9933x7016 @ 300 DPI) from the 1792x1269 working canvas (~5.5x scale-up).
 *
 * Source 9pt text at 1x rasterises to ~2.2pt at print, well below the RIBA
 * 3 mm minimum. With fontScale 2.6, source 9pt becomes ~23pt, rasterising to
 * ~3.0 mm at print. Stroke scale 1.6 brings 1.1px lines to ~1.8px, giving a
 * ~0.6 mm printed line — within the 0.5–0.7 mm target band for primary walls.
 *
 * @module services/drawing/sheetTypographyService
 */

const SHEET_FONT_SCALE = 2.6;
const SHEET_STROKE_SCALE = 1.6;

/**
 * Get typography multipliers for a renderer.
 *
 * @param {boolean} sheetMode - true when rendering for A1 board composition
 * @returns {{ fontScale: number, strokeScale: number }}
 */
export function getSheetTypography(sheetMode) {
  if (sheetMode === true) {
    return { fontScale: SHEET_FONT_SCALE, strokeScale: SHEET_STROKE_SCALE };
  }
  return { fontScale: 1, strokeScale: 1 };
}

/**
 * Scale a font size value (in px or pt) by the active sheet typography.
 *
 * @param {number} baseSize
 * @param {boolean} sheetMode
 * @returns {number}
 */
export function scaleFont(baseSize, sheetMode) {
  const { fontScale } = getSheetTypography(sheetMode);
  return Math.round(Number(baseSize || 0) * fontScale * 100) / 100;
}

/**
 * Scale a stroke width by the active sheet typography.
 *
 * @param {number} baseWidth
 * @param {boolean} sheetMode
 * @returns {number}
 */
export function scaleStroke(baseWidth, sheetMode) {
  const { strokeScale } = getSheetTypography(sheetMode);
  return Math.round(Number(baseWidth || 0) * strokeScale * 1000) / 1000;
}

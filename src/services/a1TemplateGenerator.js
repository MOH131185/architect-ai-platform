/**
 * A1 Template Generator (Hybrid A1)
 *
 * Generates a deterministic, resolution-aware layout definition for the
 * canvas compositor in `src/services/a1/A1SheetGenerator.js`.
 *
 * This file previously existed (per docs) but was missing from the tree,
 * causing build-time module resolution warnings and runtime dynamic-import
 * failures in hybrid workflows.
 */

const RESOLUTION_PRESETS = {
  print: { width: 9933, height: 7016 }, // A1 @ 300 DPI (landscape)
  high: { width: 7016, height: 4961 },
  medium: { width: 3508, height: 2480 },
  low: { width: 1754, height: 1240 },
  working: { width: 1792, height: 1269 },
};

const DEFAULTS = {
  resolution: "working",
  orientation: "landscape",
  format: "json",
};

function clampInt(value, min, max) {
  const n = Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(Math.max(n, min), max);
}

function buildGrid({ width, height }) {
  const minDim = Math.min(width, height);
  const margin = clampInt(minDim * 0.02, 8, 200);
  const gapX = clampInt(minDim * 0.008, 6, 80);
  const gapY = clampInt(minDim * 0.008, 6, 80);

  const cols = 6;
  const rows = 4;

  const contentWidth = width - 2 * margin - (cols - 1) * gapX;
  const baseColWidth = Math.floor(contentWidth / cols);
  const extraCol = contentWidth - baseColWidth * cols;
  const colWidths = Array.from(
    { length: cols },
    (_, idx) => baseColWidth + (idx < extraCol ? 1 : 0),
  );
  const colX = [];
  for (let i = 0; i < cols; i++) {
    const prevX = i === 0 ? margin : colX[i - 1] + colWidths[i - 1] + gapX;
    colX.push(prevX);
  }

  const titleRowHeight = clampInt(
    height * 0.17,
    120,
    Math.max(120, height - 2 * margin - 3 * gapY - 120),
  );
  const remainingHeight =
    height - 2 * margin - (rows - 1) * gapY - titleRowHeight;
  const row1Height = Math.floor(remainingHeight * 0.28);
  const row2Height = Math.floor(remainingHeight * 0.32);
  const row3Height = remainingHeight - row1Height - row2Height;
  const rowHeights = [row1Height, row2Height, row3Height, titleRowHeight];

  const rowY = [];
  for (let r = 0; r < rows; r++) {
    const prevY = r === 0 ? margin : rowY[r - 1] + rowHeights[r - 1] + gapY;
    rowY.push(prevY);
  }

  return { margin, gapX, gapY, colX, colWidths, rowY, rowHeights, cols, rows };
}

function spanWidth(colX, colWidths, gapX, startCol, colSpan) {
  const firstX = colX[startCol];
  const lastCol = startCol + colSpan - 1;
  const lastRight = colX[lastCol] + colWidths[lastCol];
  return { x: firstX, width: lastRight - firstX };
}

function createLayoutPanels(grid) {
  const { colX, colWidths, rowY, rowHeights, gapX } = grid;

  const at = (row, col, colSpan = 1) => {
    const { x, width } = spanWidth(colX, colWidths, gapX, col, colSpan);
    return {
      x,
      y: rowY[row],
      width,
      height: rowHeights[row],
    };
  };

  // 6-column grid; top hero spans 2 columns (col 1-2, 0-indexed).
  return [
    { id: "site-map", name: "SITE MAP", ...at(0, 0, 1) },
    { id: "3d-hero", name: "3D HERO VIEW", ...at(0, 1, 2) },
    { id: "material-palette", name: "MATERIAL PALETTE", ...at(0, 3, 1) },
    { id: "interior-3d", name: "INTERIOR VIEW", ...at(0, 4, 1) },
    { id: "climate", name: "CLIMATE", ...at(0, 5, 1) },

    { id: "ground-floor", name: "GROUND FLOOR PLAN", ...at(1, 0, 1) },
    { id: "first-floor", name: "FIRST FLOOR PLAN", ...at(1, 1, 1) },
    { id: "second-floor", name: "SECOND FLOOR PLAN", ...at(1, 2, 1) },
    { id: "axonometric", name: "AXONOMETRIC", ...at(1, 3, 1) },
    { id: "detail-views", name: "DETAIL VIEWS", ...at(1, 4, 1) },
    { id: "specs", name: "SPECS", ...at(1, 5, 1) },

    { id: "north-elevation", name: "NORTH ELEVATION", ...at(2, 0, 1) },
    { id: "south-elevation", name: "SOUTH ELEVATION", ...at(2, 1, 1) },
    { id: "east-elevation", name: "EAST ELEVATION", ...at(2, 2, 1) },
    { id: "west-elevation", name: "WEST ELEVATION", ...at(2, 3, 1) },
    { id: "section-a-a", name: "SECTION A-A", ...at(2, 4, 1) },
    { id: "section-b-b", name: "SECTION B-B", ...at(2, 5, 1) },

    { id: "title-block", name: "UK RIBA TITLE BLOCK", ...at(3, 0, 6) },
  ];
}

export function generateA1Template(options = {}) {
  const resolution = options.resolution || DEFAULTS.resolution;
  const orientation = options.orientation || DEFAULTS.orientation;
  const format = options.format || DEFAULTS.format;

  const preset = RESOLUTION_PRESETS[resolution] || RESOLUTION_PRESETS.working;
  const sheet =
    orientation === "portrait"
      ? { width: preset.height, height: preset.width }
      : { width: preset.width, height: preset.height };

  const grid = buildGrid(sheet);
  const panels = createLayoutPanels(grid);

  const layout = {
    id: "multi-panel-a1-grid-v1",
    orientation,
    resolution,
    sheet: {
      width: sheet.width,
      height: sheet.height,
    },
    grid: {
      cols: grid.cols,
      rows: grid.rows,
      margin: grid.margin,
      gapX: grid.gapX,
      gapY: grid.gapY,
    },
    panels,
  };

  if (format === "json") {
    return { layout };
  }

  // Other formats were historically supported but are not required by current callers.
  // Return a stable structure to avoid runtime surprises if used.
  return { layout };
}

export default {
  generateA1Template,
};

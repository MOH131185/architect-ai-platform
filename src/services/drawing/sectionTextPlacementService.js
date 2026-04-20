function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(Number(value || 0) * factor) / factor;
}

function estimateTextWidth(text = "", fontSize = 10) {
  return Math.max(
    40,
    String(text || "").length * Number(fontSize || 10) * 0.56,
  );
}

export function placeSectionTextBlocks({
  items = [],
  width = 1200,
  height = 760,
  anchor = "top-left",
} = {}) {
  const margin = 72;
  const lineGap = 6;
  const maxWidth = Math.min(360, Math.round(width * 0.34));
  const anchorX =
    anchor === "top-right"
      ? Math.max(margin, width - margin - maxWidth)
      : margin;
  let cursorY = 68;

  const placements = (items || []).map((item) => {
    const fontSize = Number(item.fontSize || 10);
    const textWidth = Math.min(
      maxWidth,
      estimateTextWidth(item.text || "", fontSize),
    );
    const boxHeight = Math.max(14, fontSize + 6);
    const placement = {
      ...item,
      x: round(anchorX),
      y: round(cursorY),
      box: {
        x: round(anchorX - 4),
        y: round(cursorY - fontSize),
        width: round(textWidth + 8),
        height: round(boxHeight),
      },
    };
    cursorY += boxHeight + lineGap;
    return placement;
  });

  return {
    version: "phase10-section-text-placement-v1",
    anchor,
    placements,
    heightUsed: round(cursorY - 68),
    overflow: cursorY > height - margin,
  };
}

export default {
  placeSectionTextBlocks,
};

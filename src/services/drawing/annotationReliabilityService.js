function countMatches(text = "", regex) {
  return (String(text || "").match(regex) || []).length;
}

function inferDrawingType(drawing = {}) {
  if (drawing.level_id) return "plan";
  if (drawing.orientation) return "elevation";
  if (drawing.section_type) return "section";
  return "unknown";
}

export function assessAnnotationReliability(drawing = {}, options = {}) {
  const svg = String(drawing.svg || "");
  const drawingType = options.drawingType || inferDrawingType(drawing);
  const errors = [];
  const warnings = [];
  const textElementCount = countMatches(svg, /<text\b/gi);
  const undefinedTokenCount = countMatches(svg, /\b(undefined|NaN)\b/g);
  const hasBrokenPath =
    /d="undefined"/i.test(svg) || /points="undefined"/i.test(svg);

  if (!svg.trim()) {
    errors.push("Drawing SVG payload is missing.");
  }
  if (drawing.status === "blocked") {
    errors.push(
      ...(drawing.blocking_reasons || [
        "Drawing renderer blocked because canonical geometry was too weak.",
      ]),
    );
  }
  if (undefinedTokenCount > 0 || hasBrokenPath) {
    errors.push(
      "Drawing SVG contains undefined or NaN values, so annotation/rendering reliability is compromised.",
    );
  }
  if (textElementCount === 0) {
    errors.push("Drawing contains no text annotations.");
  }

  if (drawingType === "plan") {
    const expectedMinimum = Math.max(3, Number(drawing.room_count || 0));
    if (textElementCount < expectedMinimum) {
      warnings.push(
        `Plan annotation density is weak: ${textElementCount} text nodes for ${drawing.room_count || 0} rooms.`,
      );
    }
    if (!/title-block/i.test(svg)) {
      warnings.push("Plan title block markup is missing.");
    }
  }

  if (drawingType === "elevation" && textElementCount < 2) {
    warnings.push("Elevation annotation density is weak.");
  }
  if (
    drawingType === "elevation" &&
    Number(drawing.technical_quality_metadata?.ffl_marker_count || 0) === 0
  ) {
    warnings.push("Elevation datum markers are missing.");
  }
  if (drawingType === "section" && textElementCount < 2) {
    warnings.push("Section annotation density is weak.");
  }
  if (
    drawingType === "section" &&
    Number(drawing.technical_quality_metadata?.cut_room_count || 0) === 0
  ) {
    warnings.push("Section cut does not communicate a named space.");
  }

  return {
    version: "phase6-annotation-reliability-v1",
    drawingType,
    annotationReliable: errors.length === 0,
    textElementCount,
    undefinedTokenCount,
    errors,
    warnings,
  };
}

export default {
  assessAnnotationReliability,
};

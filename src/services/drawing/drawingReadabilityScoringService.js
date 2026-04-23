function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundMetric(value, precision = 3) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
}

function inferDrawingType(drawing = {}) {
  if (drawing.level_id) return "plan";
  if (drawing.orientation) return "elevation";
  if (drawing.section_type) return "section";
  return "unknown";
}

export function scoreDrawingReadability(drawing = {}, options = {}) {
  const drawingType = options.drawingType || inferDrawingType(drawing);
  const quality = drawing.technical_quality_metadata || {};
  const isSheetMode = quality.sheet_mode === true || options.sheetMode === true;
  const warnings = [];
  let score = 0.45;

  if (drawingType === "plan") {
    const roomCount = Number(drawing.room_count || quality.room_count || 0);
    const labelRatio =
      roomCount > 0
        ? Number(quality.room_label_count || roomCount) / roomCount
        : 1;
    const lineHierarchy = quality.line_hierarchy || {};
    const hierarchyStrong =
      Number(lineHierarchy.exterior_wall || 0) >
      Number(lineHierarchy.interior_wall || 0);
    score += hierarchyStrong ? 0.12 : 0;
    score += clamp(labelRatio, 0, 1) * 0.18;
    score += quality.has_title_block || isSheetMode ? 0.07 : 0;
    score += quality.has_north_arrow ? 0.04 : 0;
    score += quality.has_legend ? 0.04 : 0;
    score += Number(quality.window_count || 0) > 0 ? 0.05 : 0;
    score += Number(quality.wall_count || 0) > 0 ? 0.08 : 0;
    score += Number(quality.stair_count || 0) > 0 ? 0.05 : 0;
    score += quality.has_external_dimensions ? 0.08 : 0;
    score += Number(quality.door_swing_count || 0) > 0 ? 0.07 : 0;
    score += Number(quality.furniture_hint_count || 0) > 0 ? 0.05 : 0;
    if (labelRatio < 0.8) {
      warnings.push("Plan room labels are incomplete relative to room count.");
    }
    if (!hierarchyStrong) {
      warnings.push("Plan line hierarchy is weak.");
    }
    if (!quality.has_external_dimensions) {
      warnings.push("Plan external dimensions are missing.");
    }
  } else if (drawingType === "elevation") {
    score +=
      Number(drawing.window_count || quality.window_count || 0) > 0 ? 0.15 : 0;
    score += Number(quality.level_label_count || 0) > 0 ? 0.12 : 0;
    score += Number(quality.floor_line_count || 0) > 0 ? 0.12 : 0;
    score += quality.has_title || isSheetMode ? 0.08 : 0;
    score += Number(quality.bay_count || 0) > 0 ? 0.05 : 0;
    score += Number(quality.material_zone_count || 0) > 0 ? 0.08 : 0;
    score += Number(quality.ffl_marker_count || 0) > 0 ? 0.07 : 0;
    score += Number(quality.feature_count || 0) > 0 ? 0.06 : 0;
    if (!quality.has_title && !isSheetMode) {
      warnings.push("Elevation title annotation is missing.");
    }
    if (Number(quality.facade_richness_score || 0) < 0.5) {
      warnings.push("Elevation facade richness is weak.");
    }
  } else if (drawingType === "section") {
    score +=
      Number(drawing.stair_count || quality.stair_count || 0) > 0 ? 0.14 : 0;
    score += Number(quality.room_label_count || 0) > 0 ? 0.15 : 0;
    score += Number(quality.slab_line_count || 0) > 0 ? 0.12 : 0;
    score += Number(quality.level_label_count || 0) > 0 ? 0.1 : 0;
    score += quality.has_title || isSheetMode ? 0.08 : 0;
    score += Number(quality.foundation_marker_count || 0) > 0 ? 0.08 : 0;
    score += Number(quality.stair_tread_count || 0) > 0 ? 0.06 : 0;
    score += quality.roof_profile_visible ? 0.06 : 0;
    if (Number(quality.room_label_count || 0) === 0) {
      warnings.push("Section room labels are missing.");
    }
  } else {
    warnings.push("Unknown drawing type; readability heuristics are limited.");
  }

  return {
    version: "phase6-drawing-readability-v1",
    drawingType,
    score: roundMetric(clamp(score, 0, 1)),
    warnings,
  };
}

export default {
  scoreDrawingReadability,
};

export function evaluateSpanSanity(
  projectGeometry = {},
  structuralGrid = null,
) {
  const warnings = [];
  const spans = structuralGrid?.spans || [];

  spans.forEach((span) => {
    if (Number(span.span_m || 0) > 7.5) {
      warnings.push(
        `structural span ${span.from}-${span.to} is wide at ${Number(span.span_m).toFixed(2)}m.`,
      );
    }
  });

  (projectGeometry.rooms || []).forEach((room) => {
    const width = Number(room.bbox?.width || 0);
    const depth = Number(room.bbox?.height || 0);
    if (Math.max(width, depth) > 8.5) {
      warnings.push(
        `room "${room.id}" creates a long unsupported span of ${Math.max(width, depth).toFixed(2)}m.`,
      );
    }
  });

  return {
    valid: true,
    warnings,
    errors: [],
  };
}

export default {
  evaluateSpanSanity,
};

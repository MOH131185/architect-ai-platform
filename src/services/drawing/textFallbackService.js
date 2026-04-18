export function resolveRenderableText(
  value,
  fallback = "UNLABELED",
  options = {},
) {
  const trimmed = String(value ?? "").trim();
  const warnings = [];
  const minimumLength = Math.max(1, Number(options.minimumLength || 1));
  const invalid =
    !trimmed ||
    trimmed.length < minimumLength ||
    /^(undefined|null|nan)$/i.test(trimmed);

  if (!invalid) {
    return {
      text: trimmed,
      usedFallback: false,
      warnings,
    };
  }

  warnings.push(
    `Backend text payload was empty or invalid; fallback text "${fallback}" was used.`,
  );
  return {
    text: String(fallback || "UNLABELED"),
    usedFallback: true,
    warnings,
  };
}

export default {
  resolveRenderableText,
};

const PATH_ELEMENT_RE = /<path\b[^>]*\/>|<path\b[^>]*>[\s\S]*?<\/path>/gi;
const PATH_D_ATTR_RE = /\bd\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i;
const INVALID_PATH_DATA_RE = /\b(?:undefined|null|NaN|Infinity|-Infinity)\b/i;

export function getSvgPathData(pathElement = "") {
  const match = String(pathElement || "").match(PATH_D_ATTR_RE);
  if (!match) return null;
  return String(match[1] ?? match[2] ?? match[3] ?? "").trim();
}

export function isInvalidSvgPathData(pathData = "") {
  const normalized = String(pathData || "").trim();
  return (
    !normalized ||
    INVALID_PATH_DATA_RE.test(normalized) ||
    !/^[Mm]/.test(normalized)
  );
}

export function sanitizeInvalidSvgPaths(svgString = "") {
  if (typeof svgString !== "string") {
    return "";
  }

  return svgString.replace(PATH_ELEMENT_RE, (pathElement) => {
    const pathData = getSvgPathData(pathElement);
    if (pathData === null) {
      return pathElement;
    }
    return isInvalidSvgPathData(pathData) ? "" : pathElement;
  });
}

function decodeSvgDataUrlPayload(meta, payload) {
  if (/;base64\b/i.test(meta)) {
    if (typeof atob === "function") {
      return atob(payload.replace(/\s/g, ""));
    }
    return "";
  }
  try {
    return decodeURIComponent(payload);
  } catch {
    return payload;
  }
}

export function svgToSanitizedDataUrl(svgString = "") {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    sanitizeInvalidSvgPaths(svgString),
  )}`;
}

export function sanitizeSvgDataUrl(value = "") {
  if (typeof value !== "string" || !value.startsWith("data:image/svg")) {
    return value;
  }
  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) {
    return value;
  }
  const meta = value.slice(5, commaIndex);
  const payload = value.slice(commaIndex + 1);
  const svgString = decodeSvgDataUrlPayload(meta, payload);
  return svgToSanitizedDataUrl(svgString);
}

export default sanitizeInvalidSvgPaths;

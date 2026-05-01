import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";
import {
  getBlueprintTheme,
  resolveCompiledProjectGeometryInput,
} from "./drawingBounds.js";
import { getSheetTypography } from "./sheetTypographyService.js";

const IDENTITY_TYPOGRAPHY = { fontScale: 1, strokeScale: 1 };

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function formatNumber(value, precision = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "0";
  }
  const factor = 10 ** precision;
  return (Math.round(numeric * factor) / factor).toFixed(precision);
}

function scaleSize(base, multiplier) {
  return Math.round(Number(base || 0) * Number(multiplier || 1) * 100) / 100;
}

function pointOf(value = {}) {
  return {
    x: Number(value?.x ?? value?.[0] ?? 0),
    y: Number(value?.y ?? value?.[1] ?? 0),
  };
}

function normalizePolygon(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => pointOf(entry))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

function polygonBounds(points = []) {
  if (!points.length) {
    return { min_x: 0, min_y: 0, max_x: 0, max_y: 0, width: 0, height: 0 };
  }
  let min_x = Infinity;
  let min_y = Infinity;
  let max_x = -Infinity;
  let max_y = -Infinity;
  for (const p of points) {
    if (p.x < min_x) min_x = p.x;
    if (p.y < min_y) min_y = p.y;
    if (p.x > max_x) max_x = p.x;
    if (p.y > max_y) max_y = p.y;
  }
  return {
    min_x,
    min_y,
    max_x,
    max_y,
    width: max_x - min_x,
    height: max_y - min_y,
  };
}

function polygonArea(points = []) {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area / 2);
}

function buildTransform(bounds, width, height, padding) {
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const scale = Math.min(
    availableWidth / Math.max(bounds.width, 1),
    availableHeight / Math.max(bounds.height, 1),
  );
  const contentWidth = bounds.width * scale;
  const contentHeight = bounds.height * scale;
  const offsetX = padding + (availableWidth - contentWidth) / 2;
  const offsetY = padding + (availableHeight - contentHeight) / 2;
  return {
    scale,
    project(point = {}) {
      return {
        x: offsetX + (Number(point.x || 0) - bounds.min_x) * scale,
        y: offsetY + (Number(point.y || 0) - bounds.min_y) * scale,
      };
    },
  };
}

function polygonPath(points = [], project) {
  if (points.length < 2 || typeof project !== "function") {
    return "";
  }
  const projected = points.map((p) => project(p));
  return `${projected
    .map(
      (p, index) =>
        `${index === 0 ? "M" : "L"} ${formatNumber(p.x)} ${formatNumber(p.y)}`,
    )
    .join(" ")} Z`;
}

function chooseScaleBarMeters(scalePxPerMeter = 1) {
  const candidates = [1, 2, 5, 10, 20, 50];
  const eligible = candidates.filter(
    (entry) => entry * Math.max(scalePxPerMeter, 1) <= 200,
  );
  return eligible[eligible.length - 1] || 5;
}

function resolveNeighbourPolygons(geometry = {}) {
  const fromSite = Array.isArray(geometry?.site?.neighbouring_buildings)
    ? geometry.site.neighbouring_buildings
    : null;
  const fromMetadata = Array.isArray(
    geometry?.metadata?.context?.neighbouring_buildings,
  )
    ? geometry.metadata.context.neighbouring_buildings
    : null;
  const list = fromSite || fromMetadata || [];
  return list
    .map((entry) => normalizePolygon(entry?.polygon || entry?.points || entry))
    .filter((poly) => poly.length >= 3);
}

function resolveBuildingFootprint(geometry = {}) {
  const footprintEntries = geometry?.footprints || [];
  const groundLevel =
    geometry?.levels?.find((level) => Number(level?.level_number || 0) === 0) ||
    geometry?.levels?.[0];
  const groundFootprint = footprintEntries.find(
    (entry) => entry?.level_id === groundLevel?.id,
  );
  const polygon = normalizePolygon(
    groundFootprint?.polygon || footprintEntries[0]?.polygon || [],
  );
  return polygon;
}

/**
 * Render a deterministic UK RIBA-style site plan SVG from the canonical
 * project geometry. Outputs:
 *   - Site boundary
 *   - Buildable envelope (setback) — dashed
 *   - Building footprint — filled poche
 *   - Neighbouring buildings — light outline
 *   - North arrow + scale bar
 *   - Site / footprint area annotation
 *
 * Returns { svg, status, blocking_reasons, technical_quality_metadata }.
 */
export function renderSiteSvg(geometryInput = {}, options = {}) {
  const rawGeometry = resolveCompiledProjectGeometryInput(geometryInput);
  const geometry = coerceToCanonicalProjectGeometry(rawGeometry);
  const theme = getBlueprintTheme();
  const width = options.width || 1200;
  const height = options.height || 900;
  const sheetMode = options.sheetMode === true;
  const typo = getSheetTypography(sheetMode);
  const padding = sheetMode ? 36 : 70;
  const northRotationDeg =
    Number(
      geometry?.site?.north_orientation_deg ||
        geometry?.metadata?.context?.north_orientation_deg ||
        0,
    ) || 0;

  const sitePolygon = normalizePolygon(
    geometry?.site?.boundary_polygon || geometry?.site?.boundary || [],
  );
  const buildablePolygon = normalizePolygon(
    geometry?.site?.buildable_polygon || [],
  );
  const buildingFootprint = resolveBuildingFootprint(geometry);
  const neighbourPolygons = resolveNeighbourPolygons(geometry);

  if (sitePolygon.length < 3) {
    return {
      svg: null,
      status: "blocked",
      blocking_reasons: [
        "Site plan cannot be rendered — site.boundary_polygon is missing or has fewer than 3 vertices.",
      ],
      renderer: "deterministic-site-svg",
      title: "Site Plan",
      technical_quality_metadata: {
        drawing_type: "site_plan",
        sheet_mode: sheetMode,
        site_boundary_present: false,
      },
    };
  }

  const allPoints = [
    ...sitePolygon,
    ...buildablePolygon,
    ...buildingFootprint,
    ...neighbourPolygons.flat(),
  ];
  const bounds = polygonBounds(allPoints);
  const transform = buildTransform(bounds, width, height, padding);
  const project = transform.project;

  const siteOutlineStroke = scaleSize(2.4, typo.strokeScale);
  const buildableStroke = scaleSize(1.2, typo.strokeScale);
  const footprintStroke = scaleSize(2.0, typo.strokeScale);
  const neighbourStroke = scaleSize(0.9, typo.strokeScale);

  const sitePath = polygonPath(sitePolygon, project);
  const buildablePath = polygonPath(buildablePolygon, project);
  const footprintPath = polygonPath(buildingFootprint, project);
  const neighbourMarkup = neighbourPolygons
    .map((poly) => polygonPath(poly, project))
    .filter(Boolean)
    .map(
      (path) =>
        `<path d="${path}" fill="${theme.fillSoft}" fill-opacity="0.35" stroke="${theme.lineLight}" stroke-width="${neighbourStroke}" stroke-linejoin="miter"/>`,
    )
    .join("");

  // Site area + footprint area annotations
  const siteAreaM2 = polygonArea(sitePolygon);
  const footprintAreaM2 = polygonArea(buildingFootprint);
  const buildableAreaM2 = polygonArea(buildablePolygon);

  // Scale bar
  const barMeters = chooseScaleBarMeters(transform.scale);
  const barWidthPx = barMeters * transform.scale;
  const barX = width - padding - barWidthPx - 8;
  const barY = height - padding + 30;
  const barTick = scaleSize(4, typo.strokeScale);
  const barStroke = scaleSize(1.6, typo.strokeScale);
  const barFontSize = scaleSize(10, typo.fontScale);
  const barLabelOffset = scaleSize(16, typo.fontScale);
  const scaleBar = `
    <g id="site-scale-bar">
      <line x1="${formatNumber(barX)}" y1="${formatNumber(
        barY,
      )}" x2="${formatNumber(barX + barWidthPx)}" y2="${formatNumber(
        barY,
      )}" stroke="${theme.line}" stroke-width="${barStroke}"/>
      <line x1="${formatNumber(barX)}" y1="${formatNumber(
        barY - barTick,
      )}" x2="${formatNumber(barX)}" y2="${formatNumber(
        barY + barTick,
      )}" stroke="${theme.line}" stroke-width="${barStroke}"/>
      <line x1="${formatNumber(barX + barWidthPx / 2)}" y1="${formatNumber(
        barY - barTick,
      )}" x2="${formatNumber(barX + barWidthPx / 2)}" y2="${formatNumber(
        barY + barTick,
      )}" stroke="${theme.line}" stroke-width="${barStroke}"/>
      <line x1="${formatNumber(barX + barWidthPx)}" y1="${formatNumber(
        barY - barTick,
      )}" x2="${formatNumber(barX + barWidthPx)}" y2="${formatNumber(
        barY + barTick,
      )}" stroke="${theme.line}" stroke-width="${barStroke}"/>
      <text x="${formatNumber(barX + barWidthPx / 2)}" y="${formatNumber(
        barY + barLabelOffset,
      )}" font-size="${barFontSize}" font-family="Arial, sans-serif" text-anchor="middle">${escapeXml(
        `${barMeters} m`,
      )}</text>
    </g>
  `;

  // North arrow (always visible on site plans)
  const northX = width - padding + 8;
  const northY = padding + 8;
  const northTail = scaleSize(38, typo.fontScale);
  const northHead = scaleSize(11, typo.fontScale);
  const northWing = scaleSize(8, typo.fontScale);
  const northFlick = scaleSize(5, typo.fontScale);
  const northStroke = scaleSize(2.4, typo.strokeScale);
  const northFont = scaleSize(13, typo.fontScale);
  const northLabel = scaleSize(18, typo.fontScale);
  const northArrow = `
    <g id="site-north-arrow" transform="translate(${formatNumber(
      northX,
    )} ${formatNumber(northY)}) rotate(${formatNumber(northRotationDeg, 0)})">
      <line x1="0" y1="${formatNumber(northTail)}" x2="0" y2="0" stroke="${theme.line}" stroke-width="${northStroke}"/>
      <path d="M 0 ${formatNumber(-northHead)} L ${formatNumber(-northWing)} ${formatNumber(northFlick)} L ${formatNumber(northWing)} ${formatNumber(northFlick)} Z" fill="${theme.line}"/>
      <text x="0" y="${formatNumber(-northLabel)}" font-size="${northFont}" font-family="Arial, sans-serif" font-weight="700" text-anchor="middle">N</text>
    </g>
  `;

  // Annotation block (bottom-left)
  const annoFontPrimary = scaleSize(11, typo.fontScale);
  const annoFontSecondary = scaleSize(9.5, typo.fontScale);
  const annoX = padding;
  const annoY = height - padding + 20;
  const annoLineHeight = scaleSize(15, typo.fontScale);
  const annotation = `
    <g id="site-annotations">
      <text x="${formatNumber(annoX)}" y="${formatNumber(
        annoY,
      )}" font-size="${annoFontPrimary}" font-family="Arial, sans-serif" font-weight="700">${escapeXml(
        "SITE PLAN",
      )}</text>
      <text x="${formatNumber(annoX)}" y="${formatNumber(
        annoY + annoLineHeight,
      )}" font-size="${annoFontSecondary}" font-family="Arial, sans-serif">${escapeXml(
        `Site area: ${siteAreaM2.toFixed(0)} m²  ·  Buildable: ${buildableAreaM2.toFixed(0)} m²  ·  Footprint: ${footprintAreaM2.toFixed(0)} m²`,
      )}</text>
    </g>
  `;

  // Site label centered (only when there's room)
  const siteCenterX = (bounds.min_x + bounds.max_x) / 2;
  const siteCenterY = (bounds.min_y + bounds.max_y) / 2;
  const siteCenter = project({ x: siteCenterX, y: siteCenterY });
  const _ = siteCenter; // reserved for future "PROPOSED DWELLING" callout
  void _;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-theme="${theme.name}" data-renderer="deterministic-site-svg">
  <rect width="${width}" height="${height}" fill="${theme.paper}"/>
  ${neighbourMarkup ? `<g id="site-neighbours">${neighbourMarkup}</g>` : ""}
  ${
    sitePath
      ? `<path d="${sitePath}" fill="none" stroke="${theme.line}" stroke-width="${siteOutlineStroke}" stroke-linejoin="miter"/>`
      : ""
  }
  ${
    buildablePath
      ? `<path d="${buildablePath}" fill="none" stroke="${theme.lineMuted}" stroke-width="${buildableStroke}" stroke-dasharray="8 5"/>`
      : ""
  }
  ${
    footprintPath
      ? `<path d="${footprintPath}" fill="${theme.poche}" fill-opacity="0.85" stroke="${theme.line}" stroke-width="${footprintStroke}" stroke-linejoin="miter"/>`
      : ""
  }
  ${northArrow}
  ${scaleBar}
  ${annotation}
  ${options.overlayMarkup || ""}
</svg>`;

  return {
    svg,
    status: "ready",
    blocking_reasons: [],
    renderer: "deterministic-site-svg",
    title: "Site Plan",
    technical_quality_metadata: {
      drawing_type: "site_plan",
      sheet_mode: sheetMode,
      site_boundary_present: sitePolygon.length >= 3,
      buildable_present: buildablePolygon.length >= 3,
      footprint_present: buildingFootprint.length >= 3,
      neighbour_count: neighbourPolygons.length,
      north_orientation_deg: northRotationDeg,
      site_area_m2: Number(siteAreaM2.toFixed(2)),
      buildable_area_m2: Number(buildableAreaM2.toFixed(2)),
      footprint_area_m2: Number(footprintAreaM2.toFixed(2)),
      coverage_ratio:
        siteAreaM2 > 0
          ? Number(clamp(footprintAreaM2 / siteAreaM2, 0, 1).toFixed(3))
          : 0,
      has_north_arrow: true,
      has_scale_bar: true,
      scale_bar_meters: barMeters,
      blueprint_theme: theme.name,
    },
  };
}

export default {
  renderSiteSvg,
};

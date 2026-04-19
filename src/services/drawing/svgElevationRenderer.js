import { coerceToCanonicalProjectGeometry } from "../cad/geometryFactory.js";
import {
  getCanonicalMaterialPalette,
  getPrimaryHex,
} from "../design/canonicalMaterialPalette.js";

const ELEV_FONT = "EmbeddedSans, 'Segoe UI', Arial, sans-serif";

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function orientationToSide(orientation = "south") {
  const normalized = String(orientation || "south").toLowerCase();
  if (["north", "south", "east", "west"].includes(normalized)) {
    return normalized;
  }
  return "south";
}

function metricsFromGeometry(geometry = {}) {
  const buildable = geometry.site?.buildable_bbox ||
    geometry.site?.boundary_bbox || {
      width: 12,
      height: 10,
    };
  const levels = geometry.levels || [];
  const totalHeight =
    levels.reduce((sum, level) => sum + Number(level.height_m || 3.2), 0) ||
    3.2;

  return {
    width_m: buildable.width || 12,
    depth_m: buildable.height || 10,
    total_height_m: totalHeight,
    level_count: Math.max(1, levels.length),
  };
}

function projectAlongOrientation(room = {}, orientation = "south") {
  const side = orientationToSide(orientation);
  if (side === "east" || side === "west") {
    return {
      start: room.bbox.min_y,
      end: room.bbox.max_y,
    };
  }
  return {
    start: room.bbox.min_x,
    end: room.bbox.max_x,
  };
}

function findFacadeOrientation(geometry = {}, options = {}) {
  const facadeGrammar =
    options.facadeGrammar || geometry.metadata?.facade_grammar;
  const side = orientationToSide(options.orientation || "south");
  return (
    facadeGrammar?.orientations?.find((entry) => entry.side === side) || null
  );
}

function pickRoofType(styleDNA = {}) {
  const roofLanguage = String(
    styleDNA.roof_language || styleDNA.roofType || "",
  ).toLowerCase();
  if (roofLanguage.includes("flat")) return "flat";
  if (roofLanguage.includes("mono") || roofLanguage.includes("shed"))
    return "mono";
  if (roofLanguage.includes("hip")) return "hip";
  return "gable";
}

function parseElevationFeaturesFromDNA(styleDNA = {}, orientation = "south") {
  const entry =
    styleDNA?.elevations?.[orientation] ||
    styleDNA?._structured?.elevations?.[orientation] ||
    {};
  const featureList = Array.isArray(entry.features) ? entry.features : [];
  const distinctive = String(entry.distinctiveFeatures || "");
  const blob = [...featureList, distinctive].join(" ").toLowerCase();
  return {
    hasPorch: /porch|veranda|canopy/.test(blob),
    hasDormer: /dormer/.test(blob),
    hasChimney: /chimney/.test(blob),
    hasBay: /\bbay window|bay\b/.test(blob),
    hasGable: /gable/.test(blob),
    hasBalcony: /balcon|juliet/.test(blob),
    raw: featureList,
  };
}

function shadePattern(pattern = "", hex = "#d4c9b4") {
  const p = String(pattern || "").toLowerCase();
  if (p.includes("brick")) return "brick";
  if (p.includes("clap") || p.includes("board") || p.includes("lap"))
    return "clapboard";
  if (p.includes("timber") || p.includes("wood")) return "timber";
  if (p.includes("stone") || p.includes("masonry")) return "stone";
  if (p.includes("render") || p.includes("stucco") || p.includes("plaster"))
    return "render";
  if (p.includes("metal") || p.includes("zinc") || p.includes("panel"))
    return "panel";
  return "render";
}

function buildPatternDefs(palette) {
  const primaryHex = palette.primary?.hexColor || "#d4c9b4";
  const secondaryHex = palette.secondary?.hexColor || "#a69886";
  const roofHex = palette.roof?.hexColor || "#3f434a";
  const frameHex = palette.windowFrame?.hexColor || "#222222";
  const stoneHex = "#b8b0a2";

  return `
    <!-- Brick pattern -->
    <pattern id="pat-brick" x="0" y="0" width="24" height="12" patternUnits="userSpaceOnUse">
      <rect width="24" height="12" fill="${primaryHex}"/>
      <path d="M0 0 L24 0 M0 6 L24 6 M0 12 L24 12 M12 0 L12 6 M0 6 L0 12 M24 6 L24 12 M6 6 L6 12 M18 6 L18 12" stroke="rgba(0,0,0,0.35)" stroke-width="0.6"/>
    </pattern>
    <!-- Clapboard horizontal lap siding -->
    <pattern id="pat-clapboard" x="0" y="0" width="32" height="10" patternUnits="userSpaceOnUse">
      <rect width="32" height="10" fill="${primaryHex}"/>
      <line x1="0" y1="0" x2="32" y2="0" stroke="rgba(0,0,0,0.35)" stroke-width="0.7"/>
      <line x1="0" y1="5" x2="32" y2="5" stroke="rgba(0,0,0,0.25)" stroke-width="0.5"/>
    </pattern>
    <!-- Vertical timber -->
    <pattern id="pat-timber" x="0" y="0" width="14" height="40" patternUnits="userSpaceOnUse">
      <rect width="14" height="40" fill="${primaryHex}"/>
      <line x1="0" y1="0" x2="0" y2="40" stroke="rgba(0,0,0,0.35)" stroke-width="0.7"/>
      <line x1="7" y1="0" x2="7" y2="40" stroke="rgba(0,0,0,0.15)" stroke-width="0.4"/>
    </pattern>
    <!-- Render / stucco (smooth with faint stipple) -->
    <pattern id="pat-render" x="0" y="0" width="16" height="16" patternUnits="userSpaceOnUse">
      <rect width="16" height="16" fill="${primaryHex}"/>
      <circle cx="3" cy="4" r="0.4" fill="rgba(0,0,0,0.12)"/>
      <circle cx="11" cy="9" r="0.4" fill="rgba(0,0,0,0.12)"/>
      <circle cx="6" cy="13" r="0.4" fill="rgba(0,0,0,0.12)"/>
    </pattern>
    <!-- Stone / masonry -->
    <pattern id="pat-stone" x="0" y="0" width="36" height="18" patternUnits="userSpaceOnUse">
      <rect width="36" height="18" fill="${stoneHex}"/>
      <path d="M0 0 L36 0 M0 9 L36 9 M0 18 L36 18 M12 0 L12 9 M24 0 L24 9 M6 9 L6 18 M18 9 L18 18 M30 9 L30 18" stroke="rgba(0,0,0,0.3)" stroke-width="0.6"/>
    </pattern>
    <!-- Metal / panel seam -->
    <pattern id="pat-panel" x="0" y="0" width="48" height="18" patternUnits="userSpaceOnUse">
      <rect width="48" height="18" fill="${secondaryHex}"/>
      <line x1="0" y1="0" x2="0" y2="18" stroke="rgba(0,0,0,0.3)" stroke-width="0.8"/>
      <line x1="24" y1="0" x2="24" y2="18" stroke="rgba(0,0,0,0.3)" stroke-width="0.8"/>
    </pattern>
    <!-- Roof material (tile/slate hatch) -->
    <pattern id="pat-roof" x="0" y="0" width="20" height="10" patternUnits="userSpaceOnUse">
      <rect width="20" height="10" fill="${roofHex}"/>
      <path d="M0 10 L10 0 L20 10" stroke="rgba(255,255,255,0.2)" stroke-width="0.5" fill="none"/>
    </pattern>
    <!-- Ground hatch -->
    <pattern id="pat-ground" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
      <path d="M0 10 L10 0" stroke="#222" stroke-width="0.6"/>
    </pattern>
    <!-- Window glazing tint -->
    <linearGradient id="grad-glass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#a7c7e7" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#5f86b3" stop-opacity="0.85"/>
    </linearGradient>
    <!-- Frame colour as reusable swatch -->
    <pattern id="pat-frame" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="4" fill="${frameHex}"/>
    </pattern>`;
}

function patternUrl(materialSlot, palette) {
  if (!materialSlot) return `url(#pat-render)`;
  const key = shadePattern(
    materialSlot.pattern || materialSlot.name || "",
    materialSlot.hexColor,
  );
  return `url(#pat-${key})`;
}

function renderGround(baseX, baseY, width, padding) {
  const gx1 = padding * 0.5;
  const gx2 = baseX + width + (baseX - padding * 0.5);
  return `
    <line x1="${padding * 0.5}" y1="${baseY}" x2="${gx2}" y2="${baseY}" stroke="#111" stroke-width="1.8"/>
    <rect x="${padding * 0.5}" y="${baseY}" width="${gx2 - padding * 0.5}" height="14" fill="url(#pat-ground)" opacity="0.55"/>`;
}

function renderRoof(
  roofType,
  baseX,
  roofBaseY,
  horizontalExtent,
  scale,
  primaryFill,
  eaveProjection = 0.25,
) {
  const eave = eaveProjection * scale;
  const ridgeHeight = Math.max(40, horizontalExtent * scale * 0.12);
  const x1 = baseX - eave;
  const x2 = baseX + horizontalExtent * scale + eave;
  if (roofType === "flat") {
    const parapetHeight = 16;
    return `
      <rect x="${x1}" y="${roofBaseY - parapetHeight}" width="${x2 - x1}" height="${parapetHeight}" fill="url(#pat-panel)" stroke="#111" stroke-width="1.5"/>
      <line x1="${x1}" y1="${roofBaseY}" x2="${x2}" y2="${roofBaseY}" stroke="#111" stroke-width="1.2"/>`;
  }
  if (roofType === "mono") {
    return `
      <path d="M ${x1} ${roofBaseY} L ${x1} ${roofBaseY - ridgeHeight} L ${x2} ${roofBaseY} Z" fill="url(#pat-roof)" stroke="#111" stroke-width="1.8"/>
      <line x1="${x1}" y1="${roofBaseY - ridgeHeight}" x2="${x2}" y2="${roofBaseY}" stroke="#111" stroke-width="2"/>`;
  }
  if (roofType === "hip") {
    const midX = baseX + (horizontalExtent * scale) / 2;
    const shoulder = Math.min(horizontalExtent * scale * 0.25, 70);
    return `
      <path d="M ${x1} ${roofBaseY} L ${baseX + shoulder} ${roofBaseY - ridgeHeight} L ${baseX + horizontalExtent * scale - shoulder} ${roofBaseY - ridgeHeight} L ${x2} ${roofBaseY} Z" fill="url(#pat-roof)" stroke="#111" stroke-width="1.8"/>
      <line x1="${baseX + shoulder}" y1="${roofBaseY - ridgeHeight}" x2="${baseX + horizontalExtent * scale - shoulder}" y2="${roofBaseY - ridgeHeight}" stroke="#111" stroke-width="1.4"/>`;
  }
  // gable (default)
  const midX = baseX + (horizontalExtent * scale) / 2;
  return `
    <path d="M ${x1} ${roofBaseY} L ${midX} ${roofBaseY - ridgeHeight} L ${x2} ${roofBaseY} Z" fill="url(#pat-roof)" stroke="#111" stroke-width="1.8"/>
    <line x1="${x1}" y1="${roofBaseY}" x2="${x2}" y2="${roofBaseY}" stroke="#111" stroke-width="1.2"/>`;
}

function renderMaterialZones(
  facadeOrientation,
  baseX,
  baseY,
  horizontalExtent,
  scale,
  totalHeight,
  palette,
) {
  const zones = facadeOrientation?.material_zones || [];
  if (zones.length === 0) {
    // Fallback: single primary zone
    return `<rect x="${baseX}" y="${baseY - totalHeight * scale}" width="${horizontalExtent * scale}" height="${totalHeight * scale}" fill="${patternUrl(palette.primary, palette)}" stroke="#111" stroke-width="1.5"/>`;
  }
  const zoneHeight = (totalHeight * scale) / zones.length;
  return zones
    .map((zone, index) => {
      const zoneName = String(
        zone?.material || zone?.name || zone || "",
      ).toLowerCase();
      let slot = palette.primary;
      if (zoneName.includes("secondary") || zoneName.includes("trim"))
        slot = palette.secondary || palette.primary;
      else if (zoneName.includes("roof"))
        slot = palette.roof || palette.primary;
      else if (zoneName.includes("stone"))
        slot = { ...palette.primary, pattern: "stone" };
      const y = baseY - totalHeight * scale + zoneHeight * index;
      return `<rect x="${baseX}" y="${y}" width="${horizontalExtent * scale}" height="${zoneHeight}" fill="${patternUrl(slot, palette)}" stroke="#111" stroke-width="0.8"/>`;
    })
    .join("");
}

function renderFFLMarkers(baseX, baseY, horizontalExtent, scale, levels) {
  const offsetX = -40;
  let stacked = 0;
  const parts = [];
  parts.push(
    `<g>
      <line x1="${baseX - 30}" y1="${baseY}" x2="${baseX}" y2="${baseY}" stroke="#111" stroke-width="1"/>
      <circle cx="${baseX - 30}" cy="${baseY}" r="2.5" fill="#111"/>
      <text x="${baseX - 38}" y="${baseY + 4}" font-size="10" font-weight="700" font-family="${ELEV_FONT}" text-anchor="end">GF ±0.000</text>
    </g>`,
  );
  for (const level of levels) {
    stacked += Number(level.height_m || 3.2);
    if (level.level_number === 0) continue;
    const y = baseY - stacked * scale;
    const label = `${level.name || `L${level.level_number}`} +${stacked.toFixed(3)}`;
    parts.push(
      `<g>
        <line x1="${baseX - 30}" y1="${y}" x2="${baseX}" y2="${y}" stroke="#111" stroke-width="1"/>
        <circle cx="${baseX - 30}" cy="${y}" r="2.5" fill="none" stroke="#111" stroke-width="0.8"/>
        <text x="${baseX - 38}" y="${y + 4}" font-size="10" font-weight="700" font-family="${ELEV_FONT}" text-anchor="end">${escapeXml(label)}</text>
      </g>`,
    );
  }
  return parts.join("");
}

function renderWindowWithMuntin(x, y, w, h, palette) {
  const frame = palette.windowFrame?.hexColor || "#222";
  const inset = 2.5;
  return `
    <g>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${frame}" stroke="${frame}" stroke-width="1"/>
      <rect x="${x + inset}" y="${y + inset}" width="${w - inset * 2}" height="${h - inset * 2}" fill="url(#grad-glass)"/>
      <line x1="${x + w / 2}" y1="${y + inset}" x2="${x + w / 2}" y2="${y + h - inset}" stroke="${frame}" stroke-width="1"/>
      <line x1="${x + inset}" y1="${y + h / 2}" x2="${x + w - inset}" y2="${y + h / 2}" stroke="${frame}" stroke-width="0.8"/>
      <!-- sill tab -->
      <rect x="${x - 2}" y="${y + h}" width="${w + 4}" height="3" fill="#bfb59f" stroke="#111" stroke-width="0.6"/>
      <!-- lintel -->
      <line x1="${x - 2}" y1="${y - 1.5}" x2="${x + w + 2}" y2="${y - 1.5}" stroke="#111" stroke-width="0.9"/>
    </g>`;
}

function renderPorch(baseX, baseY, horizontalExtent, scale, orientation) {
  // Centered porch 2.4m wide x 2.4m tall canopy with two posts
  const porchWidth = Math.min(2.4 * scale, horizontalExtent * scale * 0.35);
  const porchHeight = 2.4 * scale;
  const cx = baseX + (horizontalExtent * scale) / 2;
  const x1 = cx - porchWidth / 2;
  const x2 = cx + porchWidth / 2;
  const roofY = baseY - porchHeight;
  return `
    <g class="porch">
      <!-- Canopy roof -->
      <path d="M ${x1 - 8} ${roofY} L ${cx} ${roofY - 14} L ${x2 + 8} ${roofY}" fill="url(#pat-roof)" stroke="#111" stroke-width="1.4"/>
      <!-- Posts -->
      <rect x="${x1}" y="${roofY}" width="5" height="${porchHeight}" fill="#4a3a28" stroke="#111" stroke-width="0.8"/>
      <rect x="${x2 - 5}" y="${roofY}" width="5" height="${porchHeight}" fill="#4a3a28" stroke="#111" stroke-width="0.8"/>
      <!-- Door -->
      <rect x="${cx - 14}" y="${baseY - porchHeight + 4}" width="28" height="${porchHeight - 4}" fill="#7d5a3d" stroke="#111" stroke-width="1"/>
      <line x1="${cx}" y1="${baseY - porchHeight + 8}" x2="${cx}" y2="${baseY - 4}" stroke="#111" stroke-width="0.6"/>
      <circle cx="${cx + 9}" cy="${baseY - porchHeight / 2}" r="0.8" fill="#111"/>
    </g>`;
}

function renderDormer(
  roofBaseY,
  roofMidX,
  scale,
  horizontalExtent,
  baseX,
  index,
  count,
) {
  const slot = count > 0 ? (index + 1) / (count + 1) : 0.5;
  const dormerX = baseX + horizontalExtent * scale * slot - 22;
  const dormerY = roofBaseY - 36;
  return `
    <g class="dormer">
      <path d="M ${dormerX} ${dormerY + 30} L ${dormerX + 22} ${dormerY} L ${dormerX + 44} ${dormerY + 30} Z" fill="url(#pat-roof)" stroke="#111" stroke-width="1"/>
      <rect x="${dormerX + 4}" y="${dormerY + 14}" width="36" height="22" fill="url(#pat-render)" stroke="#111" stroke-width="0.8"/>
      <rect x="${dormerX + 10}" y="${dormerY + 18}" width="24" height="14" fill="url(#grad-glass)" stroke="#222" stroke-width="0.8"/>
    </g>`;
}

function renderChimney(baseX, roofBaseY, horizontalExtent, scale) {
  const x = baseX + horizontalExtent * scale * 0.78;
  const w = Math.max(14, 0.6 * scale);
  const topY = roofBaseY - Math.max(horizontalExtent * scale * 0.12, 40) - 24;
  return `
    <g class="chimney">
      <rect x="${x}" y="${topY}" width="${w}" height="${roofBaseY - topY - 4}" fill="url(#pat-brick)" stroke="#111" stroke-width="1"/>
      <rect x="${x - 2}" y="${topY - 4}" width="${w + 4}" height="4" fill="#6c564a" stroke="#111" stroke-width="0.8"/>
    </g>`;
}

function renderBayWindow(baseX, baseY, horizontalExtent, scale, palette) {
  const bw = Math.min(2.8 * scale, horizontalExtent * scale * 0.35);
  const bh = 2.2 * scale;
  const cx = baseX + horizontalExtent * scale * 0.3;
  return `
    <g class="bay">
      <path d="M ${cx - bw / 2} ${baseY} L ${cx - bw / 2} ${baseY - bh} L ${cx - bw / 2 + 10} ${baseY - bh - 14} L ${cx + bw / 2 - 10} ${baseY - bh - 14} L ${cx + bw / 2} ${baseY - bh} L ${cx + bw / 2} ${baseY} Z" fill="${patternUrl(palette.secondary || palette.primary, palette)}" stroke="#111" stroke-width="1.2"/>
      ${renderWindowWithMuntin(cx - bw / 2 + 6, baseY - bh + 12, bw - 12, bh - 24, palette)}
    </g>`;
}

function renderTopDimension(baseX, topY, horizontalExtent, widthM) {
  const y = topY - 22;
  const x1 = baseX;
  const x2 = baseX + horizontalExtent;
  return `
    <g class="dim">
      <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#111" stroke-width="0.8"/>
      <line x1="${x1}" y1="${y - 4}" x2="${x1}" y2="${y + 4}" stroke="#111" stroke-width="0.8"/>
      <line x1="${x2}" y1="${y - 4}" x2="${x2}" y2="${y + 4}" stroke="#111" stroke-width="0.8"/>
      <text x="${(x1 + x2) / 2}" y="${y - 6}" font-size="11" font-weight="700" font-family="${ELEV_FONT}" text-anchor="middle">${widthM.toFixed(2)} m</text>
    </g>`;
}

export function renderElevationSvg(
  geometryInput = {},
  styleDNA = {},
  options = {},
) {
  const geometry = coerceToCanonicalProjectGeometry(
    geometryInput?.projectGeometry || geometryInput?.geometry || geometryInput,
  );
  const orientation = orientationToSide(options.orientation || "south");
  const metrics = metricsFromGeometry(geometry);
  const width = options.width || 1200;
  const height = options.height || 760;
  const padding = 90;
  const horizontalExtent =
    orientation === "east" || orientation === "west"
      ? metrics.depth_m
      : metrics.width_m;
  const scale = Math.min(
    (width - padding * 2) / Math.max(horizontalExtent, 1),
    (height - padding * 2) / Math.max(metrics.total_height_m + 2, 1),
  );

  const baseX = (width - horizontalExtent * scale) / 2;
  const baseY = height - padding;
  const topOfFacade = baseY - metrics.total_height_m * scale;
  const facadeOrientation = findFacadeOrientation(geometry, {
    ...options,
    orientation,
  });
  const roofType = pickRoofType(styleDNA);
  const palette = getCanonicalMaterialPalette(styleDNA);
  const features = parseElevationFeaturesFromDNA(styleDNA, orientation);

  const groundMarkup = renderGround(
    baseX,
    baseY,
    horizontalExtent * scale,
    padding,
  );
  const materialZoneMarkup = renderMaterialZones(
    facadeOrientation,
    baseX,
    baseY,
    horizontalExtent,
    scale,
    metrics.total_height_m,
    palette,
  );
  const roofMarkup = renderRoof(
    roofType,
    baseX,
    topOfFacade,
    horizontalExtent,
    scale,
    patternUrl(palette.roof, palette),
  );

  let currentLevelBase = baseY;
  const floorLines = (geometry.levels || [])
    .map((level) => {
      currentLevelBase -= Number(level.height_m || 3.2) * scale;
      return `<line x1="${baseX}" y1="${currentLevelBase}" x2="${baseX + horizontalExtent * scale}" y2="${currentLevelBase}" stroke="#555" stroke-width="0.9" stroke-dasharray="6 3"/>`;
    })
    .join("");

  const fflMarkup = renderFFLMarkers(
    baseX,
    baseY,
    horizontalExtent,
    scale,
    geometry.levels || [],
  );

  const matchingWindows = (geometry.windows || []).filter((windowElement) => {
    const wall = (geometry.walls || []).find(
      (entry) => entry.id === windowElement.wall_id,
    );
    return wall?.metadata?.side === orientation;
  });

  const windowMarkup = matchingWindows
    .map((windowElement) => {
      const wall = (geometry.walls || []).find(
        (entry) => entry.id === windowElement.wall_id,
      );
      const room = (geometry.rooms || []).find(
        (entry) => entry.id === wall?.room_ids?.[0],
      );
      if (!room || !wall) return "";
      const level = (geometry.levels || []).find(
        (entry) => entry.id === room.level_id,
      );
      const levelBaseHeight = (geometry.levels || [])
        .filter((entry) => entry.level_number < (level?.level_number ?? 0))
        .reduce((sum, entry) => sum + Number(entry.height_m || 3.2), 0);
      const projection = projectAlongOrientation(room, orientation);
      const startX = baseX + projection.start * scale;
      const widthPx = Math.max(
        22,
        (projection.end - projection.start) * scale * 0.45,
      );
      const sillY =
        baseY - (levelBaseHeight + windowElement.sill_height_m + 0.9) * scale;
      const windowHeight = Math.max(
        24,
        (windowElement.head_height_m - windowElement.sill_height_m) *
          scale *
          0.7,
      );
      return renderWindowWithMuntin(
        startX + 10,
        sillY - windowHeight,
        widthPx,
        windowHeight,
        palette,
      );
    })
    .join("");

  const shadingMarkup = (facadeOrientation?.shading_elements || [])
    .map((element, index) => {
      if (element !== "deep-reveal" && element !== "slender-overhang")
        return "";
      const y = topOfFacade + 14 + index * 10;
      return `<line x1="${baseX + 12}" y1="${y}" x2="${baseX + horizontalExtent * scale - 12}" y2="${y}" stroke="#b78c50" stroke-width="1.2" stroke-dasharray="8 4"/>`;
    })
    .join("");

  const featureMarkup = [
    features.hasPorch && orientation === "north"
      ? renderPorch(baseX, baseY, horizontalExtent, scale, orientation)
      : "",
    features.hasPorch &&
    orientation !== "north" &&
    Object.keys(styleDNA?.elevations || {}).length === 0
      ? renderPorch(baseX, baseY, horizontalExtent, scale, orientation)
      : "",
    features.hasChimney
      ? renderChimney(baseX, topOfFacade, horizontalExtent, scale)
      : "",
    features.hasBay
      ? renderBayWindow(baseX, baseY, horizontalExtent, scale, palette)
      : "",
    features.hasDormer
      ? [0, 1]
          .map((idx) =>
            renderDormer(
              topOfFacade,
              baseX + (horizontalExtent * scale) / 2,
              scale,
              horizontalExtent,
              baseX,
              idx,
              2,
            ),
          )
          .join("")
      : "",
  ].join("");

  const ratioLabel = facadeOrientation
    ? `<text x="${baseX}" y="${baseY + 42}" font-size="11" font-family="${ELEV_FONT}" fill="#333">SVR ${Number(facadeOrientation.solid_void_ratio || 0).toFixed(2)} / target ${Number(facadeOrientation.target_solid_void_ratio || facadeOrientation.solid_void_ratio || 0).toFixed(2)}</text>`
    : "";

  const topDimY =
    topOfFacade -
    (roofType === "flat"
      ? 18
      : Math.max(horizontalExtent * scale * 0.12, 40) + 6);
  const topDimMarkup = renderTopDimension(
    baseX,
    topDimY,
    horizontalExtent * scale,
    horizontalExtent,
  );

  const primaryName = palette.primary?.name || "Primary cladding";
  const primaryHex = getPrimaryHex(palette);
  const materialCaption = `PRIMARY: ${primaryName} (${primaryHex})`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>${buildPatternDefs(palette)}</defs>
  <rect width="${width}" height="${height}" fill="#fdfdfb"/>
  <text x="${padding}" y="38" font-size="22" font-family="${ELEV_FONT}" font-weight="700" fill="#111">${escapeXml(`ELEVATION — ${orientation.toUpperCase()}`)}</text>
  <text x="${padding}" y="58" font-size="11" font-family="${ELEV_FONT}" fill="#555">${escapeXml(materialCaption)}</text>
  ${groundMarkup}
  ${roofMarkup}
  ${materialZoneMarkup}
  ${floorLines}
  ${windowMarkup}
  ${featureMarkup}
  ${shadingMarkup}
  ${fflMarkup}
  ${topDimMarkup}
  ${ratioLabel}
</svg>`;

  return {
    svg,
    orientation,
    window_count: matchingWindows.length,
    renderer: "deterministic-elevation-svg-v2",
    title: `Elevation - ${orientation}`,
    features: {
      porch: features.hasPorch,
      dormer: features.hasDormer,
      chimney: features.hasChimney,
      bay: features.hasBay,
    },
    palette_source: palette.source,
  };
}

export default {
  renderElevationSvg,
};

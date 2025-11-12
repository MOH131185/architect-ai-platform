/**
 * A1 Sheet Composer (SVG-based)
 * 
 * Generates a deterministic SVG A1 sheet (7016×9933 px @ 300 DPI portrait)
 * Always renders the exact same structure with all required sections
 */

import {
  A1_MM,
  A1_PX,
  mmToPx,
  A1_LAYOUT_ZONES,
  zoneToPx,
  TYPOGRAPHY,
  LINE_WEIGHTS,
  COLORS,
  FONT_FAMILY
} from './a1LayoutTemplate';

/**
 * A1 Sheet Data Type
 */
export type A1SheetData = {
  project: {
    title: string;
    architect: string;
    drawingTitle: string;
    drawingNo: string;
    date: string;
    location: string;
    scale: string;
    version: string;
  };
  location: {
    mapImageUrl?: string;
    prevailingWind?: string;
    climateSummary: {
      avgTemp: string;
      rainfall: string;
      zone: string;
      strategy: string;
    };
    sunPathDiagramUrl?: string;
  };
  dna: {
    style: string;
    materials: Array<{
      name: string;
      description: string;
      swatchHex?: string;
    }>;
    blend?: string;
  };
  geometryViews?: {
    floorPlansSvg?: {
      ground: string;
      first: string;
      roof?: string;
    };
    elevationsSvg?: {
      north: string;
      south: string;
      east: string;
      west: string;
    };
    sectionSvg?: {
      aA: string;
    };
  };
  vectorFallback?: {
    floorPlansSvg?: {
      ground: string;
      first: string;
      roof?: string;
    };
    elevationsSvg?: {
      north: string;
      south: string;
      east: string;
      west: string;
    };
    sectionSvg?: {
      aA: string;
    };
  };
  // Image URLs for geometry views (fallback when SVG not available)
  geometryImageUrls?: {
    floorPlans?: {
      ground?: string;
      first?: string;
      roof?: string;
    };
    elevations?: {
      north?: string;
      south?: string;
      east?: string;
      west?: string;
    };
    section?: {
      aA?: string;
    };
  };
  visuals?: {
    exteriorUrl?: string;
    interiorUrl?: string;
    axonometricUrl?: string;
    conceptSketchUrl?: string;
  };
  performance?: {
    southGlazing?: string;
    crossVent?: string;
    pv?: string;
    uValues?: string;
    rainwater?: string;
  };
  summary: {
    siteArea?: string;
    builtUp?: string;
    floors?: string;
    bedrooms?: string;
    bathrooms?: string;
    height?: string;
    cost?: string;
    completion?: string;
  };
};

/**
 * Render complete A1 sheet as SVG
 */
export function renderA1SheetSVG(
  data: A1SheetData,
  opts?: { widthPx?: number; heightPx?: number }
): { svg: string; meta: { widthPx: number; heightPx: number } } {
  const widthPx = opts?.widthPx || A1_PX.width;
  const heightPx = opts?.heightPx || A1_PX.height;

  // Build SVG with all sections
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${widthPx}" height="${heightPx}"
     viewBox="0 0 ${widthPx} ${heightPx}">
  <defs>
    <style>
      text { font-family: ${FONT_FAMILY}; }
      .section-title { font-size: ${TYPOGRAPHY.title}px; font-weight: bold; fill: ${COLORS.text}; }
      .heading { font-size: ${TYPOGRAPHY.heading}px; font-weight: bold; fill: ${COLORS.text}; }
      .body { font-size: ${TYPOGRAPHY.body}px; fill: ${COLORS.text}; }
      .small { font-size: ${TYPOGRAPHY.small}px; fill: ${COLORS.textSecondary}; }
      .tiny { font-size: ${TYPOGRAPHY.tiny}px; fill: ${COLORS.textSecondary}; }
      .grid-line { stroke: ${COLORS.grid}; stroke-width: ${LINE_WEIGHTS.hairline}px; }
      .wall-cut { stroke: ${COLORS.foreground}; stroke-width: ${LINE_WEIGHTS.heavy}px; }
      .wall-project { stroke: ${COLORS.foreground}; stroke-width: ${LINE_WEIGHTS.medium}px; }
    </style>
  </defs>

  <!-- Background -->
  <rect width="${widthPx}" height="${heightPx}" fill="${COLORS.background}"/>

  <!-- 🧱 1. Site & Climate Context (Top-Left) -->
  ${renderSiteClimateSection(data)}

  <!-- 🎨 5. 3D Visuals & Concept (Top-Center-Right) -->
  ${render3DVisualsSection(data)}

  <!-- 🏗️ 2. Architectural Plans (Middle-Left Column) -->
  ${renderPlansSection(data)}

  <!-- 📐 3. Elevations (Middle-Right Column) -->
  ${renderElevationsSection(data)}

  <!-- ✂️ 4. Section (Center Bottom) -->
  ${renderSectionSection(data)}

  <!-- 🧠 6. Architectural Style & DNA (Bottom-Left) -->
  ${renderStyleDNASection(data)}

  <!-- 🌤️ 7. Environmental & Performance Data (Bottom-Center-Left) -->
  ${renderEnvironmentalSection(data)}

  <!-- 💰 8. Project Summary Table (Bottom-Center-Right) -->
  ${renderProjectSummarySection(data)}

  <!-- 🧾 9. Legend & Symbols (Bottom-Left) -->
  ${renderLegendSection(data)}

  <!-- Title Block (Bottom-Right) -->
  ${renderTitleBlockSection(data)}

  <!-- 🧩 10. AI Metadata Footer (Bottom Full-Width) -->
  ${renderAIMetadataSection(data)}

</svg>`;

  return {
    svg,
    meta: { widthPx, heightPx }
  };
}

/**
 * Render Site & Climate Context Section
 */
function renderSiteClimateSection(data: A1SheetData): string {
  const zone = zoneToPx(A1_LAYOUT_ZONES.siteClimate);
  const { location } = data;

  return `
  <g id="site-climate-section">
    <!-- Section border -->
    <rect x="${zone.x}" y="${zone.y}" width="${zone.width}" height="${zone.height}"
          fill="none" stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.medium}px"/>
    
    <!-- Title -->
    <text x="${zone.x + 10}" y="${zone.y + 30}" class="section-title">
      ${A1_LAYOUT_ZONES.siteClimate.emoji} ${A1_LAYOUT_ZONES.siteClimate.title}
    </text>
    <line x1="${zone.x + 10}" y1="${zone.y + 40}" x2="${zone.x + zone.width - 10}" y2="${zone.y + 40}"
          stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.light}px"/>

    <!-- Google Map Extract -->
    ${location.mapImageUrl
      ? `<image href="${location.mapImageUrl}" x="${zone.x + 10}" y="${zone.y + 50}"
                width="${zone.width - 20}" height="${mmToPx(80)}" preserveAspectRatio="xMidYMid meet"/>`
      : `<rect x="${zone.x + 10}" y="${zone.y + 50}" width="${zone.width - 20}" height="${mmToPx(80)}"
               fill="${COLORS.grid}" stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.light}px"/>
           <text x="${zone.x + zone.width / 2}" y="${zone.y + 50 + mmToPx(40)}" text-anchor="middle" class="small">
             Site Map (1:500)
           </text>`}
    ${location.mapImageUrl
      ? `<text x="${zone.x + 10}" y="${zone.y + 50 + mmToPx(80) + 10}" class="tiny">Google Map Extract: 1:500</text>
         <text x="${zone.x + 10}" y="${zone.y + 50 + mmToPx(80) + 18}" class="tiny" fill="${COLORS.textSecondary}">Map data © Google</text>`
      : `<text x="${zone.x + 10}" y="${zone.y + 50 + mmToPx(80) + 10}" class="tiny">Google Map Extract: 1:500</text>`}

    <!-- Sun Path Diagram -->
    ${location.sunPathDiagramUrl
      ? `<image href="${location.sunPathDiagramUrl}" x="${zone.x + 10}" y="${zone.y + 50 + mmToPx(80) + 30}"
                width="${zone.width - 20}" height="${mmToPx(50)}" preserveAspectRatio="xMidYMid meet"/>`
      : `<rect x="${zone.x + 10}" y="${zone.y + 50 + mmToPx(80) + 30}" width="${zone.width - 20}" height="${mmToPx(50)}"
               fill="none" stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.light}px"/>
           <text x="${zone.x + zone.width / 2}" y="${zone.y + 50 + mmToPx(80) + 30 + mmToPx(25)}" text-anchor="middle" class="small">
             Sun Path Diagram
           </text>`}
    <text x="${zone.x + 10}" y="${zone.y + 50 + mmToPx(80) + 30 + mmToPx(50) + 10}" class="tiny">
      Shows south-facing main façade, summer and winter sun angles
    </text>

    <!-- Prevailing Wind -->
    <text x="${zone.x + 10}" y="${zone.y + 50 + mmToPx(80) + 30 + mmToPx(50) + 25}" class="small" font-weight="bold">
      Prevailing Wind: ${location.prevailingWind || 'west–south-west'}
    </text>

    <!-- Climate Summary Table -->
    <g transform="translate(${zone.x + 10}, ${zone.y + 50 + mmToPx(80) + 30 + mmToPx(50) + 40})">
      <text x="0" y="0" class="small" font-weight="bold">Climate Summary:</text>
      ${renderTable(
        [
          ['Parameter', 'Value'],
          ['Avg Temp', location.climateSummary.avgTemp || '10 °C'],
          ['Rainfall', location.climateSummary.rainfall || '750 mm/yr'],
          ['Climate Zone', location.climateSummary.zone || 'Temperate Oceanic']
        ],
        0,
        20,
        zone.width - 20
      )}
    </g>

    <!-- Design Strategy -->
    <text x="${zone.x + 10}" y="${zone.y + zone.height - 20}" class="tiny">
      Design Strategy: ${location.climateSummary.strategy || 'Orient living area toward south for daylight; add roof overhangs for shading.'}
    </text>
  </g>`;
}

/**
 * Render 3D Visuals & Concept Section
 */
function render3DVisualsSection(data: A1SheetData): string {
  const zone = zoneToPx(A1_LAYOUT_ZONES.top3DCluster);
  const { visuals } = data;

  const cellWidth = (zone.width - 30) / 2;
  const cellHeight = (zone.height - 50) / 2;

  return `
  <g id="3d-visuals-section">
    <!-- Section border -->
    <rect x="${zone.x}" y="${zone.y}" width="${zone.width}" height="${zone.height}"
          fill="none" stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.medium}px"/>
    
    <!-- Title -->
    <text x="${zone.x + 10}" y="${zone.y + 30}" class="section-title">
      ${A1_LAYOUT_ZONES.top3DCluster.emoji} ${A1_LAYOUT_ZONES.top3DCluster.title}
    </text>
    <line x1="${zone.x + 10}" y1="${zone.y + 40}" x2="${zone.x + zone.width - 10}" y2="${zone.y + 40}"
          stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.light}px"/>

    <!-- 3D Exterior View (Top-Left) -->
    ${renderImageViewBox(
      visuals?.exteriorUrl,
      zone.x + 10,
      zone.y + 50,
      cellWidth,
      cellHeight,
      '3D Exterior View'
    )}

    <!-- 3D Interior View (Top-Right) -->
    ${renderImageViewBox(
      visuals?.interiorUrl,
      zone.x + 20 + cellWidth,
      zone.y + 50,
      cellWidth,
      cellHeight,
      '3D Interior View'
    )}

    <!-- Axonometric View (Bottom-Left) -->
    ${renderImageViewBox(
      visuals?.axonometricUrl,
      zone.x + 10,
      zone.y + 60 + cellHeight,
      cellWidth,
      cellHeight,
      'Axonometric View'
    )}

    <!-- Concept Sketch (Bottom-Right) -->
    ${renderImageViewBox(
      visuals?.conceptSketchUrl,
      zone.x + 20 + cellWidth,
      zone.y + 60 + cellHeight,
      cellWidth,
      cellHeight,
      'Design Concept Sketch'
    )}
  </g>`;
}

/**
 * Render Plans Section
 */
function renderPlansSection(data: A1SheetData): string {
  const zone = zoneToPx(A1_LAYOUT_ZONES.plansColumn);
  const plans = data.geometryViews?.floorPlansSvg || data.vectorFallback?.floorPlansSvg;
  const planImages = data.geometryImageUrls?.floorPlans;
  const planHeight = (zone.height - 50) / 3;

  return `
  <g id="plans-section">
    <!-- Section border -->
    <rect x="${zone.x}" y="${zone.y}" width="${zone.width}" height="${zone.height}"
          fill="none" stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.medium}px"/>
    
    <!-- Title -->
    <text x="${zone.x + 10}" y="${zone.y + 30}" class="section-title">
      ${A1_LAYOUT_ZONES.plansColumn.emoji} ${A1_LAYOUT_ZONES.plansColumn.title}
    </text>
    <line x1="${zone.x + 10}" y1="${zone.y + 40}" x2="${zone.x + zone.width - 10}" y2="${zone.y + 40}"
          stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.light}px"/>

    <!-- Ground Floor Plan -->
    ${renderPlanBox(
      plans?.ground || planImages?.ground,
      zone.x + 10,
      zone.y + 50,
      zone.width - 20,
      planHeight,
      'Ground Floor Plan',
      '1:100'
    )}

    <!-- First Floor Plan -->
    ${renderPlanBox(
      plans?.first || planImages?.first,
      zone.x + 10,
      zone.y + 60 + planHeight,
      zone.width - 20,
      planHeight,
      'First Floor Plan',
      '1:100'
    )}

    <!-- Roof Plan -->
    ${renderPlanBox(
      plans?.roof || planImages?.roof,
      zone.x + 10,
      zone.y + 70 + planHeight * 2,
      zone.width - 20,
      planHeight,
      'Roof Plan',
      '1:200'
    )}
  </g>`;
}

/**
 * Render Elevations Section
 */
function renderElevationsSection(data: A1SheetData): string {
  const zone = zoneToPx(A1_LAYOUT_ZONES.elevationsColumn);
  const elevations = data.geometryViews?.elevationsSvg || data.vectorFallback?.elevationsSvg;
  const elevationImages = data.geometryImageUrls?.elevations;
  const elevationHeight = (zone.height - 50) / 4;

  return `
  <g id="elevations-section">
    <!-- Section border -->
    <rect x="${zone.x}" y="${zone.y}" width="${zone.width}" height="${zone.height}"
          fill="none" stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.medium}px"/>
    
    <!-- Title -->
    <text x="${zone.x + 10}" y="${zone.y + 30}" class="section-title">
      ${A1_LAYOUT_ZONES.elevationsColumn.emoji} ${A1_LAYOUT_ZONES.elevationsColumn.title}
    </text>
    <line x1="${zone.x + 10}" y1="${zone.y + 40}" x2="${zone.x + zone.width - 10}" y2="${zone.y + 40}"
          stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.light}px"/>

    <!-- North Elevation -->
    ${renderElevationBox(
      elevations?.north || elevationImages?.north,
      zone.x + 10,
      zone.y + 50,
      zone.width - 20,
      elevationHeight,
      'Front Elevation (South)',
      '1:100'
    )}

    <!-- South Elevation -->
    ${renderElevationBox(
      elevations?.south || elevationImages?.south,
      zone.x + 10,
      zone.y + 60 + elevationHeight,
      zone.width - 20,
      elevationHeight,
      'Rear Elevation (North)',
      '1:100'
    )}

    <!-- East Elevation -->
    ${renderElevationBox(
      elevations?.east || elevationImages?.east,
      zone.x + 10,
      zone.y + 70 + elevationHeight * 2,
      zone.width - 20,
      elevationHeight,
      'Side Elevation (East)',
      '1:100'
    )}

    <!-- West Elevation -->
    ${renderElevationBox(
      elevations?.west || elevationImages?.west,
      zone.x + 10,
      zone.y + 80 + elevationHeight * 3,
      zone.width - 20,
      elevationHeight,
      'Side Elevation (West)',
      '1:100'
    )}
  </g>`;
}

/**
 * Render Section Section
 */
function renderSectionSection(data: A1SheetData): string {
  const zone = zoneToPx(A1_LAYOUT_ZONES.sectionBand);
  const section = data.geometryViews?.sectionSvg || data.vectorFallback?.sectionSvg;
  const sectionImage = data.geometryImageUrls?.section;

  return `
  <g id="section-section">
    <!-- Section border -->
    <rect x="${zone.x}" y="${zone.y}" width="${zone.width}" height="${zone.height}"
          fill="none" stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.medium}px"/>
    
    <!-- Title -->
    <text x="${zone.x + 10}" y="${zone.y + 30}" class="section-title">
      ${A1_LAYOUT_ZONES.sectionBand.emoji} ${A1_LAYOUT_ZONES.sectionBand.title}
    </text>
    <line x1="${zone.x + 10}" y1="${zone.y + 40}" x2="${zone.x + zone.width - 10}" y2="${zone.y + 40}"
          stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.light}px"/>

    <!-- Section A-A -->
    ${renderSectionBox(
      section?.aA || sectionImage?.aA,
      zone.x + 10,
      zone.y + 50,
      zone.width - 20,
      zone.height - 60,
      'Section A-A',
      '1:100'
    )}
  </g>`;
}

/**
 * Render Style & DNA Section
 */
function renderStyleDNASection(data: A1SheetData): string {
  const zone = zoneToPx(A1_LAYOUT_ZONES.styleAndDNA);
  const { dna } = data;

  return `
  <g id="style-dna-section">
    <!-- Section border -->
    <rect x="${zone.x}" y="${zone.y}" width="${zone.width}" height="${zone.height}"
          fill="none" stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.medium}px"/>
    
    <!-- Title -->
    <text x="${zone.x + 10}" y="${zone.y + 30}" class="section-title">
      ${A1_LAYOUT_ZONES.styleAndDNA.emoji} ${A1_LAYOUT_ZONES.styleAndDNA.title}
    </text>
    <line x1="${zone.x + 10}" y1="${zone.y + 40}" x2="${zone.x + zone.width - 10}" y2="${zone.y + 40}"
          stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.light}px"/>

    <!-- Style -->
    <text x="${zone.x + 10}" y="${zone.y + 60}" class="small" font-weight="bold">
      Style: ${dna.style || 'Modern Contemporary with Local Brick Aesthetic'}
    </text>

    <!-- Material Palette -->
    <text x="${zone.x + 10}" y="${zone.y + 85}" class="small" font-weight="bold">
      Material Palette:
    </text>
    ${dna.materials?.slice(0, 4).map((mat, i) => `
      <g transform="translate(${zone.x + 10}, ${zone.y + 105 + i * 20})">
        <rect x="0" y="0" width="15" height="15" fill="${mat.swatchHex || '#888888'}"
              stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.light}px"/>
        <text x="20" y="12" class="tiny">${mat.name}: ${mat.description || ''}</text>
      </g>
    `).join('') || '<text x="' + (zone.x + 10) + '" y="' + (zone.y + 105) + '" class="tiny">No materials specified</text>'}

    <!-- Portfolio Blend -->
    ${dna.blend
      ? `<text x="${zone.x + 10}" y="${zone.y + zone.height - 20}" class="tiny">
           Portfolio Blend: ${dna.blend}
         </text>`
      : ''}
  </g>`;
}

/**
 * Render Environmental Section
 */
function renderEnvironmentalSection(data: A1SheetData): string {
  const zone = zoneToPx(A1_LAYOUT_ZONES.environmental);
  const { performance } = data;

  return `
  <g id="environmental-section">
    <!-- Section border -->
    <rect x="${zone.x}" y="${zone.y}" width="${zone.width}" height="${zone.height}"
          fill="none" stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.medium}px"/>
    
    <!-- Title -->
    <text x="${zone.x + 10}" y="${zone.y + 30}" class="section-title">
      ${A1_LAYOUT_ZONES.environmental.emoji} ${A1_LAYOUT_ZONES.environmental.title}
    </text>
    <line x1="${zone.x + 10}" y1="${zone.y + 40}" x2="${zone.x + zone.width - 10}" y2="${zone.y + 40}"
          stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.light}px"/>

    <!-- Performance Data -->
    ${renderTable(
      [
        ['Parameter', 'Value'],
        ['South glazing', performance?.southGlazing || '28%'],
        ['Cross-ventilation', performance?.crossVent || 'living ↔ courtyard'],
        ['PV output', performance?.pv || '6 kW (~25%)'],
        ['U-values', performance?.uValues || 'wall 0.25 | roof 0.15 | window 1.2 W/m²K'],
        ['Rainwater tank', performance?.rainwater || '3 m³']
      ],
      zone.x + 10,
      zone.y + 50,
      zone.width - 20
    )}
  </g>`;
}

/**
 * Render Project Summary Section
 */
function renderProjectSummarySection(data: A1SheetData): string {
  const zone = zoneToPx(A1_LAYOUT_ZONES.projectSummary);
  const { summary } = data;

  return `
  <g id="project-summary-section">
    <!-- Section border -->
    <rect x="${zone.x}" y="${zone.y}" width="${zone.width}" height="${zone.height}"
          fill="none" stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.medium}px"/>
    
    <!-- Title -->
    <text x="${zone.x + 10}" y="${zone.y + 30}" class="section-title">
      ${A1_LAYOUT_ZONES.projectSummary.emoji} ${A1_LAYOUT_ZONES.projectSummary.title}
    </text>
    <line x1="${zone.x + 10}" y1="${zone.y + 40}" x2="${zone.x + zone.width - 10}" y2="${zone.y + 40}"
          stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.light}px"/>

    <!-- Summary Table -->
    ${renderTable(
      [
        ['Parameter', 'Value'],
        ['Site Area', summary.siteArea || '450 m²'],
        ['Built-Up Area', summary.builtUp || '230 m²'],
        ['Floors', summary.floors || 'G + 1'],
        ['Bedrooms', summary.bedrooms || '3'],
        ['Bathrooms', summary.bathrooms || '3'],
        ['Building Height', summary.height || '6.5 m'],
        ['Est. Cost', summary.cost || '£320,000'],
        ['Completion', summary.completion || 'Q3 2026']
      ],
      zone.x + 10,
      zone.y + 50,
      zone.width - 20
    )}
  </g>`;
}

/**
 * Render Legend Section
 */
function renderLegendSection(data: A1SheetData): string {
  const zone = zoneToPx(A1_LAYOUT_ZONES.legend);

  return `
  <g id="legend-section">
    <!-- Section border -->
    <rect x="${zone.x}" y="${zone.y}" width="${zone.width}" height="${zone.height}"
          fill="none" stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.medium}px"/>
    
    <!-- Title -->
    <text x="${zone.x + 10}" y="${zone.y + 30}" class="section-title">
      ${A1_LAYOUT_ZONES.legend.emoji} ${A1_LAYOUT_ZONES.legend.title}
    </text>
    <line x1="${zone.x + 10}" y1="${zone.y + 40}" x2="${zone.x + zone.width - 10}" y2="${zone.y + 40}"
          stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.light}px"/>

    <!-- Legend Items -->
    <g transform="translate(${zone.x + 10}, ${zone.y + 50})">
      <text x="0" y="0" class="tiny">Walls — solid hatch</text>
      <text x="0" y="15" class="tiny">Doors — swing arc</text>
      <text x="0" y="30" class="tiny">Windows — thin line with glass symbol</text>
      <text x="0" y="45" class="tiny">Section arrows — A-A, B-B</text>
      <text x="0" y="60" class="tiny">North arrow and 1:100 scale bar</text>
    </g>
  </g>`;
}

/**
 * Render Title Block Section
 */
function renderTitleBlockSection(data: A1SheetData): string {
  const zone = zoneToPx(A1_LAYOUT_ZONES.titleBlock);
  const { project } = data;

  return `
  <g id="title-block-section">
    <!-- Section border -->
    <rect x="${zone.x}" y="${zone.y}" width="${zone.width}" height="${zone.height}"
          fill="none" stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.medium}px"/>
    
    <!-- Title Block Content -->
    <g transform="translate(${zone.x + 10}, ${zone.y + 10})">
      <text x="0" y="0" class="heading">${project.title || 'Architectural Project'}</text>
      <text x="0" y="25" class="small">Architect: ${project.architect || 'ArchiAI Solution Ltd — Mohammed Reggab'}</text>
      <text x="0" y="40" class="small">Drawing Title: ${project.drawingTitle || 'Full Architectural Presentation – A1 Sheet'}</text>
      <text x="0" y="55" class="tiny">Scale: ${project.scale || '1:100 (Plans, Elevations, Section) / NTS (3D Views)'}</text>
      <text x="0" y="70" class="tiny">Date: ${project.date || new Date().toLocaleDateString()} | Drawing No.: ${project.drawingNo || 'A1.001'}</text>
      <text x="0" y="85" class="tiny">Location: ${project.location || 'Site Location'}</text>
      <text x="0" y="100" class="tiny">Generated by: ${project.version || 'ArchiAI – v1.4 Climate Reasoning Model'}</text>
    </g>
  </g>`;
}

/**
 * Render AI Metadata Section
 */
function renderAIMetadataSection(data: A1SheetData): string {
  const zone = zoneToPx(A1_LAYOUT_ZONES.aiFooter);
  const { project } = data;

  return `
  <g id="ai-metadata-section">
    <!-- Section border -->
    <rect x="${zone.x}" y="${zone.y}" width="${zone.width}" height="${zone.height}"
          fill="${COLORS.accent}" opacity="0.9"/>
    
    <!-- Footer Text -->
    <g transform="translate(${zone.x + 10}, ${zone.y + 15})">
      <text x="0" y="0" class="small" fill="white" font-weight="bold">
        ${A1_LAYOUT_ZONES.aiFooter.emoji} ${A1_LAYOUT_ZONES.aiFooter.title}
      </text>
      <text x="0" y="20" class="tiny" fill="white">
        Generated by ArchiAI Climate-Aware Engine
      </text>
      <text x="0" y="35" class="tiny" fill="white">
        Prompt Summary: "Design a ${project.title || 'residential'} building in ${project.location || 'location'}. 
        Generate all plans, elevations, sections, 3D visuals, and project data in single A1 sheet format (7016×9933 px, 300 DPI)."
      </text>
    </g>
  </g>`;
}

/**
 * Helper: Render image view box
 */
function renderImageViewBox(
  imageUrl: string | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string
): string {
  return `
  <g transform="translate(${x}, ${y})">
    <rect width="${width}" height="${height}" fill="white" stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.light}px"/>
    ${imageUrl
      ? `<image href="${imageUrl}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`
      : `<rect width="${width}" height="${height}" fill="${COLORS.grid}" opacity="0.3"/>
         <text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="small" fill="${COLORS.textSecondary}">
           ${label}
         </text>`}
    <text x="5" y="${height - 5}" class="tiny" fill="${COLORS.text}">${label}</text>
  </g>`;
}

/**
 * Helper: Render plan box
 */
function renderPlanBox(
  svgContentOrUrl: string | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  scale: string
): string {
  // Check if it's an SVG (contains <svg> tag) or an image URL
  const isSvg = svgContentOrUrl && svgContentOrUrl.includes('<svg');
  const isUrl = svgContentOrUrl && (svgContentOrUrl.startsWith('http') || svgContentOrUrl.startsWith('data:'));
  
  const svgBody = isSvg && svgContentOrUrl
    ? svgContentOrUrl.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '')
    : null;

  return `
  <g transform="translate(${x}, ${y})">
    <rect width="${width}" height="${height}" fill="white" stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.medium}px"/>
    <text x="10" y="25" class="heading">${label}</text>
    <text x="${width - 60}" y="25" class="small" text-anchor="end">${scale}</text>
    ${svgBody
      ? `<g transform="translate(10, 40)">
           <svg width="${width - 20}" height="${height - 50}" viewBox="0 0 ${width - 20} ${height - 50}" preserveAspectRatio="xMidYMid meet">
             ${svgBody}
           </svg>
         </g>`
      : isUrl && svgContentOrUrl
      ? `<image href="${svgContentOrUrl}" x="10" y="40" width="${width - 20}" height="${height - 50}" preserveAspectRatio="xMidYMid meet"/>`
      : `<rect x="10" y="40" width="${width - 20}" height="${height - 50}" fill="${COLORS.grid}" opacity="0.3"/>
         <text x="${width / 2}" y="${y + height / 2}" text-anchor="middle" class="small" fill="${COLORS.textSecondary}">
           ${label} (Generating...)
         </text>`}
    <!-- North Arrow -->
    <g transform="translate(${width - 50}, 50)">
      <line x1="0" y1="0" x2="0" y2="20" stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.medium}px"/>
      <text x="5" y="25" class="tiny" fill="${COLORS.text}">N</text>
    </g>
    <!-- Scale Bar -->
    <g transform="translate(10, ${height - 30})">
      <line x1="0" y1="0" x2="50" y2="0" stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.medium}px"/>
      <text x="25" y="-5" text-anchor="middle" class="tiny" fill="${COLORS.textSecondary}">${scale}</text>
    </g>
  </g>`;
}

/**
 * Helper: Render elevation box
 */
function renderElevationBox(
  svgContentOrUrl: string | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  scale: string
): string {
  // Check if it's an SVG (contains <svg> tag) or an image URL
  const isSvg = svgContentOrUrl && svgContentOrUrl.includes('<svg');
  const isUrl = svgContentOrUrl && (svgContentOrUrl.startsWith('http') || svgContentOrUrl.startsWith('data:'));
  
  const svgBody = isSvg && svgContentOrUrl
    ? svgContentOrUrl.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '')
    : null;

  return `
  <g transform="translate(${x}, ${y})">
    <rect width="${width}" height="${height}" fill="white" stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.medium}px"/>
    <text x="10" y="25" class="heading">${label}</text>
    <text x="${width - 60}" y="25" class="small" text-anchor="end">${scale}</text>
    ${svgBody
      ? `<g transform="translate(10, 40)">
           <svg width="${width - 20}" height="${height - 50}" viewBox="0 0 ${width - 20} ${height - 50}" preserveAspectRatio="xMidYMid meet">
             ${svgBody}
           </svg>
         </g>`
      : isUrl && svgContentOrUrl
      ? `<image href="${svgContentOrUrl}" x="10" y="40" width="${width - 20}" height="${height - 50}" preserveAspectRatio="xMidYMid meet"/>`
      : `<rect x="10" y="40" width="${width - 20}" height="${height - 50}" fill="${COLORS.grid}" opacity="0.3"/>
         <text x="${width / 2}" y="${y + height / 2}" text-anchor="middle" class="small" fill="${COLORS.textSecondary}">
           ${label} (Generating...)
         </text>`}
    <!-- Level annotations -->
    <text x="10" y="${height - 10}" class="tiny" fill="${COLORS.textSecondary}">
      Annotations indicate material transitions, roof slope, and heights (FFL 0.00 / 3.10 / 6.20 m)
    </text>
  </g>`;
}

/**
 * Helper: Render section box
 */
function renderSectionBox(
  svgContentOrUrl: string | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  scale: string
): string {
  // Check if it's an SVG (contains <svg> tag) or an image URL
  const isSvg = svgContentOrUrl && svgContentOrUrl.includes('<svg');
  const isUrl = svgContentOrUrl && (svgContentOrUrl.startsWith('http') || svgContentOrUrl.startsWith('data:'));
  
  const svgBody = isSvg && svgContentOrUrl
    ? svgContentOrUrl.replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '')
    : null;

  return `
  <g transform="translate(${x}, ${y})">
    <rect width="${width}" height="${height}" fill="white" stroke="${COLORS.foreground}" stroke-width="${LINE_WEIGHTS.medium}px"/>
    <text x="10" y="25" class="heading">${label}</text>
    <text x="${width - 60}" y="25" class="small" text-anchor="end">${scale}</text>
    ${svgBody
      ? `<g transform="translate(10, 40)">
           <svg width="${width - 20}" height="${height - 50}" viewBox="0 0 ${width - 20} ${height - 50}" preserveAspectRatio="xMidYMid meet">
             ${svgBody}
           </svg>
         </g>`
      : isUrl && svgContentOrUrl
      ? `<image href="${svgContentOrUrl}" x="10" y="40" width="${width - 20}" height="${height - 50}" preserveAspectRatio="xMidYMid meet"/>`
      : `<rect x="10" y="40" width="${width - 20}" height="${height - 50}" fill="${COLORS.grid}" opacity="0.3"/>
         <text x="${width / 2}" y="${y + height / 2}" text-anchor="middle" class="small" fill="${COLORS.textSecondary}">
           ${label} (Generating...)
         </text>`}
    <!-- Section annotation -->
    <text x="10" y="${height - 10}" class="tiny" fill="${COLORS.textSecondary}">
      Cut through stair and living space. Shows levels, floor build-ups, and ceiling heights.
    </text>
  </g>`;
}

/**
 * Helper: Render table
 */
function renderTable(
  rows: string[][],
  x: number,
  y: number,
  width: number
): string {
  const rowHeight = 15;
  const cellPadding = 5;

  let svg = `<g transform="translate(${x}, ${y})">`;

  rows.forEach((row, rowIndex) => {
    const isHeader = rowIndex === 0;
    const cellWidth = width / row.length;

    row.forEach((cell, colIndex) => {
      const cellX = colIndex * cellWidth;
      const cellY = rowIndex * rowHeight;

      svg += `
        <rect x="${cellX}" y="${cellY}" width="${cellWidth}" height="${rowHeight}"
              fill="${isHeader ? COLORS.accent : 'none'}" opacity="${isHeader ? '0.1' : '1'}"
              stroke="${COLORS.grid}" stroke-width="${LINE_WEIGHTS.light}px"/>
        <text x="${cellX + cellPadding}" y="${cellY + rowHeight - 3}" 
              class="${isHeader ? 'small' : 'tiny'}" font-weight="${isHeader ? 'bold' : 'normal'}"
              fill="${isHeader ? COLORS.text : COLORS.textSecondary}">
          ${cell}
        </text>`;
    });
  });

  svg += `</g>`;
  return svg;
}


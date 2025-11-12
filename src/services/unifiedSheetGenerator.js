/**
 * Unified Sheet Generator
 *
 * Generates a single A1 sheet with ALL 13 architectural views embedded
 * - 2 Floor Plans (Ground, Upper)
 * - 4 Elevations (North, South, East, West)
 * - 2 Sections (Longitudinal, Cross)
 * - 5 3D Views (Axonometric, Perspective, Interior, Exterior, Site)
 * - Material palette and metrics
 * - Professional title block
 *
 * All images are embedded directly in the SVG for a true single-file output
 */

import { isFeatureEnabled } from '../config/featureFlags';

// A1 Portrait dimensions (better for complete architectural sheet)
const SHEET_WIDTH = 594; // mm
const SHEET_HEIGHT = 841; // mm
const MARGIN = 10; // mm

/**
 * Generate enhanced Situation Plan (Site Plan) with property lines, streets, access points
 */
async function generateSituationPlan({
  sitePolygon,
  location,
  buildingFootprint,
  siteAnalysis,
  siteMetrics,
  x,
  y,
  width,
  height
}) {
  console.log('📍 Generating Situation Plan...');

  const streetContext = siteAnalysis?.streetContext || {};
  const primaryRoad = streetContext.primaryRoad || 'Local Street';
  const adjacentRoads = streetContext.adjacentRoads || 1;
  const buildingDims = buildingFootprint?.dimensions || { length: 15, width: 10 };
  
  const scale = '1:500';
  const margin = 15;
  const drawWidth = width - margin * 2;
  const drawHeight = height - margin * 2;
  
  const buildingX = margin + drawWidth * 0.5 - (drawWidth * 0.3) / 2;
  const buildingY = margin + drawHeight * 0.5 - (drawHeight * 0.3) / 2;
  const buildingWidth = drawWidth * 0.3;
  const buildingHeight = drawHeight * 0.3;
  
  return `<g transform="translate(${x}, ${y})">
    <rect width="${width}" height="${height}" fill="#ffffff" stroke="#333" stroke-width="1"/>
    <text x="${width / 2}" y="12" text-anchor="middle" class="section-title" font-weight="bold">SITUATION PLAN</text>
    <line x1="${margin}" y1="18" x2="${width - margin}" y2="18" stroke="#000" stroke-width="0.5"/>
    ${sitePolygon && sitePolygon.length > 0 ? `
    <polygon points="${sitePolygon.map((pt, idx) => {
      const normalizedX = margin + (pt.lng || 0) * drawWidth / 0.01;
      const normalizedY = margin + (pt.lat || 0) * drawHeight / 0.01;
      return `${normalizedX},${normalizedY}`;
    }).join(' ')}"
             fill="none" stroke="#ff0000" stroke-width="2" stroke-dasharray="5,2"/>
    ` : `
    <rect x="${margin + drawWidth * 0.2}" y="${margin + drawHeight * 0.2}"
          width="${drawWidth * 0.6}" height="${drawHeight * 0.6}"
          fill="none" stroke="#ff0000" stroke-width="2" stroke-dasharray="5,2"/>
    `}
    <line x1="${margin}" y1="${margin + drawHeight * 0.8}" 
          x2="${width - margin}" y2="${margin + drawHeight * 0.8}"
          stroke="#333" stroke-width="3" opacity="0.6"/>
    <text x="${width / 2}" y="${margin + drawHeight * 0.8 - 5}" text-anchor="middle" class="small" fill="#333" font-weight="bold">${primaryRoad}</text>
    <rect x="${buildingX}" y="${buildingY}" width="${buildingWidth}" height="${buildingHeight}"
          fill="#ff6b6b" stroke="#c92a2a" stroke-width="1.5" opacity="0.8"/>
    <text x="${buildingX + buildingWidth / 2}" y="${buildingY - 5}" text-anchor="middle" class="small" fill="#c92a2a" font-weight="bold">PROPOSED BUILDING</text>
    <circle cx="${buildingX + buildingWidth / 2}" cy="${buildingY + buildingHeight}" r="4" fill="#28a745" stroke="#155724" stroke-width="1"/>
    <line x1="${buildingX + buildingWidth / 2}" y1="${buildingY + buildingHeight + 4}"
          x2="${buildingX + buildingWidth / 2}" y2="${margin + drawHeight * 0.8}"
          stroke="#28a745" stroke-width="1.5" stroke-dasharray="3,3"/>
    <g transform="translate(${width - margin - 30}, ${margin + 30})">
      <line x1="0" y1="0" x2="0" y2="20" stroke="#000" stroke-width="2"/>
      <text x="5" y="25" class="small" font-weight="bold">N</text>
    </g>
    <g transform="translate(${margin + 10}, ${height - margin - 20})">
      <line x1="0" y1="0" x2="50" y2="0" stroke="#000" stroke-width="2"/>
      <text x="25" y="-8" text-anchor="middle" class="tiny" fill="#666">${scale}</text>
    </g>
    <text x="${margin + 5}" y="${height - margin - 5}" class="tiny" fill="#666">${location?.address || 'Location TBD'}</text>
  </g>`;
}

/**
 * Generate site map section with SVG fallback
 */
async function generateSiteMapSection(siteMapURL, location, sitePolygon, x, y, width, height, siteAnalysis = null, buildingFootprint = null) {
  // Try enhanced Situation Plan first if site analysis is available
  if (siteAnalysis || sitePolygon) {
    try {
      return await generateSituationPlan({
        sitePolygon,
        location,
        buildingFootprint,
        siteAnalysis,
        siteMetrics: null,
        x,
        y,
        width,
        height
      });
    } catch (err) {
      console.warn('⚠️ Situation Plan generation failed, falling back:', err);
    }
  }
  // If we have Google Maps URL, use it
  if (siteMapURL && location) {
    return `<g transform="translate(${x}, ${y})">
      <rect width="${width}" height="${height}" fill="white" stroke="#333" stroke-width="0.5"/>
      <image href="${siteMapURL}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>
      <text x="2" y="10" class="tiny" font-weight="bold">LOCATION PLAN</text>
      <text x="${width / 2}" y="${height - 5}" text-anchor="middle" class="tiny">SCALE 1:1250</text>
    </g>`;
  }

  // Otherwise, generate SVG site plan fallback
  try {
    const siteMapRenderer = await import('./siteMapRenderer.js');
    const svgSitePlan = siteMapRenderer.generateSVGSitePlan({
      sitePolygon: sitePolygon,
      coordinates: location?.coordinates,
      buildingFootprint: null, // Will use default centered footprint
      width: width,
      height: height
    });

    // Embed the SVG site plan directly
    return `<g transform="translate(${x}, ${y})">
      ${svgSitePlan}
    </g>`;
  } catch (err) {
    console.warn('⚠️ SVG site plan generation failed, using basic placeholder:', err);

    // Final fallback: simple placeholder with coordinates
    return `<g transform="translate(${x}, ${y})">
      <rect width="${width}" height="${height}" fill="#f5f5f5" stroke="#333" stroke-width="0.5"/>
      <text x="${width / 2}" y="${height / 2 - 10}" text-anchor="middle" class="small" fill="#333" font-weight="bold">SITE LOCATION PLAN</text>
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="tiny" fill="#666">${location?.address || 'Location TBD'}</text>
      <text x="${width / 2}" y="${height / 2 + 15}" text-anchor="middle" class="tiny" fill="#666">SCALE 1:1250</text>
      ${location?.coordinates ? `<text x="${width / 2}" y="${height / 2 + 25}" text-anchor="middle" class="tiny" fill="#999">${location.coordinates.lat.toFixed(4)}°N, ${Math.abs(location.coordinates.lng).toFixed(4)}°${location.coordinates.lng < 0 ? 'W' : 'E'}</text>` : ''}
    </g>`;
  }
}

/**
 * Embed SVG technical drawing with intelligent fallbacks
 */
function embedSVG(svgContent, x, y, width, height, label, scale, dna = null) {
  if (!svgContent) {
    // Generate better fallback based on drawing type
    if (label && label.includes('SECTION')) {
      // Generate schematic section diagram
      return generateFallbackSection(x, y, width, height, label, scale, dna);
    } else {
      // Generic placeholder for other drawings
      return `<g transform="translate(${x}, ${y})">
        <rect width="${width}" height="${height}" fill="#f5f5f5" stroke="#333" stroke-width="0.5"/>
        <text x="${width / 2}" y="${height / 2 - 10}" text-anchor="middle" class="small" fill="#333" font-weight="bold">${label || 'No Drawing'}</text>
        <text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="tiny" fill="#666">Generating...</text>
        ${scale ? `<text x="${width / 2}" y="${height / 2 + 15}" text-anchor="middle" class="tiny" fill="#666">${scale}</text>` : ''}
      </g>`;
    }
  }

  // Extract SVG content (remove XML declaration if present)
  let svgBody = svgContent;
  if (svgBody.includes('<svg')) {
    // Extract content between <svg> tags
    const svgMatch = svgBody.match(/<svg[^>]*>([\s\S]*?)<\/svg>/);
    if (svgMatch) {
      svgBody = svgMatch[1];
    }
  }

  // Embed SVG directly with transform
  return `<g transform="translate(${x}, ${y})">
    <rect width="${width}" height="${height}" fill="white" stroke="#333" stroke-width="0.5"/>
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
      ${svgBody}
    </svg>
    <text x="2" y="10" class="tiny" font-weight="bold">${label}</text>
    ${scale ? `<text x="${width - 50}" y="${height - 5}" class="tiny" text-anchor="end">${scale}</text>` : ''}
  </g>`;
}

/**
 * Generate fallback section diagram
 */
function generateFallbackSection(x, y, width, height, label, scale, dna) {
  const dims = dna?.dimensions || {};
  const floorCount = dims.floorHeights?.length || dims.floor_count || 2;
  const floorHeight = dims.height ? (dims.height / floorCount) : 3;
  const totalHeight = dims.height || (floorHeight * floorCount);

  // Calculate proportions
  const margin = 10;
  const drawHeight = height - margin * 2;
  const pixelsPerMeter = drawHeight / totalHeight;
  const buildingWidth = width - margin * 2;

  let sectionSVG = `<g transform="translate(${x}, ${y})">
    <rect width="${width}" height="${height}" fill="#ffffff" stroke="#333" stroke-width="0.5"/>

    <!-- Ground line -->
    <line x1="${margin}" y1="${height - margin}" x2="${width - margin}" y2="${height - margin}"
          stroke="#654321" stroke-width="2"/>

    <!-- Foundation -->
    <rect x="${margin + buildingWidth * 0.1}" y="${height - margin}"
          width="${buildingWidth * 0.8}" height="5"
          fill="#999" stroke="#666" stroke-width="0.5"/>
  `;

  // Draw floors from bottom to top
  for (let floor = 0; floor < floorCount; floor++) {
    const floorBottom = height - margin - (floor * floorHeight * pixelsPerMeter);
    const floorTop = floorBottom - (floorHeight * pixelsPerMeter);

    // Floor slab
    sectionSVG += `
      <rect x="${margin + buildingWidth * 0.1}" y="${floorTop}"
            width="${buildingWidth * 0.8}" height="3"
            fill="#333" stroke="#000" stroke-width="0.5"/>
    `;

    // External walls (shown as thick lines in section)
    sectionSVG += `
      <rect x="${margin + buildingWidth * 0.1}" y="${floorTop}"
            width="4" height="${floorHeight * pixelsPerMeter}"
            fill="#888" stroke="#000" stroke-width="0.5"/>
      <rect x="${margin + buildingWidth * 0.9 - 4}" y="${floorTop}"
            width="4" height="${floorHeight * pixelsPerMeter}"
            fill="#888" stroke="#000" stroke-width="0.5"/>
    `;

    // Floor level annotation
    const floorLabel = floor === 0 ? '0.00' : `+${(floor * floorHeight).toFixed(2)}m`;
    sectionSVG += `
      <text x="${margin}" y="${floorTop + 10}" class="tiny" fill="#000">${floorLabel}</text>
    `;

    // Interior space indication
    sectionSVG += `
      <rect x="${margin + buildingWidth * 0.1 + 8}" y="${floorTop + 5}"
            width="${buildingWidth * 0.8 - 16}" height="${floorHeight * pixelsPerMeter - 10}"
            fill="none" stroke="#ccc" stroke-width="0.5" stroke-dasharray="2,2"/>
    `;
  }

  // Roof
  const roofBottom = height - margin - (floorCount * floorHeight * pixelsPerMeter);
  const roofType = dna?.roof?.type || 'gable';
  const roofPitch = dna?.roof?.pitch || 35;

  if (roofType === 'flat') {
    sectionSVG += `
      <rect x="${margin + buildingWidth * 0.1}" y="${roofBottom - 3}"
            width="${buildingWidth * 0.8}" height="3"
            fill="#654321" stroke="#000" stroke-width="0.5"/>
    `;
  } else {
    // Gable roof (simplified)
    const roofPeakHeight = (buildingWidth * 0.4) * Math.tan((roofPitch * Math.PI) / 180);
    sectionSVG += `
      <polygon points="${margin + buildingWidth * 0.1},${roofBottom}
                       ${margin + buildingWidth * 0.5},${roofBottom - roofPeakHeight}
                       ${margin + buildingWidth * 0.9},${roofBottom}"
               fill="#654321" stroke="#000" stroke-width="1"/>
    `;
  }

  // Ridge level annotation
  const ridgeLevel = `+${totalHeight.toFixed(2)}m`;
  sectionSVG += `
    <text x="${margin}" y="${roofBottom - 5}" class="tiny" fill="#000">${ridgeLevel}</text>
  `;

  // Label and scale
  sectionSVG += `
    <text x="2" y="10" class="tiny" font-weight="bold">${label}</text>
    ${scale ? `<text x="${width - 50}" y="${height - 5}" class="tiny" text-anchor="end">${scale}</text>` : ''}
    <text x="${width / 2}" y="${height - 5}" text-anchor="middle" class="tiny" fill="#999">(Schematic)</text>
  </g>`;

  return sectionSVG;
}

/**
 * Generate project data section
 */
function generateProjectDataSection(dna, location, context, x, y, width, height) {
  const dims = dna?.dimensions || {};
  const siteArea = location?.siteAnalysis?.area || '450m²';
  const builtUpArea = (dims.length || 0) * (dims.width || 0);
  const costEstimate = `£${(builtUpArea * 1400).toLocaleString()}`;

  return `<g transform="translate(${x}, ${y})">
    <rect width="${width}" height="${height}" fill="#f9f9f9" stroke="#ccc" stroke-width="0.5"/>
    <text x="5" y="15" class="section-title">PROJECT DATA</text>
    <line x1="5" y1="20" x2="${width - 5}" y2="20" stroke="#000" stroke-width="0.5"/>
    
    <text x="5" y="35" class="small">Gross Internal Area: ${builtUpArea.toFixed(0)}m²</text>
    <text x="5" y="50" class="small">Site Area: ${siteArea}</text>
    <text x="5" y="65" class="small">Building Height: ${dims.height || 0}m</text>
    <text x="5" y="80" class="small">Floors: ${dims.floorHeights?.length || 2}</text>
    <text x="5" y="95" class="small">Est. Cost: ${costEstimate}</text>
    <text x="5" y="110" class="small">Climate Zone: ${location?.climate?.type || 'Temperate'}</text>
    <text x="5" y="125" class="small">Orientation: ${location?.sunPath?.optimalOrientation || 'South-facing'}</text>
    <text x="5" y="140" class="small">Energy: EPC Band B target</text>
    
    <text x="5" y="165" class="section-title">UK BUILDING REGULATIONS</text>
    <text x="5" y="180" class="tiny">Part A (Structure): Eurocode standards</text>
    <text x="5" y="190" class="tiny">Part B (Fire): 30min fire resistance</text>
    <text x="5" y="200" class="tiny">Part L (Conservation): U-values compliant</text>
    <text x="5" y="210" class="tiny">Part M (Access): Level threshold, 900mm doors</text>
  </g>`;
}

/**
 * Generate consistency score badge
 */
function generateConsistencyBadge(score, x, y) {
  const scoreColor = score >= 98 ? '#4caf50' : score >= 95 ? '#ff9800' : '#f44336';
  
  return `<g transform="translate(${x}, ${y})">
    <rect width="50" height="25" rx="3" fill="${scoreColor}" opacity="0.9"/>
    <text x="25" y="17" text-anchor="middle" class="small" fill="#fff" font-weight="bold">${score}%</text>
    <text x="25" y="35" text-anchor="middle" class="tiny" fill="#666">Consistency</text>
  </g>`;
}

/**
 * Technical details panel (textual callouts)
 */
function generateTechnicalDetailsSection(details, x, y, width, height) {
  if (!Array.isArray(details) || details.length === 0) {
    return `<g transform="translate(${x}, ${y})">
      <rect width="${width}" height="${height}" fill="#f5f5f5" stroke="#ccc" stroke-width="0.5"/>
      <text x="5" y="12" class="section-title">TECHNICAL DETAILS</text>
      <text x="5" y="28" class="tiny" fill="#666">(AI will populate critical details)</text>
    </g>`;
  }

  // Render two details as bullet lists
  const dA = details[0] || {};
  const dB = details[1] || {};
  const a = dA.callout || {};
  const b = dB.callout || {};

  const renderDetail = (label, callout, offsetY) => {
    const title = callout.title || label;
    const scale = callout.scale || '1:10';
    const layers = Array.isArray(callout.layers) ? callout.layers.slice(0, 5) : [];
    const annotations = Array.isArray(callout.annotations) ? callout.annotations.slice(0, 2) : [];
    return `
      <text x="5" y="${offsetY}" class="small" font-weight="bold">${label} • ${title} (${scale})</text>
      ${layers.map((l, i) => `<text x="10" y="${offsetY + 12 + i*10}" class="tiny">- ${l}</text>`).join('')}
      ${annotations.length > 0 ? `<text x="10" y="${offsetY + 12 + layers.length*10}" class="tiny" fill="#666">Notes: ${annotations.join(', ')}</text>` : ''}
    `;
  };

  return `<g transform="translate(${x}, ${y})">
    <rect width="${width}" height="${height}" fill="#ffffff" stroke="#333" stroke-width="0.5"/>
    <text x="5" y="12" class="section-title">TECHNICAL DETAILS</text>
    ${renderDetail('DETAIL A', a, 26)}
    ${renderDetail('DETAIL B', b, 70)}
  </g>`;
}

/**
 * Generate unified A1 sheet with all views embedded
 */
export async function generateUnifiedSheet(designResult, projectContext) {
  console.log('📐 Generating unified A1 sheet with all views...');
  console.log('   designResult keys:', Object.keys(designResult));
  console.log('   visualizations:', designResult.visualizations);

  // Check if programmatic composer is enabled
  if (isFeatureEnabled('a1ProgrammaticComposer')) {
    console.log('   🎨 Using programmatic SVG composer (deterministic structure)');
    try {
      const { renderA1SheetSVG } = await import('./a1SheetComposer');
      const sheetData = mapDesignResultToA1SheetData(designResult, projectContext);
      const result = renderA1SheetSVG(sheetData);
      console.log('✅ Programmatic A1 sheet generated');
      console.log('   📏 SVG length:', result.svg.length, 'characters');
      return result.svg;
    } catch (error) {
      console.error('❌ Programmatic composer failed, falling back to legacy:', error);
      // Fall through to legacy implementation
    }
  }

  // Legacy implementation (kept for fallback)
  console.log('   📐 Using legacy sheet generator');

  const {
    designDNA,
    masterDNA
  } = designResult;

  const dna = designDNA || masterDNA;

  // Extract view URLs from the entire design result
  const views = extractViewURLs(designResult);
  const foundViews = Object.keys(views).filter(k => views[k]);
  const missingViews = Object.keys(views).filter(k => !views[k]);

  console.log('   ✅ Found views (' + foundViews.length + '):', foundViews);
  if (missingViews.length > 0) {
    console.warn('   ⚠️  Missing views (' + missingViews.length + '):', missingViews);
  }
  console.log('   📊 Total views with URLs:', Object.values(views).filter(v => v).length + '/11');

  // Calculate simple hash for traceability
  const designHash = simpleHash(JSON.stringify({ dna, seed: dna?.seed }));

  // Build SVG with responsive sizing (no mm units on root element)
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 ${SHEET_WIDTH} ${SHEET_HEIGHT}"
     preserveAspectRatio="xMidYMid meet"
     xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     style="width: 100%; height: auto; max-width: 100%; display: block;">

  <defs>
    <style>
      text { font-family: Arial, sans-serif; }
      .title { font-size: 16px; font-weight: bold; }
      .label { font-size: 10px; font-weight: 600; }
      .small { font-size: 8px; }
      .tiny { font-size: 7px; fill: #666; }
    </style>
  </defs>

  <!-- Background -->
  <rect width="${SHEET_WIDTH}" height="${SHEET_HEIGHT}" fill="#ffffff"/>

  <!-- Main Border -->
  <rect x="${MARGIN}" y="${MARGIN}"
        width="${SHEET_WIDTH - MARGIN * 2}"
        height="${SHEET_HEIGHT - MARGIN * 2}"
        fill="none" stroke="#000" stroke-width="1"/>

  <!-- Title Block -->
  ${generateTitleBlock(dna, projectContext, designHash)}

  <!-- Key Metrics (Top Right) -->
  ${generateMetrics(dna)}

  <!-- Floor Plans Row (Top) -->
  ${generateFloorPlansRow(views)}

  <!-- Elevations Row (Middle) -->
  ${generateElevationsRow(views)}

  <!-- 3D Views Row -->
  ${generate3DViewsRow(views)}

  <!-- Sections Row (Bottom) -->
  ${generateSectionsRow(views)}

  <!-- Material Palette (Left Side) -->
  ${generateMaterialPalette(dna)}

</svg>`;

  console.log('✅ Unified sheet generated');
  console.log('   📏 SVG length:', svg.length, 'characters');

  if (!svg || svg.length < 100) {
    console.error('❌ Generated SVG is too short or empty!');
    return null;
  }

  return svg;
}

/**
 * Map design result to A1SheetData format for programmatic composer
 */
function mapDesignResultToA1SheetData(designResult, projectContext) {
  const { designDNA, masterDNA } = designResult;
  const dna = designDNA || masterDNA;
  const location = projectContext?.location || {};
  const views = extractViewURLs(designResult);

  // Extract materials
  const materials = Array.isArray(dna?.materials) 
    ? dna.materials.map(m => ({
        name: m.name || 'Unknown',
        description: m.application || m.description || '',
        swatchHex: m.hexColor || m.color_hex || '#888888'
      }))
    : [];

  // Extract climate summary
  const climate = location?.climate || location?.climateSummary || {};
  const seasonal = climate?.seasonal || {};
  const avgTemp = seasonal?.summer?.avgTemp || seasonal?.winter?.avgTemp || climate?.avgTemp || '10 °C';

  return {
    project: {
      title: projectContext?.buildingProgram || dna?.projectName || 'Modern Residential Building',
      architect: 'ArchiAI Solution Ltd — Mohammed Reggab',
      drawingTitle: 'Full Architectural Presentation – A1 Sheet',
      drawingNo: dna?.projectID ? `A1.${dna.projectID.slice(-3)}` : `A1.${Date.now().toString().slice(-3)}`,
      date: new Date().toLocaleDateString('en-GB'),
      location: location?.address || 'Location TBD',
      scale: '1:100 (Plans, Elevations, Section) / NTS (3D Views)',
      version: 'ArchiAI – v1.4 Climate Reasoning Model'
    },
    location: {
      mapImageUrl: location?.siteMapUrl || location?.mapImageUrl,
      prevailingWind: climate?.prevailingWind || 'west–south-west',
      climateSummary: {
        avgTemp: avgTemp,
        rainfall: climate?.avgRainfall || climate?.rainfall || '750 mm/yr',
        zone: climate?.type || climate?.climateZone || 'Temperate Oceanic',
        strategy: location?.sunPath?.optimalOrientation 
          ? `Orient living area toward ${location.sunPath.optimalOrientation.toLowerCase()} for daylight; add roof overhangs for shading.`
          : 'Orient living area toward south for daylight; add roof overhangs for shading.'
      },
      sunPathDiagramUrl: location?.sunPathDiagramUrl
    },
    dna: {
      style: dna?.architecturalStyle || dna?.architectural_style?.name || 'Modern Contemporary with Local Brick Aesthetic',
      materials: materials,
      blend: dna?.portfolioBlendPercent 
        ? `${100 - (dna.portfolioBlendPercent || 70)}% local contextual style + ${dna.portfolioBlendPercent || 70}% architect's personal minimalist DNA`
        : '60% local contextual style + 40% architect\'s personal minimalist DNA'
    },
    geometryViews: {
      // Will be populated by geometry renderers if available
      floorPlansSvg: {
        ground: views.ground ? null : undefined, // URLs will be converted to SVG if needed
        first: views.upper ? null : undefined,
        roof: views.roof ? null : undefined
      },
      elevationsSvg: {
        north: views.elevationN ? null : undefined,
        south: views.elevationS ? null : undefined,
        east: views.elevationE ? null : undefined,
        west: views.elevationW ? null : undefined
      },
      sectionSvg: {
        aA: views.sectionLong ? null : undefined
      }
    },
    // Image URLs for geometry views (fallback when SVG not available)
    geometryImageUrls: {
      floorPlans: {
        ground: views.ground,
        first: views.upper,
        roof: views.roof
      },
      elevations: {
        north: views.elevationN,
        south: views.elevationS,
        east: views.elevationE,
        west: views.elevationW
      },
      section: {
        aA: views.sectionLong
      }
    },
    visuals: {
      exteriorUrl: views.exterior || views.persp,
      interiorUrl: views.interior,
      axonometricUrl: views.axon,
      conceptSketchUrl: views.site
    },
    performance: {
      southGlazing: '28%',
      crossVent: 'living ↔ courtyard',
      pv: '6 kW (~25% household energy)',
      uValues: 'wall 0.25 W/m²K | roof 0.15 W/m²K | window 1.2 W/m²K',
      rainwater: '3 m³ under garden'
    },
    summary: {
      siteArea: location?.siteAnalysis?.area || '450 m²',
      builtUp: dna?.dimensions 
        ? `${((dna.dimensions.length || 0) * (dna.dimensions.width || 0) * (dna.dimensions.floorHeights?.length || 2)).toFixed(0)} m²`
        : '230 m²',
      floors: dna?.dimensions?.floorHeights?.length 
        ? `G + ${dna.dimensions.floorHeights.length - 1}`
        : 'G + 1',
      bedrooms: dna?.rooms?.filter(r => r.name?.toLowerCase().includes('bedroom')).length || '3',
      bathrooms: dna?.rooms?.filter(r => r.name?.toLowerCase().includes('bath')).length || '3',
      height: dna?.dimensions?.height ? `${dna.dimensions.height.toFixed(1)} m` : '6.5 m',
      cost: dna?.dimensions 
        ? `£${((dna.dimensions.length || 0) * (dna.dimensions.width || 0) * (dna.dimensions.floorHeights?.length || 2) * 1400).toLocaleString()}`
        : '£320,000',
      completion: 'Q3 2026'
    }
  };
}

/**
 * Extract view URLs from design result object
 * Handles the actual data structure from FLUX generation
 */
function extractViewURLs(designResult) {
  const views = {};

  console.log('   🔍 Extracting URLs from design result...');

  // Helper function to get URL from nested structure
  const getUrl = (obj) => {
    if (!obj) return null;
    if (typeof obj === 'string') return obj;
    if (obj.url) return obj.url;
    if (obj.images && Array.isArray(obj.images) && obj.images.length > 0) {
      return typeof obj.images[0] === 'string' ? obj.images[0] : obj.images[0]?.url;
    }
    return null;
  };

  // Floor plans from floorPlans.floorPlans
  if (designResult.floorPlans?.floorPlans) {
    views.ground = getUrl(designResult.floorPlans.floorPlans.ground);
    views.upper = getUrl(designResult.floorPlans.floorPlans.upper);
    console.log('      Floor Plans: ground=' + (views.ground ? 'found' : 'missing') + ', upper=' + (views.upper ? 'found' : 'missing'));
  }

  // Technical drawings from technicalDrawings.technicalDrawings
  if (designResult.technicalDrawings?.technicalDrawings) {
    const td = designResult.technicalDrawings.technicalDrawings;
    views.elevationN = getUrl(td.elevation_north);
    views.elevationS = getUrl(td.elevation_south);
    views.elevationE = getUrl(td.elevation_east);
    views.elevationW = getUrl(td.elevation_west);
    views.sectionLong = getUrl(td.section_longitudinal);
    views.sectionCross = getUrl(td.section_cross);
    console.log('      Elevations: N=' + (views.elevationN ? 'found' : 'missing') + ', S=' + (views.elevationS ? 'found' : 'missing'));
    console.log('      Sections: Long=' + (views.sectionLong ? 'found' : 'missing') + ', Cross=' + (views.sectionCross ? 'found' : 'missing'));
  }

  // 3D views from visualizations.views
  if (designResult.visualizations?.views) {
    const v = designResult.visualizations.views;
    views.axon = getUrl(v.axonometric);
    views.persp = getUrl(v.perspective);
    views.interior = getUrl(v.interior);
    views.exterior = getUrl(v.exterior_front || v.exterior_side);
    views.site = getUrl(v.site);
    console.log('      3D Views: axon=' + (views.axon ? 'found' : 'missing') + ', persp=' + (views.persp ? 'found' : 'missing') + ', interior=' + (views.interior ? 'found' : 'missing'));
  }

  console.log('   ✅ Extracted ' + Object.values(views).filter(v => v).length + ' image URLs');
  return views;
}

/**
 * Generate title block (bottom)
 */
function generateTitleBlock(dna, context, hash) {
  const y = SHEET_HEIGHT - 60;
  const projectName = context?.buildingProgram || 'Architectural Project';
  const location = context?.location?.address || 'Location TBD';
  const floors = dna?.dimensions?.floorCount || 2;
  const style = dna?.architecturalStyle || 'Contemporary';

  return `
  <g id="title-block">
    <!-- Main title bar -->
    <rect x="${MARGIN}" y="${y}" width="${SHEET_WIDTH - MARGIN * 2}" height="50"
          fill="#1a1a1a" stroke="#000" stroke-width="1"/>

    <!-- White separator line -->
    <line x1="${MARGIN}" y1="${y + 35}" x2="${SHEET_WIDTH - MARGIN}" y2="${y + 35}"
          stroke="#ffffff" stroke-width="0.5"/>

    <!-- Project name -->
    <text x="${MARGIN + 10}" y="${y + 20}" class="title" fill="#ffffff">
      ${projectName}
    </text>

    <!-- Project details -->
    <text x="${MARGIN + 10}" y="${y + 47}" class="small" fill="#ffffff">
      ${location} | ${floors} Floors | ${style}
    </text>

    <!-- Right side info -->
    <text x="${SHEET_WIDTH - MARGIN - 10}" y="${y + 14}" class="tiny" fill="#ffffff" text-anchor="end">
      Design ID: ${dna?.projectID || context?.designId || 'BirminghamApartment'}
    </text>
    <text x="${SHEET_WIDTH - MARGIN - 10}" y="${y + 22}" class="tiny" fill="#ffffff" text-anchor="end">
      Seed: ${dna?.seed || 806502} | Hash: ${hash}
    </text>
    <text x="${SHEET_WIDTH - MARGIN - 10}" y="${y + 47}" class="tiny" fill="#ffffff" text-anchor="end">
      Generated: ${new Date().toLocaleDateString()} | Scale: 1:100
    </text>
  </g>`;
}

/**
 * Generate floor plans row (top)
 */
function generateFloorPlansRow(views) {
  const y = MARGIN + 50; // Space for key metrics
  const width = (SHEET_WIDTH - MARGIN * 3) / 2;
  const height = 160;

  return `
  <g id="floor-plans-row">
    <!-- Ground Floor -->
    ${embedImage(views.ground, MARGIN, y, width, height, "GROUND FLOOR PLAN")}

    <!-- Upper Floor -->
    ${embedImage(views.upper, MARGIN * 2 + width, y, width, height, "UPPER FLOOR PLAN")}
  </g>`;
}

/**
 * Generate elevations row
 */
function generateElevationsRow(views) {
  const y = MARGIN + 225; // Below floor plans
  const width = (SHEET_WIDTH - MARGIN * 5) / 4;
  const height = 100;

  return `
  <g id="elevations-row">
    ${embedImage(views.elevationN, MARGIN, y, width, height, "NORTH ELEVATION")}
    ${embedImage(views.elevationS, MARGIN * 2 + width, y, width, height, "SOUTH ELEVATION")}
    ${embedImage(views.elevationE, MARGIN * 3 + width * 2, y, width, height, "EAST ELEVATION")}
    ${embedImage(views.elevationW, MARGIN * 4 + width * 3, y, width, height, "WEST ELEVATION")}
  </g>`;
}

/**
 * Generate 3D views row
 */
function generate3DViewsRow(views) {
  const y = MARGIN + 340; // Below elevations
  const width = (SHEET_WIDTH - MARGIN * 4) / 3;
  const height = 150;

  return `
  <g id="3d-views-row">
    ${embedImage(views.axon, MARGIN, y, width, height, "AXONOMETRIC")}
    ${embedImage(views.persp, MARGIN * 2 + width, y, width, height, "PERSPECTIVE")}
    ${embedImage(views.interior, MARGIN * 3 + width * 2, y, width, height, "INTERIOR")}
  </g>`;
}

/**
 * Generate sections row
 */
function generateSectionsRow(views) {
  const y = MARGIN + 505; // Below 3D views
  const width = (SHEET_WIDTH - MARGIN * 3) / 2;
  const height = 120;

  return `
  <g id="sections-row">
    ${embedImage(views.sectionLong, MARGIN, y, width, height, "LONGITUDINAL SECTION")}
    ${embedImage(views.sectionCross, MARGIN * 2 + width, y, width, height, "CROSS SECTION")}
  </g>`;
}

/**
 * Embed image in SVG
 */
function embedImage(url, x, y, width, height, label) {
  console.log(`   📊 embedImage called: label="${label}", url=${url ? 'present' : 'MISSING'}`);

  if (!url) {
    return `
    <g transform="translate(${x}, ${y})">
      <rect width="${width}" height="${height}" fill="#f5f5f5" stroke="#ccc" stroke-width="0.5"/>
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="small" fill="#999">
        ${label || 'No Image'}
      </text>
      <text x="2" y="10" class="tiny">${label}</text>
    </g>`;
  }

  return `
  <g transform="translate(${x}, ${y})">
    <rect width="${width}" height="${height}" fill="white" stroke="#333" stroke-width="0.5"/>
    <image href="${url}" x="1" y="12" width="${width - 2}" height="${height - 14}"
           preserveAspectRatio="xMidYMid meet"/>
    <text x="2" y="10" class="tiny" font-weight="bold">${label}</text>
  </g>`;
}

/**
 * Generate material palette (left side)
 */
function generateMaterialPalette(dna) {
  const x = MARGIN + 5;
  const y = MARGIN + 15;
  const materials = dna?.materials || [];

  if (materials.length === 0 || !Array.isArray(materials)) return '';

  let svg = `<g id="materials">
    <text x="${x}" y="${y}" class="tiny" font-weight="bold">MATERIALS</text>`;

  materials.slice(0, 5).forEach((mat, i) => {
    const matY = y + 10 + (i * 12);
    svg = svg + `
      <rect x="${x}" y="${matY}" width="10" height="10"
            fill="${mat.hexColor || '#ccc'}" stroke="#000" stroke-width="0.3"/>
      <text x="${x + 14}" y="${matY + 8}" class="tiny">
        ${mat.name || 'Material'} - ${mat.application || ''}
      </text>`;
  });

  svg = svg + `</g>`;
  return svg;
}

/**
 * Generate metrics (top right)
 */
function generateMetrics(dna) {
  const x = SHEET_WIDTH - 110;
  const y = MARGIN + 15;
  const dim = dna?.dimensions || {};

  return `
  <g id="metrics">
    <text x="${x}" y="${y}" class="tiny" font-weight="bold">KEY METRICS</text>
    <line x1="${x}" y1="${y + 2}" x2="${x + 100}" y2="${y + 2}" stroke="#000" stroke-width="0.5"/>
    <text x="${x}" y="${y + 14}" class="tiny">Floors: ${dim.floorCount || 2}</text>
    <text x="${x}" y="${y + 24}" class="tiny">Size: ${dim.length || 0}m × ${dim.width || 0}m</text>
    <text x="${x}" y="${y + 34}" class="tiny">Height: ${dim.totalHeight || 0}m</text>
    <text x="${x}" y="${y + 44}" class="tiny">Roof: ${dna?.roof?.type || 'gable'} (${dna?.roof?.pitch || 35}°)</text>
  </g>`;
}

/**
 * Simple hash function (browser-compatible)
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).substring(0, 12);
}

/**
 * Compose A1 sheet locally with dynamic views and optional site map
 * No AI calls - pure SVG composition
 */
export async function composeA1({ views, siteMapImage, metadata }) {
  console.log('📐 Composing A1 sheet locally...');

  const {
    designId = `design_${Date.now()}`,
    seed = 806502,
    hash = 'unknown'
  } = metadata || {};

  // Extract view URLs/Images
  const viewMap = {
    plan_ground: views.plan_ground || views.ground,
    plan_upper: views.plan_upper || views.upper,
    elev_n: views.elev_n || views.elevationN,
    elev_s: views.elev_s || views.elevationS,
    elev_e: views.elev_e || views.elevationE,
    elev_w: views.elev_w || views.elevationW,
    sect_long: views.sect_long || views.sectionLong,
    sect_trans: views.sect_trans || views.sectionCross,
    v_exterior: views.v_exterior || views.exterior || views.persp,
    v_axon: views.v_axon || views.axon,
    v_site: views.v_site || views.site,
    v_interior: views.v_interior || views.interior
  };

  // Build SVG with embedded images
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg viewBox="0 0 ${SHEET_WIDTH} ${SHEET_HEIGHT}"
     preserveAspectRatio="xMidYMid meet"
     xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     style="width: 100%; height: auto; max-width: 100%; display: block;">

  <defs>
    <style>
      text { font-family: Arial, sans-serif; }
      .title { font-size: 16px; font-weight: bold; }
      .label { font-size: 10px; font-weight: 600; }
      .small { font-size: 8px; }
      .tiny { font-size: 7px; fill: #666; }
    </style>
  </defs>

  <!-- Background -->
  <rect width="${SHEET_WIDTH}" height="${SHEET_HEIGHT}" fill="#ffffff"/>

  <!-- Main Border -->
  <rect x="${MARGIN}" y="${MARGIN}"
        width="${SHEET_WIDTH - MARGIN * 2}"
        height="${SHEET_HEIGHT - MARGIN * 2}"
        fill="none" stroke="#000" stroke-width="1"/>

  <!-- Title Block -->
  ${generateTitleBlock(metadata?.dna || {}, metadata?.context || {}, hash)}

  <!-- Key Metrics (Top Right) -->
  ${generateMetrics(metadata?.dna || {})}

  <!-- Floor Plans Row (Top) -->
  ${generateFloorPlansRow(viewMap)}

  <!-- Elevations Row (Middle) -->
  ${generateElevationsRow(viewMap)}

  <!-- 3D Views Row -->
  ${generate3DViewsRow(viewMap)}

  <!-- Sections Row (Bottom) -->
  ${generateSectionsRow(viewMap)}

  <!-- Site Map Section (if provided) -->
  ${siteMapImage ? generateSiteMapSectionFromImage(siteMapImage, MARGIN, MARGIN + 640, (SHEET_WIDTH - MARGIN * 3) / 2, 120) : ''}

  <!-- Material Palette (Left Side) -->
  ${generateMaterialPalette(metadata?.dna || {})}

  <!-- Program Schedule Panel (if available) -->
  ${generateProgramSchedule(metadata?.dna || {}, metadata?.context || {})}

</svg>`;

  // Generate PNG from SVG
  const png = await svgToPng(svg);

  return { svg, png };
}

/**
 * Generate site map section from captured image
 */
function generateSiteMapSectionFromImage(siteMapImage, x, y, width, height) {
  return `<g transform="translate(${x}, ${y})">
    <rect width="${width}" height="${height}" fill="white" stroke="#333" stroke-width="0.5"/>
    <image href="${siteMapImage}" x="1" y="12" width="${width - 2}" height="${height - 14}"
           preserveAspectRatio="xMidYMid meet"/>
    <text x="2" y="10" class="tiny" font-weight="bold">SITE PLAN</text>
    <text x="${width / 2}" y="${height - 5}" text-anchor="middle" class="tiny">SCALE 1:1250</text>
  </g>`;
}

/**
 * Generate Program Schedule panel
 */
function generateProgramSchedule(dna, context) {
  const programSpaces = context?.programSpaces || dna?.programSpaces || [];
  const projectType = context?.projectType || dna?.projectType || null;
  
  if (!programSpaces || programSpaces.length === 0) {
    return '';
  }

  const x = MARGIN + 5;
  const y = MARGIN + 200; // Position below material palette
  const width = 180;
  const programTotal = programSpaces.reduce((sum, space) => 
    sum + (parseFloat(space.area || 0) * (space.count || 1)), 0
  );

  let svg = `<g id="program-schedule">
    <rect x="${x}" y="${y}" width="${width}" height="${50 + programSpaces.length * 20}" fill="#f9f9f9" stroke="#333" stroke-width="0.5" rx="2"/>
    <text x="${x + 5}" y="${y + 12}" class="tiny" font-weight="bold">PROGRAM SCHEDULE</text>`;
  
  if (projectType) {
    svg += `<text x="${x + 5}" y="${y + 25}" class="tiny" fill="#666">Type: ${projectType.toUpperCase()}</text>`;
  }

  programSpaces.forEach((space, i) => {
    const spaceTotal = (parseFloat(space.area || 0) * (space.count || 1)).toFixed(0);
    svg += `<text x="${x + 5}" y="${y + 40 + i * 18}" class="tiny">
      ${space.name || `Space ${i + 1}`}: ${space.area || 'TBD'}m² × ${space.count || 1} = ${spaceTotal}m²
    </text>`;
  });

  svg += `<text x="${x + 5}" y="${y + 40 + programSpaces.length * 18}" class="tiny" font-weight="bold">Total: ${programTotal.toFixed(0)}m²</text>`;
  svg += `</g>`;

  return svg;
}

/**
 * Convert SVG to PNG data URL
 */
async function svgToPng(svgString) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = SHEET_WIDTH * 2; // Higher resolution
      canvas.height = SHEET_HEIGHT * 2;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      const pngDataUrl = canvas.toDataURL('image/png');
      URL.revokeObjectURL(url);
      resolve(pngDataUrl);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to convert SVG to PNG'));
    };

    img.src = url;
  });
}

export default {
  generateUnifiedSheet,
  composeA1
};

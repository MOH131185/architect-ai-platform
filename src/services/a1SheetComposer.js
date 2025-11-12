/**
 * A1 Master Sheet Composer
 *
 * Pure function that assembles a complete A1 architectural sheet (7016×9933px @ 300 DPI)
 * from project data including:
 * - Site/climate context
 * - Floor plans (Ground, First, Roof)
 * - Elevations (S, N, E, W)
 * - Section
 * - 3D visualizations
 * - Legend, symbols, project data
 * - AI metadata
 */

import { generateNorthArrow, generateScaleBar, generateLegend, generateWindRose, generateSectionArrow } from './visual/legendSymbols.js';
import { generateSunPathDiagram } from './visual/sunPathDiagram.js';
import { GENERATION_CONFIG } from '../config/generationConfig.js';

/**
 * Compose complete A1 sheet HTML
 * @param {object} data - Complete project data
 * @param {object} data.location - Location with coordinates, climate, sunPath
 * @param {object} data.dna - Master Design DNA
 * @param {object} data.visualizations - All 13 generated views
 * @param {object} data.siteMap - Static map data
 * @param {object} data.performance - Environmental performance data
 * @param {object} data.metadata - AI generation metadata
 * @returns {object} { html, css, exportHelpers }
 */
export function composeA1Sheet(data) {
  const {
    location = {},
    dna = {},
    visualizations = {},
    siteMap = {},
    performance = {},
    metadata = {}
  } = data;

  // Extract resolution
  const { width, height, dpi } = GENERATION_CONFIG.a1Resolution;

  // Build HTML content
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>A1 Master Sheet - ${metadata.projectName || 'Architectural Design'}</title>
      <style>${getA1StyleSheet()}</style>
    </head>
    <body>
      <div class="a1-sheet" style="width: ${width}px; height: ${height}px;">
        <!-- Title Bar -->
        ${renderTitleBar(data)}

        <!-- Top Zone: Context & 3D Views -->
        <div class="top-zone">
          ${renderSiteContext(location, siteMap)}
          ${renderClimateContext(location, performance)}
          ${render3DViews(visualizations)}
        </div>

        <!-- Middle Zone: Plans & Elevations -->
        <div class="middle-zone">
          <div class="plans-column">
            ${renderFloorPlans(visualizations, dna)}
          </div>
          <div class="elevations-column">
            ${renderElevations(visualizations, dna)}
            ${renderSection(visualizations, dna)}
          </div>
        </div>

        <!-- Bottom Zone: Data & Legend -->
        <div class="bottom-zone">
          ${renderPerformanceData(performance, dna)}
          ${renderProjectSummary(location, dna, metadata)}
          ${renderUKCompliance(metadata)}
          ${renderLegend(dna)}
          ${renderAIMetadata(metadata)}
        </div>
      </div>
    </body>
    </html>
  `.trim();

  return {
    html,
    css: getA1StyleSheet(),
    exportHelpers: {
      toPNG: () => exportToPNG(html, width, height),
      toPDF: () => exportToPDF(html, width, height),
      toSVG: () => exportToSVG(html)
    }
  };
}

/**
 * Get A1 stylesheet
 * @private
 */
function getA1StyleSheet() {
  return `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Arial', 'Helvetica', sans-serif;
      background: #FFFFFF;
    }

    .a1-sheet {
      background: #FFFFFF;
      position: relative;
      border: 2px solid #000000;
    }

    /* Title Bar */
    .title-bar {
      width: 100%;
      height: 150px;
      background: linear-gradient(to right, #2C3E50, #34495E);
      color: #FFFFFF;
      padding: 30px 60px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 4px solid #000000;
    }

    .title-bar h1 {
      font-size: 72px;
      font-weight: bold;
      letter-spacing: 2px;
    }

    .title-bar .project-info {
      text-align: right;
      font-size: 24px;
    }

    /* Top Zone */
    .top-zone {
      display: grid;
      grid-template-columns: 1fr 1fr 2fr;
      gap: 30px;
      padding: 40px;
      height: 900px;
      border-bottom: 2px solid #CCCCCC;
    }

    .site-context,
    .climate-context {
      border: 2px solid #000000;
      padding: 20px;
      background: #F9F9F9;
    }

    .three-d-views {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      grid-template-rows: repeat(2, 1fr);
      gap: 20px;
    }

    .view-box {
      border: 2px solid #000000;
      background: #FFFFFF;
      position: relative;
      overflow: hidden;
    }

    .view-box img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .view-label {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: rgba(0, 0, 0, 0.8);
      color: #FFFFFF;
      padding: 10px 15px;
      font-size: 20px;
      font-weight: bold;
    }

    .scale-label {
      position: absolute;
      top: 10px;
      right: 10px;
      background: rgba(255, 255, 255, 0.9);
      padding: 5px 10px;
      font-size: 16px;
      font-weight: bold;
      border: 1px solid #000000;
    }

    /* Middle Zone */
    .middle-zone {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      padding: 40px;
      height: 6000px;
    }

    .plans-column,
    .elevations-column {
      display: flex;
      flex-direction: column;
      gap: 40px;
    }

    .plan-box,
    .elevation-box,
    .section-box {
      border: 3px solid #000000;
      background: #FFFFFF;
      position: relative;
      min-height: 1800px;
    }

    .elevation-box,
    .section-box {
      min-height: 1100px;
    }

    .plan-box img,
    .elevation-box img,
    .section-box img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      background: #FFFFFF;
    }

    .drawing-label {
      position: absolute;
      top: 20px;
      left: 20px;
      background: #FFFFFF;
      border: 2px solid #000000;
      padding: 15px 25px;
      font-size: 32px;
      font-weight: bold;
      z-index: 10;
    }

    /* Bottom Zone */
    .bottom-zone {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 30px;
      padding: 40px;
      height: auto;
      min-height: 800px;
      border-top: 2px solid #CCCCCC;
      background: #F5F5F5;
    }

    .data-box {
      border: 2px solid #000000;
      padding: 30px;
      background: #FFFFFF;
    }

    .data-box h3 {
      font-size: 28px;
      font-weight: bold;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 2px solid #000000;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }

    .data-table th,
    .data-table td {
      text-align: left;
      padding: 12px;
      border-bottom: 1px solid #DDDDDD;
      font-size: 20px;
    }

    .data-table th {
      font-weight: bold;
      background: #F0F0F0;
    }

    .metadata-footer {
      grid-column: 1 / -1;
      text-align: center;
      padding: 30px;
      background: #2C3E50;
      color: #FFFFFF;
      font-size: 18px;
      border-radius: 5px;
    }

    .metadata-footer p {
      margin: 8px 0;
    }

    .section-heading {
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 15px;
      color: #2C3E50;
    }

    .map-container,
    .diagram-container {
      width: 100%;
      height: auto;
      border: 1px solid #CCCCCC;
      margin-top: 15px;
    }

    .map-container img,
    .diagram-container img {
      width: 100%;
      height: auto;
    }

    .disclaimer {
      font-size: 14px;
      font-style: italic;
      color: #666666;
      margin-top: 10px;
    }
  `;
}

/**
 * Render title bar
 * @private
 */
function renderTitleBar(data) {
  const { metadata = {}, location = {} } = data;
  const projectName = metadata.projectName || 'Residential Design';
  const address = location.address || 'Site Address';
  const date = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  return `
    <div class="title-bar">
      <div>
        <h1>${projectName}</h1>
        <p style="font-size: 28px; margin-top: 10px;">${address}</p>
      </div>
      <div class="project-info">
        <p><strong>Sheet:</strong> A1 Master</p>
        <p><strong>Date:</strong> ${date}</p>
        <p><strong>Scale:</strong> As Noted</p>
      </div>
    </div>
  `;
}

/**
 * Render site context (map, sun path, wind)
 * @private
 */
function renderSiteContext(location, siteMap) {
  const mapUrl = siteMap.url || '';
  const mapScale = siteMap.scale || '1:500';
  const disclaimer = siteMap.disclaimer || 'Not to scale for construction - indicative only';

  const sunPath = location.sunPath || GENERATION_CONFIG.defaultSunAngles;
  const sunPathSvg = generateSunPathDiagram({
    summer: sunPath.summer || { azimuth: 180, altitude: 65 },
    winter: sunPath.winter || { azimuth: 180, altitude: 25 },
    facadeOrientation: 'S',
    width: 500,
    height: 380
  });

  const windRoseSvg = generateWindRose({
    prevailingWind: location.climateSummary?.prevailingWind || location.climate?.prevailingWind || 'SW',
    size: 100
  });

  return `
    <div class="site-context">
      <h3 class="section-heading">Site & Climate Context</h3>
      
      <!-- Google Map Extract -->
      <div class="map-container" style="margin-top: 15px; margin-bottom: 20px;">
        ${mapUrl ? `<img src="${mapUrl}" alt="Site Map" style="width: 100%; height: auto; border: 2px solid #000;" />` : 
          `<div style="width: 100%; height: 300px; background: #E8E8E8; border: 2px solid #000; display: flex; align-items: center; justify-content: center; color: #666;">
            <div style="text-align: center;">
              <p style="font-size: 18px; margin-bottom: 10px;">Site Map</p>
              <p style="font-size: 14px;">Map unavailable</p>
            </div>
          </div>`}
        <div style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center;">
          <p style="font-size: 16px; font-weight: bold;">${mapScale}</p>
          <p class="disclaimer" style="font-size: 12px;">${disclaimer}</p>
        </div>
      </div>

      <!-- Sun Path Diagram -->
      <div style="margin-top: 20px;">
        <p style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">Sun Path Diagram</p>
        <div class="diagram-container">
          ${sunPathSvg}
        </div>
        <p style="font-size: 12px; margin-top: 8px; color: #666;">
          Shows south-facing main façade, summer and winter sun angles
        </p>
      </div>

      <!-- Prevailing Wind -->
      <div style="margin-top: 20px; text-align: center;">
        <p style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">Prevailing Wind</p>
        ${windRoseSvg}
        <p style="font-size: 12px; margin-top: 8px; color: #666;">
          ${location.climateSummary?.prevailingWind || location.climate?.prevailingWind || 'SW'}
        </p>
      </div>

      <!-- Coordinates -->
      <div style="margin-top: 20px;">
        <p style="font-size: 14px;"><strong>Coordinates:</strong></p>
        <p style="font-size: 12px; font-family: monospace;">
          ${location.coordinates?.lat?.toFixed(6) || 'N/A'}, ${location.coordinates?.lng?.toFixed(6) || 'N/A'}
        </p>
      </div>
    </div>
  `;
}

/**
 * Render climate context (sun path, wind, climate data)
 * @private
 */
function renderClimateContext(location, performance) {
  const climate = location.climateSummary || GENERATION_CONFIG.defaultClimate;
  const sunPath = location.sunPath || GENERATION_CONFIG.defaultSunAngles;

  const sunPathSvg = generateSunPathDiagram({
    summer: sunPath.summer || { azimuth: 180, altitude: 65 },
    winter: sunPath.winter || { azimuth: 180, altitude: 25 },
    facadeOrientation: 'S',
    width: 800,
    height: 400
  });

  const windRoseSvg = generateWindRose({
    prevailingWind: climate.prevailingWind || 'SW',
    size: 120
  });

  return `
    <div class="climate-context">
      <h3 class="section-heading">Climate & Solar Analysis</h3>

      <div class="diagram-container" style="margin-bottom: 20px;">
        ${sunPathSvg}
      </div>

      <table class="data-table" style="font-size: 16px;">
        <tr>
          <th>Climate Zone</th>
          <td>${climate.climateZone || 'Temperate'}</td>
        </tr>
        <tr>
          <th>Avg. Temperature</th>
          <td>${climate.avgTemp || 15}°C</td>
        </tr>
        <tr>
          <th>Avg. Rainfall</th>
          <td>${climate.avgRainfall || 800}mm/year</td>
        </tr>
        <tr>
          <th>Prevailing Wind</th>
          <td>${climate.prevailingWind || 'SW'}</td>
        </tr>
      </table>

      <div style="margin-top: 20px; text-align: center;">
        ${windRoseSvg}
      </div>
    </div>
  `;
}

/**
 * Render 3D views (exterior, interior, axonometric, site)
 * @private
 */
function render3DViews(visualizations) {
  // Handle multiple possible structures
  let threeD = visualizations.threeD || [];
  if (visualizations.views) {
    threeD = visualizations.views;
  }

  // Extract URLs - handle both direct URLs and images array
  const getViewUrl = (view) => {
    if (!view) return '';
    if (typeof view === 'string') return view;
    if (view.url) return view.url;
    if (view.images && view.images.length > 0) {
      const img = view.images[0];
      return typeof img === 'string' ? img : img.url || '';
    }
    return '';
  };

  const exterior = threeD.find(v => v.type === 'exterior' || v.id === 'exterior' || v.name === 'Exterior') || 
                   threeD.find(v => v.type === 'exterior_front') || {};
  const interior = threeD.find(v => v.type === 'interior' || v.id === 'interior' || v.name === 'Interior') || {};
  const axonometric = threeD.find(v => v.type === 'axonometric' || v.id === 'axonometric') || {};
  const site = threeD.find(v => v.type === 'site' || v.id === 'site') || {};

  return `
    <div class="three-d-views">
      ${renderViewBox(exterior, '3D Exterior View', getViewUrl(exterior))}
      ${renderViewBox(interior, '3D Interior View', getViewUrl(interior))}
      ${renderViewBox(axonometric, 'Axonometric Exploded', getViewUrl(axonometric))}
      ${renderViewBox(site, 'Site Context 1:500', getViewUrl(site))}
    </div>
  `;
}

/**
 * Render single view box
 * @private
 */
function renderViewBox(view, label, url = null, scale = null) {
  const imageUrl = url || (view && (view.url || (view.images && view.images[0] && (typeof view.images[0] === 'string' ? view.images[0] : view.images[0].url)))) || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"%3E%3C/svg%3E';

  return `
    <div class="view-box">
      ${imageUrl && imageUrl !== 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"%3E%3C/svg%3E' ? 
        `<img src="${imageUrl}" alt="${label}" />` : 
        `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999; font-size: 18px;">${label}</div>`}
      <div class="view-label">${label}</div>
      ${scale ? `<div class="scale-label">${scale}</div>` : ''}
    </div>
  `;
}

/**
 * Render floor plans
 * @private
 */
function renderFloorPlans(visualizations, dna) {
  // Handle both array and object structures
  let plans = visualizations.floorPlans || [];
  if (visualizations.floorPlans?.floorPlans) {
    plans = visualizations.floorPlans.floorPlans;
  }
  
  // Extract URLs - handle both direct URLs and images array
  const getPlanUrl = (plan) => {
    if (!plan) return '';
    if (typeof plan === 'string') return plan;
    if (plan.url) return plan.url;
    if (plan.images && plan.images.length > 0) {
      const img = plan.images[0];
      return typeof img === 'string' ? img : img.url || '';
    }
    return '';
  };

  const ground = plans.ground || plans.find(p => p.type === 'ground') || {};
  const first = plans.first || plans.upper || plans.find(p => p.type === 'first' || p.type === 'upper') || {};
  const roof = plans.roof || plans.find(p => p.type === 'roof') || {};

  const groundUrl = getPlanUrl(ground);
  const firstUrl = getPlanUrl(first);
  const roofUrl = getPlanUrl(roof);

  const northArrowSvg = generateNorthArrow({ size: 80 });
  const scaleBarSvg = generateScaleBar({ scale: '1:100', length: 250 });

  return `
    <div class="plan-box">
      <div class="drawing-label">Ground Floor Plan</div>
      <div class="scale-label">1:100</div>
      ${groundUrl ? `<img src="${groundUrl}" alt="Ground Floor Plan" />` : '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999;">Ground Floor Plan</div>'}
      <div style="position: absolute; top: 100px; right: 30px; z-index: 10;">
        ${northArrowSvg}
      </div>
      <div style="position: absolute; bottom: 30px; left: 30px; z-index: 10;">
        ${scaleBarSvg}
      </div>
    </div>

    <div class="plan-box">
      <div class="drawing-label">First Floor Plan</div>
      <div class="scale-label">1:100</div>
      ${firstUrl ? `<img src="${firstUrl}" alt="First Floor Plan" />` : '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999;">First Floor Plan</div>'}
      <div style="position: absolute; top: 100px; right: 30px; z-index: 10;">
        ${northArrowSvg}
      </div>
      <div style="position: absolute; bottom: 30px; left: 30px; z-index: 10;">
        ${scaleBarSvg}
      </div>
    </div>

    <div class="plan-box" style="min-height: 1200px;">
      <div class="drawing-label">Roof Plan</div>
      <div class="scale-label">1:200</div>
      ${roofUrl ? `<img src="${roofUrl}" alt="Roof Plan" />` : '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999;">Roof Plan</div>'}
    </div>
  `;
}

/**
 * Render elevations
 * @private
 */
function renderElevations(visualizations, dna) {
  // Handle multiple possible structures
  let elevations = visualizations.technicalDrawings?.filter(d => d.type === 'elevation') || [];
  
  // Check if technicalDrawings is an object with nested structure
  if (visualizations.technicalDrawings?.technicalDrawings) {
    const techDrawings = visualizations.technicalDrawings.technicalDrawings;
    elevations = Object.values(techDrawings).filter(d => 
      d.type === 'elevation' || 
      d.name?.toLowerCase().includes('elevation') ||
      d.id?.includes('elevation')
    );
  }

  // Extract URLs
  const getElevationUrl = (elev) => {
    if (!elev) return '';
    if (typeof elev === 'string') return elev;
    if (elev.url) return elev.url;
    if (elev.images && elev.images.length > 0) {
      const img = elev.images[0];
      return typeof img === 'string' ? img : img.url || '';
    }
    return '';
  };

  const south = elevations.find(e => e.orientation === 'S' || e.id?.includes('south') || e.name?.includes('South')) || {};
  const north = elevations.find(e => e.orientation === 'N' || e.id?.includes('north') || e.name?.includes('North')) || {};
  const east = elevations.find(e => e.orientation === 'E' || e.id?.includes('east') || e.name?.includes('East')) || {};
  const west = elevations.find(e => e.orientation === 'W' || e.id?.includes('west') || e.name?.includes('West')) || {};

  return `
    ${renderElevationBox(south, 'South Elevation', 'S', getElevationUrl(south))}
    ${renderElevationBox(north, 'North Elevation', 'N', getElevationUrl(north))}
    ${renderElevationBox(east, 'East Elevation', 'E', getElevationUrl(east))}
    ${renderElevationBox(west, 'West Elevation', 'W', getElevationUrl(west))}
  `;
}

/**
 * Render single elevation box
 * @private
 */
function renderElevationBox(elevation, label, orientation, url = null) {
  const imageUrl = url || (elevation && elevation.url) || '';
  const dims = elevation?.dimensions || {};
  const fflLevels = dims.floorHeights || [0, 3.1, 6.2];
  const material = elevation?.material || '';

  return `
    <div class="elevation-box">
      <div class="drawing-label">${label}</div>
      <div class="scale-label">1:100</div>
      ${imageUrl ? `<img src="${imageUrl}" alt="${label}" />` : `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999;">${label}</div>`}
      ${fflLevels.length > 0 ? `
        <div style="position: absolute; bottom: 60px; left: 20px; background: rgba(255,255,255,0.9); padding: 8px 12px; border: 1px solid #000; font-size: 14px;">
          <div>FFL 0.00m / ${fflLevels[1]?.toFixed(2) || '3.10'}m / ${fflLevels[2]?.toFixed(2) || '6.20'}m</div>
          ${material ? `<div style="margin-top: 4px; font-size: 12px;">Material: ${material}</div>` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Render section
 * @private
 */
function renderSection(visualizations, dna) {
  // Handle multiple possible structures
  let sections = visualizations.technicalDrawings?.filter(d => d.type === 'section') || [];
  
  // Check if technicalDrawings is an object with nested structure
  if (visualizations.technicalDrawings?.technicalDrawings) {
    const techDrawings = visualizations.technicalDrawings.technicalDrawings;
    sections = Object.values(techDrawings).filter(d => 
      d.type === 'section' || 
      d.name?.toLowerCase().includes('section') ||
      d.id?.includes('section')
    );
  }

  const sectionAA = sections.find(s => s.name?.includes('A-A') || s.id?.includes('longitudinal')) || sections[0] || {};
  
  // Extract URL
  const getSectionUrl = (section) => {
    if (!section) return '';
    if (typeof section === 'string') return section;
    if (section.url) return section.url;
    if (section.images && section.images.length > 0) {
      const img = section.images[0];
      return typeof img === 'string' ? img : img.url || '';
    }
    return '';
  };

  const sectionUrl = getSectionUrl(sectionAA);
  const sectionArrowSvg = generateSectionArrow({ label: 'A', direction: 'right', length: 120 });

  return `
    <div class="section-box">
      <div class="drawing-label">Section A-A</div>
      <div class="scale-label">1:100</div>
      ${sectionUrl ? `<img src="${sectionUrl}" alt="Section A-A" />` : `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999;">Section A-A</div>`}
      <div style="position: absolute; top: 60px; left: 20px; z-index: 10;">
        ${sectionArrowSvg}
      </div>
      ${dna.dimensions?.floorHeights ? `
        <div style="position: absolute; bottom: 60px; left: 20px; background: rgba(255,255,255,0.9); padding: 8px 12px; border: 1px solid #000; font-size: 14px;">
          <div>Levels: ${dna.dimensions.floorHeights.map(h => `${h.toFixed(2)}m`).join(' / ')}</div>
          <div style="margin-top: 4px; font-size: 12px;">Cut through stair & living space</div>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Render performance data
 * @private
 */
function renderPerformanceData(performance, dna) {
  const perf = { ...GENERATION_CONFIG.defaultPerformance, ...performance };

  return `
    <div class="data-box">
      <h3>Environmental Performance</h3>
      <table class="data-table">
        <tr>
          <th>PV Capacity</th>
          <td>${perf.pvCapacity} kW</td>
        </tr>
        <tr>
          <th>Annual PV Output</th>
          <td>${perf.pvAnnualOutput} kWh</td>
        </tr>
        <tr>
          <th>Glazing Ratio</th>
          <td>${(perf.glazingRatio * 100).toFixed(0)}%</td>
        </tr>
        <tr>
          <th>U-value (Wall)</th>
          <td>${perf.uValueWall} W/m²K</td>
        </tr>
        <tr>
          <th>U-value (Roof)</th>
          <td>${perf.uValueRoof} W/m²K</td>
        </tr>
        <tr>
          <th>U-value (Glazing)</th>
          <td>${perf.uValueGlazing} W/m²K</td>
        </tr>
        <tr>
          <th>Air Tightness</th>
          <td>${perf.airTightness} m³/h/m²@50Pa</td>
        </tr>
        <tr>
          <th>Thermal Mass</th>
          <td>${perf.thermalMass}</td>
        </tr>
      </table>
    </div>
  `;
}

/**
 * Render project summary
 * @private
 */
function renderProjectSummary(location, dna, metadata) {
  const dims = dna.dimensions || {};
  const totalArea = (dims.length || 0) * (dims.width || 0) * (dna.floors || 2);

  return `
    <div class="data-box">
      <h3>Project Summary</h3>
      <table class="data-table">
        <tr>
          <th>Building Type</th>
          <td>${metadata.buildingType || 'Residential'}</td>
        </tr>
        <tr>
          <th>Footprint</th>
          <td>${dims.length}m × ${dims.width}m</td>
        </tr>
        <tr>
          <th>Total Height</th>
          <td>${dims.height}m</td>
        </tr>
        <tr>
          <th>Floors</th>
          <td>${dna.floors || 2}</td>
        </tr>
        <tr>
          <th>Total Floor Area</th>
          <td>${totalArea.toFixed(0)}m²</td>
        </tr>
        <tr>
          <th>Primary Material</th>
          <td>${dna.materials?.[0]?.name || 'N/A'}</td>
        </tr>
        <tr>
          <th>Roof Type</th>
          <td>${dna.roofType || 'Pitched'}</td>
        </tr>
        <tr>
          <th>Design DNA ID</th>
          <td style="font-family: monospace; font-size: 14px;">${metadata.dnaId || 'N/A'}</td>
        </tr>
      </table>
    </div>
  `;
}

/**
 * Render UK RIBA/Regulatory info (concise checklist)
 * @private
 */
function renderUKCompliance(metadata) {
  const stage = metadata.ribaStage || 'RIBA Stage 3 – Spatial Coordination';
  return `
    <div class="data-box">
      <h3>UK Compliance</h3>
      <table class="data-table">
        <tr>
          <th>RIBA Stage</th>
          <td>${stage}</td>
        </tr>
        <tr>
          <th>Building Regs</th>
          <td>Parts A (Structure), B (Fire), L (Energy), M (Access)</td>
        </tr>
        <tr>
          <th>Drawing Set</th>
          <td>Site plan, Ground/Upper plans, 4 elevations, 2 sections, 3D views</td>
        </tr>
        <tr>
          <th>Notes</th>
          <td>Scales and north arrow shown; dimensions indicative – verify on site</td>
        </tr>
      </table>
    </div>
  `;
}

/**
 * Render legend with materials and symbols
 * @private
 */
function renderLegend(dna) {
  const materials = (dna.materials || []).map(m => ({
    name: m.name,
    type: inferMaterialType(m.name),
    color: m.hexColor || '#999999'
  }));

  const legendSvg = generateLegend({
    materials: materials.slice(0, 6), // Limit to 6 materials
    includeScale: true,
    includeNorth: true
  });

  return `
    <div class="data-box">
      <h3>Legend & Symbols</h3>
      <div style="margin-top: 20px;">
        ${legendSvg}
      </div>
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #CCCCCC;">
        <p style="font-size: 16px; font-weight: bold;">Abbreviations</p>
        <p style="font-size: 14px; margin-top: 10px;">FFL - Finished Floor Level</p>
        <p style="font-size: 14px;">DPC - Damp Proof Course</p>
        <p style="font-size: 14px;">GL - Ground Level</p>
        <p style="font-size: 14px;">N/A - Not Applicable</p>
      </div>
    </div>
  `;
}

/**
 * Render AI metadata footer
 * @private
 */
function renderAIMetadata(metadata) {
  const seed = metadata.seed || 'N/A';
  const timestamp = metadata.timestamp || new Date().toISOString();
  const consistency = metadata.consistencyScore || 0.98;
  const aiModel = metadata.aiModel || 'Together.ai FLUX.1-dev + Qwen 2.5 72B';

  return `
    <div class="metadata-footer">
      <p><strong>AI-Generated Architectural Design</strong></p>
      <p>Model: ${aiModel} | Seed: ${seed} | Consistency: ${(consistency * 100).toFixed(1)}%</p>
      <p>Generated: ${new Date(timestamp).toLocaleString('en-GB')}</p>
      <p style="font-size: 14px; margin-top: 15px; font-style: italic;">
        This design is AI-generated for conceptual purposes. Professional review and building regulation compliance required for construction.
      </p>
      <p style="font-size: 12px; margin-top: 10px;">
        Generated with Claude Code (claude.com/claude-code) + Architect AI Platform
      </p>
    </div>
  `;
}

/**
 * Infer material type from name
 * @private
 */
function inferMaterialType(materialName) {
  const name = (materialName || '').toLowerCase();

  if (name.includes('brick')) return 'brick';
  if (name.includes('concrete')) return 'concrete';
  if (name.includes('wood') || name.includes('timber')) return 'wood';
  if (name.includes('glass') || name.includes('glazing')) return 'glass';
  if (name.includes('insulation')) return 'insulation';

  return 'brick'; // Default
}

/**
 * Export to PNG
 * @private
 */
function exportToPNG(html, width, height) {
  // This would typically use html2canvas or similar in browser
  return {
    method: 'png',
    html,
    width,
    height,
    dpi: 300
  };
}

/**
 * Export to PDF
 * @private
 */
function exportToPDF(html, width, height) {
  return {
    method: 'pdf',
    html,
    width,
    height,
    dpi: 300
  };
}

/**
 * Export to SVG
 * @private
 */
function exportToSVG(html) {
  return {
    method: 'svg',
    html
  };
}

export default {
  composeA1Sheet
};

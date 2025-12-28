/**
 * DataPanelService - Deterministic Data Panel Generation
 *
 * Generates deterministic SVG data panels for A1 sheets:
 * - site_diagram: Building footprint with north arrow and dimensions
 * - material_palette: Material swatches with hex colors
 * - climate_card: Design specifications and climate data
 *
 * These panels are 100% deterministic - no AI generation, no API calls.
 * Uses DNA/CanonicalDesignState to extract design data.
 *
 * @module services/core/DataPanelService
 */

import { buildTitleBlockData } from '../a1/a1LayoutConstants.js';

import logger from './logger.js';

// =============================================================================
// HELPER: SVG to Data URL conversion
// =============================================================================

/**
 * Convert SVG string to data URL
 * @param {string} svg - SVG string
 * @returns {string} Data URL
 */
function svgToDataUrl(svg) {
  if (!svg) {
    return null;
  }
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    return `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(svg)))}`;
  }
  if (typeof Buffer !== 'undefined') {
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  }
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) {return min;}
  return Math.min(max, Math.max(min, n));
}

function truncateText(value, maxLen) {
  const text = String(value ?? '');
  const limit = clampNumber(maxLen, 0, 10_000);
  if (!limit || text.length <= limit) {return text;}
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function toTitleCase(value) {
  const text = String(value ?? '').trim();
  if (!text) {return '';}
  return text
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function asNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function formatAreaM2(value) {
  const n = asNumber(value, NaN);
  if (!Number.isFinite(n)) {return '';}
  return `${Math.round(n)} m²`;
}

function extractFloorCount(dna, fallback = 2) {
  const dimensions = dna?.dimensions || dna?.envelope || {};
  return Math.max(
    1,
    asNumber(dimensions.floors ?? dimensions.floorCount ?? dna?.program?.levelCount, fallback)
  );
}

function extractGrossAreaM2(dna, fallback = 150) {
  const dimensions = dna?.dimensions || dna?.envelope || {};
  return asNumber(
    dimensions.giaM2 ?? dimensions.area ?? dna?.program?.giaM2 ?? dna?.areaM2,
    fallback
  );
}

function extractSpaces(dna) {
  const candidates =
    dna?.program?.spaces ||
    dna?.programSpaces ||
    dna?.program?.programSpaces ||
    dna?.spaces ||
    dna?.rooms ||
    [];

  return Array.isArray(candidates) ? candidates : [];
}

function normalizeSpaceRow(space, index) {
  const name = space?.name || space?.label || space?.type || space?.room || `Room ${index + 1}`;
  const level = space?.level || space?.floor || space?.storey || '';
  const area = asNumber(space?.area ?? space?.sqm ?? space?.areaM2, NaN);

  return {
    name: truncateText(name, 22),
    level: truncateText(String(level || '').replace(/_/g, ' '), 10),
    areaM2: Number.isFinite(area) ? area : null,
  };
}

// =============================================================================
// SITE DIAGRAM
// =============================================================================

/**
 * Generate Site Diagram SVG
 * Shows building footprint, north arrow, and dimensions
 *
 * @param {Object} dna - Design DNA or CanonicalDesignState
 * @param {Object} siteSnapshot - Optional site snapshot with address/polygon
 * @returns {string} SVG string
 */
export function generateSiteDiagramSVG(dna, siteSnapshot = null) {
  // Extract dimensions from DNA
  const dimensions = dna?.dimensions || dna?.envelope || {};
  const width = dimensions.width || dimensions.widthM || 12;
  const length = dimensions.length || dimensions.lengthM || dimensions.depth || 10;

  // Extract address if available
  const address = siteSnapshot?.address || dna?.site?.address || dna?.location?.address || '';

  // Wide diagram sized to fit the Board v2 slot
  const svgWidth = 840;
  const svgHeight = 300;
  const centerX = svgWidth / 2;
  const centerY = svgHeight / 2 - 10; // keep content clear of bottom label band

  const maxDrawingW = svgWidth * 0.55;
  const maxDrawingH = svgHeight * 0.55;
  const scale = Math.max(
    6,
    Math.min(maxDrawingW / Math.max(1, width), maxDrawingH / Math.max(1, length))
  );

  const buildingW = width * scale;
  const buildingL = length * scale;

  // Truncate address if too long
  const displayAddress = truncateText(address, 44);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
  <!-- Background -->
  <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="#ffffff" />

  <!-- Site boundary (dashed) -->
  <rect x="${centerX - buildingW / 2 - 40}" y="${centerY - buildingL / 2 - 40}"
        width="${buildingW + 80}" height="${buildingL + 80}"
        fill="none" stroke="#94a3b8" stroke-width="1" stroke-dasharray="5,5" />

  <!-- Building footprint -->
  <rect x="${centerX - buildingW / 2}" y="${centerY - buildingL / 2}"
        width="${buildingW}" height="${buildingL}"
        fill="#e2e8f0" stroke="#334155" stroke-width="2" />

  <!-- North arrow -->
  <g transform="translate(${svgWidth - 50}, 50)">
    <polygon points="0,-20 -8,10 0,5 8,10" fill="#334155" />
    <text x="0" y="25" font-family="Arial, sans-serif" font-size="12" fill="#334155" text-anchor="middle">N</text>
  </g>

  <!-- Scale bar -->
  <g transform="translate(30, ${svgHeight - 58})">
    <line x1="0" y1="0" x2="75" y2="0" stroke="#334155" stroke-width="2" />
    <line x1="0" y1="-5" x2="0" y2="5" stroke="#334155" stroke-width="2" />
    <line x1="75" y1="-5" x2="75" y2="5" stroke="#334155" stroke-width="2" />
    <text x="37.5" y="15" font-family="Arial, sans-serif" font-size="10" fill="#64748b" text-anchor="middle">5m</text>
  </g>

  <!-- Dimensions -->
  <text x="${centerX}" y="${centerY + buildingL / 2 + 30}"
        font-family="Arial, sans-serif" font-size="11" fill="#64748b" text-anchor="middle">
    ${width.toFixed(1)}m
  </text>
  <text x="${centerX + buildingW / 2 + 25}" y="${centerY}"
        font-family="Arial, sans-serif" font-size="11" fill="#64748b" text-anchor="middle"
        transform="rotate(90 ${centerX + buildingW / 2 + 25} ${centerY})">
    ${length.toFixed(1)}m
  </text>

  <!-- Address (if available) -->
  ${displayAddress ? `<text x="${centerX}" y="${svgHeight - 34}" font-family="Arial, sans-serif" font-size="10" fill="#64748b" text-anchor="middle">${escapeXml(displayAddress)}</text>` : ''}
</svg>`;
}

// =============================================================================
// MATERIAL PALETTE
// =============================================================================

/**
 * Generate Material Palette SVG
 * Shows materials with color swatches
 *
 * @param {Object} dna - Design DNA or CanonicalDesignState
 * @returns {string} SVG string
 */
export function generateMaterialPaletteSVG(dna) {
  // Extract materials from various possible DNA structures
  const materials = dna?.materials || dna?.style?.materials || dna?.envelope?.materials || {};

  // Build material list
  const materialList = [];

  // Facade/exterior walls
  if (materials.facade) {
    materialList.push({
      name: materials.facade.name || 'Facade',
      color: materials.facade.hexColor || materials.facade.color || '#B8604E',
      application: materials.facade.application || 'Exterior Walls',
    });
  } else if (Array.isArray(materials) && materials.length > 0) {
    // Handle array of materials
    materials.slice(0, 4).forEach((mat) => {
      materialList.push({
        name: mat.name || 'Material',
        color: mat.hexColor || mat.color || '#CCCCCC',
        application: mat.application || '',
      });
    });
  }

  // Roof
  if (materials.roof) {
    materialList.push({
      name: materials.roof.name || 'Roof',
      color: materials.roof.hexColor || materials.roof.color || '#8B4513',
      application: 'Roof',
    });
  }

  // Windows
  if (materials.windows) {
    materialList.push({
      name: materials.windows.frame || 'Windows',
      color: materials.windows.color || '#FFFFFF',
      application: 'Window Frames',
    });
  }

  // Add defaults if empty
  if (materialList.length === 0) {
    materialList.push(
      { name: 'Red Brick', color: '#B8604E', application: 'Exterior Walls' },
      { name: 'Slate Tiles', color: '#4A5568', application: 'Roof' },
      { name: 'uPVC White', color: '#F5F5F5', application: 'Windows' },
      { name: 'Interior Plaster', color: '#FAFAFA', application: 'Interior' }
    );
  }

  // Board v2 sidebar slot is wide and shallow; render swatches horizontally.
  const svgWidth = 420;
  const svgHeight = 240;
  const swatchSize = 42;
  const padding = 24;
  const cols = 2;
  const rows = 2;
  const gapX = 16;
  const gapY = 18;
  const maxItems = cols * rows;

  const items = materialList.slice(0, maxItems);
  const startX = padding;
  const startY = 24;
  const blockW = (svgWidth - padding * 2 - gapX * (cols - 1)) / cols;

  let swatchesHtml = '';
  items.forEach((mat, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const blockX = startX + col * (blockW + gapX);
    const blockY = startY + row * (swatchSize + gapY + 20);
    const x = blockX;
    const y = blockY;
    const name = escapeXml(truncateText(mat.name, 14));
    const detail = escapeXml(truncateText(mat.application || '', 18));
    const colorText = escapeXml(String(mat.color || '').toUpperCase());
    swatchesHtml += `
      <rect x="${x}" y="${y}" width="${swatchSize}" height="${swatchSize}"
            fill="${mat.color}" stroke="#334155" stroke-width="1" rx="4" />
      <text x="${x + swatchSize + 10}" y="${y + 16}" font-family="Arial, sans-serif" font-size="12" fill="#0f172a" font-weight="700">${name}</text>
      <text x="${x + swatchSize + 10}" y="${y + 33}" font-family="Arial, sans-serif" font-size="10" fill="#64748b">${colorText}${detail ? ` · ${detail}` : ''}</text>
    `;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
  <!-- Background -->
  <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="#ffffff" />

  <!-- Material Swatches -->
  ${swatchesHtml}
</svg>`;
}

// =============================================================================
// CLIMATE CARD
// =============================================================================

/**
 * Generate Climate Card SVG
 * Shows design specifications and climate data
 *
 * @param {Object} dna - Design DNA or CanonicalDesignState
 * @param {Object} siteSnapshot - Optional site snapshot with climate data
 * @returns {string} SVG string
 */
export function generateClimateCardSVG(dna, siteSnapshot = null) {
  // Extract design specifications
  const style =
    dna?.style?.architecture || dna?.architecturalStyle || dna?.buildingType || 'Contemporary';

  const dimensions = dna?.dimensions || dna?.envelope || {};
  const floors = dimensions.floors || dimensions.floorCount || dna?.program?.levelCount || 2;

  const roofType = dna?.roofType || dna?.style?.roofType || dna?.envelope?.roof?.type || 'Gable';

  const orientation =
    dna?.orientation || dna?.site?.entranceSide || siteSnapshot?.orientation || 'South-facing';

  const giaM2 = dimensions.giaM2 || dimensions.area || dna?.program?.giaM2 || 150;

  // Climate info
  const climate = siteSnapshot?.climate || dna?.site?.climate || {};
  const climateType = climate.type || climate.zone || 'Temperate Maritime';

  const metrics = [
    { label: 'Style', value: style.charAt(0).toUpperCase() + style.slice(1).replace(/_/g, ' ') },
    { label: 'Floors', value: `${floors}` },
    { label: 'Gross Internal Area', value: `${giaM2} m²` },
    { label: 'Roof Type', value: roofType.charAt(0).toUpperCase() + roofType.slice(1) },
    { label: 'Orientation', value: orientation },
    { label: 'Climate Zone', value: climateType },
  ];

  // Board v2 climate slot is wide and shallow; render 2 columns.
  const svgWidth = 420;
  const svgHeight = 180;
  const leftX = 24;
  const rightX = 222;
  const topY = 26;
  const rowGap = 36;

  const leftMetrics = metrics.slice(0, 3);
  const rightMetrics = metrics.slice(3);

  const renderMetric = (metric, x, y) => `
    <text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="10" fill="#64748b">${escapeXml(metric.label)}</text>
    <text x="${x}" y="${y + 16}" font-family="Arial, sans-serif" font-size="12" fill="#0f172a" font-weight="700">${escapeXml(metric.value)}</text>
  `;

  let metricsHtml = '';
  leftMetrics.forEach((metric, i) => {
    metricsHtml += renderMetric(metric, leftX, topY + i * rowGap);
  });
  rightMetrics.forEach((metric, i) => {
    metricsHtml += renderMetric(metric, rightX, topY + i * rowGap);
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
  <!-- Background -->
  <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="#ffffff" />

  <!-- Metrics -->
  ${metricsHtml}
</svg>`;
}

// =======================================================================
// SCHEDULES & NOTES (Deterministic)
// =======================================================================

export function generateSchedulesNotesSVG(dna, siteSnapshot = null) {
  const svgWidth = 420;
  const svgHeight = 440;
  const padding = 20;
  const safeBottom = svgHeight - 34; // keep content clear of label band

  const floorCount = extractFloorCount(dna, 2);
  const giaM2 = extractGrossAreaM2(dna, 150);
  const style =
    dna?.style?.architecture || dna?.architecturalStyle || dna?.buildingType || 'Residential';

  const spaces = extractSpaces(dna).map(normalizeSpaceRow);
  const roomRows = spaces.length
    ? spaces
    : [
        { name: 'Living / Dining', level: 'Ground', areaM2: Math.round(giaM2 * 0.18) },
        { name: 'Kitchen', level: 'Ground', areaM2: Math.round(giaM2 * 0.1) },
        { name: 'WC', level: 'Ground', areaM2: 3 },
        { name: 'Bedroom 1', level: 'First', areaM2: Math.round(giaM2 * 0.1) },
        { name: 'Bedroom 2', level: 'First', areaM2: Math.round(giaM2 * 0.08) },
        { name: 'Bathroom', level: 'First', areaM2: 6 },
      ];

  const tableX = padding;
  const tableY = 86;
  const tableW = svgWidth - padding * 2;
  const headerH = 28;
  const rowH = 26;
  const maxRows = Math.max(
    4,
    Math.min(10, Math.floor((safeBottom - (tableY + headerH + 110)) / rowH))
  );
  const rows = roomRows.slice(0, maxRows);

  const colRoom = tableX + 10;
  const colArea = tableX + Math.round(tableW * 0.7);
  const colLevel = tableX + Math.round(tableW * 0.92);

  let rowsSvg = '';
  rows.forEach((room, i) => {
    const y = tableY + headerH + i * rowH;
    const fill = i % 2 === 0 ? '#ffffff' : '#f8fafc';
    const areaText = room.areaM2 != null ? `${Math.round(room.areaM2)} m²` : '—';
    rowsSvg += `
      <rect x="${tableX}" y="${y}" width="${tableW}" height="${rowH}" fill="${fill}" stroke="#e5e7eb" stroke-width="1" />
      <text x="${colRoom}" y="${y + 17}" font-family="Arial, sans-serif" font-size="11" fill="#0f172a">${escapeXml(room.name)}</text>
      <text x="${colArea}" y="${y + 17}" font-family="Arial, sans-serif" font-size="11" fill="#0f172a" text-anchor="middle">${escapeXml(areaText)}</text>
      <text x="${colLevel}" y="${y + 17}" font-family="Arial, sans-serif" font-size="11" fill="#0f172a" text-anchor="end">${escapeXml(room.level || '—')}</text>
    `;
  });

  const totalArea = rows
    .map((r) => (Number.isFinite(r.areaM2) ? r.areaM2 : 0))
    .reduce((a, b) => a + b, 0);

  const summaryLines = [
    { label: 'Type', value: toTitleCase(style) || 'Residential' },
    { label: 'Floors', value: `${floorCount}` },
    { label: 'GIA', value: formatAreaM2(giaM2) || '—' },
    {
      label: 'Address',
      value: truncateText(siteSnapshot?.address || dna?.site?.address || '', 38),
    },
  ].filter((x) => x.value);

  const summarySvg = summaryLines
    .map((line, idx) => {
      const y = 26 + idx * 16;
      return `
        <text x="${padding}" y="${y}" font-family="Arial, sans-serif" font-size="10" fill="#64748b">${escapeXml(line.label)}</text>
        <text x="${padding + 72}" y="${y}" font-family="Arial, sans-serif" font-size="10" fill="#0f172a" font-weight="700">${escapeXml(line.value)}</text>
      `;
    })
    .join('');

  const notesY = tableY + headerH + rows.length * rowH + 36;
  const notes = [
    'All dimensions in mm unless noted',
    'Areas are approximate, subject to survey',
    'North as indicated on site diagram',
  ];
  const notesSvg = notes
    .map((note, idx) => {
      const y = Math.min(safeBottom, notesY + idx * 16);
      return `<text x="${padding}" y="${y}" font-family="Arial, sans-serif" font-size="10" fill="#475569">• ${escapeXml(note)}</text>`;
    })
    .join('');

  const totalRowY = tableY + headerH + rows.length * rowH;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
  <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="#ffffff" />

  <!-- Summary -->
  ${summarySvg}

  <!-- Table header -->
  <rect x="${tableX}" y="${tableY}" width="${tableW}" height="${headerH}" fill="#0f172a" />
  <text x="${colRoom}" y="${tableY + 18}" font-family="Arial, sans-serif" font-size="10" fill="#ffffff" font-weight="700">ROOM</text>
  <text x="${colArea}" y="${tableY + 18}" font-family="Arial, sans-serif" font-size="10" fill="#ffffff" font-weight="700" text-anchor="middle">AREA</text>
  <text x="${colLevel}" y="${tableY + 18}" font-family="Arial, sans-serif" font-size="10" fill="#ffffff" font-weight="700" text-anchor="end">LEVEL</text>

  ${rowsSvg}

  <!-- Total row -->
  <rect x="${tableX}" y="${totalRowY}" width="${tableW}" height="${rowH}" fill="#f1f5f9" stroke="#e5e7eb" stroke-width="1" />
  <text x="${colRoom}" y="${totalRowY + 17}" font-family="Arial, sans-serif" font-size="11" fill="#0f172a" font-weight="700">TOTAL (shown)</text>
  <text x="${colArea}" y="${totalRowY + 17}" font-family="Arial, sans-serif" font-size="11" fill="#0f172a" text-anchor="middle" font-weight="700">${escapeXml(formatAreaM2(totalArea) || '—')}</text>
  <text x="${colLevel}" y="${totalRowY + 17}" font-family="Arial, sans-serif" font-size="11" fill="#0f172a" text-anchor="end">—</text>

  <!-- Notes -->
  ${notesSvg}
</svg>`;
}

// =======================================================================
// TITLE BLOCK (Deterministic)
// =======================================================================

export function generateTitleBlockSVG(dna, siteSnapshot = null) {
  const svgWidth = 420;
  const svgHeight = 280;
  const padding = 14;
  const safeBottom = svgHeight - 34;

  const context = {
    projectName:
      dna?.projectName ||
      dna?.project?.name ||
      dna?.metadata?.projectName ||
      'Architectural Design',
    buildingType: dna?.buildingTypeLabel || dna?.buildingType || dna?.style?.architecture || '',
    siteAddress: siteSnapshot?.address || dna?.site?.address || '',
    address: siteSnapshot?.address || dna?.site?.address || '',
    designId: dna?.designId || dna?.designFingerprint || dna?.fingerprint || '',
    seed: dna?.seed || dna?.seedValue || dna?.seeds?.a1Sheet || dna?.seedsByView?.a1Sheet || '',
    projectNumber: dna?.projectNumber || '',
    ribaStage: dna?.ribaStage || dna?.stage || 'STAGE 2',
    status: dna?.status || 'PRELIMINARY',
    revision: dna?.revision || 'P01',
    sheetNumber: dna?.sheetNumber || 'A1-001',
  };

  const tb = buildTitleBlockData(context);

  const leftX = padding;
  const rightX = svgWidth - padding;

  const projectName = escapeXml(truncateText(tb.projectName, 38));
  const projectNumber = escapeXml(truncateText(tb.projectNumber, 22));
  const address = escapeXml(truncateText(tb.siteAddress || '', 46));
  const drawingTitle = escapeXml(truncateText(tb.drawingTitle, 32));
  const sheetNumber = escapeXml(tb.sheetNumber || 'A1-001');
  const revision = escapeXml(tb.revision || 'P01');
  const status = escapeXml(tb.status || 'PRELIMINARY');
  const scale = escapeXml(tb.scale || 'AS NOTED');
  const date = escapeXml(tb.date || '');
  const designId = escapeXml(truncateText(tb.designId || '', 20));
  const seedValue = escapeXml(truncateText(tb.seedValue || '', 18));

  const rowBoxW = (svgWidth - padding * 2 - 10) / 2;
  const rowBoxH = 30;
  const row1Y = 170;
  const row2Y = 206;

  const maybeMeta =
    designId || seedValue
      ? `
  <line x1="${padding}" y1="${safeBottom - 22}" x2="${svgWidth - padding}" y2="${safeBottom - 22}" stroke="#e5e7eb" stroke-width="1" />
  ${designId ? `<text x="${padding}" y="${safeBottom - 8}" font-family="Arial, sans-serif" font-size="9" fill="#64748b">DESIGN: ${designId}</text>` : ''}
  ${seedValue ? `<text x="${svgWidth - padding}" y="${safeBottom - 8}" font-family="Arial, sans-serif" font-size="9" fill="#64748b" text-anchor="end">SEED: ${seedValue}</text>` : ''}
`
      : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
  <rect x="0" y="0" width="${svgWidth}" height="${svgHeight}" fill="#ffffff" />

  <!-- Practice -->
  <rect x="${padding}" y="${padding}" width="${svgWidth - padding * 2}" height="34" fill="#f1f5f9" rx="3" />
  <text x="${svgWidth / 2}" y="${padding + 22}" font-family="Arial, sans-serif" font-size="12" fill="#0f172a" font-weight="700" text-anchor="middle">${escapeXml(tb.practiceName)}</text>

  <!-- Project -->
  <text x="${leftX}" y="70" font-family="Arial, sans-serif" font-size="9" fill="#64748b">PROJECT</text>
  <text x="${leftX}" y="88" font-family="Arial, sans-serif" font-size="13" fill="#0f172a" font-weight="800">${projectName}</text>
  <text x="${leftX}" y="104" font-family="Arial, sans-serif" font-size="10" fill="#475569">${projectNumber}</text>

  <text x="${leftX}" y="126" font-family="Arial, sans-serif" font-size="9" fill="#64748b">SITE</text>
  <text x="${leftX}" y="144" font-family="Arial, sans-serif" font-size="10" fill="#0f172a">${address || 'TBD'}</text>

  <text x="${leftX}" y="164" font-family="Arial, sans-serif" font-size="9" fill="#64748b">DRAWING</text>
  <text x="${leftX}" y="182" font-family="Arial, sans-serif" font-size="12" fill="#0f172a" font-weight="700">${drawingTitle}</text>

  <!-- Sheet / Revision -->
  <rect x="${padding}" y="${row1Y}" width="${rowBoxW}" height="${rowBoxH}" fill="#f8fafc" rx="3" />
  <text x="${padding + 8}" y="${row1Y + 12}" font-family="Arial, sans-serif" font-size="8" fill="#64748b">SHEET</text>
  <text x="${padding + 8}" y="${row1Y + 25}" font-family="Arial, sans-serif" font-size="11" fill="#0f172a" font-weight="700">${sheetNumber}</text>

  <rect x="${padding + rowBoxW + 10}" y="${row1Y}" width="${rowBoxW}" height="${rowBoxH}" fill="#f8fafc" rx="3" />
  <text x="${padding + rowBoxW + 18}" y="${row1Y + 12}" font-family="Arial, sans-serif" font-size="8" fill="#64748b">REV</text>
  <text x="${padding + rowBoxW + 18}" y="${row1Y + 25}" font-family="Arial, sans-serif" font-size="11" fill="#0f172a" font-weight="700">${revision}</text>

  <!-- Scale / Date -->
  <rect x="${padding}" y="${row2Y}" width="${rowBoxW}" height="${rowBoxH}" fill="#f8fafc" rx="3" />
  <text x="${padding + 8}" y="${row2Y + 12}" font-family="Arial, sans-serif" font-size="8" fill="#64748b">SCALE</text>
  <text x="${padding + 8}" y="${row2Y + 25}" font-family="Arial, sans-serif" font-size="11" fill="#0f172a" font-weight="700">${scale}</text>

  <rect x="${padding + rowBoxW + 10}" y="${row2Y}" width="${rowBoxW}" height="${rowBoxH}" fill="#f8fafc" rx="3" />
  <text x="${padding + rowBoxW + 18}" y="${row2Y + 12}" font-family="Arial, sans-serif" font-size="8" fill="#64748b">DATE</text>
  <text x="${padding + rowBoxW + 18}" y="${row2Y + 25}" font-family="Arial, sans-serif" font-size="11" fill="#0f172a" font-weight="700">${date || '—'}</text>

  <!-- Stage / Status -->
  <text x="${leftX}" y="${safeBottom}" font-family="Arial, sans-serif" font-size="9" fill="#64748b">STAGE</text>
  <text x="${leftX + 52}" y="${safeBottom}" font-family="Arial, sans-serif" font-size="10" fill="#0f172a" font-weight="700">${escapeXml(tb.ribaStage || 'STAGE 2')}</text>
  <text x="${rightX}" y="${safeBottom}" font-family="Arial, sans-serif" font-size="10" fill="#0f172a" font-weight="700" text-anchor="end">${status}</text>

  ${maybeMeta}
</svg>`;
}

// =============================================================================
// MAIN SERVICE API
// =============================================================================

/**
 * Generate all data panels at once
 *
 * @param {Object} dna - Design DNA or CanonicalDesignState
 * @param {Object} siteSnapshot - Optional site snapshot
 * @returns {Object} Object with panel data URLs keyed by panel type
 */
export function generateDataPanels(dna, siteSnapshot = null) {
  logger.info('[DataPanelService] Generating data panels');

  const panels = {};

  try {
    const siteSvg = generateSiteDiagramSVG(dna, siteSnapshot);
    const siteDataUrl = svgToDataUrl(siteSvg);
    if (!siteDataUrl || !siteDataUrl.startsWith('data:')) {
      throw new Error('SVG conversion returned invalid result');
    }
    panels.site_diagram = siteDataUrl;
    logger.info('[DataPanelService] site_diagram generated');
  } catch (err) {
    logger.error('[DataPanelService] site_diagram failed:', err.message);
    panels.site_diagram = generatePlaceholderDataUrl('Site Diagram');
    logger.warn('[DataPanelService] Using placeholder for site_diagram');
  }

  try {
    const materialSvg = generateMaterialPaletteSVG(dna);
    const materialDataUrl = svgToDataUrl(materialSvg);
    if (!materialDataUrl || !materialDataUrl.startsWith('data:')) {
      throw new Error('SVG conversion returned invalid result');
    }
    panels.material_palette = materialDataUrl;
    logger.info('[DataPanelService] material_palette generated');
  } catch (err) {
    logger.error('[DataPanelService] material_palette failed:', err.message);
    panels.material_palette = generatePlaceholderDataUrl('Material Palette');
    logger.warn('[DataPanelService] Using placeholder for material_palette');
  }

  try {
    const climateSvg = generateClimateCardSVG(dna, siteSnapshot);
    const climateDataUrl = svgToDataUrl(climateSvg);
    if (!climateDataUrl || !climateDataUrl.startsWith('data:')) {
      throw new Error('SVG conversion returned invalid result');
    }
    panels.climate_card = climateDataUrl;
    logger.info('[DataPanelService] climate_card generated');
  } catch (err) {
    logger.error('[DataPanelService] climate_card failed:', err.message);
    panels.climate_card = generatePlaceholderDataUrl('Climate Card');
    logger.warn('[DataPanelService] Using placeholder for climate_card');
  }

  try {
    const schedulesSvg = generateSchedulesNotesSVG(dna, siteSnapshot);
    const schedulesDataUrl = svgToDataUrl(schedulesSvg);
    if (!schedulesDataUrl || !schedulesDataUrl.startsWith('data:')) {
      throw new Error('SVG conversion returned invalid result');
    }
    panels.schedules_notes = schedulesDataUrl;
    logger.info('[DataPanelService] schedules_notes generated');
  } catch (err) {
    logger.error('[DataPanelService] schedules_notes failed:', err.message);
    panels.schedules_notes = generatePlaceholderDataUrl('Schedules & Notes');
    logger.warn('[DataPanelService] Using placeholder for schedules_notes');
  }

  try {
    const titleSvg = generateTitleBlockSVG(dna, siteSnapshot);
    const titleDataUrl = svgToDataUrl(titleSvg);
    if (!titleDataUrl || !titleDataUrl.startsWith('data:')) {
      throw new Error('SVG conversion returned invalid result');
    }
    panels.title_block = titleDataUrl;
    logger.info('[DataPanelService] title_block generated');
  } catch (err) {
    logger.error('[DataPanelService] title_block failed:', err.message);
    panels.title_block = generatePlaceholderDataUrl('Project Info');
    logger.warn('[DataPanelService] Using placeholder for title_block');
  }

  logger.info('[DataPanelService] All data panels generated', {
    panelCount: Object.keys(panels).length,
  });

  return panels;
}

/**
 * Generate a placeholder SVG for failed panels
 * @param {string} label - Panel label
 * @returns {string} Data URL
 */
function generatePlaceholderDataUrl(label) {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <rect x="0" y="0" width="400" height="400" fill="#f5f5f5" />
  <rect x="20" y="20" width="360" height="360" fill="none" stroke="#cccccc" stroke-width="2" stroke-dasharray="10,5" />
  <text x="200" y="180" font-family="Arial, sans-serif" font-size="14" fill="#999999" text-anchor="middle">${label}</text>
  <text x="200" y="210" font-family="Arial, sans-serif" font-size="12" fill="#bbbbbb" text-anchor="middle">Generation Failed</text>
</svg>`;
  return svgToDataUrl(svg);
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  generateSiteDiagramSVG,
  generateMaterialPaletteSVG,
  generateClimateCardSVG,
  generateSchedulesNotesSVG,
  generateTitleBlockSVG,
  generateDataPanels,
  svgToDataUrl,
};

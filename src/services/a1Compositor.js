/**
 * A1 Sheet Compositor Service
 *
 * Composites individual panels into a professional A1 architectural sheet
 * with annotations, labels, and UK RIBA title block.
 *
 * Uses HTML Canvas for high-quality rendering and compositing.
 */

import { A1_DIMENSIONS, PANEL_DEFINITIONS } from './a1TemplateGenerator';

/**
 * Create a canvas element (browser environment)
 */
function createCanvas(width, height) {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  } else {
    // For Node.js environment (if needed for server-side rendering)
    // Would require canvas package: npm install canvas
    throw new Error('Canvas creation requires browser environment');
  }
}

/**
 * Load image from URL with retry and error handling
 */
function loadImage(url, retries = 3) {
  return new Promise((resolve, reject) => {
    const attemptLoad = (remainingRetries) => {
      const img = new Image();

      // Try with CORS first
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        console.log(`✅ Image loaded successfully: ${url.substring(0, 50)}...`);
        resolve(img);
      };

      img.onerror = (error) => {
        console.warn(`⚠️ Image load failed (${remainingRetries} retries left): ${url.substring(0, 50)}...`);

        if (remainingRetries > 0) {
          // Retry after delay
          setTimeout(() => {
            attemptLoad(remainingRetries - 1);
          }, 1000);
        } else {
          // All retries exhausted
          reject(new Error(`Failed to load image after ${retries} attempts: ${url}`));
        }
      };

      // Set source to trigger load
      img.src = url;
    };

    attemptLoad(retries);
  });
}

/**
 * Draw panel border and label
 */
function drawPanelDecoration(ctx, panel, options = {}) {
  const {
    borderColor = '#333333',
    borderWidth = 2,
    labelFont = '14px Arial, sans-serif',
    labelColor = '#333333',
    backgroundColor = 'rgba(255, 255, 255, 0.05)'
  } = options;

  // Draw subtle background
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(panel.x, panel.y, panel.width, panel.height);

  // Draw border
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = borderWidth;
  ctx.strokeRect(panel.x, panel.y, panel.width, panel.height);

  // Draw label background
  const labelHeight = 30;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fillRect(panel.x, panel.y, panel.width, labelHeight);

  // Draw label text
  ctx.fillStyle = labelColor;
  ctx.font = labelFont;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(panel.name, panel.x + panel.width / 2, panel.y + labelHeight / 2);

  // Draw subtle drop shadow for depth
  ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.strokeRect(panel.x, panel.y, panel.width, panel.height);
  ctx.shadowColor = 'transparent';
}

/**
 * Draw UK RIBA title block
 */
function drawTitleBlock(ctx, x, y, width, height, projectData = {}) {
  const {
    projectName = 'Architectural Design Project',
    clientName = 'Client Name',
    location = 'Location',
    date = new Date().toLocaleDateString('en-GB'),
    scale = 'As Shown',
    drawingNumber = 'A1-001',
    revision = 'A',
    architect = 'AI Architect Studio',
    arbNumber = 'ARB 123456',
    status = 'PLANNING',
    seed = '000000'
  } = projectData;

  // Background for title block
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, width, height);

  // Border
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);

  // Internal grid lines
  const col1 = x + width * 0.4;
  const col2 = x + width * 0.7;
  const row1 = y + height * 0.3;
  const row2 = y + height * 0.6;

  ctx.strokeStyle = '#666666';
  ctx.lineWidth = 1;

  // Vertical lines
  ctx.beginPath();
  ctx.moveTo(col1, y);
  ctx.lineTo(col1, y + height);
  ctx.moveTo(col2, y);
  ctx.lineTo(col2, y + height);
  ctx.stroke();

  // Horizontal lines
  ctx.beginPath();
  ctx.moveTo(x, row1);
  ctx.lineTo(x + width, row1);
  ctx.moveTo(x, row2);
  ctx.lineTo(x + width, row2);
  ctx.stroke();

  // Text styling
  const padding = 10;

  // Project Name (Large, Bold)
  ctx.font = 'bold 24px Arial, sans-serif';
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(projectName.toUpperCase(), x + padding, y + padding);

  // Location
  ctx.font = '16px Arial, sans-serif';
  ctx.fillText(location, x + padding, y + padding + 30);

  // Client
  ctx.font = '14px Arial, sans-serif';
  ctx.fillText(`Client: ${clientName}`, x + padding, row1 + padding);

  // Drawing info (middle column)
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText(`Drawing No: ${drawingNumber}`, col1 + padding, y + padding);
  ctx.fillText(`Date: ${date}`, col1 + padding, y + padding + 20);
  ctx.fillText(`Scale: ${scale}`, col1 + padding, y + padding + 40);
  ctx.fillText(`Rev: ${revision}`, col1 + padding, row1 + padding);
  ctx.fillText(`Status: ${status}`, col1 + padding, row1 + padding + 20);

  // Architect info (right column)
  ctx.font = 'bold 14px Arial, sans-serif';
  ctx.fillText(architect, col2 + padding, y + padding);
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText(`ARB: ${arbNumber}`, col2 + padding, y + padding + 20);
  ctx.fillText(`Seed: ${seed}`, col2 + padding, row1 + padding);

  // Copyright notice
  ctx.font = '10px Arial, sans-serif';
  ctx.fillStyle = '#666666';
  ctx.textAlign = 'center';
  ctx.fillText('Generated by AI Architect Platform', x + width / 2, y + height - padding);
}

/**
 * Draw placeholder for failed panels
 */
function drawPlaceholderPanel(ctx, panel) {
  // Light gray background
  ctx.fillStyle = '#f0f0f0';
  ctx.fillRect(panel.x, panel.y, panel.width, panel.height);

  // Dashed border
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(panel.x, panel.y, panel.width, panel.height);
  ctx.setLineDash([]);  // Reset to solid line

  // Placeholder text
  ctx.fillStyle = '#999999';
  ctx.font = '18px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Panel Generation Failed', panel.x + panel.width / 2, panel.y + panel.height / 2 - 20);

  ctx.font = '14px Arial, sans-serif';
  ctx.fillText(`(${panel.name})`, panel.x + panel.width / 2, panel.y + panel.height / 2 + 10);
  ctx.fillText('Will retry in next iteration', panel.x + panel.width / 2, panel.y + panel.height / 2 + 30);
}

/**
 * Add professional annotations and overlays
 */
function addAnnotations(ctx, width, height, options = {}) {
  const {
    showGrid = true,
    showNorthArrow = true,
    showScale = true,
    showWatermark = false
  } = options;

  // Grid references (A-E horizontal, 1-5 vertical)
  if (showGrid) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.lineWidth = 0.5;
    ctx.font = '10px Arial, sans-serif';
    ctx.fillStyle = '#666666';
    ctx.textAlign = 'center';

    const gridCols = 5;
    const gridRows = 5;
    const margin = 40;

    // Draw grid labels
    for (let i = 0; i < gridCols; i++) {
      const x = margin + (i * (width - 2 * margin) / gridCols);
      const letter = String.fromCharCode(65 + i);  // A, B, C, D, E

      // Top labels
      ctx.fillText(letter, x + (width - 2 * margin) / gridCols / 2, 20);
      // Bottom labels
      ctx.fillText(letter, x + (width - 2 * margin) / gridCols / 2, height - 10);
    }

    for (let i = 0; i < gridRows; i++) {
      const y = margin + (i * (height - 2 * margin) / gridRows);
      const number = (i + 1).toString();

      // Left labels
      ctx.textAlign = 'right';
      ctx.fillText(number, 25, y + (height - 2 * margin) / gridRows / 2);
      // Right labels
      ctx.textAlign = 'left';
      ctx.fillText(number, width - 25, y + (height - 2 * margin) / gridRows / 2);
    }
  }

  // North arrow (top right corner)
  if (showNorthArrow) {
    const arrowX = width - 100;
    const arrowY = 50;
    const arrowSize = 30;

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#000000';

    // Arrow line
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY + arrowSize);
    ctx.lineTo(arrowX, arrowY - arrowSize);
    ctx.stroke();

    // Arrow head
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY - arrowSize);
    ctx.lineTo(arrowX - 5, arrowY - arrowSize + 10);
    ctx.lineTo(arrowX + 5, arrowY - arrowSize + 10);
    ctx.closePath();
    ctx.fill();

    // N label
    ctx.font = 'bold 16px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', arrowX, arrowY - arrowSize - 10);
  }

  // Scale bar (bottom left)
  if (showScale) {
    const scaleX = 50;
    const scaleY = height - 100;
    const scaleWidth = 200;

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.fillStyle = '#000000';

    // Scale bar
    ctx.strokeRect(scaleX, scaleY, scaleWidth, 10);

    // Alternating fill pattern
    for (let i = 0; i < 4; i++) {
      if (i % 2 === 0) {
        ctx.fillRect(scaleX + i * 50, scaleY, 50, 10);
      }
    }

    // Scale labels
    ctx.font = '12px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('0', scaleX, scaleY + 25);
    ctx.fillText('10m', scaleX + 100, scaleY + 25);
    ctx.fillText('20m', scaleX + 200, scaleY + 25);
    ctx.fillText('Scale 1:100', scaleX + 100, scaleY - 10);
  }

  // Watermark (optional)
  if (showWatermark) {
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.font = 'bold 48px Arial, sans-serif';
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.translate(width / 2, height / 2);
    ctx.rotate(-Math.PI / 6);  // -30 degrees
    ctx.fillText('AI GENERATED - DRAFT', 0, 0);
    ctx.restore();
  }
}

/**
 * Main composite function
 */
export async function compositeA1Sheet(options = {}) {
  console.log('🎨 Starting A1 sheet compositing...');

  const {
    panels = [],
    layout,
    masterDNA,
    locationData,
    projectContext,
    format = 'canvas',
    includeAnnotations = true,
    includeTitleBlock = true,
    resolution = 'working'  // 'print', 'high', 'medium', 'low', 'working'
  } = options;

  try {
    // Get sheet dimensions
    const sheetDimensions = A1_DIMENSIONS[resolution];
    const width = sheetDimensions.width;
    const height = sheetDimensions.height;

    console.log(`📐 Creating canvas: ${width}×${height}px`);

    // Create canvas
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Set background
    ctx.fillStyle = '#f5f5f0';  // Light beige architectural paper color
    ctx.fillRect(0, 0, width, height);

    // Draw each panel
    console.log(`🖼️  Compositing ${panels.length} panels...`);

    for (const panelData of panels) {
      if (!panelData || panelData.failed) {
        // Find panel config from layout
        const panelConfig = layout.panels.find(p => p.id === panelData.id);
        if (panelConfig) {
          console.log(`⚠️  Drawing placeholder for failed panel: ${panelData.id}`);
          drawPlaceholderPanel(ctx, panelConfig);
        }
        continue;
      }

      // Find panel layout info
      const panelLayout = layout.panels.find(p => p.id === panelData.id);
      if (!panelLayout) {
        console.warn(`Panel layout not found for: ${panelData.id}`);
        continue;
      }

      try {
        // Load panel image
        console.log(`Loading panel: ${panelData.id}`);
        const img = await loadImage(panelData.url);

        // Draw panel decoration first (border and label)
        drawPanelDecoration(ctx, panelLayout);

        // Calculate scaling to fit panel area (accounting for label)
        const labelHeight = 30;
        const panelContentY = panelLayout.y + labelHeight;
        const panelContentHeight = panelLayout.height - labelHeight;

        const scaleX = panelLayout.width / img.width;
        const scaleY = panelContentHeight / img.height;
        const scale = Math.min(scaleX, scaleY);  // Maintain aspect ratio

        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;

        // Center image in panel
        const offsetX = panelLayout.x + (panelLayout.width - scaledWidth) / 2;
        const offsetY = panelContentY + (panelContentHeight - scaledHeight) / 2;

        // Draw panel image
        ctx.drawImage(
          img,
          offsetX,
          offsetY,
          scaledWidth,
          scaledHeight
        );

        console.log(`✅ Panel ${panelData.id} composited`);

      } catch (error) {
        console.error(`Failed to load panel ${panelData.id}:`, error);
        // Draw placeholder instead
        drawPlaceholderPanel(ctx, panelLayout);
      }
    }

    // Add title block
    if (includeTitleBlock) {
      console.log('📋 Adding UK RIBA title block...');

      const titleBlockHeight = height * 0.08;  // 8% of sheet height
      const titleBlockY = height - titleBlockHeight - 20;

      drawTitleBlock(
        ctx,
        20,
        titleBlockY,
        width - 40,
        titleBlockHeight,
        {
          projectName: projectContext?.projectName || 'Architectural Design',
          clientName: projectContext?.clientName || 'Private Client',
          location: locationData?.address || 'United Kingdom',
          drawingNumber: `A1-${Date.now().toString().slice(-6)}`,
          architect: 'AI Architect Platform',
          arbNumber: 'AI-ARCH-2024',
          status: 'CONCEPT DESIGN',
          seed: masterDNA?.seed || panels[0]?.seed || '000000'
        }
      );
    }

    // Add annotations
    if (includeAnnotations) {
      console.log('✏️  Adding professional annotations...');
      addAnnotations(ctx, width, height, {
        showGrid: true,
        showNorthArrow: true,
        showScale: true,
        showWatermark: false  // Set to true for draft versions
      });
    }

    // Convert to data URL
    const dataUrl = canvas.toDataURL('image/png', 0.95);  // High quality PNG

    console.log('✅ A1 sheet compositing complete');

    return {
      url: dataUrl,
      width,
      height,
      format: 'png',
      metadata: {
        resolution,
        panelsComposited: panels.filter(p => !p.failed).length,
        panelsFailed: panels.filter(p => p.failed).length,
        totalPanels: panels.length,
        timestamp: new Date().toISOString(),
        aspectRatio: (width / height).toFixed(3)
      }
    };

  } catch (error) {
    console.error('❌ A1 sheet compositing failed:', error);
    throw error;
  }
}

/**
 * Export A1 sheet as downloadable file
 */
export function exportA1Sheet(dataUrl, filename = 'a1-sheet.png') {
  // Create download link
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

/**
 * Generate PDF version of A1 sheet (requires additional library)
 */
export async function generatePDFVersion(compositedSheet, options = {}) {
  // This would require a PDF library like jsPDF
  // Implementation placeholder for future enhancement
  console.log('PDF generation not yet implemented');
  return null;
}
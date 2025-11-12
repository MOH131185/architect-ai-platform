/**
 * Text Overlay Service
 *
 * Adds clear, readable text overlays to A1 sheets to ensure critical information
 * is always legible, regardless of AI-generated text quality
 */

/**
 * Font configuration for overlays
 */
const FONTS = {
  title: 'bold 48px Arial, sans-serif',
  sectionLabel: 'bold 32px Arial, sans-serif',
  dimension: 'bold 24px Arial, sans-serif',
  roomLabel: 'bold 28px Arial, sans-serif',
  metadata: 'bold 20px Arial, sans-serif',
  small: 'bold 18px Arial, sans-serif'
};

const COLORS = {
  text: '#000000',       // Black text
  background: '#FFFFFF', // White background
  border: '#CCCCCC',     // Light gray border
  dimension: '#FF0000',  // Red for dimension annotations
  highlight: '#0066CC'   // Blue for important notes
};

/**
 * Add text with background box for maximum contrast and readability
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} text - Text to render
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {Object} options - { font, color, bgColor, padding, align }
 */
function drawTextWithBackground(ctx, text, x, y, options = {}) {
  const {
    font = FONTS.metadata,
    color = COLORS.text,
    bgColor = COLORS.background,
    padding = 8,
    align = 'left',
    maxWidth = null
  } = options;

  ctx.font = font;
  ctx.textBaseline = 'top';

  const metrics = ctx.measureText(text);
  const textWidth = maxWidth ? Math.min(metrics.width, maxWidth) : metrics.width;
  const textHeight = parseInt(font.match(/(\d+)px/)[1]) * 1.2; // Approximate height

  let bgX = x - padding;
  if (align === 'center') bgX = x - textWidth / 2 - padding;
  if (align === 'right') bgX = x - textWidth - padding;

  const bgY = y - padding;
  const bgWidth = textWidth + padding * 2;
  const bgHeight = textHeight + padding * 2;

  // Draw white background with border
  ctx.fillStyle = bgColor;
  ctx.fillRect(bgX, bgY, bgWidth, bgHeight);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(bgX, bgY, bgWidth, bgHeight);

  // Draw text
  ctx.fillStyle = color;
  ctx.textAlign = align;
  if (maxWidth) {
    // Handle text wrapping if maxWidth specified
    const words = text.split(' ');
    let line = '';
    let lineY = y;
    for (let word of words) {
      const testLine = line + word + ' ';
      const testWidth = ctx.measureText(testLine).width;
      if (testWidth > maxWidth && line !== '') {
        ctx.fillText(line, x, lineY);
        line = word + ' ';
        lineY += textHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, lineY);
  } else {
    ctx.fillText(text, x, y);
  }
}

/**
 * Add title block overlay with project metadata
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {Object} projectMeta - Project metadata
 */
function overlayTitleBlock(ctx, width, height, projectMeta = {}) {
  const {
    projectName = 'Architectural Design',
    architectName = 'ArchiAI Solutions Ltd',
    clientName = 'Private Client',
    drawingNumber = 'GA-01',
    date = new Date().toLocaleDateString('en-GB'),
    scale = '1:100',
    revision = 'A'
  } = projectMeta;

  // Title block position (bottom right)
  const blockWidth = 400;
  const blockHeight = 180;
  const x = width - blockWidth - 20;
  const y = height - blockHeight - 20;

  // Draw title block background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(x, y, blockWidth, blockHeight);
  ctx.strokeStyle = COLORS.text;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, blockWidth, blockHeight);

  // Draw content
  let currentY = y + 15;

  // Project name (large)
  ctx.font = FONTS.title;
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'left';
  ctx.fillText(projectName, x + 10, currentY);
  currentY += 55;

  // Metadata rows
  ctx.font = FONTS.metadata;
  const rows = [
    `Architect: ${architectName}`,
    `Client: ${clientName}`,
    `Drawing: ${drawingNumber}  Scale: ${scale}  Rev: ${revision}`,
    `Date: ${date}`
  ];

  rows.forEach(row => {
    ctx.fillText(row, x + 10, currentY);
    currentY += 28;
  });
}

/**
 * Add dimension annotation overlay
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} label - Dimension label (e.g., "15.25m")
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {string} orientation - 'horizontal' or 'vertical'
 */
function overlayDimension(ctx, label, x, y, orientation = 'horizontal') {
  drawTextWithBackground(ctx, label, x, y, {
    font: FONTS.dimension,
    color: COLORS.dimension,
    bgColor: 'rgba(255, 255, 255, 0.9)',
    padding: 6,
    align: 'center'
  });
}

/**
 * Add room label overlay
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} roomName - Room name
 * @param {string} area - Room area (e.g., "25.5m²")
 * @param {number} x - X position (center of room)
 * @param {number} y - Y position (center of room)
 */
function overlayRoomLabel(ctx, roomName, area, x, y) {
  // Room name
  drawTextWithBackground(ctx, roomName.toUpperCase(), x, y - 20, {
    font: FONTS.roomLabel,
    color: COLORS.text,
    bgColor: 'rgba(255, 255, 255, 0.95)',
    padding: 8,
    align: 'center'
  });

  // Room area
  if (area) {
    drawTextWithBackground(ctx, area, x, y + 20, {
      font: FONTS.small,
      color: COLORS.text,
      bgColor: 'rgba(255, 255, 255, 0.95)',
      padding: 6,
      align: 'center'
    });
  }
}

/**
 * Add section label overlay
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} label - Section label (e.g., "GROUND FLOOR PLAN")
 * @param {number} x - X position
 * @param {number} y - Y position
 */
function overlaySectionLabel(ctx, label, x, y) {
  drawTextWithBackground(ctx, label, x, y, {
    font: FONTS.sectionLabel,
    color: COLORS.text,
    bgColor: COLORS.background,
    padding: 10,
    align: 'left'
  });
}

/**
 * Add scale indicator overlay
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {string} scale - Scale (e.g., "1:100")
 * @param {number} x - X position
 * @param {number} y - Y position
 */
function overlayScale(ctx, scale, x, y) {
  drawTextWithBackground(ctx, `SCALE: ${scale}`, x, y, {
    font: FONTS.metadata,
    color: COLORS.text,
    bgColor: 'rgba(255, 255, 255, 0.9)',
    padding: 6,
    align: 'left'
  });
}

/**
 * Comprehensive overlay for A1 sheet with all critical labels
 * @param {string} imageUrl - URL or base64 of the A1 sheet
 * @param {Object} masterDNA - Master Design DNA
 * @param {Object} projectMeta - Project metadata
 * @returns {Promise<string>} Base64 data URL with overlays
 */
export async function overlayA1SheetLabels(imageUrl, masterDNA = {}, projectMeta = {}) {
  console.log('🏷️  [Text Overlay Service] Adding critical text overlays to A1 sheet...');

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');

        // Draw original image
        ctx.drawImage(img, 0, 0);

        const width = canvas.width;
        const height = canvas.height;

        console.log(`   📐 Image dimensions: ${width}×${height}px`);

        // Add title block (bottom right)
        overlayTitleBlock(ctx, width, height, {
          projectName: projectMeta.name || `${masterDNA.architecturalStyle || 'Contemporary'} Design`,
          architectName: projectMeta.architect || 'ArchiAI Solutions Ltd',
          clientName: projectMeta.client || 'Private Client',
          drawingNumber: projectMeta.drawingNumber || 'GA-01',
          date: projectMeta.date || new Date().toLocaleDateString('en-GB'),
          scale: projectMeta.scale || '1:100',
          revision: projectMeta.revision || 'A'
        });

        // Add section labels (estimated positions for standard A1 layout)
        // These positions are approximate and based on typical A1 sheet layouts
        const labelPositions = [
          { label: 'GROUND FLOOR PLAN', x: width * 0.08, y: height * 0.30 },
          { label: 'NORTH ELEVATION', x: width * 0.08, y: height * 0.55 },
          { label: 'SOUTH ELEVATION', x: width * 0.42, y: height * 0.55 },
          { label: 'SECTION A-A', x: width * 0.08, y: height * 0.75 }
        ];

        labelPositions.forEach(pos => {
          overlaySectionLabel(ctx, pos.label, pos.x, pos.y);
        });

        // Add building dimensions (if available in DNA)
        if (masterDNA.dimensions) {
          const dims = masterDNA.dimensions;
          const dimText = `${dims.length || 15}m × ${dims.width || 10}m × ${dims.height || 7}m`;

          // Add dimension annotation near title block
          overlayDimension(
            ctx,
            `Building: ${dimText}`,
            width - 220,
            height - 220,
            'horizontal'
          );
        }

        // Add scale indicators
        const scalePositions = [
          { x: width * 0.08, y: height * 0.52 },  // Below ground floor plan
          { x: width * 0.08, y: height * 0.72 },  // Below elevations
          { x: width * 0.08, y: height * 0.92 }   // Below sections
        ];

        scalePositions.forEach(pos => {
          overlayScale(ctx, '1:100', pos.x, pos.y);
        });

        const overlayedDataUrl = canvas.toDataURL('image/png', 1.0);

        console.log('✅ [Text Overlay Service] Text overlays added successfully');
        console.log(`   🏷️  Title block: Added`);
        console.log(`   🏷️  Section labels: ${labelPositions.length} added`);
        console.log(`   🏷️  Scale indicators: ${scalePositions.length} added`);
        if (masterDNA.dimensions) console.log(`   🏷️  Dimension annotation: Added`);

        resolve(overlayedDataUrl);
      } catch (error) {
        console.error('❌ [Text Overlay Service] Failed to add overlays:', error);
        reject(error);
      }
    };

    img.onerror = (error) => {
      console.error('❌ [Text Overlay Service] Failed to load image:', error);
      reject(new Error('Failed to load image for text overlay'));
    };

    img.src = imageUrl;
  });
}

/**
 * Add custom text annotation at specific position
 * @param {string} imageUrl - URL or base64 of the image
 * @param {string} text - Text to add
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {Object} options - Font, color, background options
 * @returns {Promise<string>} Base64 data URL with annotation
 */
export async function addTextAnnotation(imageUrl, text, x, y, options = {}) {
  console.log(`🏷️  [Text Overlay Service] Adding text annotation: "${text}"...`);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');

        ctx.drawImage(img, 0, 0);

        drawTextWithBackground(ctx, text, x, y, {
          font: options.font || FONTS.metadata,
          color: options.color || COLORS.text,
          bgColor: options.bgColor || 'rgba(255, 255, 255, 0.95)',
          padding: options.padding || 8,
          align: options.align || 'left',
          maxWidth: options.maxWidth || null
        });

        const annotatedDataUrl = canvas.toDataURL('image/png', 1.0);

        console.log('✅ [Text Overlay Service] Text annotation added');
        resolve(annotatedDataUrl);
      } catch (error) {
        console.error('❌ [Text Overlay Service] Failed to add annotation:', error);
        reject(error);
      }
    };

    img.onerror = (error) => {
      console.error('❌ [Text Overlay Service] Failed to load image:', error);
      reject(new Error('Failed to load image for annotation'));
    };

    img.src = imageUrl;
  });
}

export default {
  overlayA1SheetLabels,
  addTextAnnotation,
  FONTS,
  COLORS
};

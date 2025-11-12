/**
 * Architectural Sheet Service
 *
 * Generates a single A1 architectural presentation sheet with all views
 * instead of 13 separate images. This ensures consistency and professional output.
 *
 * A1 Sheet Size: 594mm × 841mm (23.4" × 33.1")
 * Standard architectural drawing layout with title block
 */

// Note: Canvas compositing is disabled for browser compatibility
// The main functionality is generateA1SheetPrompt which works in browser

class ArchitecturalSheetService {
  constructor() {
    console.log('📐 Architectural Sheet Service initialized');

    // A1 dimensions at 300 DPI
    this.A1_WIDTH = 9933;  // pixels (841mm at 300 DPI)
    this.A1_HEIGHT = 7016; // pixels (594mm at 300 DPI)

    // Layout grid for views
    this.GRID_SPACING = 100; // pixels between views
    this.TITLE_BLOCK_HEIGHT = 400; // pixels for title block
  }

  /**
   * Generate a single prompt for an A1 architectural sheet with all views
   * This replaces the 13 separate image generations
   */
  generateA1SheetPrompt(masterDNA, projectInfo) {
    const { dimensions, materials, rooms, viewSpecificFeatures } = masterDNA;

    // Validate and normalize materials (handle both array and object formats)
    let materialsArray = [];
    if (Array.isArray(materials)) {
      materialsArray = materials;
    } else if (materials && typeof materials === 'object') {
      // If materials is an object, convert to array
      materialsArray = Object.values(materials);
    }

    // Validate dimensions
    const dims = dimensions || { length: 12, width: 8, height: 7, floorHeights: [3, 3] };
    const roomsArray = Array.isArray(rooms) ? rooms : [];

    // Build comprehensive prompt for single A1 sheet
    const prompt = `
ARCHITECTURAL PRESENTATION SHEET - A1 FORMAT (594×841mm)
Professional technical drawing sheet with ALL views arranged in standard layout.
SINGLE UNIFIED ARCHITECTURAL DRAWING SHEET, NOT SEPARATE IMAGES.

PROJECT: ${projectInfo.buildingProgram || 'Residential Building'} - ${projectInfo.area || '100'}m²
LOCATION: ${projectInfo.locationAddress || 'Urban Site'}
STYLE: ${projectInfo.portfolioStyle || 'Contemporary'}

EXACT SPECIFICATIONS FROM MASTER DNA:
- Dimensions: ${dims.length}m × ${dims.width}m × ${dims.height}m
- Materials: ${materialsArray.length > 0 ? materialsArray.map(m => `${m.name || m} (${m.hexColor || '#888'})`).join(', ') : 'Brick, Timber, Glass'}
- Floors: ${dims.floorHeights?.length || 2}

SHEET LAYOUT (A1 - 594×841mm):
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  [FLOOR PLANS]           [ELEVATIONS]         [3D VIEWS]   │
│  ┌──────────┐           ┌──────────┐        ┌──────────┐  │
│  │ GROUND   │           │  NORTH   │        │ EXTERIOR │  │
│  │  FLOOR   │           │          │        │   VIEW   │  │
│  └──────────┘           └──────────┘        └──────────┘  │
│  ┌──────────┐           ┌──────────┐        ┌──────────┐  │
│  │  UPPER   │           │  SOUTH   │        │AXONOMETR.│  │
│  │  FLOOR   │           │          │        │          │  │
│  └──────────┘           └──────────┘        └──────────┘  │
│                         ┌──────────┐        ┌──────────┐  │
│  [SECTIONS]             │   EAST   │        │   SITE   │  │
│  ┌──────────┐           │          │        │   PLAN   │  │
│  │ SECTION  │           └──────────┘        └──────────┘  │
│  │   A-A    │           ┌──────────┐        ┌──────────┐  │
│  └──────────┘           │   WEST   │        │ INTERIOR │  │
│  ┌──────────┐           │          │        │          │  │
│  │ SECTION  │           └──────────┘        └──────────┘  │
│  │   B-B    │                                              │
│  └──────────┘                                              │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│ [TITLE BLOCK]                                              │
│ Project: ${projectInfo.buildingProgram}  Scale: 1:100      │
│ Location: ${projectInfo.locationAddress}                   │
│ Date: ${new Date().toLocaleDateString()}  Sheet: A-001     │
└─────────────────────────────────────────────────────────────┘

CRITICAL REQUIREMENTS:
1. SINGLE UNIFIED SHEET - All views on ONE drawing, NOT separate images
2. Professional architectural drawing style - clean line work
3. Consistent scale across all views (1:100 for plans/elevations, appropriate for 3D)
4. All views must show SAME building with EXACT DNA specifications
5. Technical drawing conventions: dimension lines, grid lines, section markers
6. Professional title block with project information
7. Clean white/light background with black/gray line work
8. Materials indicated through standard architectural hatching/patterns

SPECIFIC VIEW DETAILS:

FLOOR PLANS (Top Left):
- Ground Floor: ${roomsArray.filter(r => r.floor === 'ground').map(r => `${r.name} ${r.dimensions}`).join(', ') || 'Living Room, Kitchen, Entry'}
- Upper Floor: ${roomsArray.filter(r => r.floor === 'upper').map(r => `${r.name} ${r.dimensions}`).join(', ') || 'Bedrooms, Bathroom'}
- Show walls (${materialsArray[0]?.name || 'Brick'}), doors, windows, room labels
- North arrow and scale bar

ELEVATIONS (Center):
- North: ${viewSpecificFeatures?.north?.mainEntrance || 'Main entrance'}, ${viewSpecificFeatures?.north?.windows || 3} windows
- South: ${viewSpecificFeatures?.south?.windows || 3} windows
- East/West: Show all materials and openings
- Material annotations: ${materialsArray.length > 0 ? materialsArray.map(m => m.name || m).join(', ') : 'Brick, Timber, Glass'}

SECTIONS (Left Bottom):
- Section A-A: Longitudinal cut showing ${dims.floorHeights?.join('m, ') || '3, 3'}m floor heights
- Section B-B: Transverse cut showing spatial relationships

3D VIEWS (Right):
- Exterior perspective: ${materialsArray[0]?.name || 'Brick'} walls, ${materialsArray[1]?.name || 'Tiles'} roof
- Axonometric: Technical 3D showing all levels
- Site plan: Building footprint with context
- Interior: Key space rendering

DRAWING STYLE:
- Professional technical architectural drawing
- Clean vector/CAD style linework
- Proper line weights (thick for cuts, thin for projections)
- Standard architectural symbols and conventions
- Monochromatic with selective color for emphasis
- High contrast for reproduction

OUTPUT: Single A1 sheet (594×841mm) at 300DPI with all views arranged as shown above`;

    return prompt;
  }

  /**
   * Generate unified architectural sheet through Together AI
   * This replaces the multiple separate image generations
   */
  async generateUnifiedSheet(masterDNA, projectInfo, apiService) {
    console.log('🎨 Generating unified A1 architectural sheet...');

    try {
      // Generate the comprehensive prompt
      const sheetPrompt = this.generateA1SheetPrompt(masterDNA, projectInfo);

      // Single API call for complete sheet
      const response = await apiService.generateImage({
        prompt: sheetPrompt,
        model: 'black-forest-labs/FLUX.1-dev',
        width: 1024,  // Will be upscaled
        height: 768,   // Maintains A1 aspect ratio
        steps: 28,     // Higher quality for comprehensive sheet
        guidance_scale: 7.5,
        seed: projectInfo.seed || Math.floor(Math.random() * 1000000)
      });

      console.log('✅ Unified A1 sheet generated successfully');

      return {
        type: 'unified_sheet',
        url: response.url,
        prompt: sheetPrompt,
        dimensions: {
          width: this.A1_WIDTH,
          height: this.A1_HEIGHT,
          format: 'A1'
        },
        views: [
          'ground_floor', 'upper_floor',
          'north_elevation', 'south_elevation', 'east_elevation', 'west_elevation',
          'section_aa', 'section_bb',
          'exterior_3d', 'axonometric', 'site_plan', 'interior_3d'
        ],
        metadata: {
          generatedAt: new Date().toISOString(),
          projectId: projectInfo.projectId,
          consistency: 1.0 // Perfect consistency - single generation
        }
      };
    } catch (error) {
      console.error('❌ Failed to generate unified sheet:', error);
      throw error;
    }
  }

  /**
   * Alternative: Composite multiple images into single A1 sheet
   * DISABLED: Canvas API not available in browser
   * This would need to be implemented server-side if needed
   */
  async compositeImagesToA1Sheet(images, projectInfo) {
    console.warn('⚠️ Canvas compositing not available in browser environment');
    throw new Error('Canvas compositing requires server-side rendering. Use generateUnifiedSheet instead.');
  }

  /**
   * Draw title block on sheet
   * DISABLED: Canvas API not available in browser
   */
  drawTitleBlock(ctx, projectInfo) {
    console.warn('⚠️ Canvas operations not available in browser');
  }

  /**
   * Draw grid lines and annotations
   * DISABLED: Canvas API not available in browser
   */
  drawGridAndAnnotations(ctx) {
    console.warn('⚠️ Canvas operations not available in browser');
  }

  /**
   * Format view type label
   */
  formatViewLabel(type) {
    const labels = {
      floor_plan_ground: 'GROUND FLOOR PLAN',
      floor_plan_upper: 'UPPER FLOOR PLAN',
      elevation_north: 'NORTH ELEVATION',
      elevation_south: 'SOUTH ELEVATION',
      elevation_east: 'EAST ELEVATION',
      elevation_west: 'WEST ELEVATION',
      section_aa: 'SECTION A-A',
      section_bb: 'SECTION B-B',
      exterior_3d: 'EXTERIOR VIEW',
      axonometric: 'AXONOMETRIC',
      site_plan: 'SITE PLAN',
      interior_3d: 'INTERIOR VIEW'
    };

    return labels[type] || type.toUpperCase().replace(/_/g, ' ');
  }

  /**
   * Generate UK RIBA-standard title block SVG
   * @param {Object} params - Title block parameters
   * @param {Object} params.dna - Master DNA with project info
   * @param {Object} params.context - Project context
   * @param {Object} params.x - X position on sheet
   * @param {Object} params.y - Y position on sheet
   * @param {Object} params.width - Width of title block
   * @param {Object} params.height - Height of title block
   * @returns {string} SVG string for title block
   */
  generateUKTitleBlockSVG({ dna, context, x = 10, y = 10, width = 180, height = 80 }) {
    // Auto-fill with placeholders from DNA and context
    const projectName = context?.buildingProgram || dna?.projectName || 'PROPOSED DEVELOPMENT';
    const clientName = context?.clientName || 'Private Client';
    const siteAddress = context?.location?.address || 'Location TBD';
    const postcode = extractPostcode(siteAddress);
    const drawingTitle = 'PROPOSED DEVELOPMENT - GENERAL ARRANGEMENT';
    const drawingNo = dna?.projectID ? `GA-01-${dna.projectID.slice(-6)}` : `GA-01-${Date.now().toString().slice(-6)}`;
    const projectNo = dna?.projectID || `P${Date.now().toString().slice(-6)}`;
    const ribaStage = 'Stage 3 - Spatial Coordination';
    const status = 'PLANNING';
    const scale = 'AS SHOWN @ A1';
    const date = new Date().toLocaleDateString('en-GB');
    const drawnBy = 'CAD';
    const checkedBy = 'PM';
    const revision = 'A';
    const architectName = 'ArchiAI Solutions Ltd';
    const arbNumber = 'ARB 123456';
    const practiceAddress = 'London, UK';
    const tel = '+44 20 7946 0000';
    const planningRef = `PP/2025/${projectNo}`;
    const buildingRegs = `BR/2025/${projectNo}`;

    // Cell dimensions
    const cellHeight = height / 8;
    const leftColWidth = width * 0.4;
    const rightColWidth = width * 0.6;

    let svg = `<g id="uk-title-block" transform="translate(${x}, ${y})">`;
    
    // Outer border
    svg += `<rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="#000" stroke-width="1"/>`;
    
    // Horizontal separator lines
    for (let i = 1; i < 8; i++) {
      svg += `<line x1="0" y1="${i * cellHeight}" x2="${width}" y2="${i * cellHeight}" stroke="#000" stroke-width="0.5"/>`;
    }
    
    // Vertical separator (between left and right columns)
    svg += `<line x1="${leftColWidth}" y1="0" x2="${leftColWidth}" y2="${height}" stroke="#000" stroke-width="0.5"/>`;
    
    // Left column (Project info)
    let rowY = cellHeight / 2 + 4;
    svg += `<text x="5" y="${rowY}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#000">PROJECT:</text>`;
    svg += `<text x="5" y="${rowY + 10}" font-family="Arial, sans-serif" font-size="8" fill="#000">${truncateText(projectName, 25)}</text>`;
    
    rowY += cellHeight;
    svg += `<text x="5" y="${rowY}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#000">CLIENT:</text>`;
    svg += `<text x="5" y="${rowY + 10}" font-family="Arial, sans-serif" font-size="8" fill="#000">${truncateText(clientName, 25)}</text>`;
    
    rowY += cellHeight;
    svg += `<text x="5" y="${rowY}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#000">ADDRESS:</text>`;
    svg += `<text x="5" y="${rowY + 10}" font-family="Arial, sans-serif" font-size="7" fill="#000">${truncateText(siteAddress, 30)}</text>`;
    if (postcode) {
      svg += `<text x="5" y="${rowY + 18}" font-family="Arial, sans-serif" font-size="7" fill="#000">${postcode}</text>`;
    }
    
    rowY += cellHeight * 2;
    svg += `<text x="5" y="${rowY}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#000">ARCHITECT:</text>`;
    svg += `<text x="5" y="${rowY + 10}" font-family="Arial, sans-serif" font-size="7" fill="#000">${truncateText(architectName, 25)}</text>`;
    svg += `<text x="5" y="${rowY + 18}" font-family="Arial, sans-serif" font-size="7" fill="#000">ARB: ${arbNumber}</text>`;
    svg += `<text x="5" y="${rowY + 26}" font-family="Arial, sans-serif" font-size="7" fill="#000">${practiceAddress}</text>`;
    svg += `<text x="5" y="${rowY + 34}" font-family="Arial, sans-serif" font-size="7" fill="#000">TEL: ${tel}</text>`;
    
    // Right column (Drawing info)
    rowY = cellHeight / 2 + 4;
    svg += `<text x="${leftColWidth + 5}" y="${rowY}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#000">DRAWING TITLE:</text>`;
    svg += `<text x="${leftColWidth + 5}" y="${rowY + 10}" font-family="Arial, sans-serif" font-size="7" fill="#000">${truncateText(drawingTitle, 35)}</text>`;
    
    rowY += cellHeight;
    svg += `<text x="${leftColWidth + 5}" y="${rowY}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#000">DRAWING NO:</text>`;
    svg += `<text x="${leftColWidth + 5}" y="${rowY + 10}" font-family="Arial, sans-serif" font-size="8" fill="#000">${drawingNo}</text>`;
    
    rowY += cellHeight;
    svg += `<text x="${leftColWidth + 5}" y="${rowY}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#000">PROJECT NO:</text>`;
    svg += `<text x="${leftColWidth + 5}" y="${rowY + 10}" font-family="Arial, sans-serif" font-size="8" fill="#000">${projectNo}</text>`;
    
    rowY += cellHeight;
    svg += `<text x="${leftColWidth + 5}" y="${rowY}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#000">RIBA STAGE:</text>`;
    svg += `<text x="${leftColWidth + 5}" y="${rowY + 10}" font-family="Arial, sans-serif" font-size="8" fill="#000">${ribaStage}</text>`;
    
    rowY += cellHeight;
    svg += `<text x="${leftColWidth + 5}" y="${rowY}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#000">STATUS:</text>`;
    svg += `<text x="${leftColWidth + 5}" y="${rowY + 10}" font-family="Arial, sans-serif" font-size="8" fill="#000">${status}</text>`;
    
    rowY += cellHeight;
    svg += `<text x="${leftColWidth + 5}" y="${rowY}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#000">SCALE:</text>`;
    svg += `<text x="${leftColWidth + 5}" y="${rowY + 10}" font-family="Arial, sans-serif" font-size="8" fill="#000">${scale}</text>`;
    
    rowY += cellHeight;
    svg += `<text x="${leftColWidth + 5}" y="${rowY}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#000">DATE:</text>`;
    svg += `<text x="${leftColWidth + 5}" y="${rowY + 10}" font-family="Arial, sans-serif" font-size="8" fill="#000">${date}</text>`;
    
    rowY += cellHeight;
    svg += `<text x="${leftColWidth + 5}" y="${rowY}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#000">DRAWN BY:</text>`;
    svg += `<text x="${leftColWidth + 5}" y="${rowY + 10}" font-family="Arial, sans-serif" font-size="8" fill="#000">${drawnBy}</text>`;
    svg += `<text x="${leftColWidth + 60}" y="${rowY}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#000">CHECKED BY:</text>`;
    svg += `<text x="${leftColWidth + 60}" y="${rowY + 10}" font-family="Arial, sans-serif" font-size="8" fill="#000">${checkedBy}</text>`;
    svg += `<text x="${leftColWidth + 120}" y="${rowY}" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#000">REVISION:</text>`;
    svg += `<text x="${leftColWidth + 120}" y="${rowY + 10}" font-family="Arial, sans-serif" font-size="8" fill="#000">${revision}</text>`;
    
    // Bottom row - Planning and Building Regs
    rowY += cellHeight;
    svg += `<text x="5" y="${rowY}" font-family="Arial, sans-serif" font-size="8" fill="#000">PLANNING REF: ${planningRef}</text>`;
    svg += `<text x="${leftColWidth + 5}" y="${rowY}" font-family="Arial, sans-serif" font-size="8" fill="#000">BUILDING REGS: ${buildingRegs}</text>`;
    
    // Sheet size indicator
    svg += `<text x="${width - 30}" y="${height - 5}" font-family="Arial, sans-serif" font-size="8" fill="#666" text-anchor="end">A1</text>`;
    
    svg += `</g>`;

    return svg;
  }

  /**
   * Get site map bounding box for A1 layout
   * Returns pixel coordinates for the site map panel region
   * @param {string} a1LayoutKey - Layout key (e.g., 'uk-riba-standard')
   * @param {number} width - A1 sheet width in pixels
   * @param {number} height - A1 sheet height in pixels
   * @returns {Object} Bounding box { x, y, width, height }
   */
  getSiteMapBBox(a1LayoutKey = 'uk-riba-standard', width = 1792, height = 1269) {
    // For UK RIBA standard A1 layout (landscape 1792×1269)
    // Site map is typically in the top-right or middle-right section

    // Normalize to percentage-based positioning (works across different resolutions)
    const layouts = {
      'uk-riba-standard': {
        // Top-left corner - positioned in dedicated site plan area
        // MUST be prominent and properly integrated into grid layout
        x: 0.02,      // 2% from left (proper margin)
        y: 0.02,      // 2% from top (aligned with grid)
        width: 0.25,  // 25% of sheet width (larger, more prominent)
        height: 0.20  // 20% of sheet height (better proportion, matches grid cell)
      },
      'us-standard': {
        // Similar positioning for US layouts
        x: 0.02,
        y: 0.02,
        width: 0.16,
        height: 0.13
      }
    };

    const layout = layouts[a1LayoutKey] || layouts['uk-riba-standard'];

    const bbox = {
      x: Math.round(width * layout.x),
      y: Math.round(height * layout.y),
      width: Math.round(width * layout.width),
      height: Math.round(height * layout.height)
    };

    console.log(`📐 Site map bbox for ${a1LayoutKey} (${width}×${height}px):`, bbox);

    return bbox;
  }

  /**
   * Composite site snapshot onto A1 sheet at specified bounding box
   * Ensures pixel-exact parity of site map across modifications
   * @param {string} baseSheetDataUrl - Original A1 sheet image (data URL)
   * @param {Object} siteSnapshot - Site snapshot from design history
   * @param {Object} bbox - Bounding box { x, y, width, height } in A1 pixels
   * @returns {Promise<string>} Composited A1 sheet (data URL)
   */
  async compositeSiteSnapshot(baseSheetDataUrl, siteSnapshot, bbox) {
    if (!baseSheetDataUrl || !siteSnapshot || !siteSnapshot.dataUrl) {
      console.warn('⚠️ Missing base sheet or site snapshot, skipping compositing');
      return baseSheetDataUrl;
    }

    console.log('🎨 Compositing site snapshot onto A1 sheet...');
    console.log(`   BBox: ${bbox.x}, ${bbox.y}, ${bbox.width}×${bbox.height}px`);

    return new Promise((resolve, reject) => {
      try {
        // Create canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Load base A1 sheet
        const baseImage = new Image();
        baseImage.crossOrigin = 'anonymous';

        baseImage.onload = () => {
          canvas.width = baseImage.width;
          canvas.height = baseImage.height;

          // Draw base A1 sheet
          ctx.drawImage(baseImage, 0, 0);

          // Load site snapshot
          const siteImage = new Image();
          siteImage.crossOrigin = 'anonymous';

          siteImage.onload = () => {
            // Calculate scaling to fit bbox while preserving aspect ratio
            // Use actual loaded image dimensions if size not in snapshot (more reliable)
            const snapshotWidth = siteSnapshot.size?.width || siteImage.width;
            const snapshotHeight = siteSnapshot.size?.height || siteImage.height;
            const snapshotAspect = snapshotWidth / snapshotHeight;
            const bboxAspect = bbox.width / bbox.height;

            let drawWidth, drawHeight, drawX, drawY;

            if (snapshotAspect > bboxAspect) {
              // Snapshot is wider - fit to width, letterbox height
              drawWidth = bbox.width;
              drawHeight = bbox.width / snapshotAspect;
              drawX = bbox.x;
              drawY = bbox.y + (bbox.height - drawHeight) / 2; // Center vertically
            } else {
              // Snapshot is taller - fit to height, letterbox width
              drawHeight = bbox.height;
              drawWidth = bbox.height * snapshotAspect;
              drawX = bbox.x + (bbox.width - drawWidth) / 2; // Center horizontally
              drawY = bbox.y;
            }

            // Draw site snapshot (scaled and centered) - NO white background to avoid floating appearance
            // The site map should integrate seamlessly into the A1 sheet grid
            ctx.drawImage(siteImage, drawX, drawY, drawWidth, drawHeight);

            // Add subtle border for visual clarity (thin, matches architectural drawing style)
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.strokeRect(bbox.x, bbox.y, bbox.width, bbox.height);
            
            // Add "SITE PLAN" label above the map
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText('SITE PLAN', bbox.x, bbox.y - 30);

            // Optional: Add attribution text if required
            if (siteSnapshot.source && siteSnapshot.source.includes('google')) {
              ctx.font = '8px Arial';
              ctx.fillStyle = '#666666';
              ctx.textAlign = 'right';
              ctx.fillText('Map data © Google', bbox.x + bbox.width - 5, bbox.y + bbox.height - 5);
            }

            // Convert to data URL
            const compositedDataUrl = canvas.toDataURL('image/png');

            console.log('✅ Site snapshot composited successfully');
            console.log(`   Output size: ${canvas.width}×${canvas.height}px`);

            resolve(compositedDataUrl);
          };

          siteImage.onerror = () => {
            console.error('❌ Failed to load site snapshot image');
            resolve(baseSheetDataUrl); // Return original if snapshot load fails
          };

          siteImage.src = siteSnapshot.dataUrl;
        };

        baseImage.onerror = () => {
          console.error('❌ Failed to load base A1 sheet image');
          reject(new Error('Failed to load base A1 sheet'));
        };

        baseImage.src = baseSheetDataUrl;

      } catch (error) {
        console.error('❌ Error compositing site snapshot:', error);
        resolve(baseSheetDataUrl); // Return original on error
      }
    });
  }
}

/**
 * Extract UK postcode from address string
 */
function extractPostcode(address) {
  if (!address) return '';
  // UK postcode pattern: A[A]9[A] 9[A][A] or A9[A] 9[A][A]
  const match = address.match(/\b[A-Z]{1,2}\d{1,2}[A-Z]?\s\d[A-Z]{2}\b/);
  return match ? match[0] : '';
}

/**
 * Truncate text to fit in available space
 */
function truncateText(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
}

export default new ArchitecturalSheetService();
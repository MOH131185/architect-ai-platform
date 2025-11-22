/**
 * A1 Validation Service
 *
 * Consolidated A1 sheet validation and export service.
 * Merges functionality from:
 * - a1SheetValidator.js (Completeness and quality validation)
 * - a1SheetConsistencyValidator.js (Drift detection)
 * - a1PDFExportService.js (PDF export)
 *
 * Provides unified API for:
 * - A1 sheet validation (structure, quality, completeness)
 * - Consistency validation (drift detection)
 * - Export to PDF, PNG, SVG
 *
 * @module services/a1/A1ValidationService
 */

import logger from '../../utils/logger.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const DRIFT_THRESHOLD = 0.25;
const CONSISTENCY_THRESHOLD = 0.92;

const REQUIRED_SECTIONS = [
  'LOCATION PLAN',
  'SITE PLAN',
  'GROUND FLOOR PLAN',
  'ELEVATION',
  'SECTION',
  '3D VIEW',
  'MATERIAL PALETTE',
  'TITLE BLOCK',
  'PROJECT DATA'
];

const A1_TEMPLATE_SPEC = {
  mandatory: [
    {
      id: 'site-context',
      name: 'Site Context / Location Plan',
      keywords: ['SITE PLAN', 'LOCATION PLAN', 'SITE CONTEXT'],
      position: 'top-left'
    },
    {
      id: 'ground-floor-plan',
      name: 'Ground Floor Plan',
      keywords: ['GROUND FLOOR PLAN', 'GROUND FLOOR', 'GF PLAN'],
      position: 'row-2-left'
    },
    {
      id: 'elevations',
      name: 'Elevations (minimum 2, ideally 4)',
      keywords: ['ELEVATION', 'NORTH ELEVATION', 'SOUTH ELEVATION', 'EAST ELEVATION', 'WEST ELEVATION'],
      minCount: 2,
      idealCount: 4
    },
    {
      id: 'sections',
      name: 'Building Sections (minimum 1, ideally 2)',
      keywords: ['SECTION', 'SECTION A-A', 'SECTION B-B', 'LONGITUDINAL', 'TRANSVERSE'],
      minCount: 1,
      idealCount: 2
    },
    {
      id: '3d-exterior',
      name: '3D Exterior View',
      keywords: ['3D VIEW', 'EXTERIOR', 'PERSPECTIVE', 'AXONOMETRIC'],
      minCount: 1
    },
    {
      id: 'material-palette',
      name: 'Material Palette',
      keywords: ['MATERIAL PALETTE', 'MATERIALS', 'SPECIFICATIONS']
    },
    {
      id: 'title-block',
      name: 'UK RIBA Title Block',
      keywords: ['TITLE BLOCK', 'PROJECT INFORMATION', 'DRAWING INFORMATION']
    }
  ],
  recommended: [
    {
      id: 'upper-floor-plan',
      name: 'Upper Floor Plan(s)',
      keywords: ['FIRST FLOOR', 'UPPER FLOOR', 'SECOND FLOOR']
    },
    {
      id: 'interior-view',
      name: 'Interior Perspective',
      keywords: ['INTERIOR', 'INTERIOR VIEW', 'INTERIOR PERSPECTIVE']
    },
    {
      id: 'technical-details',
      name: 'Technical Details',
      keywords: ['TECHNICAL', 'DETAILS', 'CONSTRUCTION']
    }
  ]
};

const REQUIRED_TITLE_BLOCK_FIELDS = [
  'PROJECT',
  'ARCHITECT',
  'DRAWING NO',
  'SCALE',
  'DATE',
  'RIBA STAGE'
];

// ============================================================================
// MAIN VALIDATION API
// ============================================================================

/**
 * Validate complete A1 sheet result
 *
 * @param {Object} a1Result - A1 sheet generation result
 * @param {Object} masterDNA - Master Design DNA used for generation
 * @param {Object} blendedStyle - Blended style with color palette
 * @returns {Object} { valid: boolean, score: number, issues: [], warnings: [], suggestions: [] }
 */
export function validateA1Sheet(a1Result, masterDNA, blendedStyle = null) {
  logger.info('🔍 Starting A1 sheet validation...');

  const validation = {
    valid: true,
    score: 100,
    issues: [],
    warnings: [],
    suggestions: [],
    checks: {}
  };

  // Check 1: Result structure
  validation.checks.structure = validateStructure(a1Result);
  if (!validation.checks.structure.passed) {
    validation.valid = false;
    validation.score -= 30;
    validation.issues.push(...validation.checks.structure.issues);
  }

  // Check 2: Image quality
  if (a1Result.url) {
    validation.checks.imageQuality = validateImageQuality(a1Result);
    if (!validation.checks.imageQuality.passed) {
      validation.score -= 20;
      validation.warnings.push(...validation.checks.imageQuality.warnings);
    }
  }

  // Check 3: Section completeness
  validation.checks.sections = validateSections(a1Result);
  if (!validation.checks.sections.passed) {
    validation.score -= 30;
    validation.issues.push(...validation.checks.sections.issues);
    validation.suggestions.push(...validation.checks.sections.suggestions);
  }

  // Check 4: Title block
  validation.checks.titleBlock = validateTitleBlock(a1Result);
  if (!validation.checks.titleBlock.passed) {
    validation.score -= 10;
    validation.warnings.push(...validation.checks.titleBlock.warnings);
  }

  // Check 5: Material consistency (if blendedStyle provided)
  if (blendedStyle && masterDNA) {
    validation.checks.materials = validateMaterialConsistency(a1Result, masterDNA, blendedStyle);
    if (!validation.checks.materials.passed) {
      validation.score -= 10;
      validation.warnings.push(...validation.checks.materials.warnings);
    }
  }

  // Final determination
  validation.valid = validation.score >= 70;

  logger.info(`✅ Validation complete`, {
    valid: validation.valid,
    score: validation.score,
    issues: validation.issues.length,
    warnings: validation.warnings.length
  });

  return validation;
}

/**
 * Validate consistency between original and modified sheets
 *
 * @param {Object} originalSheet - Original A1 sheet
 * @param {Object} modifiedSheet - Modified A1 sheet
 * @param {number} threshold - Consistency threshold (default: 0.92)
 * @returns {Object} { consistent: boolean, score: number, issues: [], warnings: [] }
 */
export function validateConsistency(originalSheet, modifiedSheet, threshold = CONSISTENCY_THRESHOLD) {
  logger.info('🔍 Validating consistency between sheets...');

  const consistency = {
    consistent: true,
    score: 1.0,
    issues: [],
    warnings: []
  };

  if (!originalSheet || !modifiedSheet) {
    consistency.consistent = false;
    consistency.score = 0;
    consistency.issues.push('Missing sheet for comparison');
    return consistency;
  }

  // Compare dimensions
  const originalDNA = originalSheet.masterDNA || {};
  const modifiedDNA = modifiedSheet.masterDNA || {};

  const driftDetection = detectDrift(originalDNA, modifiedDNA);

  consistency.score = driftDetection.stabilityScore;
  consistency.consistent = consistency.score >= threshold;
  consistency.issues = driftDetection.errors;
  consistency.warnings = driftDetection.warnings;
  consistency.driftRatio = driftDetection.driftRatio;
  consistency.missingPanels = driftDetection.missingPanels;

  logger.info(`✅ Consistency validation complete`, {
    consistent: consistency.consistent,
    score: consistency.score.toFixed(2),
    issues: consistency.issues.length
  });

  return consistency;
}

/**
 * Detect drift between two DNA versions
 *
 * @param {Object} previousDNA - Previous design DNA
 * @param {Object} newDNA - New design DNA
 * @returns {Object} { errors: [], warnings: [], driftRatio: number, stabilityScore: number }
 */
export function detectDrift(previousDNA, newDNA) {
  const errors = [];
  const warnings = [];
  let penalty = 0;

  // 1. Material drift
  if (previousDNA?.materialDesc !== newDNA?.materialDesc) {
    errors.push('Material palette drifted: building materials changed');
    penalty += 0.3;
  }

  // 2. Dimension drift
  const prevFootprint = previousDNA?.dimensions?.footprint;
  const newFootprint = newDNA?.dimensions?.footprint;
  if (prevFootprint !== newFootprint) {
    errors.push('Footprint changed — geometry drift detected');
    penalty += 0.3;
  }

  // 3. Window/facade drift
  if (JSON.stringify(previousDNA?.facade) !== JSON.stringify(newDNA?.facade)) {
    warnings.push('Window/facade positions changed unexpectedly');
    penalty += 0.1;
  }

  // 4. Height/roof drift
  if (previousDNA?.dimensions?.height !== newDNA?.dimensions?.height) {
    errors.push('Building height changed — disallowed');
    penalty += 0.25;
  }

  // 5. Layout drift (mandatory panels)
  const mandatory = [
    'sitePlan', 'hero3D', 'materialPanel',
    'groundPlan', 'firstPlan', 'axo',
    'northElev', 'southElev', 'eastElev', 'westElev',
    'sectionAA', 'sectionBB',
    'projectData', 'environment', 'titleBlock'
  ];

  const missingPanels = [];
  const newPanels = newDNA?.panels || [];
  for (const panel of mandatory) {
    if (!newPanels.includes(panel)) {
      missingPanels.push(panel);
      errors.push(`Mandatory panel missing: ${panel}`);
    }
  }
  if (missingPanels.length) {
    penalty += 0.2;
  }

  const driftRatio = Math.min(1, penalty);
  const stabilityScore = Math.max(0, 1 - driftRatio);

  return {
    errors,
    warnings,
    driftRatio,
    stabilityScore,
    score: stabilityScore,
    missingPanels
  };
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate A1 result structure
 * @private
 */
function validateStructure(a1Result) {
  const issues = [];

  if (!a1Result) {
    issues.push('A1 result is null or undefined');
    return { passed: false, issues };
  }

  if (!a1Result.url && !a1Result.html) {
    issues.push('No URL or HTML content in A1 result');
  }

  if (!a1Result.metadata) {
    issues.push('Missing metadata in A1 result');
  }

  return {
    passed: issues.length === 0,
    issues
  };
}

/**
 * Validate image quality
 * @private
 */
function validateImageQuality(a1Result) {
  const warnings = [];

  // Check if URL is data URL (base64)
  if (a1Result.url && a1Result.url.startsWith('data:image')) {
    const sizeKB = Math.round(a1Result.url.length / 1024);
    if (sizeKB < 500) {
      warnings.push(`Image size very small (${sizeKB}KB) - may indicate low quality`);
    }
  }

  // Check dimensions if available
  if (a1Result.dimensions) {
    const { width, height } = a1Result.dimensions;
    if (width < 1792 || height < 1269) {
      warnings.push(`Resolution ${width}×${height} below recommended 1792×1269`);
    }
  }

  return {
    passed: warnings.length === 0,
    warnings
  };
}

/**
 * Validate section completeness
 * @private
 */
function validateSections(a1Result) {
  const issues = [];
  const suggestions = [];

  // Check for mandatory sections
  const content = a1Result.html || a1Result.prompt || '';

  for (const section of A1_TEMPLATE_SPEC.mandatory) {
    const hasSection = section.keywords.some(keyword =>
      content.toUpperCase().includes(keyword)
    );

    if (!hasSection) {
      issues.push(`Missing mandatory section: ${section.name}`);
      suggestions.push(`Add ${section.name} to the A1 sheet`);
    }
  }

  return {
    passed: issues.length === 0,
    issues,
    suggestions
  };
}

/**
 * Validate title block
 * @private
 */
function validateTitleBlock(a1Result) {
  const warnings = [];
  const content = a1Result.html || a1Result.prompt || '';

  for (const field of REQUIRED_TITLE_BLOCK_FIELDS) {
    if (!content.toUpperCase().includes(field)) {
      warnings.push(`Title block missing field: ${field}`);
    }
  }

  return {
    passed: warnings.length === 0,
    warnings
  };
}

/**
 * Validate material consistency
 * @private
 */
function validateMaterialConsistency(a1Result, masterDNA, blendedStyle) {
  const warnings = [];

  const dnaMaterials = masterDNA.materials || [];
  const styleMaterials = blendedStyle.materials || [];

  // Check if DNA materials are represented
  for (const material of dnaMaterials) {
    const materialName = material.name.toLowerCase();
    const content = (a1Result.html || a1Result.prompt || '').toLowerCase();

    if (!content.includes(materialName)) {
      warnings.push(`DNA material not found in sheet: ${material.name}`);
    }
  }

  return {
    passed: warnings.length === 0,
    warnings
  };
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

/**
 * Export A1 sheet as PDF
 *
 * @param {Object} options - Export options
 * @param {string} options.imageDataUrl - Image data URL (base64 PNG)
 * @param {number} options.imageWidth - Image width in pixels (default: 9933)
 * @param {number} options.imageHeight - Image height in pixels (default: 7016)
 * @param {string} options.title - PDF title
 * @param {string} options.author - PDF author
 * @param {string} options.subject - PDF subject
 * @param {string} options.fileName - Output file name
 * @returns {Promise<Object>} { success: boolean, pdfBlob: Blob, fileName: string, metadata: {} }
 */
export async function exportToPDF(options = {}) {
  const {
    imageDataUrl,
    imageWidth = 9933,
    imageHeight = 7016,
    title = 'A1 Architectural Sheet',
    author = 'ArchiAI Solutions',
    subject = 'Architectural Presentation',
    fileName = 'a1-sheet-landscape-300dpi.pdf'
  } = options;

  if (!imageDataUrl) {
    throw new Error('imageDataUrl is required for PDF export');
  }

  logger.info('📄 Exporting A1 sheet as PDF...', {
    imageSize: `${imageWidth}×${imageHeight}px`,
    fileName
  });

  try {
    // Lazy load jsPDF
    const jsPDFModule = await import('jspdf');
    const jsPDF = jsPDFModule.jsPDF || jsPDFModule.default;

    // Create A1 landscape PDF (841mm × 594mm)
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a1' // 841×594mm
    });

    logger.info('✅ Created A1 landscape PDF document (841×594mm)');

    // Set PDF metadata
    pdf.setProperties({
      title,
      subject,
      author,
      creator: 'ArchiAI Platform',
      keywords: 'architecture, A1, sheet, landscape, 300dpi'
    });

    // Add image to PDF at full page size
    const pageWidth = 841; // mm
    const pageHeight = 594; // mm

    pdf.addImage(
      imageDataUrl,
      'PNG',
      0, // x position (start at left edge)
      0, // y position (start at top edge)
      pageWidth, // full width
      pageHeight, // full height
      undefined, // alias
      'FAST' // compression (FAST for high quality)
    );

    logger.success('✅ Image embedded in PDF at full page size');

    // Generate PDF blob
    const pdfBlob = pdf.output('blob');
    const sizeMB = (pdfBlob.size / 1024 / 1024).toFixed(2);

    logger.success('✅ PDF generated successfully', {
      sizeKB: (pdfBlob.size / 1024).toFixed(1),
      sizeMB: `${sizeMB}MB`
    });

    return {
      success: true,
      pdfBlob,
      fileName,
      metadata: {
        format: 'A1 landscape PDF',
        dimensions: '841×594mm',
        dpi: 300,
        orientation: 'landscape',
        sizeBytes: pdfBlob.size,
        sizeMB: parseFloat(sizeMB),
        title,
        author,
        subject
      }
    };

  } catch (error) {
    logger.error('❌ PDF export failed', error);

    return {
      success: false,
      error: error.message,
      fileName
    };
  }
}

/**
 * Export A1 sheet as PNG
 *
 * @param {string} dataUrl - Data URL of the sheet
 * @param {Object} metadata - Export metadata
 * @returns {Promise<Object>} { success: boolean, blob: Blob, fileName: string }
 */
export async function exportToPNG(dataUrl, metadata = {}) {
  logger.info('📸 Exporting A1 sheet as PNG...');

  try {
    if (!dataUrl) {
      throw new Error('Data URL is required for PNG export');
    }

    // Convert data URL to blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    const fileName = metadata.fileName || 'a1-sheet.png';
    const sizeMB = (blob.size / 1024 / 1024).toFixed(2);

    logger.success('✅ PNG export successful', {
      sizeKB: (blob.size / 1024).toFixed(1),
      sizeMB: `${sizeMB}MB`
    });

    return {
      success: true,
      blob,
      fileName,
      metadata: {
        format: 'PNG',
        sizeBytes: blob.size,
        sizeMB: parseFloat(sizeMB)
      }
    };

  } catch (error) {
    logger.error('❌ PNG export failed', error);

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Export A1 sheet as SVG
 *
 * @param {string} html - HTML content of the sheet
 * @param {Object} metadata - Export metadata
 * @returns {Promise<Object>} { success: boolean, svg: string, fileName: string }
 */
export async function exportToSVG(html, metadata = {}) {
  logger.info('🖼️ Exporting A1 sheet as SVG...');

  try {
    if (!html) {
      throw new Error('HTML content is required for SVG export');
    }

    // For now, return placeholder (full SVG conversion would require html-to-svg library)
    const fileName = metadata.fileName || 'a1-sheet.svg';

    logger.warn('⚠️ SVG export is a placeholder - full implementation requires html-to-svg library');

    return {
      success: false,
      error: 'SVG export not yet implemented',
      fileName
    };

  } catch (error) {
    logger.error('❌ SVG export failed', error);

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Download file to user's computer
 *
 * @param {Blob} blob - File blob
 * @param {string} fileName - File name
 */
export function downloadFile(blob, fileName) {
  logger.info(`⬇️ Downloading file: ${fileName}`);

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  logger.success(`✅ File download initiated: ${fileName}`);
}

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Alias for backward compatibility
 * @deprecated Use detectDrift instead
 */
export const detectA1Drift = detectDrift;

/**
 * Get required sections list for prompt generation
 * @param {Object} projectContext - Project context with building type, floors, etc.
 * @returns {Array} List of required section specifications
 */
export function getRequiredSections(projectContext = {}) {
  const sections = [...A1_TEMPLATE_SPEC.mandatory];

  // Add recommended sections based on project context
  const floorCount = projectContext?.floors || projectContext?.floorCount || 1;

  if (floorCount > 1) {
    const upperFloorSection = A1_TEMPLATE_SPEC.recommended.find(s => s.id === 'upper-floor-plan');
    if (upperFloorSection) {
      sections.push(upperFloorSection);
    }
  }

  // Always include interior view and environmental for professional sheets
  const interiorSection = A1_TEMPLATE_SPEC.recommended.find(s => s.id === 'interior-view');
  const envSection = A1_TEMPLATE_SPEC.recommended.find(s => s.id === 'environmental');

  if (interiorSection) sections.push(interiorSection);
  if (envSection) sections.push(envSection);

  return sections;
}

/**
 * Validate A1 template completeness by checking prompt against template spec
 * @param {Object} params - Validation parameters
 * @param {string} params.prompt - Generation prompt
 * @param {Object} params.masterDNA - Master DNA
 * @param {Object} params.projectContext - Project context
 * @returns {Object} { valid: boolean, missingMandatory: [], missingRecommended: [], score: number }
 */
export function validateA1TemplateCompleteness({ prompt, masterDNA, projectContext }) {
  logger.info('🔍 Validating A1 template completeness...');

  const validation = {
    valid: true,
    missingMandatory: [],
    missingRecommended: [],
    presentSections: [],
    score: 100,
    details: {}
  };

  const promptUpper = prompt ? prompt.toUpperCase() : '';

  // Check mandatory sections
  for (const section of A1_TEMPLATE_SPEC.mandatory) {
    const found = section.keywords.some(keyword => promptUpper.includes(keyword));

    if (section.minCount) {
      // Count occurrences for sections that need multiple instances
      let count = 0;
      for (const keyword of section.keywords) {
        const regex = new RegExp(keyword, 'gi');
        const matches = prompt ? prompt.match(regex) : null;
        if (matches) count += matches.length;
      }

      validation.details[section.id] = {
        found: count >= section.minCount,
        count: count,
        minCount: section.minCount,
        idealCount: section.idealCount
      };

      if (count >= section.minCount) {
        validation.presentSections.push(section.name);
        if (count < section.idealCount) {
          validation.missingRecommended.push(`${section.name} (has ${count}, ideal ${section.idealCount})`);
          validation.score -= 5;
        }
      } else {
        validation.valid = false;
        validation.missingMandatory.push(section.name);
        validation.score -= 20;
      }
    } else {
      validation.details[section.id] = { found };

      if (found) {
        validation.presentSections.push(section.name);
      } else {
        validation.valid = false;
        validation.missingMandatory.push(section.name);
        validation.score -= 15;
      }
    }
  }

  // Check recommended sections
  for (const section of A1_TEMPLATE_SPEC.recommended) {
    const found = section.keywords.some(keyword => promptUpper.includes(keyword));
    validation.details[section.id] = { found, recommended: true };

    if (found) {
      validation.presentSections.push(section.name);
    } else {
      validation.missingRecommended.push(section.name);
      validation.score -= 3;
    }
  }

  // Additional checks for multi-storey buildings
  const floorCount = masterDNA?.dimensions?.floorCount ||
                     masterDNA?.dimensions?.floors ||
                     projectContext?.floors || 1;

  if (floorCount > 1) {
    const hasUpperFloor = promptUpper.includes('FIRST FLOOR') ||
                         promptUpper.includes('UPPER FLOOR') ||
                         promptUpper.includes('SECOND FLOOR');

    if (!hasUpperFloor) {
      validation.missingRecommended.push('Upper Floor Plan (multi-storey building)');
      validation.score -= 10;
    }
  }

  validation.score = Math.max(0, Math.min(100, validation.score));

  logger.info(`   Template completeness: ${validation.score}%`);
  logger.info(`   Missing mandatory: ${validation.missingMandatory.length}`);
  logger.info(`   Missing recommended: ${validation.missingRecommended.length}`);

  return validation;
}

export default {
  validateA1Sheet,
  validateConsistency,
  validateA1TemplateCompleteness,
  getRequiredSections,
  detectDrift,
  detectA1Drift,
  exportToPDF,
  exportToPNG,
  exportToSVG,
  downloadFile,
  DRIFT_THRESHOLD,
  CONSISTENCY_THRESHOLD,
  REQUIRED_SECTIONS,
  A1_TEMPLATE_SPEC
};

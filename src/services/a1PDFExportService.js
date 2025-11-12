/**
 * A1 PDF Export Service
 *
 * Exports A1 architectural sheets as high-quality PDF documents.
 * Uses jsPDF to create A1 landscape PDFs (841×594mm) at 300 DPI.
 *
 * Features:
 * - Embeds upscaled PNG (9933×7016px) at full resolution
 * - A1 landscape format (841mm × 594mm)
 * - 300 DPI print quality
 * - Metadata embedding (title, author, subject)
 *
 * LOGGING: Uses centralized logger (Opus 4.1 compliant)
 */

import logger from '../utils/logger';

// Lazy load jsPDF to reduce initial bundle size
let jsPDF = null;

/**
 * Initialize jsPDF library
 * @private
 */
async function initJsPDF() {
  if (jsPDF) return jsPDF;

  try {
    const jsPDFModule = await import('jspdf');
    jsPDF = jsPDFModule.jsPDF || jsPDFModule.default;
    logger.info('jsPDF library loaded successfully', null, '📄');
    return jsPDF;
  } catch (error) {
    logger.error('Failed to load jsPDF library', error);
    throw new Error('jsPDF library not available. Install: npm install jspdf');
  }
}

/**
 * Export A1 sheet as PDF
 *
 * @param {Object} options - Export options
 * @param {string} options.imageDataUrl - Image data URL (base64 PNG)
 * @param {number} options.imageWidth - Image width in pixels (default: 9933)
 * @param {number} options.imageHeight - Image height in pixels (default: 7016)
 * @param {string} options.title - PDF title (default: 'A1 Architectural Sheet')
 * @param {string} options.author - PDF author (default: 'ArchiAI Solutions')
 * @param {string} options.subject - PDF subject (default: 'Architectural Presentation')
 * @param {string} options.fileName - Output file name (default: 'a1-sheet-landscape-300dpi.pdf')
 * @returns {Promise<Object>} { success: boolean, pdfBlob: Blob, fileName: string }
 */
export async function exportA1SheetAsPDF(options = {}) {
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
    throw new Error('imageDataUrl is required');
  }

  logger.info('Exporting A1 sheet as PDF', {
    imageSize: `${imageWidth}×${imageHeight}px`,
    fileName
  }, '📄');

  try {
    // Initialize jsPDF
    const PDF = await initJsPDF();

    // Create A1 landscape PDF (841mm × 594mm)
    // jsPDF uses mm as default unit
    const pdf = new PDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a1' // 841×594mm
    });

    logger.info('Created A1 landscape PDF document', {
      dimensions: '841×594mm',
      orientation: 'landscape'
    });

    // Set PDF metadata
    pdf.setProperties({
      title: title,
      subject: subject,
      author: author,
      creator: 'ArchiAI Platform',
      keywords: 'architecture, A1, sheet, landscape, 300dpi'
    });

    // Calculate image dimensions to fit A1 page at 300 DPI
    // A1 at 300 DPI: 9933×7016px
    // A1 size: 841×594mm
    // Image should fill the entire page
    const pageWidth = 841; // mm
    const pageHeight = 594; // mm

    // Add image to PDF at full page size
    // jsPDF.addImage(imageData, format, x, y, width, height)
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

    logger.success('Image embedded in PDF at full page size');

    // Generate PDF blob
    const pdfBlob = pdf.output('blob');

    const sizeMB = (pdfBlob.size / 1024 / 1024).toFixed(2);
    logger.success('PDF generated successfully', {
      sizeKB: (pdfBlob.size / 1024).toFixed(1),
      sizeMB: `${sizeMB}MB`,
      fileName
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
    logger.error('PDF export failed', error);

    return {
      success: false,
      error: error.message,
      pdfBlob: null,
      fileName: null,
      metadata: null
    };
  }
}

/**
 * Download PDF file to user's computer
 *
 * @param {Blob} pdfBlob - PDF blob from exportA1SheetAsPDF
 * @param {string} fileName - File name for download
 */
export function downloadPDF(pdfBlob, fileName = 'a1-sheet-landscape-300dpi.pdf') {
  if (!pdfBlob) {
    throw new Error('pdfBlob is required');
  }

  logger.info('Triggering PDF download', { fileName }, '⬇️');

  try {
    // Create download link
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;

    // Trigger download
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    logger.success('PDF download initiated', { fileName });

  } catch (error) {
    logger.error('PDF download failed', error);
    throw error;
  }
}

/**
 * Export and download A1 sheet as PDF (convenience method)
 *
 * @param {Object} options - Export options (same as exportA1SheetAsPDF)
 * @returns {Promise<Object>} Export result
 */
export async function exportAndDownloadA1PDF(options = {}) {
  const result = await exportA1SheetAsPDF(options);

  if (result.success) {
    downloadPDF(result.pdfBlob, result.fileName);
  }

  return result;
}

/**
 * Upscale image and export as PDF (complete workflow)
 *
 * @param {Object} options - Options
 * @param {string} options.imageUrl - Base resolution image URL
 * @param {string} options.fileName - Output file name
 * @param {string} options.title - PDF title
 * @param {string} options.author - PDF author
 * @returns {Promise<Object>} Result with PDF blob
 */
export async function upscaleAndExportPDF(options = {}) {
  const {
    imageUrl,
    fileName = 'a1-sheet-landscape-300dpi.pdf',
    title = 'A1 Architectural Sheet',
    author = 'ArchiAI Solutions'
  } = options;

  if (!imageUrl) {
    throw new Error('imageUrl is required');
  }

  logger.info('Starting upscale + PDF export workflow', { imageUrl }, '🔄');

  try {
    // Step 1: Upscale image to 300 DPI
    logger.info('Step 1: Upscaling image to 300 DPI', null, '📐');

    const upscaleResponse = await fetch('/api/upscale', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        imageUrl,
        targetWidth: 9933,
        targetHeight: 7016
      })
    });

    if (!upscaleResponse.ok) {
      const error = await upscaleResponse.json();
      throw new Error(error.message || 'Upscaling failed');
    }

    const upscaleResult = await upscaleResponse.json();

    logger.success('Image upscaled successfully', {
      dimensions: `${upscaleResult.width}×${upscaleResult.height}px`,
      sizeMB: upscaleResult.sizeMB
    });

    // Step 2: Export as PDF
    logger.info('Step 2: Exporting as PDF', null, '📄');

    const pdfResult = await exportA1SheetAsPDF({
      imageDataUrl: upscaleResult.dataUrl,
      imageWidth: upscaleResult.width,
      imageHeight: upscaleResult.height,
      title,
      author,
      fileName
    });

    if (!pdfResult.success) {
      throw new Error(pdfResult.error || 'PDF export failed');
    }

    logger.success('Complete workflow finished', {
      upscaledSize: upscaleResult.sizeMB,
      pdfSize: pdfResult.metadata.sizeMB,
      fileName
    }, '✅');

    return {
      success: true,
      upscaleResult,
      pdfResult
    };

  } catch (error) {
    logger.error('Upscale + PDF export workflow failed', error);

    return {
      success: false,
      error: error.message,
      upscaleResult: null,
      pdfResult: null
    };
  }
}

// Export all functions
export default {
  exportA1SheetAsPDF,
  downloadPDF,
  exportAndDownloadA1PDF,
  upscaleAndExportPDF
};

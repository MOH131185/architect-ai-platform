/**
 * Export Service
 * 
 * Centralizes all export-related logic:
 * - A1 sheet export (PNG, PDF, SVG)
 * - CAD/BIM export (DWG, RVT, IFC)
 * - PDF documentation
 * - File download triggering
 * 
 * Server-aware: Can call serverless functions or perform client-side export.
 */

import logger from '../utils/logger.js';

/**
 * Export Service
 */
class ExportService {
  constructor(env = null) {
    this.env = env;
  }
  
  /**
   * Export sheet
   * @param {Object} params - Export parameters
   * @param {SheetResult} params.sheet - Sheet result
   * @param {string} params.format - Format (PNG, PDF, SVG)
   * @param {Object} params.env - Environment adapter
   * @returns {Promise<Object>} Export result { url, filename, format }
   */
  async exportSheet({ sheet, format = 'PNG', env = null }) {
    const effectiveEnv = env || this.env;
    
    logger.info(`Exporting sheet as ${format}`, { sheetId: sheet.metadata?.sheetId }, '📥');
    
    // Determine export method based on environment
    const useServerExport = effectiveEnv?.env?.isProd || format === 'PDF' || format === 'SVG';
    
    if (useServerExport) {
      return this.exportSheetServerSide({ sheet, format, env: effectiveEnv });
    } else {
      return this.exportSheetClientSide({ sheet, format });
    }
  }
  
  /**
   * Export sheet server-side
   * @private
   */
  async exportSheetServerSide({ sheet, format, env }) {
    const apiUrl = env?.api?.urls?.sheet || '/api/sheet';
    
    logger.debug('Using server-side export', { apiUrl, format });
    
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          designId: sheet.metadata?.designId || 'unknown',
          sheetId: sheet.metadata?.sheetId || 'unknown',
          sheetType: sheet.metadata?.sheetType || 'ARCH',
          versionId: sheet.metadata?.versionId || 'base',
          sheetMetadata: sheet.metadata,
          overlays: sheet.metadata?.overlays || [],
          format: format.toLowerCase(),
          imageUrl: sheet.url
        })
      });
      
      if (!response.ok) {
        throw new Error(`Server export failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      logger.success('Server-side export complete', { url: result.url, format });
      
      return {
        success: true,
        url: result.url,
        filename: result.filename || `sheet_${Date.now()}.${format.toLowerCase()}`,
        format,
        checksum: result.checksum || null
      };
    } catch (error) {
      logger.error('Server-side export failed', error);
      
      // Fallback to client-side
      logger.warn('Falling back to client-side export');
      return this.exportSheetClientSide({ sheet, format });
    }
  }
  
  /**
   * Export sheet client-side
   * @private
   */
  async exportSheetClientSide({ sheet, format }) {
    logger.debug('Using client-side export', { format });
    
    try {
      if (format === 'PNG' || format === 'png') {
        return this.exportAsPNG(sheet);
      } else if (format === 'PDF' || format === 'pdf') {
        // Try server-side first, then fail with helpful message
        throw new Error('PDF export requires server-side processing. Please ensure the Express server is running (npm run server).');
      } else if (format === 'SVG' || format === 'svg') {
        throw new Error('SVG export is not supported for AI-generated raster images. Use PNG format instead.');
      } else {
        throw new Error(`Unsupported format: ${format}. Supported formats: PNG, PDF (server-side only)`);
      }
    } catch (error) {
      logger.error('Client-side export failed', error);
      throw error;
    }
  }
  
  /**
   * Export as PNG
   * @private
   */
  async exportAsPNG(sheet) {
    // If sheet.url is already a downloadable URL, use it directly
    if (sheet.url && !sheet.url.startsWith('data:')) {
      const filename = this.generateFilename(sheet, 'png');
      
      // Trigger download
      const link = document.createElement('a');
      link.href = sheet.url;
      link.download = filename;
      link.click();
      
      return {
        success: true,
        url: sheet.url,
        filename,
        format: 'PNG'
      };
    }
    
    // If data URL, convert to blob and download
    if (sheet.url && sheet.url.startsWith('data:')) {
      const blob = await this.dataURLToBlob(sheet.url);
      const url = URL.createObjectURL(blob);
      const filename = this.generateFilename(sheet, 'png');
      
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      
      URL.revokeObjectURL(url);
      
      return {
        success: true,
        url,
        filename,
        format: 'PNG'
      };
    }
    
    throw new Error('No valid image URL for PNG export');
  }
  
  /**
   * Export as PDF
   * @private
   */
  async exportAsPDF(sheet) {
    // PDF export requires server-side processing
    logger.info('Requesting server-side PDF export');
    
    try {
      const response = await fetch('/api/sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          designId: sheet.metadata?.designId || 'unknown',
          sheetId: sheet.metadata?.sheetId || 'unknown',
          sheetType: sheet.metadata?.sheetType || 'ARCH',
          versionId: sheet.metadata?.versionId || 'base',
          sheetMetadata: sheet.metadata,
          overlays: sheet.metadata?.overlays || [],
          format: 'pdf',
          imageUrl: sheet.url
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Server export failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      return {
        success: true,
        url: result.url,
        filename: result.filename,
        format: 'PDF'
      };
    } catch (error) {
      logger.error('PDF export failed', error);
      throw new Error(`PDF export failed: ${error.message}`);
    }
  }
  
  /**
   * Generate deterministic filename
   * @private
   */
  generateFilename(sheet, extension) {
    const designId = sheet.metadata?.designId || 'design';
    const sheetType = sheet.metadata?.sheetType || 'ARCH';
    const versionId = sheet.metadata?.versionId || 'base';
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    return `${designId}_${sheetType}_${versionId}_${timestamp}.${extension}`;
  }
  
  /**
   * Convert data URL to blob
   * @private
   */
  async dataURLToBlob(dataURL) {
    const response = await fetch(dataURL);
    return response.blob();
  }
  
  /**
   * Export CAD file (DWG)
   * @param {Object} params - Parameters
   * @returns {Promise<Object>} Export result
   */
  async exportCAD({ sheet, format = 'DWG', env = null }) {
    const effectiveEnv = env || this.env;
    
    logger.info(`Exporting CAD as ${format}`, null, '📐');
    
    // Generate CAD content
    const content = this.generateCADContent(sheet, format);
    
    // Trigger download
    const blob = new Blob([content], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const filename = this.generateFilename(sheet, format.toLowerCase());
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    
    URL.revokeObjectURL(url);
    
    logger.success('CAD export complete', { filename, format });
    
    return {
      success: true,
      url,
      filename,
      format
    };
  }
  
  /**
   * Export BIM file (RVT, IFC)
   * @param {Object} params - Parameters
   * @returns {Promise<Object>} Export result
   */
  async exportBIM({ sheet, format = 'IFC', env = null }) {
    const effectiveEnv = env || this.env;
    
    logger.info(`Exporting BIM as ${format}`, null, '🏗️');
    
    // Generate BIM content
    const content = this.generateBIMContent(sheet, format);
    
    // Trigger download
    const blob = new Blob([content], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const filename = this.generateFilename(sheet, format.toLowerCase());
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    
    URL.revokeObjectURL(url);
    
    logger.success('BIM export complete', { filename, format });
    
    return {
      success: true,
      url,
      filename,
      format
    };
  }
  
  /**
   * Generate CAD content
   * @private
   */
  generateCADContent(sheet, format) {
    // Simplified CAD content generation
    // In production, this would generate proper DWG/DXF format
    const dna = sheet.dna || {};
    const dimensions = dna.dimensions || {};
    
    return `AutoCAD DXF Export
Project: ${dna.projectType || 'Building'}
Dimensions: ${dimensions.length}m × ${dimensions.width}m × ${dimensions.height}m
Materials: ${dna.materials?.map(m => m.name).join(', ') || 'N/A'}
Generated: ${new Date().toISOString()}
Seed: ${sheet.seed}

[DXF content would go here]
`;
  }
  
  /**
   * Generate BIM content
   * @private
   */
  generateBIMContent(sheet, format) {
    // Simplified BIM content generation
    // In production, this would generate proper IFC/RVT format
    const dna = sheet.dna || {};
    const dimensions = dna.dimensions || {};
    
    if (format === 'IFC') {
      return `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ArchiAI Export'), '2;1');
FILE_NAME('${this.generateFilename(sheet, 'ifc')}', '${new Date().toISOString()}', ('ArchiAI'), ('ArchiAI Solution'), '4.0', 'ArchiAI Platform', '');
FILE_SCHEMA(('IFC4'));
ENDSEC;

DATA;
/* Building: ${dna.projectType || 'Building'} */
/* Dimensions: ${dimensions.length}m × ${dimensions.width}m × ${dimensions.height}m */
/* Materials: ${dna.materials?.map(m => m.name).join(', ') || 'N/A'} */
ENDSEC;

END-ISO-10303-21;
`;
    }
    
    return `Revit Export
Project: ${dna.projectType || 'Building'}
Dimensions: ${dimensions.length}m × ${dimensions.width}m × ${dimensions.height}m
[RVT content would go here]
`;
  }
}

// Export singleton instance
const exportService = new ExportService();
export default exportService;
export { ExportService };


/**
 * Sheet Export Service
 * 
 * Unified export service for all A1 sheet formats:
 * - SVG (vector)
 * - PNG (raster, 300 DPI)
 * - PDF (via SVG conversion)
 * - DWG/DXF (via BIM service)
 * - RVT/IFC (via BIM service)
 * - XLSX/CSV (cost reports)
 */

import { composeA1SheetSVG, composeA1SheetBitmap, exportSheetArtifact } from './sheetComposer.js';
import bimService from './bimService.js';
import logger from '../utils/logger.js';


class SheetExportService {
  /**
   * Export design in specified format
   * 
   * @param {Object} params - Export parameters
   * @param {string} params.format - Export format (svg, png, pdf, dwg, ifc, xlsx)
   * @param {Object} params.designProject - Complete design project data
   * @param {Object} params.sheetArtifact - Pre-composed sheet artifact (optional)
   * @returns {Promise<Blob|string>} Export result
   */
  async export(params) {
    const { format, designProject, sheetArtifact } = params;

    logger.info(`📤 [SheetExport] Exporting as ${format.toUpperCase()}...`);

    switch (format.toLowerCase()) {
      case 'svg':
        return await this.exportSVG(designProject, sheetArtifact);
      
      case 'png':
        return await this.exportPNG(designProject, sheetArtifact);
      
      case 'pdf':
        return await this.exportPDF(designProject, sheetArtifact);
      
      case 'dwg':
      case 'dxf':
        return await this.exportDWG(designProject, format);
      
      case 'rvt':
        return await this.exportRVT(designProject);
      
      case 'ifc':
        return await this.exportIFC(designProject);
      
      case 'xlsx':
      case 'csv':
        return await this.exportCost(designProject, format);
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Export as SVG
   */
  async exportSVG(designProject, sheetArtifact = null) {
    logger.info('📐 Exporting SVG...');

    // Use existing artifact if available
    if (sheetArtifact && sheetArtifact.type === 'svg' && sheetArtifact.svgContent) {
      logger.info('✅ Using existing SVG artifact');
      return new Blob([sheetArtifact.svgContent], { type: 'image/svg+xml' });
    }

    // Compose new SVG
    const artifact = await composeA1SheetSVG(designProject, {
      designId: designProject.designId,
      seed: designProject.seed,
      geometryFirst: designProject.geometryFirst || false
    });

    return new Blob([artifact.svgContent], { type: 'image/svg+xml' });
  }

  /**
   * Export as PNG
   */
  async exportPNG(designProject, sheetArtifact = null) {
    logger.info('📐 Exporting PNG...');

    // Use existing artifact if available
    if (sheetArtifact && sheetArtifact.url) {
      const response = await fetch(sheetArtifact.url);
      if (response.ok) {
        logger.info('✅ Using existing PNG artifact');
        return await response.blob();
      }
    }

    // If we have FLUX image, use it
    if (designProject.a1SheetUrl) {
      const response = await fetch(designProject.a1SheetUrl);
      if (response.ok) {
        return await response.blob();
      }
    }

    throw new Error('No PNG artifact available. Generate A1 sheet first.');
  }

  /**
   * Export as PDF
   */
  async exportPDF(designProject, sheetArtifact = null) {
    logger.info('📐 Exporting PDF...');

    // PDF requires server-side rendering
    // For now, return SVG and suggest external conversion
    throw new Error('PDF export requires server-side rendering (puppeteer). Export as SVG and convert externally.');
  }

  /**
   * Export as DWG/DXF
   */
  async exportDWG(designProject, format = 'dwg') {
    logger.info(`📐 Exporting ${format.toUpperCase()}...`);

    const { masterDNA, geometry } = designProject;

    if (!geometry && !masterDNA) {
      throw new Error('No geometry or DNA available for CAD export');
    }

    try {
      // Use BIM service to generate DWG/DXF
      const cadContent = await bimService.exportToDWG(geometry || masterDNA, masterDNA);
      return new Blob([cadContent], { type: 'application/x-dwg' });
    } catch (error) {
      console.warn('⚠️  BIM service export failed, using placeholder:', error);
      
      // Fallback: generate placeholder DWG text
      const placeholder = this.generateDWGPlaceholder(masterDNA, designProject);
      return new Blob([placeholder], { type: 'text/plain' });
    }
  }

  /**
   * Export as Revit (RVT)
   */
  async exportRVT(designProject) {
    logger.info('📐 Exporting RVT...');

    const { masterDNA, geometry } = designProject;

    try {
      // Use BIM service to generate RVT
      const rvtContent = await bimService.exportToRVT(geometry || masterDNA, masterDNA);
      return new Blob([rvtContent], { type: 'application/x-rvt' });
    } catch (error) {
      console.warn('⚠️  BIM service RVT export failed, using placeholder:', error);
      
      // Fallback: generate placeholder
      const placeholder = this.generateRVTPlaceholder(masterDNA, designProject);
      return new Blob([placeholder], { type: 'text/plain' });
    }
  }

  /**
   * Export as IFC
   */
  async exportIFC(designProject) {
    logger.info('📐 Exporting IFC...');

    const { masterDNA, geometry } = designProject;

    if (!geometry && !masterDNA) {
      throw new Error('No geometry or DNA available for IFC export');
    }

    try {
      // Use BIM service to generate IFC
      const ifcContent = await bimService.exportToIFC(geometry || masterDNA, masterDNA);
      return new Blob([ifcContent], { type: 'application/x-step' });
    } catch (error) {
      console.warn('⚠️  BIM service IFC export failed, using placeholder:', error);
      
      // Fallback: generate placeholder IFC
      const placeholder = this.generateIFCPlaceholder(masterDNA, designProject);
      return new Blob([placeholder], { type: 'text/plain' });
    }
  }

  /**
   * Export cost report as XLSX/CSV
   */
  async exportCost(designProject, format = 'xlsx') {
    logger.info(`📐 Exporting cost report as ${format.toUpperCase()}...`);

    const { costReport } = designProject;

    if (!costReport) {
      throw new Error('No cost report available. Generate cost estimate first.');
    }

    if (format === 'csv') {
      const csv = this.generateCostCSV(costReport);
      return new Blob([csv], { type: 'text/csv' });
    }

    // XLSX would require a library like xlsx or exceljs
    throw new Error('XLSX export requires additional library. Use CSV format.');
  }

  /**
   * Generate cost report as CSV
   */
  generateCostCSV(costReport) {
    const rows = [
      ['Item', 'Quantity', 'Unit', 'Rate', 'Cost'],
      ['', '', '', '', ''],
      ...Object.entries(costReport.breakdown || {}).map(([item, data]) => [
        item,
        data.quantity || '',
        data.unit || '',
        data.rate || '',
        data.cost || ''
      ]),
      ['', '', '', 'TOTAL', costReport.totalCost || costReport.total || 0]
    ];

    return rows.map(row => row.join(',')).join('\n');
  }

  /**
   * Generate DWG placeholder
   */
  generateDWGPlaceholder(masterDNA, designProject) {
    const dimensions = masterDNA?.dimensions || {};
    return `AutoCAD Drawing File
Project: ${designProject.projectName || 'Architectural Design'}
Generated by ArchitectAI Platform
Date: ${new Date().toLocaleDateString()}

Dimensions: ${dimensions.length || 'N/A'}m × ${dimensions.width || 'N/A'}m × ${dimensions.totalHeight || 'N/A'}m
Floors: ${dimensions.floorCount || 'N/A'}
Style: ${masterDNA?.architecturalStyle || 'Contemporary'}

[Binary DWG data would be here in full implementation]

This is a placeholder. Implement bimService.exportToDWG() for real CAD export.
`;
  }

  /**
   * Generate RVT placeholder
   */
  generateRVTPlaceholder(masterDNA, designProject) {
    return `Revit Project File
Project: ${designProject.projectName || 'Architectural Design'}
Generated by ArchitectAI Platform
Date: ${new Date().toLocaleDateString()}

[Binary RVT data would be here in full implementation]

This is a placeholder. Implement bimService.exportToRVT() for real Revit export.
`;
  }

  /**
   * Generate IFC placeholder
   */
  generateIFCPlaceholder(masterDNA, designProject) {
    const dimensions = masterDNA?.dimensions || {};
    const projectName = designProject.projectName || 'Architectural Design';

    return `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ArchitectAI Generated Model'),'2;1');
FILE_NAME('${projectName.replace(/\s/g, '_')}.ifc','${new Date().toISOString()}',('ArchitectAI'),('AI Architecture Platform'),'IFC4','ArchitectAI Export','');
FILE_SCHEMA(('IFC4'));
ENDSEC;

DATA;
#1=IFCPROJECT('${this.generateGUID()}',$,'${projectName}',$,$,$,$,(#2),#3);
#2=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#4,$);
#3=IFCUNITASSIGNMENT((#5,#6,#7));
#4=IFCAXIS2PLACEMENT3D(#8,$,$);
#5=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);
#6=IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.);
#7=IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.);
#8=IFCCARTESIANPOINT((0.,0.,0.));

/* Building: ${dimensions.length || 0}m × ${dimensions.width || 0}m × ${dimensions.totalHeight || 0}m */
#100=IFCBUILDING('${this.generateGUID()}',$,'${projectName}',$,$,#101,$,$,.ELEMENT.,$,$,$);
#101=IFCLOCALPLACEMENT($,#102);
#102=IFCAXIS2PLACEMENT3D(#103,$,$);
#103=IFCCARTESIANPOINT((0.,0.,0.));

/* Placeholder - Full implementation would include walls, slabs, openings, etc. */

ENDSEC;
END-ISO-10303-21;`;
  }

  /**
   * Generate IFC GUID
   */
  generateGUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// Singleton instance
const sheetExportService = new SheetExportService();

export default sheetExportService;
export { sheetExportService };


/**
 * Sheet Export Service
 *
 * Unified export service for all A1 sheet formats:
 * - SVG (vector)
 * - PNG (raster, 300 DPI)
 * - PDF (via SVG conversion)
 * - DXF (via BIM service)
 * - DWG/RVT/IFC are not faked here; use compiled-project export routes
 * - XLSX/CSV (cost reports)
 */

import {
  composeA1SheetSVG,
  composeA1SheetBitmap,
  exportSheetArtifact,
} from "./sheetComposer.js";
import bimService from "./bimService.js";
import logger from "../utils/logger.js";

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
      case "svg":
        return await this.exportSVG(designProject, sheetArtifact);

      case "png":
        return await this.exportPNG(designProject, sheetArtifact);

      case "pdf":
        return await this.exportPDF(designProject, sheetArtifact);

      case "dwg":
      case "dxf":
        return await this.exportDWG(designProject, format);

      case "rvt":
        return await this.exportRVT();

      case "ifc":
        return await this.exportIFC();

      case "xlsx":
      case "csv":
        return await this.exportCost(designProject, format);

      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Export as SVG
   */
  async exportSVG(designProject, sheetArtifact = null) {
    logger.info("📐 Exporting SVG...");

    // Use existing artifact if available
    if (
      sheetArtifact &&
      sheetArtifact.type === "svg" &&
      sheetArtifact.svgContent
    ) {
      logger.info("✅ Using existing SVG artifact");
      return new Blob([sheetArtifact.svgContent], { type: "image/svg+xml" });
    }

    // Compose new SVG
    const artifact = await composeA1SheetSVG(designProject, {
      designId: designProject.designId,
      seed: designProject.seed,
      geometryFirst: designProject.geometryFirst || false,
    });

    return new Blob([artifact.svgContent], { type: "image/svg+xml" });
  }

  /**
   * Export as PNG
   */
  async exportPNG(designProject, sheetArtifact = null) {
    logger.info("📐 Exporting PNG...");

    // Use existing artifact if available
    if (sheetArtifact && sheetArtifact.url) {
      const response = await fetch(sheetArtifact.url);
      if (response.ok) {
        logger.info("✅ Using existing PNG artifact");
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

    throw new Error("No PNG artifact available. Generate A1 sheet first.");
  }

  /**
   * Export as PDF
   */
  async exportPDF(designProject, sheetArtifact = null) {
    logger.info("📐 Exporting PDF...");

    // PDF requires server-side rendering
    // For now, return SVG and suggest external conversion
    throw new Error(
      "PDF export requires server-side rendering (puppeteer). Export as SVG and convert externally.",
    );
  }

  /**
   * Export as DWG/DXF
   */
  async exportDWG(designProject, format = "dwg") {
    logger.info(`📐 Exporting ${format.toUpperCase()}...`);

    if (String(format).toLowerCase() === "dwg") {
      throw new Error(
        "Native DWG export requires a configured ODA or Autodesk APS conversion provider. Export DXF instead.",
      );
    }

    const { masterDNA, geometry } = designProject;

    if (!geometry && !masterDNA) {
      throw new Error("No geometry or DNA available for CAD export");
    }

    try {
      // Use BIM service to generate DWG/DXF
      const cadContent = await bimService.exportToDWG(
        geometry || masterDNA,
        masterDNA,
      );
      return new Blob([cadContent], { type: "application/x-dwg" });
    } catch (error) {
      console.warn("⚠️  BIM service CAD export failed:", error);
      throw new Error(
        `${format.toUpperCase()} export failed. Placeholder CAD output is disabled; use the compiled-project DXF export path.`,
      );
    }
  }

  /**
   * Export as Revit (RVT)
   */
  async exportRVT() {
    logger.info("📐 Exporting RVT...");

    throw new Error(
      "RVT export requires a real Revit/Autodesk conversion provider. Placeholder RVT output is disabled.",
    );
  }

  /**
   * Export as IFC
   */
  async exportIFC() {
    logger.info("📐 Exporting IFC...");

    throw new Error(
      "IFC export is only available through the compiled-project /api/project/export/ifc path. Placeholder IFC output is disabled.",
    );
  }

  /**
   * Export cost report as XLSX/CSV
   */
  async exportCost(designProject, format = "xlsx") {
    logger.info(`📐 Exporting cost report as ${format.toUpperCase()}...`);

    const { costReport } = designProject;

    if (!costReport) {
      throw new Error(
        "No cost report available. Generate cost estimate first.",
      );
    }

    if (format === "csv") {
      const csv = this.generateCostCSV(costReport);
      return new Blob([csv], { type: "text/csv" });
    }

    // XLSX would require a library like xlsx or exceljs
    throw new Error("XLSX export requires additional library. Use CSV format.");
  }

  /**
   * Generate cost report as CSV
   */
  generateCostCSV(costReport) {
    const rows = [
      ["Item", "Quantity", "Unit", "Rate", "Cost"],
      ["", "", "", "", ""],
      ...Object.entries(costReport.breakdown || {}).map(([item, data]) => [
        item,
        data.quantity || "",
        data.unit || "",
        data.rate || "",
        data.cost || "",
      ]),
      ["", "", "", "TOTAL", costReport.totalCost || costReport.total || 0],
    ];

    return rows.map((row) => row.join(",")).join("\n");
  }
}

// Singleton instance
const sheetExportService = new SheetExportService();

export default sheetExportService;
export { sheetExportService };

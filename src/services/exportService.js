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

import logger from "../utils/logger.js";

/**
 * Export Service
 */
class ExportService {
  constructor(env = null) {
    this.env = env;
  }

  resolveCompiledProject(sheet = {}) {
    return (
      sheet?.compiledProject ||
      sheet?.a1Sheet?.compiledProject ||
      sheet?.metadata?.compiledProject ||
      null
    );
  }

  resolveProjectQuantityTakeoff(sheet = {}) {
    return (
      sheet?.projectQuantityTakeoff ||
      sheet?.a1Sheet?.projectQuantityTakeoff ||
      sheet?.metadata?.projectQuantityTakeoff ||
      null
    );
  }

  resolveSheetArtifactManifest(sheet = {}) {
    return (
      sheet?.sheetArtifactManifest ||
      sheet?.a1Sheet?.sheetArtifactManifest ||
      sheet?.metadata?.sheetArtifactManifest ||
      null
    );
  }

  resolveProjectName(sheet = {}) {
    return (
      sheet?.projectName ||
      sheet?.metadata?.projectName ||
      sheet?.dna?.projectType ||
      "ArchiAI_Project"
    );
  }

  async downloadResponseBlob(response, filename) {
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return url;
  }

  /**
   * Export sheet
   * @param {Object} params - Export parameters
   * @param {SheetResult} params.sheet - Sheet result
   * @param {string} params.format - Format (PNG, PDF, SVG)
   * @param {Object} params.env - Environment adapter
   * @returns {Promise<Object>} Export result { url, filename, format }
   */
  async exportSheet({ sheet, format = "PNG", env = null }) {
    const effectiveEnv = env || this.env;
    const fmt = format.toUpperCase();

    logger.info(
      `Exporting sheet as ${fmt}`,
      { sheetId: sheet.metadata?.sheetId },
      "�x",
    );

    // Route DXF to CAD export path
    if (fmt === "DXF") {
      return this.exportCAD({ sheet, format: "DXF", env: effectiveEnv });
    }

    if (fmt === "JSON") {
      return this.exportJSON({ sheet });
    }

    if (fmt === "IFC" || fmt === "RVT") {
      return this.exportBIM({ sheet, format: fmt, env: effectiveEnv });
    }

    if (fmt === "XLSX" || fmt === "EXCEL") {
      return this.exportWorkbook({ sheet, env: effectiveEnv });
    }

    if (fmt === "GLB") {
      return this.exportGLB({ sheet });
    }

    // Determine export method based on environment
    const useServerExport =
      effectiveEnv?.env?.isProd || fmt === "PDF" || fmt === "SVG";

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
    const apiUrl = env?.api?.urls?.sheet || "/api/sheet";

    logger.debug("Using server-side export", { apiUrl, format });

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designId: sheet.metadata?.designId || "unknown",
          sheetId: sheet.metadata?.sheetId || "unknown",
          sheetType: sheet.metadata?.sheetType || "ARCH",
          versionId: sheet.metadata?.versionId || "base",
          sheetMetadata: sheet.metadata,
          overlays: sheet.metadata?.overlays || [],
          format: format.toLowerCase(),
          imageUrl: sheet.url,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server export failed: ${response.status}`);
      }

      const result = await response.json();

      logger.success("Server-side export complete", {
        url: result.url,
        format,
      });

      return {
        success: true,
        url: result.url,
        filename:
          result.filename || `sheet_${Date.now()}.${format.toLowerCase()}`,
        format,
        checksum: result.checksum || null,
      };
    } catch (error) {
      logger.error("Server-side export failed", error);

      // Fallback to client-side
      logger.warn("Falling back to client-side export");
      return this.exportSheetClientSide({ sheet, format });
    }
  }

  /**
   * Export sheet client-side
   * @private
   */
  async exportSheetClientSide({ sheet, format }) {
    logger.debug("Using client-side export", { format });

    try {
      if (format === "PNG" || format === "png") {
        return this.exportAsPNG(sheet);
      } else if (format === "PDF" || format === "pdf") {
        // Try server-side first, then fail with helpful message
        throw new Error(
          "PDF export requires server-side processing. Please ensure the Express server is running (npm run server).",
        );
      } else if (format === "SVG" || format === "svg") {
        throw new Error(
          "SVG export is not supported for AI-generated raster images. Use PNG format instead.",
        );
      } else {
        throw new Error(
          `Unsupported format: ${format}. Supported formats: PNG, PDF (server-side only)`,
        );
      }
    } catch (error) {
      logger.error("Client-side export failed", error);
      throw error;
    }
  }

  /**
   * Export as PNG
   * @private
   */
  async exportAsPNG(sheet) {
    // If sheet.url is already a downloadable URL, use it directly
    if (sheet.url && !sheet.url.startsWith("data:")) {
      const filename = this.generateFilename(sheet, "png");

      // Trigger download
      const link = document.createElement("a");
      link.href = sheet.url;
      link.download = filename;
      link.click();

      return {
        success: true,
        url: sheet.url,
        filename,
        format: "PNG",
      };
    }

    // If data URL, convert to blob and download
    if (sheet.url && sheet.url.startsWith("data:")) {
      const blob = await this.dataURLToBlob(sheet.url);
      const url = URL.createObjectURL(blob);
      const filename = this.generateFilename(sheet, "png");

      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();

      URL.revokeObjectURL(url);

      return {
        success: true,
        url,
        filename,
        format: "PNG",
      };
    }

    throw new Error("No valid image URL for PNG export");
  }

  /**
   * Export as PDF
   * @private
   */
  async exportAsPDF(sheet) {
    // PDF export requires server-side processing
    logger.info("Requesting server-side PDF export");

    try {
      const response = await fetch("/api/sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          designId: sheet.metadata?.designId || "unknown",
          sheetId: sheet.metadata?.sheetId || "unknown",
          sheetType: sheet.metadata?.sheetType || "ARCH",
          versionId: sheet.metadata?.versionId || "base",
          sheetMetadata: sheet.metadata,
          overlays: sheet.metadata?.overlays || [],
          format: "pdf",
          imageUrl: sheet.url,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message ||
            `Server export failed: ${response.status}`,
        );
      }

      const result = await response.json();

      return {
        success: true,
        url: result.url,
        filename: result.filename,
        format: "PDF",
      };
    } catch (error) {
      logger.error("PDF export failed", error);
      throw new Error(`PDF export failed: ${error.message}`);
    }
  }

  /**
   * Generate deterministic filename
   * @private
   */
  generateFilename(sheet, extension) {
    const designId = sheet.metadata?.designId || "design";
    const sheetType = sheet.metadata?.sheetType || "ARCH";
    const versionId = sheet.metadata?.versionId || "base";
    const timestamp = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

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
   * Export CAD file (DXF via server API, or fallback DWG stub)
   * @param {Object} params - Parameters
   * @returns {Promise<Object>} Export result
   */
  async exportCAD({ sheet, format = "DXF", env = null }) {
    logger.info(`Exporting CAD as ${format}`, null, "📐");

    if (format === "DXF" || format === "dxf") {
      return this.exportDXF(sheet);
    }

    // Fallback for other formats
    const content = this.generateCADContent(sheet, format);
    const blob = new Blob([content], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const filename = this.generateFilename(sheet, format.toLowerCase());

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);

    logger.success("CAD export complete", { filename, format });
    return { success: true, url, filename, format };
  }

  /**
   * Export DXF via the /api/export/dxf endpoint
   * @private
   */
  async exportDXF(sheet) {
    const compiledProject = this.resolveCompiledProject(sheet);
    if (compiledProject?.geometryHash) {
      const filename = this.generateFilename(sheet, "dxf");
      const response = await fetch("/api/project/export/dxf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          compiledProject,
          projectName: this.resolveProjectName(sheet),
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `DXF export failed: ${response.status}`);
      }

      const url = await this.downloadResponseBlob(response, filename);
      logger.success("Compiled-project DXF export complete", { filename });
      return { success: true, url, filename, format: "DXF" };
    }

    const dna = sheet.dna || {};
    const spatialGraph =
      dna.spatialGraph || dna._structured?.program?.spatialGraph || null;

    if (!spatialGraph?.building) {
      throw new Error(
        "No spatial graph available for DXF export. Generate a design first.",
      );
    }

    const response = await fetch("/api/export/dxf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        spatialGraph,
        roomPositions: dna.roomPositions || null,
        projectName: dna.projectType || "ArchiAI_FloorPlan",
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `DXF export failed: ${response.status}`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const filename = this.generateFilename(sheet, "dxf");

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);

    logger.success("DXF export complete", { filename });
    return { success: true, url, filename, format: "DXF" };
  }

  async exportJSON({ sheet }) {
    const compiledProject = this.resolveCompiledProject(sheet);
    if (!compiledProject?.geometryHash) {
      throw new Error(
        "A compiled project is required for JSON authority export.",
      );
    }

    const filename = this.generateFilename(sheet, "json");
    const response = await fetch("/api/project/export/json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        compiledProject,
        projectQuantityTakeoff: this.resolveProjectQuantityTakeoff(sheet),
        sheetArtifactManifest: this.resolveSheetArtifactManifest(sheet),
        projectName: this.resolveProjectName(sheet),
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `JSON export failed: ${response.status}`);
    }

    const url = await this.downloadResponseBlob(response, filename);
    logger.success("Compiled-project JSON export complete", { filename });
    return { success: true, url, filename, format: "JSON" };
  }

  /**
   * Export BIM file (RVT, IFC)
   * @param {Object} params - Parameters
   * @returns {Promise<Object>} Export result
   */
  async exportBIM({ sheet, format = "IFC", env = null }) {
    void env;

    logger.info(`Exporting BIM as ${format}`, null, "🏗️");

    if (String(format).toUpperCase() === "RVT") {
      throw new Error(
        "RVT export is experimental/off in UK Residential V2. Use IFC for BIM export.",
      );
    }

    const compiledProject = this.resolveCompiledProject(sheet);
    if (compiledProject?.geometryHash) {
      const filename = this.generateFilename(sheet, "ifc");
      const response = await fetch("/api/project/export/ifc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          compiledProject,
          projectName: this.resolveProjectName(sheet),
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `IFC export failed: ${response.status}`);
      }

      const url = await this.downloadResponseBlob(response, filename);
      logger.success("Compiled-project BIM export complete", {
        filename,
        format: "IFC",
      });
      return {
        success: true,
        url,
        filename,
        format: "IFC",
      };
    }

    const content = this.generateBIMContent(sheet, format);

    // Trigger download
    const blob = new Blob([content], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const filename = this.generateFilename(sheet, format.toLowerCase());

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);

    logger.success("BIM export complete", { filename, format });

    return {
      success: true,
      url,
      filename,
      format,
    };
  }

  async exportWorkbook({ sheet }) {
    const compiledProject = this.resolveCompiledProject(sheet);
    const projectQuantityTakeoff = this.resolveProjectQuantityTakeoff(sheet);
    if (
      !compiledProject?.geometryHash ||
      !projectQuantityTakeoff?.items?.length
    ) {
      throw new Error(
        "A compiled project and quantity takeoff are required for Excel export.",
      );
    }

    const filename = this.generateFilename(sheet, "xlsx");
    const response = await fetch("/api/project/export/xlsx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        compiledProject,
        projectQuantityTakeoff,
        projectName: this.resolveProjectName(sheet),
        qualityTier: sheet?.programBrief?.qualityTier || "mid",
        region: "uk-average",
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Excel export failed: ${response.status}`);
    }

    const url = await this.downloadResponseBlob(response, filename);
    logger.success("Cost workbook export complete", { filename });
    return { success: true, url, filename, format: "XLSX" };
  }

  async exportGLB({ sheet }) {
    const modelUrl =
      sheet?.compiledProject?.artifacts?.glbUrl ||
      sheet?.compiledProject?.artifacts?.modelUrl ||
      sheet?.meshy3D?.modelUrl ||
      sheet?.masterDNA?.meshy3D?.modelUrl ||
      null;

    if (!modelUrl) {
      throw new Error(
        "No GLB model is available for this result. Generate a compiled-project 3D artifact first.",
      );
    }

    const filename = this.generateFilename(sheet, "glb");
    const link = document.createElement("a");
    link.href = modelUrl;
    link.download = filename;
    link.click();

    logger.success("GLB export complete", { filename });
    return { success: true, url: modelUrl, filename, format: "GLB" };
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
Project: ${dna.projectType || "Building"}
Dimensions: ${dimensions.length}m × ${dimensions.width}m × ${dimensions.height}m
Materials: ${dna.materials?.map((m) => m.name).join(", ") || "N/A"}
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

    if (format === "IFC") {
      return `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ArchiAI Export'), '2;1');
FILE_NAME('${this.generateFilename(sheet, "ifc")}', '${new Date().toISOString()}', ('ArchiAI'), ('ArchiAI Solution'), '4.0', 'ArchiAI Platform', '');
FILE_SCHEMA(('IFC4'));
ENDSEC;

DATA;
/* Building: ${dna.projectType || "Building"} */
/* Dimensions: ${dimensions.length}m × ${dimensions.width}m × ${dimensions.height}m */
/* Materials: ${dna.materials?.map((m) => m.name).join(", ") || "N/A"} */
ENDSEC;

END-ISO-10303-21;
`;
    }

    return `Revit Export
Project: ${dna.projectType || "Building"}
Dimensions: ${dimensions.length}m × ${dimensions.width}m × ${dimensions.height}m
[RVT content would go here]
`;
  }
}

// Export singleton instance
const exportService = new ExportService();
export default exportService;
export { ExportService };

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

  resolveDesignMetadata(sheet = {}) {
    const metadata = sheet?.metadata || {};
    return {
      projectId:
        sheet?.projectId || sheet?.project_id || metadata?.projectId || null,
      projectGraphId:
        sheet?.projectGraphId ||
        sheet?.projectGraph?.project_id ||
        metadata?.projectGraphId ||
        null,
      visualManifestHash:
        sheet?.visualManifestHash ||
        sheet?.artifacts?.visualManifestHash ||
        metadata?.visualManifestHash ||
        null,
      styleBlendManifestHash:
        sheet?.styleBlendManifestHash ||
        sheet?.artifacts?.styleBlendManifestHash ||
        metadata?.styleBlendManifestHash ||
        null,
      jurisdictionPack:
        metadata?.jurisdictionPack ||
        sheet?.jurisdictionPack ||
        sheet?.artifacts?.jurisdictionPack ||
        null,
      jurisdictionPackResolution:
        metadata?.jurisdictionPackResolution ||
        sheet?.jurisdictionPackResolution ||
        null,
      countryCode:
        sheet?.countryCode ||
        metadata?.countryCode ||
        sheet?.jurisdictionPack?.countryCode ||
        null,
      region:
        sheet?.region ||
        metadata?.region ||
        sheet?.jurisdictionPack?.region ||
        null,
      exportManifest:
        sheet?.exportManifest ||
        metadata?.exportManifest ||
        sheet?.sheetArtifactManifest?.exportManifest ||
        null,
    };
  }

  resolveQaSummary(sheet = {}) {
    return (
      sheet?.qa || sheet?.metadata?.qa || sheet?.artifacts?.qaReport || null
    );
  }

  resolveProjectName(sheet = {}) {
    return (
      sheet?.projectName ||
      sheet?.brief?.project_name ||
      sheet?.projectGraph?.brief?.project_name ||
      sheet?.metadata?.projectName ||
      sheet?.dna?.projectType ||
      "ArchiAI_Project"
    );
  }

  safeProjectName(value, fallback = "ArchiAI_Project") {
    const cleaned = String(value || fallback)
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80);
    return cleaned || fallback;
  }

  filenameFromContentDisposition(headerValue, fallback) {
    const header = String(headerValue || "");
    const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match) {
      try {
        return decodeURIComponent(utf8Match[1].replace(/^"|"$/g, ""));
      } catch (_error) {
        return utf8Match[1].replace(/^"|"$/g, "") || fallback;
      }
    }
    const filenameMatch = header.match(/filename="?([^";]+)"?/i);
    return filenameMatch?.[1] || fallback;
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

  async readJsonError(response, fallbackMessage) {
    const errorData = await response.json().catch(() => ({}));
    return (
      errorData?.error?.message ||
      errorData?.error ||
      errorData?.message ||
      fallbackMessage
    );
  }

  hasDeliverableArtifacts(sheet = {}) {
    const artifacts = sheet?.artifacts || {};
    const compiledProject = this.resolveCompiledProject(sheet);
    const sheetUrlIsData =
      typeof sheet?.url === "string" && sheet.url.startsWith("data:");
    const sheetPdfUrlIsData =
      typeof sheet?.pdfUrl === "string" && sheet.pdfUrl.startsWith("data:");
    return Boolean(
      compiledProject?.geometryHash ||
      artifacts?.a1Sheet?.svgString ||
      artifacts?.a1Sheet?.svg ||
      artifacts?.a1Pdf?.dataUrl ||
      artifacts?.a1Pdf?.pdfDataUrl ||
      artifacts?.a1Png?.dataUrl ||
      artifacts?.renderedProof?.dataUrl ||
      artifacts?.dxf ||
      artifacts?.drawings ||
      artifacts?.qaReport ||
      sheet?.a1Sheet?.svgString ||
      sheet?.a1Sheet?.svg ||
      sheet?.a1Pdf?.dataUrl ||
      sheet?.a1Pdf?.pdfDataUrl ||
      sheetUrlIsData ||
      sheetPdfUrlIsData,
    );
  }

  buildArtifactPackagePayload(sheet = {}) {
    const artifacts = sheet?.artifacts || {};
    const compiledProject = this.resolveCompiledProject(sheet);
    const sheetUrlPng =
      typeof sheet?.url === "string" && sheet.url.startsWith("data:")
        ? { dataUrl: sheet.url }
        : null;
    const sheetPdfUrl =
      typeof sheet?.pdfUrl === "string" && sheet.pdfUrl.startsWith("data:")
        ? { dataUrl: sheet.pdfUrl }
        : null;
    const flags = {
      structuralEnabled: Boolean(
        sheet?.flags?.structuralEnabled ||
        artifacts?.structuralArtifacts?.length ||
        compiledProject?.structuralModel,
      ),
      mepEnabled: Boolean(
        sheet?.flags?.mepEnabled ||
        artifacts?.mepArtifacts?.length ||
        compiledProject?.mepModel,
      ),
      detailsEnabled: Boolean(
        sheet?.flags?.detailsEnabled ||
        artifacts?.detailArtifacts?.length ||
        compiledProject?.constructionDetailLibrary ||
        compiledProject?.detailLibrary,
      ),
      dwgEnabled: Boolean(sheet?.flags?.dwgEnabled),
      ifcEnabled: Boolean(sheet?.flags?.ifcEnabled),
    };

    return {
      projectName: this.resolveProjectName(sheet),
      projectId:
        sheet?.projectId ||
        sheet?.project_id ||
        sheet?.designId ||
        sheet?.metadata?.projectId ||
        null,
      projectGraphId:
        sheet?.projectGraphId ||
        sheet?.projectGraph?.projectGraphId ||
        sheet?.projectGraph?.project_id ||
        artifacts?.projectGraphId ||
        null,
      userId: sheet?.userId || sheet?.metadata?.userId || null,
      projectGraph: sheet?.projectGraph || null,
      compiledProject,
      geometryHash:
        sheet?.geometryHash ||
        artifacts?.geometryHash ||
        compiledProject?.geometryHash ||
        null,
      visualManifestHash:
        sheet?.visualManifestHash ||
        artifacts?.visualManifestHash ||
        sheet?.visualManifest?.manifestHash ||
        null,
      styleBlendManifestHash:
        sheet?.styleBlendManifestHash ||
        artifacts?.styleBlendManifestHash ||
        sheet?.styleBlendManifest?.manifestHash ||
        null,
      jurisdictionId:
        sheet?.jurisdictionId ||
        sheet?.jurisdictionPack?.jurisdictionId ||
        sheet?.metadata?.jurisdictionId ||
        compiledProject?.jurisdictionId ||
        null,
      countryCode:
        sheet?.countryCode ||
        sheet?.jurisdictionPack?.countryCode ||
        sheet?.metadata?.countryCode ||
        compiledProject?.countryCode ||
        null,
      flags,
      a1Sheet: artifacts?.a1Sheet || sheet?.a1Sheet || null,
      a1Pdf: artifacts?.a1Pdf || sheet?.a1Pdf || sheetPdfUrl,
      a1Png:
        artifacts?.a1Png ||
        artifacts?.renderedProof ||
        sheet?.a1Png ||
        sheetUrlPng,
      dxfArtifact: artifacts?.dxf || sheet?.dxfArtifact || null,
      dwgArtifact: artifacts?.dwg || sheet?.dwgArtifact || null,
      ifcArtifact: artifacts?.ifc || sheet?.ifcArtifact || null,
      technicalDrawings:
        artifacts?.drawings || sheet?.technicalDrawings || null,
      existingArtifacts:
        artifacts?.existingArtifacts || sheet?.existingArtifacts || [],
      structuralArtifacts:
        artifacts?.structuralArtifacts || sheet?.structuralArtifacts || null,
      mepArtifacts: artifacts?.mepArtifacts || sheet?.mepArtifacts || null,
      detailArtifacts:
        artifacts?.detailArtifacts || sheet?.detailArtifacts || null,
      schedulesWorkbook:
        artifacts?.schedulesWorkbook || sheet?.schedulesWorkbook || null,
      qaReport: artifacts?.qaReport || sheet?.qaReport || sheet?.qa || null,
      visualManifest:
        artifacts?.visualManifest || sheet?.visualManifest || null,
      styleBlendManifest:
        artifacts?.styleBlendManifest || sheet?.styleBlendManifest || null,
      jurisdictionPack:
        artifacts?.jurisdictionPack || sheet?.jurisdictionPack || null,
      sourceGaps: sheet?.sourceGaps || [],
      producerVersions: sheet?.producerVersions || {},
    };
  }

  async exportDeliverablesPackage({ sheet }) {
    if (!this.hasDeliverableArtifacts(sheet)) {
      throw new Error("Generate a design before downloading deliverables.");
    }

    // Prefer the pre-baked package the generation request stored on the
    // result. When present, hit the existing GET download endpoint via
    // downloadStoredDeliverablesPackage — no multi-MB POST body, no
    // re-upload of compiledProject / projectGraph / a1Png / a1Pdf.
    const pkg = sheet?.package || sheet?.metadata?.package || null;
    if (pkg?.packageId && (pkg.signedUrl || pkg.downloadRoute)) {
      try {
        return await this.downloadStoredDeliverablesPackage({
          packageRecord: {
            ...pkg,
            projectId:
              pkg.projectId ||
              sheet?.projectId ||
              sheet?.metadata?.projectId ||
              null,
            projectName: this.resolveProjectName(sheet),
          },
        });
      } catch (error) {
        // Surface 404/410 from the prebake route verbatim — the package
        // expired or was evicted and the caller should re-generate.
        // Do NOT silently re-upload the full payload behind the user's
        // back; that would mask the storage drift and burn body limits.
        throw new Error(
          error?.message ||
            "Stored deliverables package unavailable — re-generate the design.",
        );
      }
    }

    // Legacy fallback: no prebake on this sheet (older cached result or
    // a code path that didn't store one). POST the full payload to the
    // direct ZIP route. Server's body limits may reject very large
    // payloads — surface that clearly.
    const payload = this.buildArtifactPackagePayload(sheet);
    const safeName = this.safeProjectName(payload.projectName);
    const fallbackFilename = `${safeName}-deliverables.zip`;
    const response = await fetch("/api/project/export/artifact-package", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = await this.readJsonError(
        response,
        `Deliverables ZIP export failed: ${response.status}`,
      );
      throw new Error(message);
    }

    const filename = this.filenameFromContentDisposition(
      response.headers?.get?.("content-disposition"),
      fallbackFilename,
    );
    const url = await this.downloadResponseBlob(response, filename);
    logger.success("Deliverables ZIP export complete", { filename });
    return { success: true, url, filename, format: "ZIP" };
  }

  buildArtifactPackageReference(sheet = {}) {
    const pkg = sheet?.package || sheet?.metadata?.package || null;
    if (!pkg || !pkg.packageId) return null;
    return {
      packageId: pkg.packageId,
      projectId:
        sheet?.projectId ||
        sheet?.project_id ||
        sheet?.designId ||
        sheet?.metadata?.projectId ||
        null,
      projectName: this.resolveProjectName(sheet),
      userId: sheet?.userId || sheet?.metadata?.userId || null,
    };
  }

  async storeDeliverablesPackage({ sheet, expiresInSeconds } = {}) {
    if (!this.hasDeliverableArtifacts(sheet)) {
      throw new Error("Generate a design before saving deliverables.");
    }

    // Prefer the compact-ref Save when generation pre-baked the package.
    // The client never re-uploads tens of MB of artifact bytes; the server
    // looks up the existing storage entry and records history. Falls back to
    // the legacy full-payload Save if no pre-baked package is on the sheet.
    const ref = this.buildArtifactPackageReference(sheet);
    const body = ref
      ? { ...ref, ...(expiresInSeconds ? { expiresInSeconds } : {}) }
      : (() => {
          const payload = this.buildArtifactPackagePayload(sheet);
          return {
            ...payload,
            ...(expiresInSeconds ? { expiresInSeconds } : {}),
          };
        })();
    const response = await fetch("/api/project/export/artifact-package/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const message = await this.readJsonError(
        response,
        `Deliverables package storage failed: ${response.status}`,
      );
      throw new Error(message);
    }

    const result = await response.json();
    logger.success("Deliverables package stored", {
      packageId: result.packageId,
      packageHash: result.packageHash,
    });
    return {
      success: true,
      format: "ZIP",
      ...result,
    };
  }

  async listDeliverablesPackageHistory({ projectId, userId, sheet } = {}) {
    const payload = sheet ? this.buildArtifactPackagePayload(sheet) : {};
    const params = new URLSearchParams();
    const resolvedProjectId = projectId || payload.projectId;
    const resolvedUserId = userId || payload.userId;
    if (resolvedProjectId) params.set("projectId", resolvedProjectId);
    if (resolvedUserId) params.set("userId", resolvedUserId);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    const response = await fetch(
      `/api/project/export/artifact-package/history${suffix}`,
      {
        method: "GET",
      },
    );

    if (!response.ok) {
      const message = await this.readJsonError(
        response,
        `Deliverables package history failed: ${response.status}`,
      );
      throw new Error(message);
    }

    return response.json();
  }

  async downloadStoredDeliverablesPackage({ packageRecord }) {
    const downloadUrl =
      packageRecord?.signedUrl ||
      packageRecord?.downloadUrl ||
      packageRecord?.downloadRoute;
    if (!downloadUrl) {
      throw new Error("Stored deliverables package has no download URL.");
    }
    const response = await fetch(downloadUrl, { method: "GET" });
    if (!response.ok) {
      const message = await this.readJsonError(
        response,
        `Stored deliverables download failed: ${response.status}`,
      );
      throw new Error(message);
    }
    const fallbackFilename = `${this.safeProjectName(
      packageRecord?.projectId || packageRecord?.packageId,
    )}-deliverables.zip`;
    const filename = this.filenameFromContentDisposition(
      response.headers?.get?.("content-disposition"),
      fallbackFilename,
    );
    const url = await this.downloadResponseBlob(response, filename);
    logger.success("Stored deliverables ZIP download complete", { filename });
    return { success: true, url, filename, format: "ZIP" };
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

    if (fmt === "ZIP" || fmt === "DELIVERABLES" || fmt === "ARTIFACT_PACKAGE") {
      return this.exportDeliverablesPackage({ sheet, env: effectiveEnv });
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
   * Validate that a Blob obtained for PNG export really is an image.
   * Guards against the silent-corrupt-PNG case where a server error
   * (HTML body, 0-byte response, JSON error envelope) is saved as .png.
   * Throws with a clear message on any failure.
   * @private
   */
  validatePngBlob(blob, contentType) {
    if (!blob || typeof blob.size !== "number") {
      throw new Error("PNG export produced no response body.");
    }
    if (blob.size === 0) {
      throw new Error("PNG export response was empty (0 bytes).");
    }
    const mime = String(contentType || blob.type || "").toLowerCase();
    if (mime && !mime.startsWith("image/")) {
      throw new Error(
        `PNG export response is not an image (Content-Type: ${mime}).`,
      );
    }
  }

  /**
   * Trigger a browser download for a validated Blob. Uses an object URL
   * and revokes it on the next microtask to keep the click handler
   * synchronous. Returns the object URL for callers that need it.
   * @private
   */
  triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return url;
  }

  /**
   * Export as PNG
   * @private
   */
  async exportAsPNG(sheet) {
    const filename = this.generateFilename(sheet, "png");

    if (!sheet?.url || typeof sheet.url !== "string") {
      throw new Error("No valid image URL for PNG export");
    }

    // Data URL path: must be data:image/* with a non-empty payload.
    // A bare `data:image/png;base64,` or a `data:text/html,...` here
    // would otherwise be silently saved as a .png on the user's disk.
    if (sheet.url.startsWith("data:")) {
      if (!/^data:image\//i.test(sheet.url)) {
        throw new Error(
          "PNG export requires a data:image/* URL — refusing to save non-image data as .png.",
        );
      }
      const payloadSeparator = sheet.url.indexOf(",");
      if (payloadSeparator < 0 || payloadSeparator === sheet.url.length - 1) {
        throw new Error("PNG export data URL has no payload.");
      }
      const blob = await this.dataURLToBlob(sheet.url);
      this.validatePngBlob(blob, blob.type);
      const url = this.triggerBlobDownload(blob, filename);
      return { success: true, url, filename, format: "PNG" };
    }

    // HTTP(S) URL path: fetch it, verify ok + image content-type + size,
    // then download as a validated blob. Never use a raw <a download>
    // on the source URL — that path silently saves whatever the server
    // returns, including error HTML.
    const response = await fetch(sheet.url, { method: "GET" });
    if (!response.ok) {
      throw new Error(
        `PNG export failed: HTTP ${response.status} ${response.statusText || ""}`.trim(),
      );
    }
    const contentType = (
      response.headers?.get?.("content-type") ||
      response.headers?.get?.("Content-Type") ||
      ""
    ).toLowerCase();
    if (contentType && !contentType.startsWith("image/")) {
      throw new Error(
        `PNG export response is not an image (Content-Type: ${contentType}).`,
      );
    }
    const blob = await response.blob();
    this.validatePngBlob(blob, contentType || blob.type);
    const url = this.triggerBlobDownload(blob, filename);
    return { success: true, url, filename, format: "PNG" };
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

    throw new Error(
      `${format} export requires a configured DWG conversion provider. DXF is the guaranteed CAD output.`,
    );
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
        designMetadata: this.resolveDesignMetadata(sheet),
        qaSummary: this.resolveQaSummary(sheet),
        projectName: this.resolveProjectName(sheet),
        pipelineVersion:
          sheet?.pipelineVersion || sheet?.metadata?.pipelineVersion || null,
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
   * Export BIM file (IFC). RVT is unsupported. IFC requires a real
   * compiled project with geometryHash — there is no fake-IFC fallback.
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
    if (!compiledProject?.geometryHash) {
      throw new Error(
        "IFC export requires a compiled project with geometryHash.",
      );
    }

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
    return { success: true, url, filename, format: "IFC" };
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
        projectAddress:
          sheet?.brief?.site_address ||
          sheet?.projectGraph?.brief?.site_address ||
          sheet?.metadata?.projectAddress ||
          null,
        qualityTier: sheet?.programBrief?.qualityTier || "mid",
        region: "uk-average",
        pipelineVersion:
          sheet?.pipelineVersion || sheet?.metadata?.pipelineVersion || null,
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
}

// Export singleton instance
const exportService = new ExportService();
export default exportService;
export { ExportService };

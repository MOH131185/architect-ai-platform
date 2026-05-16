import { setCorsHeaders, handlePreflight } from "../../_shared/cors.js";
import { exportCompiledProjectToDXF } from "../../../src/services/project/compiledProjectExportService.js";
import {
  convertDxfToDwg,
  DwgConversionUnavailableError,
  DwgConversionRuntimeError,
  DWG_CONVERTER_DOCS_URL,
  DWG_CONVERTER_NOT_INSTALLED,
} from "../../../src/services/cad/dwgConversionAdapter.js";

/**
 * POST /api/project/export/dwg
 *
 * Body shape (one of):
 *   { dxf: "<DXF text>", projectName?: "..." }
 *   { compiledProject: {...}, projectName?, includeDetailDrawings?, ... }
 *
 * When `dxf` is provided directly we feed it straight to the ODA File
 * Converter. Otherwise we build the deterministic DXF from compiledProject
 * (matching api/project/export/dxf.js) and then convert.
 *
 * On success: 200 application/acad + DWG bytes.
 * On env-missing failure: 503 application/json with structured `code` so
 *   the client can render "Install ODA File Converter" with a docs link
 *   instead of a generic 500.
 * On runtime failure: 502 application/json with structured `code`.
 */
export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    dxf: dxfInput,
    compiledProject,
    projectName = "ArchiAI_Project",
    includeDetailDrawings = false,
    detailDrawingsEnabled = false,
    includeStructuralDrawings,
    structuralDrawingsEnabled,
    includeMepDrawings,
    mepDrawingsEnabled,
    outputVersion = "ACAD2018",
  } = req.body || {};

  let dxf = typeof dxfInput === "string" ? dxfInput : null;
  if (!dxf) {
    if (!compiledProject) {
      return res.status(400).json({
        error: "Either `dxf` or `compiledProject` is required.",
      });
    }
    try {
      dxf = exportCompiledProjectToDXF({
        compiledProject,
        projectName,
        includeDetailDrawings,
        detailDrawingsEnabled,
        includeStructuralDrawings,
        structuralDrawingsEnabled,
        includeMepDrawings,
        mepDrawingsEnabled,
      });
    } catch (err) {
      return res.status(500).json({
        error: err?.message || "Failed to build DXF input for DWG conversion.",
      });
    }
  }

  const safeName =
    String(projectName || "ArchiAI_Project")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 80) || "ArchiAI_Project";

  try {
    const result = await convertDxfToDwg({
      dxf,
      outputName: `${safeName}.dwg`,
      outputVersion,
    });
    res.setHeader("Content-Type", "application/acad");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName}.dwg"`,
    );
    res.setHeader("X-DWG-Adapter-Version", result.adapterVersion);
    return res.status(200).send(Buffer.from(result.dwg));
  } catch (err) {
    if (err instanceof DwgConversionUnavailableError) {
      return res.status(503).json({
        error: err.message,
        code: err.code,
        provider: err.details?.provider || null,
        docsUrl: DWG_CONVERTER_DOCS_URL,
        guidance:
          "Install ODA File Converter on the server and set DWG_CONVERSION_ENABLED=true, DWG_CONVERSION_PROVIDER=oda, ODA_FILE_CONVERTER_PATH=<path>.",
      });
    }
    if (err instanceof DwgConversionRuntimeError) {
      // Codex merge-audit blocker B. "Missing converter binary" is a
      // not-installed contract, not a runtime failure — even though the
      // env names a path, spawn ENOENT means the binary is not actually
      // installed at that path. Surface as 503 DWG_CONVERTER_NOT_INSTALLED
      // alongside the unconfigured path. Real runtime failures (non-zero
      // exit / timeout / output missing) stay at 502 because the
      // converter was reachable and did something — it just failed mid-
      // conversion.
      const isNotInstalled = err.code === DWG_CONVERTER_NOT_INSTALLED;
      const statusCode = isNotInstalled ? 503 : 502;
      const guidance = isNotInstalled
        ? "ODA_FILE_CONVERTER_PATH is set but no executable exists at that path. Install ODA File Converter and update the path."
        : undefined;
      return res.status(statusCode).json({
        error: err.message,
        code: err.code,
        details: {
          exitCode: err.details?.exitCode ?? null,
          signal: err.details?.signal ?? null,
          stderr: err.details?.stderr
            ? String(err.details.stderr).slice(0, 4000)
            : null,
        },
        docsUrl: DWG_CONVERTER_DOCS_URL,
        ...(guidance ? { guidance } : {}),
      });
    }
    return res.status(500).json({
      error: err?.message || "DWG conversion failed",
    });
  }
}

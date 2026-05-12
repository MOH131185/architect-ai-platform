import { setCorsHeaders, handlePreflight } from "../../_shared/cors.js";
import { buildCostWorkbook } from "../../../src/services/project/compiledProjectExportService.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      compiledProject,
      projectQuantityTakeoff,
      projectName = "ArchiAI_Project",
      projectAddress = null,
      qualityTier = "mid",
      region = "uk-average",
      pipelineVersion = null,
    } = req.body || {};

    if (!compiledProject?.geometryHash) {
      return res.status(400).json({
        error: "compiledProject with geometryHash is required",
        code: "GEOMETRY_HASH_MISSING",
      });
    }
    if (!projectQuantityTakeoff?.items?.length) {
      return res.status(400).json({
        error: "Quantity takeoff is required for workbook export.",
        code: "QUANTITY_TAKEOFF_UNAVAILABLE",
      });
    }

    const workbook = buildCostWorkbook({
      compiledProject,
      takeoff: projectQuantityTakeoff,
      projectName,
      projectAddress,
      qualityTier,
      region,
      ...(pipelineVersion ? { pipelineVersion } : {}),
    });
    const safeName = String(projectName)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 80);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName || "ArchiAI_Project"}_estimate.xlsx"`,
    );
    return res.status(200).send(Buffer.from(workbook.workbookArray));
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Workbook export failed",
    });
  }
}

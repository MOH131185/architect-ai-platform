import { setCorsHeaders, handlePreflight } from "../../_shared/cors.js";
import { exportCompiledProjectToDXF } from "../../../src/services/project/compiledProjectExportService.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { compiledProject, projectName = "ArchiAI_Project" } = req.body || {};
    const dxf = exportCompiledProjectToDXF({ compiledProject, projectName });
    const safeName = String(projectName)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 80);
    res.setHeader("Content-Type", "application/dxf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName || "ArchiAI_Project"}.dxf"`,
    );
    return res.status(200).send(dxf);
  } catch (error) {
    return res.status(500).json({
      error: error.message || "DXF export failed",
    });
  }
}

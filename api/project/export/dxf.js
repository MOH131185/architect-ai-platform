import { setCorsHeaders, handlePreflight } from "../../_shared/cors.js";
import { exportCompiledProjectToDXF } from "../../../src/services/project/compiledProjectExportService.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Phase 2 audit response: thread the structural/MEP flags from the
    // request body through to the exporter so the DXF artifact and the
    // companion IFC honour the same caller intent. Previously the route
    // only forwarded the detail-drawings flag, so a caller could not
    // request an architectural-only DXF when env defaults were on (or
    // vice versa). The exporter applies the explicit-false-wins rule
    // documented at compiledProjectExportService.exportCompiledProjectToDXF.
    const {
      compiledProject,
      projectName = "ArchiAI_Project",
      includeDetailDrawings = false,
      detailDrawingsEnabled = false,
      includeStructuralDrawings,
      structuralDrawingsEnabled,
      includeMepDrawings,
      mepDrawingsEnabled,
    } = req.body || {};
    const dxf = exportCompiledProjectToDXF({
      compiledProject,
      projectName,
      includeDetailDrawings,
      detailDrawingsEnabled,
      includeStructuralDrawings,
      structuralDrawingsEnabled,
      includeMepDrawings,
      mepDrawingsEnabled,
    });
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

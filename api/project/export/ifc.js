import { setCorsHeaders, handlePreflight } from "../../_shared/cors.js";
import { exportCompiledProjectToIFC } from "../../../src/services/project/compiledProjectExportService.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Phase 2 audit response: thread the structural/MEP flags from the
    // request body so the IFC artifact honours caller intent and stays
    // in sync with the companion DXF + A1 sheets. Previously the route
    // discarded these fields so structural/MEP-aware callers fell back
    // to server env defaults. The exporter applies the
    // explicit-false-wins rule documented at
    // compiledProjectExportService.exportCompiledProjectToIFC.
    const {
      compiledProject,
      projectName = "ArchiAI_Project",
      // Phase 2 re-audit fix: accept BOTH alias names so a caller can
      // veto structural/MEP IFC output with `includeStructuralDrawings:
      // false` (matches the DXF route + slice service contract). The
      // exporter applies explicit-false-wins across either alias.
      structuralDrawingsEnabled,
      includeStructuralDrawings,
      mepDrawingsEnabled,
      includeMepDrawings,
      jurisdictionPack,
    } = req.body || {};
    if (!compiledProject?.geometryHash) {
      return res.status(400).json({
        error: "compiledProject with geometryHash is required",
        code: "GEOMETRY_HASH_MISSING",
      });
    }
    const ifc = exportCompiledProjectToIFC({
      compiledProject,
      projectName,
      structuralDrawingsEnabled,
      includeStructuralDrawings,
      mepDrawingsEnabled,
      includeMepDrawings,
      jurisdictionPack,
    });
    const safeName = String(projectName)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 80);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName || "ArchiAI_Project"}.ifc"`,
    );
    return res.status(200).send(ifc);
  } catch (error) {
    const message = error?.message || "IFC export failed";
    if (message.includes("IFC_GEOMETRY_INSUFFICIENT")) {
      return res.status(400).json({
        error:
          "Compiled geometry is insufficient for a meaningful IFC export (no walls or storeys).",
        code: "IFC_GEOMETRY_INSUFFICIENT",
      });
    }
    return res.status(500).json({ error: message });
  }
}

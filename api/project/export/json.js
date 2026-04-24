import { setCorsHeaders, handlePreflight } from "../../_shared/cors.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      compiledProject,
      projectQuantityTakeoff = null,
      sheetArtifactManifest = null,
      projectName = "ArchiAI_Project",
    } = req.body || {};

    if (!compiledProject?.geometryHash) {
      return res.status(400).json({
        error: "compiledProject with geometryHash is required",
      });
    }

    const safeName = String(projectName)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 80);

    const payload = {
      schema_version: "compiled-export-json-v1",
      exportedAt: new Date().toISOString(),
      projectName,
      geometryHash: compiledProject.geometryHash,
      compiledProject,
      projectQuantityTakeoff,
      sheetArtifactManifest,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName || "ArchiAI_Project"}_compiled_project.json"`,
    );
    return res.status(200).send(JSON.stringify(payload, null, 2));
  } catch (error) {
    return res.status(500).json({
      error: error.message || "JSON export failed",
    });
  }
}

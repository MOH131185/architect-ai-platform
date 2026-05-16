import { setCorsHeaders, handlePreflight } from "../../_shared/cors.js";
import { buildCompiledProjectGlb } from "../../../src/services/3d/compiledProjectGlbWriter.js";

/**
 * POST /api/project/export/glb
 *
 * Body: { compiledProject, projectName? }
 *
 * Returns 200 model/gltf-binary + GLB bytes. Authoritative source is the
 * deterministic compiledProject geometry; no image generation is involved.
 * geometryHash is written into the GLB's glTF Extras so downstream
 * consumers (handoff manifest, IFC, DXF) can cross-verify.
 */
export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { compiledProject, projectName = "ArchiAI_Project" } = req.body || {};
  if (!compiledProject) {
    return res.status(400).json({ error: "`compiledProject` is required." });
  }

  try {
    const result = buildCompiledProjectGlb({
      ...compiledProject,
      metadata: {
        ...(compiledProject.metadata || {}),
        projectName:
          projectName || compiledProject.metadata?.projectName || null,
      },
    });
    const safeName =
      String(projectName)
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .slice(0, 80) || "ArchiAI_Project";
    res.setHeader("Content-Type", "model/gltf-binary");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName}.glb"`,
    );
    res.setHeader("X-GLB-Adapter-Version", result.adapterVersion);
    res.setHeader("X-GLB-Mesh-Count", String(result.meshCount));
    res.setHeader("X-GLB-Geometry-Hash", result.geometryHash || "");
    return res.status(200).send(Buffer.from(result.glb));
  } catch (err) {
    return res.status(500).json({
      error: err?.message || "GLB export failed",
    });
  }
}

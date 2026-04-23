import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";
import { generateResidentialProgramBrief } from "../../src/services/project/residentialProgramEngine.js";
import { UK_RESIDENTIAL_V2_PIPELINE_VERSION } from "../../src/services/project/v2ProjectContracts.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      subType = "detached-house",
      totalAreaM2 = 160,
      siteAreaM2 = null,
      entranceDirection = "S",
      qualityTier = "mid",
      customNotes = "",
    } = req.body || {};

    const programBrief = generateResidentialProgramBrief({
      subType,
      totalAreaM2: Number(totalAreaM2 || 0),
      siteAreaM2: Number.isFinite(Number(siteAreaM2))
        ? Number(siteAreaM2)
        : null,
      entranceDirection,
      qualityTier,
      customNotes,
    });

    return res.status(200).json({
      success: true,
      pipelineVersion: UK_RESIDENTIAL_V2_PIPELINE_VERSION,
      confidence: programBrief.confidence || null,
      validation: {
        valid: (programBrief.blockers || []).length === 0,
        blockers: programBrief.blockers || [],
        warnings: programBrief.warnings || [],
      },
      programBrief,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Program compilation failed",
    });
  }
}

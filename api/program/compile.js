import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";
import { generateResidentialProgramBrief } from "../../src/services/project/residentialProgramEngine.js";
import { resolveAuthoritativeFloorCount } from "../../src/services/project/floorCountAuthority.js";
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
      levelCount = null,
      floorCount = null,
      floorCountLocked = false,
      entranceDirection = "S",
      qualityTier = "mid",
      customNotes = "",
    } = req.body || {};
    const hasFloorAuthority = Boolean(
      floorCountLocked || levelCount || floorCount,
    );
    const requestedLevelCount = hasFloorAuthority
      ? resolveAuthoritativeFloorCount(
          {
            floorCount: Number(levelCount || floorCount),
            floorCountLocked,
            subType,
            buildingType: subType,
            area: Number(totalAreaM2 || 0),
            totalAreaM2: Number(totalAreaM2 || 0),
          },
          { fallback: 2 },
        ).floorCount
      : null;

    const programBrief = generateResidentialProgramBrief({
      subType,
      totalAreaM2: Number(totalAreaM2 || 0),
      siteAreaM2: Number.isFinite(Number(siteAreaM2))
        ? Number(siteAreaM2)
        : null,
      levelCountOverride:
        Number.isFinite(requestedLevelCount) && requestedLevelCount > 0
          ? requestedLevelCount
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

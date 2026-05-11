import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";
import { generateResidentialProgramBrief } from "../../src/services/project/residentialProgramEngine.js";
import { resolveAuthoritativeFloorCount } from "../../src/services/project/floorCountAuthority.js";
import { UK_RESIDENTIAL_V2_PIPELINE_VERSION } from "../../src/services/project/v2ProjectContracts.js";
import {
  PROJECT_GRAPH_PROJECT_TYPE_PIPELINE_VERSION,
  PROJECT_TYPE_ROUTES,
  getProjectTypeSupport,
} from "../../src/services/project/projectTypeSupportRegistry.js";
import { generateDeterministicProgramSpaces } from "../../src/services/project/programmeSpaceGenerator.js";
import { runProgramPreflight } from "../../src/services/project/programPreflight.js";

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      category = "residential",
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
    const support = getProjectTypeSupport(category, subType);
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

    if (support.route && support.route !== PROJECT_TYPE_ROUTES.RESIDENTIAL_V2) {
      if (support.enabledInUi !== true) {
        return res.status(422).json({
          success: false,
          error:
            support.message ||
            "This project type is not enabled for production generation.",
          code: "PROJECT_TYPE_UNSUPPORTED",
        });
      }
      const authoritativeFloorCount = requestedLevelCount || 1;
      const generated = generateDeterministicProgramSpaces({
        projectDetails: {
          category,
          subType,
          area: Number(totalAreaM2 || 0),
          floorCount: authoritativeFloorCount,
          floorCountLocked,
          canonicalBuildingType: support.canonicalBuildingType,
        },
        projectTypeSupport: support,
        floorCount: authoritativeFloorCount,
        targetAreaM2: Number(totalAreaM2 || 0),
      });
      const preflight = runProgramPreflight({
        projectDetails: {
          category,
          subType,
          area: Number(totalAreaM2 || 0),
          floorCount: authoritativeFloorCount,
          floorCountLocked,
        },
        programSpaces: generated.spaces,
        floorCount: authoritativeFloorCount,
      });
      return res.status(preflight.ok ? 200 : 422).json({
        success: preflight.ok,
        pipelineVersion: PROJECT_GRAPH_PROJECT_TYPE_PIPELINE_VERSION,
        confidence: { source: generated.source },
        validation: {
          valid: preflight.ok,
          blockers: preflight.errors,
          warnings: [...generated.warnings, ...preflight.warnings],
        },
        programSpaces: preflight.normalizedProgramSpaces,
        programBrief: {
          source: generated.source,
          canonicalBuildingType: support.canonicalBuildingType,
          supportStatus: support.supportStatus,
          floorCount: authoritativeFloorCount,
          targetAreaM2: Number(totalAreaM2 || 0),
          spaces: preflight.normalizedProgramSpaces,
        },
      });
    }

    if (
      support.route !== PROJECT_TYPE_ROUTES.RESIDENTIAL_V2 &&
      support.enabledInUi !== true
    ) {
      return res.status(422).json({
        success: false,
        error:
          support.message ||
          "This project type is not enabled for production generation.",
        code: "PROJECT_TYPE_UNSUPPORTED",
      });
    }

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

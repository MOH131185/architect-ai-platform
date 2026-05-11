import { setCorsHeaders, handlePreflight } from "../../_shared/cors.js";
import { cancelJob } from "../../../src/services/generation/generationJobService.js";

function resolveJobId(req) {
  return req.query?.jobId || req.query?.id || req.params?.jobId || null;
}

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const jobId = resolveJobId(req);
  if (!jobId) {
    return res
      .status(400)
      .json({ error: "jobId is required", code: "JOB_ID_REQUIRED" });
  }

  const result = cancelJob(jobId);
  if (!result.cancelled) {
    const status =
      result.reason === "JOB_NOT_FOUND"
        ? 404
        : result.reason === "JOB_NOT_CANCELLABLE"
          ? 409
          : 400;
    return res.status(status).json({
      error: "Cannot cancel job",
      code: result.reason,
      jobId,
      currentStatus: result.currentStatus,
    });
  }
  return res.status(200).json({ jobId, ...result });
}

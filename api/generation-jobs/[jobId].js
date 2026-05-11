import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";
import { getJob } from "../../src/services/generation/generationJobService.js";

function resolveJobId(req) {
  return req.query?.jobId || req.query?.id || req.params?.jobId || null;
}

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "GET, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "GET, OPTIONS" });

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const jobId = resolveJobId(req);
  if (!jobId) {
    return res
      .status(400)
      .json({ error: "jobId is required", code: "JOB_ID_REQUIRED" });
  }

  const snapshot = getJob(jobId);
  if (!snapshot) {
    return res
      .status(404)
      .json({
        error: "Generation job not found",
        code: "JOB_NOT_FOUND",
        jobId,
      });
  }
  return res.status(200).json(snapshot);
}

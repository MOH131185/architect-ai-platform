import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";
import { listJobs } from "../../src/services/generation/generationJobService.js";

function resolveQuery(req) {
  return {
    projectId:
      req.query?.projectId ||
      req.query?.project_id ||
      req.headers?.["x-project-id"] ||
      null,
    userId:
      req.query?.userId ||
      req.query?.user_id ||
      req.headers?.["x-user-id"] ||
      null,
    status: req.query?.status || null,
  };
}

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "GET, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "GET, OPTIONS" });

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const query = resolveQuery(req);
  const jobs = listJobs(query);
  return res.status(200).json({ jobs, count: jobs.length });
}

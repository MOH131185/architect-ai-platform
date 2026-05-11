import { setCorsHeaders, handlePreflight } from "../_shared/cors.js";
import {
  startJob,
  JOB_ERROR_CODES,
} from "../../src/services/generation/generationJobService.js";
import sliceHandler from "../project/generate-vertical-slice.js";

// The job worker reuses the existing /generate-vertical-slice handler so the
// authority gates, prebake, and pre-existing test coverage all stay
// authoritative. We invoke it via in-process req/res shims rather than
// duplicating the slice + prebake logic. The result already contains
// `package: { packageId, packageHash, ... }` from the prebake step.
function makeReqShim(payload, headers) {
  return {
    method: "POST",
    headers: headers || {},
    body: payload || {},
  };
}

function makeResShim() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

async function defaultGenerationWorker(payload, { signal } = {}) {
  if (signal?.aborted) {
    return { success: false, errorCode: JOB_ERROR_CODES.JOB_CANCELLED };
  }
  const req = makeReqShim(payload, payload?._jobHeaders || {});
  const res = makeResShim();
  await sliceHandler(req, res);
  if (signal?.aborted) {
    return { success: false, errorCode: JOB_ERROR_CODES.JOB_CANCELLED };
  }
  return (
    res.body || { success: false, error: "Vertical slice returned no body" }
  );
}

export default async function handler(req, res) {
  if (handlePreflight(req, res, { methods: "POST, OPTIONS" })) return;
  setCorsHeaders(req, res, { methods: "POST, OPTIONS" });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};
  const payload = {
    ...body,
    _jobHeaders: {
      "x-user-id":
        body.userId ||
        body.metadata?.userId ||
        req.headers?.["x-user-id"] ||
        "",
    },
  };

  const userId =
    body.userId || body.metadata?.userId || req.headers?.["x-user-id"] || null;
  const projectId =
    body.projectId ||
    body.project_id ||
    body.designId ||
    body.metadata?.projectId ||
    req.headers?.["x-project-id"] ||
    null;

  try {
    const snapshot = startJob({
      payload,
      userId,
      projectId,
      worker: defaultGenerationWorker,
    });
    return res.status(202).json(snapshot);
  } catch (err) {
    return res.status(500).json({
      error: err?.message || "Failed to start generation job",
      code: "JOB_START_FAILED",
    });
  }
}

export const __generationJobStartInternals = {
  defaultGenerationWorker,
  makeReqShim,
  makeResShim,
};

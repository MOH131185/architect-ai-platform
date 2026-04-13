export const config = {
  runtime: "nodejs",
  maxDuration: 60,
};

export function setCors(res, methods = "POST, OPTIONS") {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export function handleOptions(req, res, methods = "POST, OPTIONS") {
  setCors(res, methods);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }
  return false;
}

export function rejectInvalidMethod(req, res, method = "POST") {
  if (req.method !== method) {
    res.status(405).json({
      success: false,
      error: "METHOD_NOT_ALLOWED",
      message: `Use ${method} for this endpoint.`,
    });
    return true;
  }
  return false;
}

export function sendError(res, status, error, message, details = null) {
  return res.status(status).json({
    success: false,
    error,
    message,
    details,
  });
}

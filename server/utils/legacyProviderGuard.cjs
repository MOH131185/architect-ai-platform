const LEGACY_MODEL_ROUTE_ISSUE_CODE = 'LEGACY_MODEL_ROUTE_USED';

function normalizeMode(value) {
  return String(value || '').trim().toLowerCase().replace(/[-\s]/g, '_');
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(
    String(value || '').trim().toLowerCase()
  );
}

function isLegacyMode(value) {
  const mode = normalizeMode(value);
  return mode === 'multi_panel' || mode === 'multipanel';
}

function isLegacyProviderEnabled({ env = process.env, requestBody = {} } = {}) {
  const requestMode =
    requestBody.pipelineMode ||
    requestBody.workflow ||
    requestBody.mode ||
    requestBody.metadata?.pipelineMode ||
    requestBody.metadata?.workflow ||
    requestBody.proof?.resolvedMode ||
    null;

  return (
    isLegacyMode(requestMode) ||
    isLegacyMode(env.REACT_APP_PIPELINE_MODE) ||
    isLegacyMode(env.PIPELINE_MODE) ||
    isTruthy(env.REACT_APP_USE_TOGETHER) ||
    isTruthy(env.USE_TOGETHER)
  );
}

function rejectLegacyProviderIfDisabled(req, res, provider) {
  if (isLegacyProviderEnabled({ requestBody: req.body || {} })) {
    return false;
  }

  res.status(409).json({
    error: {
      code: LEGACY_MODEL_ROUTE_ISSUE_CODE,
      message: `${provider} is a legacy provider route. Set PIPELINE_MODE=multi_panel or REACT_APP_USE_TOGETHER=true to use it explicitly.`,
      details: {
        provider,
        pipelineMode:
          process.env.REACT_APP_PIPELINE_MODE ||
          process.env.PIPELINE_MODE ||
          'project_graph',
      },
    },
  });
  return true;
}

module.exports = {
  LEGACY_MODEL_ROUTE_ISSUE_CODE,
  isLegacyProviderEnabled,
  rejectLegacyProviderIfDisabled,
};

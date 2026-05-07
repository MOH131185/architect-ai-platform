export const DWG_CONVERSION_ADAPTER_VERSION = "dwg-conversion-adapter-v1";
export const DWG_CONVERSION_UNAVAILABLE = "DWG_CONVERSION_UNAVAILABLE";

const SUPPORTED_PROVIDERS = Object.freeze(["oda", "aps", "local_oda"]);

function defaultEnv() {
  return typeof process !== "undefined" && process.env ? process.env : {};
}

function normalizeEnv(env) {
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    return {};
  }
  return env;
}

export class DwgConversionUnavailableError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DwgConversionUnavailableError";
    this.code = DWG_CONVERSION_UNAVAILABLE;
    this.details = details;
  }
}

export function resolveDwgConversionCapabilities(env = defaultEnv()) {
  const source = normalizeEnv(env);
  const provider = String(
    source.DWG_CONVERSION_PROVIDER ||
      source.REACT_APP_DWG_CONVERSION_PROVIDER ||
      "",
  )
    .trim()
    .toLowerCase();
  const enabled =
    source.DWG_CONVERSION_ENABLED === "true" ||
    source.REACT_APP_DWG_CONVERSION_ENABLED === "true";
  const hasProvider = SUPPORTED_PROVIDERS.includes(provider);
  const hasOdaPath = Boolean(
    source.ODA_FILE_CONVERTER_PATH ||
    source.ODA_SDK_PATH ||
    source.REACT_APP_ODA_FILE_CONVERTER_PATH,
  );
  const hasApsConfig = Boolean(
    source.AUTODESK_APS_CLIENT_ID && source.AUTODESK_APS_CLIENT_SECRET,
  );
  const configured =
    enabled &&
    hasProvider &&
    ((provider === "aps" && hasApsConfig) ||
      ((provider === "oda" || provider === "local_oda") && hasOdaPath));

  return {
    adapterVersion: DWG_CONVERSION_ADAPTER_VERSION,
    code: configured ? null : DWG_CONVERSION_UNAVAILABLE,
    available: configured,
    enabled,
    provider: hasProvider ? provider : null,
    supportedProviders: [...SUPPORTED_PROVIDERS],
    reason: configured
      ? null
      : !enabled
        ? "DWG conversion is disabled. DXF is the guaranteed CAD output."
        : !hasProvider
          ? "DWG_CONVERSION_PROVIDER must be one of oda, local_oda, or aps."
          : provider === "aps" && !hasApsConfig
            ? "Autodesk APS client credentials are missing."
            : "ODA converter or SDK path is missing.",
  };
}

export async function convertDxfToDwg({
  dxf,
  outputName = "architect-ai-output.dwg",
  env = defaultEnv(),
} = {}) {
  if (!dxf || typeof dxf !== "string") {
    throw new Error("DXF content is required for DWG conversion.");
  }

  const capabilities = resolveDwgConversionCapabilities(env);
  if (!capabilities.available) {
    throw new DwgConversionUnavailableError(capabilities.reason, capabilities);
  }

  throw new Error(
    `DWG provider "${capabilities.provider}" is configured but no runtime converter implementation is wired yet for ${outputName}.`,
  );
}

export default {
  DWG_CONVERSION_ADAPTER_VERSION,
  DWG_CONVERSION_UNAVAILABLE,
  DwgConversionUnavailableError,
  resolveDwgConversionCapabilities,
  convertDxfToDwg,
};

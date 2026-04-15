export const PHASE5_PUBLIC_API_VERSION = "phase5-repair-dependency-compose-v1";
export const PHASE5_SCHEMA_ENGINE_VERSION = "phase5-json-schema-registry-v1";

const ENDPOINT_PUBLIC_API_VERSIONS = {
  "generate-project": PHASE5_PUBLIC_API_VERSION,
  "regenerate-layer": PHASE5_PUBLIC_API_VERSION,
  "repair-project": PHASE5_PUBLIC_API_VERSION,
  "project-readiness": PHASE5_PUBLIC_API_VERSION,
  "plan-a1-panels": PHASE5_PUBLIC_API_VERSION,
  "validate-project": PHASE5_PUBLIC_API_VERSION,
};

export function getPublicApiVersion(endpoint = "") {
  return (
    ENDPOINT_PUBLIC_API_VERSIONS[String(endpoint || "").trim()] ||
    PHASE5_PUBLIC_API_VERSION
  );
}

export function getSchemaEngineVersion() {
  return PHASE5_SCHEMA_ENGINE_VERSION;
}

export function getContractDescriptor(endpoint = "", options = {}) {
  return {
    endpoint,
    contractVersion: getPublicApiVersion(endpoint),
    schemaEngineVersion: getSchemaEngineVersion(),
    deprecatedAliases: options.deprecatedAliases || [],
  };
}

export default {
  PHASE5_PUBLIC_API_VERSION,
  PHASE5_SCHEMA_ENGINE_VERSION,
  getPublicApiVersion,
  getSchemaEngineVersion,
  getContractDescriptor,
};

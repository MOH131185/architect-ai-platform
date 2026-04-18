export const PHASE5_PUBLIC_API_VERSION = "phase5-repair-dependency-compose-v1";
export const PHASE5_SCHEMA_ENGINE_VERSION = "phase5-json-schema-registry-v1";
export const PHASE6_PUBLIC_API_VERSION =
  "phase6-recovery-regeneration-orchestration-v1";
export const PHASE6_SCHEMA_ENGINE_VERSION =
  "phase6-schema-composition-migration-v1";
export const PHASE7_PUBLIC_API_VERSION =
  "phase7-technical-drawing-execution-v1";
export const PHASE7_SCHEMA_ENGINE_VERSION = "phase7-entity-execution-schema-v1";

const ENDPOINT_PUBLIC_API_VERSIONS = {
  "generate-project": PHASE7_PUBLIC_API_VERSION,
  "regenerate-layer": PHASE7_PUBLIC_API_VERSION,
  "repair-project": PHASE7_PUBLIC_API_VERSION,
  "project-readiness": PHASE7_PUBLIC_API_VERSION,
  "plan-a1-panels": PHASE7_PUBLIC_API_VERSION,
  "plan-regeneration": PHASE7_PUBLIC_API_VERSION,
  "execute-regeneration": PHASE7_PUBLIC_API_VERSION,
  "project-health": PHASE7_PUBLIC_API_VERSION,
  "validate-project": PHASE7_PUBLIC_API_VERSION,
};

export function getPublicApiVersion(endpoint = "") {
  return (
    ENDPOINT_PUBLIC_API_VERSIONS[String(endpoint || "").trim()] ||
    PHASE7_PUBLIC_API_VERSION
  );
}

export function getSchemaEngineVersion() {
  return PHASE7_SCHEMA_ENGINE_VERSION;
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
  PHASE6_PUBLIC_API_VERSION,
  PHASE6_SCHEMA_ENGINE_VERSION,
  PHASE7_PUBLIC_API_VERSION,
  PHASE7_SCHEMA_ENGINE_VERSION,
  getPublicApiVersion,
  getSchemaEngineVersion,
  getContractDescriptor,
};

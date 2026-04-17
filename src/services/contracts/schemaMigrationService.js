export function buildDeprecationMap(entries = {}) {
  return { ...entries };
}

export function describeSchemaMigration(
  schemaName = "",
  deprecatedProperties = {},
) {
  return {
    schemaName,
    deprecatedProperties: { ...deprecatedProperties },
    hasDeprecatedAliases: Object.keys(deprecatedProperties || {}).length > 0,
  };
}

export default {
  buildDeprecationMap,
  describeSchemaMigration,
};

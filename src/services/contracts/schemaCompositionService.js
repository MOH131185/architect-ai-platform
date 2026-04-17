export function nullable(schema = {}) {
  return {
    anyOf: [{ type: "null" }, schema],
  };
}

export function arrayOf(itemSchema = {}, options = {}) {
  return {
    type: "array",
    items: itemSchema,
    ...(options.minItems !== undefined ? { minItems: options.minItems } : {}),
    ...(options.maxItems !== undefined ? { maxItems: options.maxItems } : {}),
  };
}

export function objectSchema(properties = {}, options = {}) {
  return {
    type: "object",
    properties,
    ...(options.required ? { required: options.required } : {}),
    additionalProperties: options.additionalProperties ?? true,
  };
}

export default {
  nullable,
  arrayOf,
  objectSchema,
};

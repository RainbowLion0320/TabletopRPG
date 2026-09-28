/** Strict structured outputs require a closed object with every key declared.
 * Use the current roster for dictionaries; optional values can be nullable. */
export function rosterSchema(names: readonly string[], value: Record<string, unknown>) {
  const keys = [...new Set(names)];
  return {
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(keys.map((name) => [name, value])),
    required: keys
  };
}

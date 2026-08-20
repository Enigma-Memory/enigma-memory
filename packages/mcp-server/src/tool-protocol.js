export const MCP_TOOL_PROTOCOL_AUDIT_SCHEMA = 'enigma.mcp_tool_protocol_audit.v1';

export const MCP_TOOL_PROTOCOL_RULES = Object.freeze({
  principle: 'Tool-call reliability degrades with nesting, heterogeneous argument shapes, and clever packing.',
  preferred_shape: 'Use boring model-facing tools with a root object of primitive parameters; split nested workflows or resolve opaque refs inside the harness.',
  harness_boundary: 'The MCP server receives parsed JSON-RPC tool calls. Provider-specific model-output dialect repair belongs in the client harness before MCP dispatch.',
  validation_boundary: 'Descriptions and JSON Schema guide callers; Enigma still validates every argument and rejects unknown fields at execution.',
  scale_boundary: 'Native tool calls remain the ergonomic default when many operations are exposed; a compact text grammar is not treated as universally superior.',
});

function schemaTypes(schema) {
  if (!schema || typeof schema !== 'object') return [];
  if (Array.isArray(schema.type)) return schema.type.map(String);
  if (typeof schema.type === 'string') return [schema.type];
  if (schema.const !== undefined) return [typeof schema.const];
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return [...new Set(schema.enum.map((value) => typeof value))];
  return [];
}

function inspectSchema(schema, depth, metrics, rootProperty = false) {
  if (!schema || typeof schema !== 'object') return;
  metrics.max_depth = Math.max(metrics.max_depth, depth);
  const types = schemaTypes(schema);
  for (const type of types) metrics.types.add(type);
  if (rootProperty) {
    metrics.root_parameter_count += 1;
    for (const type of types) metrics.root_types.add(type);
  }
  if (Array.isArray(schema.anyOf)) {
    metrics.union_count += 1;
    for (const child of schema.anyOf) inspectSchema(child, depth + 1, metrics);
  }
  if (Array.isArray(schema.oneOf)) {
    metrics.union_count += 1;
    for (const child of schema.oneOf) inspectSchema(child, depth + 1, metrics);
  }
  if (Array.isArray(schema.allOf)) {
    metrics.composition_count += 1;
    for (const child of schema.allOf) inspectSchema(child, depth + 1, metrics);
  }
  if (schema.type === 'object' || schema.properties) {
    if (depth > 0) metrics.nested_object_count += 1;
    for (const child of Object.values(schema.properties ?? {})) inspectSchema(child, depth + 1, metrics, depth === 0);
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      metrics.dynamic_object_count += 1;
      inspectSchema(schema.additionalProperties, depth + 1, metrics);
    }
  }
  if (schema.type === 'array' || schema.items) {
    metrics.array_count += 1;
    if (Array.isArray(schema.items)) {
      metrics.tuple_count += 1;
      for (const child of schema.items) inspectSchema(child, depth + 1, metrics);
    } else {
      inspectSchema(schema.items, depth + 1, metrics);
    }
  }
}

function inspectTool(tool) {
  if (!tool || typeof tool !== 'object' || typeof tool.name !== 'string' || !tool.inputSchema || typeof tool.inputSchema !== 'object') {
    throw new TypeError('Each MCP tool descriptor requires name and inputSchema');
  }
  const metrics = {
    root_parameter_count: 0,
    max_depth: 0,
    nested_object_count: 0,
    dynamic_object_count: 0,
    array_count: 0,
    tuple_count: 0,
    union_count: 0,
    composition_count: 0,
    types: new Set(),
    root_types: new Set(),
  };
  inspectSchema(tool.inputSchema, 0, metrics);
  const root_type_count = metrics.root_types.size;
  const complexity_score = (metrics.nested_object_count * 10)
    + (metrics.dynamic_object_count * 8)
    + (metrics.array_count * 5)
    + (metrics.tuple_count * 4)
    + (metrics.union_count * 8)
    + (metrics.composition_count * 6)
    + (Math.max(0, metrics.max_depth - 1) * 3)
    + Math.max(0, root_type_count - 3);
  const flat_primitive = metrics.nested_object_count === 0
    && metrics.dynamic_object_count === 0
    && metrics.array_count === 0
    && metrics.union_count === 0
    && metrics.composition_count === 0
    && metrics.max_depth <= 1;
  const schema_characters = JSON.stringify(tool.inputSchema).length;
  return Object.freeze({
    name: tool.name,
    grade: flat_primitive ? 'flat' : complexity_score <= 12 ? 'moderate' : 'complex',
    flat_primitive,
    complexity_score,
    root_parameter_count: metrics.root_parameter_count,
    root_type_count,
    max_depth: metrics.max_depth,
    nested_object_count: metrics.nested_object_count,
    dynamic_object_count: metrics.dynamic_object_count,
    array_count: metrics.array_count,
    tuple_count: metrics.tuple_count,
    union_count: metrics.union_count,
    composition_count: metrics.composition_count,
    schema_characters,
    estimated_schema_tokens: Math.ceil(schema_characters / 4),
  });
}

export function analyzeMcpToolProtocol(descriptors) {
  if (!Array.isArray(descriptors)) throw new TypeError('analyzeMcpToolProtocol requires a descriptor array');
  const tools = descriptors.map(inspectTool).sort((left, right) => left.name.localeCompare(right.name));
  const flatTools = tools.filter((tool) => tool.flat_primitive);
  const complexTools = tools.filter((tool) => tool.grade === 'complex');
  const totalSchemaCharacters = tools.reduce((sum, tool) => sum + tool.schema_characters, 0);
  return Object.freeze({
    schema: MCP_TOOL_PROTOCOL_AUDIT_SCHEMA,
    rules: MCP_TOOL_PROTOCOL_RULES,
    summary: Object.freeze({
      tool_count: tools.length,
      flat_primitive_tool_count: flatTools.length,
      moderate_tool_count: tools.length - flatTools.length - complexTools.length,
      complex_tool_count: complexTools.length,
      total_schema_characters: totalSchemaCharacters,
      estimated_total_schema_tokens: Math.ceil(totalSchemaCharacters / 4),
      reliability_guarantee: false,
    }),
    tools: Object.freeze(tools),
    recommendations: Object.freeze([
      'Keep new model-facing schemas flat and primitive unless a measured task requires structure.',
      'Prefer opaque refs and harness-side lookup over asking the model to reproduce nested artifacts.',
      'Reject unknown arguments and validate semantics after syntax succeeds.',
      'Measure no-call replies, malformed calls, retries, latency, and total input/output/reasoning cost per model family.',
      'Do not interpret a JSON-Schema strict mode as proof of semantic tool reliability.',
    ]),
  });
}

// DevControl MCP tool contract.
// The contract is transport-independent: callers inject bounded core handlers.
export const MCP_TOOLS = Object.freeze([
  ['adopt_project', 'Analyze and register a GitHub project into DevControl.'],
  ['qualify_project', 'Run the project qualification pipeline and collect results.'],
  ['analyze_failure', 'Analyze qualification failures and produce repair guidance.'],
  ['repair_project', 'Create a controlled repair plan for a project.'],
  ['get_project_status', 'Return current project state and latest reports.'],
].map(([name, description]) => Object.freeze({
  name,
  description,
  inputSchema: Object.freeze({ type: 'object', additionalProperties: true }),
})));

export function getMcpToolNames() {
  return MCP_TOOLS.map((tool) => tool.name);
}

export function createToolContract(core = {}) {
  return MCP_TOOLS.map((definition) => ({
    ...definition,
    handler: async (args = {}) => {
      const handler = core[definition.name];
      if (typeof handler !== 'function') {
        throw new Error(`MCP tool is not configured: ${definition.name}`);
      }
      return handler(args);
    },
  }));
}

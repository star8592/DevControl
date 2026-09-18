// DevControl MCP tool contract foundation
// Exposes stable tool names for future MCP server adapters.

export const MCP_TOOLS = Object.freeze([
  {
    name: 'adopt_project',
    description: 'Analyze and register a GitHub project into DevControl.'
  },
  {
    name: 'qualify_project',
    description: 'Run project qualification pipeline and collect results.'
  },
  {
    name: 'analyze_failure',
    description: 'Analyze qualification failures and produce repair guidance.'
  },
  {
    name: 'repair_project',
    description: 'Create a controlled repair plan for a project.'
  },
  {
    name: 'get_project_status',
    description: 'Return current project state and latest reports.'
  }
]);

export function getMcpToolNames() {
  return MCP_TOOLS.map((tool) => tool.name);
}

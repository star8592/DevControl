import { createToolContract } from './mcp-tool-contract.mjs';

/**
 * Minimal MCP transport-independent server core.
 * The transport layer can be attached by stdio/http adapters later.
 */
export class DevControlMcpServer {
  constructor(core = {}) {
    this.core = core;
    this.tools = createToolContract(core);
  }

  listTools() {
    return this.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async callTool(name, args = {}) {
    const tool = this.tools.find((item) => item.name === name);
    if (!tool) {
      throw new Error(`Unknown MCP tool: ${name}`);
    }
    return tool.handler(args);
  }
}

export default DevControlMcpServer;

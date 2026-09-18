import test from 'node:test';
import assert from 'node:assert/strict';
import { DevControlMcpServer } from '../lib/mcp-server.mjs';
import { getMcpToolNames } from '../lib/mcp-tool-contract.mjs';
import { handleMcpMessage } from '../scripts/mcp-stdio.mjs';

test('MCP contract exposes stable tools and dispatches injected handlers', async () => {
  const server = new DevControlMcpServer({ get_project_status: async ({ project }) => ({ project, ok: true }) });
  assert.deepEqual(server.listTools().map(({ name }) => name), getMcpToolNames());
  assert.deepEqual(await server.callTool('get_project_status', { project: 'DevControl' }), { project: 'DevControl', ok: true });
  await assert.rejects(() => server.callTool('repair_project', {}), /not configured/);
});

test('stdio adapter implements initialize, tools list and bounded calls', async () => {
  const server = new DevControlMcpServer({ get_project_status: async () => ({ ok: true }) });
  const init = await handleMcpMessage(server, { jsonrpc: '2.0', id: 1, method: 'initialize' });
  assert.equal(init.result.serverInfo.name, 'devcontrol');
  const listed = await handleMcpMessage(server, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  assert.equal(listed.result.tools.length, 5);
  const called = await handleMcpMessage(server, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_project_status', arguments: {} } });
  assert.equal(called.result.isError, undefined);
});

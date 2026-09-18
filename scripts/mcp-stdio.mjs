#!/usr/bin/env node
import readline from 'node:readline';
import { DevControlMcpServer } from '../lib/mcp-server.mjs';

export function createStdioCore() {
  return {
    get_project_status: async ({ project } = {}) => ({
      ok: true,
      project: project ?? null,
      mode: 'observe',
      message: 'stdio transport is connected; state-changing handlers require an explicit local adapter',
    }),
  };
}

export async function handleMcpMessage(server, message) {
  const { id = null, method, params = {} } = message ?? {};
  if (method === 'initialize') {
    return { jsonrpc: '2.0', id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'devcontrol', version: '0.14.0' } } };
  }
  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: server.listTools() } };
  }
  if (method === 'tools/call') {
    try {
      const result = await server.callTool(params.name, params.arguments ?? {});
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result) }] } };
    } catch (error) {
      return { jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: error.message }] } };
    }
  }
  if (method?.startsWith('notifications/')) return null;
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const server = new DevControlMcpServer(createStdioCore());
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let response;
    try { response = await handleMcpMessage(server, JSON.parse(line)); }
    catch (error) { response = { jsonrpc: '2.0', id: null, error: { code: -32700, message: error.message } }; }
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  }
}

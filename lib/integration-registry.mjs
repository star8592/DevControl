import { readFile } from 'node:fs/promises';
import path from 'node:path';

const VALID_MODES = new Set(['supervised', 'read-only', 'disabled']);
const VALID_TRANSPORTS = new Set(['local-cli', 'local-launcher', 'api', 'openai-compatible-http']);

function assert(condition, message) {
  if (!condition) throw new Error(`Integration registry error: ${message}`);
}

function normalizeIntegration(key, value) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${key} must be an object`);
  const enabled = Boolean(value.enabled);
  const mode = value.mode || (enabled ? 'supervised' : 'disabled');
  assert(VALID_MODES.has(mode), `${key}.mode is invalid`);
  assert(typeof value.transport === 'string' && VALID_TRANSPORTS.has(value.transport), `${key}.transport is invalid`);
  const capabilities = Array.isArray(value.capabilities) ? [...new Set(value.capabilities.map(String))] : [];
  assert(capabilities.every(item => /^[a-z0-9][a-z0-9-]{0,63}$/i.test(item)), `${key}.capabilities contains an invalid capability`);

  return {
    key,
    ...value,
    enabled,
    mode,
    capabilities
  };
}

function publicIntegration(integration) {
  const allowed = [
    'key', 'enabled', 'mode', 'transport', 'capabilities', 'allowProjectPathsOnly',
    'allowArbitraryShell', 'requireApprovalFor', 'writeCommands', 'command', 'note'
  ];
  const result = {};
  for (const field of allowed) {
    if (integration[field] !== undefined) result[field] = integration[field];
  }
  if (integration.endpoint) {
    try {
      const url = new URL(integration.endpoint);
      result.endpoint = `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`;
    } catch {
      result.endpoint = 'configured';
    }
  }
  return result;
}

export async function loadIntegrationRegistry(rootDir) {
  const configuredPath = process.env.DEVCONTROL_INTEGRATIONS_FILE;
  const candidates = configuredPath
    ? [path.resolve(configuredPath)]
    : [
        path.join(rootDir, 'config', 'integrations.json'),
        path.join(rootDir, 'config', 'integrations.example.json')
      ];

  let filePath = null;
  let raw = null;
  for (const candidate of candidates) {
    try {
      raw = JSON.parse(await readFile(candidate, 'utf8'));
      filePath = candidate;
      break;
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw new Error(`Integration registry error: cannot load ${candidate}: ${error.message}`);
    }
  }

  assert(raw, 'no integration registry file found');
  assert(raw.integrations && typeof raw.integrations === 'object', 'integrations must be an object');
  const integrations = Object.entries(raw.integrations).map(([key, value]) => normalizeIntegration(key, value));
  assert(new Set(integrations.map(item => item.key)).size === integrations.length, 'integration keys must be unique');

  const security = {
    bindLocalhostOnly: raw.security?.bindLocalhostOnly !== false,
    browserNeverReceivesTokens: raw.security?.browserNeverReceivesTokens !== false,
    rejectArbitraryCommandText: raw.security?.rejectArbitraryCommandText !== false,
    auditEveryWriteAction: raw.security?.auditEveryWriteAction !== false,
    defaultWritePolicy: raw.security?.defaultWritePolicy || 'deny'
  };
  assert(security.defaultWritePolicy === 'deny', 'defaultWritePolicy must remain deny');

  return {
    filePath,
    integrations,
    byKey: Object.fromEntries(integrations.map(item => [item.key, item])),
    security,
    publicView: {
      file: path.basename(filePath),
      integrations: integrations.map(publicIntegration),
      security
    }
  };
}

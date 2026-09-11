import { createHash } from 'node:crypto';

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ROLE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const TARGET_SOURCES = new Set([
  'human-approved',
  'generated-from-current',
  'reference-adaptation',
]);

function assert(condition, message) {
  if (!condition) throw new Error(`VisualLoop contract error: ${message}`);
}

function clean(value, field, max = 500) {
  const text = String(value ?? '').trim();
  assert(text, `${field} is required`);
  assert(text.length <= max, `${field} exceeds ${max} characters`);
  return text;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

export function validateVisualContract(contract) {
  assert(contract && typeof contract === 'object' && !Array.isArray(contract), 'contract must be an object');
  assert(contract.schemaVersion === 1, 'schemaVersion must be 1');
  assert(contract.state === 'frozen', 'state must be frozen before judging');

  const contractId = clean(contract.contractId, 'contractId', 160);
  const project = clean(contract.project, 'project', 160);
  const frozenAt = clean(contract.frozenAt, 'frozenAt', 80);
  assert(Number.isFinite(Date.parse(frozenAt)), 'frozenAt must be an ISO-like timestamp');

  assert(Array.isArray(contract.requiredRoles) && contract.requiredRoles.length > 0, 'requiredRoles must be a nonempty array');
  const requiredRoles = [...new Set(contract.requiredRoles.map(role => clean(role, 'requiredRoles role', 64)))];
  assert(requiredRoles.length === contract.requiredRoles.length, 'requiredRoles must be unique');
  assert(requiredRoles.every(role => SAFE_ROLE.test(role)), 'requiredRoles contains an invalid role');

  assert(contract.targets && typeof contract.targets === 'object' && !Array.isArray(contract.targets), 'targets must be an object');
  const targets = {};
  for (const role of requiredRoles) {
    const target = contract.targets[role];
    assert(target && typeof target === 'object' && !Array.isArray(target), `target missing for required role: ${role}`);
    const path = clean(target.path, `targets.${role}.path`, 500);
    assert(!path.startsWith('/') && !path.includes('..'), `targets.${role}.path must be repository-relative and traversal-free`);
    assert(/\.(png|jpe?g|webp)$/i.test(path), `targets.${role}.path must be a supported image`);
    const sha256 = clean(target.sha256, `targets.${role}.sha256`, 64).toLowerCase();
    assert(SHA256.test(sha256), `targets.${role}.sha256 must be a 64-character SHA-256 hex digest`);
    const source = clean(target.source, `targets.${role}.source`, 80);
    assert(TARGET_SOURCES.has(source), `targets.${role}.source is invalid`);
    targets[role] = {
      path,
      sha256,
      source,
      note: target.note ? clean(target.note, `targets.${role}.note`, 1200) : null,
    };
  }

  return {
    schemaVersion: 1,
    state: 'frozen',
    contractId,
    project,
    frozenAt,
    requiredRoles,
    targets,
    engineProfile: contract.engineProfile ? clean(contract.engineProfile, 'engineProfile', 160) : null,
    sourceBaselineCommit: contract.sourceBaselineCommit ? clean(contract.sourceBaselineCommit, 'sourceBaselineCommit', 80) : null,
  };
}

export function contractFingerprint(contract) {
  const normalized = validateVisualContract(contract);
  return createHash('sha256').update(JSON.stringify(stable(normalized))).digest('hex');
}

export function assertRoundMatchesContract(manifest, contract) {
  const normalized = validateVisualContract(contract);
  assert(manifest && typeof manifest === 'object' && !Array.isArray(manifest), 'manifest must be an object');
  assert(manifest.contract_id === normalized.contractId, `round contract_id ${manifest.contract_id || '(missing)'} does not match frozen contract ${normalized.contractId}`);

  const roles = new Set((manifest.captures || []).filter(item => item?.required === true).map(item => item?.role));
  for (const role of normalized.requiredRoles) {
    assert(roles.has(role), `round does not contain required production capture role: ${role}`);
  }
  return true;
}

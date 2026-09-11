import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import { contractFingerprint, validateVisualContract, verifyVisualContractTargetFiles } from './contract.mjs';

const SAFE_ROLE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const SOURCES = new Set(['human-approved', 'generated-from-current', 'reference-adaptation']);

function assert(condition, message) {
  if (!condition) throw new Error(`VisualLoop freeze error: ${message}`);
}

function clean(value, field, max = 1200) {
  const text = String(value ?? '').trim();
  assert(text, `${field} is required`);
  assert(text.length <= max, `${field} exceeds ${max} characters`);
  return text;
}

function validateDraft(draft) {
  assert(draft && typeof draft === 'object' && !Array.isArray(draft), 'draft must be an object');
  assert(draft.schemaVersion === 1, 'draft schemaVersion must be 1');
  assert(draft.state === 'draft', 'input contract must be in draft state');
  const contractId = clean(draft.contractId, 'draft.contractId', 160);
  const project = clean(draft.project, 'draft.project', 160);
  assert(Array.isArray(draft.requiredRoles) && draft.requiredRoles.length > 0, 'draft.requiredRoles must be nonempty');
  const requiredRoles = [...draft.requiredRoles];
  assert(new Set(requiredRoles).size === requiredRoles.length, 'draft.requiredRoles must be unique');
  for (const role of requiredRoles) {
    assert(typeof role === 'string' && SAFE_ROLE.test(role), `invalid draft role: ${role}`);
  }
  return {
    contractId,
    project,
    requiredRoles,
    engineProfile: draft.engineProfile ? clean(draft.engineProfile, 'draft.engineProfile', 160) : null,
    sourceBaselineCommit: draft.sourceBaselineCommit ? clean(draft.sourceBaselineCommit, 'draft.sourceBaselineCommit', 80) : null,
  };
}

function validateTargetSet(targetSet, draft) {
  assert(targetSet && typeof targetSet === 'object' && !Array.isArray(targetSet), 'target set must be an object');
  assert(targetSet.schemaVersion === 1, 'target-set schemaVersion must be 1');
  assert(targetSet.contractId === draft.contractId, `target-set contractId must equal ${draft.contractId}`);
  assert(targetSet.approvalState === 'approved', 'target-set approvalState must be approved');
  const approvedAt = clean(targetSet.approvedAt, 'targetSet.approvedAt', 80);
  assert(Number.isFinite(Date.parse(approvedAt)), 'targetSet.approvedAt must be an ISO-like timestamp');
  const approvedBy = clean(targetSet.approvedBy, 'targetSet.approvedBy', 160);
  assert(targetSet.targets && typeof targetSet.targets === 'object' && !Array.isArray(targetSet.targets), 'targetSet.targets must be an object');

  const targets = {};
  for (const role of draft.requiredRoles) {
    const item = targetSet.targets[role];
    assert(item && typeof item === 'object' && !Array.isArray(item), `approved target missing for role: ${role}`);
    assert(item.approved === true, `target ${role} must be explicitly approved`);
    const targetPath = clean(item.path, `targets.${role}.path`, 500);
    assert(!path.isAbsolute(targetPath) && !targetPath.includes('..'), `targets.${role}.path must be relative and traversal-free`);
    assert(/\.(png|jpe?g|webp)$/i.test(targetPath), `targets.${role}.path must be a supported image`);
    const source = clean(item.source, `targets.${role}.source`, 80);
    assert(SOURCES.has(source), `targets.${role}.source is invalid`);
    targets[role] = {
      path: targetPath,
      source,
      note: item.note ? clean(item.note, `targets.${role}.note`, 1200) : null,
    };
  }

  return { approvedAt, approvedBy, targets };
}

async function hashApprovedTarget(root, target, role) {
  const realRoot = await realpath(path.resolve(root));
  const requested = path.resolve(realRoot, target.path);
  let resolved;
  let bytes;
  try {
    resolved = await realpath(requested);
    const relative = path.relative(realRoot, resolved);
    assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `target ${role} escapes target root`);
    bytes = await readFile(resolved);
  } catch (error) {
    if (String(error?.message || '').startsWith('VisualLoop freeze error:')) throw error;
    throw new Error(`VisualLoop freeze error: target file unavailable for ${role}: ${target.path}`);
  }
  return createHash('sha256').update(bytes).digest('hex');
}

export async function freezeVisualContract({ draft, targetSet, targetRoot } = {}) {
  const normalizedDraft = validateDraft(draft);
  const normalizedTargetSet = validateTargetSet(targetSet, normalizedDraft);

  const targets = {};
  for (const role of normalizedDraft.requiredRoles) {
    const target = normalizedTargetSet.targets[role];
    targets[role] = {
      ...target,
      sha256: await hashApprovedTarget(targetRoot, target, role),
    };
  }

  const frozen = {
    schemaVersion: 1,
    state: 'frozen',
    contractId: normalizedDraft.contractId,
    project: normalizedDraft.project,
    frozenAt: normalizedTargetSet.approvedAt,
    requiredRoles: normalizedDraft.requiredRoles,
    targets,
    engineProfile: normalizedDraft.engineProfile,
    sourceBaselineCommit: normalizedDraft.sourceBaselineCommit,
  };

  const normalizedFrozen = validateVisualContract(frozen);
  await verifyVisualContractTargetFiles(normalizedFrozen, targetRoot);
  return {
    contract: normalizedFrozen,
    fingerprint: contractFingerprint(normalizedFrozen),
    approvedBy: normalizedTargetSet.approvedBy,
  };
}

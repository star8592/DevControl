import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import {
  assertRoundMatchesContract,
  contractFingerprint,
  validateVisualContract,
  verifyVisualContractTargetFiles,
} from './contract.mjs';
import { buildJudgeInstruction, validateJudgeVerdict } from './judge.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(`VisualLoop packet error: ${message}`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function verifyBoundFile(root, relativePath, expectedSha256, label) {
  const realRoot = await realpath(path.resolve(root));
  const requested = path.resolve(realRoot, relativePath);
  let resolved;
  let bytes;
  try {
    resolved = await realpath(requested);
    const relative = path.relative(realRoot, resolved);
    assert(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `${label} escapes its allowed root`);
    bytes = await readFile(resolved);
  } catch (error) {
    if (String(error?.message || '').startsWith('VisualLoop packet error:')) throw error;
    throw new Error(`VisualLoop packet error: ${label} is unavailable: ${relativePath}`);
  }

  const actualSha256 = sha256(bytes);
  assert(actualSha256 === expectedSha256, `${label} SHA-256 mismatch: expected ${expectedSha256}, got ${actualSha256}`);
  return {
    path: relativePath,
    sha256: actualSha256,
    bytes: bytes.byteLength,
  };
}

export async function buildJudgePacket({
  contract,
  manifest,
  targetRoot,
  captureRoot,
  previousVerdict = null,
  passScore = 8.5,
} = {}) {
  const normalizedContract = validateVisualContract(contract);
  assertRoundMatchesContract(manifest, normalizedContract);
  const targetVerification = await verifyVisualContractTargetFiles(normalizedContract, targetRoot);

  assert(manifest?.evidence_complete === true, 'round evidence must be complete before judging');
  assert(manifest?.gates?.runtime?.state === 'pass', 'runtime gate must pass before judging');
  assert(manifest?.gates?.evidence?.state === 'pass', 'evidence gate must pass before judging');
  assert(manifest?.qualified !== true, 'capture manifest must not pre-declare qualification');

  const requiredCaptures = new Map(
    (manifest.captures || [])
      .filter(item => item?.required === true)
      .map(item => [item.role, item]),
  );

  const views = {};
  for (const role of normalizedContract.requiredRoles) {
    const capture = requiredCaptures.get(role);
    assert(capture, `required current capture is missing: ${role}`);
    assert(capture.exists === true, `current capture is not marked present: ${role}`);
    assert(capture.resolution_ok === true, `current capture has wrong resolution: ${role}`);
    assert(capture.origin === 'godot-production', `current capture is not Godot production evidence: ${role}`);
    assert(capture.fallback_capture !== true, `fallback capture rejected: ${role}`);
    assert(capture.editor_preview !== true, `editor preview rejected: ${role}`);
    assert(capture.generated_target_presented_as_production !== true, `generated target masquerading as production rejected: ${role}`);
    assert(typeof capture.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(capture.sha256), `current capture SHA-256 missing: ${role}`);

    const current = await verifyBoundFile(captureRoot, capture.path, capture.sha256.toLowerCase(), `current capture ${role}`);
    const target = targetVerification.verifiedTargets[role];
    assert(target, `verified frozen target is missing: ${role}`);

    views[role] = {
      target,
      current: {
        ...current,
        width: capture.width,
        height: capture.height,
        origin: capture.origin,
      },
    };
  }

  const normalizedPreviousVerdict = previousVerdict
    ? validateJudgeVerdict(previousVerdict, { requiredRoles: normalizedContract.requiredRoles })
    : null;

  return {
    schemaVersion: 1,
    kind: 'visual-loop-judge-packet',
    contract: {
      contractId: normalizedContract.contractId,
      fingerprint: contractFingerprint(normalizedContract),
      frozenAt: normalizedContract.frozenAt,
      requiredRoles: normalizedContract.requiredRoles,
    },
    round: {
      roundId: manifest.round_id,
      commitSha: manifest.commit_sha,
      runnerIdentity: manifest.runner_identity,
      engine: manifest.engine,
      engineVersion: manifest.engine_version,
      renderer: manifest.renderer,
      rendererDevice: manifest.renderer_device,
      resolution: manifest.resolution,
    },
    instruction: buildJudgeInstruction({
      passScore,
      requiredRoles: normalizedContract.requiredRoles,
    }),
    views,
    previousVerdict: normalizedPreviousVerdict,
    performance: manifest.gates?.performance || null,
  };
}

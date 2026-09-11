import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  validateVisualContract,
  contractFingerprint,
  assertRoundMatchesContract,
  verifyVisualContractTargetFiles,
} from '../lib/visual-loop/contract.mjs';

const digest = 'a'.repeat(64);

function contract() {
  return {
    schemaVersion: 1,
    state: 'frozen',
    contractId: 'daolife-first-playable-visual-v1',
    project: 'DaoLife',
    frozenAt: '2026-09-11T09:00:00Z',
    engineProfile: 'godot-production',
    sourceBaselineCommit: 'abc123',
    requiredRoles: ['gameplay_hero', 'character_close'],
    targets: {
      gameplay_hero: {
        path: 'targets/gameplay_hero.png',
        sha256: digest,
        source: 'generated-from-current',
      },
      character_close: {
        path: 'targets/character_close.png',
        sha256: 'b'.repeat(64),
        source: 'human-approved',
      },
    },
  };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

test('frozen target contract requires one hashed image per required role', () => {
  const normalized = validateVisualContract(contract());
  assert.equal(normalized.state, 'frozen');
  assert.deepEqual(normalized.requiredRoles, ['gameplay_hero', 'character_close']);
  assert.equal(normalized.targets.gameplay_hero.sha256, digest);
});

test('target contract rejects missing target or moving/draft state', () => {
  const missing = contract();
  delete missing.targets.character_close;
  assert.throws(() => validateVisualContract(missing), /target missing/);

  const draft = contract();
  draft.state = 'draft';
  assert.throws(() => validateVisualContract(draft), /state must be frozen/);
});

test('contract fingerprint is stable and changes when target bytes change', () => {
  const first = contractFingerprint(contract());
  const reordered = contract();
  reordered.targets = {
    character_close: reordered.targets.character_close,
    gameplay_hero: reordered.targets.gameplay_hero,
  };
  assert.equal(contractFingerprint(reordered), first);

  const changed = contract();
  changed.targets.gameplay_hero.sha256 = 'c'.repeat(64);
  assert.notEqual(contractFingerprint(changed), first);
});

test('target verifier hashes real files and rejects tampering', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'visual-loop-contract-'));
  try {
    await mkdir(path.join(root, 'targets'), { recursive: true });
    const hero = Buffer.from('hero-target-v1');
    const character = Buffer.from('character-target-v1');
    await writeFile(path.join(root, 'targets/gameplay_hero.png'), hero);
    await writeFile(path.join(root, 'targets/character_close.png'), character);

    const frozen = contract();
    frozen.targets.gameplay_hero.sha256 = sha256(hero);
    frozen.targets.character_close.sha256 = sha256(character);

    const verified = await verifyVisualContractTargetFiles(frozen, root);
    assert.deepEqual(Object.keys(verified.verifiedTargets), ['gameplay_hero', 'character_close']);
    assert.equal(verified.verifiedTargets.character_close.bytes, character.byteLength);

    await writeFile(path.join(root, 'targets/character_close.png'), Buffer.from('tampered'));
    await assert.rejects(
      verifyVisualContractTargetFiles(frozen, root),
      /target SHA-256 mismatch for character_close/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('target verifier rejects missing files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'visual-loop-contract-missing-'));
  try {
    const frozen = contract();
    await assert.rejects(
      verifyVisualContractTargetFiles(frozen, root),
      /target file unavailable for gameplay_hero/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('round must point to exact frozen contract and contain its required roles', () => {
  const manifest = {
    contract_id: 'daolife-first-playable-visual-v1',
    captures: [
      { role: 'gameplay_hero', required: true },
      { role: 'character_close', required: true },
    ],
  };
  assert.equal(assertRoundMatchesContract(manifest, contract()), true);

  assert.throws(() => assertRoundMatchesContract({ ...manifest, contract_id: 'moved-target-v2' }, contract()), /does not match frozen contract/);
});

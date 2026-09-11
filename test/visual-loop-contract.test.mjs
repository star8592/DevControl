import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateVisualContract,
  contractFingerprint,
  assertRoundMatchesContract,
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
        path: '.devcontrol/visual-loop/targets/gameplay_hero.png',
        sha256: digest,
        source: 'generated-from-current',
      },
      character_close: {
        path: '.devcontrol/visual-loop/targets/character_close.png',
        sha256: 'b'.repeat(64),
        source: 'human-approved',
      },
    },
  };
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

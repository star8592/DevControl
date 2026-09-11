import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { freezeVisualContract } from '../lib/visual-loop/freeze.mjs';

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'visual-loop-freeze-'));
  await mkdir(path.join(root, 'targets'), { recursive: true });
  const roles = ['gameplay_hero', 'character_close'];
  for (const role of roles) {
    await writeFile(path.join(root, `targets/${role}.webp`), Buffer.from(`approved:${role}`));
  }
  const draft = {
    schemaVersion: 1,
    state: 'draft',
    contractId: 'freeze-test-v1',
    project: 'TestProject',
    frozenAt: null,
    engineProfile: 'godot-production',
    sourceBaselineCommit: 'abc123',
    requiredRoles: roles,
    blockingRoles: [],
  };
  const targetSet = {
    schemaVersion: 1,
    contractId: 'freeze-test-v1',
    approvalState: 'approved',
    approvedAt: '2026-09-11T10:30:00Z',
    approvedBy: 'owner',
    targets: {
      gameplay_hero: {
        approved: true,
        path: 'targets/gameplay_hero.webp',
        source: 'human-approved',
        note: 'approved hero target',
      },
      character_close: {
        approved: true,
        path: 'targets/character_close.webp',
        source: 'reference-adaptation',
        note: 'approved identity target',
      },
    },
  };
  return { root, draft, targetSet };
}

test('contract freezer hashes approved target bytes and emits frozen contract', async () => {
  const data = await fixture();
  try {
    const result = await freezeVisualContract({
      draft: data.draft,
      targetSet: data.targetSet,
      targetRoot: data.root,
    });
    assert.equal(result.contract.state, 'frozen');
    assert.equal(result.approvedBy, 'owner');
    assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
    const expected = digest(Buffer.from('approved:character_close'));
    assert.equal(result.contract.targets.character_close.sha256, expected);
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test('contract freezer fails closed when one role is not explicitly approved', async () => {
  const data = await fixture();
  try {
    data.targetSet.targets.character_close.approved = false;
    await assert.rejects(
      freezeVisualContract({ draft: data.draft, targetSet: data.targetSet, targetRoot: data.root }),
      /target character_close must be explicitly approved/,
    );
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

test('contract freezer rejects contract-id drift and missing roles', async () => {
  const data = await fixture();
  try {
    const wrong = structuredClone(data.targetSet);
    wrong.contractId = 'other-contract';
    await assert.rejects(
      freezeVisualContract({ draft: data.draft, targetSet: wrong, targetRoot: data.root }),
      /target-set contractId must equal freeze-test-v1/,
    );

    const missing = structuredClone(data.targetSet);
    delete missing.targets.character_close;
    await assert.rejects(
      freezeVisualContract({ draft: data.draft, targetSet: missing, targetRoot: data.root }),
      /approved target missing for role: character_close/,
    );
  } finally {
    await rm(data.root, { recursive: true, force: true });
  }
});

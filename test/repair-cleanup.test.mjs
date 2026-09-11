import assert from 'node:assert/strict';
import { mkdir, mkdtemp, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { assessRepairCleanup } from '../lib/repair-cleanup.mjs';

async function fixture(overrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'devcontrol-cleanup-'));
  const stateDir = path.join(root, 'state');
  const worktreeRoot = path.join(stateDir, 'worktrees');
  const worktree = path.join(worktreeRoot, 'demo-sig');
  await mkdir(worktree, { recursive: true });
  return {
    root,
    stateDir,
    project: { key: 'demo', localPath: path.join(root, 'demo'), ...overrides.project },
    review: {
      state: 'MERGED', signature: 'sig', mergeCommitSha: 'merge', ...overrides.review
    },
    attempt: {
      signature: 'sig', branch: 'devcontrol/repair/demo-sig', worktree,
      ...overrides.attempt
    },
    lifecycle: { knownGoodSha: 'known-good', ...overrides.lifecycle },
    latestQualification: {
      status: 'PASS', project: { sha: 'known-good' }, ...overrides.latestQualification
    }
  };
}

test('merged repair with qualified known-good mainline can enter cleanup verification', async () => {
  const input = await fixture();
  const result = assessRepairCleanup(input);
  assert.equal(result.eligible, true);
});

test('cleanup waits when mainline qualification is not known-good', async () => {
  const input = await fixture({
    latestQualification: { status: 'FAIL', project: { sha: 'other' } }
  });
  const result = assessRepairCleanup(input);
  assert.equal(result.eligible, false);
  assert.match(result.reasons.join('\n'), /qualification/i);
});

test('cleanup refuses worktrees outside DevControl state and unsafe branches', async () => {
  const input = await fixture();
  const outside = path.join(input.root, 'unmanaged-worktree');
  await mkdir(outside);
  input.attempt.branch = 'feature/manual';
  input.attempt.worktree = outside;
  const result = assessRepairCleanup(input);
  assert.equal(result.eligible, false);
  assert.match(result.reasons.join('\n'), /repair namespace/i);
  assert.match(result.reasons.join('\n'), /real path/i);
});

test('cleanup refuses a symlink that escapes state worktrees', async () => {
  const input = await fixture();
  const outside = path.join(input.root, 'outside');
  await mkdir(outside);
  const link = path.join(input.stateDir, 'worktrees', 'escape-link');
  await symlink(outside, link, 'dir');
  input.attempt.worktree = link;
  const result = assessRepairCleanup(input);
  assert.equal(result.eligible, false);
  assert.match(result.reasons.join('\n'), /real path/i);
});

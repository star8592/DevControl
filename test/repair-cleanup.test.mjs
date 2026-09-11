import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { assessRepairCleanup } from '../lib/repair-cleanup.mjs';

function fixture(overrides = {}) {
  const stateDir = '/tmp/devcontrol-state';
  return {
    stateDir,
    project: {
      key: 'demo',
      localPath: '/tmp/demo',
      ...overrides.project
    },
    review: {
      state: 'MERGED',
      signature: 'sig',
      mergeCommitSha: 'merge',
      ...overrides.review
    },
    attempt: {
      signature: 'sig',
      branch: 'devcontrol/repair/demo-sig',
      worktree: path.join(stateDir, 'worktrees', 'demo-sig'),
      ...overrides.attempt
    },
    lifecycle: {
      knownGoodSha: 'known-good',
      ...overrides.lifecycle
    },
    latestQualification: {
      status: 'PASS',
      project: { sha: 'known-good' },
      ...overrides.latestQualification
    }
  };
}

test('merged repair with qualified known-good mainline can enter cleanup verification', () => {
  const result = assessRepairCleanup(fixture());
  assert.equal(result.eligible, true);
});

test('cleanup waits when mainline qualification is not known-good', () => {
  const result = assessRepairCleanup(fixture({
    latestQualification: { status: 'FAIL', project: { sha: 'other' } }
  }));
  assert.equal(result.eligible, false);
  assert.match(result.reasons.join('\n'), /qualification/i);
});

test('cleanup refuses worktrees outside DevControl state and unsafe branches', () => {
  const result = assessRepairCleanup(fixture({
    attempt: { branch: 'feature/manual', worktree: '/tmp/unmanaged-worktree' }
  }));
  assert.equal(result.eligible, false);
  assert.match(result.reasons.join('\n'), /repair namespace/i);
  assert.match(result.reasons.join('\n'), /state\/worktrees/i);
});

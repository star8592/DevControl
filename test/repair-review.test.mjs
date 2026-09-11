import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyRepairReview } from '../lib/repair-review.mjs';

function fixture(overrides = {}) {
  return {
    candidate: {
      repairSha: 'repairsha',
      branch: 'devcontrol/repair/demo-abcdef',
      pr: { number: 42 },
      ...overrides.candidate
    },
    pullRequest: {
      state: 'open',
      draft: true,
      merged: false,
      merged_at: null,
      mergeable_state: 'clean',
      head: { sha: 'repairsha', ref: 'devcontrol/repair/demo-abcdef' },
      ...overrides.pullRequest
    },
    checkRuns: overrides.checkRuns || [],
    statuses: overrides.statuses || []
  };
}

test('matching repair PR with green CI becomes REVIEWABLE', () => {
  const review = classifyRepairReview(fixture({
    checkRuns: [{ name: 'CI', status: 'completed', conclusion: 'success' }]
  }));
  assert.equal(review.state, 'REVIEWABLE');
  assert.equal(review.checks.passed, 1);
});

test('repair PR with no CI remains AWAITING_CI', () => {
  const review = classifyRepairReview(fixture());
  assert.equal(review.state, 'AWAITING_CI');
});

test('failed CI blocks reviewability', () => {
  const review = classifyRepairReview(fixture({
    checkRuns: [{ name: 'CI', status: 'completed', conclusion: 'failure' }]
  }));
  assert.equal(review.state, 'CI_FAILED');
});

test('head SHA drift or base lag marks repair PR STALE', () => {
  const drifted = classifyRepairReview(fixture({
    pullRequest: {
      state: 'open',
      mergeable_state: 'clean',
      head: { sha: 'other', ref: 'devcontrol/repair/demo-abcdef' }
    }
  }));
  assert.equal(drifted.state, 'STALE');

  const behind = classifyRepairReview(fixture({
    pullRequest: {
      state: 'open',
      mergeable_state: 'behind',
      head: { sha: 'repairsha', ref: 'devcontrol/repair/demo-abcdef' }
    }
  }));
  assert.equal(behind.state, 'STALE');
});

test('merged repair PR is terminal MERGED regardless of CI state', () => {
  const review = classifyRepairReview(fixture({
    pullRequest: {
      state: 'closed',
      merged: true,
      merged_at: '2026-09-12T00:00:00Z',
      merge_commit_sha: 'mergedsha',
      head: { sha: 'repairsha', ref: 'devcontrol/repair/demo-abcdef' }
    }
  }));
  assert.equal(review.state, 'MERGED');
  assert.equal(review.mergeCommitSha, 'mergedsha');
});

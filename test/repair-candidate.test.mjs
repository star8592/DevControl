import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assessRepairCandidate,
  repairPrBody,
  repairPrTitle
} from '../lib/repair-candidate.mjs';

function fixture(overrides = {}) {
  const attempt = {
    status: 'CANDIDATE_READY',
    project: 'demo',
    repo: 'star8592/demo',
    signature: 'abcdef1234567890',
    failureSha: '1111111111111111111111111111111111111111',
    repairSha: '2222222222222222222222222222222222222222',
    branch: 'devcontrol/repair/demo-abcdef123456',
    worktree: '/tmp/devcontrol/demo',
    changedPaths: ['src/app.py', 'tests/test_app.py'],
    validation: {
      steps: [
        { command: 'pytest -q', passed: true, durationMs: 1234 }
      ]
    },
    ...overrides.attempt
  };
  const packet = {
    signature: attempt.signature,
    project: {
      key: 'demo',
      repo: 'star8592/demo',
      branch: 'main',
      sha: attempt.failureSha
    },
    failure: {
      failedCommand: 'pytest -q',
      categories: ['test_failure'],
      logExcerpt: 'SECRET_SHOULD_NEVER_APPEAR_IN_PR_BODY'
    },
    ...overrides.packet
  };
  const project = {
    key: 'demo',
    repo: 'star8592/demo',
    branch: 'main',
    ...overrides.project
  };
  const plan = {
    signature: attempt.signature,
    summary: 'Fix the smallest root cause.',
    steps: ['Reproduce the failing test.', 'Apply the minimal source fix.']
  };
  return { attempt, packet, project, plan };
}

test('validated isolated repair can become a repair candidate', () => {
  const { attempt, packet, project } = fixture();
  const result = assessRepairCandidate({ attempt, packet, project });
  assert.equal(result.eligible, true);
  assert.equal(result.baseBranch, 'main');
});

test('blocked paths and non-repair branch prevent publication', () => {
  const { attempt, packet, project } = fixture({
    attempt: {
      changedPaths: ['src/app.py', '.github/workflows/release.yml'],
      branch: 'feature/unsafe'
    }
  });
  const result = assessRepairCandidate({ attempt, packet, project });
  assert.equal(result.eligible, false);
  assert.match(result.reasons.join('\n'), /blocked path/i);
  assert.match(result.reasons.join('\n'), /repair namespace/i);
});

test('draft PR body excludes failure log content and documents validation', () => {
  const { attempt, packet, plan } = fixture();
  const body = repairPrBody({ attempt, packet, plan });
  assert.match(body, /DevControl Repair Candidate/);
  assert.match(body, /pytest -q/);
  assert.match(body, /PASS/);
  assert.equal(body.includes(packet.failure.logExcerpt), false);
  assert.match(repairPrTitle(attempt), /demo/);
});

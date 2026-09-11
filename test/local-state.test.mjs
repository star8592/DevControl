import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadLocalControlState } from '../lib/local-state.mjs';

test('local control state joins qualification repair candidate and PR review state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'devcontrol-state-'));
  const state = path.join(root, 'state');
  for (const dir of [
    'latest',
    'ai-queue',
    'repair-plans',
    'repair-attempts',
    'repair-candidates',
    'repair-reviews'
  ]) {
    await mkdir(path.join(state, dir), { recursive: true });
  }

  await writeFile(path.join(state, 'discovery.json'), JSON.stringify({
    generatedAt: '2026-01-01T00:00:00Z',
    projects: [{
      key: 'demo',
      name: 'Demo',
      repo: 'star8592/demo',
      localPath: '/tmp/demo',
      branch: 'main',
      sha: 'abc',
      dirty: false,
      stacks: ['node'],
      confidence: 1,
      registration: { state: 'REGISTERED', configuredKey: 'demo' },
      autonomy: { level: 'MANAGED', autoQualify: true, safeCommands: ['npm test'] }
    }]
  }));
  await writeFile(path.join(state, 'playbooks.json'), JSON.stringify({
    schemaVersion: 1,
    projects: { demo: { key: 'demo', observations: 3, runPassRate: 1 } }
  }));
  await writeFile(path.join(state, 'project-lifecycle.json'), JSON.stringify({
    schemaVersion: 1,
    projects: { demo: { key: 'demo', knownGoodSha: 'abc' } }
  }));
  await writeFile(path.join(state, 'latest', 'demo.json'), JSON.stringify({
    status: 'PASS',
    runId: 'r1',
    project: { key: 'demo', sha: 'abc' }
  }));
  await writeFile(path.join(state, 'ai-queue', 'demo-r0.json'), JSON.stringify({
    project: { key: 'demo', repo: 'star8592/demo', sha: 'old' },
    runId: 'r0',
    signature: 'sig',
    generatedAt: '2026-01-01T00:00:00Z',
    failure: { categories: ['test_failure'], failedCommand: 'npm test' }
  }));
  await writeFile(path.join(state, 'repair-plans', 'sig.json'), JSON.stringify({
    signature: 'sig',
    project: { key: 'demo', repo: 'star8592/demo', sha: 'old' },
    runId: 'r0',
    generatedAt: '2026-01-01T00:01:00Z',
    mode: 'PLAN_ONLY',
    provider: 'heuristic',
    confidence: 0.85,
    summary: 'Reproduce the failing test and repair the smallest regression.',
    steps: ['Reproduce npm test'],
    acceptance: ['npm test passes']
  }));
  await writeFile(path.join(state, 'repair-attempts', 'sig.json'), JSON.stringify({
    schemaVersion: 1,
    project: 'demo',
    repo: 'star8592/demo',
    signature: 'sig',
    failureSha: 'old',
    attemptedAt: '2026-01-01T00:02:00Z',
    status: 'CANDIDATE_READY',
    branch: 'devcontrol/repair/demo-sig',
    worktree: '/tmp/worktree',
    repairSha: 'repairsha',
    changedPaths: ['src/app.js'],
    pushed: true
  }));
  await writeFile(path.join(state, 'repair-candidates', 'sig.json'), JSON.stringify({
    schemaVersion: 1,
    project: 'demo',
    repo: 'star8592/demo',
    signature: 'sig',
    recordedAt: '2026-01-01T00:03:00Z',
    status: 'PR_READY',
    branch: 'devcontrol/repair/demo-sig',
    repairSha: 'repairsha',
    pushed: true,
    pushEnabled: true,
    prEnabled: true,
    pr: { number: 42, url: 'https://github.com/star8592/demo/pull/42', draft: true }
  }));
  await writeFile(path.join(state, 'repair-reviews', 'sig.json'), JSON.stringify({
    schemaVersion: 1,
    project: 'demo',
    repo: 'star8592/demo',
    signature: 'sig',
    candidateStatus: 'PR_READY',
    reviewedAt: '2026-01-01T00:04:00Z',
    state: 'REVIEWABLE',
    reasons: [],
    headSha: 'repairsha',
    headRef: 'devcontrol/repair/demo-sig',
    mergeableState: 'clean',
    checks: { total: 2, passed: 2, pending: 0, failed: 0 },
    pr: { number: 42, url: 'https://github.com/star8592/demo/pull/42' },
    draft: true
  }));

  const result = await loadLocalControlState(root);
  assert.equal(result.counts.total, 1);
  assert.equal(result.projects.demo.latestQualification.status, 'PASS');
  assert.equal(result.projects.demo.lifecycle.knownGoodSha, 'abc');
  assert.equal(result.projects.demo.playbook.observations, 3);
  assert.equal(result.projects.demo.failurePackets, 1);
  assert.equal(result.repairPlans.count, 1);
  assert.equal(result.projects.demo.latestRepairPlan.provider, 'heuristic');
  assert.equal(result.repairAttempts.count, 1);
  assert.equal(result.projects.demo.latestRepairAttempt.status, 'CANDIDATE_READY');
  assert.equal(result.repairCandidates.count, 1);
  assert.equal(result.projects.demo.latestRepairCandidate.pr.number, 42);
  assert.equal(result.repairReviews.count, 1);
  assert.equal(result.projects.demo.latestRepairReview.state, 'REVIEWABLE');
  assert.equal(result.projects.demo.latestRepairReview.checks.passed, 2);
});

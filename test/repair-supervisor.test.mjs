import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRepairPlan, heuristicPlan } from '../lib/repair-supervisor.mjs';

const packet = {
  signature: 'sig1',
  runId: 'run1',
  project: {
    key: 'demo',
    repo: 'star8592/demo',
    localPath: '/tmp/demo',
    sha: 'abc'
  },
  failure: {
    failedCommand: 'npm test',
    categories: ['test_failure'],
    logExcerpt: 'AssertionError: expected true'
  },
  history: {
    runPassRate: 0.75
  }
};

test('heuristic repair plan gives bounded test-failure strategy', () => {
  const plan = heuristicPlan(packet);
  assert.equal(plan.provider, 'heuristic');
  assert.ok(plan.steps.some(step => /Reproduce/.test(step)));
  assert.ok(plan.acceptance.some(step => /npm test/.test(step)));
});

test('repair supervisor defaults to PLAN_ONLY without invoking external tools', async () => {
  const plan = await buildRepairPlan({ packet });
  assert.equal(plan.mode, 'PLAN_ONLY');
  assert.equal(plan.provider, 'heuristic');
  assert.equal(plan.aiAnalysis, null);
  assert.ok(plan.confidence > 0.5);
});

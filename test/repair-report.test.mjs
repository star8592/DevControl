import assert from 'node:assert/strict';
import test from 'node:test';

import { repairPlanIssueComment } from '../lib/repair-report.mjs';

test('repair plan comment is clearly plan-only and includes acceptance gates', () => {
  const body = repairPlanIssueComment({
    mode: 'PLAN_ONLY',
    provider: 'heuristic',
    confidence: 0.85,
    signature: 'sig1',
    summary: 'Fix the narrow regression.',
    steps: ['Reproduce npm test', 'Fix the smallest root cause'],
    acceptance: ['npm test passes', 'full qualification passes'],
    aiAnalysis: null,
    plannerError: null
  });
  assert.match(body, /PLAN_ONLY/);
  assert.match(body, /Reproduce npm test/);
  assert.match(body, /npm test passes/);
  assert.match(body, /does not modify files/);
});

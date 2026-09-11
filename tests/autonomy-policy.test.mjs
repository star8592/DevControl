import assert from 'node:assert/strict';
import test from 'node:test';

import { AutonomyLevel, planProjectAutonomy } from '../lib/autonomy-policy.mjs';

function project(overrides = {}) {
  return {
    repo: 'star8592/example',
    dirty: false,
    confidence: 0.95,
    riskFlags: [],
    proposedQualify: [
      { command: 'cargo check --workspace', confidence: 0.96, risk: 'safe' }
    ],
    registration: { state: 'NEW', conflicts: [] },
    ...overrides
  };
}

test('high confidence clean project can enter automatic qualification', () => {
  const plan = planProjectAutonomy(project());
  assert.equal(plan.level, AutonomyLevel.QUALIFY);
  assert.equal(plan.autoRegister, true);
  assert.equal(plan.autoQualify, true);
});

test('dirty or migration-sensitive project stays shadow', () => {
  const plan = planProjectAutonomy(project({
    dirty: true,
    riskFlags: ['project-local auto_dev detected; candidate for migration into DevControl']
  }));
  assert.equal(plan.level, AutonomyLevel.SHADOW);
  assert.equal(plan.autoQualify, false);
});

test('registry conflict hard blocks automation', () => {
  const plan = planProjectAutonomy(project({
    registration: { state: 'CONFLICT', conflicts: ['path mismatch'] }
  }));
  assert.equal(plan.level, AutonomyLevel.BLOCKED);
});

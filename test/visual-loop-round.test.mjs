import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateVisualLoopRound } from '../lib/visual-loop/round.mjs';

const requiredRoles = ['gameplay_hero', 'character_close', 'architecture_close', 'alternate_45', 'rear_or_side'];

function manifest(performanceState = 'pass') {
  return {
    schema_version: 2,
    round_id: '100-1',
    commit_sha: 'abc123',
    evidence_complete: true,
    captures: requiredRoles.map(role => ({ role, required: true, exists: true, resolution_ok: true })),
    gates: {
      runtime: { state: 'pass' },
      evidence: { state: 'pass' },
      performance: { state: performanceState },
      visual: { state: 'pending_independent_judge' },
    },
  };
}

function verdict(value = 9, blockers = []) {
  return {
    schemaVersion: 1,
    views: Object.fromEntries(requiredRoles.map(role => [role, {
      scores: {
        composition: value,
        scale: value,
        character: value,
        architecture: value,
        materials: value,
        lighting: value,
        detail: value,
        motion: value,
      },
      summary: `${role} inspected against the frozen target.`,
    }])),
    blockers,
    summary: 'Independent production-art verdict.',
  };
}

test('round qualifies only after visual and clean performance gates pass', () => {
  const result = evaluateVisualLoopRound({ manifest: manifest('pass'), verdict: verdict(9) });
  assert.equal(result.score, 9);
  assert.equal(result.visualOk, true);
  assert.equal(result.performanceOk, true);
  assert.equal(result.loopState, 'qualified');
  assert.equal(result.qualified, true);
});

test('blocking visual defect prevents qualification even above score threshold', () => {
  const result = evaluateVisualLoopRound({
    manifest: manifest('pass'),
    verdict: verdict(9, [{
      role: 'architecture_close',
      dimension: 'materials',
      severity: 'blocking',
      code: 'flat-roof-material',
      observation: 'Roof reads as flat plastic rather than authored tile material.',
      action: 'Add tile breakup, roughness/normal variation, edge wear and authored ridge detail.',
    }]),
  });
  assert.equal(result.visualThresholdMet, true);
  assert.equal(result.visualOk, false);
  assert.equal(result.loopState, 'iterate_visuals');
  assert.equal(result.qualified, false);
});

test('clean visual result remains unqualified while performance evidence is contaminated', () => {
  const result = evaluateVisualLoopRound({
    manifest: manifest('inconclusive_external_load'),
    verdict: verdict(9),
  });
  assert.equal(result.visualOk, true);
  assert.equal(result.performanceInconclusive, true);
  assert.equal(result.loopState, 'performance_inconclusive');
  assert.equal(result.qualified, false);
});

test('round exposes visual regression against previous verdict', () => {
  const result = evaluateVisualLoopRound({
    manifest: manifest('pass'),
    verdict: verdict(8.6),
    previousVerdict: verdict(9.2),
    config: { regressionEpsilon: 0.15 },
  });
  assert.deepEqual(result.regression, { state: 'regressed', delta: -0.6 });
});

test('repeated blocker escalates to architectural reset instead of micro-tweaks', () => {
  const repeated = {
    role: 'character_close',
    dimension: 'character',
    severity: 'major',
    code: 'generic-silhouette',
    observation: 'Character silhouettes remain too similar at gameplay distance.',
    action: 'Replace the shared body construction with distinct authored silhouettes.',
  };
  const result = evaluateVisualLoopRound({
    manifest: manifest('pass'),
    verdict: verdict(7.8, [repeated]),
    history: [
      { score: 7.2, blockers: ['character_close:character:generic-silhouette'] },
    ],
    config: { stall: { repeatedBlockerRounds: 2, recentRounds: 2, minBestScoreImprovement: 1 } },
  });
  assert.equal(result.stall.stalled, true);
  assert.equal(result.loopState, 'architectural_reset_required');
});

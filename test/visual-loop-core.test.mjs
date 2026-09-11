import test from 'node:test';
import assert from 'node:assert/strict';

import {
  weightedVisualScore,
  classifyRegression,
  detectStall,
  evaluatePerformance,
  evaluateEvidence,
  decideLoopState,
} from '../lib/visual-loop/core.mjs';

test('weightedVisualScore aggregates only configured scored dimensions', () => {
  const score = weightedVisualScore(
    { composition: 9, lighting: 7 },
    { composition: 0.75, lighting: 0.25, materials: 0 },
  );
  assert.equal(score, 8.5);
});

test('classifyRegression detects improvement, neutrality and regression', () => {
  assert.deepEqual(classifyRegression(8.4, 8.0, 0.15), { state: 'improved', delta: 0.4 });
  assert.deepEqual(classifyRegression(8.1, 8.0, 0.15), { state: 'neutral', delta: 0.1 });
  assert.deepEqual(classifyRegression(7.7, 8.0, 0.15), { state: 'regressed', delta: -0.3 });
});

test('detectStall detects a score plateau', () => {
  const result = detectStall([
    { score: 6.0, blockers: ['flat lighting'] },
    { score: 6.4, blockers: ['thin roof'] },
    { score: 6.7, blockers: ['weak silhouette'] },
  ], { recentRounds: 2, minBestScoreImprovement: 1.0 });

  assert.equal(result.stalled, true);
  assert.equal(result.reasons.some((reason) => reason.type === 'score_plateau'), true);
});

test('detectStall detects repeated blockers', () => {
  const result = detectStall([
    { score: 7.1, blockers: ['Character too small', 'roof lacks depth'] },
    { score: 7.6, blockers: ['character too small', 'better rocks'] },
  ], { repeatedBlockerRounds: 2 });

  assert.equal(result.stalled, true);
  const repeated = result.reasons.find((reason) => reason.type === 'repeated_blocker');
  assert.deepEqual(repeated.blockers, ['character too small']);
});

test('evaluatePerformance separates visual acceptance from performance acceptance', () => {
  const result = evaluatePerformance(
    { averageFps: 72, onePercentLowFps: 39, vramMiB: 7000 },
    { minAverageFps: 60, minOnePercentLowFps: 45, maxVramMiB: 8000 },
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures.map((failure) => failure.metric), ['onePercentLowFps']);
});

test('evaluateEvidence rejects smoke/fallback evidence presented as production', () => {
  const result = evaluateEvidence(
    {
      commitSha: 'abc123',
      runnerIdentity: 'self-hosted-5070ti',
      engineVersion: '4.7.2',
      renderer: 'Vulkan Forward+',
      fallbackCapture: true,
    },
    {
      requireCommitSha: true,
      requireRunnerIdentity: true,
      requireEngineVersion: true,
      requireRenderer: true,
      rejectFallbackCaptures: true,
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].field, 'fallbackCapture');
});

test('decideLoopState enforces gate ordering', () => {
  assert.equal(decideLoopState({ score: 9, runtimeOk: false, performanceOk: true, evidenceOk: true }), 'runtime_blocked');
  assert.equal(decideLoopState({ score: 9, runtimeOk: true, performanceOk: true, evidenceOk: false }), 'evidence_blocked');
  assert.equal(decideLoopState({ score: 7, runtimeOk: true, performanceOk: true, evidenceOk: true }), 'iterate_visuals');
  assert.equal(decideLoopState({ score: 9, runtimeOk: true, performanceOk: false, evidenceOk: true }), 'optimize_performance');
  assert.equal(decideLoopState({ score: 9, runtimeOk: true, performanceOk: true, evidenceOk: true }), 'qualified');
  assert.equal(decideLoopState({ score: 7.9, runtimeOk: true, performanceOk: true, evidenceOk: true, stalled: true }), 'architectural_reset_required');
  assert.equal(decideLoopState({ score: 7.9, runtimeOk: true, performanceOk: true, evidenceOk: true, stalled: true, architecturalResetTried: true }), 'review_required');
});

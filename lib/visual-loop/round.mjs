import {
  classifyRegression,
  detectStall,
  decideLoopState,
} from './core.mjs';
import {
  validateJudgeVerdict,
} from './judge.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(`VisualLoop round error: ${message}`);
}

function requiredRolesFromManifest(manifest) {
  return (manifest?.captures || [])
    .filter(item => item?.required === true)
    .map(item => String(item.role || '').trim())
    .filter(Boolean);
}

function manifestGate(manifest, key) {
  return String(manifest?.gates?.[key]?.state || '').trim();
}

function normalizeHistory(history = []) {
  if (!Array.isArray(history)) throw new TypeError('history must be an array');
  return history.map(item => ({
    score: item?.score,
    blockers: Array.isArray(item?.blockers)
      ? item.blockers.map(blocker => typeof blocker === 'string' ? blocker : blocker?.key).filter(Boolean)
      : [],
  }));
}

export function evaluateVisualLoopRound({
  manifest,
  verdict,
  previousVerdict = null,
  history = [],
  config = {},
} = {}) {
  assert(manifest && typeof manifest === 'object' && !Array.isArray(manifest), 'manifest must be an object');
  assert(manifest.schema_version === 2, 'manifest schema_version must be 2');

  const requiredRoles = requiredRolesFromManifest(manifest);
  assert(requiredRoles.length > 0, 'manifest has no required capture roles');

  const judge = validateJudgeVerdict(verdict, {
    requiredRoles,
    weights: config.weights,
  });

  const previous = previousVerdict
    ? validateJudgeVerdict(previousVerdict, { requiredRoles, weights: config.weights })
    : null;
  const regression = previous
    ? classifyRegression(judge.totalScore, previous.totalScore, config.regressionEpsilon ?? 0.15)
    : { state: 'first_round', delta: null };

  const currentHistory = [
    ...normalizeHistory(history),
    {
      score: judge.totalScore,
      blockers: judge.blockers.map(blocker => blocker.key),
    },
  ];
  const stall = detectStall(currentHistory, config.stall || {});

  const runtimeOk = manifestGate(manifest, 'runtime') === 'pass';
  const evidenceOk = manifestGate(manifest, 'evidence') === 'pass' && manifest.evidence_complete === true;
  const performanceState = manifestGate(manifest, 'performance');
  const performanceOk = performanceState === 'pass';
  const performanceInconclusive = ['missing', 'inconclusive', 'inconclusive_external_load'].includes(performanceState);
  const visualThresholdMet = judge.totalScore >= (config.passScore ?? 8.5);
  const visualOk = visualThresholdMet && judge.visuallyPassable;

  let loopState;
  if (!runtimeOk) {
    loopState = 'runtime_blocked';
  } else if (!evidenceOk) {
    loopState = 'evidence_blocked';
  } else if (stall.stalled && config.architecturalResetTried === true) {
    loopState = 'review_required';
  } else if (stall.stalled) {
    loopState = 'architectural_reset_required';
  } else if (!visualOk) {
    loopState = 'iterate_visuals';
  } else if (performanceInconclusive) {
    loopState = 'performance_inconclusive';
  } else {
    loopState = decideLoopState({
      score: judge.totalScore,
      passScore: config.passScore ?? 8.5,
      runtimeOk,
      performanceOk,
      evidenceOk,
      stalled: false,
      architecturalResetTried: false,
    });
  }

  // A regression is not an automatic hard failure by itself: the current build
  // may still be above target. Surface it explicitly so policy/UI can decide
  // whether a qualified baseline may move backwards.
  return {
    schemaVersion: 1,
    roundId: manifest.round_id || null,
    commitSha: manifest.commit_sha || null,
    score: judge.totalScore,
    passScore: config.passScore ?? 8.5,
    visualThresholdMet,
    visualOk,
    runtimeOk,
    evidenceOk,
    performanceState,
    performanceOk,
    performanceInconclusive,
    regression,
    stall,
    loopState,
    qualified: loopState === 'qualified',
    blockers: judge.blockers,
    blockingCount: judge.blockingCount,
    aggregateDimensions: judge.aggregateDimensions,
    viewSummaries: Object.fromEntries(Object.entries(judge.views).map(([role, view]) => [role, view.summary])),
    summary: judge.summary,
  };
}

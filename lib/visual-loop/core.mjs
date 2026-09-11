export const DEFAULT_WEIGHTS = Object.freeze({
  composition: 0.22,
  scale: 0.13,
  character: 0.15,
  architecture: 0.15,
  materials: 0.12,
  lighting: 0.10,
  detail: 0.08,
  motion: 0.05,
});

function finiteNumber(value, name) {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
  return value;
}

function clampScore(value, name) {
  finiteNumber(value, name);
  if (value < 0 || value > 10) throw new RangeError(`${name} must be between 0 and 10`);
  return value;
}

export function weightedVisualScore(scores, weights = DEFAULT_WEIGHTS) {
  if (!scores || typeof scores !== 'object' || Array.isArray(scores)) {
    throw new TypeError('scores must be an object');
  }
  if (!weights || typeof weights !== 'object' || Array.isArray(weights)) {
    throw new TypeError('weights must be an object');
  }

  let weighted = 0;
  let weightTotal = 0;

  for (const [dimension, weight] of Object.entries(weights)) {
    finiteNumber(weight, `weights.${dimension}`);
    if (weight < 0) throw new RangeError(`weights.${dimension} must be >= 0`);
    if (weight === 0) continue;
    if (!(dimension in scores)) continue;

    const score = clampScore(scores[dimension], `scores.${dimension}`);
    weighted += score * weight;
    weightTotal += weight;
  }

  if (weightTotal <= 0) throw new Error('at least one positively weighted score is required');
  return Number((weighted / weightTotal).toFixed(3));
}

export function classifyRegression(currentScore, previousScore, epsilon = 0.15) {
  clampScore(currentScore, 'currentScore');
  clampScore(previousScore, 'previousScore');
  finiteNumber(epsilon, 'epsilon');
  if (epsilon < 0) throw new RangeError('epsilon must be >= 0');

  const delta = Number((currentScore - previousScore).toFixed(3));
  if (delta > epsilon) return { state: 'improved', delta };
  if (delta < -epsilon) return { state: 'regressed', delta };
  return { state: 'neutral', delta };
}

function normalizeBlocker(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function detectStall(
  history,
  {
    recentRounds = 2,
    minBestScoreImprovement = 1,
    repeatedBlockerRounds = 2,
  } = {},
) {
  if (!Array.isArray(history)) throw new TypeError('history must be an array');
  if (history.length < 2) return { stalled: false, reasons: [] };

  const reasons = [];
  const scored = history.filter((round) => Number.isFinite(round?.score));

  if (scored.length >= recentRounds + 1) {
    const beforeWindow = scored.slice(0, -recentRounds);
    const recent = scored.slice(-recentRounds);
    const priorBest = Math.max(...beforeWindow.map((round) => round.score));
    const recentBest = Math.max(...recent.map((round) => round.score));
    const improvement = Number((recentBest - priorBest).toFixed(3));

    if (improvement < minBestScoreImprovement) {
      reasons.push({
        type: 'score_plateau',
        improvement,
        minimumRequired: minBestScoreImprovement,
        recentRounds,
      });
    }
  }

  if (history.length >= repeatedBlockerRounds) {
    const tail = history.slice(-repeatedBlockerRounds);
    const blockerSets = tail.map((round) => new Set((round?.blockers ?? []).map(normalizeBlocker).filter(Boolean)));
    const repeated = [...blockerSets[0]].filter((blocker) => blockerSets.every((set) => set.has(blocker)));
    if (repeated.length > 0) {
      reasons.push({
        type: 'repeated_blocker',
        blockers: repeated,
        rounds: repeatedBlockerRounds,
      });
    }
  }

  return { stalled: reasons.length > 0, reasons };
}

export function evaluatePerformance(metrics = {}, targets = {}) {
  const failures = [];

  if (Number.isFinite(targets.minAverageFps)) {
    if (!Number.isFinite(metrics.averageFps) || metrics.averageFps < targets.minAverageFps) {
      failures.push({ metric: 'averageFps', actual: metrics.averageFps ?? null, target: targets.minAverageFps, op: '>=' });
    }
  }

  if (Number.isFinite(targets.minOnePercentLowFps)) {
    if (!Number.isFinite(metrics.onePercentLowFps) || metrics.onePercentLowFps < targets.minOnePercentLowFps) {
      failures.push({ metric: 'onePercentLowFps', actual: metrics.onePercentLowFps ?? null, target: targets.minOnePercentLowFps, op: '>=' });
    }
  }

  if (Number.isFinite(targets.maxVramMiB)) {
    if (!Number.isFinite(metrics.vramMiB) || metrics.vramMiB > targets.maxVramMiB) {
      failures.push({ metric: 'vramMiB', actual: metrics.vramMiB ?? null, target: targets.maxVramMiB, op: '<=' });
    }
  }

  return { ok: failures.length === 0, failures };
}

export function evaluateEvidence(metadata = {}, policy = {}) {
  const failures = [];
  const requireField = (enabled, field) => {
    if (enabled && !metadata[field]) failures.push({ type: 'missing_metadata', field });
  };

  requireField(policy.requireCommitSha, 'commitSha');
  requireField(policy.requireRunnerIdentity, 'runnerIdentity');
  requireField(policy.requireEngineVersion, 'engineVersion');
  requireField(policy.requireRenderer, 'renderer');

  if (policy.rejectFallbackCaptures && metadata.fallbackCapture === true) {
    failures.push({ type: 'forbidden_evidence', field: 'fallbackCapture' });
  }
  if (policy.rejectEditorPreviewAsProduction && metadata.editorPreview === true) {
    failures.push({ type: 'forbidden_evidence', field: 'editorPreview' });
  }
  if (policy.rejectGeneratedTargetAsProduction && metadata.generatedTargetPresentedAsProduction === true) {
    failures.push({ type: 'forbidden_evidence', field: 'generatedTargetPresentedAsProduction' });
  }

  return { ok: failures.length === 0, failures };
}

export function decideLoopState({
  score,
  passScore = 8.5,
  runtimeOk,
  performanceOk,
  evidenceOk,
  stalled = false,
  architecturalResetTried = false,
} = {}) {
  clampScore(score, 'score');
  clampScore(passScore, 'passScore');

  if (!runtimeOk) return 'runtime_blocked';
  if (!evidenceOk) return 'evidence_blocked';
  if (stalled && architecturalResetTried) return 'review_required';
  if (stalled) return 'architectural_reset_required';
  if (score < passScore) return 'iterate_visuals';
  if (!performanceOk) return 'optimize_performance';
  return 'qualified';
}

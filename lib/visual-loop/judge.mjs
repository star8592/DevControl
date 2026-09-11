import { DEFAULT_WEIGHTS, weightedVisualScore } from './core.mjs';

export const BLOCKER_SEVERITIES = Object.freeze(['blocking', 'major', 'minor']);

function assert(condition, message) {
  if (!condition) throw new Error(`VisualLoop judge error: ${message}`);
}

function score(value, field) {
  assert(Number.isFinite(value), `${field} must be a finite number`);
  assert(value >= 0 && value <= 10, `${field} must be between 0 and 10`);
  return value;
}

function cleanText(value, field, max = 1200) {
  const text = String(value ?? '').trim();
  assert(text.length > 0, `${field} is required`);
  assert(text.length <= max, `${field} exceeds ${max} characters`);
  return text;
}

function activeDimensions(weights = DEFAULT_WEIGHTS) {
  assert(weights && typeof weights === 'object' && !Array.isArray(weights), 'weights must be an object');
  const dimensions = [];
  for (const [dimension, weight] of Object.entries(weights)) {
    assert(Number.isFinite(weight) && weight >= 0, `weights.${dimension} must be a non-negative finite number`);
    if (weight > 0) dimensions.push(dimension);
  }
  assert(dimensions.length > 0, 'at least one positively weighted judge dimension is required');
  return dimensions;
}

export function normalizeBlockerKey(blocker) {
  return [blocker?.role, blocker?.dimension, blocker?.code]
    .map(value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join(':');
}

export function validateJudgeVerdict(verdict, {
  requiredRoles = [],
  weights = DEFAULT_WEIGHTS,
} = {}) {
  assert(verdict && typeof verdict === 'object' && !Array.isArray(verdict), 'verdict must be an object');
  assert(verdict.schemaVersion === 1, 'schemaVersion must be 1');
  assert(verdict.views && typeof verdict.views === 'object' && !Array.isArray(verdict.views), 'views must be an object');
  activeDimensions(weights);

  for (const role of requiredRoles) {
    assert(verdict.views[role], `required view is missing: ${role}`);
  }

  const normalizedViews = {};
  const dimensionBuckets = new Map();

  for (const [role, view] of Object.entries(verdict.views)) {
    assert(view && typeof view === 'object' && !Array.isArray(view), `views.${role} must be an object`);
    assert(view.scores && typeof view.scores === 'object' && !Array.isArray(view.scores), `views.${role}.scores must be an object`);
    const normalizedScores = {};
    for (const [dimension, value] of Object.entries(view.scores)) {
      if (!(dimension in weights) || weights[dimension] <= 0) continue;
      normalizedScores[dimension] = score(value, `views.${role}.scores.${dimension}`);
      const bucket = dimensionBuckets.get(dimension) || [];
      bucket.push(normalizedScores[dimension]);
      dimensionBuckets.set(dimension, bucket);
    }
    assert(Object.keys(normalizedScores).length > 0, `views.${role} has no recognized positively weighted scores`);
    normalizedViews[role] = {
      scores: normalizedScores,
      summary: cleanText(view.summary, `views.${role}.summary`, 2000),
    };
  }

  const aggregateDimensions = {};
  for (const [dimension, values] of dimensionBuckets) {
    aggregateDimensions[dimension] = Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(3));
  }
  const totalScore = weightedVisualScore(aggregateDimensions, weights);

  const blockers = Array.isArray(verdict.blockers) ? verdict.blockers : [];
  const normalizedBlockers = blockers.map((blocker, index) => {
    assert(blocker && typeof blocker === 'object' && !Array.isArray(blocker), `blockers[${index}] must be an object`);
    const role = cleanText(blocker.role, `blockers[${index}].role`, 80);
    assert(verdict.views[role], `blockers[${index}].role references an unknown view`);
    const dimension = cleanText(blocker.dimension, `blockers[${index}].dimension`, 80);
    assert(dimension in weights && weights[dimension] > 0, `blockers[${index}].dimension is not active for this project`);
    const severity = cleanText(blocker.severity, `blockers[${index}].severity`, 20).toLowerCase();
    assert(BLOCKER_SEVERITIES.includes(severity), `blockers[${index}].severity is invalid`);
    const code = cleanText(blocker.code, `blockers[${index}].code`, 100)
      .toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    assert(code.length > 0, `blockers[${index}].code is invalid`);
    const normalized = {
      role,
      dimension,
      severity,
      code,
      observation: cleanText(blocker.observation, `blockers[${index}].observation`, 1200),
      action: cleanText(blocker.action, `blockers[${index}].action`, 1200),
    };
    return { ...normalized, key: normalizeBlockerKey(normalized) };
  });

  const blocking = normalizedBlockers.filter(item => item.severity === 'blocking');
  return {
    schemaVersion: 1,
    totalScore,
    aggregateDimensions,
    views: normalizedViews,
    blockers: normalizedBlockers,
    blockingCount: blocking.length,
    visuallyPassable: blocking.length === 0,
    summary: cleanText(verdict.summary, 'summary', 3000),
  };
}

export function buildJudgeInstruction({
  passScore = 8.5,
  requiredRoles = [],
  weights = DEFAULT_WEIGHTS,
} = {}) {
  const dimensions = activeDimensions(weights);
  const weightedPolicy = dimensions.map(dimension => `${dimension}=${weights[dimension]}`).join(', ');
  return [
    'You are an independent VisualLoop production-art judge. You did not implement the current build.',
    'Compare each CURRENT Godot production capture against its matching frozen TARGET. When a PREVIOUS capture exists, use it only for regression context; never reward effort or intent.',
    'Judge what is visibly present, not what code or logs claim exists.',
    `Only score the active project dimensions: ${dimensions.join(', ')}. Do not invent or score inactive dimensions.`,
    `Project scoring weights: ${weightedPolicy}. DevControl, not you, computes the final weighted score.`,
    'A technically valid screenshot may still be a visual failure.',
    'Do not accept placeholder/procedural-looking final art merely because it is clean or functional.',
    'Every criticism must say exactly what is visible and what concrete change should be made.',
    `Nominal pass score: ${passScore}/10. Required view roles: ${requiredRoles.join(', ') || '(contract-defined)'}.`,
    'Return JSON only with schemaVersion=1, views, blockers, and summary.',
    `For each view: { scores: {${dimensions.join(', ')} as applicable}, summary }.`,
    'Each blocker: { role, dimension, severity: blocking|major|minor, code, observation, action }.',
    'Blocker dimension must be one of the active project dimensions.',
    'Use severity=blocking for defects that make the build unacceptable even if the numerical average is high.',
    'Do not include a self-computed total score; DevControl computes it deterministically from the structured scores.',
  ].join('\n');
}

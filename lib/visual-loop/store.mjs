import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

function assert(condition, message) {
  if (!condition) throw new Error(`VisualLoop store error: ${message}`);
}

function safeSegment(value, field) {
  const text = String(value ?? '').trim();
  assert(/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/.test(text), `${field} is invalid`);
  return text;
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function atomicJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await rename(temp, filePath);
}

export function visualLoopStorePaths(rootDir, projectKey) {
  const key = safeSegment(projectKey, 'projectKey');
  const root = path.resolve(rootDir, '.devcontrol', 'visual-loop', key);
  return {
    root,
    rounds: path.join(root, 'rounds'),
    latest: path.join(root, 'latest.json'),
    history: path.join(root, 'history.json'),
  };
}

export function compactRoundHistory(round) {
  assert(round && typeof round === 'object' && !Array.isArray(round), 'round must be an object');
  return {
    roundId: round.roundId ?? null,
    commitSha: round.commitSha ?? null,
    score: Number.isFinite(round.score) ? round.score : null,
    loopState: round.loopState ?? null,
    qualified: round.qualified === true,
    performanceState: round.performanceState ?? null,
    regression: round.regression ?? null,
    stall: round.stall ?? null,
    blockers: Array.isArray(round.blockers)
      ? round.blockers.map(blocker => ({
          key: blocker?.key ?? null,
          role: blocker?.role ?? null,
          dimension: blocker?.dimension ?? null,
          severity: blocker?.severity ?? null,
          code: blocker?.code ?? null,
        })).filter(item => item.key)
      : [],
    recordedAt: new Date().toISOString(),
  };
}

export async function recordVisualLoopRound({ rootDir, projectKey, round, manifest, verdict } = {}) {
  assert(rootDir, 'rootDir is required');
  const paths = visualLoopStorePaths(rootDir, projectKey);
  const compact = compactRoundHistory(round);
  const roundId = safeSegment(compact.roundId, 'round.roundId');
  assert(manifest?.round_id === roundId, 'manifest round_id does not match evaluated round');

  const roundDir = path.join(paths.rounds, roundId);
  await mkdir(roundDir, { recursive: true });

  // Preserve the full evidence metadata and judge verdict next to the derived
  // decision so future regression/stall checks are auditable.
  await atomicJson(path.join(roundDir, 'manifest.json'), manifest);
  await atomicJson(path.join(roundDir, 'verdict.json'), verdict);
  await atomicJson(path.join(roundDir, 'decision.json'), round);

  const existing = await readJson(paths.history, { schemaVersion: 1, rounds: [] });
  assert(existing?.schemaVersion === 1 && Array.isArray(existing.rounds), 'history.json schema is invalid');
  const withoutSame = existing.rounds.filter(item => item?.roundId !== roundId);
  const rounds = [...withoutSame, compact].slice(-100);
  const history = { schemaVersion: 1, project: projectKey, rounds };
  await atomicJson(paths.history, history);
  await atomicJson(paths.latest, { schemaVersion: 1, project: projectKey, ...compact });
  return { paths, latest: compact, history };
}

export async function loadVisualLoopHistory(rootDir, projectKey) {
  const paths = visualLoopStorePaths(rootDir, projectKey);
  const history = await readJson(paths.history, { schemaVersion: 1, project: projectKey, rounds: [] });
  assert(history?.schemaVersion === 1 && Array.isArray(history.rounds), 'history.json schema is invalid');
  return history;
}

export function historyForStall(history) {
  assert(history?.schemaVersion === 1 && Array.isArray(history.rounds), 'history is invalid');
  return history.rounds.map(round => ({
    score: round?.score,
    blockers: Array.isArray(round?.blockers) ? round.blockers.map(item => item?.key).filter(Boolean) : [],
  }));
}

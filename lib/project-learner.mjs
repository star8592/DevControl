import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_MODEL = Object.freeze({
  schemaVersion: 1,
  projects: {}
});

async function readModel(filePath) {
  try {
    const value = JSON.parse(await readFile(filePath, 'utf8'));
    if (value?.schemaVersion === 1 && value.projects && typeof value.projects === 'object') {
      return value;
    }
  } catch {}
  return structuredClone(DEFAULT_MODEL);
}

function commandKey(command) {
  return String(command || '').trim();
}

function updateAverage(previous, samples, value) {
  if (!samples) return value;
  return Math.round(((previous * samples) + value) / (samples + 1));
}

export async function learnFromQualification({
  stateDir,
  project,
  result
}) {
  const filePath = path.resolve(stateDir, 'playbooks.json');
  await mkdir(path.dirname(filePath), { recursive: true });
  const model = await readModel(filePath);
  const projectKey = String(project.key || result.project?.key);
  const existing = model.projects[projectKey] || {
    key: projectKey,
    repo: project.repo || result.project?.repo || null,
    localPath: project.localPath || result.project?.localPath || null,
    observations: 0,
    passRuns: 0,
    failRuns: 0,
    commands: {},
    preferredQualification: [],
    lastStatus: null,
    lastRunId: null,
    updatedAt: null
  };

  existing.observations += 1;
  if (result.status === 'PASS') existing.passRuns += 1;
  else existing.failRuns += 1;
  existing.lastStatus = result.status;
  existing.lastRunId = result.runId;
  existing.updatedAt = result.finishedAt || new Date().toISOString();

  for (const step of result.steps || []) {
    const key = commandKey(step.command);
    const stats = existing.commands[key] || {
      command: key,
      samples: 0,
      passes: 0,
      failures: 0,
      timeouts: 0,
      averageDurationMs: 0,
      lastExitCode: null,
      lastStatus: null,
      lastRunId: null
    };
    stats.averageDurationMs = updateAverage(
      stats.averageDurationMs,
      stats.samples,
      Number(step.durationMs || 0)
    );
    stats.samples += 1;
    if (step.passed) stats.passes += 1;
    else stats.failures += 1;
    if (step.timedOut) stats.timeouts += 1;
    stats.lastExitCode = step.exitCode;
    stats.lastStatus = step.passed ? 'PASS' : 'FAIL';
    stats.lastRunId = result.runId;
    stats.passRate = Number((stats.passes / stats.samples).toFixed(4));
    existing.commands[key] = stats;
  }

  existing.preferredQualification = Object.values(existing.commands)
    .filter(stats => stats.samples >= 1)
    .sort((a, b) => {
      if (b.passRate !== a.passRate) return b.passRate - a.passRate;
      if (a.timeouts !== b.timeouts) return a.timeouts - b.timeouts;
      return a.averageDurationMs - b.averageDurationMs;
    })
    .map(stats => stats.command);

  existing.runPassRate = Number(
    (existing.passRuns / Math.max(1, existing.observations)).toFixed(4)
  );
  model.projects[projectKey] = existing;
  model.updatedAt = new Date().toISOString();
  await writeFile(filePath, `${JSON.stringify(model, null, 2)}\n`, 'utf8');
  return existing;
}

export async function loadProjectPlaybook(stateDir, projectKey) {
  const model = await readModel(path.resolve(stateDir, 'playbooks.json'));
  return model.projects[projectKey] || null;
}

export function chooseQualificationCommands(project, playbook = null) {
  const safe = Array.isArray(project?.autonomy?.safeCommands)
    ? project.autonomy.safeCommands
    : [];
  if (!playbook?.preferredQualification?.length) return safe;

  const allowed = new Set(safe);
  const learned = playbook.preferredQualification.filter(command => allowed.has(command));
  const unseen = safe.filter(command => !learned.includes(command));
  return [...learned, ...unseen];
}

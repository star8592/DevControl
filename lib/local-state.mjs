import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function readLatestMap(stateDir) {
  const latestDir = path.resolve(stateDir, 'latest');
  const output = {};
  let names = [];
  try {
    names = await readdir(latestDir);
  } catch {
    return output;
  }
  for (const name of names.filter(name => name.endsWith('.json'))) {
    const value = await readJson(path.join(latestDir, name));
    if (!value?.project?.key) continue;
    output[value.project.key] = value;
  }
  return output;
}

async function readRepairPlans(stateDir) {
  const dir = path.resolve(stateDir, 'repair-plans');
  const plans = [];
  let names = [];
  try {
    names = await readdir(dir);
  } catch {
    return plans;
  }
  for (const name of names.filter(name => name.endsWith('.json')).sort()) {
    const value = await readJson(path.join(dir, name));
    if (!value?.project?.key) continue;
    plans.push({
      file: name,
      signature: value.signature || null,
      project: value.project.key,
      repo: value.project.repo || null,
      sha: value.project.sha || null,
      runId: value.runId || null,
      generatedAt: value.generatedAt || null,
      mode: value.mode || null,
      provider: value.provider || null,
      confidence: value.confidence ?? null,
      summary: value.summary || null,
      steps: value.steps || [],
      acceptance: value.acceptance || [],
      aiAnalysis: value.aiAnalysis || null,
      plannerError: value.plannerError || null
    });
  }
  return plans;
}

async function readRepairAttempts(stateDir) {
  const dir = path.resolve(stateDir, 'repair-attempts');
  const attempts = [];
  let names = [];
  try {
    names = await readdir(dir);
  } catch {
    return attempts;
  }
  for (const name of names.filter(name => name.endsWith('.json')).sort()) {
    const value = await readJson(path.join(dir, name));
    if (!value?.project) continue;
    attempts.push({
      file: name,
      signature: value.signature || null,
      project: value.project,
      repo: value.repo || null,
      failureSha: value.failureSha || null,
      attemptedAt: value.attemptedAt || null,
      status: value.status || null,
      branch: value.branch || null,
      worktree: value.worktree || null,
      repairSha: value.repairSha || null,
      changedPaths: value.changedPaths || [],
      blockedPaths: value.blockedPaths || [],
      pushed: Boolean(value.pushed),
      pushError: value.pushError || null,
      error: value.error || null
    });
  }
  return attempts;
}

async function readRepairCandidates(stateDir) {
  const dir = path.resolve(stateDir, 'repair-candidates');
  const candidates = [];
  let names = [];
  try {
    names = await readdir(dir);
  } catch {
    return candidates;
  }
  for (const name of names.filter(name => name.endsWith('.json')).sort()) {
    const value = await readJson(path.join(dir, name));
    if (!value?.project) continue;
    candidates.push({
      file: name,
      signature: value.signature || null,
      project: value.project,
      repo: value.repo || null,
      recordedAt: value.recordedAt || null,
      status: value.status || null,
      branch: value.branch || null,
      repairSha: value.repairSha || null,
      pushed: Boolean(value.pushed),
      pushEnabled: Boolean(value.pushEnabled),
      prEnabled: Boolean(value.prEnabled),
      pr: value.pr || null,
      error: value.error || null
    });
  }
  return candidates;
}

async function readFailureQueue(stateDir) {
  const queueDir = path.resolve(stateDir, 'ai-queue');
  const files = [];
  let names = [];
  try {
    names = await readdir(queueDir);
  } catch {
    return files;
  }
  for (const name of names.filter(name => name.endsWith('.json')).sort()) {
    const value = await readJson(path.join(queueDir, name));
    if (!value?.project?.key) continue;
    files.push({
      file: name,
      project: value.project.key,
      repo: value.project.repo || null,
      sha: value.project.sha || null,
      runId: value.runId || null,
      signature: value.signature || null,
      generatedAt: value.generatedAt || null,
      categories: value.failure?.categories || [],
      failedCommand: value.failure?.failedCommand || null
    });
  }
  return files;
}

function localStateName(project) {
  return project.registration?.configuredKey || project.key;
}

function latestByProject(values, timestampField) {
  const output = {};
  for (const value of values) {
    const previous = output[value.project];
    if (
      !previous ||
      String(value[timestampField] || '') > String(previous[timestampField] || '')
    ) {
      output[value.project] = value;
    }
  }
  return output;
}

export async function loadLocalControlState(baseDir) {
  const stateDir = path.resolve(
    baseDir,
    process.env.DEVCONTROL_STATE_DIR || 'state'
  );
  const discoveryFile = path.resolve(
    baseDir,
    process.env.DEVCONTROL_DISCOVERY_FILE || 'state/discovery.json'
  );

  const [
    discovery,
    playbooks,
    lifecycle,
    latest,
    failures,
    repairPlans,
    repairAttempts,
    repairCandidates
  ] = await Promise.all([
    readJson(discoveryFile, { projects: [], counts: {} }),
    readJson(path.resolve(stateDir, 'playbooks.json'), { projects: {} }),
    readJson(path.resolve(stateDir, 'project-lifecycle.json'), { projects: {} }),
    readLatestMap(stateDir),
    readFailureQueue(stateDir),
    readRepairPlans(stateDir),
    readRepairAttempts(stateDir),
    readRepairCandidates(stateDir)
  ]);

  const failureCounts = failures.reduce((acc, item) => {
    acc[item.project] = (acc[item.project] || 0) + 1;
    return acc;
  }, {});
  const candidateCounts = repairCandidates.reduce((acc, item) => {
    acc[item.project] = (acc[item.project] || 0) + 1;
    return acc;
  }, {});
  const latestRepairByProject = latestByProject(repairPlans, 'generatedAt');
  const latestAttemptByProject = latestByProject(repairAttempts, 'attemptedAt');
  const latestCandidateByProject = latestByProject(repairCandidates, 'recordedAt');

  const projects = {};
  for (const discovered of discovery.projects || []) {
    const key = localStateName(discovered);
    projects[key] = {
      key,
      discoveredKey: discovered.key,
      name: discovered.name,
      repo: discovered.repo,
      localPath: discovered.localPath,
      branch: discovered.branch,
      sha: discovered.sha,
      dirty: discovered.dirty,
      stacks: discovered.stacks || [],
      confidence: discovered.confidence,
      registration: discovered.registration,
      autonomy: discovered.autonomy,
      latestQualification: latest[key] || null,
      playbook: playbooks.projects?.[key] || null,
      lifecycle: lifecycle.projects?.[key] || null,
      failurePackets: failureCounts[key] || 0,
      repairCandidates: candidateCounts[key] || 0,
      latestRepairPlan: latestRepairByProject[key] || null,
      latestRepairAttempt: latestAttemptByProject[key] || null,
      latestRepairCandidate: latestCandidateByProject[key] || null
    };
  }

  const counts = Object.values(projects).reduce((acc, project) => {
    const level = project.autonomy?.level || 'UNKNOWN';
    acc.autonomy[level] = (acc.autonomy[level] || 0) + 1;
    const status = project.latestQualification?.status || 'UNTESTED';
    acc.qualification[status] = (acc.qualification[status] || 0) + 1;
    return acc;
  }, {
    total: Object.keys(projects).length,
    autonomy: {},
    qualification: {}
  });

  return {
    generatedAt: new Date().toISOString(),
    stateDir,
    discovery: {
      generatedAt: discovery.generatedAt || null,
      roots: discovery.roots || [],
      counts: discovery.counts || {}
    },
    counts,
    failureQueue: {
      count: failures.length,
      items: failures.slice(-100).reverse()
    },
    repairPlans: {
      count: repairPlans.length,
      items: repairPlans.slice(-100).reverse()
    },
    repairAttempts: {
      count: repairAttempts.length,
      items: repairAttempts.slice(-100).reverse()
    },
    repairCandidates: {
      count: repairCandidates.length,
      items: repairCandidates.slice(-100).reverse()
    },
    projects
  };
}

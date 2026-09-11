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

export async function loadLocalControlState(baseDir) {
  const stateDir = path.resolve(
    baseDir,
    process.env.DEVCONTROL_STATE_DIR || 'state'
  );
  const discoveryFile = path.resolve(
    baseDir,
    process.env.DEVCONTROL_DISCOVERY_FILE || 'state/discovery.json'
  );

  const [discovery, playbooks, lifecycle, latest, failures, repairPlans] = await Promise.all([
    readJson(discoveryFile, { projects: [], counts: {} }),
    readJson(path.resolve(stateDir, 'playbooks.json'), { projects: {} }),
    readJson(path.resolve(stateDir, 'project-lifecycle.json'), { projects: {} }),
    readLatestMap(stateDir),
    readFailureQueue(stateDir),
    readRepairPlans(stateDir)
  ]);

  const failureCounts = failures.reduce((acc, item) => {
    acc[item.project] = (acc[item.project] || 0) + 1;
    return acc;
  }, {});

  const latestRepairByProject = {};
  for (const plan of repairPlans) {
    const previous = latestRepairByProject[plan.project];
    if (!previous || String(plan.generatedAt || '') > String(previous.generatedAt || '')) {
      latestRepairByProject[plan.project] = plan;
    }
  }

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
      latestRepairPlan: latestRepairByProject[key] || null
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
    projects
  };
}

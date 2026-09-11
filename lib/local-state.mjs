import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function readJson(filePath, fallback = null) {
  try { return JSON.parse(await readFile(filePath, 'utf8')); } catch { return fallback; }
}

async function readLatestMap(stateDir) {
  const latestDir = path.resolve(stateDir, 'latest');
  const output = {};
  let names = [];
  try { names = await readdir(latestDir); } catch { return output; }
  for (const name of names.filter(name => name.endsWith('.json'))) {
    const value = await readJson(path.join(latestDir, name));
    if (value?.project?.key) output[value.project.key] = value;
  }
  return output;
}

async function readCollection(stateDir, directory, normalize) {
  const dir = path.resolve(stateDir, directory);
  const values = [];
  let names = [];
  try { names = await readdir(dir); } catch { return values; }
  for (const name of names.filter(value => value.endsWith('.json')).sort()) {
    const raw = await readJson(path.join(dir, name));
    const value = raw ? normalize(raw, name) : null;
    if (value) values.push(value);
  }
  return values;
}

function readRepairPlans(stateDir) {
  return readCollection(stateDir, 'repair-plans', (value, file) => {
    if (!value?.project?.key) return null;
    return {
      file,
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
    };
  });
}

function readRepairAttempts(stateDir) {
  return readCollection(stateDir, 'repair-attempts', (value, file) => {
    if (!value?.project) return null;
    return {
      file,
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
      visualStatus: value.visualValidation?.status || value.validation?.visualQualification?.status || null,
      visualEvidence: value.visualValidation?.evidence?.screenshots?.length || value.validation?.visualQualification?.evidence?.screenshots?.length || 0,
      pushed: Boolean(value.pushed),
      pushError: value.pushError || null,
      error: value.error || null
    };
  });
}

function readRepairCandidates(stateDir) {
  return readCollection(stateDir, 'repair-candidates', (value, file) => {
    if (!value?.project) return null;
    return {
      file,
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
    };
  });
}

function readRepairReviews(stateDir) {
  return readCollection(stateDir, 'repair-reviews', (value, file) => {
    if (!value?.project) return null;
    return {
      file,
      signature: value.signature || null,
      project: value.project,
      repo: value.repo || null,
      reviewedAt: value.reviewedAt || null,
      state: value.state || null,
      reasons: value.reasons || [],
      headSha: value.headSha || null,
      headRef: value.headRef || null,
      mergeableState: value.mergeableState || null,
      checks: value.checks || { total: 0, passed: 0, pending: 0, failed: 0 },
      pr: value.pr || null,
      mergedAt: value.mergedAt || null,
      mergeCommitSha: value.mergeCommitSha || null,
      draft: value.draft ?? null
    };
  });
}

function readRepairCleanups(stateDir) {
  return readCollection(stateDir, 'repair-cleanups', (value, file) => {
    if (!value?.project) return null;
    return {
      file,
      signature: value.signature || null,
      project: value.project,
      repo: value.repo || null,
      checkedAt: value.checkedAt || null,
      cleanedAt: value.cleanedAt || null,
      status: value.status || null,
      reasons: value.reasons || [],
      mergeCommitSha: value.mergeCommitSha || null,
      repairSha: value.repairSha || null,
      repairBranch: value.repairBranch || value.branch || null,
      remoteBranchDeleted: Boolean(value.remoteBranchDeleted),
      error: value.error || null
    };
  });
}

function readFailureQueue(stateDir) {
  return readCollection(stateDir, 'ai-queue', (value, file) => {
    if (!value?.project?.key) return null;
    return {
      file,
      project: value.project.key,
      repo: value.project.repo || null,
      sha: value.project.sha || null,
      runId: value.runId || null,
      signature: value.signature || null,
      generatedAt: value.generatedAt || null,
      phase: value.failure?.phase || null,
      categories: value.failure?.categories || [],
      failedCommand: value.failure?.failedCommand || null,
      visual: value.failure?.visual || null
    };
  });
}

function localStateName(project) {
  return project.registration?.configuredKey || project.key;
}

function latestByProject(values, timestampField) {
  const output = {};
  for (const value of values) {
    const previous = output[value.project];
    if (!previous || String(value[timestampField] || '') > String(previous[timestampField] || '')) {
      output[value.project] = value;
    }
  }
  return output;
}

export async function loadLocalControlState(baseDir) {
  const stateDir = path.resolve(baseDir, process.env.DEVCONTROL_STATE_DIR || 'state');
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
    repairCandidates,
    repairReviews,
    repairCleanups
  ] = await Promise.all([
    readJson(discoveryFile, { projects: [], counts: {} }),
    readJson(path.resolve(stateDir, 'playbooks.json'), { projects: {} }),
    readJson(path.resolve(stateDir, 'project-lifecycle.json'), { projects: {} }),
    readLatestMap(stateDir),
    readFailureQueue(stateDir),
    readRepairPlans(stateDir),
    readRepairAttempts(stateDir),
    readRepairCandidates(stateDir),
    readRepairReviews(stateDir),
    readRepairCleanups(stateDir)
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
  const latestReviewByProject = latestByProject(repairReviews, 'reviewedAt');
  const latestCleanupByProject = latestByProject(repairCleanups, 'checkedAt');

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
      godotProjectPaths: discovered.godotProjectPaths || [],
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
      latestRepairCandidate: latestCandidateByProject[key] || null,
      latestRepairReview: latestReviewByProject[key] || null,
      latestRepairCleanup: latestCleanupByProject[key] || null
    };
  }

  const counts = Object.values(projects).reduce((acc, project) => {
    const level = project.autonomy?.level || 'UNKNOWN';
    acc.autonomy[level] = (acc.autonomy[level] || 0) + 1;
    const status = project.latestQualification?.status || 'UNTESTED';
    acc.qualification[status] = (acc.qualification[status] || 0) + 1;
    const visualEnabled = Boolean(project.registration?.visualQualification?.enabled);
    if (visualEnabled) {
      acc.visual.enabled += 1;
      const visualStatus = project.latestQualification?.visualQualification?.status || 'UNTESTED';
      acc.visual[visualStatus] = (acc.visual[visualStatus] || 0) + 1;
    }
    return acc;
  }, {
    total: Object.keys(projects).length,
    autonomy: {},
    qualification: {},
    visual: { enabled: 0, PASS: 0, FAIL: 0, UNTESTED: 0 }
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
    failureQueue: { count: failures.length, items: failures.slice(-100).reverse() },
    repairPlans: { count: repairPlans.length, items: repairPlans.slice(-100).reverse() },
    repairAttempts: { count: repairAttempts.length, items: repairAttempts.slice(-100).reverse() },
    repairCandidates: { count: repairCandidates.length, items: repairCandidates.slice(-100).reverse() },
    repairReviews: { count: repairReviews.length, items: repairReviews.slice(-100).reverse() },
    repairCleanups: { count: repairCleanups.length, items: repairCleanups.slice(-100).reverse() },
    projects
  };
}

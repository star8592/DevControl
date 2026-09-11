import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SCHEMA_VERSION = 1;

function git(cwd, args, { timeout = 30000 } = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim()
  };
}

function stateFile(stateDir) {
  return path.resolve(stateDir, 'project-lifecycle.json');
}

async function readState(stateDir) {
  try {
    const value = JSON.parse(await readFile(stateFile(stateDir), 'utf8'));
    if (value?.schemaVersion === SCHEMA_VERSION && value.projects) return value;
  } catch {}
  return { schemaVersion: SCHEMA_VERSION, projects: {}, updatedAt: null };
}

async function writeState(stateDir, state) {
  await mkdir(stateDir, { recursive: true });
  state.updatedAt = new Date().toISOString();
  await writeFile(stateFile(stateDir), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function projectRecord(state, project) {
  const key = String(project.key);
  state.projects[key] ||= {
    key,
    repo: project.repo || null,
    localPath: project.localPath || null,
    knownGoodSha: null,
    lastObservedSha: null,
    lastSyncStatus: null,
    lastSyncAt: null,
    pendingQualification: null,
    quarantine: null,
    lastQualification: null,
    updatedAt: null
  };
  const record = state.projects[key];
  record.repo = project.repo || record.repo;
  record.localPath = project.localPath || record.localPath;
  return record;
}

export function inspectProjectGit(project) {
  if (!project?.localPath) throw new Error('project.localPath is required');
  const localPath = path.resolve(project.localPath);
  const sha = git(localPath, ['rev-parse', 'HEAD']);
  const branch = git(localPath, ['branch', '--show-current']);
  const dirty = git(localPath, ['status', '--porcelain=v1']);
  if (!sha.ok) throw new Error(`not a usable git checkout: ${localPath}`);
  return {
    sha: sha.stdout,
    branch: branch.ok && branch.stdout ? branch.stdout : null,
    dirty: dirty.ok ? Boolean(dirty.stdout) : true
  };
}

export async function readLifecycleState(stateDir) {
  return readState(stateDir);
}

export async function syncProjectFastForward({
  project,
  stateDir,
  remote = 'origin'
}) {
  const localPath = path.resolve(project.localPath);
  const state = await readState(stateDir);
  const record = projectRecord(state, project);
  const observed = inspectProjectGit(project);
  record.lastObservedSha = observed.sha;

  if (observed.dirty) {
    record.lastSyncStatus = 'BLOCKED_DIRTY';
    record.lastSyncAt = new Date().toISOString();
    record.updatedAt = record.lastSyncAt;
    await writeState(stateDir, state);
    return { status: 'BLOCKED_DIRTY', sha: observed.sha };
  }
  if (!observed.branch) {
    record.lastSyncStatus = 'BLOCKED_DETACHED';
    record.lastSyncAt = new Date().toISOString();
    record.updatedAt = record.lastSyncAt;
    await writeState(stateDir, state);
    return { status: 'BLOCKED_DETACHED', sha: observed.sha };
  }

  const fetch = git(localPath, ['fetch', remote, observed.branch], { timeout: 120000 });
  if (!fetch.ok) {
    record.lastSyncStatus = 'FETCH_FAILED';
    record.lastSyncAt = new Date().toISOString();
    record.updatedAt = record.lastSyncAt;
    await writeState(stateDir, state);
    return {
      status: 'FETCH_FAILED',
      sha: observed.sha,
      error: fetch.stderr || fetch.stdout
    };
  }

  const remoteRef = `${remote}/${observed.branch}`;
  const remoteSha = git(localPath, ['rev-parse', remoteRef]);
  if (!remoteSha.ok || !remoteSha.stdout) {
    record.lastSyncStatus = 'REMOTE_REF_MISSING';
    record.lastSyncAt = new Date().toISOString();
    record.updatedAt = record.lastSyncAt;
    await writeState(stateDir, state);
    return { status: 'REMOTE_REF_MISSING', sha: observed.sha };
  }

  if (record.quarantine?.sha === remoteSha.stdout) {
    record.lastSyncStatus = 'QUARANTINED';
    record.lastSyncAt = new Date().toISOString();
    record.updatedAt = record.lastSyncAt;
    await writeState(stateDir, state);
    return {
      status: 'QUARANTINED',
      sha: observed.sha,
      targetSha: remoteSha.stdout,
      quarantine: record.quarantine
    };
  }

  if (observed.sha === remoteSha.stdout) {
    record.lastSyncStatus = 'UP_TO_DATE';
    record.lastSyncAt = new Date().toISOString();
    record.updatedAt = record.lastSyncAt;
    await writeState(stateDir, state);
    return { status: 'UP_TO_DATE', sha: observed.sha };
  }

  const ancestor = git(
    localPath,
    ['merge-base', '--is-ancestor', observed.sha, remoteSha.stdout]
  );
  if (!ancestor.ok) {
    record.lastSyncStatus = 'DIVERGED_OR_LOCAL_AHEAD';
    record.lastSyncAt = new Date().toISOString();
    record.updatedAt = record.lastSyncAt;
    await writeState(stateDir, state);
    return {
      status: 'DIVERGED_OR_LOCAL_AHEAD',
      sha: observed.sha,
      targetSha: remoteSha.stdout
    };
  }

  const merge = git(localPath, ['merge', '--ff-only', remoteRef], { timeout: 120000 });
  if (!merge.ok) {
    record.lastSyncStatus = 'FAST_FORWARD_FAILED';
    record.lastSyncAt = new Date().toISOString();
    record.updatedAt = record.lastSyncAt;
    await writeState(stateDir, state);
    return {
      status: 'FAST_FORWARD_FAILED',
      sha: observed.sha,
      targetSha: remoteSha.stdout,
      error: merge.stderr || merge.stdout
    };
  }

  const after = inspectProjectGit(project);
  record.lastObservedSha = after.sha;
  record.lastSyncStatus = 'SYNCED_PENDING_QUALIFICATION';
  record.lastSyncAt = new Date().toISOString();
  record.pendingQualification = {
    previousSha: observed.sha,
    targetSha: after.sha,
    branch: observed.branch,
    remote,
    syncedAt: record.lastSyncAt
  };
  record.updatedAt = record.lastSyncAt;
  await writeState(stateDir, state);
  return {
    status: 'SYNCED_PENDING_QUALIFICATION',
    previousSha: observed.sha,
    targetSha: after.sha,
    branch: observed.branch
  };
}

export async function recordQualificationOutcome({
  project,
  stateDir,
  result
}) {
  const state = await readState(stateDir);
  const record = projectRecord(state, project);
  const now = new Date().toISOString();
  record.lastQualification = {
    status: result.status,
    runId: result.runId,
    sha: result.project?.sha || null,
    at: result.finishedAt || now,
    failedCommand: result.failedCommand || null
  };
  record.lastObservedSha = result.project?.sha || record.lastObservedSha;
  record.updatedAt = now;

  if (result.status === 'PASS') {
    record.knownGoodSha = result.project?.sha || record.lastObservedSha;
    if (
      record.pendingQualification?.targetSha &&
      record.pendingQualification.targetSha === record.knownGoodSha
    ) {
      record.pendingQualification = null;
    }
    if (record.quarantine?.sha === record.knownGoodSha) record.quarantine = null;
    await writeState(stateDir, state);
    return { action: 'KNOWN_GOOD', knownGoodSha: record.knownGoodSha };
  }

  const pending = record.pendingQualification;
  const failedSha = result.project?.sha || null;
  if (!pending || pending.targetSha !== failedSha) {
    await writeState(stateDir, state);
    return { action: 'FAIL_RECORDED_NO_AUTO_ROLLBACK' };
  }

  const observed = inspectProjectGit(project);
  if (observed.dirty || observed.sha !== failedSha) {
    record.quarantine = {
      sha: failedSha,
      reason: `qualification failed: ${result.failedCommand || 'unknown command'}`,
      quarantinedAt: now
    };
    record.pendingQualification = null;
    await writeState(stateDir, state);
    return {
      action: 'QUARANTINED_NO_ROLLBACK',
      reason: observed.dirty ? 'working tree became dirty' : 'HEAD changed after qualification'
    };
  }

  const reset = git(project.localPath, ['reset', '--hard', pending.previousSha]);
  record.quarantine = {
    sha: failedSha,
    reason: `qualification failed: ${result.failedCommand || 'unknown command'}`,
    quarantinedAt: now
  };
  record.pendingQualification = null;
  record.lastSyncStatus = reset.ok ? 'ROLLED_BACK' : 'ROLLBACK_FAILED';
  record.lastObservedSha = reset.ok ? pending.previousSha : failedSha;
  record.updatedAt = now;
  await writeState(stateDir, state);
  return {
    action: reset.ok ? 'ROLLED_BACK_AND_QUARANTINED' : 'ROLLBACK_FAILED_QUARANTINED',
    failedSha,
    restoredSha: reset.ok ? pending.previousSha : null,
    error: reset.ok ? null : (reset.stderr || reset.stdout)
  };
}

export async function clearQuarantine(stateDir, projectKey) {
  const state = await readState(stateDir);
  if (!state.projects[projectKey]) return false;
  state.projects[projectKey].quarantine = null;
  state.projects[projectKey].updatedAt = new Date().toISOString();
  await writeState(stateDir, state);
  return true;
}

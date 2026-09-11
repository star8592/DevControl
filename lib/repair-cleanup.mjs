import path from 'node:path';
import { realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { inspectProjectGit } from './project-lifecycle.mjs';

const SAFE_REPAIR_BRANCH = /^devcontrol\/repair\/[a-z0-9._-]+$/i;

function git(cwd, args, { timeout = 60000 } = {}) {
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

function realPath(value) {
  try { return realpathSync(path.resolve(value)); } catch { return null; }
}

function insideReal(parent, child) {
  const root = realPath(parent);
  const target = realPath(child);
  if (!root || !target) return false;
  return target.startsWith(`${root}${path.sep}`);
}

function worktreeRecords(cwd) {
  const result = git(cwd, ['worktree', 'list', '--porcelain']);
  if (!result.ok) return [];
  return result.stdout.split(/\n\s*\n/).map(block => {
    const record = {};
    for (const line of block.split(/\r?\n/)) {
      const [key, ...rest] = line.split(' ');
      if (key) record[key] = rest.join(' ');
    }
    return record;
  }).filter(record => record.worktree);
}

export function assessRepairCleanup({
  project,
  review,
  attempt,
  lifecycle,
  latestQualification,
  stateDir
}) {
  const reasons = [];
  if (review?.state !== 'MERGED') reasons.push('repair PR is not MERGED');
  if (!review?.mergeCommitSha) reasons.push('merged PR has no recorded merge commit SHA');
  if (!attempt?.worktree || !attempt?.branch) reasons.push('repair attempt worktree/branch is missing');
  if (!attempt?.signature || attempt.signature !== review?.signature) {
    reasons.push('repair attempt and review signatures do not match');
  }
  if (!SAFE_REPAIR_BRANCH.test(String(attempt?.branch || ''))) {
    reasons.push('repair branch is outside the DevControl repair namespace');
  }
  if (!attempt?.worktree || !insideReal(path.resolve(stateDir, 'worktrees'), attempt.worktree)) {
    reasons.push('repair worktree real path is outside DevControl state/worktrees');
  }
  if (!lifecycle?.knownGoodSha) reasons.push('project has no known-good SHA');
  if (latestQualification?.status !== 'PASS') reasons.push('latest mainline qualification is not PASS');
  if (
    lifecycle?.knownGoodSha &&
    latestQualification?.project?.sha !== lifecycle.knownGoodSha
  ) {
    reasons.push('latest qualification SHA does not match known-good SHA');
  }
  return { eligible: reasons.length === 0, reasons };
}

export function verifyMergedRepairOnKnownGood({
  project,
  review,
  lifecycle,
  latestQualification
}) {
  const observed = inspectProjectGit(project);
  if (observed.dirty) {
    return { ok: false, state: 'BLOCKED_DIRTY', reason: 'main project working tree is dirty' };
  }
  if (observed.sha !== lifecycle.knownGoodSha) {
    return {
      ok: false,
      state: 'WAITING_MAIN_SYNC',
      reason: 'current main project SHA is not the known-good SHA'
    };
  }
  if (latestQualification?.project?.sha !== observed.sha || latestQualification.status !== 'PASS') {
    return {
      ok: false,
      state: 'WAITING_QUALIFICATION',
      reason: 'current main project SHA has not passed normal qualification'
    };
  }
  const mergeCommit = git(project.localPath, ['cat-file', '-e', `${review.mergeCommitSha}^{commit}`]);
  if (!mergeCommit.ok) {
    return {
      ok: false,
      state: 'WAITING_MAIN_SYNC',
      reason: 'recorded merge commit is not available in the local main checkout yet'
    };
  }
  const ancestor = git(
    project.localPath,
    ['merge-base', '--is-ancestor', review.mergeCommitSha, observed.sha]
  );
  if (!ancestor.ok) {
    return {
      ok: false,
      state: 'WAITING_MAIN_SYNC',
      reason: 'known-good mainline does not contain the recorded repair merge commit'
    };
  }
  return { ok: true, state: 'READY', currentSha: observed.sha };
}

export function cleanupRepairWorktree({ project, attempt }) {
  const actualWorktree = realPath(attempt.worktree);
  if (!actualWorktree) return { status: 'WORKTREE_MISSING_OR_INVALID' };

  const registered = worktreeRecords(project.localPath).find(record => {
    const registeredPath = realPath(record.worktree);
    return registeredPath && registeredPath === actualWorktree;
  });
  if (!registered) return { status: 'WORKTREE_NOT_REGISTERED' };
  if (registered.HEAD !== attempt.repairSha) return { status: 'WORKTREE_HEAD_MISMATCH' };
  if (registered.branch !== `refs/heads/${attempt.branch}`) {
    return { status: 'WORKTREE_BRANCH_MISMATCH' };
  }

  const head = git(actualWorktree, ['rev-parse', 'HEAD']);
  const branchName = git(actualWorktree, ['branch', '--show-current']);
  if (!head.ok || head.stdout !== attempt.repairSha) return { status: 'WORKTREE_HEAD_MISMATCH' };
  if (!branchName.ok || branchName.stdout !== attempt.branch) {
    return { status: 'WORKTREE_BRANCH_MISMATCH' };
  }

  const status = git(actualWorktree, ['status', '--porcelain=v1']);
  if (!status.ok) {
    return { status: 'WORKTREE_MISSING_OR_INVALID', error: status.stderr || status.stdout };
  }
  if (status.stdout) return { status: 'BLOCKED_DIRTY_REPAIR_WORKTREE' };

  const remove = git(project.localPath, ['worktree', 'remove', actualWorktree], { timeout: 120000 });
  if (!remove.ok) {
    return { status: 'WORKTREE_REMOVE_FAILED', error: remove.stderr || remove.stdout };
  }

  const branch = git(project.localPath, ['branch', '-D', attempt.branch]);
  if (!branch.ok) {
    return {
      status: 'WORKTREE_REMOVED_BRANCH_DELETE_FAILED',
      error: branch.stderr || branch.stdout
    };
  }
  return {
    status: 'CLEANED',
    branch: attempt.branch,
    worktree: actualWorktree,
    remoteBranchDeleted: false
  };
}

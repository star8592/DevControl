import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

import { executeProjectQualification } from './project-executor.mjs';
import { inspectProjectGit } from './project-lifecycle.mjs';

const HIGH_RISK_PATH = /(^|\/)(\.github|\.gitlab|deploy|deployment|release|releases|steam|production|prod|secrets?|credentials?|\.env)(\/|$)|(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|cargo\.toml|cargo\.lock|pyproject\.toml|requirements[^/]*\.txt|poetry\.lock|go\.mod|go\.sum)$/i;
const SECRET_ENV = /KEY|TOKEN|SECRET|PASSWORD|PASSWD|COOKIE|AUTHORIZATION|CREDENTIAL/i;

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

function safeBranchName(projectKey, signature) {
  const key = String(projectKey || 'project')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const sig = String(signature || '').replace(/[^a-f0-9]/gi, '').slice(0, 12) || 'repair';
  return `devcontrol/repair/${key}-${sig}`;
}

export function riskyRepairPaths(paths) {
  return (paths || []).filter(filePath => HIGH_RISK_PATH.test(String(filePath)));
}

export function assessAutoFixEligibility({ project, packet, plan }) {
  const reasons = [];
  if (!project?.localPath) reasons.push('project has no local path');
  if (!project?.repo) reasons.push('project has no GitHub remote');
  if (!['QUALIFY', 'MANAGED'].includes(project?.autonomy?.level)) {
    reasons.push(`autonomy level ${project?.autonomy?.level || 'UNKNOWN'} is not repair-enabled`);
  }
  if (!project?.autonomy?.autoQualify) reasons.push('automatic qualification is disabled');
  if ((project?.riskFlags || []).length) reasons.push('project discovery reported risk flags');
  if (!packet?.signature || packet.signature !== plan?.signature) {
    reasons.push('failure packet and repair plan signatures do not match');
  }
  if (plan?.mode !== 'PLAN_ONLY') reasons.push('repair plan is not PLAN_ONLY');
  const safeCommands = project?.autonomy?.safeCommands || [];
  if (!safeCommands.includes(packet?.failure?.failedCommand)) {
    reasons.push('failed command is outside the project safe qualification allowlist');
  }
  return { eligible: reasons.length === 0, reasons };
}

function scrubbedCodexEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !SECRET_ENV.test(name))
  );
}

function repairPrompt(packet, plan) {
  return [
    'You are DevControl AutoFix running inside an isolated Git worktree.',
    'You may edit source code and tests inside this worktree only.',
    'Do NOT commit, push, merge, deploy, publish, release, trade, access wallets, or change external state.',
    'Do NOT edit CI/CD, deployment, release, Steam, production, secret/credential files, dependency manifests, or lockfiles.',
    'Do NOT install dependencies or use network access.',
    'Fix only the smallest root cause needed for the failed qualification.',
    'Preserve existing project architecture and safety constraints.',
    '',
    `Project: ${packet.project?.key} (${packet.project?.repo || '-'})`,
    `Base failed SHA: ${packet.project?.sha || '-'}`,
    `Failed command: ${packet.failure?.failedCommand || '-'}`,
    `Failure categories: ${(packet.failure?.categories || []).join(', ')}`,
    '',
    'Repair plan:',
    plan.summary || '',
    ...(plan.steps || []).map((step, index) => `${index + 1}. ${step}`),
    '',
    'Redacted failure excerpt:',
    packet.failure?.logExcerpt || '(none)',
    '',
    'Make the code/test edits now. Do not create a git commit.'
  ].join('\n').slice(0, 30000);
}

function runCodexWorkspaceWrite(cwd, packet, plan, timeoutMs) {
  return new Promise(resolve => {
    const child = spawn(
      'codex',
      ['exec', '--ephemeral', '--sandbox', 'workspace-write', repairPrompt(packet, plan)],
      {
        cwd,
        env: scrubbedCodexEnv(),
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
    let stdout = '';
    let stderr = '';
    let spawnError = null;
    let timedOut = false;
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.on('error', error => { spawnError = error; });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 2000).unref?.();
    }, timeoutMs);
    timer.unref?.();
    child.on('close', code => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !spawnError && !timedOut,
        exitCode: Number.isInteger(code) ? code : null,
        timedOut,
        stdout: stdout.slice(-32000),
        stderr: stderr.slice(-16000),
        error: spawnError ? String(spawnError.message || spawnError) : null
      });
    });
  });
}

function changedPaths(cwd) {
  const tracked = git(cwd, ['diff', '--name-only', 'HEAD', '--']);
  const untracked = git(cwd, ['ls-files', '--others', '--exclude-standard']);
  return [...new Set([
    ...(tracked.ok ? tracked.stdout.split(/\r?\n/).filter(Boolean) : []),
    ...(untracked.ok ? untracked.stdout.split(/\r?\n/).filter(Boolean) : [])
  ])].sort();
}

async function createRepairWorktree({ project, packet, stateDir }) {
  const signature = packet.signature;
  const projectKey = project.registration?.configuredKey || project.key;
  const worktree = path.resolve(stateDir, 'worktrees', projectKey, signature);
  const branch = safeBranchName(projectKey, signature);
  await mkdir(path.dirname(worktree), { recursive: true });

  const commit = git(project.localPath, ['cat-file', '-e', `${packet.project.sha}^{commit}`]);
  if (!commit.ok) throw new Error(`failed SHA is not available locally: ${packet.project.sha}`);

  const branchExists = git(project.localPath, ['show-ref', '--verify', `refs/heads/${branch}`]);
  if (branchExists.ok) throw new Error(`repair branch already exists: ${branch}`);

  await rm(worktree, { recursive: true, force: true });
  const added = git(
    project.localPath,
    ['worktree', 'add', '-b', branch, worktree, packet.project.sha],
    { timeout: 120000 }
  );
  if (!added.ok) throw new Error(`git worktree add failed: ${added.stderr || added.stdout}`);
  return { worktree, branch };
}

export async function executeAutoFix({
  project,
  packet,
  plan,
  stateDir,
  codexTimeoutMs = 10 * 60 * 1000,
  qualifyTimeoutMs = 15 * 60 * 1000,
  pushBranch = false
}) {
  const eligibility = assessAutoFixEligibility({ project, packet, plan });
  if (!eligibility.eligible) {
    return { status: 'BLOCKED', reasons: eligibility.reasons };
  }

  const sourceState = inspectProjectGit(project);
  if (sourceState.dirty) {
    return { status: 'BLOCKED', reasons: ['source project working tree is dirty'] };
  }

  const { worktree, branch } = await createRepairWorktree({ project, packet, stateDir });
  const codex = await runCodexWorkspaceWrite(worktree, packet, plan, codexTimeoutMs);
  if (!codex.ok) {
    return { status: 'CODEX_FAILED', branch, worktree, codex };
  }

  const paths = changedPaths(worktree);
  if (!paths.length) {
    return { status: 'NO_CHANGES', branch, worktree, codex };
  }
  const blockedPaths = riskyRepairPaths(paths);
  if (blockedPaths.length) {
    return {
      status: 'BLOCKED_PATHS',
      branch,
      worktree,
      changedPaths: paths,
      blockedPaths,
      codex
    };
  }

  const safeCommands = project.autonomy.safeCommands || [];
  const failedCommand = packet.failure.failedCommand;
  const commands = [failedCommand, ...safeCommands.filter(command => command !== failedCommand)];
  const validationState = path.resolve(stateDir, 'repair-validation');
  const validation = await executeProjectQualification({
    project: {
      ...project,
      key: `repair-${project.registration?.configuredKey || project.key}`,
      localPath: worktree,
      sha: packet.project.sha,
      branch
    },
    commands,
    stateDir: validationState,
    timeoutMs: qualifyTimeoutMs
  });
  if (validation.status !== 'PASS') {
    return {
      status: 'VALIDATION_FAILED',
      branch,
      worktree,
      changedPaths: paths,
      validation,
      codex
    };
  }

  const add = git(worktree, ['add', '--all']);
  if (!add.ok) throw new Error(`git add failed: ${add.stderr || add.stdout}`);
  const commit = git(worktree, [
    '-c', 'user.name=DevControl',
    '-c', 'user.email=devcontrol@localhost',
    'commit',
    '-m',
    `fix: DevControl repair ${packet.signature.slice(0, 12)}`
  ]);
  if (!commit.ok) throw new Error(`repair commit failed: ${commit.stderr || commit.stdout}`);
  const repairSha = git(worktree, ['rev-parse', 'HEAD']).stdout;

  let push = null;
  if (pushBranch) {
    const pushed = git(worktree, ['push', '-u', 'origin', branch], { timeout: 120000 });
    push = {
      ok: pushed.ok,
      error: pushed.ok ? null : (pushed.stderr || pushed.stdout)
    };
  }

  return {
    status: pushBranch && !push?.ok ? 'PASS_LOCAL_PUSH_FAILED' : 'CANDIDATE_READY',
    branch,
    worktree,
    repairSha,
    baseSha: packet.project.sha,
    changedPaths: paths,
    validation,
    pushed: Boolean(push?.ok),
    pushError: push?.error || null
  };
}

import { spawnSync } from 'node:child_process';

import { riskyRepairPaths } from './repair-executor.mjs';

const SAFE_REPAIR_BRANCH = /^devcontrol\/repair\/[a-z0-9._-]+$/i;
const SAFE_BASE_BRANCH = /^[A-Za-z0-9._/-]+$/;

function git(cwd, args, { timeout = 120000 } = {}) {
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

function cleanBaseBranch(value) {
  const branch = String(value || '').trim();
  if (!branch || !SAFE_BASE_BRANCH.test(branch)) return null;
  if (branch.startsWith('devcontrol/repair/')) return null;
  return branch;
}

export function assessRepairCandidate({ attempt, packet, project }) {
  const reasons = [];
  if (!attempt || !['CANDIDATE_READY', 'PASS_LOCAL_PUSH_FAILED'].includes(attempt.status)) {
    reasons.push(`repair attempt status ${attempt?.status || 'UNKNOWN'} is not publishable`);
  }
  if (!attempt?.repairSha) reasons.push('repair commit SHA is missing');
  if (!attempt?.worktree) reasons.push('repair worktree path is missing');
  if (!SAFE_REPAIR_BRANCH.test(String(attempt?.branch || ''))) {
    reasons.push('repair branch is outside the DevControl repair namespace');
  }
  if (!packet?.signature || packet.signature !== attempt?.signature) {
    reasons.push('failure packet and repair attempt signatures do not match');
  }
  if (!project?.repo || project.repo !== attempt?.repo) {
    reasons.push('project repository does not match repair attempt repository');
  }
  const paths = attempt?.changedPaths || [];
  if (!paths.length) reasons.push('repair attempt has no changed paths');
  const blockedPaths = riskyRepairPaths(paths);
  if (blockedPaths.length) reasons.push(`repair touches blocked path(s): ${blockedPaths.join(', ')}`);
  const base = cleanBaseBranch(packet?.project?.branch || project?.branch);
  if (!base) reasons.push('safe base branch could not be determined');
  return {
    eligible: reasons.length === 0,
    reasons,
    baseBranch: base,
    branch: attempt?.branch || null,
    repairSha: attempt?.repairSha || null
  };
}

function validationLines(attempt) {
  return (attempt.validation?.steps || []).map(step => {
    const status = step.passed ? 'PASS' : 'FAIL';
    const seconds = Math.round(Number(step.durationMs || 0) / 100) / 10;
    return `- \`${step.command}\` — **${status}** (${seconds}s)`;
  });
}

export function repairPrTitle(attempt) {
  const project = String(attempt?.project || 'project').slice(0, 40);
  const signature = String(attempt?.signature || '').slice(0, 12);
  return `fix: DevControl repair for ${project} (${signature})`;
}

export function repairPrBody({ attempt, packet, plan }) {
  const changed = (attempt.changedPaths || []).map(item => `- \`${item}\``);
  const validation = validationLines(attempt);
  const planSteps = (plan?.steps || []).map((step, index) => `${index + 1}. ${step}`);
  return [
    '## DevControl Repair Candidate',
    '',
    '> Generated from an isolated worktree. This PR is always created as **draft** and is never auto-merged by DevControl.',
    '',
    `- Failure signature: \`${attempt.signature}\``,
    `- Failed SHA: \`${attempt.failureSha || packet?.project?.sha || '-'}\``,
    `- Repair SHA: \`${attempt.repairSha}\``,
    `- Failed command: \`${packet?.failure?.failedCommand || '-'}\``,
    `- Failure categories: ${(packet?.failure?.categories || []).join(', ') || 'unknown'}`,
    '',
    '### Repair plan',
    '',
    plan?.summary || 'No repair summary was recorded.',
    '',
    ...planSteps,
    '',
    '### Changed paths',
    '',
    ...changed,
    '',
    '### Local qualification',
    '',
    ...validation,
    '',
    '### Safety gates',
    '',
    '- Repair was produced in an isolated Git worktree.',
    '- Deployment/release/secret/dependency-manifest paths are blocked by policy.',
    '- The failed qualification and the project safe qualification allowlist passed before commit.',
    '- DevControl does not merge this PR automatically.',
    '',
    '_No unredacted failure logs or credentials are included in this PR body._'
  ].join('\n');
}

export function normalizeGitHubRemote(remote) {
  const value = String(remote || '').trim();
  let match = value.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (match) return `${match[1]}/${match[2].replace(/\.git$/i, '')}`;
  try {
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== 'github.com') return null;
    const parts = url.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '').split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    return `${parts[0]}/${parts[1]}`;
  } catch {
    return null;
  }
}

function repoOwner(repo) {
  const [owner, name, ...rest] = String(repo || '').split('/');
  if (!owner || !name || rest.length) throw new Error(`invalid GitHub repository: ${repo}`);
  return owner;
}

async function githubJson(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'DevControl/0.9',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) {
    const detail = data?.message || text || `HTTP ${response.status}`;
    throw new Error(`GitHub ${response.status}: ${String(detail).slice(0, 600)}`);
  }
  return data;
}

async function existingPullRequest(repo, branch, token) {
  const owner = repoOwner(repo);
  const query = new URLSearchParams({
    state: 'all',
    head: `${owner}:${branch}`,
    per_page: '20'
  });
  const pulls = await githubJson(
    `https://api.github.com/repos/${repo}/pulls?${query}`,
    token
  );
  return Array.isArray(pulls) ? pulls[0] || null : null;
}

export function verifyRepairWorktree(attempt, expectedRepo = null) {
  const head = git(attempt.worktree, ['rev-parse', 'HEAD']);
  if (!head.ok || head.stdout !== attempt.repairSha) {
    return { ok: false, reason: 'repair worktree HEAD does not match recorded repair SHA' };
  }
  const branch = git(attempt.worktree, ['branch', '--show-current']);
  if (!branch.ok || branch.stdout !== attempt.branch) {
    return { ok: false, reason: 'repair worktree branch does not match recorded repair branch' };
  }
  const status = git(attempt.worktree, ['status', '--porcelain=v1']);
  if (!status.ok || status.stdout) {
    return { ok: false, reason: 'repair worktree is not clean after validated repair commit' };
  }
  const origin = git(attempt.worktree, ['remote', 'get-url', 'origin']);
  const originRepo = origin.ok ? normalizeGitHubRemote(origin.stdout) : null;
  if (!originRepo || (expectedRepo && originRepo.toLowerCase() !== expectedRepo.toLowerCase())) {
    return { ok: false, reason: 'repair worktree origin does not match the expected GitHub repository' };
  }
  const ancestor = git(attempt.worktree, [
    'merge-base', '--is-ancestor', attempt.failureSha, attempt.repairSha
  ]);
  if (!ancestor.ok) {
    return { ok: false, reason: 'repair commit is not a descendant of the recorded failed SHA' };
  }
  const count = git(attempt.worktree, [
    'rev-list', '--count', `${attempt.failureSha}..${attempt.repairSha}`
  ]);
  if (!count.ok || count.stdout !== '1') {
    return { ok: false, reason: 'repair candidate must contain exactly one DevControl repair commit' };
  }
  const diff = git(attempt.worktree, [
    'diff', '--name-only', `${attempt.failureSha}..${attempt.repairSha}`, '--'
  ]);
  if (!diff.ok) return { ok: false, reason: 'failed to verify committed repair paths' };
  const committedPaths = diff.stdout.split(/\r?\n/).filter(Boolean).sort();
  const recordedPaths = [...(attempt.changedPaths || [])].sort();
  if (JSON.stringify(committedPaths) !== JSON.stringify(recordedPaths)) {
    return { ok: false, reason: 'committed repair paths do not match the recorded validated path set' };
  }
  const blockedPaths = riskyRepairPaths(committedPaths);
  if (blockedPaths.length) {
    return {
      ok: false,
      reason: `committed repair touches blocked path(s): ${blockedPaths.join(', ')}`
    };
  }
  return { ok: true, originRepo, changedPaths: committedPaths };
}

export async function publishRepairCandidate({
  project,
  attempt,
  packet,
  plan,
  token,
  pushEnabled = false,
  prEnabled = false
}) {
  const eligibility = assessRepairCandidate({ attempt, packet, project });
  if (!eligibility.eligible) {
    return { status: 'BLOCKED', reasons: eligibility.reasons };
  }
  if (!pushEnabled && !attempt.pushed) {
    return { status: 'LOCAL_ONLY', reason: 'repair branch push is disabled' };
  }
  if (prEnabled && !token) {
    return { status: 'BLOCKED', reasons: ['GITHUB_TOKEN is required to create a repair PR'] };
  }

  const verified = verifyRepairWorktree(attempt, project.repo);
  if (!verified.ok) return { status: 'BLOCKED', reasons: [verified.reason] };

  let pushed = Boolean(attempt.pushed);
  if (!pushed && pushEnabled) {
    const push = git(
      attempt.worktree,
      ['push', '-u', 'origin', attempt.branch],
      { timeout: 120000 }
    );
    if (!push.ok) {
      return {
        status: 'PUSH_FAILED',
        branch: attempt.branch,
        repairSha: attempt.repairSha,
        error: push.stderr || push.stdout
      };
    }
    pushed = true;
  }

  if (!prEnabled) {
    return {
      status: 'BRANCH_READY',
      branch: attempt.branch,
      repairSha: attempt.repairSha,
      pushed
    };
  }

  const existing = await existingPullRequest(project.repo, attempt.branch, token);
  if (existing) {
    return {
      status: 'PR_READY',
      branch: attempt.branch,
      repairSha: attempt.repairSha,
      pushed,
      pr: {
        number: existing.number,
        url: existing.html_url,
        draft: Boolean(existing.draft),
        state: existing.state,
        existing: true
      }
    };
  }

  const created = await githubJson(
    `https://api.github.com/repos/${project.repo}/pulls`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        title: repairPrTitle(attempt),
        head: attempt.branch,
        base: eligibility.baseBranch,
        body: repairPrBody({ attempt, packet, plan }),
        draft: true
      })
    }
  );
  return {
    status: 'PR_READY',
    branch: attempt.branch,
    repairSha: attempt.repairSha,
    pushed,
    pr: {
      number: created.number,
      url: created.html_url,
      draft: Boolean(created.draft),
      state: created.state,
      existing: false
    }
  };
}

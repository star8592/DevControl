import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 256 * 1024;

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

async function runFixed(command, args, options = {}) {
  try {
    const { stdout = '', stderr = '' } = await execFileAsync(command, args, {
      cwd: options.cwd,
      timeout: options.timeout || 15000,
      maxBuffer: MAX_OUTPUT,
      windowsHide: true,
      env: options.env || process.env
    });
    return {
      ok: true,
      stdout: String(stdout).slice(0, MAX_OUTPUT),
      stderr: String(stderr).slice(0, 32 * 1024)
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { ok: false, unavailable: true, error: `${command} not found` };
    return {
      ok: false,
      error: String(error.message || error).slice(0, 1000),
      stdout: String(error.stdout || '').slice(0, 64 * 1024),
      stderr: String(error.stderr || '').slice(0, 64 * 1024),
      code: error.code ?? null,
      signal: error.signal ?? null
    };
  }
}

function requireIntegration(registry, key, { allowDisabledProbe = false, action = null } = {}) {
  const integration = registry.byKey[key];
  if (!integration) throw httpError(`Unknown integration: ${key}`, 404);
  if (!integration.enabled && !(allowDisabledProbe && action === 'probe')) throw httpError(`Integration disabled: ${key}`, 403);
  if (action && action !== 'probe' && !integration.capabilities.includes(action)) {
    throw httpError(`Capability not allowed: ${key}.${action}`, 403);
  }
  return integration;
}

function projectConfig(projectRegistry, key) {
  const project = projectRegistry.byKey[key];
  if (!project) throw httpError(`Unknown project: ${key}`, 404);
  return project;
}

async function requireProject(projectRegistry, key) {
  const project = projectConfig(projectRegistry, key);
  if (!project.localPath) throw httpError(`Project has no localPath: ${key}`, 409);
  try {
    await access(project.localPath);
  } catch {
    throw httpError(`Local project path is unavailable: ${project.localPath}`, 409);
  }
  return project;
}

function positiveId(value, field) {
  const text = String(value ?? '');
  if (!/^\d+$/.test(text) || Number(text) <= 0) throw httpError(`${field} must be a positive integer`);
  return text;
}

function cleanPrompt(value) {
  const prompt = String(value || '').trim();
  if (!prompt) throw httpError('prompt is required');
  if (prompt.length > 8000) throw httpError('prompt exceeds 8000 characters');
  return prompt;
}

function codexInstruction(action, project, userPrompt) {
  const base = [
    'You are running under DevControl supervised read-only mode.',
    'Do not modify files, create commits, push, merge, release, or change external state.',
    'You may inspect the repository and run read-only commands only.',
    `Project: ${project.name} (${project.repo})`,
    `Local path: ${project.localPath}`
  ];
  if (action === 'plan') {
    base.push('Return a concise implementation plan with evidence, risks, acceptance checks, and the safest next action.');
  } else {
    base.push('Review the current repository state and relevant changes. Prioritize concrete defects, regressions, missing tests, and safety-boundary violations. Do not edit anything.');
  }
  base.push(`User request: ${userPrompt}`);
  return base.join('\n');
}

export function createLocalIntegrationBridge({ integrationRegistry, projectRegistry }) {
  async function probe(key) {
    const integration = requireIntegration(integrationRegistry, key, { allowDisabledProbe: true, action: 'probe' });
    if (key === 'codex') return { integration: key, ...(await runFixed('codex', ['--version'], { timeout: 10000 })) };
    if (key === 'git') return { integration: key, ...(await runFixed('git', ['--version'], { timeout: 5000 })) };
    if (key === 'githubCli') return { integration: key, ...(await runFixed('gh', ['--version'], { timeout: 5000 })) };
    if (key === 'editor') {
      const command = integration.command || 'code';
      return { integration: key, ...(await runFixed(command, ['--version'], { timeout: 5000 })) };
    }
    return { integration: key, ok: true, probe: 'registry-only', note: 'No local executable probe is defined for this integration.' };
  }

  async function runGit(action, projectKey) {
    requireIntegration(integrationRegistry, 'git', { action });
    const project = await requireProject(projectRegistry, projectKey);
    const commands = {
      status: ['status', '--short', '--branch'],
      diff: ['diff', '--stat', '--'],
      log: ['log', '-5', '--date=iso-strict', '--pretty=format:%h%x09%ad%x09%s']
    };
    const args = commands[action];
    if (!args) throw httpError(`Unsupported git action: ${action}`);
    return { integration: 'git', action, project: projectKey, ...(await runFixed('git', args, { cwd: project.localPath, timeout: 10000 })) };
  }

  async function runGithubCli(action, request) {
    requireIntegration(integrationRegistry, 'githubCli', { action });
    if (action === 'auth-status') {
      const result = await runFixed('gh', ['api', 'user', '--jq', '.login'], { timeout: 10000 });
      return {
        integration: 'githubCli',
        action,
        ...result,
        stdout: result.ok ? `authenticated as ${result.stdout.trim()}` : result.stdout
      };
    }

    const project = projectConfig(projectRegistry, request?.project);
    if (action === 'repo-view') {
      return {
        integration: 'githubCli', action, project: request.project,
        ...(await runFixed('gh', ['repo', 'view', project.repo, '--json', 'nameWithOwner,url,defaultBranchRef,isPrivate'], { timeout: 15000 }))
      };
    }
    if (action === 'pr-view') {
      const prNumber = positiveId(request?.prNumber, 'prNumber');
      return {
        integration: 'githubCli', action, project: request.project, prNumber: Number(prNumber),
        ...(await runFixed('gh', ['pr', 'view', prNumber, '--repo', project.repo, '--json', 'number,title,state,isDraft,headRefName,baseRefName,url'], { timeout: 15000 }))
      };
    }
    if (action === 'run-view') {
      const runId = positiveId(request?.runId, 'runId');
      return {
        integration: 'githubCli', action, project: request.project, runId: Number(runId),
        ...(await runFixed('gh', ['run', 'view', runId, '--repo', project.repo, '--json', 'status,conclusion,event,headBranch,headSha,name,url'], { timeout: 15000 }))
      };
    }
    throw httpError(`Unsupported GitHub CLI action: ${action}`);
  }

  async function runCodex(action, projectKey, prompt) {
    const integration = requireIntegration(integrationRegistry, 'codex', { action });
    if (!['plan', 'review'].includes(action)) throw httpError(`Codex action is not enabled in read-only phase: ${action}`, 403);
    if (integration.allowProjectPathsOnly === false) throw httpError('Codex integration must enforce project paths in this phase', 409);
    if (integration.allowArbitraryShell !== false) throw httpError('Codex integration policy must keep allowArbitraryShell=false', 409);
    const project = await requireProject(projectRegistry, projectKey);
    const instruction = codexInstruction(action, project, cleanPrompt(prompt));
    const result = await runFixed('codex', ['exec', '--ephemeral', '--sandbox', 'read-only', instruction], {
      cwd: project.localPath,
      timeout: 180000
    });
    return { integration: 'codex', action, project: projectKey, readOnly: true, ...result };
  }

  async function execute(request) {
    const key = String(request?.integration || '');
    const action = String(request?.action || '');
    if (action === 'probe') return probe(key);
    if (key === 'git') return runGit(action, request?.project);
    if (key === 'githubCli') return runGithubCli(action, request);
    if (key === 'codex') return runCodex(action, request?.project, request?.prompt);
    throw httpError(`No runtime adapter for integration: ${key}`, 501);
  }

  return { probe, execute };
}

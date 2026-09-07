import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access } from 'node:fs/promises';

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 256 * 1024;
const MAX_AI_CONTEXT = 24 * 1024;
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

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

function actionInstruction(action) {
  if (action === 'plan') return 'Return a concise implementation plan with evidence, risks, acceptance checks, and the safest next action.';
  if (action === 'review') return 'Review the supplied project state. Prioritize concrete defects, regressions, missing tests, and safety-boundary violations.';
  if (action === 'summarize') return 'Summarize the supplied project context and user request. Separate facts from uncertainty.';
  if (action === 'triage') return 'Triage the supplied project context. Rank blockers and recommend the safest next diagnostic or corrective action.';
  return 'Answer the user request using only the supplied project context. Do not claim access to files or systems not included in the context.';
}

function codexInstruction(action, project, userPrompt) {
  return [
    'You are running under DevControl supervised read-only mode.',
    'Do not modify files, create commits, push, merge, release, or change external state.',
    'You may inspect the repository and run read-only commands only.',
    `Project: ${project.name} (${project.repo})`,
    `Local path: ${project.localPath}`,
    actionInstruction(action),
    `User request: ${userPrompt}`
  ].join('\n');
}

async function boundedProjectContext(project) {
  const base = [
    `Project: ${project.name}`,
    `Repository: ${project.repo}`,
    `Phase: ${project.phase || 'unspecified'}`,
    `Next action: ${project.nextAction || 'unspecified'}`,
    `Safety: ${project.safety || 'unspecified'}`
  ];
  if (!project.localPath) return base.join('\n');

  const [status, log, diff] = await Promise.all([
    runFixed('git', ['status', '--short', '--branch'], { cwd: project.localPath, timeout: 10000 }),
    runFixed('git', ['log', '-5', '--date=iso-strict', '--pretty=format:%h%x09%ad%x09%s'], { cwd: project.localPath, timeout: 10000 }),
    runFixed('git', ['diff', '--stat', '--'], { cwd: project.localPath, timeout: 10000 })
  ]);
  if (status.ok) base.push(`Git status:\n${status.stdout.trim() || '(clean)'}`);
  if (log.ok) base.push(`Recent commits:\n${log.stdout.trim() || '(none)'}`);
  if (diff.ok) base.push(`Working-tree diff stat:\n${diff.stdout.trim() || '(none)'}`);
  return base.join('\n\n').slice(0, MAX_AI_CONTEXT);
}

function providerInstruction(action, project, context) {
  return [
    'You are the DevControl AI Copilot operating in analysis-only mode.',
    'Do not claim you changed files, ran commands, pushed commits, merged PRs, released software, or changed production state.',
    'The context below was generated by DevControl. It contains bounded project metadata and Git summaries, not full source code.',
    actionInstruction(action),
    '',
    context,
    '',
    `Project identity: ${project.name} (${project.repo})`
  ].join('\n');
}

function isLoopbackHost(hostname) {
  return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(String(hostname || '').toLowerCase());
}

function localEndpoint(integration) {
  let url;
  try { url = new URL(integration.endpoint || ''); } catch { throw httpError('Local model endpoint is invalid', 409); }
  if (!['http:', 'https:'].includes(url.protocol) || !isLoopbackHost(url.hostname)) {
    throw httpError('Local model endpoint must use a loopback host', 409);
  }
  return url.toString().replace(/\/$/, '');
}

async function fetchJson(url, options = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!response.ok) {
      const detail = data?.error?.message || data?.error || text || `HTTP ${response.status}`;
      throw httpError(`AI provider ${response.status}: ${String(detail).slice(0, 1000)}`, response.status >= 500 ? 502 : response.status);
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError') throw httpError('AI provider timed out', 504);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function extractChatText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(item => item?.text || item?.content || '').join('').trim();
  return '';
}

function extractResponseText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  const parts = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

export function createLocalIntegrationBridge({ integrationRegistry, projectRegistry }) {
  async function probe(key) {
    const integration = requireIntegration(integrationRegistry, key, { allowDisabledProbe: true, action: 'probe' });
    if (key === 'codex') return { integration: key, ...(await runFixed('codex', ['--version'], { timeout: 10000 })) };
    if (key === 'git') return { integration: key, ...(await runFixed('git', ['--version'], { timeout: 5000 })) };
    if (key === 'githubCli') return { integration: key, ...(await runFixed('gh', ['--version'], { timeout: 5000 })) };
    if (key === 'localModel') {
      const endpoint = localEndpoint(integration);
      try {
        const data = await fetchJson(`${endpoint}/models`, { headers: { Accept: 'application/json' } }, 10000);
        const models = (data?.data || data?.models || []).slice(0, 20).map(item => item?.id || item?.name || String(item)).filter(Boolean);
        return { integration: key, ok: true, endpoint, configuredModel: integration.model || '', models };
      } catch (error) {
        return { integration: key, ok: false, endpoint, error: error.message };
      }
    }
    if (key === 'openai') {
      const keyName = integration.apiKeyEnv || 'OPENAI_API_KEY';
      return {
        integration: key,
        ok: Boolean(process.env[keyName] && integration.model),
        keyConfigured: Boolean(process.env[keyName]),
        modelConfigured: Boolean(integration.model),
        model: integration.model || ''
      };
    }
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
    return { integration: 'codex', action, project: projectKey, readOnly: true, contextPolicy: 'repository-read-only', ...result };
  }

  async function runLocalModel(action, projectKey, prompt) {
    const integration = requireIntegration(integrationRegistry, 'localModel', { action });
    const project = projectConfig(projectRegistry, projectKey);
    const model = String(integration.model || '').trim();
    if (!model) throw httpError('Local model is enabled but no model is configured', 409);
    const endpoint = localEndpoint(integration);
    const context = await boundedProjectContext(project);
    const instructions = providerInstruction(action, project, context);
    const protocol = integration.protocol || 'chat-completions';
    let data;
    if (protocol === 'responses') {
      data = await fetchJson(`${endpoint}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, instructions, input: cleanPrompt(prompt), store: false })
      }, 180000);
    } else {
      data = await fetchJson(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            { role: 'system', content: instructions },
            { role: 'user', content: cleanPrompt(prompt) }
          ]
        })
      }, 180000);
    }
    const text = protocol === 'responses' ? extractResponseText(data) : extractChatText(data);
    if (!text) throw httpError('Local model returned no text', 502);
    return { integration: 'localModel', action, project: projectKey, ok: true, model, protocol, contextPolicy: 'bounded-project-metadata', stdout: text, stderr: '' };
  }

  async function runOpenAI(action, projectKey, prompt) {
    const integration = requireIntegration(integrationRegistry, 'openai', { action });
    const project = projectConfig(projectRegistry, projectKey);
    const model = String(integration.model || '').trim();
    if (!model) throw httpError('OpenAI integration is enabled but no model is configured', 409);
    const keyName = integration.apiKeyEnv || 'OPENAI_API_KEY';
    const apiKey = process.env[keyName];
    if (!apiKey) throw httpError(`${keyName} is required for the OpenAI integration`, 401);
    const context = await boundedProjectContext(project);
    const instructions = providerInstruction(action, project, context);
    const data = await fetchJson(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        instructions,
        input: cleanPrompt(prompt),
        store: false,
        max_output_tokens: Math.max(256, Math.min(6000, Number(integration.maxOutputTokens || 2400)))
      })
    }, 180000);
    const text = extractResponseText(data);
    if (!text) throw httpError('OpenAI returned no text', 502);
    return {
      integration: 'openai', action, project: projectKey, ok: true, model,
      protocol: 'responses', contextPolicy: 'bounded-project-metadata', stdout: text, stderr: '',
      usage: data?.usage ? {
        inputTokens: data.usage.input_tokens ?? null,
        outputTokens: data.usage.output_tokens ?? null,
        totalTokens: data.usage.total_tokens ?? null
      } : null
    };
  }

  async function execute(request) {
    const key = String(request?.integration || '');
    const action = String(request?.action || '');
    if (action === 'probe') return probe(key);
    if (key === 'git') return runGit(action, request?.project);
    if (key === 'githubCli') return runGithubCli(action, request);
    if (key === 'codex') return runCodex(action, request?.project, request?.prompt);
    if (key === 'localModel') return runLocalModel(action, request?.project, request?.prompt);
    if (key === 'openai') return runOpenAI(action, request?.project, request?.prompt);
    throw httpError(`No runtime adapter for integration: ${key}`, 501);
  }

  return { probe, execute };
}

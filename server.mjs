import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadProjectRegistry } from './lib/project-registry.mjs';
import { loadIntegrationRegistry } from './lib/integration-registry.mjs';
import { createAuditLog } from './lib/audit-log.mjs';
import { createLocalIntegrationBridge } from './lib/local-integration-bridge.mjs';
import {
  visualLoopDispatchSpec,
  visualLoopDispatchEndpoint,
  rejectVisualLoopOverrides,
} from './lib/visual-loop/dispatch.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const STATUS_REFRESH_MS = Math.max(5000, Number(process.env.STATUS_REFRESH_MS || 15000));
const registry = await loadProjectRegistry(__dirname);
const integrations = await loadIntegrationRegistry(__dirname);
const audit = createAuditLog();
const bridge = createLocalIntegrationBridge({ integrationRegistry: integrations, projectRegistry: registry });
const PROJECTS = registry.byKey;

if (integrations.security.bindLocalhostOnly && !['127.0.0.1', 'localhost', '::1'].includes(HOST)) {
  throw new Error(`Integration security policy requires localhost binding; HOST=${HOST} is not allowed`);
}

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'DevControl/0.3.2'
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  return headers;
}

async function gh(endpoint, options = {}) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: { ...githubHeaders(), ...(options.headers || {}) }
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`GitHub ${response.status}: ${text.slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }
  if (!text.trim()) return null;
  return JSON.parse(text);
}

function workflowMatch(run, names) {
  const name = String(run?.name || '').toLowerCase();
  return (names || []).some(candidate => name.includes(candidate.toLowerCase()));
}

function eventMatch(run, events) {
  return !events?.length || events.includes(run?.event);
}

function firstMatchingRun(runs, names, events = null) {
  if (!names?.length) return null;
  return runs.find(run => workflowMatch(run, names) && eventMatch(run, events)) || null;
}

function normalizedConclusion(run) {
  if (!run) return 'unknown';
  if (run.status === 'queued') return 'queued';
  if (run.status === 'in_progress') return 'running';
  return run.conclusion || 'unknown';
}

function runSummary(run) {
  if (!run) return null;
  const created = Date.parse(run.created_at || '');
  const updated = Date.parse(run.updated_at || '');
  const now = Date.now();
  return {
    id: run.id,
    name: run.name,
    title: run.display_title,
    branch: run.head_branch,
    sha: run.head_sha,
    status: run.status,
    conclusion: run.conclusion,
    normalized: normalizedConclusion(run),
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    ageMinutes: Number.isFinite(created) ? Math.max(0, Math.round((now - created) / 60000)) : null,
    idleMinutes: Number.isFinite(updated) ? Math.max(0, Math.round((now - updated) / 60000)) : null,
    url: run.html_url,
    event: run.event
  };
}

function dashboardState(status) {
  const value = String(status || '').trim().toUpperCase();
  if (!value) return null;
  if (['RUNNING', 'QUEUED', 'IN_PROGRESS', 'QUALIFYING', 'DEVELOPING'].includes(value)) return 'RUNNING';
  if (['FAILED', 'FAIL', 'BLOCKED', 'ERROR'].includes(value)) return 'BLOCKED';
  if (['PASS', 'PASSED', 'SUCCESS', 'HEALTHY', 'PROMOTED'].includes(value)) return 'PASS';
  return null;
}

function cleanDashboardValue(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^(none|no blocker|n\/a|na|-|无|无阻塞|当前无)$/i.test(text)) return null;
  return text;
}

function parseDashboardComment(body) {
  const fields = {};
  const aliases = {
    STATUS: 'status', PHASE: 'phase', BLOCKER: 'blocker', NEXT: 'nextAction', COST: 'cost', UPDATED: 'updated',
    'BRANCH/PR': 'branchPr', 'WEB CI': 'webCi', 'SELF-HOSTED QUALIFICATION': 'selfHostedQualification',
    'KEY GATES': 'keyGates', 'KEY FINDING': 'keyFinding'
  };
  for (const line of String(body || '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:[-*]\s*)?([A-Z][A-Z0-9 /_-]{1,40}):\s*(.+?)\s*$/);
    if (!match) continue;
    const target = aliases[match[1].trim().replace(/\s+/g, ' ')];
    if (target) fields[target] = match[2].trim();
  }
  if (!fields.status && !fields.phase && !fields.blocker && !fields.nextAction && !fields.cost) return null;
  return fields;
}

async function fetchDashboardStatus(repo, issueNumber) {
  if (!issueNumber) return null;
  try {
    const comments = await gh(`/repos/${repo}/issues/${issueNumber}/comments?per_page=100`);
    for (let index = (comments || []).length - 1; index >= 0; index -= 1) {
      const parsed = parseDashboardComment(comments[index].body);
      if (!parsed) continue;
      return {
        ...parsed,
        blocker: cleanDashboardValue(parsed.blocker),
        commentUrl: comments[index].html_url,
        commentCreatedAt: comments[index].created_at,
        commentUpdatedAt: comments[index].updated_at
      };
    }
    return null;
  } catch (error) {
    if ([403, 404].includes(error.status)) return null;
    throw error;
  }
}

async function fetchRunners(repo) {
  try {
    const data = await gh(`/repos/${repo}/actions/runners?per_page=100`);
    return (data?.runners || []).map(runner => ({
      id: runner.id,
      name: runner.name,
      status: runner.status,
      busy: runner.busy,
      labels: (runner.labels || []).map(label => label.name)
    }));
  } catch (error) {
    if ([403, 404].includes(error.status)) return [];
    throw error;
  }
}

function deriveWarnings(config, localRun, lightRun, runners) {
  const warnings = [];
  const maxRunMinutes = Number(config.maxExpectedRunMinutes || 180);
  for (const [kind, run] of [['local', localRun], ['light', lightRun]]) {
    const summary = runSummary(run);
    if (summary && ['queued', 'in_progress'].includes(run.status) && summary.ageMinutes > maxRunMinutes) {
      warnings.push({ code: 'STALE_RUN', severity: 'high', message: `${kind} workflow has been ${run.status} for ${summary.ageMinutes} minutes` });
    }
  }
  if ((config.localWorkflows || []).length && runners.length > 0 && !runners.some(runner => runner.status === 'online')) {
    warnings.push({ code: 'RUNNER_OFFLINE', severity: 'high', message: 'No visible self-hosted runner is online' });
  }
  return warnings;
}

function overallState(localRun, lightRun, dashboardStatus, warnings) {
  const runs = [localRun, lightRun].filter(Boolean);
  if (warnings.some(warning => warning.severity === 'high')) return 'BLOCKED';
  if (runs.some(run => run.status === 'in_progress' || run.status === 'queued')) return 'RUNNING';
  if (runs.some(run => ['failure', 'timed_out', 'cancelled'].includes(run.conclusion))) return 'BLOCKED';
  if (localRun?.conclusion === 'success' || lightRun?.conclusion === 'success') return 'PASS';
  return dashboardState(dashboardStatus?.status) || 'IDLE';
}

function inferBlocker(localRun, lightRun, warnings) {
  const warning = warnings.find(item => item.severity === 'high');
  if (warning) return warning.message;
  const failed = [localRun, lightRun].find(run => run && ['failure', 'timed_out', 'cancelled'].includes(run.conclusion));
  return failed ? `${failed.name}: ${failed.conclusion}` : null;
}

async function fetchProject(key, config) {
  const repoPath = `/repos/${config.repo}`;
  const issuePromise = config.dashboardIssue ? gh(`${repoPath}/issues/${config.dashboardIssue}`).catch(() => null) : Promise.resolve(null);
  const dashboardPromise = config.dashboardIssue ? fetchDashboardStatus(config.repo, config.dashboardIssue) : Promise.resolve(null);
  const [repo, runsData, issue, pulls, runners, dashboardStatus] = await Promise.all([
    gh(repoPath),
    gh(`${repoPath}/actions/runs?per_page=60`),
    issuePromise,
    gh(`${repoPath}/pulls?state=open&per_page=20`).catch(() => []),
    fetchRunners(config.repo),
    dashboardPromise
  ]);

  const runs = runsData?.workflow_runs || [];
  const localRun = firstMatchingRun(runs, config.localWorkflows, config.localEvents);
  const lightRun = firstMatchingRun(runs, config.lightWorkflows, config.lightEvents);
  const visualLoopRun = firstMatchingRun(runs, config.visualLoop?.workflowNames || []);
  const latestRun = runs[0] || null;
  const warnings = deriveWarnings(config, localRun, lightRun, runners);
  const state = overallState(localRun, lightRun, dashboardStatus, warnings);
  const runBlocker = inferBlocker(localRun, lightRun, warnings);
  const onlineRunners = runners.filter(runner => runner.status === 'online');
  const busyRunners = onlineRunners.filter(runner => runner.busy);

  return {
    key,
    name: config.name,
    repo: config.repo,
    private: repo.private,
    defaultBranch: repo.default_branch,
    localPath: config.localPath || null,
    tags: config.tags || [],
    phase: dashboardStatus?.phase || config.phase || 'Unspecified',
    state,
    blocker: runBlocker || dashboardStatus?.blocker || null,
    nextAction: dashboardStatus?.nextAction || config.nextAction || null,
    cost: dashboardStatus?.cost || null,
    safety: config.safety || null,
    dashboardStatus,
    warnings,
    issue: issue ? { number: issue.number, title: issue.title, state: issue.state, updatedAt: issue.updated_at, url: issue.html_url } : null,
    pullRequests: (pulls || []).map(pr => ({
      number: pr.number, title: pr.title, draft: pr.draft, head: pr.head?.ref, base: pr.base?.ref,
      sha: pr.head?.sha, updatedAt: pr.updated_at, url: pr.html_url
    })),
    latestRun: runSummary(latestRun),
    lightRun: runSummary(lightRun),
    localRun: runSummary(localRun),
    visualLoop: config.visualLoop ? {
      enabled: config.visualLoop.enabled === true,
      workflow: config.visualLoop.workflow || null,
      ref: config.visualLoop.ref || null,
      run: runSummary(visualLoopRun),
    } : null,
    runners,
    runnerSummary: { visible: runners.length, online: onlineRunners.length, busy: busyRunners.length },
    computePath: localRun ? 'self-hosted/local acceptance + GitHub control plane' : 'GitHub control plane; local authority not detected in recent runs',
    fetchedAt: new Date().toISOString()
  };
}

async function portfolioStatus() {
  const entries = Object.entries(PROJECTS);
  const settled = await Promise.allSettled(entries.map(([key, config]) => fetchProject(key, config)));
  const projects = settled.map((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    const [key, config] = entries[index];
    return {
      key, name: config.name, repo: config.repo, localPath: config.localPath || null, tags: config.tags || [],
      phase: config.phase || 'Unspecified', state: 'ERROR', blocker: result.reason?.message || 'Unknown status fetch error',
      nextAction: config.nextAction || null, safety: config.safety || null, warnings: [], fetchedAt: new Date().toISOString()
    };
  });
  const counts = projects.reduce((acc, project) => { acc[project.state] = (acc[project.state] || 0) + 1; return acc; }, {});
  const onlineRunners = projects.reduce((sum, project) => sum + (project.runnerSummary?.online || 0), 0);
  const busyRunners = projects.reduce((sum, project) => sum + (project.runnerSummary?.busy || 0), 0);
  const warningCount = projects.reduce((sum, project) => sum + (project.warnings?.length || 0), 0);

  return {
    generatedAt: new Date().toISOString(),
    version: '0.3.2',
    registry: { file: registry.filePath, projects: entries.length },
    integrationRegistry: { file: integrations.filePath, enabled: integrations.integrations.filter(item => item.enabled).length, total: integrations.integrations.length },
    stream: { enabled: true, refreshMs: STATUS_REFRESH_MS },
    tokenConfigured: Boolean(GITHUB_TOKEN),
    counts,
    warnings: warningCount,
    runners: { online: onlineRunners, busy: busyRunners },
    projects
  };
}

const eventClients = new Set();
let cachedPortfolio = null;
let refreshInFlight = null;

function sendEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcast(event, data) {
  for (const client of eventClients) {
    try { sendEvent(client, event, data); } catch { eventClients.delete(client); }
  }
}

async function refreshPortfolio() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = portfolioStatus()
    .then(status => {
      cachedPortfolio = status;
      broadcast('status', status);
      return status;
    })
    .finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

async function auditControl(record) {
  if (!integrations.security.auditEveryWriteAction) return;
  await audit.append(record);
}

async function controlProject(body) {
  const requestId = randomUUID();
  const projectKey = body?.project;
  const action = body?.action;
  const runId = body?.runId;
  const baseAudit = { requestId, kind: 'control', project: projectKey || null, action: action || null, runId: runId ?? null };

  try {
    if (body && ('command' in body || 'shell' in body || 'argv' in body)) {
      throw Object.assign(new Error('Arbitrary command text is forbidden by policy'), { status: 400 });
    }
    const config = PROJECTS[projectKey];
    if (!config) throw Object.assign(new Error('Unknown project'), { status: 400 });
    if (!GITHUB_TOKEN) throw Object.assign(new Error('GITHUB_TOKEN is required for control actions'), { status: 401 });

    await auditControl({ ...baseAudit, outcome: 'requested' });
    if (action === 'rerun_failed') {
      if (!Number.isInteger(runId) && !/^\d+$/.test(String(runId || ''))) {
        throw Object.assign(new Error('runId is required'), { status: 400 });
      }
      await gh(`/repos/${config.repo}/actions/runs/${runId}/rerun-failed-jobs`, { method: 'POST' });
      const result = { ok: true, requestId, action, project: projectKey, runId: Number(runId) };
      await auditControl({ ...baseAudit, runId: Number(runId), outcome: 'success' });
      refreshPortfolio().catch(error => console.error('post-control refresh failed:', error.message));
      return result;
    }
    if (action === 'visual_loop_qualify') {
      rejectVisualLoopOverrides(body);
      const spec = visualLoopDispatchSpec(config);
      const endpoint = visualLoopDispatchEndpoint(config.repo, spec.workflow);
      await gh(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: spec.ref })
      });
      const result = {
        ok: true,
        requestId,
        action,
        project: projectKey,
        workflow: spec.workflow,
        ref: spec.ref,
      };
      await auditControl({ ...baseAudit, workflow: spec.workflow, ref: spec.ref, outcome: 'success' });
      refreshPortfolio().catch(error => console.error('post-visual-loop refresh failed:', error.message));
      return result;
    }
    throw Object.assign(new Error(`Action not allowed: ${action}`), { status: 400 });
  } catch (error) {
    await auditControl({ ...baseAudit, outcome: 'rejected-or-failed', error: String(error.message || error).slice(0, 300) }).catch(() => {});
    throw error;
  }
}

async function executeIntegration(body) {
  const requestId = randomUUID();
  const integration = String(body?.integration || '');
  const action = String(body?.action || '');
  const project = body?.project ? String(body.project) : null;
  const baseAudit = { requestId, kind: 'integration', integration: integration || null, action: action || null, project };
  try {
    if (body && ('command' in body || 'shell' in body || 'argv' in body)) {
      throw Object.assign(new Error('Arbitrary command text is forbidden by policy'), { status: 400 });
    }
    await audit.append({ ...baseAudit, outcome: 'requested' });
    const result = await bridge.execute(body);
    await audit.append({ ...baseAudit, outcome: result.ok === false ? 'tool-failed' : 'success' });
    return { requestId, ...result };
  } catch (error) {
    await audit.append({ ...baseAudit, outcome: 'rejected-or-failed', error: String(error.message || error).slice(0, 300) }).catch(() => {});
    throw error;
  }
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'text/plain; charset=utf-8';
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function serveStatic(res, pathname) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const publicRoot = path.resolve(__dirname, 'public');
  const filePath = path.resolve(publicRoot, relativePath);
  if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${path.sep}`)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-cache' });
    res.end(content);
  } catch {
    res.writeHead(404); res.end('Not Found');
  }
}

function openEventStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 3000\n\n');
  eventClients.add(res);
  sendEvent(res, 'hello', { service: 'DevControl', version: '0.3.2', refreshMs: STATUS_REFRESH_MS });
  if (cachedPortfolio) sendEvent(res, 'status', cachedPortfolio);
  const heartbeat = setInterval(() => {
    try { res.write(`: heartbeat ${Date.now()}\n\n`); } catch { clearInterval(heartbeat); }
  }, 25000);
  heartbeat.unref?.();
  req.on('close', () => { clearInterval(heartbeat); eventClients.delete(res); });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        service: 'DevControl',
        version: '0.3.2',
        projects: Object.keys(PROJECTS).length,
        integrations: integrations.integrations.length,
        sseClients: eventClients.size
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      const force = url.searchParams.get('refresh') === '1';
      return sendJson(res, 200, force || !cachedPortfolio ? await refreshPortfolio() : cachedPortfolio);
    }
    if (req.method === 'GET' && url.pathname === '/api/events') return openEventStream(req, res);
    if (req.method === 'GET' && url.pathname === '/api/integrations') return sendJson(res, 200, integrations.publicView);
    if (req.method === 'GET' && url.pathname === '/api/audit') return sendJson(res, 200, { records: await audit.recent(url.searchParams.get('limit')) });
    if (req.method === 'GET' && url.pathname === '/api/projects') {
      return sendJson(res, 200, { projects: registry.projects.map(project => ({
        key: project.key,
        name: project.name,
        repo: project.repo,
        localPath: project.localPath || null,
        tags: project.tags || [],
        visualLoop: project.visualLoop ? {
          enabled: project.visualLoop.enabled === true,
          workflow: project.visualLoop.workflow || null,
          ref: project.visualLoop.ref || null,
        } : null,
      })) });
    }
    if (req.method === 'POST' && url.pathname === '/api/integration') return sendJson(res, 200, await executeIntegration(await readBody(req)));
    if (req.method === 'POST' && url.pathname === '/api/control') return sendJson(res, 200, await controlProject(await readBody(req)));
    return serveStatic(res, url.pathname);
  } catch (error) {
    const status = Number(error.status) || 500;
    return sendJson(res, status, { ok: false, error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`DevControl listening on http://${HOST}:${PORT}`);
  console.log(`Project registry: ${registry.filePath}`);
  console.log(`Integration registry: ${integrations.filePath}`);
  console.log(`Projects loaded: ${Object.keys(PROJECTS).length}`);
  console.log(`Integrations loaded: ${integrations.integrations.length}`);
  console.log(`Audit log: ${audit.filePath}`);
  console.log(`GitHub token configured: ${Boolean(GITHUB_TOKEN)}`);
  refreshPortfolio().catch(error => console.error('initial portfolio refresh failed:', error.message));
});

const refreshTimer = setInterval(() => {
  refreshPortfolio().catch(error => console.error('portfolio refresh failed:', error.message));
}, STATUS_REFRESH_MS);
refreshTimer.unref?.();

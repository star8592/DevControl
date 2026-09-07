import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectRegistry } from './lib/project-registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const registry = await loadProjectRegistry(__dirname);
const PROJECTS = registry.byKey;

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'DevControl/0.3'
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
    STATUS: 'status',
    PHASE: 'phase',
    BLOCKER: 'blocker',
    NEXT: 'nextAction',
    COST: 'cost',
    UPDATED: 'updated',
    'BRANCH/PR': 'branchPr',
    'WEB CI': 'webCi',
    'SELF-HOSTED QUALIFICATION': 'selfHostedQualification',
    'KEY GATES': 'keyGates',
    'KEY FINDING': 'keyFinding'
  };

  for (const line of String(body || '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:[-*]\s*)?([A-Z][A-Z0-9 /_-]{1,40}):\s*(.+?)\s*$/);
    if (!match) continue;
    const key = match[1].trim().replace(/\s+/g, ' ');
    const target = aliases[key];
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
      warnings.push({
        code: 'STALE_RUN',
        severity: 'high',
        message: `${kind} workflow has been ${run.status} for ${summary.ageMinutes} minutes`
      });
    }
  }

  if ((config.localWorkflows || []).length && runners.length > 0 && !runners.some(runner => runner.status === 'online')) {
    warnings.push({
      code: 'RUNNER_OFFLINE',
      severity: 'high',
      message: 'No visible self-hosted runner is online'
    });
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
  const issuePromise = config.dashboardIssue
    ? gh(`${repoPath}/issues/${config.dashboardIssue}`).catch(() => null)
    : Promise.resolve(null);
  const dashboardPromise = config.dashboardIssue
    ? fetchDashboardStatus(config.repo, config.dashboardIssue)
    : Promise.resolve(null);

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
    issue: issue ? {
      number: issue.number,
      title: issue.title,
      state: issue.state,
      updatedAt: issue.updated_at,
      url: issue.html_url
    } : null,
    pullRequests: (pulls || []).map(pr => ({
      number: pr.number,
      title: pr.title,
      draft: pr.draft,
      head: pr.head?.ref,
      base: pr.base?.ref,
      sha: pr.head?.sha,
      updatedAt: pr.updated_at,
      url: pr.html_url
    })),
    latestRun: runSummary(latestRun),
    lightRun: runSummary(lightRun),
    localRun: runSummary(localRun),
    runners,
    runnerSummary: {
      visible: runners.length,
      online: onlineRunners.length,
      busy: busyRunners.length
    },
    computePath: localRun
      ? 'self-hosted/local acceptance + GitHub control plane'
      : 'GitHub control plane; local authority not detected in recent runs',
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
      key,
      name: config.name,
      repo: config.repo,
      localPath: config.localPath || null,
      tags: config.tags || [],
      phase: config.phase || 'Unspecified',
      state: 'ERROR',
      blocker: result.reason?.message || 'Unknown status fetch error',
      nextAction: config.nextAction || null,
      safety: config.safety || null,
      warnings: [],
      fetchedAt: new Date().toISOString()
    };
  });

  const counts = projects.reduce((acc, project) => {
    acc[project.state] = (acc[project.state] || 0) + 1;
    return acc;
  }, {});
  const onlineRunners = projects.reduce((sum, project) => sum + (project.runnerSummary?.online || 0), 0);
  const busyRunners = projects.reduce((sum, project) => sum + (project.runnerSummary?.busy || 0), 0);
  const warningCount = projects.reduce((sum, project) => sum + (project.warnings?.length || 0), 0);

  return {
    generatedAt: new Date().toISOString(),
    version: '0.3.0',
    registry: {
      file: registry.filePath,
      projects: entries.length
    },
    tokenConfigured: Boolean(GITHUB_TOKEN),
    counts,
    warnings: warningCount,
    runners: { online: onlineRunners, busy: busyRunners },
    projects
  };
}

async function controlProject(body) {
  const { project: projectKey, action, runId } = body || {};
  const config = PROJECTS[projectKey];
  if (!config) throw Object.assign(new Error('Unknown project'), { status: 400 });
  if (!GITHUB_TOKEN) throw Object.assign(new Error('GITHUB_TOKEN is required for control actions'), { status: 401 });

  if (action === 'rerun_failed') {
    if (!Number.isInteger(runId) && !/^\d+$/.test(String(runId || ''))) {
      throw Object.assign(new Error('runId is required'), { status: 400 });
    }
    await gh(`/repos/${config.repo}/actions/runs/${runId}/rerun-failed-jobs`, { method: 'POST' });
    return { ok: true, action, project: projectKey, runId: Number(runId) };
  }

  throw Object.assign(new Error(`Action not allowed: ${action}`), { status: 400 });
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
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

async function serveStatic(res, pathname) {
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const publicRoot = path.resolve(__dirname, 'public');
  const filePath = path.resolve(publicRoot, relativePath);
  if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${path.sep}`)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': contentType(filePath),
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/api/health') {
      return sendJson(res, 200, {
        ok: true,
        service: 'DevControl',
        version: '0.3.0',
        projects: Object.keys(PROJECTS).length,
        registry: registry.filePath
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      return sendJson(res, 200, await portfolioStatus());
    }
    if (req.method === 'GET' && url.pathname === '/api/projects') {
      return sendJson(res, 200, {
        projects: registry.projects.map(project => ({
          key: project.key,
          name: project.name,
          repo: project.repo,
          localPath: project.localPath || null,
          tags: project.tags || []
        }))
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/control') {
      return sendJson(res, 200, await controlProject(await readBody(req)));
    }
    return serveStatic(res, url.pathname);
  } catch (error) {
    const status = Number(error.status) || 500;
    return sendJson(res, status, { ok: false, error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`DevControl listening on http://${HOST}:${PORT}`);
  console.log(`Project registry: ${registry.filePath}`);
  console.log(`Projects loaded: ${Object.keys(PROJECTS).length}`);
  console.log(`GitHub token configured: ${Boolean(GITHUB_TOKEN)}`);
});

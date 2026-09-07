import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const OWNER = process.env.DEVCONTROL_OWNER || 'star8592';

const PROJECTS = {
  daolife: {
    name: 'DaoLife',
    repo: `${OWNER}/DaoLife`,
    dashboardIssue: 4,
    phase: 'V0.3 Relationship Phase 2',
    nextAction: 'Friend/Rival causal relationship slice',
    lightWorkflows: ['DaoLife Light CI'],
    localWorkflows: ['DaoLife Local Lab'],
    safety: 'No secret exposure; heavy experiments only on self-hosted runner.'
  },
  bisre: {
    name: 'BISRE',
    repo: `${OWNER}/bisre`,
    dashboardIssue: 26,
    phase: 'Production Shadow',
    nextAction: 'Continue read-only shadow; stop before Micro-Live',
    lightWorkflows: ['Local PR Gate'],
    localWorkflows: ['Main Production Shadow'],
    safety: 'Never alter frozen data or enable real-capital trading.'
  },
  crossalpha: {
    name: 'CrossAlpha',
    repo: `${OWNER}/CrossAlpha`,
    dashboardIssue: 6,
    phase: 'Rust migration gate',
    nextAction: 'Resolve exact-head Rust gate; never auto-merge PR #1',
    lightWorkflows: ['Rust CI', 'CI'],
    localWorkflows: ['Local', 'self-hosted'],
    safety: 'Never run Python and Rust production writers concurrently.'
  },
  tidebound: {
    name: 'Tidebound',
    repo: `${OWNER}/tidebound`,
    dashboardIssue: 2,
    phase: 'Steam Edition qualification',
    nextAction: 'Keep PR #1 draft until real Steam acceptance gates pass',
    lightWorkflows: ['Web CI'],
    localWorkflows: ['Local Release Qualification'],
    safety: 'Never publish to Steam or perform irreversible release actions.'
  }
};

function githubHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'DevControl/0.1'
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  return headers;
}

async function gh(endpoint, options = {}) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      ...githubHeaders(),
      ...(options.headers || {})
    }
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
  return names.some(candidate => name.includes(candidate.toLowerCase()));
}

function firstMatchingRun(runs, names) {
  return runs.find(run => workflowMatch(run, names)) || null;
}

function normalizedConclusion(run) {
  if (!run) return 'unknown';
  if (run.status === 'queued') return 'queued';
  if (run.status === 'in_progress') return 'running';
  return run.conclusion || 'unknown';
}

function runSummary(run) {
  if (!run) return null;
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
    url: run.html_url,
    event: run.event
  };
}

function overallState(localRun, lightRun, latestRun) {
  const runs = [localRun, lightRun, latestRun].filter(Boolean);
  if (runs.some(run => run.status === 'in_progress' || run.status === 'queued')) return 'RUNNING';
  if (runs.some(run => ['failure', 'timed_out', 'cancelled', 'action_required'].includes(run.conclusion))) return 'BLOCKED';
  if (localRun?.conclusion === 'success' || lightRun?.conclusion === 'success') return 'PASS';
  return 'IDLE';
}

function inferBlocker(localRun, lightRun) {
  const failed = [localRun, lightRun].find(run => run && ['failure', 'timed_out', 'cancelled', 'action_required'].includes(run.conclusion));
  if (!failed) return null;
  return `${failed.name}: ${failed.conclusion}`;
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

async function fetchProject(key, config) {
  const repoPath = `/repos/${config.repo}`;
  const [repo, runsData, issue, pulls, runners] = await Promise.all([
    gh(repoPath),
    gh(`${repoPath}/actions/runs?per_page=40`),
    gh(`${repoPath}/issues/${config.dashboardIssue}`).catch(() => null),
    gh(`${repoPath}/pulls?state=open&per_page=20`).catch(() => []),
    fetchRunners(config.repo)
  ]);

  const runs = runsData?.workflow_runs || [];
  const localRun = firstMatchingRun(runs, config.localWorkflows);
  const lightRun = firstMatchingRun(runs, config.lightWorkflows);
  const latestRun = runs[0] || null;
  const state = overallState(localRun, lightRun, latestRun);
  const blocker = inferBlocker(localRun, lightRun);
  const onlineRunners = runners.filter(runner => runner.status === 'online');
  const busyRunners = onlineRunners.filter(runner => runner.busy);

  return {
    key,
    name: config.name,
    repo: config.repo,
    private: repo.private,
    defaultBranch: repo.default_branch,
    phase: config.phase,
    state,
    blocker,
    nextAction: config.nextAction,
    safety: config.safety,
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
      key,
      name: config.name,
      repo: config.repo,
      phase: config.phase,
      state: 'ERROR',
      blocker: result.reason?.message || 'Unknown status fetch error',
      nextAction: config.nextAction,
      safety: config.safety,
      fetchedAt: new Date().toISOString()
    };
  });

  const counts = projects.reduce((acc, project) => {
    acc[project.state] = (acc[project.state] || 0) + 1;
    return acc;
  }, {});
  const onlineRunners = projects.reduce((sum, project) => sum + (project.runnerSummary?.online || 0), 0);
  const busyRunners = projects.reduce((sum, project) => sum + (project.runnerSummary?.busy || 0), 0);

  return {
    generatedAt: new Date().toISOString(),
    owner: OWNER,
    tokenConfigured: Boolean(GITHUB_TOKEN),
    counts,
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

  throw Object.assign(new Error(`Action not allowed in MVP: ${action}`), { status: 400 });
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
      return sendJson(res, 200, { ok: true, service: 'DevControl', version: '0.1.0' });
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      return sendJson(res, 200, await portfolioStatus());
    }
    if (req.method === 'POST' && url.pathname === '/api/control') {
      const result = await controlProject(await readBody(req));
      return sendJson(res, 200, result);
    }
    return serveStatic(res, url.pathname);
  } catch (error) {
    const status = Number(error.status) || 500;
    return sendJson(res, status, { ok: false, error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`DevControl listening on http://${HOST}:${PORT}`);
  console.log(`GitHub owner: ${OWNER}`);
  console.log(`GitHub token configured: ${Boolean(GITHUB_TOKEN)}`);
});
